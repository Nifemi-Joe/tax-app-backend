/**
 * @file auditIntegrity.js
 * @description Tamper-evidence for audit events (ISO 27001 A.5.33 / A.8.15, GDPR Art. 5(1)(f)).
 *
 * Every event gets a monotonic sequence number and an HMAC-SHA256 seal.
 *  - Modified record   -> seal no longer matches
 *  - Deleted record    -> gap in the sequence with no matching tombstone
 *  - Truncated tail    -> chain head counter is ahead of the last stored event
 *
 * Personal data (names, e-mails, IPs, city) is sealed through two separate digests so it can be
 * lawfully minimised or pseudonymised later (GDPR storage limitation / erasure) WITHOUT
 * breaking verification of the rest of the record.
 */

'use strict';

const crypto = require('crypto');
const { getHmacKeys } = require('../config/auditConfig');

function isEmptyNormalized(v) {
  if (v === undefined) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (v && typeof v === 'object') return Object.keys(v).length === 0;
  return false;
}

/** Deterministic, storage-round-trip-safe normalisation (sorted keys, no empties, ids as strings). */
function normalize(v) {
  if (v === null || v === undefined) return undefined;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? undefined : v.toISOString();
  if (typeof v === 'object' && v._bsontype) return String(v);
  if (Buffer.isBuffer(v)) return v.toString('base64');
  if (Array.isArray(v)) return v.map((x) => { const n = normalize(x); return n === undefined ? null : n; });
  if (typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) {
      const n = normalize(v[k]);
      if (!isEmptyNormalized(n)) out[k] = n;
    }
    return out;
  }
  if (typeof v === 'number' && !Number.isFinite(v)) return String(v);
  if (typeof v === 'function' || typeof v === 'symbol') return undefined;
  return v;
}

function canonical(v) {
  const n = normalize(v);
  return n === undefined ? '' : JSON.stringify(n);
}

const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest('hex');

function safeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

function take(obj, key) {
  if (!obj || typeof obj !== 'object') return undefined;
  const v = obj[key];
  delete obj[key];
  return v;
}

function splitForSigning(raw) {
  const o = normalize(raw) || {};
  delete o._id;
  delete o.__v;
  delete o.integrity;
  delete o.privacy;
  if (o.retention) {
    delete o.retention.retainUntil;
    delete o.retention.legalHold;
    delete o.retention.legalHoldReason;
    if (!Object.keys(o.retention).length) delete o.retention;
  }
  const identity = {
    actorName: take(o.actor, 'name'),
    actorEmail: take(o.actor, 'email'),
    description: take(o, 'description'),
    targetLabel: take(o.target, 'label'),
  };
  const network = {
    ip: take(o.network, 'ip'),
    forwardedFor: take(o.network, 'forwardedFor'),
    userAgent: take(o.network, 'userAgent'),
    region: take(o.geo, 'region'),
    city: take(o.geo, 'city'),
    lat: take(o.geo, 'lat'),
    lon: take(o.geo, 'lon'),
    accuracyKm: take(o.geo, 'accuracyKm'),
  };
  ['actor', 'target', 'network', 'geo'].forEach((k) => {
    if (o[k] && typeof o[k] === 'object' && !Object.keys(o[k]).length) delete o[k];
  });
  return { main: o, identity, network };
}

/** Produce the integrity block for a new event (plain object or toObject() output). */
function seal(raw) {
  const { currentId, keys } = getHmacKeys();
  const key = keys[currentId];
  const { main, identity, network } = splitForSigning(raw);
  const identityDigest = hmac(key, canonical(identity));
  const networkDigest = hmac(key, canonical(network));
  const hash = hmac(key, canonical({ ...main, __identity: identityDigest, __network: networkDigest }));
  return { alg: 'HMAC-SHA256', keyId: currentId, hash, identityDigest, networkDigest };
}

/** Verify a stored event (lean object). */
function verify(raw) {
  const integ = raw && raw.integrity;
  if (!integ || !integ.hash) return { ok: false, reason: 'unsealed' };
  const key = getHmacKeys().keys[integ.keyId];
  if (!key) return { ok: false, reason: `unknown_key:${integ.keyId}` };
  const { main, identity, network } = splitForSigning(raw);
  const expected = hmac(key, canonical({ ...main, __identity: integ.identityDigest, __network: integ.networkDigest }));
  if (!safeEqualHex(expected, integ.hash)) return { ok: false, reason: 'record_modified' };
  const privacy = raw.privacy || {};
  if (!privacy.pseudonymizedAt && !safeEqualHex(hmac(key, canonical(identity)), integ.identityDigest)) {
    return { ok: false, reason: 'identity_fields_modified' };
  }
  if (!privacy.pseudonymizedAt && !privacy.ipTruncatedAt && !safeEqualHex(hmac(key, canonical(network)), integ.networkDigest)) {
    return { ok: false, reason: 'network_fields_modified' };
  }
  return { ok: true, identityVerified: !privacy.pseudonymizedAt, networkVerified: !privacy.pseudonymizedAt && !privacy.ipTruncatedAt };
}

/** Keyed pseudonym – correlate e.g. a login identifier across events without storing it. */
function pseudonymousId(value) {
  const { currentId, keys } = getHmacKeys();
  return hmac(keys[currentId], `pid:${String(value || '').trim().toLowerCase()}`).slice(0, 24);
}

module.exports = { normalize, canonical, seal, verify, pseudonymousId };
