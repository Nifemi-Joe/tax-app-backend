const nodemailer = require('nodemailer');
const twilio = require('twilio');
const Notification = require('../models/Notification'); // Assuming you have a Notification model
const asyncHandler = require('express-async-handler');
// const path = require('path');
// const ejs = require('ejs');
const { generateEmailTemplate } = require('../utils/emailTemplate');

// Setup Nodemailer for email notifications
const transporter = nodemailer.createTransport({
	service: 'Gmail', // or another email service provider
	auth: {
		user: process.env.EMAIL_USER,
		pass: process.env.EMAIL_PASS
	}
});

// Setup Twilio for SMS notifications
const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

// @desc    Send email notification
// @route   POST /api/notifications/email
// @access  Private
exports.sendEmailNotification = asyncHandler(async (req, res) => {
	const { to, subject, templateName, context } = req.body;

	if (!to || !subject || !templateName) {
		return res.status(400).json({ success: false, message: 'Required fields are missing' });
	}

	try {
		const emailTemplate = await generateEmailTemplate(templateName, context);

		const mailOptions = {
			from: process.env.EMAIL_USER,
			to,
			subject,
			html: emailTemplate
		};

		await transporter.sendMail(mailOptions);

		res.status(200).json({ success: true, message: 'Email sent successfully' });
	} catch (error) {
		res.status(500).json({ success: false, error: 'Failed to send email notification' });
	}
});

// @desc    Send SMS notification
// @route   POST /api/notifications/sms
// @access  Private
exports.sendSmsNotification = asyncHandler(async (req, res) => {
	const { to, body } = req.body;

	if (!to || !body) {
		return res.status(400).json({ success: false, message: 'Required fields are missing' });
	}

	try {
		await twilioClient.messages.create({
			body,
			from: process.env.TWILIO_PHONE_NUMBER,
			to
		});

		res.status(200).json({ success: true, message: 'SMS sent successfully' });
	} catch (error) {
		res.status(500).json({ success: false, error: 'Failed to send SMS notification' });
	}
});

// @desc    Create and store an in-app notification
// @route   POST /api/notifications/in-app
// @access  Private
exports.createInAppNotification = asyncHandler(async (req, res) => {
	const { userId, title, message } = req.body;

	if (!userId || !title || !message) {
		return res.status(400).json({ success: false, message: 'Required fields are missing' });
	}

	try {
		const notification = await Notification.create({
			userId,
			title,
			message,
			createdAt: new Date()
		});

		res.status(201).json({ success: true, data: notification });
	} catch (error) {
		res.status(500).json({ success: false, error: 'Failed to create in-app notification' });
	}
});

// @desc    Fetch notifications for a user
// @route   GET /api/notifications/:userId
// @access  Private
exports.getUserNotifications = asyncHandler(async (req, res) => {
	const { userId } = req.params;

	try {
		const notifications = await Notification.find({ userId }).sort({ createdAt: -1 });

		res.status(200).json({ success: true, data: notifications });
	} catch (error) {
		res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
	}
});

// @desc    Mark notification as read
// @route   PATCH /api/notifications/markRead/:id
// @access  Private
exports.markNotificationAsRead = asyncHandler(async (req, res) => {
	const { id } = req.params;

	try {
		const notification = await Notification.findByIdAndUpdate(id, { read: true }, { new: true });

		if (!notification) {
			return res.status(404).json({ success: false, message: 'Notification not found' });
		}

		res.status(200).json({ success: true, data: notification });
	} catch (error) {
		res.status(500).json({ success: false, error: 'Failed to mark notification as read' });
	}
});
