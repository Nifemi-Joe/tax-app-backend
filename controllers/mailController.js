const nodemailer = require('nodemailer');
const asyncHandler = require('express-async-handler');
const { check, validationResult } = require('express-validator');

// Set up nodemailer transporter (uses environment variables for security)
const transporter = nodemailer.createTransport({
	host: process.env.EMAIL_HOST,
	port: process.env.EMAIL_PORT,
	secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
	auth: {
		user: process.env.EMAIL_USER, // generated ethereal user
		pass: process.env.EMAIL_PASS, // generated ethereal password
	},
	tls: {
		rejectUnauthorized: false
	}
});

// @desc    Send an email to a recipient
// @route   POST /api/mail/send
// @access  Private
exports.sendMail = asyncHandler(async (req, res) => {
	await check('to', 'Recipient email is required and must be valid').isEmail().run(req);
	await check('subject', 'Email subject is required').not().isEmpty().run(req);
	await check('text', 'Email body is required').not().isEmpty().run(req);

	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return res.status(400).json({ errors: errors.array() });
	}

	const { to, subject, text, html } = req.body;

	const mailOptions = {
		from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM_ADDRESS}>`, // sender address
		to, // list of receivers
		subject, // Subject line
		text, // plain text body
		html, // html body
	};

	try {
		await transporter.sendMail(mailOptions);
		res.status(200).json({ message: 'Email sent successfully' });
	} catch (error) {
		console.error('Error sending email:', error);
		res.status(500).json({ message: 'Failed to send email', error: error.message });
	}
});

// @desc    Send an email with an attachment
// @route   POST /api/mail/sendWithAttachment
// @access  Private
exports.sendMailWithAttachment = asyncHandler(async (req, res) => {
	await check('to', 'Recipient email is required and must be valid').isEmail().run(req);
	await check('subject', 'Email subject is required').not().isEmpty().run(req);
	await check('text', 'Email body is required').not().isEmpty().run(req);
	await check('attachmentPath', 'Attachment path is required').not().isEmpty().run(req);

	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return res.status(400).json({ errors: errors.array() });
	}

	const { to, subject, text, html, attachmentPath } = req.body;

	const mailOptions = {
		from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM_ADDRESS}>`, // sender address
		to, // list of receivers
		subject, // Subject line
		text, // plain text body
		html, // html body
		attachments: [
			{
				path: attachmentPath, // path to the file on disk
			},
		],
	};

	try {
		await transporter.sendMail(mailOptions);
		res.status(200).json({ message: 'Email with attachment sent successfully' });
	} catch (error) {
		console.error('Error sending email with attachment:', error);
		res.status(500).json({ message: 'Failed to send email with attachment', error: error.message });
	}
});
