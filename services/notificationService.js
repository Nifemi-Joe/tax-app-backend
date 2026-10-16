/**
 * @file notificationService.js
 * @description Comprehensive notification service with email, SMS, and in-app notifications
 */

const nodemailer = require('nodemailer');
const twilio = require('twilio');
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');
const { generateEmailTemplate } = require('../utils/emailTemplate');
const logger = require('../utils/logger');

// ============================================================
// EMAIL CONFIGURATION
// ============================================================
let transporter = null;

const initializeEmailTransporter = () => {
	if (transporter) return transporter;

	try {
		if (process.env.EMAIL_SERVICE === 'sendgrid') {
			// SendGrid configuration
			const sgMail = require('@sendgrid/mail');
			sgMail.setApiKey(process.env.SENDGRID_API_KEY);

			transporter = {
				sendMail: async (mailOptions) => {
					return sgMail.send({
						to: mailOptions.to,
						from: process.env.SENDGRID_FROM_EMAIL || process.env.EMAIL_USER,
						subject: mailOptions.subject,
						html: mailOptions.html,
						text: mailOptions.text,
					});
				}
			};
		} else {
			// Nodemailer configuration (Gmail or other SMTP)
			transporter = nodemailer.createTransport({
				service: process.env.EMAIL_SERVICE || 'gmail',
				auth: {
					user: process.env.EMAIL_USER,
					pass: process.env.EMAIL_PASS,
				},
				pool: {
					maxConnections: 1,
					maxMessages: 5,
					rateDelta: 2000,
					rateLimit: true,
				}
			});

			// Verify connection
			transporter.verify((error, success) => {
				if (error) {
					logger.error('Email transporter verification failed:', error);
				} else {
					logger.info('Email transporter verified successfully');
				}
			});
		}

		return transporter;
	} catch (error) {
		logger.error('Error initializing email transporter:', error);
		return null;
	}
};

// ============================================================
// SMS CONFIGURATION
// ============================================================
let twilioClient = null;

const initializeTwilio = () => {
	if (twilioClient) return twilioClient;

	try {
		if (process.env.TWILIO_SID && process.env.TWILIO_AUTH_TOKEN) {
			twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
			logger.info('Twilio client initialized successfully');
		}
		return twilioClient;
	} catch (error) {
		logger.error('Error initializing Twilio:', error);
		return null;
	}
};

// ============================================================
// EMAIL NOTIFICATION SERVICES
// ============================================================

/**
 * Send email using template
 */
exports.sendTemplateEmail = async (to, templateName, context = {}) => {
	try {
		const emailTransporter = initializeEmailTransporter();
		if (!emailTransporter) {
			throw new Error('Email transporter not initialized');
		}

		const template = await generateEmailTemplate(templateName, context);

		const mailOptions = {
			from: process.env.EMAIL_USER || process.env.SENDGRID_FROM_EMAIL,
			to: to,
			subject: template.subject,
			html: template.html,
			text: template.text || '',
		};

		const info = await emailTransporter.sendMail(mailOptions);

		logger.info(`Email sent to ${to} with template ${templateName}`, {
			messageId: info.messageId,
			templateName,
		});

		return {
			success: true,
			messageId: info.messageId,
			template: templateName,
		};
	} catch (error) {
		logger.error(`Error sending email to ${to}:`, error);
		throw error;
	}
};

/**
 * Send custom email
 */
exports.sendEmail = async (to, subject, html) => {
	try {
		const emailTransporter = initializeEmailTransporter();
		if (!emailTransporter) {
			throw new Error('Email transporter not initialized');
		}

		const mailOptions = {
			from: process.env.EMAIL_USER || process.env.SENDGRID_FROM_EMAIL,
			to: to,
			subject: subject,
			html: html,
		};

		const info = await emailTransporter.sendMail(mailOptions);

		logger.info(`Custom email sent to ${to}`, { messageId: info.messageId });

		return {
			success: true,
			messageId: info.messageId,
		};
	} catch (error) {
		logger.error(`Error sending email to ${to}:`, error);
		throw error;
	}
};

/**
 * Send welcome email
 */
exports.sendWelcomeEmail = async (email, name, password, frontendUrl) => {
	return exports.sendTemplateEmail(email, 'welcome', {
		name,
		email,
		password,
		frontendUrl,
	});
};

/**
 * Send password reset email
 */
exports.sendPasswordResetEmail = async (email, name, password, frontendUrl) => {
	return exports.sendTemplateEmail(email, 'passwordReset', {
		name,
		email,
		password,
		frontendUrl,
	});
};

/**
 * Send password changed notification
 */
exports.sendPasswordChangedEmail = async (email, name, ipAddress, frontendUrl) => {
	return exports.sendTemplateEmail(email, 'passwordChanged', {
		name,
		email,
		ipAddress,
		frontendUrl,
	});
};

/**
 * Send email verification
 */
exports.sendEmailVerification = async (email, name, verificationCode, verificationLink, frontendUrl) => {
	return exports.sendTemplateEmail(email, 'emailVerification', {
		name,
		email,
		verificationCode,
		verificationLink,
		frontendUrl,
	});
};

/**
 * Send login alert
 */
exports.sendLoginAlert = async (email, name, location, device, browser, ipAddress, frontendUrl) => {
	return exports.sendTemplateEmail(email, 'loginAlert', {
		name,
		email,
		location,
		device,
		browser,
		ipAddress,
		frontendUrl,
	});
};

/**
 * Send suspicious activity alert
 */
exports.sendSuspiciousActivityAlert = async (email, name, activityType, ipAddress, location, frontendUrl) => {
	return exports.sendTemplateEmail(email, 'suspiciousActivity', {
		name,
		email,
		activityType,
		ipAddress,
		location,
		frontendUrl,
	});
};

/**
 * Send invoice reminder
 */
exports.sendInvoiceReminder = async (email, clientName, invoiceNumber, amount, dueDate, daysOverdue, invoiceLink, frontendUrl) => {
	return exports.sendTemplateEmail(email, 'invoiceReminder', {
		clientName,
		email,
		invoiceNumber,
		amount,
		dueDate,
		daysOverdue,
		invoiceLink,
		frontendUrl,
	});
};

/**
 * Send audit alert
 */
exports.sendAuditEmail = async (email, subject, message, details = '', name = 'User', frontendUrl) => {
	return exports.sendTemplateEmail(email, 'auditAlert', {
		name,
		email,
		subject,
		message,
		details,
		frontendUrl,
	});
};

// ============================================================
// SMS NOTIFICATION SERVICES
// ============================================================

/**
 * Send SMS notification
 */
exports.sendSMS = async (phoneNumber, message) => {
	try {
		const client = initializeTwilio();
		if (!client) {
			throw new Error('Twilio not initialized');
		}

		const smsMessage = await client.messages.create({
			body: message,
			from: process.env.TWILIO_PHONE_NUMBER,
			to: phoneNumber,
		});

		logger.info(`SMS sent to ${phoneNumber}`, { messageSid: smsMessage.sid });

		return {
			success: true,
			messageSid: smsMessage.sid,
		};
	} catch (error) {
		logger.error(`Error sending SMS to ${phoneNumber}:`, error);
		throw error;
	}
};

/**
 * Send OTP via SMS
 */
exports.sendOTP = async (phoneNumber, otp) => {
	const message = `Your OTP is: ${otp}. Valid for 10 minutes. Do not share with anyone.`;
	return exports.sendSMS(phoneNumber, message);
};

// ============================================================
// IN-APP NOTIFICATION SERVICES
// ============================================================

/**
 * Create in-app notification
 */
exports.createNotification = async (userId, title, message, type = 'info', actionUrl = null, metadata = {}) => {
	try {
		const notification = await Notification.create({
			userId,
			title,
			message,
			type,
			actionUrl,
			metadata,
		});

		logger.info(`Notification created for user ${userId}`, { notificationId: notification._id });

		return {
			success: true,
			data: notification,
		};
	} catch (error) {
		logger.error(`Error creating notification for user ${userId}:`, error);
		throw error;
	}
};

/**
 * Get user notifications
 */
exports.getUserNotifications = async (userId, limit = 50, skip = 0) => {
	try {
		const notifications = await Notification.find({ userId })
			.sort({ createdAt: -1 })
			.limit(limit)
			.skip(skip);

		const total = await Notification.countDocuments({ userId });
		const unread = await Notification.countDocuments({ userId, read: false });

		return {
			success: true,
			data: notifications,
			pagination: {
				total,
				unread,
				limit,
				skip,
			},
		};
	} catch (error) {
		logger.error(`Error fetching notifications for user ${userId}:`, error);
		throw error;
	}
};

/**
 * Mark notification as read
 */
exports.markAsRead = async (notificationId) => {
	try {
		const notification = await Notification.findByIdAndUpdate(
			notificationId,
			{ read: true, readAt: new Date() },
			{ new: true }
		);

		if (!notification) {
			throw new Error('Notification not found');
		}

		return {
			success: true,
			data: notification,
		};
	} catch (error) {
		logger.error(`Error marking notification as read:`, error);
		throw error;
	}
};

/**
 * Mark all notifications as read
 */
exports.markAllAsRead = async (userId) => {
	try {
		await Notification.updateMany(
			{ userId, read: false },
			{ read: true, readAt: new Date() }
		);

		return {
			success: true,
			message: 'All notifications marked as read',
		};
	} catch (error) {
		logger.error(`Error marking all notifications as read for user ${userId}:`, error);
		throw error;
	}
};

/**
 * Delete notification
 */
exports.deleteNotification = async (notificationId) => {
	try {
		await Notification.findByIdAndDelete(notificationId);

		return {
			success: true,
			message: 'Notification deleted',
		};
	} catch (error) {
		logger.error(`Error deleting notification:`, error);
		throw error;
	}
};

/**
 * Bulk send notifications
 */
exports.bulkSendNotifications = async (userIds, title, message, type = 'info') => {
	try {
		const notifications = await Notification.insertMany(
			userIds.map(userId => ({
				userId,
				title,
				message,
				type,
			}))
		);

		logger.info(`Bulk notifications sent to ${userIds.length} users`);

		return {
			success: true,
			count: notifications.length,
			data: notifications,
		};
	} catch (error) {
		logger.error('Error sending bulk notifications:', error);
		throw error;
	}
};

// ============================================================
// COMBINED NOTIFICATION (Email + In-App)
// ============================================================

/**
 * Send notification via multiple channels
 */
exports.sendMultiChannelNotification = async (userId, email, options = {}) => {
	const {
		subject,
		title,
		message,
		templateName,
		context = {},
		channels = ['email', 'inApp'],
		type = 'info',
		actionUrl = null,
	} = options;

	try {
		const results = {
			success: true,
			channels: {},
		};

		// Send email
		if (channels.includes('email') && email && templateName) {
			try {
				results.channels.email = await exports.sendTemplateEmail(email, templateName, context);
			} catch (error) {
				logger.error('Error sending email notification:', error);
				results.channels.email = { success: false, error: error.message };
			}
		}

		// Send in-app
		if (channels.includes('inApp') && userId) {
			try {
				results.channels.inApp = await exports.createNotification(
					userId,
					title,
					message,
					type,
					actionUrl
				);
			} catch (error) {
				logger.error('Error creating in-app notification:', error);
				results.channels.inApp = { success: false, error: error.message };
			}
		}

		return results;
	} catch (error) {
		logger.error('Error sending multi-channel notification:', error);
		throw error;
	}
};

// Initialize on module load
initializeEmailTransporter();
initializeTwilio();

module.exports = exports;