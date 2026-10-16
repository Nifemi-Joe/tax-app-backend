/**
 * @file authMiddleware.js
 * @description Authentication middleware
 * Implements ISMS A.9.1.2 (User access provisioning) and A.9.2.2 (User access provisioning)
 */

const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const Session = require('../models/Session');
const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

// ============================================================
// CUSTOM ERROR CLASS
// ============================================================
class AppError extends Error {
	constructor(message, statusCode) {
		super(message);
		this.statusCode = statusCode;
		Error.captureStackTrace(this, this.constructor);
	}
}

// ============================================================
// HELPER: EXTRACT TOKEN FROM REQUEST
// ============================================================
const extractToken = (req) => {
	let token = null;

	// Method 1: Check Authorization header (Bearer token)
	if (req.headers.authorization) {
		const parts = req.headers.authorization.split(' ');
		if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
			token = parts[1];
		}
	}

	// Method 2: Check cookies
	if (!token && req.cookies?.token) {
		token = req.cookies.token;
	}

	// Method 3: Check header as fallback
	if (!token && req.headers.token) {
		token = req.headers.token;
	}

	return token;
};

// ============================================================
// PROTECT ROUTES - User must be authenticated
// ============================================================
const protect = asyncHandler(async (req, res, next) => {
	const token = extractToken(req);

	// Check if token exists
	if (!token) {
		await AuditLog.createLog({
			user: null,
			action: 'failed_login',
			resource: 'authentication',
			details: 'Access attempt without token',
			ip: req.ip,
			userAgent: req.get('User-Agent'),
			severity: 'medium',
			status: 'failed',
			endpoint: req.originalUrl,
			method: req.method,
		}).catch((err) => logger.error('Audit log failed:', err));

		return res.status(401).json({
			responseCode: '99',
			responseMessage: 'Not authorized. No token provided.',
		});
	}

	try {
		// Verify JWT token
		if (!process.env.JWT_SECRET) {
			logger.error('JWT_SECRET is not defined');
			return res.status(500).json({
				responseCode: '99',
				responseMessage: 'Server configuration error',
			});
		}

		const decoded = jwt.verify(token, process.env.JWT_SECRET);

		// Check if user exists and is active
		const user = await User.findById(decoded.id).select('-password -passwordHistory');

		if (!user) {
			await AuditLog.createLog({
				user: decoded.id || null,
				action: 'failed_login',
				resource: 'authentication',
				details: 'User not found',
				ip: req.ip,
				userAgent: req.get('User-Agent'),
				severity: 'high',
				status: 'failed',
				endpoint: req.originalUrl,
				method: req.method,
			}).catch((err) => logger.error('Audit log failed:', err));

			return res.status(401).json({
				responseCode: '99',
				responseMessage: 'User not found',
			});
		}

		if (!user.isActive) {
			await AuditLog.createLog({
				user: user._id,
				action: 'failed_login',
				resource: 'authentication',
				details: 'Inactive user attempted to access',
				ip: req.ip,
				userAgent: req.get('User-Agent'),
				severity: 'high',
				status: 'failed',
				endpoint: req.originalUrl,
				method: req.method,
			}).catch((err) => logger.error('Audit log failed:', err));

			return res.status(403).json({
				responseCode: '99',
				responseMessage: 'User account is inactive',
			});
		}

		if (user.deleted) {
			return res.status(403).json({
				responseCode: '99',
				responseMessage: 'User account has been deleted',
			});
		}

		// Attach user and token to request
		req.user = user;
		req.token = token;
		req.userId = decoded.id;

		// Log successful authentication
		await AuditLog.createLog({
			user: user._id,
			action: 'authentication_success',
			resource: 'authentication',
			details: `User authenticated successfully`,
			ip: req.ip,
			userAgent: req.get('User-Agent'),
			severity: 'low',
			status: 'success',
			endpoint: req.originalUrl,
			method: req.method,
		}).catch((err) => logger.error('Audit log failed:', err));

		next();
	} catch (error) {
		logger.error('Authentication error:', error);

		let statusCode = 401;
		let message = 'Authentication failed';

		if (error.name === 'TokenExpiredError') {
			message = 'Token expired. Please login again.';
			statusCode = 401;
		} else if (error.name === 'JsonWebTokenError') {
			message = 'Invalid token';
			statusCode = 401;
		}

		await AuditLog.createLog({
			user: null,
			action: 'failed_login',
			resource: 'authentication',
			details: `Authentication error: ${error.message}`,
			ip: req.ip,
			userAgent: req.get('User-Agent'),
			severity: 'medium',
			status: 'failed',
			endpoint: req.originalUrl,
			method: req.method,
		}).catch((err) => logger.error('Audit log failed:', err));

		return res.status(statusCode).json({
			responseCode: '99',
			responseMessage: message,
		});
	}
});

// ============================================================
// AUTHORIZE BY ROLE
// ============================================================
const authorize = (...allowedRoles) => {
	return asyncHandler(async (req, res, next) => {
		if (!req.user) {
			return res.status(401).json({
				responseCode: '99',
				responseMessage: 'User not authenticated',
			});
		}

		if (!allowedRoles.includes(req.user.role)) {
			// Audit log for unauthorized access attempt
			await AuditLog.createLog({
				user: req.user._id,
				action: 'unauthorized_access',
				resource: 'authentication',
				details: `Unauthorized access attempt. User role: ${req.user.role}. Required roles: ${allowedRoles.join(', ')}`,
				ip: req.ip,
				userAgent: req.get('User-Agent'),
				severity: 'high',
				status: 'failed',
				endpoint: req.originalUrl,
				method: req.method,
			}).catch((err) => logger.error('Audit log failed:', err));

			return res.status(403).json({
				responseCode: '99',
				responseMessage: `Access denied. Required role(s): ${allowedRoles.join(', ')}`,
				requiredRoles: allowedRoles,
				userRole: req.user.role,
			});
		}

		next();
	});
};

// ============================================================
// AUTHORIZE BY PERMISSIONS
// ============================================================
const authorizePermissions = (...allowedPermissions) => {
	return asyncHandler(async (req, res, next) => {
		if (!req.user) {
			return res.status(401).json({
				responseCode: '99',
				responseMessage: 'User not authenticated',
			});
		}

		// Superadmin has all permissions
		if (req.user.role === 'superadmin') {
			return next();
		}

		// Check if user has required permissions
		const userPermissions = req.user.permissions || [];
		const hasPermission = allowedPermissions.some((perm) =>
			userPermissions.includes(perm)
		);

		if (!hasPermission) {
			// Audit log for unauthorized access
			await AuditLog.createLog({
				user: req.user._id,
				action: 'unauthorized_access',
				resource: 'security',
				details: `User attempted to access without required permissions. Required: ${allowedPermissions.join(', ')}. User permissions: ${userPermissions.join(', ') || 'none'}`,
				ip: req.ip,
				userAgent: req.get('User-Agent'),
				severity: 'high',
				status: 'failed',
				endpoint: req.originalUrl,
				method: req.method,
			}).catch((err) => logger.error('Audit log failed:', err));

			return res.status(403).json({
				responseCode: '99',
				responseMessage: 'You do not have permission to access this resource',
				requiredPermissions: allowedPermissions,
				userPermissions: userPermissions,
			});
		}

		next();
	});
};

// ============================================================
// OPTIONAL AUTHENTICATION - doesn't fail if no token
// ============================================================
const optionalAuth = asyncHandler(async (req, res, next) => {
	const token = extractToken(req);

	if (token) {
		try {
			if (!process.env.JWT_SECRET) {
				return next();
			}

			const decoded = jwt.verify(token, process.env.JWT_SECRET);
			const user = await User.findById(decoded.id).select(
				'-password -passwordHistory'
			);

			if (user && user.isActive && !user.deleted) {
				req.user = user;
				req.token = token;
				req.userId = decoded.id;
			}
		} catch (error) {
			logger.error('Optional auth error:', error);
			// Continue without authentication - this is optional
		}
	}

	next();
});

// ============================================================
// VERIFY EMAIL
// ============================================================
const verifyEmail = asyncHandler(async (req, res, next) => {
	if (!req.user) {
		return res.status(401).json({
			responseCode: '99',
			responseMessage: 'User not authenticated',
		});
	}

	if (!req.user.emailVerified) {
		// Log email verification required
		await AuditLog.createLog({
			user: req.user._id,
			action: 'security_check',
			resource: 'security',
			details: 'Attempted to access resource without verified email',
			ip: req.ip,
			userAgent: req.get('User-Agent'),
			severity: 'medium',
			status: 'failed',
			endpoint: req.originalUrl,
			method: req.method,
		}).catch((err) => logger.error('Audit log failed:', err));

		return res.status(403).json({
			responseCode: '99',
			responseMessage: 'Email not verified. Please verify your email to continue.',
		});
	}

	next();
});

// ============================================================
// CHECK IF USER IS OWNER OR ADMIN
// ============================================================
const isOwnerOrAdmin = asyncHandler(async (req, res, next) => {
	if (!req.user) {
		return res.status(401).json({
			responseCode: '99',
			responseMessage: 'User not authenticated',
		});
	}

	const resourceUserId = req.params.id || req.params.userId || req.body.userId;

	if (!resourceUserId) {
		return res.status(400).json({
			responseCode: '99',
			responseMessage: 'User ID not provided in request',
		});
	}

	const isOwner = req.user._id.toString() === resourceUserId.toString();
	const isAdmin = ['admin', 'superadmin'].includes(req.user.role);

	if (!isOwner && !isAdmin) {
		// Audit log
		await AuditLog.createLog({
			user: req.user._id,
			action: 'unauthorized_access',
			resource: 'security',
			details: `User attempted to access resource owned by ${resourceUserId}. User is not owner or admin.`,
			ip: req.ip,
			userAgent: req.get('User-Agent'),
			severity: 'high',
			status: 'failed',
			endpoint: req.originalUrl,
			method: req.method,
		}).catch((err) => logger.error('Audit log failed:', err));

		return res.status(403).json({
			responseCode: '99',
			responseMessage: 'Not authorized to access this resource',
		});
	}

	next();
});

// ============================================================
// CHECK IF USER IS ADMIN
// ============================================================
const isAdmin = asyncHandler(async (req, res, next) => {
	if (!req.user) {
		return res.status(401).json({
			responseCode: '99',
			responseMessage: 'User not authenticated',
		});
	}

	if (!['admin', 'superadmin'].includes(req.user.role)) {
		// Audit log
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
		}).catch((err) => logger.error('Audit log failed:', err));

		return res.status(403).json({
			responseCode: '99',
			responseMessage: 'Admin access required to access this resource',
		});
	}

	next();
});

// ============================================================
// CHECK IF USER IS SUPERADMIN
// ============================================================
const isSuperadmin = asyncHandler(async (req, res, next) => {
	if (!req.user) {
		return res.status(401).json({
			responseCode: '99',
			responseMessage: 'User not authenticated',
		});
	}

	if (req.user.role !== 'superadmin') {
		// Audit log
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
		}).catch((err) => logger.error('Audit log failed:', err));

		return res.status(403).json({
			responseCode: '99',
			responseMessage: 'Superadmin access required to access this resource',
		});
	}

	next();
});

// ============================================================
// REQUEST VALIDATION
// ============================================================
const validateRequest = asyncHandler(async (req, res, next) => {
	// Basic validation - can be extended
	if (req.body && typeof req.body !== 'object') {
		return res.status(400).json({
			responseCode: '99',
			responseMessage: 'Request body must be a valid object',
		});
	}

	next();
});

// ============================================================
// LOG REQUEST
// ============================================================
const logRequest = asyncHandler(async (req, res, next) => {
	const start = Date.now();

	// Capture original send
	const originalSend = res.send;

	res.send = function (data) {
		const duration = Date.now() - start;

		// Only log API calls
		if (req.path.startsWith('/api/')) {
			AuditLog.createLog({
				user: req.user?._id || null,
				action: 'api_call',
				resource: 'system',
				details: `${req.method} ${req.path}`,
				ip: req.ip,
				userAgent: req.get('User-Agent'),
				severity: 'low',
				status: res.statusCode >= 400 ? 'failed' : 'success',
				endpoint: req.originalUrl,
				method: req.method,
				statusCode: res.statusCode,
				duration: duration,
			}).catch((err) => logger.error('Audit log failed:', err));
		}

		res.send = originalSend;
		return res.send(data);
	};

	next();
});

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
	AppError,
	protect,
	authorize,
	authorizePermissions,
	optionalAuth,
	verifyEmail,
	isOwnerOrAdmin,
	isAdmin,
	isSuperadmin,
	validateRequest,
	logRequest,
};