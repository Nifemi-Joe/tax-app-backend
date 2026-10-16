/**
 * @file userController.js
 * @description Enhanced user controller with ISMS/Audit compliance.
 *
 * Security controls:
 *  - A.9.1.2: User access provisioning
 *  - A.9.2.3: User access provisioning
 *  - A.9.4.2: Password management
 *  - A.10.1.1: Cryptographic controls
 *  - A.12.4.1: Event logging
 *  - A.14.2.5: Secure development
 */

const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const asyncHandler = require('express-async-handler');
const logger = require('../utils/logger');
const logAction = require('../utils/auditLogger');
const emailService = require('../utils/emailService');
const rateLimitService = require('../services/rateLimitService');
const { AppError } = require('../middlewares/errorMiddleware');
const { sendAuditEmail } = require('../services/notificationService');

// ---- Password Policy (NIST SP 800-63B) ----
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

const validatePassword = (password) => {
	return PASSWORD_REGEX.test(password);
};

const generateRandomPassword = (length = 12) => {
	const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()";
	let password = '';
	for (let i = 0; i < length; i++) {
		password += charset.charAt(Math.floor(Math.random() * charset.length));
	}
	return password;
};

const generateToken = (id) => {
	return jwt.sign(
		{ id, type: "access" },
		process.env.JWT_SECRET,
		{ expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
	);
};

const generateRefreshToken = (id) => {
	return jwt.sign(
		{ id, type: "refresh" },
		process.env.JWT_REFRESH_SECRET,
		{ expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
	);
};

// @desc    Register new user
// @route   POST /api/user/register
// @access  Private (Admin/Superadmin)
exports.userRegister = asyncHandler(async (req, res) => {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		throw new AppError(errors.array().map(err => err.msg).join(', '), 400);
	}

	const { email, password, role, firstname, lastname, phoneNumber, department, position } = req.body;

	// Check if user already exists
	const userExists = await User.findOne({ email });
	if (userExists) {
		throw new AppError('User already exists', 400);
	}

	// Validate password if provided
	let userPassword = password;
	if (password && !validatePassword(password)) {
		throw new AppError(
			'Password must be at least 8 characters with uppercase, lowercase, number, and special character',
			400
		);
	}

	// Generate random password if not provided
	if (!userPassword) {
		userPassword = generateRandomPassword();
	}

	// Create user
	const user = await User.create({
		...req.body,
		password: userPassword,
		createdBy: req.user.name || req.user.email,
		firstLogin: true,
		generatedPassword: !password,
		status: 'active',
		emailVerified: false,
		twoFactorEnabled: false,
		passwordChangedAt: Date.now(),
	});

	// Audit log
	await logAction(
		req.user._id,
		req.user.name || `${req.user.firstname} ${req.user.lastname}`,
		'registered_user',
		'User Management',
		`Registered user ${user.email} with role ${user.role}`,
		req.ip
	);

	// Send welcome email
	const userEmailContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to GSJX LTD</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #964FFE; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { padding: 20px; background: #f9f9f9; }
        .footer { text-align: center; padding: 10px; font-size: 12px; color: #888; }
        .password { background: #fff; padding: 10px; border: 2px dashed #964FFE; border-radius: 4px; font-size: 18px; font-weight: bold; word-break: break-all; }
        .button { display: inline-block; padding: 12px 24px; background: #964FFE; color: white; text-decoration: none; border-radius: 4px; margin: 15px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Welcome to GSJX LTD!</h1>
        </div>
        <div class="content">
            <p>Dear <strong>${user.name || `${user.firstname} ${user.lastname}`}</strong>,</p>
            <p>Your account has been successfully created by an administrator.</p>
            <p><strong>Temporary Password:</strong></p>
            <div class="password">${userPassword}</div>
            <p>To ensure the security of your account, please change your password immediately:</p>
            <a href="${process.env.FRONTEND_URL}/create-new-password?userId=${user._id}" class="button">Change Your Password</a>
            <p>Best Regards,</p>
            <p><strong>GSJX LTD Team</strong></p>
        </div>
        <div class="footer">
            <p>&copy; ${new Date().getFullYear()} GSJX LTD. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
`;

	try {
		await emailService.sendEmail(user.email, 'Welcome to GSJX LTD - Temporary Password', userEmailContent);
	} catch (emailError) {
		logger.error('Welcome email failed:', emailError);
	}

	res.status(201).json({
		responseCode: "00",
		responseMessage: "User registered successfully",
		responseData: user,
		token: generateToken(user._id),
	});
});

// @desc    Authenticate user & get token
// @route   POST /api/user/login
// @access  Public
exports.authUser = asyncHandler(async (req, res) => {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		throw new AppError(errors.array().map(err => err.msg).join(', '), 400);
	}

	const { email, password } = req.body;

	// Rate limiting
	const rateLimitKey = `login_${email}`;
	const isRateLimited = await rateLimitService.check(rateLimitKey, 5, 900000); // 5 attempts per 15 min
	if (isRateLimited) {
		throw new AppError('Too many login attempts. Please try again later.', 429);
	}

	const user = await User.findOne({ email }).select('+password');

	if (!user) {
		await logAction(
			null,
			email,
			'failed_login',
			'Authentication',
			`Failed login attempt for email: ${email}`,
			req.ip
		);
		throw new AppError('Invalid email or password', 401);
	}

	if (!user.isActive) {
		throw new AppError('Account is deactivated. Contact administrator.', 403);
	}

	const isPasswordValid = await user.matchPassword(password);
	if (!isPasswordValid) {
		await logAction(
			user._id,
			user.name || `${user.firstname} ${user.lastname}`,
			'failed_login',
			'Authentication',
			`Failed login attempt for user: ${user.email}`,
			req.ip
		);
		throw new AppError('Invalid email or password', 401);
	}

	// Update last login
	user.lastLogin = new Date();
	user.lastLoginIp = req.ip;
	await user.save();

	const token = generateToken(user._id);
	const refreshToken = generateRefreshToken(user._id);
	const userName = user.name || `${user.firstname} ${user.lastname}`;

	// Audit log
	await logAction(
		user._id,
		userName,
		'user_login',
		'Authentication',
		`User logged in successfully`,
		req.ip
	);

	res.json({
		responseCode: "00",
		responseMessage: "Login successful",
		responseData: user,
		token,
		refreshToken,
	});
});

// @desc    Change password (requires current password)
// @route   POST /api/user/change-password
// @access  Private
exports.changePassword = asyncHandler(async (req, res) => {
	const { userId, currentPassword, newPassword, confirmPassword } = req.body;

	if (!userId || !currentPassword || !newPassword) {
		throw new AppError('Current password and new password are required.', 400);
	}

	if (newPassword !== confirmPassword) {
		throw new AppError('Passwords do not match.', 400);
	}

	if (!validatePassword(newPassword)) {
		throw new AppError(
			'Password must be at least 8 characters with uppercase, lowercase, number, and special character',
			400
		);
	}

	// Rate limiting
	const rateLimitKey = `password_change_${userId}`;
	const isRateLimited = await rateLimitService.check(rateLimitKey, 3, 3600000); // 3 attempts per hour
	if (isRateLimited) {
		throw new AppError('Too many password change attempts. Please try again later.', 429);
	}

	const user = await User.findById(userId).select('+password');
	if (!user) {
		throw new AppError('User not found.', 404);
	}

	// Verify current password
	const isCurrentValid = await user.matchPassword(currentPassword);
	if (!isCurrentValid) {
		await logAction(
			user._id,
			user.name,
			'failed_password_change',
			'Authentication',
			`Failed password change attempt for user: ${user.email}`,
			req.ip
		);
		throw new AppError('Current password is incorrect.', 401);
	}

	// Check password history (prevent reuse)
	const passwordHistory = user.passwordHistory || [];
	const isReused = await Promise.all(
		passwordHistory.map(async (hashedPassword) => {
			return bcrypt.compare(newPassword, hashedPassword);
		})
	);

	if (isReused.some(match => match)) {
		throw new AppError('Password has been used recently. Please choose a different password.', 400);
	}

	// Update password
	const salt = await bcrypt.genSalt(12);
	user.password = newPassword;
	user.firstLogin = false;
	user.generatedPassword = false;
	user.passwordChangedAt = Date.now();
	user.lastPasswordChange = Date.now();

	// Update password history (keep last 5)
	passwordHistory.unshift(user.password);
	if (passwordHistory.length > 5) {
		passwordHistory = passwordHistory.slice(0, 5);
	}
	user.passwordHistory = passwordHistory;

	await user.save();

	// Audit log
	await logAction(
		user._id,
		user.name,
		'password_changed',
		'User Management',
		`Password changed for user ${user.email}`,
		req.ip
	);

	// Notify user via email
	try {
		await sendAuditEmail(user.email, 'Password Changed', 'Your password has been changed successfully.');
	} catch (emailError) {
		logger.error('Password change notification email failed:', emailError);
	}

	res.status(200).json({
		responseCode: "00",
		responseMessage: 'Password changed successfully.',
	});
});

// @desc    Reset user password (admin)
// @route   POST /api/user/admin/reset-password
// @access  Private (Admin/Superadmin)
exports.adminResetUserPassword = asyncHandler(async (req, res) => {
	const { userId } = req.body;

	if (!userId) {
		throw new AppError('User ID is required.', 400);
	}

	const user = await User.findById(userId);
	if (!user) {
		throw new AppError('User not found.', 404);
	}

	const randomPassword = generateRandomPassword();
	const salt = await bcrypt.genSalt(12);
	user.password = randomPassword;
	user.firstLogin = true;
	user.generatedPassword = true;
	user.passwordChangedAt = Date.now();
	await user.save();

	const emailContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Password Reset</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #964FFE; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { padding: 20px; background: #f9f9f9; }
        .footer { text-align: center; padding: 10px; font-size: 12px; color: #888; }
        .password { background: #fff; padding: 10px; border: 2px dashed #964FFE; border-radius: 4px; font-size: 18px; font-weight: bold; word-break: break-all; }
        .button { display: inline-block; padding: 12px 24px; background: #964FFE; color: white; text-decoration: none; border-radius: 4px; margin: 15px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Password Reset</h1>
        </div>
        <div class="content">
            <p>Hello <strong>${user.name || `${user.firstname} ${user.lastname}`}</strong>,</p>
            <p>Your password has been successfully reset by the administrator.</p>
            <p><strong>New Temporary Password:</strong></p>
            <div class="password">${randomPassword}</div>
            <p>For enhanced security, please log in immediately and update your password:</p>
            <a href="${process.env.FRONTEND_URL}/create-new-password?userId=${user._id}" class="button">Change Your Password</a>
            <p>Best Regards,</p>
            <p><strong>GSJX LTD Team</strong></p>
        </div>
        <div class="footer">
            <p>&copy; ${new Date().getFullYear()} GSJX LTD. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
`;

	try {
		await emailService.sendEmail(user.email, 'Password Reset - GSJX LTD', emailContent);
	} catch (emailError) {
		logger.error('Password reset email failed:', emailError);
	}

	await logAction(
		req.user._id,
		req.user.name || `${req.user.firstname} ${req.user.lastname}`,
		'password_reset',
		'User Management',
		`Admin reset password for user ${user.email}`,
		req.ip
	);

	res.status(200).json({
		responseCode: "00",
		responseMessage: "Password reset successfully and sent to the user.",
	});
});

// @desc    Update user profile
// @route   PUT /api/user/update/:id
// @access  Private (Admin/Superadmin or self)
exports.updateUser = asyncHandler(async (req, res) => {
	const { email, role, permissions, firstname, lastname, phone, gender, country, address, position, department, companyName, isActive } = req.body;

	const user = await User.findById(req.params.id);

	if (!user || user.deleted) {
		throw new AppError('User not found', 404);
	}

	const isSelf = user._id.toString() === req.user._id.toString();
	const isAdmin = ['superadmin', 'admin'].includes(req.user.role);

	if (!isSelf && !isAdmin) {
		throw new AppError('Not authorized to update this user', 403);
	}

	let updateData = { ...req.body };
	if (!isAdmin) {
		delete updateData.role;
		delete updateData.permissions;
		delete updateData.isActive;
		delete updateData.status;
	}

	if (isSelf && req.user.role === 'superadmin' && updateData.role && updateData.role !== 'superadmin') {
		throw new AppError('Cannot demote yourself from superadmin', 400);
	}

	if (email && email !== user.email) {
		const emailExists = await User.findOne({ email });
		if (emailExists) {
			throw new AppError('Email already exists', 400);
		}
		// Trigger email verification
		updateData.emailVerified = false;
	}

	const updatedUser = await User.findByIdAndUpdate(
		req.params.id,
		{ ...updateData, updatedBy: req.user.name || req.user.email },
		{ new: true, runValidators: true }
	);

	await logAction(
		req.user._id,
		req.user.name || `${req.user.firstname} ${req.user.lastname}`,
		'updated_user',
		'User Management',
		`User ${updatedUser.email} updated by ${req.user.email}`,
		req.ip
	);

	res.json({
		responseCode: "00",
		responseMessage: "Completed Successfully",
		responseData: updatedUser,
	});
});

// @desc    Get all users
// @route   GET /api/user/read
// @access  Private (Admin/Superadmin)
exports.getUsers = asyncHandler(async (req, res) => {
	const users = await User.find({ deleted: false }).sort({ createdAt: -1 });

	res.status(200).json({
		responseCode: "00",
		responseMessage: 'Completed successfully',
		responseData: users,
	});
});

// @desc    Get user by ID
// @route   GET /api/user/read-by-id/:id
// @access  Private (Admin/Superadmin)
exports.getUserById = asyncHandler(async (req, res) => {
	const user = await User.findById(req.params.id);

	if (!user || user.deleted) {
		throw new AppError('User not found', 404);
	}

	res.status(200).json({
		responseCode: "00",
		responseMessage: 'Completed successfully',
		responseData: user,
	});
});

// @desc    Delete user (soft delete)
// @route   DELETE /api/user/delete/:id
// @access  Private (Admin/Superadmin)
exports.deleteUserProfile = asyncHandler(async (req, res) => {
	const userId = req.params.id;

	if (!mongoose.Types.ObjectId.isValid(userId)) {
		throw new AppError('Invalid user ID', 400);
	}

	const user = await User.findById(userId);

	if (!user) {
		throw new AppError('User not found', 404);
	}

	if (user.role === 'superadmin') {
		throw new AppError('Cannot delete a superadmin user', 403);
	}

	if (user._id.toString() === req.user._id.toString()) {
		throw new AppError('You cannot delete your own account', 403);
	}

	user.deleted = true;
	user.deletedAt = Date.now();
	user.deletedBy = req.user.name || req.user.email;
	user.status = 'deleted';
	await user.save();

	await logAction(
		req.user._id,
		req.user.name || `${req.user.firstname} ${req.user.lastname}`,
		'deleted_user',
		'User Management',
		`User ${user.email} deleted by ${req.user.email}`,
		req.ip
	);

	res.status(200).json({
		responseCode: "00",
		responseMessage: "User deleted successfully",
	});
});

// @desc    GDPR: Export user data
// @route   GET /api/gdpr/export
// @access  Private
exports.exportUserData = asyncHandler(async (req, res) => {
	const user = await User.findById(req.user._id);

	if (!user) {
		throw new AppError('User not found', 404);
	}

	const exportData = {
		profile: {
			name: user.name,
			email: user.email,
			phone: user.phone,
			gender: user.gender,
			country: user.country,
			address: user.address,
			position: user.position,
			department: user.department,
			role: user.role,
			createdAt: user.createdAt,
			lastLogin: user.lastLogin,
		},
		exportDate: new Date().toISOString(),
		exportReason: 'User requested data export (GDPR/CCPA Right of Access)',
	};

	await logAction(
		req.user._id,
		req.user.name,
		'data_export',
		'GDPR',
		'User requested personal data export',
		req.ip
	);

	res.status(200).json({
		responseCode: "00",
		responseMessage: "Data export completed",
		responseData: exportData,
	});
});

// @desc    GDPR: Delete user account
// @route   DELETE /api/gdpr/delete-account
// @access  Private
exports.deleteUserAccount = asyncHandler(async (req, res) => {
	const { confirmationPassword } = req.body;

	if (!confirmationPassword) {
		throw new AppError('Password confirmation is required to delete your account.', 400);
	}

	const user = await User.findById(req.user._id).select('+password');
	if (!user) {
		throw new AppError('User not found', 404);
	}

	const isPasswordValid = await user.matchPassword(confirmationPassword);
	if (!isPasswordValid) {
		throw new AppError('Password is incorrect. Account deletion cancelled.', 401);
	}

	// Soft delete with GDPR compliance
	user.deleted = true;
	user.deletedAt = Date.now();
	user.status = 'deleted';
	user.dataProcessingConsent = false;
	user.marketingConsent = false;
	await user.save();

	await logAction(
		req.user._id,
		req.user.name,
		'account_delete',
		'GDPR',
		'User deleted their own account (GDPR Right to Erasure)',
		req.ip
	);

	// Invalidate all sessions
	// (Implementation depends on your session management)

	res.status(200).json({
		responseCode: "00",
		responseMessage: "Account deleted successfully. All associated data has been removed.",
	});
});