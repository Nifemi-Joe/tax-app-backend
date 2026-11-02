/**
 * @file middlewares/auditLogger.js
 * @description Backwards-compatible replacement for the old route middleware
 *
 *   router.post('/x', protect, auditLogger('created_x', 'X Management'), handler)
 *
 * It now simply names the HTTP event recorded by httpAudit(), so the action is logged once,
 * with outcome (from the status code), duration, actor role, IP, geo-location and device.
 */

'use strict';

const { auditRoute } = require('./auditMiddleware');

module.exports = (action, module, opts) => auditRoute(action, module, opts);
