/**
 * @file auditLogController.js
 * @description Audit & security API.
 *
 * Every signed-in user:  own activity, actions taken on their account, sign-in history, known
 *                        devices/locations, own security alerts, GDPR export of their audit data.
 * Admins / auditors:     organisation-wide activity separated by role group (admin / user / system /
 *                        anonymous), statistics, export, alerts, per-user security, integrity checks.
 * Superadmin:            legal hold, data-subject pseudonymisation, manual retention run.
 *
 * Access to the audit log is itself audited (ISO 27001 A.8.15 – protect log information).
 */

'use strict';

const { once } = require('events');
const mongoose = require('mongoose');
const asyncHandler = require('express-async-handler');
const AuditLog = require('../models/AuditLog');
const SecurityAlert = require('../models/SecurityAlert');
const UserLoginProfile = require('../models/UserLoginProfile');
const AuditChainHead = require('../models/AuditChainHead');
const auditService = require('../services/auditService');
const securityAlertService = require('../services/securityAlertService');
const retentionService = require('../services/auditRetentionService');
const cfg = require('../config/auditConfig');
const { verify } = require('../utils/auditIntegrity');
const { roleGroupOf, displayName, asObjectIdString } = require('../utils/auditActor');

// ============================================================ HELPERS
const ok = (res, data, msg = 'Completed successfully', extra = {}) => res.json({ responseCode: '00', responseMessage: msg, responseData: data, ...extra });
const fail = (res, status, msg, extra = {}) => res.status(status).json({ responseCode: status === 404 ? '24' : status === 403 ? '23' : '22', responseMessage: msg, ...extra });
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const csvList = (v, allowed) => (str(v) ? str(v).split(',').map((x) => x.trim()).filter((x) => !allowed || allowed.includes(x)) : []);
const intIn = (v, d, min, max) => Math.min(Math.max(parseInt(v, 10) || d, min), max);
const SEV_ORDER = cfg.SEVERITIES;
const LIST_PROJECTION = '-integrity -privacy.lawfulBasis -retention.legalHoldReason';
const USER_HIDDEN = '-integrity -retention -network.forwardedFor -network.deviceFingerprint';

function viewer(req) {
  const role = String(req.user.role || '').toLowerCase();
  const group = roleGroupOf(role);
  return {
    role,
    group,
    isSuper: role === 'superadmin',
    isAdmin: group === 'admin',
    isAuditor: group === 'auditor',
    canViewAll: group === 'admin' || group === 'auditor',
    companyId: asObjectIdString(req.user.companyId || (req.user.company && req.user.company._id)),
  };
}

function scopeFilter(req) {
  const v = viewer(req);
  if (v.isSuper || !cfg.multiTenant || !v.companyId) return {};
  return { 'actor.companyId': new mongoose.Types.ObjectId(v.companyId) };
}

function dateRange(q) {
  const out = {};
  const from = str(q.from) ? new Date(q.from) : null;
  const to = str(q.to) ? new Date(q.to) : null;
  if (from && !Number.isNaN(from.getTime())) out.$gte = from;
  if (to && !Number.isNaN(to.getTime())) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(q.to)) to.setUTCHours(23, 59, 59, 999);
    out.$lte = to;
  }
  return Object.keys(out).length ? out : null;
}

/** Translate query-string filters into a MongoDB filter. `restricted` = self-service view. */
function buildFilter(q, { restricted = false } = {}) {
  const and = [];
  const cats = csvList(q.category, cfg.CATEGORIES);
  if (cats.length) and.push({ category: { $in: cats } });
  const outcomes = csvList(q.outcome, cfg.OUTCOMES);
  if (outcomes.length) and.push({ outcome: { $in: outcomes } });
  const sev = str(q.minSeverity);
  if (sev && SEV_ORDER.includes(sev)) and.push({ severity: { $in: SEV_ORDER.slice(SEV_ORDER.indexOf(sev)) } });
  const sevs = csvList(q.severity, SEV_ORDER);
  if (sevs.length) and.push({ severity: { $in: sevs } });
  const action = str(q.action);
  if (action) and.push(action.endsWith('*') ? { action: { $regex: `^${escapeRegex(action.slice(0, -1).toLowerCase())}` } } : { action: action.toLowerCase() });
  const module = str(q.module);
  if (module) and.push({ module: { $regex: `^${escapeRegex(module)}$`, $options: 'i' } });
  const range = dateRange(q);
  if (range) and.push({ timestamp: range });
  const text = str(q.q);
  if (text) and.push({ $text: { $search: text.slice(0, 100) } });

  if (!restricted) {
    const groups = csvList(q.roleGroup, cfg.ROLE_GROUP_VALUES);
    if (groups.length) and.push({ 'actor.roleGroup': { $in: groups } });
    const role = str(q.role);
    if (role) and.push({ 'actor.role': role });
    const userId = asObjectIdString(q.userId);
    if (userId) and.push({ 'actor.userId': new mongoose.Types.ObjectId(userId) });
    const ip = str(q.ip);
    if (ip) and.push(ip.endsWith('*') ? { 'network.ip': { $regex: `^${escapeRegex(ip.slice(0, -1))}` } } : { 'network.ip': ip });
    const country = str(q.country);
    if (country && /^[A-Za-z]{2}$/.test(country)) and.push({ 'geo.countryCode': country.toUpperCase() });
    const targetType = str(q.targetType);
    if (targetType) and.push({ 'target.type': targetType });
    const targetId = str(q.targetId);
    if (targetId) and.push({ 'target.id': targetId });
    const requestId = str(q.requestId);
    if (requestId) and.push({ 'request.requestId': requestId });
    const sources = csvList(q.source, cfg.SOURCES);
    if (sources.length) and.push({ source: { $in: sources } });
  }
  return and;
}

const merge = (...parts) => {
  const and = parts.flat().filter((p) => p && Object.keys(p).length);
  return and.length ? { $and: and } : {};
};

function pageParams(q) {
  const page = intIn(q.page, 1, 1, 100000);
  const limit = intIn(q.limit, 25, 1, 200);
  const dir = q.sort === 'timestamp' ? 1 : -1;
  return { page, limit, skip: (page - 1) * limit, sort: { timestamp: dir, _id: dir } };
}

async function paged(filter, q, projection) {
  const { page, limit, skip, sort } = pageParams(q);
  const [items, total] = await Promise.all([
    AuditLog.find(filter).sort(sort).skip(skip).limit(limit).select(projection).lean(),
    AuditLog.countDocuments(filter).maxTimeMS(15000),
  ]);
  return { items, total, page, limit, pages: Math.ceil(total / limit) };
}

function maskActorForSubject(ev) {
  const a = ev.actor || {};
  const label = a.roleGroup === 'admin' ? 'An administrator' : a.roleGroup === 'system' ? 'The system' : a.roleGroup === 'auditor' ? 'An auditor' : 'Another user';
  return {
    ...ev,
    actor: { type: a.type, role: a.role, roleGroup: a.roleGroup, name: label },
    network: undefined,
    geo: undefined,
    description: ev.description && a.name ? ev.description.split(a.name).join(label) : ev.description,
  };
}

const SAFE_ALERT_FIELDS = '-notifications -dedupeKey';

// ============================================================ SELF-SERVICE (every signed-in user)

/** GET /api/audit/me – my own actions */
exports.myActivity = asyncHandler(async (req, res) => {
  const filter = merge({ 'actor.userId': req.user._id }, buildFilter(req.query, { restricted: true }));
  ok(res, await paged(filter, req.query, USER_HIDDEN));
});

/** GET /api/audit/me/about – actions others (admins/system) took on my account */
exports.activityAboutMe = asyncHandler(async (req, res) => {
  const me = String(req.user._id);
  const filter = merge(
    { 'target.id': me, 'target.type': { $in: ['User', 'user', 'users', 'Employee'] }, 'actor.userId': { $ne: req.user._id } },
    buildFilter(req.query, { restricted: true }),
  );
  const result = await paged(filter, req.query, USER_HIDDEN);
  result.items = result.items.map(maskActorForSubject);
  ok(res, result);
});

/** GET /api/audit/me/security – sign-in history, devices, locations, alerts, lock status */
exports.mySecurity = asyncHandler(async (req, res) => {
  const [profile, signIns, alerts] = await Promise.all([
    UserLoginProfile.findOne({ user: req.user._id }).lean(),
    AuditLog.find({ 'actor.userId': req.user._id, category: { $in: ['authentication', 'security'] } })
      .sort({ timestamp: -1 }).limit(30).select(USER_HIDDEN).lean(),
    SecurityAlert.find({ user: req.user._id }).sort({ lastOccurredAt: -1 }).limit(20).select(`${SAFE_ALERT_FIELDS} -history.by.userId`).lean(),
  ]);
  const locked = !!(profile && profile.lockUntil && new Date(profile.lockUntil) > new Date());
  ok(res, {
    lastLogin: profile && profile.lastLogin,
    loginCount: (profile && profile.loginCount) || 0,
    knownLocations: ((profile && profile.knownLocations) || []).sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen)),
    knownDevices: ((profile && profile.knownDevices) || []).sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen)),
    recentLogins: (profile && profile.recentLogins) || [],
    lock: { locked, lockUntil: locked ? profile.lockUntil : null, reason: locked ? profile.lockReason : null },
    signInEvents: signIns,
    alerts,
  });
});

/** GET /api/audit/me/alerts */
exports.myAlerts = asyncHandler(async (req, res) => {
  const filter = { user: req.user._id };
  const statuses = csvList(req.query.status, SecurityAlert.STATUSES);
  if (statuses.length) filter.status = { $in: statuses };
  const items = await SecurityAlert.find(filter).sort({ lastOccurredAt: -1 }).limit(intIn(req.query.limit, 50, 1, 200)).select(`${SAFE_ALERT_FIELDS} -history.by.userId`).lean();
  ok(res, { items, unanswered: items.filter((a) => a.allowUserResponse && !(a.userResponse && a.userResponse.answer)).length });
});

/** POST /api/audit/me/alerts/:id/respond { answer: 'me' | 'not_me' } */
exports.respondToMyAlert = asyncHandler(async (req, res) => {
  const r = await securityAlertService.respondInApp(req.params.id, req.user, str(req.body.answer), req);
  if (r.error) return fail(res, r.error === 'not_found' ? 404 : 400, r.error.replace(/_/g, ' '));
  return ok(res, r, r.status === 'secured' ? 'Your account has been secured. All sessions were signed out.' : 'Thanks – the activity is confirmed as yours.');
});

/** DELETE /api/audit/me/devices/:fingerprint – forget a device */
exports.forgetDevice = asyncHandler(async (req, res) => {
  const fp = str(req.params.fingerprint);
  if (!fp || !/^[a-f0-9]{16,64}$/.test(fp)) return fail(res, 400, 'Invalid device id');
  const r = await UserLoginProfile.updateOne({ user: req.user._id }, { $pull: { knownDevices: { fingerprint: fp } } });
  await auditService.record({ action: 'security.device_forgotten', category: 'security', severity: 'low', module: 'Security', description: `${displayName(req.user)} removed a remembered device`, metadata: { fingerprint: fp } });
  return ok(res, { removed: r.modifiedCount > 0 }, 'Device removed. The next sign-in from it will be treated as a new device.');
});

/** GET /api/audit/me/export – GDPR Art. 15/20 copy of my audit data */
exports.exportMyData = asyncHandler(async (req, res) => {
  const [events, profile, alerts] = await Promise.all([
    AuditLog.find({ 'actor.userId': req.user._id }).sort({ timestamp: -1 }).limit(20000).select(USER_HIDDEN).lean(),
    UserLoginProfile.findOne({ user: req.user._id }).select('-_id -__v').lean(),
    SecurityAlert.find({ user: req.user._id }).select(`${SAFE_ALERT_FIELDS} -history`).lean(),
  ]);
  await auditService.record({
    action: 'privacy.subject_access_export', category: 'privacy', severity: 'medium', module: 'Privacy (GDPR)',
    description: `${displayName(req.user)} downloaded a copy of their audit data (${events.length} events)`,
    metadata: { recordCount: events.length },
  });
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="my-activity-${new Date().toISOString().slice(0, 10)}.json"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(JSON.stringify({
    exportedAt: new Date().toISOString(),
    subject: { userId: String(req.user._id), name: displayName(req.user), email: req.user.email },
    notice: 'Audit records are processed under legitimate interests (security, fraud prevention, accountability) and legal obligations. Contact the Data Protection Officer to exercise further rights.',
    retentionPolicyDays: cfg.retention.days,
    signInProfile: profile,
    securityAlerts: alerts,
    events,
  }, null, 2));
});

/** POST /api/audit/client-event – limited, whitelisted client-side events (print, copy, etc.) */
const CLIENT_ACTIONS = ['document.printed', 'report.printed', 'data.copied', 'page.viewed_sensitive', 'session.idle_logout', 'file.downloaded'];
exports.clientEvent = asyncHandler(async (req, res) => {
  const action = str(req.body.action);
  if (!action || !CLIENT_ACTIONS.includes(action)) return fail(res, 400, `action must be one of ${CLIENT_ACTIONS.join(', ')}`);
  const target = req.body.target && typeof req.body.target === 'object' ? req.body.target : undefined;
  const ev = await auditService.record({
    action: `client.${action}`, category: 'data_access', module: str(req.body.module) || 'Client', source: 'client',
    description: `${displayName(req.user)} ${action.replace(/[._]/g, ' ')}${str(req.body.description) ? `: ${str(req.body.description).slice(0, 300)}` : ''}`,
    target: target ? { type: str(target.type), id: str(target.id), label: str(target.label) } : undefined,
    tags: ['client_reported'],
  });
  return ok(res, { eventId: ev && ev.eventId }, 'Recorded', { responseCode: '00' });
});

// ============================================================ ORGANISATION VIEW (admins & auditors)

/** GET /api/audit/logs */
exports.listLogs = asyncHandler(async (req, res) => {
  const filter = merge(scopeFilter(req), buildFilter(req.query));
  ok(res, await paged(filter, req.query, LIST_PROJECTION));
});

/** GET /api/audit/logs/:eventId – full detail + integrity status + related events */
exports.getLog = asyncHandler(async (req, res) => {
  const eventId = str(req.params.eventId);
  if (!eventId || eventId.length > 64) return fail(res, 400, 'Invalid event id');
  const ev = await AuditLog.findOne(merge(scopeFilter(req), { eventId })).lean();
  if (!ev) return fail(res, 404, 'Audit event not found');
  const integrity = verify(ev);
  const related = ev.request && ev.request.requestId
    ? await AuditLog.find({ 'request.requestId': ev.request.requestId, eventId: { $ne: ev.eventId } }).sort({ seq: 1 }).limit(50).select('eventId timestamp action category outcome severity description source').lean()
    : [];
  const { integrity: seal, ...rest } = ev;
  ok(res, { event: rest, integrity: { ...integrity, keyId: seal && seal.keyId, alg: seal && seal.alg, hash: seal && seal.hash }, related });
});

/** GET /api/audit/stats?days=30 */
exports.stats = asyncHandler(async (req, res) => {
  const days = intIn(req.query.days, 30, 1, 730);
  const range = dateRange(req.query) || { $gte: new Date(Date.now() - days * 86400000) };
  const q = { ...req.query };
  delete q.from;
  delete q.to;
  const match = merge(scopeFilter(req), buildFilter(q), { timestamp: range });
  const group = (field) => [{ $group: { _id: `$${field}`, count: { $sum: 1 } } }, { $sort: { count: -1 } }];

  const [r] = await AuditLog.aggregate([
    { $match: match },
    {
      $facet: {
        total: [{ $count: 'n' }],
        byRoleGroup: group('actor.roleGroup'),
        byCategory: group('category'),
        byOutcome: group('outcome'),
        bySeverity: group('severity'),
        bySource: group('source'),
        byModule: [...group('module'), { $limit: 15 }],
        byCountry: [{ $match: { 'geo.countryCode': { $nin: [null, 'ZZ'] } } }, { $group: { _id: '$geo.countryCode', country: { $last: '$geo.country' }, count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 20 }],
        topActors: [
          { $match: { 'actor.userId': { $ne: null } } },
          { $group: { _id: '$actor.userId', name: { $last: '$actor.name' }, role: { $last: '$actor.role' }, roleGroup: { $last: '$actor.roleGroup' }, count: { $sum: 1 }, failures: { $sum: { $cond: [{ $ne: ['$outcome', 'success'] }, 1, 0] } }, lastSeen: { $max: '$timestamp' } } },
          { $sort: { count: -1 } }, { $limit: 10 },
        ],
        topIps: [
          { $match: { 'network.ip': { $nin: [null, 'unknown', '[erased]'] } } },
          { $group: { _id: '$network.ip', count: { $sum: 1 }, countries: { $addToSet: '$geo.countryCode' }, users: { $addToSet: '$actor.userId' }, failures: { $sum: { $cond: [{ $ne: ['$outcome', 'success'] }, 1, 0] } } } },
          { $project: { count: 1, countries: 1, failures: 1, userCount: { $size: '$users' } } },
          { $sort: { count: -1 } }, { $limit: 10 },
        ],
        timeline: [
          { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } }, total: { $sum: 1 }, admin: { $sum: { $cond: [{ $eq: ['$actor.roleGroup', 'admin'] }, 1, 0] } }, failures: { $sum: { $cond: [{ $ne: ['$outcome', 'success'] }, 1, 0] } } } },
          { $sort: { _id: 1 } },
        ],
        failedLogins: [{ $match: { action: 'auth.login_failed' } }, { $count: 'n' }],
        successfulLogins: [{ $match: { action: 'auth.login_success' } }, { $count: 'n' }],
      },
    },
  ]).option({ maxTimeMS: 30000 });

  const n = (a) => (a && a[0] ? a[0].n : 0);
  const map = (a) => Object.fromEntries((a || []).map((x) => [x._id || 'unknown', x.count]));
  const openAlerts = await SecurityAlert.aggregate([
    { $match: { status: { $in: ['open', 'acknowledged', 'investigating'] } } },
    { $group: { _id: '$severity', count: { $sum: 1 } } },
  ]);

  ok(res, {
    from: range.$gte, to: range.$lte || new Date(),
    total: n(r.total),
    byRoleGroup: map(r.byRoleGroup),
    byCategory: map(r.byCategory),
    byOutcome: map(r.byOutcome),
    bySeverity: map(r.bySeverity),
    bySource: map(r.bySource),
    byModule: r.byModule.map((x) => ({ module: x._id || 'General', count: x.count })),
    byCountry: r.byCountry.map((x) => ({ countryCode: x._id, country: x.country, count: x.count })),
    topActors: r.topActors.map((x) => ({ userId: x._id, name: x.name, role: x.role, roleGroup: x.roleGroup, count: x.count, failures: x.failures, lastSeen: x.lastSeen })),
    topIps: r.topIps.map((x) => ({ ip: x._id, count: x.count, failures: x.failures, countries: (x.countries || []).filter(Boolean), userCount: x.userCount })),
    timeline: r.timeline.map((x) => ({ date: x._id, total: x.total, admin: x.admin, failures: x.failures })),
    failedLogins: n(r.failedLogins),
    successfulLogins: n(r.successfulLogins),
    openAlerts: map(openAlerts),
  });
});

/** GET /api/audit/export?format=csv|json|ndjson&... */
const CSV_COLUMNS = [
  ['timestamp', (e) => e.timestamp && new Date(e.timestamp).toISOString()], ['eventId', (e) => e.eventId], ['seq', (e) => e.seq],
  ['roleGroup', (e) => e.actor && e.actor.roleGroup], ['role', (e) => e.actor && e.actor.role], ['actorName', (e) => e.actor && e.actor.name],
  ['actorEmail', (e) => e.actor && e.actor.email], ['actorUserId', (e) => e.actor && e.actor.userId], ['category', (e) => e.category],
  ['action', (e) => e.action], ['module', (e) => e.module], ['outcome', (e) => e.outcome], ['severity', (e) => e.severity],
  ['description', (e) => e.description], ['targetType', (e) => e.target && e.target.type], ['targetId', (e) => e.target && e.target.id],
  ['targetLabel', (e) => e.target && e.target.label], ['ip', (e) => e.network && e.network.ip], ['country', (e) => e.geo && e.geo.country],
  ['city', (e) => e.geo && e.geo.city], ['browser', (e) => e.network && e.network.browser], ['os', (e) => e.network && e.network.os],
  ['device', (e) => e.network && e.network.device], ['method', (e) => e.request && e.request.method], ['path', (e) => e.request && e.request.path],
  ['statusCode', (e) => e.request && e.request.statusCode], ['requestId', (e) => e.request && e.request.requestId],
  ['riskScore', (e) => e.risk && e.risk.score], ['changes', (e) => (e.changes && e.changes.length ? JSON.stringify(e.changes) : '')],
  ['integrityHash', (e) => e.integrity && e.integrity.hash],
];

function csvCell(v) {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // CSV/formula injection protection
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

exports.exportLogs = asyncHandler(async (req, res) => {
  const format = ['csv', 'json', 'ndjson'].includes(req.query.format) ? req.query.format : 'csv';
  const max = intIn(req.query.limit, cfg.export.maxRows, 1, cfg.export.maxRows);
  const filter = merge(scopeFilter(req), buildFilter(req.query));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  res.setHeader('Content-Type', format === 'csv' ? 'text/csv; charset=utf-8' : format === 'json' ? 'application/json; charset=utf-8' : 'application/x-ndjson');
  res.setHeader('Content-Disposition', `attachment; filename="audit-log-${stamp}.${format}"`);
  res.setHeader('Cache-Control', 'no-store');

  let aborted = false;
  req.on('close', () => { aborted = !res.writableEnded; });
  const write = async (chunk) => { if (!res.write(chunk)) await once(res, 'drain'); };

  const cursor = AuditLog.find(filter).sort({ timestamp: -1 }).limit(max).select('-integrity.identityDigest -integrity.networkDigest -retention -privacy').lean().cursor();
  let count = 0;
  if (format === 'csv') await write(`﻿${CSV_COLUMNS.map(([h]) => h).join(',')}\r\n`);
  if (format === 'json') await write(`{"exportedAt":"${new Date().toISOString()}","exportedBy":${JSON.stringify(displayName(req.user))},"records":[`);
  // eslint-disable-next-line no-restricted-syntax
  for await (const ev of cursor) {
    if (aborted) break;
    if (format === 'csv') await write(`${CSV_COLUMNS.map(([, f]) => csvCell(f(ev))).join(',')}\r\n`);
    else if (format === 'json') await write(`${count ? ',' : ''}${JSON.stringify(ev)}`);
    else await write(`${JSON.stringify(ev)}\n`);
    count += 1;
  }
  if (format === 'json') await write(`],"count":${count}}`);
  res.end();

  await auditService.record({
    action: 'audit.logs_exported', category: 'data_access', severity: count >= cfg.alerts.massExportThreshold ? 'high' : 'medium',
    module: 'Audit & Compliance', description: `${displayName(req.user)} exported ${count} audit event(s) as ${format.toUpperCase()}${aborted ? ' (aborted by client)' : ''}`,
    metadata: { recordCount: count, format, aborted, filter: req.query },
  });
});

/** GET /api/audit/verify?fromSeq=1&limit=50000 */
exports.verifyIntegrity = asyncHandler(async (req, res) => {
  const result = await auditService.verifyIntegrity({ fromSeq: intIn(req.query.fromSeq, 1, 1, Number.MAX_SAFE_INTEGER), limit: intIn(req.query.limit, 50000, 1, 500000) });
  ok(res, result, result.ok ? 'Audit trail integrity verified' : 'INTEGRITY FAILURE DETECTED');
});

/** GET /api/audit/integrity/status */
exports.integrityStatus = asyncHandler(async (req, res) => {
  const head = await AuditChainHead.findById(cfg.chainKey).lean();
  const [count, oldest, onHold] = await Promise.all([
    AuditLog.estimatedDocumentCount(),
    AuditLog.findOne().sort({ timestamp: 1 }).select('timestamp').lean(),
    AuditLog.countDocuments({ 'retention.legalHold': true }),
  ]);
  ok(res, {
    chainKey: cfg.chainKey,
    headSeq: (head && head.seq) || 0,
    lastVerifiedSeq: (head && head.lastVerifiedSeq) || 0,
    lastVerifiedAt: head && head.lastVerifiedAt,
    lastVerifyResult: head && head.lastVerifyResult,
    storedEvents: count,
    oldestEvent: oldest && oldest.timestamp,
    eventsOnLegalHold: onHold,
    retentionDays: cfg.retention.days,
    ipMinimiseAfterDays: cfg.retention.ipMinimiseAfterDays,
  });
});

// ============================================================ ALERTS (admins & auditors)

/** GET /api/audit/alerts */
exports.listAlerts = asyncHandler(async (req, res) => {
  const filter = {};
  const statuses = csvList(req.query.status, SecurityAlert.STATUSES);
  if (statuses.length) filter.status = { $in: statuses };
  const sevs = csvList(req.query.severity, SEV_ORDER);
  if (sevs.length) filter.severity = { $in: sevs };
  const types = csvList(req.query.type, SecurityAlert.TYPES);
  if (types.length) filter.type = { $in: types };
  const userId = asObjectIdString(req.query.userId);
  if (userId) filter.user = userId;
  const range = dateRange(req.query);
  if (range) filter.lastOccurredAt = range;
  const v = viewer(req);
  if (cfg.multiTenant && !v.isSuper && v.companyId) filter.companyId = v.companyId;

  const page = intIn(req.query.page, 1, 1, 100000);
  const limit = intIn(req.query.limit, 25, 1, 200);
  const [items, total] = await Promise.all([
    SecurityAlert.find(filter).sort({ lastOccurredAt: -1 }).skip((page - 1) * limit).limit(limit).select('-dedupeKey').lean(),
    SecurityAlert.countDocuments(filter),
  ]);
  ok(res, { items, total, page, limit, pages: Math.ceil(total / limit) });
});

/** GET /api/audit/alerts/summary */
exports.alertSummary = asyncHandler(async (req, res) => {
  const rows = await SecurityAlert.aggregate([
    { $match: { status: { $in: ['open', 'acknowledged', 'investigating'] } } },
    { $group: { _id: { severity: '$severity', status: '$status' }, count: { $sum: 1 } } },
  ]);
  const bySeverity = {};
  const byStatus = {};
  rows.forEach((r) => {
    bySeverity[r._id.severity] = (bySeverity[r._id.severity] || 0) + r.count;
    byStatus[r._id.status] = (byStatus[r._id.status] || 0) + r.count;
  });
  ok(res, { open: rows.reduce((a, r) => a + r.count, 0), bySeverity, byStatus });
});

/** GET /api/audit/alerts/:id */
exports.getAlert = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, 'Invalid alert id');
  const alert = await SecurityAlert.findById(req.params.id).select('-dedupeKey').lean();
  if (!alert) return fail(res, 404, 'Alert not found');
  const events = alert.auditEventIds && alert.auditEventIds.length
    ? await AuditLog.find({ eventId: { $in: alert.auditEventIds } }).sort({ timestamp: -1 }).limit(50).select(LIST_PROJECTION).lean()
    : [];
  return ok(res, { alert, events });
});

/** PATCH /api/audit/alerts/:id { status, note } */
exports.updateAlert = asyncHandler(async (req, res) => {
  const r = await securityAlertService.updateAlertStatus(req.params.id, { status: str(req.body.status), note: req.body.note }, req.user);
  if (r.error) return fail(res, r.error === 'not_found' ? 404 : 400, r.error);
  return ok(res, r.alert, 'Alert updated');
});

/** POST /api/audit/alerts/respond { token, answer } – PUBLIC (from e-mail link) */
exports.respondToAlert = asyncHandler(async (req, res) => {
  const r = await securityAlertService.respondWithToken(str(req.body.token), str(req.body.answer), req);
  if (r.error) {
    const msg = { invalid_token: 'This link is invalid.', expired_token: 'This link has expired. Please sign in and review the alert under Security.', already_answered: 'This alert has already been answered.', invalid_answer: 'Invalid answer.' }[r.error] || 'Unable to process the response.';
    return fail(res, r.error === 'already_answered' ? 409 : 400, msg);
  }
  return ok(res, r, r.status === 'secured'
    ? 'Your account has been secured: every session was signed out and the account is locked. An administrator will contact you to reset your password.'
    : 'Thank you. We have marked this sign-in as yours.');
});

// ============================================================ USER SECURITY ADMIN

/** GET /api/audit/users/:userId/security */
exports.userSecurity = asyncHandler(async (req, res) => {
  const userId = asObjectIdString(req.params.userId);
  if (!userId) return fail(res, 400, 'Invalid user id');
  const oid = new mongoose.Types.ObjectId(userId);
  const [profile, signIns, alerts, counts] = await Promise.all([
    UserLoginProfile.findOne({ user: oid }).lean(),
    AuditLog.find({ 'actor.userId': oid, category: { $in: ['authentication', 'security'] } }).sort({ timestamp: -1 }).limit(50).select(LIST_PROJECTION).lean(),
    SecurityAlert.find({ user: oid }).sort({ lastOccurredAt: -1 }).limit(50).select('-dedupeKey').lean(),
    AuditLog.aggregate([{ $match: { 'actor.userId': oid, timestamp: { $gte: new Date(Date.now() - 30 * 86400000) } } }, { $group: { _id: '$category', count: { $sum: 1 } } }]),
  ]);
  await auditService.record({ action: 'audit.user_security_viewed', category: 'data_access', module: 'Audit & Compliance', description: `${displayName(req.user)} reviewed the security profile of user ${userId}`, target: { type: 'User', id: userId } });
  ok(res, {
    profile,
    lock: { locked: !!(profile && profile.lockUntil && new Date(profile.lockUntil) > new Date()), lockUntil: profile && profile.lockUntil, reason: profile && profile.lockReason },
    signInEvents: signIns,
    alerts,
    last30DaysByCategory: Object.fromEntries(counts.map((c) => [c._id, c.count])),
  });
});

/** POST /api/audit/users/:userId/unlock { note } */
exports.unlockUser = asyncHandler(async (req, res) => {
  const userId = asObjectIdString(req.params.userId);
  if (!userId) return fail(res, 400, 'Invalid user id');
  ok(res, await securityAlertService.unlockAccount(userId, req.user, req.body && req.body.note), 'Account unlocked');
});

// ============================================================ GOVERNANCE (superadmin)

/** POST /api/audit/legal-hold { userId?, from?, to?, category?, hold, reason } */
exports.legalHold = asyncHandler(async (req, res) => {
  const reason = str(req.body.reason);
  if (!reason || reason.length < 10) return fail(res, 400, 'A reason of at least 10 characters is required');
  try {
    const r = await retentionService.setLegalHold({
      userId: str(req.body.userId), from: str(req.body.from), to: str(req.body.to),
      category: cfg.CATEGORIES.includes(req.body.category) ? req.body.category : undefined,
      hold: req.body.hold !== false, reason,
    }, req.user);
    return ok(res, r, req.body.hold === false ? 'Legal hold released' : 'Legal hold applied');
  } catch (e) {
    return fail(res, 400, e.message);
  }
});

/** POST /api/audit/privacy/pseudonymize/:userId { reason, confirm: "PSEUDONYMISE" } */
exports.pseudonymizeUser = asyncHandler(async (req, res) => {
  const userId = asObjectIdString(req.params.userId);
  if (!userId) return fail(res, 400, 'Invalid user id');
  const reason = str(req.body.reason);
  if (!reason || reason.length < 10) return fail(res, 400, 'A reason (e.g. erasure request reference) of at least 10 characters is required');
  if (req.body.confirm !== 'PSEUDONYMISE') return fail(res, 400, 'Send confirm: "PSEUDONYMISE" to proceed – this cannot be undone');
  if (String(req.user._id) === userId) return fail(res, 400, 'You cannot pseudonymise your own audit trail');
  ok(res, await retentionService.pseudonymizeSubject(userId, { reason }, req.user), 'Audit data pseudonymised');
});

/** POST /api/audit/retention/run */
exports.runRetentionNow = asyncHandler(async (req, res) => {
  ok(res, await retentionService.runRetention(), 'Retention run completed');
});

// ============================================================ META

/** GET /api/audit/meta – filter options + what this viewer may do */
exports.meta = asyncHandler(async (req, res) => {
  const v = viewer(req);
  ok(res, {
    categories: cfg.CATEGORIES,
    outcomes: cfg.OUTCOMES,
    severities: cfg.SEVERITIES,
    roleGroups: cfg.ROLE_GROUP_VALUES,
    sources: cfg.SOURCES,
    alertTypes: SecurityAlert.TYPES,
    alertStatuses: SecurityAlert.STATUSES,
    retentionDays: cfg.retention.days,
    capabilities: {
      roleGroup: v.group,
      canViewAll: v.canViewAll,
      canManageAlerts: v.isAdmin,
      canVerify: v.isSuper || v.isAuditor,
      canGovern: v.isSuper,
    },
  });
});

// ============================================================ LEGACY ALIASES (old route names keep working)
exports.getAuditLogs = asyncHandler(async (req, res, next) => (viewer(req).canViewAll ? exports.listLogs(req, res, next) : exports.myActivity(req, res, next)));
exports.getSecurityEvents = asyncHandler(async (req, res) => {
  const items = await AuditLog.getSecurityEvents(req.user._id, intIn(req.query.limit, 20, 1, 100)).lean();
  ok(res, items, 'Security events retrieved successfully');
});
exports.getAuditStatistics = exports.stats;
exports.exportAuditLogs = exports.exportMyData;
exports.getCriticalLogs = asyncHandler(async (req, res, next) => {
  req.query.severity = 'critical';
  return exports.listLogs(req, res, next);
});
exports.createAuditLog = exports.clientEvent;
