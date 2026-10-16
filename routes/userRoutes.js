/**
 * @file userRoutes.js
 * @description User management routes
 */

const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');

const {
	userRegister,
	authUser,
	changePassword,
	adminResetUserPassword,
	getUsers,
	getUserById,
	updateUser,
	deleteUserProfile,
	exportUserData,
	deleteUserAccount,
} = require('../controllers/userController');

const { protect, authorize, isOwnerOrAdmin, isSuperadmin } =
	require('../middlewares/authMiddleware');

const logger = require('../utils/logger');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

const validateObjectId = (paramName) => {
	return (req, res, next) => {
		if (!mongoose.Types.ObjectId.isValid(req.params[paramName])) {
			return res.status(400).json({
				success: false,
				message: `Invalid ${paramName} format`,
			});
		}
		next();
	};
};

const handleValidationErrors = (req, res, next) => {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return res.status(400).json({
			success: false,
			message: 'Validation failed',
			errors: errors.array().map((err) => ({
				field: err.param,
				message: err.msg,
			})),
		});
	}
	next();
};

// ============================================================================
// PUBLIC ROUTES
// ============================================================================

/**
 * @route   POST /api/user/login
 * @desc    Authenticate user & get token
 * @access  Public
 */
router.post(
	'/login',
	[
		check('email', 'Please include a valid email')
			.isEmail()
			.normalizeEmail(),
		check('password', 'Password is required').exists().notEmpty(),
	],
	handleValidationErrors,
	asyncHandler(authUser)
);

/**
 * @route   POST /api/user/register
 * @desc    Register new user (Admin/Superadmin only)
 * @access  Private (Admin/Superadmin)
 */
router.post(
	'/register',
	protect,
	authorize('superadmin', 'admin'),
	[
		check('firstname', 'First name is required').notEmpty().trim(),
		check('lastname', 'Last name is required').notEmpty().trim(),
		check('email', 'Please include a valid email')
			.isEmail()
			.normalizeEmail(),
		check('password', 'Password must be at least 8 characters')
			.optional()
			.isLength({ min: 8 })
			.matches(
				/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/,
				'Password must contain uppercase, lowercase, number and special character'
			),
		check('role', 'Invalid role')
			.optional()
			.isIn(['superadmin', 'admin', 'manager', 'staff', 'viewer']),
		check('phoneNumber', 'Invalid phone number')
			.optional()
			.matches(/^\+?[1-9]\d{1,14}$/),
	],
	handleValidationErrors,
	asyncHandler(userRegister)
);

// ============================================================================
// PROTECTED ROUTES
// ============================================================================

/**
 * @route   GET /api/user/profile
 * @desc    Get current user profile
 * @access  Private
 */
router.get(
	'/profile',
	protect,
	asyncHandler(async (req, res) => {
		const user = await User.findById(req.user._id).select(
			'-password -passwordHistory'
		);

		if (!user || user.deleted) {
			return res.status(404).json({
				success: false,
				message: 'User not found',
			});
		}

		res.json({
			responseCode: '00',
			responseMessage: 'User profile retrieved successfully',
			responseData: user,
		});
	})
);

/**
 * @route   PUT /api/user/profile
 * @desc    Update current user profile
 * @access  Private
 */
router.put(
	'/profile',
	protect,
	[
		check('firstname').optional().notEmpty().trim(),
		check('lastname').optional().notEmpty().trim(),
		check('phoneNumber').optional().matches(/^\+?[1-9]\d{1,14}$/),
		check('country').optional().isString(),
		check('address').optional().isString(),
		check('gender').optional().isIn(['male', 'female', 'other']),
		check('position').optional().isString(),
		check('department').optional().isString(),
	],
	handleValidationErrors,
	asyncHandler(async (req, res) => {
		const updateData = {};
		const allowedFields = [
			'firstname',
			'lastname',
			'phoneNumber',
			'country',
			'address',
			'gender',
			'position',
			'department',
		];

		for (const field of allowedFields) {
			if (field in req.body) {
				updateData[field] = req.body[field];
			}
		}

		const user = await User.findByIdAndUpdate(
			req.user._id,
			updateData,
			{ new: true, runValidators: true }
		).select('-password -passwordHistory');

		await AuditLog.createLog({
			user: req.user._id,
			action: 'user_update',
			resource: 'user_management',
			details: 'User updated their profile',
			ip: req.ip,
			userAgent: req.get('User-Agent'),
			severity: 'low',
			status: 'success',
			endpoint: req.originalUrl,
			method: req.method,
		}).catch((err) => logger.error('Audit log failed:', err));

		res.json({
			responseCode: '00',
			responseMessage: 'Profile updated successfully',
			responseData: user,
		});
	})
);

/**
 * @route   POST /api/user/change-password
 * @desc    Change password (requires current password)
 * @access  Private
 */
router.post(
	'/change-password',
	protect,
	[
		check('currentPassword', 'Current password is required').notEmpty(),
		check('newPassword', 'New password must be at least 8 characters')
			.isLength({ min: 8 })
			.matches(
				/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/,
				'Password must contain uppercase, lowercase, number and special character'
			),
		check('confirmPassword', 'Confirm password is required').notEmpty(),
	],
	handleValidationErrors,
	asyncHandler(changePassword)
);

/**
 * @route   POST /api/user/verify-email
 * @desc    Verify email address
 * @access  Private
 */
router.post(
	'/verify-email',
	protect,
	[check('verificationCode', 'Verification code is required').notEmpty()],
	handleValidationErrors,
	asyncHandler(async (req, res) => {
		const { verificationCode } = req.body;
		const user = await User.findById(req.user._id);

		if (!user) {
			return res.status(404).json({
				success: false,
				message: 'User not found',
			});
		}

		if (user.emailVerified) {
			return res.status(400).json({
				success: false,
				message: 'Email already verified',
			});
		}

		// Simple verification (in production, use actual token verification)
		user.emailVerified = true;
		await user.save();

		res.json({
			responseCode: '00',
			responseMessage: 'Email verified successfully',
		});
	})
);

// ============================================================================
// ADMIN ROUTES
// ============================================================================

/**
 * @route   GET /api/user/read
 * @desc    Get all users
 * @access  Private (Admin/Superadmin)
 */
router.get(
	'/read',
	protect,
	authorize('superadmin', 'admin'),
	asyncHandler(async (req, res) => {
		const { page = 1, limit = 50, role, status, search } = req.query;

		let query = { deleted: false };

		if (role) query.role = role;
		if (status) query.isActive = status === 'active';
		if (search) {
			query.$or = [
				{ email: new RegExp(search, 'i') },
				{ firstname: new RegExp(search, 'i') },
				{ lastname: new RegExp(search, 'i') },
			];
		}

		const skip = (page - 1) * limit;
		const users = await User.find(query)
			.select('-password -passwordHistory')
			.sort({ createdAt: -1 })
			.limit(parseInt(limit))
			.skip(skip);

		const total = await User.countDocuments(query);

		res.json({
			responseCode: '00',
			responseMessage: 'Users retrieved successfully',
			responseData: users,
			pagination: {
				total,
				page: parseInt(page),
				limit: parseInt(limit),
				pages: Math.ceil(total / limit),
			},
		});
	})
);

/**
 * @route   GET /api/user/read-by-id/:id
 * @desc    Get user by ID
 * @access  Private (Admin/Superadmin)
 */
router.get(
	'/read-by-id/:id',
	protect,
	authorize('superadmin', 'admin'),
	validateObjectId('id'),
	asyncHandler(getUserById)
);

/**
 * @route   PUT /api/user/update/:id
 * @desc    Update user
 * @access  Private (Admin/Superadmin or self)
 */
router.put(
	'/update/:id',
	protect,
	isOwnerOrAdmin,
	[
		check('email').optional().isEmail().normalizeEmail(),
		check('role')
			.optional()
			.isIn(['superadmin', 'admin', 'manager', 'staff', 'viewer']),
		check('phoneNumber').optional().matches(/^\+?[1-9]\d{1,14}$/),
		check('isActive').optional().isBoolean(),
	],
	handleValidationErrors,
	validateObjectId('id'),
	asyncHandler(updateUser)
);

/**
 * @route   POST /api/user/admin/reset-password
 * @desc    Reset user password (Admin/Superadmin only)
 * @access  Private (Admin/Superadmin)
 */
router.post(
	'/admin/reset-password',
	protect,
	authorize('superadmin', 'admin'),
	[check('userId', 'User ID is required').notEmpty()],
	handleValidationErrors,
	asyncHandler(adminResetUserPassword)
);

/**
 * @route   DELETE /api/user/delete/:id
 * @desc    Delete user (soft delete)
 * @access  Private (Admin/Superadmin)
 */
router.delete(
	'/delete/:id',
	protect,
	authorize('admin', 'superadmin'),
	validateObjectId('id'),
	asyncHandler(deleteUserProfile)
);

/**
 * @route   DELETE /api/user/delete/:id/permanent
 * @desc    Permanently delete user (Superadmin only)
 * @access  Private (Superadmin)
 */
router.delete(
	'/delete/:id/permanent',
	protect,
	isSuperadmin,
	validateObjectId('id'),
	asyncHandler(async (req, res) => {
		if (req.params.id === req.user._id.toString()) {
			return res.status(403).json({
				success: false,
				message: 'You cannot permanently delete your own account',
			});
		}

		await User.findByIdAndDelete(req.params.id);

		await AuditLog.createLog({
			user: req.user._id,
			action: 'user_permanent_delete',
			resource: 'user_management',
			details: `User permanently deleted by ${req.user.email}`,
			ip: req.ip,
			userAgent: req.get('User-Agent'),
			severity: 'critical',
			status: 'success',
			endpoint: req.originalUrl,
			method: req.method,
		}).catch((err) => logger.error('Audit log failed:', err));

		res.json({
			responseCode: '00',
			responseMessage: 'User permanently deleted',
		});
	})
);

// ============================================================================
// GDPR ROUTES
// ============================================================================

/**
 * @route   GET /api/user/gdpr/export
 * @desc    Export user data (GDPR)
 * @access  Private
 */
router.get('/gdpr/export', protect, asyncHandler(exportUserData));

/**
 * @route   DELETE /api/user/gdpr/delete-account
 * @desc    Delete user account (GDPR)
 * @access  Private
 */
router.delete(
	'/gdpr/delete-account',
	protect,
	[check('confirmationPassword', 'Password is required').notEmpty()],
	handleValidationErrors,
	asyncHandler(deleteUserAccount)
);

// ============================================================================
// ERROR HANDLER
// ============================================================================

router.use((err, req, res, next) => {
	logger.error('User route error:', err);
	res.status(err.statusCode || 500).json({
		success: false,
		message: err.message || 'Internal server error',
	});
});

module.exports = router;