/**
 * @file securityAlertService.js
 * @description Security monitoring & alerting (ISO 27001 A.8.16 Monitoring, A.5.25 Incident assessment,
 * A.8.5 Secure authentication; GDPR Art. 32 & 33 – detect breaches early).
 *
 * Sign-in risk engine (evaluateLogin):
 *   new_country · new_city · new_device · impossible_travel · multiple_countries (in 2h)
 *   high_risk_country · off_hours_privileged_login · automation_user_agent
 * Account protection: failed-attempt lockout, credential-stuffing detection per IP.
 * Rule engine on every audit event: privilege changes, mass export, mass deletion,
 *   access-denied bursts, audit integrity failures, audit write failures.
 * Users get "This was me / This wasn't me" e-mails; "not me" revokes sessions and locks the account.
 */

'use strict';

const crypto = require('crypto');
const mongoose = require('mongoose');
const SecurityAlert = require('../models/SecurityAlert');
const UserLoginProfile = require('../models/UserLoginProfile');
const AuditLog = require('../models/AuditLog');
const auditService = require('./auditService');
const geoIp = require('./geoIpService');
const cfg = require('../config/auditConfig');
const { redact } = require('../utils/redact');
const { pseudonymousId } = require('../utils/auditIntegrity');
const { SEVERITY_RANK, maxSeverity, bumpSeverity } = require('../utils/auditTaxonomy');
const {
  actorFromUser, systemActor, displayName, maskEmail, roleGroupOf, networkFromRequest,
} = require('../utils/auditActor');
const { getClientIp } = require('../utils/clientIp');

let emailService = null;
try {
  // eslint-disable-next-line global-require
  emailService = require('../utils/emailService');
} catch (_) {
  emailService = null;
}
let logger;
try {
  // eslint-disable-next-line global-require
  logger = require('../utils/logger');
} catch (_) {
  logger = console;
}

const A = cfg.alerts;
const HOUR = 3600000;
const MONITOR = systemActor('security-monitor');
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const atLeast = (sev, min) => SEVERITY_RANK[sev] >= SEVERITY_RANK[min];
const UserModel = () => mongoose.models.User;
const SessionModel = () => mongoose.models.Session;

const LOGIN_REASON_META = {
  impossible_travel: { severity: 'critical', score: 60, label: 'Impossible travel between sign-ins' },
  new_country: { severity: 'high', score: 40, label: 'Sign-in from a new country' },
  multiple_countries: { severity: 'high', score: 25, label: 'Sign-ins from different countries within 2 hours' },
  high_risk_country: { severity: 'high', score: 30, label: 'Sign-in from a high-risk country' },
  new_device: { severity: 'medium', score: 20, label: 'Sign-in from a new device or browser' },
  automation_user_agent: { severity: 'medium', score: 15, label: 'Sign-in from an automated client' },
  new_city: { severity: 'low', score: 15, label: 'Sign-in from a new city' },
  off_hours_privileged_login: { severity: 'low', score: 10, label: 'Administrator sign-in outside business hours' },
};
const LOGIN_REASON_ORDER = Object.keys(LOGIN_REASON_META);

function partsInTz(date, tz) {
  try {
    const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false, weekday: 'short' });
    const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
    return { hour: Number(p.hour) % 24, weekday: p.weekday };
  } catch (_) {
    return { hour: date.getUTCHours(), weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getUTCDay()] };
  }
}

function isTrusted(entry, now) {
  if (!entry) return false;
  if (entry.trusted) return true;
  return entry.count >= A.trustAfterLogins && now - new Date(entry.firstSeen).getTime() >= A.trustAfterHours * HOUR;
}

async function getProfile(userId) {
  for (let i = 0; i < 2; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await UserLoginProfile.findOneAndUpdate({ user: userId }, { $setOnInsert: { user: userId } }, { new: true, upsert: true });
    } catch (e) {
      if (e.code !== 11000 || i === 1) throw e;
    }
  }
  return null;
}

// ============================================================ NOTIFICATIONS
function emailShell(title, bodyHtml, accent = '#964FFE') {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
<div style="max-width:600px;margin:24px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 4px 14px rgba(0,0,0,.08)">
<div style="background:${accent};color:#fff;padding:20px 24px"><h1 style="margin:0;font-size:20px">${esc(title)}</h1></div>
<div style="padding:24px;line-height:1.6;font-size:15px">${bodyHtml}</div>
<div style="padding:14px 24px;background:#fafafa;font-size:12px;color:#6b7280;text-align:center">
This is an automated security notice from ${esc(cfg.appName)}. We will never ask for your password by e-mail.<br>&copy; ${new Date().getFullYear()} Global SJX Limited</div>
</div></body></html>`;
}

function evidenceRows(ev = {}) {
  const rows = [
    ['When', ev.when ? new Date(ev.when).toUTCString() : new Date().toUTCString()],
    ['Location', ev.location],
    ['IP address', ev.ip],
    ['Device', ev.device],
    ['Previous sign-in', ev.previousLocation ? `${ev.previousLocation}${ev.hoursSincePrevious != null ? ` (${ev.hoursSincePrevious} h earlier, ${ev.distanceKm} km away)` : ''}` : undefined],
  ].filter(([, v]) => v);
  return `<table style="width:100%;border-collapse:collapse;margin:12px 0">${rows.map(([k, v]) => `<tr><td style="padding:6px 8px;color:#6b7280;width:150px;border-bottom:1px solid #eee">${esc(k)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee"><strong>${esc(v)}</strong></td></tr>`).join('')}</table>`;
}

function userAlertEmail(alert, user, token) {
  const base = cfg.frontendUrl || '';
  const link = (answer) => `${base}/security/alert-response?token=${encodeURIComponent(token)}&answer=${answer}`;
  const buttons = token ? `<div style="margin:22px 0;text-align:center">
<a href="${link('me')}" style="display:inline-block;margin:6px;padding:12px 22px;background:#16a34a;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">Yes, this was me</a>
<a href="${link('not_me')}" style="display:inline-block;margin:6px;padding:12px 22px;background:#dc2626;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">No, secure my account</a></div>
<p style="font-size:13px;color:#6b7280">If it wasn't you, choosing "No" will immediately sign out every session and lock the account until an administrator helps you reset your password.</p>` : '';
  const body = `<p>Hello ${esc(displayName(user))},</p>
<p>${esc(alert.summary || alert.title)}</p>${evidenceRows(alert.evidence)}${buttons}
<p>You can review all sign-ins and activity on your account under <strong>Security &amp; Activity</strong> in ${esc(cfg.appName)}.</p>`;
  return emailShell(alert.title, body, atLeast(alert.severity, 'high') ? '#b91c1c' : '#964FFE');
}

function adminAlertEmail(alert) {
  const who = alert.userSnapshot && alert.userSnapshot.name ? `${alert.userSnapshot.name} (${alert.userSnapshot.email || 'no e-mail'}, ${alert.userSnapshot.role || 'user'})` : 'N/A';
  const body = `<p><strong>Severity:</strong> ${esc(alert.severity.toUpperCase())} &nbsp; <strong>Type:</strong> ${esc(alert.type)}</p>
<p><strong>Account:</strong> ${esc(who)}</p><p>${esc(alert.summary || '')}</p>${evidenceRows(alert.evidence)}
${alert.reasons && alert.reasons.length ? `<p><strong>Signals:</strong> ${esc(alert.reasons.join(', '))}</p>` : ''}
${cfg.frontendUrl ? `<p><a href="${cfg.frontendUrl}/audit?tab=alerts&alert=${alert._id}" style="color:#964FFE">Open in the Audit Centre</a></p>` : ''}`;
  return emailShell(`[${alert.severity.toUpperCase()}] ${alert.title}`, body, '#111827');
}

async function sendMail(to, subject, html) {
  if (!emailService || typeof emailService.sendEmail !== 'function') throw new Error('emailService not available');
  return emailService.sendEmail(to, subject, html);
}

async function postWebhook(alert) {
  if (!A.webhookUrl || typeof fetch !== 'function') return;
  const text = `:rotating_light: *[${alert.severity.toUpperCase()}] ${alert.title}*\n${alert.summary || ''}${alert.evidence && alert.evidence.ip ? `\nIP: ${alert.evidence.ip} · ${alert.evidence.location || ''}` : ''}`;
  const res = await fetch(A.webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, alert: { id: String(alert._id), type: alert.type, severity: alert.severity } }) });
  if (!res.ok) throw new Error(`webhook HTTP ${res.status}`);
}

async function notify(alert, { user, token, notifyUser, notifyAdmins }) {
  const log = [];
  const push = (channel, to, ok, error) => log.push({ channel, to, ok, error, at: new Date() });

  if (notifyUser && user && user.email) {
    const optedOut = user.securityPreferences && user.securityPreferences.loginNotifications === false;
    if (!optedOut || atLeast(alert.severity, 'high')) {
      try {
        await sendMail(user.email, `Security alert: ${alert.title}`, userAlertEmail(alert, user, token));
        push('email', maskEmail(user.email), true);
      } catch (e) {
        push('email', maskEmail(user.email), false, e.message);
      }
    }
  }

  if (notifyAdmins) {
    let recipients = [...A.adminEmails];
    try {
      const User = UserModel();
      if (User) {
        const admins = await User.find({ role: { $in: cfg.ROLE_GROUPS.admin }, deleted: { $ne: true }, _id: { $ne: user && user._id } }).select('email').lean();
        recipients = [...new Set([...recipients, ...admins.map((a) => a.email).filter(Boolean)])];
      }
    } catch (e) {
      logger.error('[security] admin lookup failed', e.message);
    }
    const html = adminAlertEmail(alert);
    await Promise.all(recipients.map(async (to) => {
      try {
        await sendMail(to, `[${alert.severity.toUpperCase()}] ${alert.title}`, html);
        push('email', maskEmail(to), true);
      } catch (e) {
        push('email', maskEmail(to), false, e.message);
      }
    }));
    try {
      await postWebhook(alert);
      if (A.webhookUrl) push('webhook', 'configured', true);
    } catch (e) {
      push('webhook', 'configured', false, e.message);
    }
  }

  if (log.length) await SecurityAlert.updateOne({ _id: alert._id }, { $push: { notifications: { $each: log } } });
}

// ============================================================ ALERTS
/**
 * Raise (or de-duplicate) a security alert.
 * dedupeKey + dedupeWindowMinutes collapse repeats into one alert with an occurrence counter.
 */
async function raiseAlert({
  type, severity, user = null, title, summary, evidence, reasons, riskScore, dedupeKey,
  dedupeWindowMinutes = 60, notifyUser, notifyAdmins, allowUserResponse = false, auditEventIds = [],
}) {
  const now = new Date();
  const bucket = Math.floor(now.getTime() / (dedupeWindowMinutes * 60000));
  const key = dedupeKey ? `${dedupeKey}:${bucket}` : undefined;

  if (key) {
    const existing = await SecurityAlert.findOneAndUpdate(
      { dedupeKey: key },
      { $inc: { occurrences: 1 }, $set: { lastOccurredAt: now }, $addToSet: { auditEventIds: { $each: auditEventIds } } },
      { new: true },
    );
    if (existing) return { alert: existing, created: false };
  }

  let token = null;
  const actor = user ? actorFromUser(user) : null;
  const doc = {
    type,
    severity,
    title,
    summary,
    user: user ? user._id : null,
    userSnapshot: actor ? { name: actor.name, email: actor.email, role: actor.role, roleGroup: actor.roleGroup } : undefined,
    companyId: actor && actor.companyId ? actor.companyId : null,
    riskScore,
    reasons,
    evidence: evidence ? redact(evidence) : undefined,
    auditEventIds,
    dedupeKey: key,
    firstOccurredAt: now,
    lastOccurredAt: now,
    allowUserResponse: !!(allowUserResponse && user),
    history: [{ at: now, by: { name: 'security-monitor', role: 'system' }, action: 'raised', toStatus: 'open' }],
  };
  if (doc.allowUserResponse) {
    token = crypto.randomBytes(32).toString('base64url');
    doc.responseTokenHash = sha256(token);
    doc.responseTokenExpires = new Date(now.getTime() + A.responseTokenTtlHours * HOUR);
  }

  let alert;
  try {
    alert = await SecurityAlert.create(doc);
  } catch (e) {
    if (e.code === 11000 && key) return { alert: await SecurityAlert.findOne({ dedupeKey: key }), created: false };
    throw e;
  }

  await auditService.record({
    action: 'security.alert_raised',
    category: 'security',
    severity,
    module: 'Security Monitoring',
    actor: MONITOR,
    source: 'system',
    markHandled: false,
    description: `${title}${actor ? ` – ${actor.name}` : ''}`,
    target: { type: 'SecurityAlert', id: String(alert._id), label: type, ownerUserId: user ? user._id : undefined },
    metadata: { alertType: type, riskScore, reasons, subjectUserId: user ? String(user._id) : undefined, relatedEvents: auditEventIds },
  });

  const wantUser = notifyUser !== undefined ? notifyUser : atLeast(severity, A.notifyUserMinSeverity);
  const wantAdmins = notifyAdmins !== undefined ? notifyAdmins : atLeast(severity, A.notifyAdminsMinSeverity);
  if (wantUser || wantAdmins) {
    setImmediate(() => notify(alert, { user, token, notifyUser: wantUser, notifyAdmins: wantAdmins }).catch((e) => logger.error('[security] notify failed', e.message)));
  }
  return { alert, created: true, token };
}

// ============================================================ ACCOUNT LOCKOUT
async function checkLock(userId) {
  const p = await UserLoginProfile.findOne({ user: userId }).select('lockUntil lockReason').lean();
  if (p && p.lockUntil && new Date(p.lockUntil) > new Date()) return { locked: true, lockUntil: p.lockUntil, reason: p.lockReason };
  return { locked: false };
}

async function recordFailedLogin({ user = null, identifier, req }) {
  const now = new Date();
  const windowStart = new Date(now.getTime() - A.failedLoginWindowMin * 60000);
  const network = networkFromRequest(req);
  const geo = geoIp.lookup(network.ip);
  const result = { locked: false, attemptsRemaining: null };

  if (user) {
    await UserLoginProfile.updateOne(
      { user: user._id, $or: [{ failedWindowStart: null }, { failedWindowStart: { $lt: windowStart } }] },
      { $set: { failedCount: 0, failedWindowStart: now } },
    );
    const p = await UserLoginProfile.findOneAndUpdate(
      { user: user._id },
      { $inc: { failedCount: 1 }, $set: { lastFailedAt: now, lastFailedIp: network.ip }, $setOnInsert: { failedWindowStart: now } },
      { new: true, upsert: true },
    );
    result.attemptsRemaining = Math.max(0, A.failedLoginThreshold - p.failedCount);
    if (p.failedCount >= A.failedLoginThreshold) {
      const lockUntil = new Date(now.getTime() + A.lockoutMinutes * 60000);
      await UserLoginProfile.updateOne({ _id: p._id }, { $set: { lockUntil, lockReason: 'too_many_failed_attempts' } });
      result.locked = true;
      result.lockUntil = lockUntil;
      const privileged = roleGroupOf(user.role) === 'admin';
      await raiseAlert({
        type: 'brute_force',
        severity: privileged ? 'high' : 'medium',
        user,
        title: 'Account locked after repeated failed sign-ins',
        summary: `${p.failedCount} failed sign-in attempts in ${A.failedLoginWindowMin} minutes. The account is locked for ${A.lockoutMinutes} minutes.`,
        evidence: { ip: network.ip, location: geoIp.describe(geo), device: `${network.browser} on ${network.os}`, attempts: p.failedCount, when: now },
        dedupeKey: `bf:${user._id}`,
        notifyUser: true,
        notifyAdmins: true,
      });
      await auditService.record({
        action: 'security.account_locked', category: 'security', severity: 'high', outcome: 'success', module: 'Authentication',
        actor: MONITOR, source: 'system', markHandled: false,
        description: `Account ${maskEmail(user.email)} locked for ${A.lockoutMinutes} min after ${p.failedCount} failed attempts`,
        target: { type: 'User', id: String(user._id), label: user.email },
      });
    }
  }

  // Credential stuffing / password spraying: many different accounts failing from one IP
  if (network.ip && network.ip !== 'unknown') {
    const distinct = await AuditLog.distinct('metadata.identifierHash', {
      'network.ip': network.ip, action: 'auth.login_failed', timestamp: { $gte: windowStart },
    });
    if (distinct.length >= A.stuffingDistinctAccounts) {
      await raiseAlert({
        type: 'credential_stuffing',
        severity: 'high',
        title: `Possible credential stuffing from ${network.ip}`,
        summary: `${distinct.length} different accounts failed to sign in from the same IP within ${A.failedLoginWindowMin} minutes. Consider blocking this IP at the firewall/WAF.`,
        evidence: { ip: network.ip, location: geoIp.describe(geo), device: `${network.browser} on ${network.os}`, distinctAccounts: distinct.length, when: now },
        dedupeKey: `cs:${network.ip}`,
        notifyAdmins: true,
        notifyUser: false,
      });
    }
  }
  return result;
}

async function resetFailedLogins(userId) {
  await UserLoginProfile.updateOne({ user: userId }, { $set: { failedCount: 0, failedWindowStart: null } });
}

// ============================================================ SIGN-IN RISK ENGINE
function upsertLocation(profile, geo, now, trusted) {
  if (!geoIp.isLocatable(geo)) return;
  const loc = profile.knownLocations.find((l) => l.countryCode === geo.countryCode && (l.city || '') === (geo.city || ''));
  if (loc) {
    loc.count += 1;
    loc.lastSeen = now;
    if (trusted) loc.trusted = true;
  } else {
    profile.knownLocations.push({ countryCode: geo.countryCode, country: geo.country, region: geo.region, city: geo.city, firstSeen: now, lastSeen: now, count: 1, trusted: !!trusted });
    if (profile.knownLocations.length > 50) profile.knownLocations.sort((a, b) => b.lastSeen - a.lastSeen).splice(50);
  }
}

function upsertDevice(profile, network, now, trusted) {
  const dev = profile.knownDevices.find((d) => d.fingerprint === network.deviceFingerprint);
  if (dev) {
    dev.count += 1;
    dev.lastSeen = now;
    dev.lastIp = network.ip;
    dev.browser = network.browser;
    dev.os = network.os;
    if (trusted) dev.trusted = true;
  } else {
    profile.knownDevices.push({ fingerprint: network.deviceFingerprint, browser: network.browser, os: network.os, device: network.device, firstSeen: now, lastSeen: now, lastIp: network.ip, count: 1, trusted: !!trusted });
    if (profile.knownDevices.length > 30) profile.knownDevices.sort((a, b) => b.lastSeen - a.lastSeen).splice(30);
  }
}

/**
 * Assess a successful password check BEFORE issuing tokens.
 * @returns {{riskScore, reasons, severity, alert, blocked, isFirstLogin, network, geo}}
 */
async function evaluateLogin({ user, req, now = new Date() }) {
  const network = networkFromRequest(req);
  const geo = geoIp.lookup(network.ip);
  const profile = await getProfile(user._id);
  const nowMs = now.getTime();
  const isFirstLogin = !profile.loginCount;
  const locatable = geoIp.isLocatable(geo);
  const reasons = [];
  const evidence = {
    when: now, ip: network.ip, location: geoIp.describe(geo), countryCode: geo.countryCode,
    device: `${network.browser} on ${network.os} (${network.device})`, deviceFingerprint: network.deviceFingerprint,
  };

  if (!isFirstLogin && locatable) {
    const inCountry = profile.knownLocations.filter((l) => l.countryCode === geo.countryCode);
    if (!inCountry.some((l) => isTrusted(l, nowMs))) reasons.push('new_country');
    else if (geo.city && !inCountry.some((l) => l.city === geo.city && isTrusted(l, nowMs)) && !inCountry.some((l) => l.city === geo.city)) reasons.push('new_city');

    const last = profile.lastLogin;
    if (last && last.at && Number.isFinite(last.lat) && Number.isFinite(geo.lat) && last.countryCode && last.countryCode !== 'ZZ') {
      const km = geoIp.haversineKm({ lat: last.lat, lon: last.lon }, { lat: geo.lat, lon: geo.lon });
      const hours = Math.max((nowMs - new Date(last.at).getTime()) / HOUR, 1 / 60);
      const kmh = km / hours;
      evidence.previousLocation = [last.city, last.country].filter(Boolean).join(', ') || last.countryCode;
      evidence.previousIp = last.ip;
      evidence.distanceKm = Math.round(km);
      evidence.hoursSincePrevious = Number(hours.toFixed(2));
      evidence.speedKmh = Math.round(kmh);
      if (km >= A.minTravelKm && kmh > A.impossibleTravelKmh) reasons.push('impossible_travel');
    }
    if (!reasons.includes('impossible_travel')) {
      const other = (profile.recentLogins || []).find((r) => r.countryCode && r.countryCode !== 'ZZ'
        && r.countryCode !== geo.countryCode && nowMs - new Date(r.at).getTime() < 2 * HOUR);
      if (other) {
        reasons.push('multiple_countries');
        evidence.otherRecentCountry = other.country || other.countryCode;
      }
    }
  }
  if (locatable && A.highRiskCountries.includes(geo.countryCode)) reasons.push('high_risk_country');
  if (!isFirstLogin && !profile.knownDevices.some((d) => d.fingerprint === network.deviceFingerprint)) reasons.push('new_device');
  if (network.isBot) reasons.push('automation_user_agent');

  const privileged = roleGroupOf(user.role) === 'admin';
  if (privileged && A.businessHours.enabled) {
    const { hour, weekday } = partsInTz(now, A.businessHours.timezone);
    const weekend = A.businessHours.weekendsAreOffHours && (weekday === 'Sat' || weekday === 'Sun');
    if (weekend || hour < A.businessHours.start || hour >= A.businessHours.end) reasons.push('off_hours_privileged_login');
  }

  reasons.sort((a, b) => LOGIN_REASON_ORDER.indexOf(a) - LOGIN_REASON_ORDER.indexOf(b));
  const riskScore = Math.min(100, reasons.reduce((s, r) => s + LOGIN_REASON_META[r].score, 0));
  let severity = reasons.length ? maxSeverity(...reasons.map((r) => LOGIN_REASON_META[r].severity)) : 'info';
  if (privileged && reasons.length && severity !== 'critical' && severity !== 'info') severity = bumpSeverity(severity);

  const blocked = (A.blockImpossibleTravel && reasons.includes('impossible_travel'))
    || (A.blockHighRiskCountries && reasons.includes('high_risk_country'));

  // Update the baseline (not for blocked attempts – an attacker must not create their own baseline)
  if (!blocked) {
    upsertLocation(profile, geo, now, isFirstLogin);
    upsertDevice(profile, network, now, isFirstLogin);
    const point = {
      at: now, ip: network.ip, countryCode: geo.countryCode, country: geo.country, city: geo.city, lat: geo.lat, lon: geo.lon,
      deviceFingerprint: network.deviceFingerprint, browser: network.browser, os: network.os, riskScore,
    };
    profile.lastLogin = point;
    profile.recentLogins = [point, ...(profile.recentLogins || [])].slice(0, 20);
    profile.loginCount += 1;
    await profile.save();
  }

  let alert = null;
  if (reasons.length) {
    const primary = reasons[0];
    const label = LOGIN_REASON_META[primary].label;
    const summary = primary === 'impossible_travel'
      ? `Your account signed in from ${evidence.location} only ${evidence.hoursSincePrevious} hours after a sign-in from ${evidence.previousLocation} (${evidence.distanceKm} km away). Travelling that fast is not possible.`
      : `A sign-in to your account was detected from ${evidence.location} using ${network.browser} on ${network.os}.`;
    const res = await raiseAlert({
      type: primary,
      severity,
      user,
      title: blocked ? `${label} – sign-in blocked` : label,
      summary,
      evidence,
      reasons,
      riskScore,
      dedupeKey: `login:${user._id}:${primary}:${geo.countryCode}:${network.deviceFingerprint}`,
      dedupeWindowMinutes: 24 * 60,
      allowUserResponse: atLeast(severity, 'medium'),
    });
    alert = res.alert;
  }

  return { riskScore, reasons, severity, alert, blocked, isFirstLogin, network, geo };
}

// ============================================================ RULE ENGINE (every audit event)
async function countDistinctRequests(filter) {
  const ids = await AuditLog.distinct('request.requestId', filter);
  return ids.filter(Boolean).length;
}

async function runRules(ev) {
  if (!ev || (ev.source === 'system' && String(ev.action).startsWith('security.'))) return;
  const since = new Date(Date.now() - A.burstWindowMin * 60000);
  const actorId = ev.actor && ev.actor.userId;
  const actorName = (ev.actor && ev.actor.name) || 'Unknown';

  // 1. Privilege / role changes
  const privChanges = (ev.changes || []).filter((c) => ['role', 'roles', 'permissions', 'isAdmin', 'accessLevel'].includes(String(c.field).split('.')[0]));
  if (/privilege_changed|role_changed/.test(ev.action) || (privChanges.length && ev.target && /^users?$/i.test(ev.target.type || ''))) {
    const User = UserModel();
    const subject = User && ev.target && mongoose.isValidObjectId(ev.target.id) ? await User.findById(ev.target.id).lean() : null;
    await raiseAlert({
      type: 'privilege_change',
      severity: 'high',
      user: subject,
      title: `Privileges changed for ${(ev.target && ev.target.label) || 'a user account'}`,
      summary: `${actorName} (${(ev.actor && ev.actor.role) || 'unknown role'}) changed ${privChanges.map((c) => `${c.field}: ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`).join('; ') || 'access rights'}.`,
      evidence: { ip: ev.network && ev.network.ip, location: geoIp.describe(ev.geo), changedBy: actorName, changes: privChanges, when: ev.timestamp },
      dedupeKey: `priv:${ev.target && ev.target.id}`,
      dedupeWindowMinutes: 10,
      notifyAdmins: true,
      notifyUser: true, // the account owner is told their access changed
      auditEventIds: [ev.eventId],
    });
  }

  // 2. Mass data export
  const count = Number(ev.metadata && ev.metadata.recordCount);
  if (ev.category === 'data_access' && /export|download|spool/.test(ev.action) && count >= A.massExportThreshold) {
    await raiseAlert({
      type: 'mass_data_export',
      severity: count >= A.massExportThreshold * 5 ? 'high' : 'medium',
      title: `Large data export by ${actorName}`,
      summary: `${actorName} exported ${count} records (${ev.action}).`,
      evidence: { ip: ev.network && ev.network.ip, location: geoIp.describe(ev.geo), recordCount: count, action: ev.action, when: ev.timestamp },
      dedupeKey: `export:${actorId}`,
      notifyAdmins: true,
      notifyUser: false,
      auditEventIds: [ev.eventId],
    });
  }

  // 3. Burst of access-denied responses (probing / privilege abuse)
  if (ev.outcome === 'denied' && actorId) {
    const n = await AuditLog.countDocuments({ 'actor.userId': actorId, outcome: 'denied', timestamp: { $gte: since } });
    if (n >= A.deniedBurstThreshold) {
      await raiseAlert({
        type: 'access_denied_burst',
        severity: 'high',
        title: `Repeated access-denied responses for ${actorName}`,
        summary: `${n} denied requests in ${A.burstWindowMin} minutes – possible probing for data outside this user's permissions.`,
        evidence: { ip: ev.network && ev.network.ip, location: geoIp.describe(ev.geo), deniedCount: n, lastPath: ev.request && ev.request.path, when: ev.timestamp },
        dedupeKey: `denied:${actorId}`,
        notifyAdmins: true,
        notifyUser: false,
        auditEventIds: [ev.eventId],
      });
    }
  }

  // 4. Mass deletion
  if (actorId && ev.outcome === 'success' && ev.category === 'data_change' && /(^|[._])(soft_)?delete(d)?($|[._])/.test(ev.action)) {
    const n = await countDistinctRequests({ 'actor.userId': actorId, category: 'data_change', outcome: 'success', timestamp: { $gte: since }, action: { $regex: /(^|[._])(soft_)?delete(d)?($|[._])/ } });
    if (n >= A.massDeletionThreshold) {
      await raiseAlert({
        type: 'mass_deletion',
        severity: 'high',
        title: `Mass deletion by ${actorName}`,
        summary: `${n} delete operations in ${A.burstWindowMin} minutes.`,
        evidence: { ip: ev.network && ev.network.ip, location: geoIp.describe(ev.geo), deleteRequests: n, when: ev.timestamp },
        dedupeKey: `del:${actorId}`,
        notifyAdmins: true,
        notifyUser: false,
        auditEventIds: [ev.eventId],
      });
    }
  }

  // 5. Audit trail integrity failure
  if (ev.action === 'audit.integrity_failed') {
    await raiseAlert({
      type: 'audit_integrity_failure',
      severity: 'critical',
      title: 'Audit trail integrity check FAILED',
      summary: ev.description,
      evidence: ev.metadata,
      dedupeKey: 'integrity',
      dedupeWindowMinutes: 240,
      notifyAdmins: true,
      notifyUser: false,
      auditEventIds: [ev.eventId],
    });
  }
}

let rulesRegistered = false;
function registerRules() {
  if (rulesRegistered) return;
  rulesRegistered = true;
  auditService.bus.on('audit:event', (ev) => {
    runRules(ev).catch((e) => logger.error('[security] rule engine error', e.message));
  });
  auditService.bus.on('audit:write_failed', ({ event, error }) => {
    raiseAlert({
      type: 'audit_write_failure',
      severity: 'high',
      title: 'Audit events could not be written to the database',
      summary: `Events are being kept in the local fallback file and will be replayed. Last error: ${error && error.message}`,
      evidence: { action: event && event.action },
      dedupeKey: 'audit-write',
      dedupeWindowMinutes: 60,
      notifyAdmins: true,
      notifyUser: false,
    }).catch(() => {});
  });
}

// ============================================================ RESPONSES & WORKFLOW
async function revokeSessions(userId, reason) {
  const Session = SessionModel();
  if (!Session) return 0;
  const r = await Session.updateMany({ user: userId, isActive: true }, { $set: { isActive: false, terminatedAt: new Date(), terminationReason: reason } });
  return r.modifiedCount || r.nModified || 0;
}

async function applyResponse(alert, answer, req, channel) {
  const now = new Date();
  const User = UserModel();
  const user = alert.user && User ? await User.findById(alert.user).lean() : null;
  const ev = alert.evidence || {};
  alert.userResponse = { answer, at: now, ip: getClientIp(req), channel };
  alert.responseTokenHash = undefined;
  alert.responseTokenExpires = undefined;

  if (answer === 'me') {
    const profile = alert.user ? await getProfile(alert.user) : null;
    if (profile) {
      profile.knownLocations.filter((l) => l.countryCode === ev.countryCode).forEach((l) => { l.trusted = true; });
      profile.knownDevices.filter((d) => d.fingerprint === ev.deviceFingerprint).forEach((d) => { d.trusted = true; });
      await profile.save();
    }
    alert.history.push({ at: now, by: { userId: alert.user, name: user ? displayName(user) : 'Account owner' }, action: 'user_confirmed', fromStatus: alert.status, toStatus: 'resolved', note: 'Account owner confirmed this activity' });
    alert.status = 'resolved';
    alert.resolvedAt = now;
    alert.resolvedBy = { userId: alert.user, name: 'Account owner (self-confirmed)' };
    await alert.save();
    await auditService.record({
      action: 'security.alert_confirmed_by_user', category: 'security', severity: 'info', module: 'Security Monitoring',
      actor: user ? actorFromUser(user) : undefined, markHandled: true,
      description: `Account owner confirmed alert "${alert.title}" was their own activity`,
      target: { type: 'SecurityAlert', id: String(alert._id), label: alert.type },
    });
    return { status: 'confirmed' };
  }

  // Not me -> contain the incident
  const revoked = alert.user ? await revokeSessions(alert.user, 'Account owner reported unrecognised activity') : 0;
  if (alert.user) {
    const profile = await getProfile(alert.user);
    profile.knownLocations = profile.knownLocations.filter((l) => !(l.countryCode === ev.countryCode && !l.trusted));
    profile.knownDevices = profile.knownDevices.filter((d) => !(d.fingerprint === ev.deviceFingerprint && !d.trusted));
    profile.lockUntil = new Date(now.getTime() + 3650 * 24 * HOUR);
    profile.lockReason = 'compromise_reported';
    profile.forcePasswordReset = true;
    await profile.save();
  }
  alert.history.push({ at: now, by: { userId: alert.user, name: user ? displayName(user) : 'Account owner' }, action: 'user_reported_compromise', fromStatus: alert.status, toStatus: 'investigating', note: `Owner reported this was NOT them. ${revoked} session(s) revoked, account locked.` });
  alert.status = 'investigating';
  alert.severity = 'critical';
  await alert.save();

  await auditService.record({
    action: 'security.compromise_reported', category: 'security', severity: 'critical', module: 'Security Monitoring',
    actor: user ? actorFromUser(user) : undefined, markHandled: true,
    description: `Account owner reported unrecognised activity (alert "${alert.title}"). ${revoked} session(s) revoked and account locked.`,
    target: { type: 'User', id: alert.user ? String(alert.user) : undefined, label: user && user.email },
    metadata: { alertId: String(alert._id), sessionsRevoked: revoked },
  });
  await raiseAlert({
    type: 'compromise_reported',
    severity: 'critical',
    user,
    title: `Possible account compromise reported by ${user ? displayName(user) : 'a user'}`,
    summary: `The account owner said the activity in alert "${alert.title}" was not them. Sessions were revoked and the account is locked. Reset the password, review this user's recent activity and unlock when safe.`,
    evidence: ev,
    dedupeKey: `compromise:${alert.user}`,
    notifyAdmins: true,
    notifyUser: false,
  });
  return { status: 'secured', sessionsRevoked: revoked };
}

/** Public e-mail link response. */
async function respondWithToken(token, answer, req) {
  if (!token || typeof token !== 'string' || token.length > 200) return { error: 'invalid_token' };
  if (!['me', 'not_me'].includes(answer)) return { error: 'invalid_answer' };
  const alert = await SecurityAlert.findOne({ responseTokenHash: sha256(token) }).select('+responseTokenHash +responseTokenExpires');
  if (!alert) return { error: 'invalid_token' };
  if (alert.responseTokenExpires && alert.responseTokenExpires < new Date()) return { error: 'expired_token' };
  if (alert.userResponse && alert.userResponse.answer) return { error: 'already_answered' };
  return applyResponse(alert, answer, req, 'email_link');
}

/** Authenticated in-app response by the alert's owner. */
async function respondInApp(alertId, user, answer, req) {
  if (!['me', 'not_me'].includes(answer)) return { error: 'invalid_answer' };
  if (!mongoose.isValidObjectId(alertId)) return { error: 'not_found' };
  const alert = await SecurityAlert.findOne({ _id: alertId, user: user._id, allowUserResponse: true });
  if (!alert) return { error: 'not_found' };
  if (alert.userResponse && alert.userResponse.answer) return { error: 'already_answered' };
  return applyResponse(alert, answer, req, 'in_app');
}

const TRANSITIONS = {
  open: ['acknowledged', 'investigating', 'resolved', 'false_positive'],
  acknowledged: ['investigating', 'resolved', 'false_positive'],
  investigating: ['resolved', 'false_positive', 'acknowledged'],
  resolved: ['open'],
  false_positive: ['open'],
};

async function updateAlertStatus(alertId, { status, note }, actorUser) {
  if (!mongoose.isValidObjectId(alertId)) return { error: 'not_found' };
  const alert = await SecurityAlert.findById(alertId);
  if (!alert) return { error: 'not_found' };
  if (!SecurityAlert.STATUSES.includes(status)) return { error: 'invalid_status' };
  if (!(TRANSITIONS[alert.status] || []).includes(status)) return { error: `Cannot move an alert from ${alert.status} to ${status}` };
  const cleanNote = String(note || '').trim().slice(0, 2000);
  if (['resolved', 'false_positive'].includes(status) && cleanNote.length < 5) return { error: 'A note of at least 5 characters is required to close an alert' };
  const now = new Date();
  const by = { userId: actorUser._id, name: displayName(actorUser), role: actorUser.role };
  alert.history.push({ at: now, by, action: 'status_changed', fromStatus: alert.status, toStatus: status, note: cleanNote });
  const from = alert.status;
  alert.status = status;
  if (['resolved', 'false_positive'].includes(status)) {
    alert.resolvedAt = now;
    alert.resolvedBy = { userId: actorUser._id, name: by.name };
  }
  await alert.save();
  await auditService.record({
    action: 'security.alert_status_changed', category: 'security', severity: 'medium', module: 'Security Monitoring',
    description: `${by.name} moved alert "${alert.title}" from ${from} to ${status}`,
    target: { type: 'SecurityAlert', id: String(alert._id), label: alert.type },
    changes: [{ field: 'status', from, to: status }],
    metadata: { note: cleanNote },
  });
  return { alert };
}

async function unlockAccount(userId, actorUser, note) {
  const r = await UserLoginProfile.findOneAndUpdate({ user: userId }, { $set: { lockUntil: null, lockReason: null, failedCount: 0, failedWindowStart: null } }, { new: false });
  await auditService.record({
    action: 'security.account_unlocked', category: 'security', severity: 'medium', module: 'Security Monitoring',
    description: `${displayName(actorUser)} unlocked account ${userId}${r && r.lockReason ? ` (was locked: ${r.lockReason})` : ''}`,
    target: { type: 'User', id: String(userId) },
    metadata: { note: String(note || '').slice(0, 500), previousLockReason: r && r.lockReason },
  });
  return { unlocked: true, previousLockReason: r && r.lockReason };
}

module.exports = {
  LOGIN_REASON_META,
  raiseAlert,
  checkLock,
  recordFailedLogin,
  resetFailedLogins,
  evaluateLogin,
  registerRules,
  runRules,
  respondWithToken,
  respondInApp,
  updateAlertStatus,
  unlockAccount,
  revokeSessions,
  getProfile,
  identifierMeta: (identifier) => ({ identifier: maskEmail(identifier), identifierHash: pseudonymousId(identifier) }),
};
