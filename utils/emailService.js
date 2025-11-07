const nodemailer = require('nodemailer');
require('dotenv').config();

// Try multiple port/security configurations
const SMTP_CONFIGS = [
	{
		host: "smtp.mailhostbox.com",
		port: 587,
		secure: false, // Use TLS
		auth: {
			user: process.env.EMAIL_USER,
			pass: process.env.EMAIL_PASS,
		},
		tls: {
			rejectUnauthorized: false
		},
		connectionTimeout: 10000, // 10 seconds
		greetingTimeout: 10000,
		socketTimeout: 10000
	},
	{
		host: "smtp.mailhostbox.com",
		port: 465,
		secure: true, // Use SSL
		auth: {
			user: process.env.EMAIL_USER,
			pass: process.env.EMAIL_PASS,
		},
		tls: {
			rejectUnauthorized: false
		},
		connectionTimeout: 10000,
		greetingTimeout: 10000,
		socketTimeout: 10000
	},
	{
		host: "mail.globalsjxltd.com", // Try 'mail' instead of 'webmail'
		port: 587,
		secure: false,
		auth: {
			user: process.env.EMAIL_USER,
			pass: process.env.EMAIL_PASS,
		},
		tls: {
			rejectUnauthorized: false
		},
		connectionTimeout: 10000,
		greetingTimeout: 10000,
		socketTimeout: 10000
	}
];

// Try to find a working configuration
let transporter;
let workingConfig = null;

const initializeTransporter = async () => {
	for (let i = 0; i < SMTP_CONFIGS.length; i++) {
		try {
			const testTransporter = nodemailer.createTransport(SMTP_CONFIGS[i]);
			await testTransporter.verify();
			console.log(`✓ Email server ready with config ${i + 1} (${SMTP_CONFIGS[i].host}:${SMTP_CONFIGS[i].port})`);
			transporter = testTransporter;
			workingConfig = SMTP_CONFIGS[i];
			return;
		} catch (error) {
			console.error(`✗ Config ${i + 1} failed:`, error.message);
		}
	}

	// Fallback: use first config even if verification failed
	console.warn('⚠ No config verified successfully. Using first config as fallback.');
	transporter = nodemailer.createTransport(SMTP_CONFIGS[0]);
};

// Initialize on module load
initializeTransporter().catch(err => {
	console.error('Failed to initialize any email configuration:', err);
	// Create transporter anyway to prevent crashes
	transporter = nodemailer.createTransport(SMTP_CONFIGS[0]);
});

/**
 * Sends an email with the specified options.
 */
const sendEmail = async (to, subject, text, html, attachments = []) => {
	// Ensure transporter exists
	if (!transporter) {
		console.error('Transporter not initialized. Attempting to send anyway...');
		transporter = nodemailer.createTransport(SMTP_CONFIGS[0]);
	}

	const mailOptions = {
		from: `"Global SJX Ltd" <${process.env.EMAIL_USER}>`,
		to,
		subject,
		text,
		html: html || text,
		attachments,
	};

	try {
		const info = await transporter.sendMail(mailOptions);
		console.log('✓ Email sent successfully to:', to);
		console.log('Message ID:', info.messageId);
		return info;
	} catch (error) {
		console.error('✗ Error sending email to', to, ':', error.message);

		// Log detailed error for debugging
		if (error.code === 'ETIMEDOUT') {
			console.error('Connection timeout. Check:');
			console.error('1. Firewall allows outgoing connections on ports 587/465');
			console.error('2. Email server hostname is correct');
			console.error('3. Server IP is whitelisted on email server');
		}

		// Don't throw - just log and continue
		// This prevents the entire request from failing
		return { error: error.message };
	}
};

/**
 * Fetches emails from the inbox
 */
const Imap = require('imap');
const { simpleParser } = require('mailparser');

const imapConfig = {
	user: process.env.EMAIL_USER,
	password: process.env.EMAIL_PASS,
	host: 'webmail.globalsjxltd.com',
	port: 993,
	tls: true,
	tlsOptions: { rejectUnauthorized: false },
	connTimeout: 10000,
	authTimeout: 10000
};

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