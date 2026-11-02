/**
 * @file userController.js
 * @description User controller with full audit trail and sign-in security monitoring.
 *
 * Security controls (ISO/IEC 27001:2022):
 *  - A.5.15 / A.8.2  Access control, privileged access (role changes audited + alerted)
 *  - A.5.17 / A.8.5  Authentication information, secure authentication (lockout, risk engine)
 *  - A.8.15 / A.8.16 Logging and monitoring (every auth event, new-location alerts)
 *
 * Fixes vs previous version:
 *  - Login response no longer contains the password hash
 *  - Password history stores previous HASHES (was storing the plaintext new password) and the
 *    const-reassignment bug that crashed password changes is fixed
 *  - Passwords are generated with crypto.randomInt (Math.random is not cryptographically secure)
 *  - `mongoose` was used without being required in deleteUserProfile
 *  - updateUser only accepts whitelisted fields (no mass-assignment of password/role by non-admins)
 *  - Admin user creation no longer returns a JWT for the newly created account
 *  - IP addresses come from the server (req.ip), never from req.body.ip
 */

'use strict';

const crypto = require('crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const logger = require('../utils/logger');
const emailService = require('../utils/emailService');
const rateLimitService = require('../services/rateLimitService');
const { AppError } = require('../middlewares/errorMiddleware');
const { sendAuditEmail } = require('../services/notificationService');
const auditService = require('../services/auditService');
const securityAlertService = require('../services/securityAlertService');
const geoIp = require('../services/geoIpService');
const auditContext = require('../utils/auditContext');
const cfg = require('../config/auditConfig');
const { actorFromUser, anonymousActor, displayName, maskEmail } = require('../utils/auditActor');

// ---- Password Policy (NIST SP 800-63B aligned) ----
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
const validatePassword = (password) => PASSWORD_REGEX.test(String(password || ''));

const ADMIN_ROLES = cfg.ROLE_GROUPS.admin;
const SELF_EDITABLE = ['firstname', 'lastname', 'name', 'phone', 'phoneNumber', 'gender', 'country', 'address'];
const ADMIN_EDITABLE = [...SELF_EDITABLE, 'email', 'role', 'permissions', 'isActive', 'status', 'position', 'department', 'companyName', 'companyId'];
const HIDDEN_USER_FIELDS = ['password', 'passwordHistory', 'twoFactorSecret', 'resetPasswordToken', 'resetPasswordExpire', 'resetPasswordExpires', '__v'];

function generateRandomPassword(length = 14) {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '@$!%*?&'];
  const all = sets.join('');
  const chars = sets.map((s) => s[crypto.randomInt(s.length)]);
  while (chars.length < length) chars.push(all[crypto.randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

const generateToken = (id) => jwt.sign({ id, type: 'access' }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '30d' });
const generateRefreshToken = (id) => jwt.sign({ id, type: 'refresh' }, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' });

function sanitizeUser(user) {
  if (!user) return user;
  const o = typeof user.toObject === 'function' ? user.toObject() : { ...user };
  HIDDEN_USER_FIELDS.forEach((f) => delete o[f]);
  return o;
}

const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));

async function createSessionRecord({ user, token, assessment }) {
  const Session = mongoose.models.Session;
  if (!Session) return null;
  try {
    const decoded = jwt.decode(token);
    const s = await Session.create({
      user: user._id,
      token,
      device: assessment.network.device,
      browser: assessment.network.browser,
      os: assessment.network.os,
      ip: assessment.network.ip,
      ipAddress: assessment.network.ip,
      location: geoIp.describe(assessment.geo),
      userAgent: assessment.network.userAgent,
      isActive: true,
      expiresAt: decoded && decoded.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 30 * 86400000),
    });
    return s._id;
  } catch (e) {
    logger.error('Session record could not be created:', e.message);
    return null;
  }
}

// ============================================================ EMAIL TEMPLATES
const credentialsEmail = ({ heading, intro, user, password }) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${heading}</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #964FFE; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { padding: 20px; background: #f9f9f9; }
        .footer { text-align: center; padding: 10px; font-size: 12px; color: #888; }
        .password { background: #fff; padding: 10px; border: 2px dashed #964FFE; border-radius: 4px; font-size: 18px; font-weight: bold; word-break: break-all; }
        .button { display: inline-block; padding: 12px 24px; background: #964FFE; color: white !important; text-decoration: none; border-radius: 4px; margin: 15px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header"><h1>${heading}</h1></div>
        <div class="content">
            <p>Dear <strong>${displayName(user)}</strong>,</p>
            <p>${intro}</p>
            <p><strong>Temporary Password:</strong></p>
            <div class="password">${password}</div>
            <p>To keep your account secure, please change your password immediately:</p>
            <a href="${process.env.FRONTEND_URL}/create-new-password?userId=${user._id}" class="button">Change Your Password</a>
            <p>Best Regards,</p>
            <p><strong>GSJX LTD Team</strong></p>
        </div>
        <div class="footer"><p>&copy; ${new Date().getFullYear()} GSJX LTD. All rights reserved.</p></div>
    </div>
</body>
</html>`;

// ============================================================ REGISTER
// @desc    Register new user
// @route   POST /api/user/register
// @access  Private (Admin/Superadmin)
exports.userRegister = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new AppError(errors.array().map((err) => err.msg).join(', '), 400);

  const { email, password } = req.body;
  const userExists = await User.findOne({ email });
  if (userExists) throw new AppError('User already exists', 400);
  if (password && !validatePassword(password)) {
    throw new AppError('Password must be at least 8 characters with uppercase, lowercase, number, and special character', 400);
  }
  const userPassword = password || generateRandomPassword();

  const body = { ...req.body };
  ['password', 'passwordHistory', 'twoFactorSecret', 'deleted', 'deletedAt', '_id'].forEach((f) => delete body[f]);

  const user = await User.create({
    ...body,
    password: userPassword,
    createdBy: req.user.name || req.user.email,
    firstLogin: true,
    generatedPassword: !password,
    status: 'active',
    emailVerified: false,
    twoFactorEnabled: false,
    passwordChangedAt: Date.now(),
  });

  await auditService.record({
    action: 'user.registered',
    category: 'administration',
    severity: ADMIN_ROLES.includes(String(user.role).toLowerCase()) ? 'high' : 'medium',
    module: 'User Management',
    description: `${displayName(req.user)} created user ${user.email} with role "${user.role || 'user'}"`,
    target: { type: 'User', id: String(user._id), label: user.email },
    metadata: { role: user.role, department: user.department, position: user.position, generatedPassword: !password },
  });

  try {
    await emailService.sendEmail(user.email, 'Welcome to GSJX LTD - Temporary Password', credentialsEmail({
      heading: 'Welcome to GSJX LTD!', intro: 'Your account has been successfully created by an administrator.', user, password: userPassword,
    }));
  } catch (emailError) {
    logger.error('Welcome email failed:', emailError);
  }

  res.status(201).json({ responseCode: '00', responseMessage: 'User registered successfully', responseData: sanitizeUser(user) });
});

// ============================================================ LOGIN
// @desc    Authenticate user & get token
// @route   POST /api/user/login
// @access  Public
exports.authUser = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new AppError(errors.array().map((err) => err.msg).join(', '), 400);

  const email = String(req.body.email || '').trim();
  const { password } = req.body;
  if (!email || !password) throw new AppError('Email and password are required', 400);
  const idMeta = securityAlertService.identifierMeta(email);

  // 1. Rate limiting
  const isRateLimited = await rateLimitService.check(`login_${email.toLowerCase()}`, 5, 900000);
  if (isRateLimited) {
    await auditService.record({
      action: 'auth.login_rate_limited', category: 'security', outcome: 'denied', severity: 'medium', module: 'Authentication',
      actor: anonymousActor(email), description: `Sign-in rate limit reached for ${maskEmail(email)}`, metadata: idMeta,
    });
    throw new AppError('Too many login attempts. Please try again later.', 429);
  }

  // 2. Unknown account
  const user = await User.findOne({ email }).select('+password');
  if (!user || user.deleted) {
    await auditService.record({
      action: 'auth.login_failed', category: 'authentication', outcome: 'failure', severity: 'low', module: 'Authentication',
      actor: anonymousActor(email), description: `Failed sign-in for unknown account ${maskEmail(email)}`, metadata: { ...idMeta, reason: 'unknown_account' },
    });
    await securityAlertService.recordFailedLogin({ user: null, identifier: email, req });
    throw new AppError('Invalid email or password', 401);
  }
  const actor = actorFromUser(user);
  const userTarget = { type: 'User', id: String(user._id), label: user.email };

  // 3. Locked
  const lock = await securityAlertService.checkLock(user._id);
  if (lock.locked) {
    await auditService.record({
      action: 'auth.login_blocked', category: 'authentication', outcome: 'denied', severity: 'medium', module: 'Authentication',
      actor, target: userTarget, description: `Sign-in refused for ${displayName(user)}: account locked (${lock.reason})`, metadata: { ...idMeta, reason: lock.reason, lockUntil: lock.lockUntil },
    });
    const msg = lock.reason === 'compromise_reported'
      ? 'This account has been locked for your protection. Please contact an administrator.'
      : `Account temporarily locked after too many failed attempts. Try again after ${new Date(lock.lockUntil).toUTCString()}.`;
    throw new AppError(msg, 423);
  }

  // 4. Deactivated
  if (!user.isActive) {
    await auditService.record({
      action: 'auth.login_blocked', category: 'authentication', outcome: 'denied', severity: 'medium', module: 'Authentication',
      actor, target: userTarget, description: `Sign-in refused for ${displayName(user)}: account deactivated`, metadata: { ...idMeta, reason: 'account_inactive' },
    });
    throw new AppError('Account is deactivated. Contact administrator.', 403);
  }

  // 5. Wrong password
  const isPasswordValid = await user.matchPassword(password);
  if (!isPasswordValid) {
    await auditService.record({
      action: 'auth.login_failed', category: 'authentication', outcome: 'failure', severity: 'low', module: 'Authentication',
      actor, target: userTarget, description: `Failed sign-in for ${displayName(user)}: wrong password`, metadata: { ...idMeta, reason: 'invalid_password' },
    });
    const r = await securityAlertService.recordFailedLogin({ user, identifier: email, req });
    if (r.locked) throw new AppError(`Too many failed attempts. Your account is locked for ${cfg.alerts.lockoutMinutes} minutes.`, 423);
    throw new AppError('Invalid email or password', 401);
  }

  // 6. Risk assessment (new country/city/device, impossible travel, …)
  await securityAlertService.resetFailedLogins(user._id);
  const assessment = await securityAlertService.evaluateLogin({ user, req });
  const where = geoIp.describe(assessment.geo);
  const device = `${assessment.network.browser} on ${assessment.network.os}`;

  if (assessment.blocked) {
    await auditService.record({
      action: 'auth.login_blocked', category: 'security', outcome: 'denied', severity: 'critical', module: 'Authentication',
      actor, target: userTarget, risk: { score: assessment.riskScore, reasons: assessment.reasons },
      description: `High-risk sign-in blocked for ${displayName(user)} from ${where} (${assessment.reasons.join(', ')})`,
      metadata: { ...idMeta, alertId: assessment.alert && String(assessment.alert._id) },
    });
    throw new AppError('Sign-in blocked because it came from an unusual location. Check your e-mail to confirm it was you, then try again.', 403);
  }

  // 7. Success
  user.lastLogin = new Date();
  user.lastLoginIp = assessment.network.ip;
  await auditContext.withoutTrail(() => user.save());

  const token = generateToken(user._id);
  const refreshToken = generateRefreshToken(user._id);
  const sessionId = await createSessionRecord({ user, token, assessment });
  const ctx = auditContext.get();
  if (ctx && sessionId) ctx.sessionId = String(sessionId);

  const loginEvent = await auditService.record({
    action: 'auth.login_success',
    category: 'authentication',
    outcome: 'success',
    severity: assessment.reasons.length ? assessment.severity : 'info',
    module: 'Authentication',
    actor,
    target: userTarget,
    sessionId: sessionId ? String(sessionId) : undefined,
    risk: { score: assessment.riskScore, reasons: assessment.reasons },
    description: `${displayName(user)} signed in from ${where} using ${device}${assessment.reasons.length ? ` – flagged: ${assessment.reasons.join(', ')}` : ''}`,
    metadata: { isFirstLogin: assessment.isFirstLogin, alertId: assessment.alert ? String(assessment.alert._id) : undefined },
  });
  if (assessment.alert && loginEvent) {
    await mongoose.models.SecurityAlert.updateOne({ _id: assessment.alert._id }, { $addToSet: { auditEventIds: loginEvent.eventId } });
  }

  res.json({
    responseCode: '00',
    responseMessage: 'Login successful',
    responseData: sanitizeUser(user),
    token,
    refreshToken,
    security: {
      unusualSignIn: assessment.reasons.length > 0,
      reasons: assessment.reasons,
      riskScore: assessment.riskScore,
      location: where,
      device,
      alertId: assessment.alert ? String(assessment.alert._id) : null,
    },
  });
});

// ============================================================ LOGOUT
// @desc    Log out – terminates the current session record
// @route   POST /api/user/logout
// @access  Private
exports.logoutUser = asyncHandler(async (req, res) => {
  const token = req.token || (req.headers.authorization || '').split(' ')[1];
  const Session = mongoose.models.Session;
  let terminated = 0;
  if (Session && token) {
    const r = await Session.updateMany({ user: req.user._id, token, isActive: true }, { $set: { isActive: false, terminatedAt: new Date(), terminationReason: 'User logout' } });
    terminated = r.modifiedCount || 0;
  }
  await auditService.record({
    action: 'auth.logout', category: 'authentication', module: 'Authentication',
    description: `${displayName(req.user)} signed out`, metadata: { sessionsTerminated: terminated },
  });
  res.json({ responseCode: '00', responseMessage: 'Logged out successfully' });
});

// ============================================================ CHANGE PASSWORD
// @desc    Change password (requires current password)
// @route   POST /api/user/change-password
// @access  Private (or first-login flow)
exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  const userId = req.body.userId || (req.user && req.user._id);

  if (!userId || !currentPassword || !newPassword) throw new AppError('Current password and new password are required.', 400);
  if (newPassword !== confirmPassword) throw new AppError('Passwords do not match.', 400);
  if (!validatePassword(newPassword)) {
    throw new AppError('Password must be at least 8 characters with uppercase, lowercase, number, and special character', 400);
  }
  if (req.user && String(req.user._id) !== String(userId) && !ADMIN_ROLES.includes(String(req.user.role).toLowerCase())) {
    await auditService.record({ action: 'auth.password_change_denied', category: 'authorization', outcome: 'denied', module: 'Authentication', description: `${displayName(req.user)} tried to change another user's password`, target: { type: 'User', id: String(userId) } });
    throw new AppError('You can only change your own password.', 403);
  }

  const isRateLimited = await rateLimitService.check(`password_change_${userId}`, 3, 3600000);
  if (isRateLimited) throw new AppError('Too many password change attempts. Please try again later.', 429);

  const user = await User.findById(userId).select('+password +passwordHistory');
  if (!user) throw new AppError('User not found.', 404);
  const target = { type: 'User', id: String(user._id), label: user.email };

  const isCurrentValid = await user.matchPassword(currentPassword);
  if (!isCurrentValid) {
    await auditService.record({ action: 'auth.password_change_failed', category: 'authentication', outcome: 'failure', module: 'Authentication', actor: actorFromUser(user), target, description: `Failed password change for ${displayName(user)}: wrong current password` });
    throw new AppError('Current password is incorrect.', 401);
  }

  const previousHash = user.password;
  const history = Array.isArray(user.passwordHistory) ? user.passwordHistory : [];
  const reused = await Promise.all([previousHash, ...history].filter(Boolean).map((h) => bcrypt.compare(newPassword, h)));
  if (reused.some(Boolean)) throw new AppError('Password has been used recently. Please choose a different password.', 400);

  user.password = newPassword; // hashed by the User model pre-save hook
  user.passwordHistory = [previousHash, ...history].filter(Boolean).slice(0, 5);
  user.firstLogin = false;
  user.generatedPassword = false;
  user.passwordChangedAt = Date.now();
  user.lastPasswordChange = Date.now();
  await user.save();

  let revoked = 0;
  try {
    revoked = await securityAlertService.revokeSessions(user._id, 'Password changed');
  } catch (e) {
    logger.error('Session revocation after password change failed:', e.message);
  }

  await auditService.record({
    action: 'auth.password_changed', category: 'authentication', severity: 'medium', module: 'Authentication',
    actor: actorFromUser(user), target, description: `${displayName(user)} changed their password (${revoked} other session(s) signed out)`,
    metadata: { sessionsRevoked: revoked },
  });

  try {
    await sendAuditEmail(user.email, 'Password Changed', 'Your password has been changed successfully. If this was not you, contact an administrator immediately.');
  } catch (emailError) {
    logger.error('Password change notification email failed:', emailError);
  }

  res.status(200).json({ responseCode: '00', responseMessage: 'Password changed successfully.' });
});

// ============================================================ ADMIN RESET PASSWORD
// @desc    Reset user password (admin)
// @route   POST /api/user/admin/reset-password
// @access  Private (Admin/Superadmin)
exports.adminResetUserPassword = asyncHandler(async (req, res) => {
  const { userId } = req.body;
  if (!userId || !mongoose.isValidObjectId(userId)) throw new AppError('A valid user ID is required.', 400);

  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found.', 404);

  const randomPassword = generateRandomPassword();
  user.password = randomPassword;
  user.firstLogin = true;
  user.generatedPassword = true;
  user.passwordChangedAt = Date.now();
  await user.save();

  let revoked = 0;
  try {
    revoked = await securityAlertService.revokeSessions(user._id, 'Password reset by administrator');
    const profile = await securityAlertService.getProfile(user._id);
    if (profile && profile.forcePasswordReset) {
      profile.forcePasswordReset = false;
      await profile.save();
    }
  } catch (e) {
    logger.error('Post-reset session handling failed:', e.message);
  }

  try {
    await emailService.sendEmail(user.email, 'Password Reset - GSJX LTD', credentialsEmail({
      heading: 'Password Reset', intro: 'Your password has been reset by an administrator.', user, password: randomPassword,
    }));
  } catch (emailError) {
    logger.error('Password reset email failed:', emailError);
  }

  await auditService.record({
    action: 'user.password_reset_by_admin', category: 'administration', severity: 'high', module: 'User Management',
    description: `${displayName(req.user)} reset the password of ${user.email} (${revoked} session(s) signed out)`,
    target: { type: 'User', id: String(user._id), label: user.email },
    metadata: { sessionsRevoked: revoked },
  });

  res.status(200).json({ responseCode: '00', responseMessage: 'Password reset successfully and sent to the user.' });
});

// ============================================================ UPDATE USER
// @desc    Update user profile
// @route   PUT /api/user/update/:id
// @access  Private (Admin/Superadmin or self)
exports.updateUser = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('Invalid user ID', 400);
  const user = await User.findById(req.params.id);
  if (!user || user.deleted) throw new AppError('User not found', 404);

  const isSelf = String(user._id) === String(req.user._id);
  const isAdmin = ADMIN_ROLES.includes(String(req.user.role).toLowerCase());
  if (!isSelf && !isAdmin) {
    await auditService.record({ action: 'user.update_denied', category: 'authorization', outcome: 'denied', module: 'User Management', description: `${displayName(req.user)} tried to edit ${user.email} without permission`, target: { type: 'User', id: String(user._id), label: user.email } });
    throw new AppError('Not authorized to update this user', 403);
  }

  const updateData = pick(req.body, isAdmin ? ADMIN_EDITABLE : SELF_EDITABLE);
  if (isSelf && String(req.user.role).toLowerCase() === 'superadmin' && updateData.role && updateData.role !== 'superadmin') {
    throw new AppError('Cannot demote yourself from superadmin', 400);
  }
  if (updateData.role && String(updateData.role).toLowerCase() === 'superadmin' && String(req.user.role).toLowerCase() !== 'superadmin') {
    await auditService.record({ action: 'user.privilege_escalation_denied', category: 'authorization', outcome: 'denied', severity: 'high', module: 'User Management', description: `${displayName(req.user)} tried to grant superadmin to ${user.email}`, target: { type: 'User', id: String(user._id), label: user.email } });
    throw new AppError('Only a superadmin can grant the superadmin role', 403);
  }
  if (updateData.email && updateData.email !== user.email) {
    const emailExists = await User.findOne({ email: updateData.email, _id: { $ne: user._id } });
    if (emailExists) throw new AppError('Email already exists', 400);
    updateData.emailVerified = false;
  }

  const before = sanitizeUser(user);
  const updatedUser = await auditContext.withoutTrail(() => User.findByIdAndUpdate(
    req.params.id,
    { ...updateData, updatedBy: req.user.name || req.user.email },
    { new: true, runValidators: true },
  ));
  const changes = auditService.diff(before, sanitizeUser(updatedUser), { ignore: ['updatedBy'] });
  const roleChanged = changes.some((c) => ['role', 'permissions'].includes(c.field.split('.')[0]));

  await auditService.record({
    action: roleChanged ? 'user.role_changed' : 'user.updated',
    category: roleChanged ? 'authorization' : 'administration',
    severity: roleChanged ? 'high' : 'low',
    module: 'User Management',
    description: `${displayName(req.user)} updated ${isSelf ? 'their own profile' : `user ${updatedUser.email}`}${changes.length ? ` (${changes.map((c) => c.field).join(', ')})` : ''}`,
    target: { type: 'User', id: String(updatedUser._id), label: updatedUser.email },
    changes,
  });

  res.json({ responseCode: '00', responseMessage: 'Completed Successfully', responseData: sanitizeUser(updatedUser) });
});

// ============================================================ READ USERS
// @desc    Get all users
// @route   GET /api/user/read
// @access  Private (Admin/Superadmin)
exports.getUsers = asyncHandler(async (req, res) => {
  const users = await User.find({ deleted: { $ne: true } }).sort({ createdAt: -1 }).lean();
  res.status(200).json({ responseCode: '00', responseMessage: 'Completed successfully', responseData: users.map(sanitizeUser) });
});

// @desc    Get user by ID
// @route   GET /api/user/read-by-id/:id
// @access  Private (Admin/Superadmin)
exports.getUserById = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('Invalid user ID', 400);
  const user = await User.findById(req.params.id).lean();
  if (!user || user.deleted) throw new AppError('User not found', 404);
  res.status(200).json({ responseCode: '00', responseMessage: 'Completed successfully', responseData: sanitizeUser(user) });
});

// ============================================================ DELETE USER (ADMIN)
// @desc    Delete user (soft delete)
// @route   DELETE /api/user/delete/:id
// @access  Private (Admin/Superadmin)
exports.deleteUserProfile = asyncHandler(async (req, res) => {
  const userId = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(userId)) throw new AppError('Invalid user ID', 400);

  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', 404);
  if (user.role === 'superadmin') throw new AppError('Cannot delete a superadmin user', 403);
  if (String(user._id) === String(req.user._id)) throw new AppError('You cannot delete your own account', 403);

  user.deleted = true;
  user.deletedAt = Date.now();
  user.deletedBy = req.user.name || req.user.email;
  user.status = 'deleted';
  await auditContext.withoutTrail(() => user.save());

  let revoked = 0;
  try {
    revoked = await securityAlertService.revokeSessions(user._id, 'Account deleted by administrator');
  } catch (e) {
    logger.error('Session revocation failed:', e.message);
  }

  await auditService.record({
    action: 'user.deleted', category: 'administration', severity: 'high', module: 'User Management',
    description: `${displayName(req.user)} deleted user ${user.email} (role ${user.role})`,
    target: { type: 'User', id: String(user._id), label: user.email },
    metadata: { role: user.role, sessionsRevoked: revoked },
  });

  res.status(200).json({ responseCode: '00', responseMessage: 'User deleted successfully' });
});

// ============================================================ GDPR
// @desc    GDPR: Export user data (Right of access / portability)
// @route   GET /api/gdpr/export
// @access  Private
exports.exportUserData = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).lean();
  if (!user) throw new AppError('User not found', 404);

  const AuditLog = mongoose.models.AuditLog;
  const UserLoginProfile = mongoose.models.UserLoginProfile;
  const [activity, signInProfile] = await Promise.all([
    AuditLog ? AuditLog.find({ 'actor.userId': user._id }).sort({ timestamp: -1 }).limit(5000).select('-integrity -retention -network.forwardedFor -network.deviceFingerprint').lean() : [],
    UserLoginProfile ? UserLoginProfile.findOne({ user: user._id }).select('-_id -__v').lean() : null,
  ]);

  const exportData = {
    profile: {
      name: displayName(user), email: user.email, phone: user.phone || user.phoneNumber, gender: user.gender, country: user.country,
      address: user.address, position: user.position, department: user.department, role: user.role, createdAt: user.createdAt, lastLogin: user.lastLogin,
    },
    signInProfile,
    activity,
    exportDate: new Date().toISOString(),
    exportReason: 'User requested data export (GDPR / NDPA Right of Access)',
  };

  await auditService.record({
    action: 'privacy.subject_access_export', category: 'privacy', severity: 'medium', module: 'Privacy (GDPR)',
    description: `${displayName(req.user)} exported their personal data (${activity.length} activity records)`,
    metadata: { recordCount: activity.length },
  });

  res.status(200).json({ responseCode: '00', responseMessage: 'Data export completed', responseData: exportData });
});

// @desc    GDPR: Delete user account (Right to erasure)
// @route   DELETE /api/gdpr/delete-account
// @access  Private
exports.deleteUserAccount = asyncHandler(async (req, res) => {
  const { confirmationPassword } = req.body;
  if (!confirmationPassword) throw new AppError('Password confirmation is required to delete your account.', 400);

  const user = await User.findById(req.user._id).select('+password');
  if (!user) throw new AppError('User not found', 404);

  const isPasswordValid = await user.matchPassword(confirmationPassword);
  if (!isPasswordValid) {
    await auditService.record({ action: 'privacy.erasure_request_failed', category: 'privacy', outcome: 'failure', module: 'Privacy (GDPR)', description: `${displayName(user)} failed password confirmation for account deletion` });
    throw new AppError('Password is incorrect. Account deletion cancelled.', 401);
  }

  user.deleted = true;
  user.deletedAt = Date.now();
  user.status = 'deleted';
  user.dataProcessingConsent = false;
  user.marketingConsent = false;
  await auditContext.withoutTrail(() => user.save());

  let revoked = 0;
  try {
    revoked = await securityAlertService.revokeSessions(user._id, 'Account deleted by owner');
  } catch (e) {
    logger.error('Session revocation failed:', e.message);
  }

  await auditService.record({
    action: 'privacy.erasure_requested', category: 'privacy', severity: 'high', module: 'Privacy (GDPR)',
    description: `${displayName(user)} deleted their own account (GDPR / NDPA right to erasure). ${revoked} session(s) signed out.`,
    target: { type: 'User', id: String(user._id), label: user.email },
    metadata: { sessionsRevoked: revoked },
  });

  res.status(200).json({
    responseCode: '00',
    responseMessage: 'Your account has been deleted and you have been signed out. Records we must keep by law (e.g. financial and security audit records) are retained for their statutory period, after which they are erased or anonymised.',
  });
});
