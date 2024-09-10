const nodemailer = require('nodemailer');

// Configuration for the email service
const transporter = nodemailer.createTransport({
	host: 'smtp.example.com', // Replace with your SMTP host
	port: 587, // Replace with your SMTP port
	secure: false, // Set to true if you're using port 465
	auth: {
		user: 'your-email@example.com', // Replace with your email address
		pass: 'your-email-password' // Replace with your email password
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
const sendEmail = async (to, subject, text, html = null, attachments = []) => {
	const mailOptions = {
		from: '"Your Company Name" <your-email@example.com>', // Replace with your 'From' address
		to,
		subject,
		text,
		html,
		attachments
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
