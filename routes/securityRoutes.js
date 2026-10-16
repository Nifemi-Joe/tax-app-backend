/**
 * @file securityRoutes.js
 * @description Security management routes
 */

const express = require('express');
const asyncHandler = require('express-async-handler');
const { body, param, query, validationResult } = require('express-validator');
const { protect } = require('../middlewares/authMiddleware');
const { isAdmin } = require('../middlewares/adminMiddleware');
const securityController = require('../controllers/securityController');

const router = express.Router();

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const sessionIdValidation = [
    param('sessionId')
        .trim()
        .isMongoId()
        .withMessage('Invalid session ID format'),
];

const enable2FAValidation = [
    body('token')
        .optional()
        .trim()
        .isLength({ min: 6, max: 6 })
        .isNumeric()
        .withMessage('2FA token must be 6 digits'),
];

const disable2FAValidation = [
    body('password')
        .trim()
        .notEmpty()
        .withMessage('Password is required to disable 2FA'),
];

const updateSecuritySettingsValidation = [
    body('securityPreferences')
        .optional()
        .isObject()
        .withMessage('Security preferences must be an object'),
    body('securityPreferences.loginNotifications')
        .optional()
        .isBoolean()
        .withMessage('loginNotifications must be boolean'),
    body('securityPreferences.suspiciousActivityAlerts')
        .optional()
        .isBoolean()
        .withMessage('suspiciousActivityAlerts must be boolean'),
    body('securityPreferences.sessionTimeout')
        .optional()
        .isInt({ min: 5, max: 1440 })
        .withMessage('sessionTimeout must be between 5 and 1440 minutes'),
    body('securityPreferences.passwordExpiry')
        .optional()
        .isInt({ min: 30, max: 365 })
        .withMessage('passwordExpiry must be between 30 and 365 days'),
];

// ============================================================================
// VALIDATION MIDDLEWARE
// ============================================================================

const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            responseCode: '99',
            responseMessage: 'Validation failed',
            errors: errors.array().map(err => ({
                field: err.param,
                message: err.msg,
            })),
        });
    }
    next();
};

// ============================================================================
// ROUTES
// ============================================================================

// Get user sessions
router.get(
    '/sessions',
    protect,
    asyncHandler(securityController.getUserSessions)
);

// Terminate specific session
router.delete(
    '/sessions/:sessionId',
    protect,
    sessionIdValidation,
    validate,
    asyncHandler(securityController.terminateSession)
);

// Terminate all sessions except current
router.delete(
    '/sessions/all',
    protect,
    asyncHandler(securityController.terminateAllSessions)
);

// Enable Two-Factor Authentication
router.post(
    '/2fa/enable',
    protect,
    asyncHandler(securityController.enable2FA)
);

// Verify 2FA token
router.post(
    '/2fa/verify',
    protect,
    enable2FAValidation,
    validate,
    asyncHandler(securityController.verify2FA)
);

// Disable Two-Factor Authentication
router.post(
    '/2fa/disable',
    protect,
    disable2FAValidation,
    validate,
    asyncHandler(securityController.disable2FA)
);

// Get security settings
router.get(
    '/settings',
    protect,
    asyncHandler(securityController.getSecuritySettings)
);

// Update security settings
router.put(
    '/settings',
    protect,
    updateSecuritySettingsValidation,
    validate,
    asyncHandler(securityController.updateSecuritySettings)
);

// ============================================================================
// ERROR HANDLING
// ============================================================================

router.use((err, req, res, next) => {
    console.error('Security route error:', err);
    res.status(err.statusCode || 500).json({
        responseCode: '99',
        responseMessage: err.message || 'Internal server error',
        errors: err.errors || undefined,
    });
});

module.exports = router;