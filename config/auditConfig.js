/**
 * @file auditConfig.js
 * @description Central configuration for audit logging, retention, privacy and security alerting.
 * Every value can be overridden with an environment variable (see AUDIT_README.md).
 *
 * ISO/IEC 27001:2022  A.8.15 Logging · A.8.16 Monitoring · A.5.33 Protection of records · A.5.34 PII
 * UK/EU GDPR          Art. 5(1)(c) minimisation · 5(1)(e) storage limitation · 5(1)(f) integrity · 32 security
 * NDPA 2023 (Nigeria) Security, accountability and storage-limitation duties
 */

'use strict';

const crypto = require('crypto');

const env = process.env;
const num = (v, d) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d);
const list = (v, d = []) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : d);
const bool = (v, d) => (v === undefined || v === '' ? d : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase()));

let hmacCache = null;

/**
 * HMAC keys used to seal audit events. Resolved lazily so dotenv can load first.
 * AUDIT_HMAC_KEY            current key (min 32 chars recommended)
 * AUDIT_HMAC_KEY_ID         id stored on every event (default k1) – change when rotating
 * AUDIT_HMAC_PREVIOUS_KEYS  "k0:oldkey,k00:olderkey" – kept so old events still verify
 */
function getHmacKeys() {
  if (hmacCache) return hmacCache;
  const currentId = env.AUDIT_HMAC_KEY_ID || 'k1';
  const keys = {};
  if (env.AUDIT_HMAC_KEY) {
    keys[currentId] = Buffer.from(env.AUDIT_HMAC_KEY, 'utf8');
  } else if (env.JWT_SECRET) {
    keys[currentId] = Buffer.from(crypto.hkdfSync('sha256', env.JWT_SECRET, 'gsjx-audit-salt', 'gsjx-audit-hmac-v1', 32));
    // eslint-disable-next-line no-console
    console.warn('[audit] AUDIT_HMAC_KEY is not set – deriving a key from JWT_SECRET. Set a dedicated AUDIT_HMAC_KEY.');
  } else {
    throw new Error('[audit] AUDIT_HMAC_KEY (or JWT_SECRET) must be set before audit events can be sealed');
  }
  for (const pair of list(env.AUDIT_HMAC_PREVIOUS_KEYS)) {
    const i = pair.indexOf(':');
    if (i > 0) keys[pair.slice(0, i)] = Buffer.from(pair.slice(i + 1), 'utf8');
  }
  hmacCache = { currentId, keys };
  return hmacCache;
}

const ROLE_GROUPS = {
  admin: list(env.AUDIT_ADMIN_ROLES, ['superadmin', 'admin']).map((r) => r.toLowerCase()),
  auditor: list(env.AUDIT_AUDITOR_ROLES, ['auditor', 'compliance', 'dpo']).map((r) => r.toLowerCase()),
};

module.exports = {
  getHmacKeys,
  appName: env.APP_NAME || 'Global SJX OS',
  frontendUrl: (env.FRONTEND_URL || '').replace(/\/$/, ''),
  chainKey: env.AUDIT_CHAIN_KEY || 'primary',
  multiTenant: bool(env.AUDIT_MULTI_TENANT, false),
  fallbackDir: env.AUDIT_FALLBACK_DIR || 'logs/audit-fallback',
  maxChanges: num(env.AUDIT_MAX_CHANGES, 200),

  ROLE_GROUPS,
  ROLE_GROUP_VALUES: ['admin', 'auditor', 'user', 'system', 'anonymous'],
  CATEGORIES: ['authentication', 'authorization', 'data_access', 'data_change', 'administration', 'security', 'privacy', 'system'],
  OUTCOMES: ['success', 'failure', 'denied'],
  SEVERITIES: ['info', 'low', 'medium', 'high', 'critical'],
  SOURCES: ['application', 'http', 'data_trail', 'legacy', 'client', 'system'],

  http: {
    logReads: bool(env.AUDIT_LOG_READS, true),
    ignorePaths: [
      /^\/(health|healthz|ready|readyz|metrics|favicon\.ico|robots\.txt)/i,
      /^\/(static|assets|public|uploads)\//i,
      // The audit centre's own self-service reads (access to ORGANISATION logs, exports and
      // user security profiles is still audited).
      /^\/api\/audit\/(meta|me|me\/about|me\/security|me\/alerts|alerts\/summary|integrity\/status)\/?$/i,
      ...list(env.AUDIT_IGNORE_PATHS).map((p) => new RegExp(p, 'i')),
    ],
  },

  trail: {
    enabled: bool(env.AUDIT_DATA_TRAIL, true),
    excludeModels: ['AuditLog', 'AuditChainHead', 'AuditTombstone', 'SecurityAlert', 'UserLoginProfile', 'Session',
      ...list(env.AUDIT_TRAIL_EXCLUDE_MODELS)],
    ignoreFields: ['__v', 'updatedAt', 'lastLogin', 'lastLoginIp', 'lastActivity', 'lastSeen', 'loginCount',
      ...list(env.AUDIT_TRAIL_IGNORE_FIELDS)],
    maxDocsPerBulkOp: num(env.AUDIT_TRAIL_MAX_BULK_DOCS, 200),
  },

  retention: {
    // Days each category is kept. Financial/administrative records follow the 6-year rule
    // (UK HMRC / Nigerian FIRS). Security evidence is kept 2 years, routine access 6 months.
    days: {
      authentication: num(env.AUDIT_RETAIN_AUTH_DAYS, 365),
      authorization: num(env.AUDIT_RETAIN_AUTHZ_DAYS, 365),
      data_access: num(env.AUDIT_RETAIN_ACCESS_DAYS, 180),
      data_change: num(env.AUDIT_RETAIN_CHANGE_DAYS, 2190),
      administration: num(env.AUDIT_RETAIN_ADMIN_DAYS, 2190),
      security: num(env.AUDIT_RETAIN_SECURITY_DAYS, 730),
      privacy: num(env.AUDIT_RETAIN_PRIVACY_DAYS, 2190),
      system: num(env.AUDIT_RETAIN_SYSTEM_DAYS, 365),
    },
    // After this many days IPs are truncated (/24 IPv4, /48 IPv6) and city-level geo removed.
    ipMinimiseAfterDays: num(env.AUDIT_IP_MINIMISE_AFTER_DAYS, 90),
    schedulerEnabled: bool(env.AUDIT_RETENTION_SCHEDULER, true),
  },

  export: {
    maxRows: num(env.AUDIT_EXPORT_MAX_ROWS, 100000),
  },

  alerts: {
    failedLoginThreshold: num(env.SECURITY_FAILED_LOGIN_THRESHOLD, 5),
    failedLoginWindowMin: num(env.SECURITY_FAILED_LOGIN_WINDOW_MIN, 15),
    lockoutMinutes: num(env.SECURITY_LOCKOUT_MINUTES, 15),
    stuffingDistinctAccounts: num(env.SECURITY_STUFFING_DISTINCT_ACCOUNTS, 8),
    impossibleTravelKmh: num(env.SECURITY_IMPOSSIBLE_TRAVEL_KMH, 900),
    minTravelKm: num(env.SECURITY_MIN_TRAVEL_KM, 500),
    trustAfterLogins: num(env.SECURITY_TRUST_AFTER_LOGINS, 3),
    trustAfterHours: num(env.SECURITY_TRUST_AFTER_HOURS, 72),
    highRiskCountries: list(env.SECURITY_HIGH_RISK_COUNTRIES).map((c) => c.toUpperCase()),
    blockImpossibleTravel: bool(env.SECURITY_BLOCK_IMPOSSIBLE_TRAVEL, false),
    blockHighRiskCountries: bool(env.SECURITY_BLOCK_HIGH_RISK_COUNTRIES, false),
    businessHours: {
      enabled: bool(env.SECURITY_BUSINESS_HOURS_ENABLED, true),
      start: num(env.SECURITY_BUSINESS_HOURS_START, 7),
      end: num(env.SECURITY_BUSINESS_HOURS_END, 20),
      timezone: env.SECURITY_BUSINESS_TIMEZONE || 'Africa/Lagos',
      weekendsAreOffHours: bool(env.SECURITY_WEEKENDS_OFF_HOURS, true),
    },
    massExportThreshold: num(env.SECURITY_MASS_EXPORT_THRESHOLD, 1000),
    massDeletionThreshold: num(env.SECURITY_MASS_DELETION_THRESHOLD, 20),
    deniedBurstThreshold: num(env.SECURITY_DENIED_BURST_THRESHOLD, 10),
    burstWindowMin: num(env.SECURITY_BURST_WINDOW_MIN, 10),
    notifyUserMinSeverity: env.SECURITY_NOTIFY_USER_MIN_SEVERITY || 'medium',
    notifyAdminsMinSeverity: env.SECURITY_NOTIFY_ADMINS_MIN_SEVERITY || 'high',
    responseTokenTtlHours: num(env.SECURITY_RESPONSE_TOKEN_TTL_HOURS, 168),
    webhookUrl: env.SECURITY_ALERT_WEBHOOK_URL || '',
    adminEmails: list(env.SECURITY_ALERT_EMAILS),
  },
};
