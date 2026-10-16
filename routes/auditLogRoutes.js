/**
 * @file auditRoutes.js
 * @description Audit log management routes
 */

const express = require('express');
const router = express.Router();
const { body, param, query, validationResult } = require('express-validator');
const asyncHandler = require('express-async-handler');

// Middleware
const { protect } = require('../middlewares/authMiddleware');
const { isAdmin, isSuperadmin, canAccessAuditLogs } = require('../middlewares/adminMiddleware');

// Controller
const auditController = require('../controllers/auditLogController');

// Logger
const logger = require('../utils/logger');

// ============================================================
// VALIDATION MIDDLEWARE
// ============================================================

const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors.array().map(err => ({
                field: err.param,
                message: err.msg,
            })),
        });
    }
    next();
};

// ============================================================
// GET AUDIT LOGS
// ============================================================

/**
 * @route   GET /api/audit/logs
 * @desc    Get audit logs
 * @access  Private
 */
router.get(
    '/logs',
    protect,
    canAccessAuditLogs,
    [
        query('limit')
            .optional()
            .isInt({ min: 1, max: 100 })
            .withMessage('Limit must be between 1 and 100'),
        query('skip')
            .optional()
            .isInt({ min: 0 })
            .withMessage('Skip must be a non-negative integer'),
        query('action')
            .optional()
            .isString()
            .trim(),
        query('resource')
            .optional()
            .isString()
            .trim(),
        query('severity')
            .optional()
            .isIn(['low', 'medium', 'high', 'critical'])
            .withMessage('Invalid severity level'),
        query('status')
            .optional()
            .isIn(['success', 'failed', 'pending'])
            .withMessage('Invalid status'),
        query('startDate')
            .optional()
            .isISO8601()
            .withMessage('Invalid start date format'),
        query('endDate')
            .optional()
            .isISO8601()
            .withMessage('Invalid end date format'),
    ],
    handleValidationErrors,
    asyncHandler(auditController.getAuditLogs)
);

// ============================================================
// SECURITY EVENTS
// ============================================================

/**
 * @route   GET /api/audit/security-events
 * @desc    Get security events for current user
 * @access  Private
 */
router.get(
    '/security-events',
    protect,
    [
        query('limit')
            .optional()
            .isInt({ min: 1, max: 100 })
            .withMessage('Limit must be between 1 and 100'),
    ],
    handleValidationErrors,
    asyncHandler(auditController.getSecurityEvents)
);

// ============================================================
// STATISTICS (ADMIN ONLY)
// ============================================================

/**
 * @route   GET /api/audit/statistics
 * @desc    Get audit statistics
 * @access  Private (Admin/Superadmin)
 */
router.get(
    '/statistics',
    protect,
    isAdmin,
    [
        query('days')
            .optional()
            .isInt({ min: 1, max: 365 })
            .withMessage('Days must be between 1 and 365'),
    ],
    handleValidationErrors,
    asyncHandler(auditController.getAuditStatistics)
);

// ============================================================
// CRITICAL LOGS (ADMIN ONLY)
// ============================================================

/**
 * @route   GET /api/audit/critical
 * @desc    Get critical logs
 * @access  Private (Admin/Superadmin)
 */
router.get(
    '/critical',
    protect,
    isAdmin,
    [
        query('limit')
            .optional()
            .isInt({ min: 1, max: 100 })
            .withMessage('Limit must be between 1 and 100'),
        query('days')
            .optional()
            .isInt({ min: 1, max: 365 })
            .withMessage('Days must be between 1 and 365'),
    ],
    handleValidationErrors,
    asyncHandler(auditController.getCriticalLogs)
);

// ============================================================
// CREATE AUDIT LOG (INTERNAL)
// ============================================================

/**
 * @route   POST /api/audit/log
 * @desc    Create audit log
 * @access  Private
 */
router.post(
    '/log',
    protect,
    isAdmin,
    [
        body('action')
            .isIn([
                'login', 'logout', 'failed_login', 'password_change', 'password_reset',
                'user_register', 'user_update', 'user_delete', 'user_activate', 'user_deactivate',
                '2fa_enable', '2fa_disable', '2fa_verify', 'session_create', 'session_terminate',
                'session_timeout', 'security_setting_change',
                'data_export', 'data_import', 'account_delete', 'data_delete',
                'system_config_change', 'backup_create', 'backup_restore',
                'consent_grant', 'consent_withdraw', 'privacy_request', 'unauthorized_access',
            ])
            .withMessage('Invalid action'),
        body('resource')
            .isIn([
                'user_profile', 'user_management', 'authentication', 'security',
                'gdpr', 'system', 'session', 'audit', 'compliance',
            ])
            .withMessage('Invalid resource'),
        body('details')
            .isString()
            .trim()
            .isLength({ min: 1, max: 1000 })
            .withMessage('Details must be between 1 and 1000 characters'),
        body('severity')
            .optional()
            .isIn(['low', 'medium', 'high', 'critical'])
            .withMessage('Invalid severity level'),
        body('status')
            .optional()
            .isIn(['success', 'failed', 'pending'])
            .withMessage('Invalid status'),
    ],
    handleValidationErrors,
    asyncHandler(auditController.createAuditLog)
);

// ============================================================
// EXPORT AUDIT LOGS
// ============================================================

/**
 * @route   GET /api/audit/export
 * @desc    Export audit logs
 * @access  Private
 */
router.get(
    '/export',
    protect,
    [
        query('format')
            .optional()
            .isIn(['json', 'csv'])
            .withMessage('Format must be json or csv'),
        query('startDate')
            .optional()
            .isISO8601()
            .withMessage('Invalid start date format'),
        query('endDate')
            .optional()
            .isISO8601()
            .withMessage('Invalid end date format'),
    ],
    handleValidationErrors,
    asyncHandler(auditController.exportAuditLogs)
);

// ============================================================
// ERROR HANDLER
// ============================================================

router.use((err, req, res, next) => {
    logger.error('Audit route error:', err);
    res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || 'Internal server error',
    });
});

module.exports = router;