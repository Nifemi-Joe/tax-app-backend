const nodemailer = require('nodemailer');
require('dotenv').config(); // Load environment variables

// Configuration for Global SJX Ltd webmail
const transporter = nodemailer.createTransport({
	host: "webmail.globalsjxltd.com",
	port: 465, // Use 587 for TLS or 465 for SSL
	secure: true, // true for 465, false for 587
	auth: {
		user: process.env.EMAIL_USER, // Your full company email address
		pass: process.env.EMAIL_PASS, // Your email password or app-specific password
	},
	tls: {
		rejectUnauthorized: false // Only if you encounter certificate issues
	}
});

// Verify transporter configuration
transporter.verify((error, success) => {
	if (error) {
		console.error('Transporter verification failed:', error);
	} else {
		console.log('Server is ready to send emails');
	}
});

/**
 * Sends an email with the specified options.
 *
 * @param {string} to - The recipient's email address.
 * @param {string} subject - The subject of the email.
 * @param {string} text - The plain text body of the email.
 * @param {string} [html] - The HTML body of the email (optional).
 * @param {Array} [attachments] - Array of attachments (optional).
 * @returns {Promise} - A promise that resolves when the email is sent.
 */
const sendEmail = async (to, subject, text, html, attachments = []) => {
	const mailOptions = {
		from: `"Global SJX Ltd" <${process.env.EMAIL_USER}>`, // Use your actual company email
		to,
		subject,
		text, // Plain text version
		html: html || text, // HTML version (falls back to text)
		attachments,
	};

	try {
		const info = await transporter.sendMail(mailOptions);
		console.log('Email sent successfully!');
		console.log('Message ID: %s', info.messageId);
		return info;
	} catch (error) {
		console.error('Error sending email: %s', error.message);
		throw error;
	}
};

/**
 * Receives/reads emails using IMAP (if your server supports it)
 * Note: This requires the 'imap' package: npm install imap mailparser
 */
const Imap = require('imap');
const { simpleParser } = require('mailparser');

const imapConfig = {
	user: process.env.EMAIL_USER,
	password: process.env.EMAIL_PASS,
	host: 'webmail.globalsjxltd.com',
	port: 993, // IMAP SSL port
	tls: true,
	tlsOptions: { rejectUnauthorized: false }
};

/**
 * Fetches emails from the inbox
 * @param {number} limit - Number of recent emails to fetch
 * @returns {Promise<Array>} - Array of parsed email objects
 */
const receiveEmails = (limit = 10) => {
	return new Promise((resolve, reject) => {
		const imap = new Imap(imapConfig);
		const emails = [];

		imap.once('ready', () => {
			imap.openBox('INBOX', false, (err, box) => {
				if (err) {
					reject(err);
					return;
				}

				const fetchRange = `${Math.max(1, box.messages.total - limit + 1)}:*`;

				const f = imap.seq.fetch(fetchRange, {
					bodies: '',
					struct: true
				});

				f.on('message', (msg) => {
					msg.on('body', (stream) => {
						simpleParser(stream, (err, parsed) => {
							if (err) {
								console.error('Parse error:', err);
								return;
							}
							emails.push({
								from: parsed.from.text,
								subject: parsed.subject,
								date: parsed.date,
								text: parsed.text,
								html: parsed.html,
								attachments: parsed.attachments
							});
						});
					});
				});

				f.once('error', (err) => {
					reject(err);
				});

				f.once('end', () => {
					imap.end();
					resolve(emails);
				});
			});
		});

		imap.once('error', (err) => {
			reject(err);
		});

		imap.connect();
	});
};

module.exports = { sendEmail, receiveEmails, transporter };