/**
 * @file redact.js
 * @description Removes secrets and minimises personal data before anything is written to the
 * audit trail (GDPR Art. 5(1)(c) / ISO 27001 A.8.11 data masking).
 */

'use strict';

// Anywhere in the key (passwordHash, refreshToken, clientSecret, x-api-key …)
const SENSITIVE_ANY = /(pass(word|wd|phrase)|secret|token|api[-_]?key|private[-_]?key|cookie|authorization|credential)/i;
// Only at the end of the key (otp, userPin, cardCvv, salt …)
const SENSITIVE_END = /(pwd|otp|cvv|cvc|pin|signature|salt)$/i;
const SENSITIVE_EXACT = new Set(['pass', 'hash', 'passwordhash']);
const NOT_SENSITIVE_SUFFIX = /(At|Date|Enabled|Changed|Count|Expiry|Expires|Type|Required)$/;
const MASK_KEY = /(account[-_]?number|card[-_]?number|bvn|nin|iban|ssn|national[-_]?id|passport[-_]?(no|number))$/i;
const BASE64_DATA_URL = /^data:[\w/+.-]+;base64,/i;
const LONG_BASE64 = /^[A-Za-z0-9+/=\r\n]+$/;

const MAX_STRING = 2000;
const MAX_ARRAY = 50;
const MAX_KEYS = 100;
const MAX_DEPTH = 6;

function isSensitiveKey(key) {
  if (!key) return false;
  const k = String(key);
  if (NOT_SENSITIVE_SUFFIX.test(k)) return false;
  return SENSITIVE_EXACT.has(k.toLowerCase()) || SENSITIVE_ANY.test(k) || SENSITIVE_END.test(k);
}

function maskTail(value) {
  const s = String(value);
  if (s.length <= 4) return '****';
  return `${'*'.repeat(Math.min(s.length - 4, 12))}${s.slice(-4)}`;
}

function redact(value, depth = 0, keyHint = '') {
  if (value === null || value === undefined) return value;
  if (keyHint && isSensitiveKey(keyHint)) return '[REDACTED]';
  if (depth > MAX_DEPTH) return '[max depth]';
  if (Buffer.isBuffer(value)) return `[binary ${value.length} bytes]`;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === 'object' && value._bsontype) return String(value); // ObjectId, Decimal128, Long
  if (typeof value === 'function' || typeof value === 'symbol') return undefined;
  if (typeof value === 'bigint') return value.toString();

  if (Array.isArray(value)) {
    const out = value.slice(0, MAX_ARRAY).map((v) => redact(v, depth + 1, keyHint));
    if (value.length > MAX_ARRAY) out.push(`[+${value.length - MAX_ARRAY} more]`);
    return out;
  }

  if (typeof value === 'object') {
    const src = typeof value.toObject === 'function' ? value.toObject({ depopulate: true }) : value;
    const out = {};
    let n = 0;
    for (const [k, v] of Object.entries(src)) {
      if (k === '__v') continue;
      if (n++ >= MAX_KEYS) { out['…'] = '[truncated keys]'; break; }
      if (isSensitiveKey(k)) { out[k] = '[REDACTED]'; continue; }
      const r = redact(v, depth + 1, k);
      if (r !== undefined) out[k] = r;
    }
    return out;
  }

  if (typeof value === 'string') {
    if (keyHint && MASK_KEY.test(keyHint)) return maskTail(value);
    if (BASE64_DATA_URL.test(value) || (value.length > 512 && LONG_BASE64.test(value))) {
      return `[binary ~${Math.round(value.length * 0.75)} bytes]`;
    }
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…[truncated]` : value;
  }

  if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
  return value;
}

module.exports = { redact, isSensitiveKey, maskTail };
