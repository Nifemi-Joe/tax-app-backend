/**
 * @file securityController.js
 * @description Security management controller
 * Implements ISMS A.9.2.2, A.9.4.2, A.10.1.1, A.12.4.1
 */

const asyncHandler = require('express-async-handler');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const AuditLog = require('../models/AuditLog');
const Session = require('../models/Session');
const User = require('../models/User');

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

class AppError extends Error {
    constructor(message, statusCode = 500) {
        super(message);
        this.statusCode = statusCode;
    }
}

const generateToken = (id) => {
    return jwt.sign(
        { id, type: 'access' },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
    );
};

const generateRefreshToken = (id) => {
    return jwt.sign(
        { id, type: 'refresh' },
        process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
    );
};

// ============================================================================
// CONTROLLERS
// ============================================================================

/**
 * Get user's active sessions
 * @desc    GET /api/security/sessions
 * @access  Private
 */
exports.getUserSessions = asyncHandler(async (req, res) => {
    const userId = req.user._id;

    // Get active sessions
    const sessions = await Session.find({
        user: userId,
        isActive: true,
        expiresAt: { $gt: new Date() },
    })
        .sort({ createdAt: -1 })
        .lean();

    if (!sessions) {
        return res.status(200).json({
            responseCode: '00',
            responseMessage: 'No active sessions found',
            responseData: [],
        });
    }

    // Add current session flag
    const currentToken = req.token || req.headers.authorization?.split(' ')[1];
    const sessionsWithCurrent = sessions.map((session) => ({
        ...session,
        isCurrent: session.token === currentToken,
    }));

    res.status(200).json({
        responseCode: '00',
        responseMessage: 'Sessions retrieved successfully',
        responseData: sessionsWithCurrent,
    });
});

/**
 * Terminate a specific session
 * @desc    DELETE /api/security/sessions/:sessionId
 * @access  Private
 */
exports.terminateSession = asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const userId = req.user._id;

    // Find session
    const session = await Session.findById(sessionId);
    if (!session) {
        throw new AppError('Session not found', 404);
    }

    // Verify ownership
    if (session.user.toString() !== userId.toString()) {
        // Audit suspicious activity
        await AuditLog.createLog({
            user: userId,
            action: 'unauthorized_session_access',
            resource: 'session',
            details: `Attempted to terminate session belonging to another user: ${session.user}`,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            severity: 'high',
            status: 'failed',
        }).catch(err => console.error('Audit log failed:', err));

        throw new AppError('Not authorized to terminate this session', 403);
    }

    // Prevent terminating current session
    const currentToken = req.token || req.headers.authorization?.split(' ')[1];
    if (session.token === currentToken) {
        throw new AppError('Cannot terminate your current session. Use logout instead.', 400);
    }

    // Terminate session
    session.isActive = false;
    session.terminatedAt = new Date();
    session.terminationReason = 'User initiated';
    await session.save();

    // Audit log
    await AuditLog.createLog({
        user: userId,
        action: 'session_terminate',
        resource: 'session',
        details: `Session terminated: ${session.device} on ${session.browser}`,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: session._id,
        severity: 'medium',
        status: 'success',
    }).catch(err => console.error('Audit log failed:', err));

    res.status(200).json({
        responseCode: '00',
        responseMessage: 'Session terminated successfully',
    });
});

/**
 * Terminate all sessions except current
 * @desc    DELETE /api/security/sessions/all
 * @access  Private
 */
exports.terminateAllSessions = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const currentToken = req.token || req.headers.authorization?.split(' ')[1];

    // Find current session
    const currentSession = await Session.findOne({
        user: userId,
        token: currentToken,
        isActive: true,
    });

    if (!currentSession) {
        throw new AppError('Current session not found', 404);
    }

    // Terminate all other sessions
    const result = await Session.updateMany(
        {
            user: userId,
            _id: { $ne: currentSession._id },
            isActive: true,
        },
        {
            $set: {
                isActive: false,
                terminatedAt: new Date(),
                terminationReason: 'User initiated bulk termination',
            },
        }
    );

    // Audit log
    await AuditLog.createLog({
        user: userId,
        action: 'session_terminate_all',
        resource: 'session',
        details: `Terminated ${result.modifiedCount} sessions (except current)`,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        severity: 'medium',
        status: 'success',
    }).catch(err => console.error('Audit log failed:', err));

    res.status(200).json({
        responseCode: '00',
        responseMessage: `Successfully terminated ${result.modifiedCount} sessions`,
        responseData: {
            terminatedCount: result.modifiedCount,
        },
    });
});

/**
 * Enable Two-Factor Authentication
 * @desc    POST /api/security/2fa/enable
 * @access  Private
 */
exports.enable2FA = asyncHandler(async (req, res) => {
    const userId = req.user._id;

    const user = await User.findById(userId);
    if (!user) {
        throw new AppError('User not found', 404);
    }

    if (user.twoFactorEnabled) {
        throw new AppError('Two-factor authentication is already enabled', 400);
    }

    // For now, return a placeholder. In production, use speakeasy/qrcode
    const secret = {
        base32: 'JBSWY3DPEBLW64TMMQ======', // Example secret
        qrCode: 'data:image/png;base64,...', // Example QR code data
        manualEntryKey: 'JBSWY3DPEBLW64TMMQ======',
    };

    // Audit log
    await AuditLog.createLog({
        user: userId,
        action: '2fa_enable_initiated',
        resource: 'security',
        details: 'Two-factor authentication enable initiated',
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        severity: 'high',
        status: 'success',
    }).catch(err => console.error('Audit log failed:', err));

    res.status(200).json({
        responseCode: '00',
        responseMessage: 'Two-factor authentication setup initiated',
        responseData: {
            secret: secret.manualEntryKey,
            qrCode: secret.qrCode,
            instructions: 'Scan the QR code with your authenticator app or enter the manual key',
        },
    });
});

/**
 * Verify 2FA token and enable 2FA
 * @desc    POST /api/security/2fa/verify
 * @access  Private
 */
exports.verify2FA = asyncHandler(async (req, res) => {
    const { token } = req.body;
    const userId = req.user._id;

    if (!token) {
        throw new AppError('2FA token is required', 400);
    }

    const user = await User.findById(userId);
    if (!user) {
        throw new AppError('User not found', 404);
    }

    // In production, verify with speakeasy
    // For now, accept any 6-digit token as valid
    if (!/^\d{6}$/.test(token)) {
        await AuditLog.createLog({
            user: userId,
            action: '2fa_verify_failed',
            resource: 'security',
            details: 'Invalid 2FA token format',
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            severity: 'medium',
            status: 'failed',
        }).catch(err => console.error('Audit log failed:', err));

        throw new AppError('Invalid 2FA token format', 400);
    }

    // Enable 2FA
    user.twoFactorEnabled = true;
    user.twoFactorSecret = 'encrypted_secret_here'; // In production, encrypt and store the actual secret
    await user.save();

    // Audit log
    await AuditLog.createLog({
        user: userId,
        action: '2fa_enabled',
        resource: 'security',
        details: 'Two-factor authentication successfully enabled',
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        severity: 'high',
        status: 'success',
    }).catch(err => console.error('Audit log failed:', err));

    res.status(200).json({
        responseCode: '00',
        responseMessage: 'Two-factor authentication enabled successfully',
        responseData: {
            twoFactorEnabled: true,
        },
    });
});

/**
 * Disable Two-Factor Authentication
 * @desc    POST /api/security/2fa/disable
 * @access  Private
 */
exports.disable2FA = asyncHandler(async (req, res) => {
    const { password } = req.body;
    const userId = req.user._id;

    if (!password) {
        throw new AppError('Password is required to disable 2FA', 400);
    }

    const user = await User.findById(userId).select('+password');
    if (!user) {
        throw new AppError('User not found', 404);
    }

    if (!user.twoFactorEnabled) {
        throw new AppError('Two-factor authentication is not enabled', 400);
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
        await AuditLog.createLog({
            user: userId,
            action: '2fa_disable_failed',
            resource: 'security',
            details: 'Failed 2FA disable attempt - invalid password',
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            severity: 'high',
            status: 'failed',
        }).catch(err => console.error('Audit log failed:', err));

        throw new AppError('Invalid password', 401);
    }

    // Disable 2FA
    user.twoFactorEnabled = false;
    user.twoFactorSecret = undefined;
    await user.save();

    // Audit log
    await AuditLog.createLog({
        user: userId,
        action: '2fa_disabled',
        resource: 'security',
        details: 'Two-factor authentication disabled',
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        severity: 'high',
        status: 'success',
    }).catch(err => console.error('Audit log failed:', err));

    res.status(200).json({
        responseCode: '00',
        responseMessage: 'Two-factor authentication disabled successfully',
    });
});

/**
 * Get security settings
 * @desc    GET /api/security/settings
 * @access  Private
 */
exports.getSecuritySettings = asyncHandler(async (req, res) => {
    const userId = req.user._id;

    const user = await User.findById(userId).select(
        'twoFactorEnabled emailVerified lastPasswordChange securityPreferences'
    );

    if (!user) {
        throw new AppError('User not found', 404);
    }

    const securitySettings = {
        twoFactorEnabled: user.twoFactorEnabled || false,
        emailVerified: user.emailVerified || false,
        lastPasswordChange: user.lastPasswordChange,
        securityPreferences: user.securityPreferences || {
            loginNotifications: true,
            suspiciousActivityAlerts: true,
            sessionTimeout: 30,
            passwordExpiry: 90,
        },
    };

    // Count active sessions
    const activeSessions = await Session.countDocuments({
        user: userId,
        isActive: true,
        expiresAt: { $gt: new Date() },
    });

    res.status(200).json({
        responseCode: '00',
        responseMessage: 'Security settings retrieved successfully',
        responseData: {
            ...securitySettings,
            activeSessions,
        },
    });
});

/**
 * Update security settings
 * @desc    PUT /api/security/settings
 * @access  Private
 */
exports.updateSecuritySettings = asyncHandler(async (req, res) => {
    const { securityPreferences } = req.body;
    const userId = req.user._id;

    if (!securityPreferences || Object.keys(securityPreferences).length === 0) {
        throw new AppError('No security preferences provided', 400);
    }

    const user = await User.findById(userId);
    if (!user) {
        throw new AppError('User not found', 404);
    }

    // Whitelist allowed fields
    const allowedFields = [
        'loginNotifications',
        'suspiciousActivityAlerts',
        'sessionTimeout',
        'passwordExpiry',
    ];

    const updateData = {};
    for (const key of allowedFields) {
        if (key in securityPreferences) {
            updateData[key] = securityPreferences[key];
        }
    }

    // Update security preferences
    user.securityPreferences = {
        ...user.securityPreferences,
        ...updateData,
    };

    await user.save();

    // Audit log
    await AuditLog.createLog({
        user: userId,
        action: 'security_setting_change',
        resource: 'security',
        details: `Security settings updated: ${Object.keys(updateData).join(', ')}`,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        severity: 'medium',
        status: 'success',
    }).catch(err => console.error('Audit log failed:', err));

    res.status(200).json({
        responseCode: '00',
        responseMessage: 'Security settings updated successfully',
        responseData: user.securityPreferences,
    });
});

module.exports = exports;