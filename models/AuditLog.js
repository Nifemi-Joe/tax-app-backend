/**
 * @file AuditLog.js
 * @description Immutable, tamper-evident audit event store.
 *
 * ISO/IEC 27001:2022  A.8.15 Logging, A.5.33 Protection of records, A.8.17 Clock sync (UTC)
 * UK/EU GDPR          Art. 5(1)(f) integrity, Art. 5(2) accountability, Art. 30/32
 *
 * Design:
 *  - Append-only. Every Mongoose update/delete path is blocked. Lawful retention purges and
 *    pseudonymisation go through the retention service using the raw driver, leave tombstones
 *    and are themselves audited.
 *  - Each event gets a monotonic `seq` and an HMAC seal (see utils/auditIntegrity.js).
 *  - Backwards compatible with the old shapes:
 *      AuditLog.create({ userId, userName, action, module, details, ipAddress })
 *      AuditLog.createLog({ user, action, resource, details, ip, userAgent, severity, status, ... })
 *  - Stored in a NEW collection (`audit_events`) so the old collection's 1-year TTL index and
 *    action enum (which silently rejected most events) no longer apply.
 */

'use strict';

const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
const cfg = require('../config/auditConfig');
const AuditChainHead = require('./AuditChainHead');
const AuditTombstone = require('./AuditTombstone');
const auditContext = require('../utils/auditContext');
const { seal } = require('../utils/auditIntegrity');
const { normalizeIp } = require('../utils/clientIp');
const { normalizeAction, inferCategory, inferSeverity } = require('../utils/auditTaxonomy');
const {
  actorFromUser, systemActor, networkFromRequest, requestInfo, roleGroupOf, asObjectIdString, maskEmail,
} = require('../utils/auditActor');
const geoIp = require('../services/geoIpService');

const { Schema } = mongoose;
const { Mixed, ObjectId } = Schema.Types;

const actorSchema = new Schema({
  type: { type: String, enum: ['user', 'system', 'anonymous', 'service'] },
  userId: { type: ObjectId, ref: 'User', default: null },
  name: { type: String, trim: true, maxlength: 200 },
  email: { type: String, trim: true, lowercase: true, maxlength: 254 },
  role: { type: String, trim: true, maxlength: 60 },
  roleGroup: { type: String, enum: cfg.ROLE_GROUP_VALUES },
  companyId: { type: ObjectId, default: null },
  impersonatorId: { type: ObjectId, default: null },
}, { _id: false });

const targetSchema = new Schema({
  type: { type: String, trim: true, maxlength: 80 },
  id: { type: String, trim: true, maxlength: 120 },
  label: { type: String, trim: true, maxlength: 300 },
  ownerUserId: { type: ObjectId, default: null },
}, { _id: false });

const changeSchema = new Schema({
  field: { type: String, maxlength: 200 },
  from: { type: Mixed },
  to: { type: Mixed },
}, { _id: false });

const networkSchema = new Schema({
  ip: { type: String, trim: true, maxlength: 64 },
  ipVersion: { type: Number },
  isPrivate: { type: Boolean },
  forwardedFor: { type: [String], default: undefined },
  userAgent: { type: String, maxlength: 512 },
  browser: { type: String, maxlength: 80 },
  os: { type: String, maxlength: 80 },
  device: { type: String, maxlength: 40 },
  deviceModel: { type: String, maxlength: 120 },
  isMobile: { type: Boolean },
  isBot: { type: Boolean },
  deviceFingerprint: { type: String, maxlength: 64 },
}, { _id: false });

const geoSchema = new Schema({
  countryCode: { type: String, uppercase: true, maxlength: 2 },
  country: { type: String, maxlength: 100 },
  region: { type: String, maxlength: 100 },
  city: { type: String, maxlength: 100 },
  lat: { type: Number },
  lon: { type: Number },
  timezone: { type: String, maxlength: 64 },
  accuracyKm: { type: Number },
  eu: { type: Boolean },
  source: { type: String, maxlength: 20 },
}, { _id: false });

const requestSchema = new Schema({
  method: { type: String, maxlength: 10 },
  path: { type: String, maxlength: 300 },
  route: { type: String, maxlength: 300 },
  statusCode: { type: Number },
  durationMs: { type: Number },
  requestId: { type: String, maxlength: 128 },
  correlationId: { type: String, maxlength: 128 },
}, { _id: false });

const auditLogSchema = new Schema({
  eventId: { type: String, default: () => randomUUID(), immutable: true },
  timestamp: { type: Date, default: Date.now, immutable: true },
  chainKey: { type: String },
  seq: { type: Number },

  category: { type: String, enum: cfg.CATEGORIES },
  action: { type: String, required: [true, 'Action is required'], maxlength: 120 },
  module: { type: String, trim: true, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 2000 },
  outcome: { type: String, enum: cfg.OUTCOMES, default: 'success' },
  severity: { type: String, enum: cfg.SEVERITIES },
  source: { type: String, enum: cfg.SOURCES, default: 'application' },

  actor: { type: actorSchema, default: () => ({}) },
  target: { type: targetSchema },
  changes: { type: [changeSchema], default: undefined },
  request: { type: requestSchema },
  network: { type: networkSchema },
  geo: { type: geoSchema },
  sessionId: { type: String, maxlength: 128 },
  metadata: { type: Mixed },
  risk: {
    score: { type: Number, min: 0, max: 100 },
    reasons: { type: [String], default: undefined },
  },
  tags: { type: [String], default: undefined },

  privacy: {
    containsPersonalData: { type: Boolean, default: true },
    lawfulBasis: { type: String, default: 'legitimate_interests' }, // GDPR Art. 6(1)(f), Recital 49
    ipTruncatedAt: { type: Date, default: null },
    pseudonymizedAt: { type: Date, default: null },
  },
  retention: {
    policy: { type: String },
    retainUntil: { type: Date },
    legalHold: { type: Boolean, default: false },
    legalHoldReason: { type: String, maxlength: 500 },
  },
  integrity: {
    alg: { type: String },
    keyId: { type: String },
    hash: { type: String },
    identityDigest: { type: String },
    networkDigest: { type: String },
  },

  // ---- Legacy input fields: accepted for backwards compatibility, mapped in pre('validate') and
  // never persisted. ----
  user: { type: Mixed },
  userId: { type: Mixed },
  userName: { type: String },
  details: { type: String },
  ipAddress: { type: String },
  ip: { type: String },
  userAgent: { type: String },
  resource: { type: String },
  status: { type: String },
  targetUser: { type: Mixed },
  targetResource: { type: String },
  endpoint: { type: String },
  method: { type: String },
  statusCode: { type: Number },
  errorMessage: { type: String },
  duration: { type: Number },
  sensitive: { type: Boolean },
  location: { type: String },
}, {
  collection: 'audit_events',
  versionKey: false,
  minimize: true,
  strict: true,
});

const LEGACY_PATHS = ['user', 'userId', 'userName', 'details', 'ipAddress', 'ip', 'userAgent', 'resource', 'status',
  'targetUser', 'targetResource', 'endpoint', 'method', 'statusCode', 'errorMessage', 'duration', 'sensitive', 'location'];

// ============================================================ INDEXES (no TTL – retention is policy-driven)
auditLogSchema.index({ eventId: 1 }, { unique: true });
auditLogSchema.index({ chainKey: 1, seq: 1 }, { unique: true, partialFilterExpression: { seq: { $exists: true } } });
auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ 'actor.userId': 1, timestamp: -1 });
auditLogSchema.index({ 'actor.roleGroup': 1, timestamp: -1 });
auditLogSchema.index({ 'actor.companyId': 1, timestamp: -1 });
auditLogSchema.index({ category: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ outcome: 1, severity: 1, timestamp: -1 });
auditLogSchema.index({ 'network.ip': 1, timestamp: -1 });
auditLogSchema.index({ 'geo.countryCode': 1, timestamp: -1 });
auditLogSchema.index({ 'target.type': 1, 'target.id': 1, timestamp: -1 });
auditLogSchema.index({ 'request.requestId': 1 });
auditLogSchema.index({ category: 1, 'retention.legalHold': 1, timestamp: 1 });
auditLogSchema.index(
  { description: 'text', action: 'text', module: 'text', 'actor.name': 'text', 'target.label': 'text' },
  { name: 'audit_text', weights: { action: 5, 'actor.name': 4, 'target.label': 3, module: 2, description: 1 } },
);

// ============================================================ NORMALISATION
function normalizeLegacy(doc) {
  const g = (p) => doc.get(p);
  const legacyUser = g('user') || g('userId');
  const legacyUserId = asObjectIdString(legacyUser);
  if (legacyUserId && !(doc.actor && doc.actor.userId)) doc.set('actor.userId', legacyUserId);
  if (g('userName') && !(doc.actor && doc.actor.name)) doc.set('actor.name', g('userName'));
  if (!doc.description && g('details')) doc.description = g('details');
  // Inside a request the server-derived IP (req.ip) is authoritative; a caller-supplied IP is only
  // used for background jobs and kept as "reportedIp" otherwise.
  const legacyIp = normalizeIp(g('ipAddress') || g('ip'));
  const ctx = auditContext.get();
  if (legacyIp && !(doc.network && doc.network.ip)) {
    if (ctx && ctx.req) doc.metadata = { ...(doc.metadata || {}), reportedIp: legacyIp };
    else doc.set('network.ip', legacyIp);
  }
  if (g('userAgent') && !(doc.network && doc.network.userAgent)) doc.set('network.userAgent', String(g('userAgent')).slice(0, 512));
  if (!doc.module && g('resource')) doc.module = g('resource');
  const st = g('status');
  if (st && doc.outcome === 'success') doc.outcome = st === 'failed' ? 'failure' : st === 'denied' ? 'denied' : 'success';
  const tu = asObjectIdString(g('targetUser'));
  if ((tu || g('targetResource')) && !doc.target) doc.target = { type: tu ? 'User' : 'resource', id: tu || undefined, label: g('targetResource') || undefined };
  if (g('endpoint') || g('method') || g('statusCode') || g('duration')) {
    doc.request = {
      ...(doc.request ? doc.request.toObject() : {}),
      path: (doc.request && doc.request.path) || g('endpoint'),
      method: (doc.request && doc.request.method) || g('method'),
      statusCode: (doc.request && doc.request.statusCode) || g('statusCode'),
      durationMs: (doc.request && doc.request.durationMs) || g('duration'),
    };
  }
  if (g('errorMessage') || g('location')) {
    doc.metadata = { ...(doc.metadata || {}), ...(g('errorMessage') ? { errorMessage: g('errorMessage') } : {}), ...(g('location') ? { legacyLocation: g('location') } : {}) };
  }
  if (LEGACY_PATHS.some((p) => g(p) !== undefined) && doc.source === 'application') doc.source = 'legacy';
  LEGACY_PATHS.forEach((p) => doc.set(p, undefined));
}

async function lookupUser(userId) {
  const User = mongoose.models.User;
  if (!User) return null;
  try {
    return await User.findById(userId).select('firstname lastname surname name email role companyId company').lean();
  } catch (_) {
    return null;
  }
}

async function enrichFromContext(doc) {
  const ctx = auditContext.get();
  const req = ctx && ctx.req;

  const actor = doc.actor || {};
  if (!actor.type) {
    if (actor.userId) {
      // Legacy/partial actor: the authoritative identity (role, full name) comes from the request
      // user or the User collection – never from free-text fields supplied by the caller.
      const known = req && req.user && String(req.user._id) === String(actor.userId) ? req.user : await lookupUser(actor.userId);
      const partial = Object.fromEntries(Object.entries(actor.toObject ? actor.toObject() : actor).filter(([, v]) => v != null));
      doc.actor = known ? { ...partial, ...actorFromUser(known), type: 'user' } : { ...partial, type: 'user' };
    } else if (ctx && ctx.systemActor) {
      doc.actor = systemActor(ctx.systemActor);
    } else if (req && req.user) {
      doc.actor = actorFromUser(req.user);
    } else {
      doc.set('actor.type', 'anonymous');
    }
  }
  if (!doc.actor.roleGroup) {
    const t = doc.actor.type;
    doc.set('actor.roleGroup', t === 'system' || t === 'service' ? 'system' : t === 'anonymous' ? 'anonymous' : roleGroupOf(doc.actor.role));
  }
  if (doc.actor.type === 'anonymous' && doc.actor.name && doc.actor.name.includes('@') && !doc.actor.name.includes('***')) {
    doc.set('actor.name', maskEmail(doc.actor.name));
  }

  if (req && !(doc.network && doc.network.ip)) {
    const n = networkFromRequest(req);
    doc.network = { ...n, ...(doc.network ? Object.fromEntries(Object.entries(doc.network.toObject()).filter(([, v]) => v != null)) : {}) };
  }
  if (doc.network && doc.network.ip && !(doc.geo && doc.geo.countryCode)) doc.geo = geoIp.lookup(doc.network.ip);
  if (req && !(doc.request && doc.request.requestId)) {
    doc.request = { ...requestInfo(req, ctx), ...(doc.request ? Object.fromEntries(Object.entries(doc.request.toObject()).filter(([, v]) => v != null)) : {}) };
  } else if (ctx && ctx.requestId && !(doc.request && doc.request.requestId)) {
    doc.set('request.requestId', ctx.requestId);
  }
  if (!doc.sessionId && ctx && ctx.sessionId) doc.sessionId = String(ctx.sessionId);
}

function applyDefaults(doc) {
  doc.action = normalizeAction(doc.action);
  if (!doc.category) doc.category = inferCategory(doc.action, doc.module);
  if (!doc.severity) doc.severity = inferSeverity({ category: doc.category, outcome: doc.outcome, action: doc.action });
  if (!doc.retention || !doc.retention.policy) doc.set('retention.policy', doc.category);
  const days = cfg.retention.days[doc.retention.policy] || cfg.retention.days[doc.category] || 365;
  if (!doc.retention.retainUntil) doc.set('retention.retainUntil', new Date(doc.timestamp.getTime() + days * 86400000));
}

auditLogSchema.pre('validate', async function preValidate() {
  if (!this.isNew) return;
  normalizeLegacy(this);
  await enrichFromContext(this);
  applyDefaults(this);
});

// ============================================================ SEALING
async function nextSeq(chainKey) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const head = await AuditChainHead.findOneAndUpdate({ _id: chainKey }, { $inc: { seq: 1 } }, { new: true, upsert: true }).lean();
      return head.seq;
    } catch (e) {
      if (e.code !== 11000 || attempt === 2) throw e;
    }
  }
  throw new Error('Unable to allocate audit sequence');
}

auditLogSchema.pre('save', async function preSave() {
  if (!this.isNew) throw new Error('Audit events are immutable and cannot be modified');
  this.chainKey = cfg.chainKey;
  this.seq = await nextSeq(this.chainKey);
  this.integrity = seal(this.toObject({ depopulate: true, virtuals: false, getters: false, versionKey: false }));
});

auditLogSchema.post('save', function postSaveError(error, doc, next) {
  if (error && doc && doc.isNew && doc.seq) {
    AuditTombstone.create({ chainKey: doc.chainKey, seq: doc.seq, eventId: doc.eventId, reason: 'write_failed', category: doc.category, eventTimestamp: doc.timestamp })
      .catch(() => {});
  }
  next(error);
});

// ============================================================ IMMUTABILITY
const immutableError = () => new Error('Audit events are append-only. Use the audit retention service for lawful purging.');
['updateOne', 'deleteOne'].forEach((op) => {
  auditLogSchema.pre(op, { document: true, query: true }, function block(next) { next(immutableError()); });
});
['updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne', 'deleteMany', 'findOneAndDelete', 'findOneAndRemove', 'remove']
  .forEach((op) => {
    try {
      auditLogSchema.pre(op, function block(next) { next(immutableError()); });
    } catch (_) { /* op not supported in this Mongoose version */ }
  });
auditLogSchema.pre('insertMany', function block(next) { next(new Error('Use AuditLog.create() so each event is sealed')); });

// ============================================================ STATICS (backwards compatible)
auditLogSchema.statics.createLog = function createLog(data) {
  return this.create(data);
};

auditLogSchema.statics.getUserLogs = function getUserLogs(userId, options = {}) {
  const { limit = 50, skip = 0, action, category, severity, outcome, startDate, endDate } = options;
  const q = { 'actor.userId': userId };
  if (action) q.action = action;
  if (category) q.category = category;
  if (severity) q.severity = severity;
  if (outcome) q.outcome = outcome;
  if (startDate || endDate) {
    q.timestamp = {};
    if (startDate) q.timestamp.$gte = new Date(startDate);
    if (endDate) q.timestamp.$lte = new Date(endDate);
  }
  return this.find(q).sort({ timestamp: -1 }).skip(Number(skip)).limit(Number(limit)).select('-integrity');
};

auditLogSchema.statics.getSecurityEvents = function getSecurityEvents(userId, limit = 20) {
  return this.find({ 'actor.userId': userId, category: { $in: ['authentication', 'security'] } })
    .sort({ timestamp: -1 }).limit(Number(limit)).select('-integrity');
};

auditLogSchema.statics.getCriticalLogs = function getCriticalLogs(limit = 50) {
  return this.find({ severity: 'critical' }).sort({ timestamp: -1 }).limit(Number(limit)).select('-integrity');
};

auditLogSchema.statics.cleanupOldLogs = function cleanupOldLogs() {
  // eslint-disable-next-line global-require
  return require('../services/auditRetentionService').runRetention();
};

module.exports = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);
