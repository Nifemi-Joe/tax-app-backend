const nodemailer = require('nodemailer');
require('dotenv').config(); // Load environment variables

// Configuration for the email service
const transporter = nodemailer.createTransport({
	host: "smtp.gmail.com",
	service: "gmail",
	port: 465,
	secure: true, // Convert string to boolean
	auth: {
		user: "globalsjxinfo@gmail.com",
		pass: "kjrc tnrg ekbu mubc",
	}
});

/**
 * Sends an email with the specified options.
 *
 * @param {string} to - The recipient's email address.
 * @param {string} subject - The subject of the email.
 * @param {string} text - The plain text body of the email.
 * @param {string} [html] - The HTML body of the email (optional).
 * @param {string} [attachments] - Array of attachments (optional).
 * @returns {Promise} - A promise that resolves when the email is sent.
 */
const sendEmail = async (to, subject, text, html , attachments = []) => {
	const mailOptions = {
		from: 'Global SJX Ltd',
		to,
		subject,
		html: text,
		attachments,
	};

	try {
		const info = await transporter.sendMail(mailOptions);
		console.log('Email sent: %s', info.messageId);
		return info;
	} catch (error) {
		console.error('Error sending email: %s', error.message);
		throw error;
	}
};

module.exports = sendEmail;