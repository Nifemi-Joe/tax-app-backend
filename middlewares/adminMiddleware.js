/**
 * @file adminMiddleware.js
 * @description Admin authorization middleware
 * Implements ISMS A.9.1.2 (User access provisioning)
 */

const asyncHandler = require('express-async-handler');
const logger = require('../utils/logger');
const AuditLog = require('../models/AuditLog');

/**
 * Check if user is admin or superadmin
 */
const isAdmin = asyncHandler(async (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'User not authenticated',
        });
    }

    if (!['admin', 'superadmin'].includes(req.user.role)) {
        // Log unauthorized attempt
        await AuditLog.createLog({
            user: req.user._id,
            action: 'unauthorized_access',
            resource: 'security',
            details: `User with role '${req.user.role}' attempted to access admin resource`,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            severity: 'high',
            status: 'failed',
            endpoint: req.originalUrl,
            method: req.method,
        }).catch(err => logger.error('Audit log failed:', err));

        return res.status(403).json({
            success: false,
            message: 'Not authorized, admin access required',
        });
    }

    next();
});

/**
 * Check if user is superadmin only
 */
const isSuperadmin = asyncHandler(async (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'User not authenticated',
        });
    }

    if (req.user.role !== 'superadmin') {
        // Log unauthorized attempt
        await AuditLog.createLog({
            user: req.user._id,
            action: 'unauthorized_access',
            resource: 'security',
            details: `User with role '${req.user.role}' attempted to access superadmin resource`,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            severity: 'critical',
            status: 'failed',
            endpoint: req.originalUrl,
            method: req.method,
        }).catch(err => logger.error('Audit log failed:', err));

        return res.status(403).json({
            success: false,
            message: 'Not authorized, superadmin access required',
        });
    }

    next();
});

/**
 * Check if user can manage other users
 */
const canManageUsers = asyncHandler(async (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'User not authenticated',
        });
    }

    const allowedRoles = ['admin', 'superadmin'];

    if (!allowedRoles.includes(req.user.role)) {
        await AuditLog.createLog({
            user: req.user._id,
            action: 'unauthorized_access',
            resource: 'user_management',
            details: `User with role '${req.user.role}' attempted to manage users`,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            severity: 'high',
            status: 'failed',
            endpoint: req.originalUrl,
            method: req.method,
        }).catch(err => logger.error('Audit log failed:', err));

        return res.status(403).json({
            success: false,
            message: 'Not authorized to manage users',
        });
    }

    next();
});

/**
 * Check if user can access audit logs
 */
const canAccessAuditLogs = asyncHandler(async (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'User not authenticated',
        });
    }

    const allowedRoles = ['admin', 'superadmin', 'auditor'];

    if (!allowedRoles.includes(req.user.role)) {
        await AuditLog.createLog({
            user: req.user._id,
            action: 'unauthorized_access',
            resource: 'audit',
            details: `User with role '${req.user.role}' attempted to access audit logs`,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            severity: 'high',
            status: 'failed',
            endpoint: req.originalUrl,
            method: req.method,
        }).catch(err => logger.error('Audit log failed:', err));

        return res.status(403).json({
            success: false,
            message: 'Not authorized to access audit logs',
        });
    }

    next();
});

module.exports = {
    isAdmin,
    isSuperadmin,
    canManageUsers,
    canAccessAuditLogs,
};