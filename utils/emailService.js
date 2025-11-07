const nodemailer = require('nodemailer');
require('dotenv').config();

// MailHostBox-specific SMTP configurations
const SMTP_CONFIGS = [
	{
		// Primary: MailHostBox SMTP with STARTTLS (Most reliable)
		host: "smtp.mailhostbox.com",
		port: 587,
		secure: false,
		requireTLS: true,
		auth: {
			user: process.env.EMAIL_USER,
			pass: process.env.EMAIL_PASS,
		},
		tls: {
			ciphers: 'SSLv3',
			rejectUnauthorized: false
		},
		connectionTimeout: 15000,
		greetingTimeout: 15000,
		socketTimeout: 15000
	},
	{
		// Alternative: SSL/TLS on port 465
		host: "smtp.mailhostbox.com",
		port: 465,
		secure: true,
		auth: {
			user: process.env.EMAIL_USER,
			pass: process.env.EMAIL_PASS,
		},
		tls: {
			ciphers: 'SSLv3',
			rejectUnauthorized: false
		},
		connectionTimeout: 15000,
		greetingTimeout: 15000,
		socketTimeout: 15000
	},
	{
		// Fallback: Port 2525 (some hosts block 587/465)
		host: "smtp.mailhostbox.com",
		port: 2525,
		secure: false,
		requireTLS: true,
		auth: {
			user: process.env.EMAIL_USER,
			pass: process.env.EMAIL_PASS,
		},
		tls: {
			ciphers: 'SSLv3',
			rejectUnauthorized: false
		},
		connectionTimeout: 15000,
		greetingTimeout: 15000,
		socketTimeout: 15000
	}
];

let transporter;
let workingConfig = null;
let isInitializing = false;
let initializePromise = null;

const initializeTransporter = async () => {
	if (isInitializing && initializePromise) {
		return initializePromise;
	}

	isInitializing = true;
	initializePromise = (async () => {
		console.log('🔄 Initializing email transporter...');

		for (let i = 0; i < SMTP_CONFIGS.length; i++) {
			try {
				console.log(`Testing config ${i + 1}: ${SMTP_CONFIGS[i].host}:${SMTP_CONFIGS[i].port}`);
				const testTransporter = nodemailer.createTransport(SMTP_CONFIGS[i]);

				await testTransporter.verify();

				console.log(`✓ Email server connected successfully!`);
				console.log(`  Host: ${SMTP_CONFIGS[i].host}`);
				console.log(`  Port: ${SMTP_CONFIGS[i].port}`);
				console.log(`  Secure: ${SMTP_CONFIGS[i].secure}`);

				transporter = testTransporter;
				workingConfig = SMTP_CONFIGS[i];
				isInitializing = false;
				return;
			} catch (error) {
				console.error(`✗ Config ${i + 1} failed: ${error.message}`);
				if (error.code === 'EAUTH') {
					console.error('  → Authentication failed. Check EMAIL_USER and EMAIL_PASS');
				}
				if (error.code === 'ETIMEDOUT' || error.code === 'ECONNECTION') {
					console.error('  → Connection timeout. Port may be blocked');
				}
			}
		}

		console.warn('⚠ No config verified successfully. Using first config as fallback.');
		transporter = nodemailer.createTransport(SMTP_CONFIGS[0]);
		isInitializing = false;
	})();

	return initializePromise;
};

// Initialize on module load
initializeTransporter().catch(err => {
	console.error('❌ Failed to initialize email configuration:', err);
	transporter = nodemailer.createTransport(SMTP_CONFIGS[0]);
	isInitializing = false;
});

/**
 * Sends an email with the specified options.
 * @param {string|string[]} to - Recipient email(s)
 * @param {string} subject - Email subject
 * @param {string} text - Plain text content
 * @param {string} html - HTML content
 * @param {Array} attachments - Email attachments
 */
const sendEmail = async (to, subject, text, html, attachments = []) => {
	// Ensure transporter is initialized
	if (!transporter) {
		console.log('⏳ Transporter not ready, initializing...');
		await initializeTransporter();
	}

	// Handle array of email addresses
	const recipients = Array.isArray(to) ? to.join(', ') : to;

	const mailOptions = {
		from: `"Global SJX Ltd" <${process.env.EMAIL_USER}>`,
		to: recipients,
		subject,
		text,
		html: html || text,
		attachments,
	};

	try {
		const info = await transporter.sendMail(mailOptions);
		console.log('✓ Email sent successfully');
		console.log(`  To: ${recipients}`);
		console.log(`  Subject: ${subject}`);
		console.log(`  Message ID: ${info.messageId}`);
		return info;
	} catch (error) {
		console.error('✗ Failed to send email');
		console.error(`  To: ${recipients}`);
		console.error(`  Error: ${error.message}`);

		// Detailed error diagnostics
		if (error.code === 'ETIMEDOUT') {
			console.error('  → Connection timeout occurred');
			console.error('  → Check if Render.com allows outgoing SMTP connections');
			console.error('  → Consider whitelisting Render IP on MailHostBox');
		} else if (error.code === 'EAUTH') {
			console.error('  → Authentication failed');
			console.error('  → Verify EMAIL_USER and EMAIL_PASS in environment variables');
		} else if (error.code === 'EENVELOPE') {
			console.error('  → Invalid email address format');
		}

		// Return error object instead of throwing to prevent request failure
		return {
			success: false,
			error: error.message,
			code: error.code
		};
	}
};

/**
 * Fetches emails from the inbox using IMAP
 */
const Imap = require('imap');
const { simpleParser } = require('mailparser');

// MailHostBox IMAP configuration
const imapConfig = {
	user: process.env.EMAIL_USER,
	password: process.env.EMAIL_PASS,
	host: 'imap.mailhostbox.com', // Use MailHostBox IMAP server
	port: 993,
	tls: true,
	tlsOptions: {
		rejectUnauthorized: false,
		minVersion: 'TLSv1'
	},
	connTimeout: 15000,
	authTimeout: 15000
};

const receiveEmails = (limit = 10) => {
	return new Promise((resolve, reject) => {
		console.log('📧 Connecting to IMAP server...');
		const imap = new Imap(imapConfig);
		const emails = [];

		imap.once('ready', () => {
			console.log('✓ IMAP connected successfully');
			imap.openBox('INBOX', false, (err, box) => {
				if (err) {
					console.error('✗ Failed to open INBOX:', err.message);
					reject(err);
					return;
				}

				console.log(`📬 Fetching last ${limit} emails...`);
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
					console.error('✗ Fetch error:', err.message);
					reject(err);
				});

				f.once('end', () => {
					console.log(`✓ Successfully fetched ${emails.length} emails`);
					imap.end();
					resolve(emails);
				});
			});
		});

		imap.once('error', (err) => {
			console.error('✗ IMAP connection error:', err.message);
			reject(err);
		});

		imap.connect();
	});
};

// Export functions
module.exports = {
	sendEmail,
	receiveEmails,
	transporter: () => transporter // Export as function to get current transporter
};