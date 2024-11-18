// routes/auditLogRoutes.js

const express = require('express');
const router = express.Router();
const { getAuditLogs } = require('../controllers/auditLogController');
const { protect, authorize, authorizePermissions } = require('../middlewares/authMiddleware');

// Get All Audit Logs
router.get('/', protect, authorize('admin', 'superadmin'),  getAuditLogs);

module.exports = router;
