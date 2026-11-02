/**
 * @file auditRetentionService.js
 * @description Storage limitation, data minimisation, legal hold and data-subject pseudonymisation
 * for the audit trail (GDPR Art. 5(1)(c),(e), 17(3)(b),(e); ISO 27001 A.5.33, A.5.34, A.8.10).
 *
 * Daily job:
 *  1. Minimise IPs older than N days (truncate, drop forwarded chain & city-level geo)
 *  2. Purge events past their category's retention period (unless on legal hold), leaving
 *     personal-data-free tombstones so integrity verification still passes
 *  3. Verify integrity of everything written since the last verified sequence
 * Each step is itself audited.
 */

'use strict';

const os = require('os');
const crypto = require('crypto');
const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');
const AuditChainHead = require('../models/AuditChainHead');
const AuditTombstone = require('../models/AuditTombstone');
const SecurityAlert = require('../models/SecurityAlert');
const UserLoginProfile = require('../models/UserLoginProfile');
const auditService = require('./auditService');
const auditContext = require('../utils/auditContext');
const cfg = require('../config/auditConfig');
const { truncateIp } = require('../utils/clientIp');
const { displayName, systemActor } = require('../utils/auditActor');

let logger;
try {
  // eslint-disable-next-line global-require
  logger = require('../utils/logger');
} catch (_) {
  logger = console;
}

const DAY = 86400000;
const BATCH = 1000;

async function acquireLock(name, ttlMs) {
  const now = new Date();
  const owner = `${os.hostname()}:${process.pid}:${crypto.randomBytes(4).toString('hex')}`;
  try {
    const r = await AuditChainHead.findOneAndUpdate(
      { _id: `lock:${name}`, $or: [{ lockedUntil: null }, { lockedUntil: { $lt: now } }] },
      { $set: { lockedUntil: new Date(now.getTime() + ttlMs), lockOwner: owner } },
      { new: true, upsert: true },
    ).lean();
    return r && r.lockOwner === owner ? owner : null;
  } catch (e) {
    if (e.code === 11000) return null;
    throw e;
  }
}

async function releaseLock(name, owner) {
  await AuditChainHead.updateOne({ _id: `lock:${name}`, lockOwner: owner }, { $set: { lockedUntil: null } });
}

async function minimiseIps(now) {
  const cutoff = new Date(now.getTime() - cfg.retention.ipMinimiseAfterDays * DAY);
  const filter = { timestamp: { $lt: cutoff }, 'privacy.ipTruncatedAt': null, 'network.ip': { $exists: true } };
  let modified = 0;
  let ops = [];
  const cursor = AuditLog.find(filter).select('_id network.ip').limit(50000).lean().cursor();
  // eslint-disable-next-line no-restricted-syntax
  for await (const d of cursor) {
    ops.push({
      updateOne: {
        filter: { _id: d._id },
        update: {
          $set: { 'network.ip': truncateIp(d.network && d.network.ip), 'privacy.ipTruncatedAt': now },
          $unset: { 'network.forwardedFor': '', 'geo.city': '', 'geo.region': '', 'geo.lat': '', 'geo.lon': '', 'geo.accuracyKm': '' },
        },
      },
    });
    if (ops.length >= BATCH) {
      // eslint-disable-next-line no-await-in-loop
      modified += (await AuditLog.collection.bulkWrite(ops, { ordered: false })).modifiedCount;
      ops = [];
    }
  }
  if (ops.length) modified += (await AuditLog.collection.bulkWrite(ops, { ordered: false })).modifiedCount;
  return modified;
}

async function purgeExpired(now) {
  const summary = {};
  for (const [category, days] of Object.entries(cfg.retention.days)) {
    const cutoff = new Date(now.getTime() - days * DAY);
    const filter = { category, timestamp: { $lt: cutoff }, 'retention.legalHold': { $ne: true } };
    let purged = 0;
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const batch = await AuditLog.find(filter).sort({ seq: 1 }).limit(BATCH).select('_id chainKey seq eventId integrity.hash category timestamp').lean();
      if (!batch.length) break;
      const tombs = batch.filter((b) => b.seq != null).map((b) => ({
        chainKey: b.chainKey, seq: b.seq, eventId: b.eventId, hash: b.integrity && b.integrity.hash, reason: 'retention', category: b.category, eventTimestamp: b.timestamp, createdAt: now,
      }));
      if (tombs.length) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await AuditTombstone.collection.insertMany(tombs, { ordered: false });
        } catch (e) {
          if (!(e.code === 11000 || (e.writeErrors && e.writeErrors.every((w) => w.code === 11000)))) throw e;
        }
      }
      // eslint-disable-next-line no-await-in-loop
      const r = await AuditLog.collection.deleteMany({ _id: { $in: batch.map((b) => b._id) } });
      purged += r.deletedCount;
      if (batch.length < BATCH) break;
    }
    if (purged) summary[category] = purged;
  }
  return summary;
}

async function runRetention({ now = new Date(), verify = true } = {}) {
  const owner = await acquireLock('retention', 2 * 3600000);
  if (!owner) return { skipped: true, reason: 'Another instance is running retention' };
  const started = Date.now();
  try {
    const ipsMinimised = await minimiseIps(now);
    const purged = await purgeExpired(now);
    const totalPurged = Object.values(purged).reduce((a, b) => a + b, 0);

    let verification = null;
    if (verify) {
      const head = await AuditChainHead.findById(cfg.chainKey).lean();
      verification = await auditService.verifyIntegrity({ fromSeq: ((head && head.lastVerifiedSeq) || 0) + 1, limit: 200000 });
    }

    const result = {
      ipsMinimised, purged, totalPurged, durationMs: Date.now() - started,
      verification: verification && { ok: verification.ok, checked: verification.checked, tampered: verification.tampered.length, missing: verification.missing.length },
    };
    await auditService.record({
      action: 'audit.retention_completed',
      category: 'privacy',
      severity: 'info',
      module: 'Audit & Compliance',
      actor: systemActor('audit-retention'),
      source: 'system',
      markHandled: false,
      description: `Retention run: ${ipsMinimised} IP address(es) minimised, ${totalPurged} expired event(s) purged`,
      metadata: result,
    });
    return result;
  } finally {
    await releaseLock('retention', owner);
  }
}

/** Place or lift a legal hold so matching events are never purged. */
async function setLegalHold({ userId, from, to, category, hold = true, reason }, actorUser) {
  const filter = {};
  if (userId) {
    if (!mongoose.isValidObjectId(userId)) throw new Error('Invalid userId');
    filter.$or = [{ 'actor.userId': new mongoose.Types.ObjectId(String(userId)) }, { 'target.id': String(userId) }];
  }
  if (category) filter.category = category;
  if (from || to) {
    filter.timestamp = {};
    if (from) filter.timestamp.$gte = new Date(from);
    if (to) filter.timestamp.$lte = new Date(to);
  }
  if (!Object.keys(filter).length) throw new Error('A legal hold needs at least one filter (userId, category or date range)');
  const update = hold
    ? { $set: { 'retention.legalHold': true, 'retention.legalHoldReason': String(reason).slice(0, 500) } }
    : { $set: { 'retention.legalHold': false }, $unset: { 'retention.legalHoldReason': '' } };
  const r = await AuditLog.collection.updateMany(filter, update);
  await auditService.record({
    action: hold ? 'privacy.legal_hold_applied' : 'privacy.legal_hold_released',
    category: 'privacy',
    severity: 'high',
    module: 'Audit & Compliance',
    description: `${displayName(actorUser)} ${hold ? 'placed' : 'released'} a legal hold on ${r.modifiedCount} audit event(s)`,
    metadata: { filter: { userId, from, to, category }, matched: r.matchedCount, modified: r.modifiedCount, reason },
  });
  return { matched: r.matchedCount, modified: r.modifiedCount };
}

/**
 * GDPR erasure for the audit trail. Audit records are retained under Art. 17(3)(b)/(e)
 * (legal obligations, legal claims) but the person's identity is replaced with a stable pseudonym,
 * their IPs and devices removed, and their sign-in profile deleted.
 * Requires MongoDB 4.4+ ($replaceAll in update pipelines).
 */
async function pseudonymizeSubject(userId, { reason }, actorUser) {
  if (!mongoose.isValidObjectId(userId)) throw new Error('Invalid userId');
  const oid = new mongoose.Types.ObjectId(String(userId));
  const User = mongoose.models.User;
  const subject = User ? await User.findById(oid).lean() : null;
  const alias = `Erased user ${crypto.createHash('sha256').update(String(userId)).digest('hex').slice(0, 8)}`;
  const needles = [...new Set([
    subject && subject.email,
    subject && displayName(subject),
    subject && subject.name,
    subject && `${subject.firstname || ''} ${subject.lastname || ''}`.trim(),
  ].filter((s) => s && String(s).length >= 3))].sort((a, b) => b.length - a.length);

  const replaced = (field) => needles.reduce(
    (expr, n) => ({ $replaceAll: { input: expr, find: n, replacement: alias } }),
    { $ifNull: [`$${field}`, ''] },
  );
  const now = new Date();

  const asActor = await AuditLog.collection.updateMany({ 'actor.userId': oid }, [
    {
      $set: {
        'actor.name': alias,
        'actor.email': null,
        description: replaced('description'),
        'target.label': replaced('target.label'),
        'network.ip': '[erased]',
        'privacy.pseudonymizedAt': now,
        'privacy.ipTruncatedAt': now,
      },
    },
    { $unset: ['network.forwardedFor', 'network.userAgent', 'geo.city', 'geo.region', 'geo.lat', 'geo.lon', 'geo.accuracyKm'] },
  ]);

  const asTarget = needles.length ? await AuditLog.collection.updateMany(
    { 'actor.userId': { $ne: oid }, $or: [{ 'target.id': String(userId) }, { description: { $regex: needles.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') } }] },
    [{ $set: { description: replaced('description'), 'target.label': replaced('target.label'), 'privacy.pseudonymizedAt': now } }],
  ) : { modifiedCount: 0 };

  await SecurityAlert.collection.updateMany({ user: oid }, { $set: { 'userSnapshot.name': alias, 'userSnapshot.email': null } });
  await UserLoginProfile.deleteOne({ user: oid });

  await auditService.record({
    action: 'privacy.subject_pseudonymized',
    category: 'privacy',
    severity: 'high',
    module: 'Audit & Compliance',
    description: `${displayName(actorUser)} pseudonymised audit data for data subject ${userId} as "${alias}"`,
    target: { type: 'User', id: String(userId), label: alias },
    metadata: { reason: String(reason || '').slice(0, 500), eventsAsActor: asActor.modifiedCount, eventsAsSubject: asTarget.modifiedCount },
  });
  return { alias, eventsAsActor: asActor.modifiedCount, eventsAsSubject: asTarget.modifiedCount };
}

let timers = [];
function startScheduler() {
  if (!cfg.retention.schedulerEnabled || timers.length) return;
  const run = () => auditContext.runAsSystem('audit-retention', () => runRetention())
    .then((r) => logger.info && logger.info('[audit] retention run', JSON.stringify(r)))
    .catch((e) => logger.error('[audit] retention run failed', e.message));
  timers = [setTimeout(run, 5 * 60000), setInterval(run, DAY)];
  timers.forEach((t) => t.unref && t.unref());
}

function stopScheduler() {
  timers.forEach((t) => clearTimeout(t));
  timers = [];
}

module.exports = { runRetention, setLegalHold, pseudonymizeSubject, startScheduler, stopScheduler, minimiseIps, purgeExpired };
