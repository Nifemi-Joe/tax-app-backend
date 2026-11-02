/**
 * @file auditMiddleware.js
 * @description HTTP-level audit middleware.
 *
 *   app.set('trust proxy', 1);           // so req.ip is the real client IP behind a proxy
 *   app.use(requestContext);             // FIRST middleware
 *   app.use(express.json());
 *   app.use(httpAudit());                // before your routes
 *   app.use('/api/...', routes);
 *
 * httpAudit() writes one event for every state-changing request (POST/PUT/PATCH/DELETE), every
 * authenticated read (GET – configurable with AUDIT_LOG_READS), and every 401/403/429/5xx –
 * unless the controller already wrote a richer, explicit event for that request.
 */

'use strict';

const { randomUUID } = require('crypto');
const auditContext = require('../utils/auditContext');
const auditService = require('../services/auditService');
const cfg = require('../config/auditConfig');
const { displayName, roleGroupOf } = require('../utils/auditActor');
const { moduleLabel, toSnake } = require('../utils/auditTaxonomy');
const { getClientIp } = require('../utils/clientIp');

const SAFE_ID = /^[A-Za-z0-9._:-]{8,128}$/;
const SPECIAL_VERBS = /^(approve|reject|disburse|pay|activate|deactivate|inactivate|archive|restore|verify|send_email|send_mail|send_reminder|soft_delete|delete|print|export|download|spool|track|generate_receipt|generate_invoice|lifecycle|review|scan|reset_password|change_password|login|logout|register|calculate)/;

/** Must be the first middleware: creates the request id + async context. */
function requestContext(req, res, next) {
  const incoming = req.get('x-request-id');
  const requestId = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  auditContext.run({ req, requestId, startedAt: Date.now(), handled: false }, () => next());
}

function isIgnored(path) {
  return cfg.http.ignorePaths.some((re) => re.test(path));
}

function describeRoute(req) {
  const routePath = req.route && req.route.path ? `${req.baseUrl || ''}${req.route.path}` : `${req.baseUrl || ''}${req.path || ''}`;
  const segments = routePath.split('/').filter(Boolean);
  let i = 0;
  if (segments[i] === 'api') i += 1;
  if (/^v\d+$/.test(segments[i] || '')) i += 1;
  const resource = (segments[i] || 'root').replace(/[^A-Za-z0-9_-]/g, '').toLowerCase() || 'root';
  const rest = segments.slice(i + 1).filter((s) => !s.startsWith(':') && !/^[a-f0-9]{24}$/i.test(s)).map(toSnake);
  const hasId = Object.keys(req.params || {}).length > 0 || segments.slice(i + 1).some((s) => s.startsWith(':') || /^[a-f0-9]{24}$/i.test(s));
  const restStr = rest.join('_');
  const method = req.method.toUpperCase();

  let verb;
  const special = rest.find((s) => SPECIAL_VERBS.test(s));
  if (/export|download|spool|csv|pdf|print/.test(restStr)) verb = 'export';
  else if (method === 'GET') verb = hasId ? 'view' : (rest.length ? rest[rest.length - 1] : 'list');
  else if (method === 'DELETE') verb = 'delete';
  else if (special) verb = special;
  else if (method === 'POST') verb = rest.length ? rest[rest.length - 1] : 'create';
  else verb = /delete/.test(restStr) ? 'soft_delete' : 'update';

  const id = (req.params && (req.params.id || req.params.userId || req.params.eventId)) || (req.body && typeof req.body.id === 'string' ? req.body.id : undefined);
  return { resource, verb: toSnake(verb).slice(0, 60), id };
}

async function logHttp(req, res, store, durationMs) {
  const status = res.statusCode;
  const method = req.method.toUpperCase();
  const isRead = method === 'GET';
  const authFail = status === 401;
  const denied = status === 403;
  const limited = status === 429;
  const serverError = status >= 500;

  if (store && store.handled) return;
  if (isRead && !authFail && !denied && !limited && !serverError && (!cfg.http.logReads || !req.user)) return;

  const { resource, verb, id } = describeRoute(req);
  const routeAction = store && store.routeAction;
  const action = (routeAction && routeAction.action) || `${resource}.${verb}`;
  const module = (routeAction && routeAction.module) || moduleLabel(resource);

  let category;
  let outcome = status < 400 ? 'success' : 'failure';
  if (authFail) category = 'authentication';
  else if (denied) { category = 'authorization'; outcome = 'denied'; }
  else if (limited) { category = 'security'; outcome = 'denied'; }
  else if (serverError) category = 'system';
  else if (routeAction && routeAction.category) category = routeAction.category;
  else if (/login|logout|password|register/.test(verb)) category = 'authentication';
  else category = isRead || verb === 'export' ? 'data_access' : 'data_change';

  const who = req.user ? displayName(req.user) : 'Anonymous';
  const verbText = { list: 'listed', view: 'viewed', export: 'exported', create: 'created', update: 'updated', delete: 'deleted', soft_delete: 'deleted' }[verb] || verb.replace(/_/g, ' ');
  const description = `${who}${req.user ? ` (${req.user.role || 'user'})` : ''} ${verbText} ${resource}${id ? ` #${id}` : ''} – HTTP ${status}`;

  const bodyFields = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? Object.keys(req.body).slice(0, 50) : undefined;
  await auditService.record({
    action,
    category,
    outcome,
    severity: (routeAction && routeAction.severity) || undefined,
    module,
    source: 'http',
    markHandled: false,
    description,
    target: id ? { type: resource, id } : undefined,
    request: { statusCode: status, durationMs },
    metadata: {
      query: req.query && Object.keys(req.query).length ? req.query : undefined,
      bodyFields: bodyFields && bodyFields.length ? bodyFields : undefined,
      responseBytes: Number(res.get('content-length')) || undefined,
      roleGroup: req.user ? roleGroupOf(req.user.role) : 'anonymous',
    },
  });
}

/** Generic HTTP audit trail. */
function httpAudit() {
  return function httpAuditMiddleware(req, res, next) {
    if (req.method === 'OPTIONS' || req.method === 'HEAD' || isIgnored(req.path)) return next();
    const store = auditContext.get();
    const started = Date.now();
    res.on('finish', () => {
      const run = () => logHttp(req, res, store, Date.now() - started).catch((e) => console.error('[audit-http]', e.message)); // eslint-disable-line no-console
      if (store) auditContext.run(store, run); else run();
    });
    return next();
  };
}

/**
 * Name a route explicitly (replaces the old auditLogger(action, module) middleware):
 *   router.post('/approve/:id', protect, auditRoute('invoice.approved', 'Revenue Management'), ctrl.approve)
 */
function auditRoute(action, module, opts = {}) {
  return function auditRouteMiddleware(req, res, next) {
    const store = auditContext.get();
    if (store) store.routeAction = { action, module, category: opts.category, severity: opts.severity };
    next();
  };
}

/** Role guard that audits denials. requireRoles('superadmin', 'admin') */
function requireRoles(...roles) {
  const allowed = roles.flat().map((r) => String(r).toLowerCase());
  return async function requireRolesMiddleware(req, res, next) {
    if (!req.user) return res.status(401).json({ responseCode: '21', responseMessage: 'Not authenticated' });
    if (allowed.includes(String(req.user.role || '').toLowerCase())) return next();
    await auditService.record({
      action: 'access.denied',
      category: 'authorization',
      outcome: 'denied',
      severity: 'medium',
      module: 'Access Control',
      description: `${displayName(req.user)} (${req.user.role}) was denied access to ${req.method} ${req.originalUrl.split('?')[0]}`,
      metadata: { requiredRoles: allowed },
    });
    return res.status(403).json({ responseCode: '23', responseMessage: 'You do not have permission to perform this action' });
  };
}

/** Tiny in-memory rate limiter for public endpoints (use Redis-backed limiting for multi-instance). */
function simpleRateLimit({ windowMs = 15 * 60000, max = 20, keyFn = (req) => getClientIp(req) } = {}) {
  const hits = new Map();
  const t = setInterval(() => {
    const now = Date.now();
    hits.forEach((v, k) => { if (v.reset < now) hits.delete(k); });
  }, windowMs);
  if (t.unref) t.unref();
  return function rateLimit(req, res, next) {
    const key = keyFn(req);
    const now = Date.now();
    let h = hits.get(key);
    if (!h || h.reset < now) {
      h = { count: 0, reset: now + windowMs };
      hits.set(key, h);
    }
    h.count += 1;
    if (h.count > max) {
      res.setHeader('Retry-After', Math.ceil((h.reset - now) / 1000));
      return res.status(429).json({ responseCode: '29', responseMessage: 'Too many requests. Please try again later.' });
    }
    return next();
  };
}

module.exports = { requestContext, httpAudit, auditRoute, requireRoles, simpleRateLimit, describeRoute };
