/**
 * @file auditService.js
 * @description Single entry point for writing, diffing, verifying and replaying audit events.
 *
 *   const audit = require('../services/auditService');
 *   await audit.record({
 *     action: 'invoice.approved', module: 'Revenue Management',
 *     description: `Approved invoice ${inv.invoiceNo}`,
 *     target: { type: 'Revenue', id: inv._id, label: inv.invoiceNo },
 *     changes: audit.diff(before, after),
 *   });
 *
 * Actor, IP, geo-location, device and request id are filled automatically from the request
 * context. record() never throws: if the database is unavailable the event is written to an
 * append-only fallback file and replayed on next start (no silent loss of audit evidence).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const AuditLog = require('../models/AuditLog');
const AuditChainHead = require('../models/AuditChainHead');
const AuditTombstone = require('../models/AuditTombstone');
const auditContext = require('../utils/auditContext');
const cfg = require('../config/auditConfig');
const { redact, isSensitiveKey } = require('../utils/redact');
const { canonical, verify } = require('../utils/auditIntegrity');
const {
  actorFromUser, systemActor, networkFromRequest, requestInfo, displayName, asObjectIdString,
} = require('../utils/auditActor');
const { normalizeAction, inferCategory, inferSeverity, toSnake } = require('../utils/auditTaxonomy');
const geoIp = require('./geoIpService');

let logger;
try {
  // eslint-disable-next-line global-require
  logger = require('../utils/logger');
} catch (_) {
  logger = console;
}

const bus = new EventEmitter();
bus.setMaxListeners(50);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ============================================================ RECORD
function cleanTarget(t) {
  if (!t) return undefined;
  return {
    type: t.type ? String(t.type).slice(0, 80) : undefined,
    id: t.id != null ? String(t.id).slice(0, 120) : undefined,
    label: t.label != null ? String(t.label).slice(0, 300) : undefined,
    ownerUserId: asObjectIdString(t.ownerUserId) || undefined,
  };
}

function cleanChanges(changes) {
  if (!Array.isArray(changes) || !changes.length) return undefined;
  return changes.slice(0, cfg.maxChanges).map((c) => {
    const field = String(c.field || '').slice(0, 200);
    const leaf = field.split('.').pop();
    if (isSensitiveKey(leaf)) return { field, from: '[REDACTED]', to: '[REDACTED]' };
    return { field, from: redact(c.from, 1, leaf), to: redact(c.to, 1, leaf) };
  });
}

function fallbackPath() {
  const day = new Date().toISOString().slice(0, 10);
  return path.resolve(cfg.fallbackDir, `audit-fallback-${day}.ndjson`);
}

function writeFallback(doc, error) {
  try {
    fs.mkdirSync(path.resolve(cfg.fallbackDir), { recursive: true });
    fs.appendFileSync(fallbackPath(), `${JSON.stringify({ failedAt: new Date().toISOString(), error: error && error.message, event: doc })}\n`, { mode: 0o600 });
  } catch (e) {
    logger.error('[audit] CRITICAL: could not write audit fallback file', e.message);
  }
}

/**
 * Record an audit event.
 * @param {object} input
 * @param {string} input.action        e.g. 'invoice.approved' (normalised to lower snake/dot case)
 * @param {string} [input.category]    authentication|authorization|data_access|data_change|administration|security|privacy|system
 * @param {string} [input.module]      Human module name, e.g. 'Revenue Management'
 * @param {string} [input.description] Human sentence
 * @param {string} [input.outcome]     success|failure|denied
 * @param {string} [input.severity]    info|low|medium|high|critical
 * @param {object} [input.user]        User document acting (defaults to req.user from context)
 * @param {object} [input.actor]       Pre-built actor (overrides user)
 * @param {object} [input.target]      { type, id, label, ownerUserId }
 * @param {Array}  [input.changes]     [{ field, from, to }] – use diff()
 * @param {object} [input.metadata]    Extra data (redacted automatically)
 * @param {object} [input.req]         Express request (optional – taken from context)
 * @param {boolean}[input.markHandled] default true – suppresses the generic HTTP event for this request
 */
async function record(input = {}) {
  const ctx = auditContext.get();
  const req = input.req || (ctx && ctx.req);
  const action = normalizeAction(input.action);
  const outcome = cfg.OUTCOMES.includes(input.outcome) ? input.outcome : 'success';
  const category = cfg.CATEGORIES.includes(input.category) ? input.category : inferCategory(action, input.module);
  const severity = cfg.SEVERITIES.includes(input.severity) ? input.severity : inferSeverity({ category, outcome, action });

  let { actor } = input;
  if (!actor && input.user) actor = actorFromUser(input.user);
  if (!actor && ctx && ctx.systemActor && !(req && req.user)) actor = systemActor(ctx.systemActor);

  const network = input.network || (req ? networkFromRequest(req) : undefined);
  const geo = input.geo || (network && network.ip ? geoIp.lookup(network.ip) : undefined);

  const doc = {
    timestamp: input.timestamp instanceof Date ? input.timestamp : new Date(),
    category,
    action,
    module: input.module ? String(input.module).slice(0, 120) : undefined,
    description: input.description ? String(input.description).slice(0, 2000) : undefined,
    outcome,
    severity,
    source: cfg.SOURCES.includes(input.source) ? input.source : 'application',
    actor,
    target: cleanTarget(input.target),
    changes: cleanChanges(input.changes),
    request: req ? { ...requestInfo(req, ctx), ...(input.request || {}) } : input.request,
    network,
    geo,
    sessionId: input.sessionId ? String(input.sessionId) : (ctx && ctx.sessionId ? String(ctx.sessionId) : undefined),
    metadata: input.metadata ? redact(input.metadata) : undefined,
    risk: input.risk,
    tags: Array.isArray(input.tags) ? input.tags.slice(0, 20).map(String) : undefined,
    privacy: { containsPersonalData: input.containsPersonalData !== false, lawfulBasis: input.lawfulBasis || 'legitimate_interests' },
  };

  if (ctx && input.markHandled !== false) ctx.handled = true;

  let saved = null;
  let lastError = null;
  let instance = null;
  for (let attempt = 0; attempt < 3 && !saved; attempt += 1) {
    try {
      if (!instance) instance = new AuditLog(doc);
      // eslint-disable-next-line no-await-in-loop
      await instance.save();
      saved = instance;
    } catch (err) {
      lastError = err;
      if (err && err.name === 'ValidationError') break;
      // eslint-disable-next-line no-await-in-loop
      await sleep(100 * (attempt + 1));
    }
  }

  if (!saved) {
    logger.error(`[audit] failed to persist event "${action}": ${lastError && lastError.message}`);
    let snapshot = doc;
    try {
      snapshot = instance ? instance.toObject({ depopulate: true }) : doc;
      delete snapshot._id; delete snapshot.seq; delete snapshot.chainKey; delete snapshot.integrity;
    } catch (_) { snapshot = doc; }
    writeFallback(snapshot, lastError);
    bus.emit('audit:write_failed', { event: doc, error: lastError });
    return null;
  }

  const plain = saved.toObject();
  setImmediate(() => bus.emit('audit:event', plain));
  return saved;
}

/** Fire-and-forget variant – never awaits, never throws. */
function recordAsync(input) {
  record(input).catch((e) => logger.error('[audit] recordAsync', e.message));
}

// ============================================================ DIFF
function flatten(obj, prefix = '', out = {}, depth = 0) {
  const leaf = obj === null || obj === undefined || typeof obj !== 'object' || obj instanceof Date
    || obj._bsontype || Buffer.isBuffer(obj) || Array.isArray(obj) || depth >= 4;
  if (leaf) {
    if (prefix) out[prefix] = obj;
    return out;
  }
  const keys = Object.keys(obj);
  if (!keys.length && prefix) {
    out[prefix] = obj;
    return out;
  }
  keys.forEach((k) => flatten(obj[k], prefix ? `${prefix}.${k}` : k, out, depth + 1));
  return out;
}

/** Field-level diff between two plain objects. Sensitive fields are reported as changed but redacted. */
function diff(before, after, { ignore = [] } = {}) {
  const ign = new Set([...cfg.trail.ignoreFields, ...ignore, '_id']);
  const a = flatten(before && before.toObject ? before.toObject({ depopulate: true }) : before || {});
  const b = flatten(after && after.toObject ? after.toObject({ depopulate: true }) : after || {});
  const changes = [];
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  for (const k of keys) {
    const top = k.split('.')[0];
    if (ign.has(k) || ign.has(top)) continue;
    if (canonical(a[k]) === canonical(b[k])) continue;
    const leafKey = k.split('.').pop();
    changes.push(isSensitiveKey(leafKey) ? { field: k, from: '[REDACTED]', to: '[REDACTED]' } : { field: k, from: a[k], to: b[k] });
    if (changes.length >= cfg.maxChanges) break;
  }
  return changes;
}

// ============================================================ DATA TRAIL (used by the Mongoose plugin)
const LABEL_FIELDS = ['invoiceNo', 'assetId', 'whtId', 'taxId', 'referenceNumber', 'accountName', 'title', 'name', 'companyName', 'email', 'description'];

function labelOf(doc) {
  if (!doc) return undefined;
  if (doc.firstname || doc.lastname) return `${doc.firstname || ''} ${doc.lastname || doc.surname || ''}`.trim();
  for (const f of LABEL_FIELDS) {
    const v = doc[f];
    if (v) return String(Array.isArray(v) ? v[0] : v).slice(0, 120);
  }
  return undefined;
}

function ownerOf(doc) {
  if (!doc) return undefined;
  return asObjectIdString(doc.createdBy) || asObjectIdString(doc.userId) || asObjectIdString(doc.user) || undefined;
}

function summarize(doc) {
  if (!doc) return undefined;
  const out = {};
  Object.keys(doc).slice(0, 60).forEach((k) => {
    if (cfg.trail.ignoreFields.includes(k)) return;
    out[k] = doc[k];
  });
  return redact(out);
}

const SOFT_DELETE_FIELDS = ['status', 'recordStatus', 'deleted', 'isDeleted'];
const PRIVILEGE_FIELDS = ['role', 'roles', 'permissions', 'isAdmin', 'accessLevel'];

async function recordDataTrail({ modelName, operation, before, after, bulk = false, truncated = false }) {
  const ctx = auditContext.get();
  if (ctx && ctx.suppressTrail) return null;
  const slug = toSnake(modelName);
  const doc = after || before;
  const id = doc && doc._id ? String(doc._id) : undefined;
  const label = labelOf(doc);
  const who = ctx && ctx.req && ctx.req.user ? displayName(ctx.req.user) : (ctx && ctx.systemActor) || 'System';

  let action;
  let category = 'data_change';
  let severity;
  let changes;
  const metadata = { bulk: bulk || undefined, truncated: truncated || undefined };

  if (operation === 'create') {
    action = `${slug}.created`;
    metadata.snapshot = summarize(after);
  } else if (operation === 'delete') {
    action = `${slug}.deleted`;
    severity = 'medium';
    metadata.snapshot = summarize(before);
  } else {
    changes = diff(before, after);
    if (!changes.length) return null;
    const fields = changes.map((c) => c.field.split('.')[0]);
    const softDelete = changes.find((c) => SOFT_DELETE_FIELDS.includes(c.field) && (c.to === 'deleted' || c.to === true));
    if (fields.some((f) => PRIVILEGE_FIELDS.includes(f))) {
      action = `${slug}.privilege_changed`;
      category = 'authorization';
      severity = 'high';
    } else if (softDelete) {
      action = `${slug}.soft_deleted`;
      severity = 'medium';
    } else if (fields.includes('status') || fields.includes('lifecycleStatus')) {
      action = `${slug}.status_changed`;
    } else {
      action = `${slug}.updated`;
    }
  }

  const verb = { created: 'created', deleted: 'deleted', soft_deleted: 'deleted', privilege_changed: 'changed privileges on', status_changed: 'changed the status of', updated: 'updated' }[action.split('.').pop()];
  const fieldList = changes && changes.length ? ` (${changes.slice(0, 6).map((c) => c.field).join(', ')}${changes.length > 6 ? '…' : ''})` : '';

  return record({
    action,
    category,
    severity,
    module: modelName,
    source: 'data_trail',
    markHandled: false,
    description: `${who} ${verb} ${modelName}${label ? ` "${label}"` : ''}${fieldList}`,
    target: { type: modelName, id, label, ownerUserId: ownerOf(doc) },
    changes,
    metadata,
  });
}

// ============================================================ INTEGRITY VERIFICATION
async function missingSeqs(chainKey, ranges) {
  const missing = [];
  for (const [a, b] of ranges) {
    if (missing.length >= 500) break;
    // eslint-disable-next-line no-await-in-loop
    const tombCount = await AuditTombstone.countDocuments({ chainKey, seq: { $gte: a, $lte: b } });
    if (tombCount === b - a + 1) continue;
    // eslint-disable-next-line no-await-in-loop
    const tombs = new Set((await AuditTombstone.find({ chainKey, seq: { $gte: a, $lte: b } }).select('seq').lean()).map((t) => t.seq));
    for (let s = a; s <= b && missing.length < 500; s += 1) if (!tombs.has(s)) missing.push(s);
  }
  return missing;
}

/**
 * Verify seals and sequence continuity.
 * @returns {{ok, checked, fromSeq, toSeq, headSeq, tampered, missing, complete}}
 */
async function verifyIntegrity({ fromSeq = 1, limit = 50000, chainKey = cfg.chainKey, recordResult = true } = {}) {
  const start = Math.max(1, Number(fromSeq) || 1);
  const max = Math.min(Math.max(Number(limit) || 50000, 1), 500000);
  const head = await AuditChainHead.findById(chainKey).lean();
  const headSeq = (head && head.seq) || 0;

  const tampered = [];
  const gaps = [];
  let expected = start;
  let lastSeq = start - 1;
  let checked = 0;

  const cursor = AuditLog.find({ chainKey, seq: { $gte: start } }).sort({ seq: 1 }).limit(max).lean().cursor();
  // eslint-disable-next-line no-restricted-syntax
  for await (const ev of cursor) {
    if (ev.seq > expected) gaps.push([expected, ev.seq - 1]);
    const r = verify(ev);
    if (!r.ok && tampered.length < 500) tampered.push({ seq: ev.seq, eventId: ev.eventId, action: ev.action, timestamp: ev.timestamp, reason: r.reason });
    expected = ev.seq + 1;
    lastSeq = ev.seq;
    checked += 1;
  }
  const complete = checked < max;
  if (complete && lastSeq < headSeq) gaps.push([lastSeq + 1, headSeq]);

  let missing = await missingSeqs(chainKey, gaps);
  if (missing.length) {
    // allow in-flight writes to land, then re-check
    await sleep(1500);
    const landed = new Set((await AuditLog.find({ chainKey, seq: { $in: missing } }).select('seq').lean()).map((d) => d.seq));
    const tombs = new Set((await AuditTombstone.find({ chainKey, seq: { $in: missing } }).select('seq').lean()).map((d) => d.seq));
    missing = missing.filter((s) => !landed.has(s) && !tombs.has(s));
  }

  const result = {
    ok: tampered.length === 0 && missing.length === 0,
    checked,
    fromSeq: start,
    toSeq: lastSeq,
    headSeq,
    complete,
    tampered,
    missing,
    verifiedAt: new Date(),
  };

  if (recordResult) {
    await AuditChainHead.updateOne({ _id: chainKey }, {
      $set: { lastVerifiedAt: result.verifiedAt, lastVerifyResult: { ok: result.ok, checked, tampered: tampered.length, missing: missing.length, fromSeq: start, toSeq: lastSeq } },
      ...(result.ok && complete ? { $max: { lastVerifiedSeq: lastSeq } } : {}),
    });
    await record({
      action: result.ok ? 'audit.integrity_verified' : 'audit.integrity_failed',
      category: 'security',
      severity: result.ok ? 'info' : 'critical',
      outcome: result.ok ? 'success' : 'failure',
      module: 'Audit & Compliance',
      description: result.ok
        ? `Audit trail integrity verified for ${checked} events (seq ${start}–${lastSeq})`
        : `AUDIT TRAIL INTEGRITY FAILURE: ${tampered.length} modified, ${missing.length} missing event(s)`,
      metadata: { checked, fromSeq: start, toSeq: lastSeq, headSeq, tampered: tampered.slice(0, 20), missing: missing.slice(0, 50) },
      markHandled: false,
    });
  }
  return result;
}

// ============================================================ FALLBACK REPLAY
async function replayFallback() {
  const dir = path.resolve(cfg.fallbackDir);
  if (!fs.existsSync(dir)) return { replayed: 0 };
  let replayed = 0;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.ndjson'))) {
    const full = path.join(dir, file);
    const lines = fs.readFileSync(full, 'utf8').split('\n').filter(Boolean);
    let failed = 0;
    for (const line of lines) {
      try {
        const { event, failedAt } = JSON.parse(line);
        // eslint-disable-next-line no-await-in-loop
        await AuditLog.create({ ...event, timestamp: new Date(event.timestamp), metadata: { ...(event.metadata || {}), replayedFromFallback: true, originallyFailedAt: failedAt } });
        replayed += 1;
      } catch (_) {
        failed += 1;
      }
    }
    if (!failed) fs.renameSync(full, `${full}.replayed`);
  }
  if (replayed) logger.info(`[audit] replayed ${replayed} event(s) from fallback storage`);
  return { replayed };
}

module.exports = {
  bus, record, recordAsync, diff, recordDataTrail, verifyIntegrity, replayFallback, labelOf,
};
