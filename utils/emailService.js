const sgMail = require('@sendgrid/mail');
require('dotenv').config();

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

class EmailService {
	constructor() {
		this.fromEmail = process.env.FROM_EMAIL || 'itbiz@globalsjxltd.com';
		this.companyName = process.env.COMPANY_NAME || 'Global SJX Ltd';
		this.isInitialized = !!process.env.SENDGRID_API_KEY;

		if (!this.isInitialized) {
			console.warn('⚠ SendGrid API key not found. Emails will not be sent.');
		} else {
			console.log('✓ SendGrid initialized successfully');
		}
	}

	/**
	 * Sends an email using SendGrid
	 * @param {string|string[]} to - Recipient email(s)
	 * @param {string} subject - Email subject
	 * @param {string} text - Plain text content
	 * @param {string} html - HTML content
	 * @param {Array} attachments - Email attachments
	 */
	async sendEmail(to, subject, text, html, attachments = []) {
		if (!this.isInitialized) {
			console.error('❌ SendGrid not initialized. Check SENDGRID_API_KEY environment variable.');
			return {
				success: false,
				error: 'SendGrid not configured',
				code: 'ENOTCONFIG'
			};
		}

		// Handle array of email addresses
		const recipients = Array.isArray(to) ? to : [to];

		const msg = {
			to: recipients,
			from: {
				email: this.fromEmail,
				name: this.companyName,
			},
			subject,
			text: text || '',
			html: html || text || '',
			attachments: attachments.map(att => ({
				content: att.content,
				filename: att.filename,
				type: att.type,
				disposition: 'attachment'
			}))
		};

		try {
			console.log('📤 Sending email via SendGrid...');
			console.log(`  To: ${recipients.join(', ')}`);
			console.log(`  Subject: ${subject}`);

			const [response] = await sgMail.send(msg);

			console.log('✓ Email sent successfully via SendGrid');
			console.log(`  Status: ${response.statusCode}`);
			console.log(`  Message ID: ${response.headers['x-message-id']}`);

			return {
				success: true,
				messageId: response.headers['x-message-id'],
				statusCode: response.statusCode
			};
		} catch (error) {
			console.error('✗ SendGrid email failed');
			console.error(`  To: ${recipients.join(', ')}`);
			console.error(`  Error: ${error.message}`);

			// Detailed error diagnostics
			if (error.response) {
				const { body } = error.response;
				console.error(`  SendGrid Error: ${JSON.stringify(body)}`);
			}

			return {
				success: false,
				error: error.message,
				code: error.code,
				details: error.response?.body
			};
		}
	}

	/**
	 * Send welcome email template
	 */
	async sendWelcomeEmail(to, userName) {
		const subject = `Welcome to ${this.companyName}!`;
		const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #4F46E5; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { padding: 30px; background: #f9f9f9; border-left: 1px solid #e0e0e0; border-right: 1px solid #e0e0e0; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; background: #fff; border-radius: 0 0 10px 10px; border: 1px solid #e0e0e0; border-top: none; }
          .button { display: inline-block; padding: 12px 24px; background: #4F46E5; color: white; text-decoration: none; border-radius: 5px; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to ${this.companyName}!</h1>
          </div>
          <div class="content">
            <h2>Hello ${userName},</h2>
            <p>Thank you for joining our platform. We're excited to have you on board!</p>
            <p>Get started by exploring our features and connecting with others.</p>
            <p>If you have any questions, feel free to reply to this email.</p>
            <p style="text-align: center;">
              <a href="https://yourplatform.com/dashboard" class="button">Get Started</a>
            </p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} ${this.companyName}. All rights reserved.</p>
            <p>This email was sent from our secure notification system.</p>
          </div>
        </div>
      </body>
      </html>
    `;

		const text = `Welcome to ${this.companyName}! Hello ${userName}, Thank you for joining our platform. We're excited to have you on board! Get started by exploring our features and connecting with others.`;

		return this.sendEmail(to, subject, text, html);
	}

	/**
	 * Send group invitation email
	 */
	async sendGroupInvitation(to, groupName, inviterName, groupId) {
		const subject = `You've been invited to join ${groupName}`;
		const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #10B981; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { padding: 30px; background: #f9f9f9; border-left: 1px solid #e0e0e0; border-right: 1px solid #e0e0e0; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; background: #fff; border-radius: 0 0 10px 10px; border: 1px solid #e0e0e0; border-top: none; }
          .button { display: inline-block; padding: 12px 24px; background: #10B981; color: white; text-decoration: none; border-radius: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Group Invitation</h1>
          </div>
          <div class="content">
            <h2>Hello,</h2>
            <p><strong>${inviterName}</strong> has invited you to join the group <strong>"${groupName}"</strong>.</p>
            <p>Join the group to connect with members and participate in discussions.</p>
            <p style="text-align: center;">
              <a href="https://yourplatform.com/groups/${groupId}" class="button">View Group</a>
            </p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} ${this.companyName}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

		const text = `Group Invitation: ${inviterName} has invited you to join the group "${groupName}". Join at: https://yourplatform.com/groups/${groupId}`;

		return this.sendEmail(to, subject, text, html);
	}

	/**
	 * Send password reset email
	 */
	async sendPasswordReset(to, userName, resetToken) {
		const subject = 'Password Reset Request';
		const resetLink = `https://yourplatform.com/reset-password?token=${resetToken}`;

		const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #EF4444; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { padding: 30px; background: #f9f9f9; border-left: 1px solid #e0e0e0; border-right: 1px solid #e0e0e0; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; background: #fff; border-radius: 0 0 10px 10px; border: 1px solid #e0e0e0; border-top: none; }
          .button { display: inline-block; padding: 12px 24px; background: #EF4444; color: white; text-decoration: none; border-radius: 5px; }
          .warning { color: #EF4444; font-size: 12px; margin-top: 20px; padding: 10px; background: #FEE2E2; border-radius: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Password Reset</h1>
          </div>
          <div class="content">
            <h2>Hello ${userName},</h2>
            <p>We received a request to reset your password. Click the button below to create a new password:</p>
            <p style="text-align: center;">
              <a href="${resetLink}" class="button">Reset Password</a>
            </p>
            <div class="warning">
              <strong>Important:</strong> This link will expire in 1 hour. If you didn't request this, please ignore this email.
            </div>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} ${this.companyName}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

		const text = `Password Reset Request: Hello ${userName}, We received a request to reset your password. Use this link to reset: ${resetLink} This link expires in 1 hour.`;

		return this.sendEmail(to, subject, text, html);
	}

	/**
	 * Send notification email
	 */
	async sendNotificationEmail(to, title, message, actionUrl = null, actionText = null) {
		const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #6B7280; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { padding: 30px; background: #f9f9f9; border-left: 1px solid #e0e0e0; border-right: 1px solid #e0e0e0; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; background: #fff; border-radius: 0 0 10px 10px; border: 1px solid #e0e0e0; border-top: none; }
          .button { display: inline-block; padding: 12px 24px; background: #6B7280; color: white; text-decoration: none; border-radius: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${title}</h1>
          </div>
          <div class="content">
            ${message.split('\n').map(line => `<p>${line}</p>`).join('')}
            ${actionUrl && actionText ? `
              <p style="text-align: center;">
                <a href="${actionUrl}" class="button">${actionText}</a>
              </p>
            ` : ''}
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} ${this.companyName}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

		return this.sendEmail(to, title, message, html);
	}

	/**
	 * Test email configuration
	 */
	async testEmailConnection() {
		if (!this.isInitialized) {
			return {
				success: false,
				message: 'SendGrid not initialized. Check SENDGRID_API_KEY.'
			};
		}

		try {
			// Send a test email to yourself
			const result = await this.sendEmail(
				this.fromEmail,
				'SendGrid Test Email',
				'This is a test email from SendGrid. If you receive this, your configuration is working correctly!',
				'<p>This is a test email from <strong>SendGrid</strong>. If you receive this, your configuration is working correctly!</p>'
			);

			return {
				success: result.success,
				message: result.success ? 'Test email sent successfully' : result.error
			};
		} catch (error) {
			return {
				success: false,
				message: error.message
			};
		}
	}
}

// Create singleton instance
const emailService = new EmailService();

module.exports = emailService;