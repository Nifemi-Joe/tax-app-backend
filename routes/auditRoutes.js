/**
 * @file auditRoutes.js
 * @description Mount with:  app.use('/api/audit', require('./routes/auditRoutes'));
 *
 * Adjust the `protect` import below if your auth middleware lives elsewhere – it must
 * verify the JWT and set req.user (with role, email, names, companyId).
 */

'use strict';

const express = require('express');
const { protect } = require('../middlewares/authMiddleware');
const ctrl = require('../controllers/auditLogController');
const { requireRoles, simpleRateLimit } = require('../middlewares/auditMiddleware');
const { ROLE_GROUPS } = require('../config/auditConfig');

const router = express.Router();

const viewers = [...ROLE_GROUPS.admin, ...ROLE_GROUPS.auditor];
const requireViewer = requireRoles(viewers);
const requireAdmin = requireRoles(ROLE_GROUPS.admin);
const requireVerifier = requireRoles(['superadmin', ...ROLE_GROUPS.auditor]);
const requireSuperadmin = requireRoles(['superadmin']);

// ---- Public (e-mail "This was me / not me" links). Rate limited.
router.post('/alerts/respond', simpleRateLimit({ windowMs: 15 * 60000, max: 20 }), ctrl.respondToAlert);

router.use(protect);

// ---- Every signed-in user
router.get('/meta', ctrl.meta);
router.get('/me', ctrl.myActivity);
router.get('/me/about', ctrl.activityAboutMe);
router.get('/me/security', ctrl.mySecurity);
router.get('/me/alerts', ctrl.myAlerts);
router.post('/me/alerts/:id/respond', ctrl.respondToMyAlert);
router.delete('/me/devices/:fingerprint', ctrl.forgetDevice);
router.get('/me/export', ctrl.exportMyData);
router.post('/client-event', simpleRateLimit({ windowMs: 60000, max: 60, keyFn: (req) => String(req.user && req.user._id) }), ctrl.clientEvent);

// ---- Admins & auditors (read)
router.get('/logs', requireViewer, ctrl.listLogs);
router.get('/logs/:eventId', requireViewer, ctrl.getLog);
router.get('/stats', requireViewer, ctrl.stats);
router.get('/export', requireViewer, ctrl.exportLogs);
router.get('/alerts', requireViewer, ctrl.listAlerts);
router.get('/alerts/summary', requireViewer, ctrl.alertSummary);
router.get('/alerts/:id', requireViewer, ctrl.getAlert);
router.get('/users/:userId/security', requireViewer, ctrl.userSecurity);
router.get('/integrity/status', requireViewer, ctrl.integrityStatus);

// ---- Admins (act)
router.patch('/alerts/:id', requireAdmin, ctrl.updateAlert);
router.post('/users/:userId/unlock', requireAdmin, ctrl.unlockUser);

// ---- Superadmin / auditor
router.get('/verify', requireVerifier, ctrl.verifyIntegrity);
router.post('/legal-hold', requireSuperadmin, ctrl.legalHold);
router.post('/privacy/pseudonymize/:userId', requireSuperadmin, ctrl.pseudonymizeUser);
router.post('/retention/run', requireSuperadmin, ctrl.runRetentionNow);

// ---- Legacy endpoints from the previous audit controller
router.get('/security-events', ctrl.getSecurityEvents);
router.get('/statistics', requireViewer, ctrl.getAuditStatistics);
router.get('/critical', requireViewer, ctrl.getCriticalLogs);
router.post('/log', ctrl.createAuditLog);

module.exports = router;
