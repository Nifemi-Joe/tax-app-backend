const sgMail = require('@sendgrid/mail');
require('dotenv').config();
const logger = require('./logger');

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

class EmailService {
	constructor() {
		this.fromEmail = process.env.FROM_EMAIL || 'itbiz@globalsjxltd.com';
		this.companyName = process.env.COMPANY_NAME || 'Global SJX Ltd';
		this.isInitialized = !!process.env.SENDGRID_API_KEY;

		if (!this.isInitialized) {
			console.warn('⚠️ SendGrid API key not found. Emails will not be sent.');
			logger.warn('SendGrid API key not found. Emails will not be sent.');
		} else {
			console.log('✓ SendGrid initialized successfully');
			logger.info('SendGrid initialized successfully');
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
			const error = 'SendGrid not configured. Check SENDGRID_API_KEY environment variable.';
			logger.error(error);
			return {
				success: false,
				error,
				code: 'ENOTCONFIG'
			};
		}

		// Handle array of email addresses
		const recipients = Array.isArray(to) ? to : [to];

		// Prepare attachments for SendGrid
		const sendGridAttachments = attachments.map(att => {
			let content;
			if (Buffer.isBuffer(att.content)) {
				content = att.content.toString('base64');
			} else if (typeof att.content === 'string') {
				content = att.content;
			} else {
				throw new Error('Attachment content must be a Buffer or base64 string');
			}

			return {
				content: content,
				filename: att.filename || 'attachment.pdf',
				type: att.type || 'application/pdf',
				disposition: att.disposition || 'attachment'
			};
		});

		const msg = {
			to: recipients,
			from: {
				email: this.fromEmail,
				name: this.companyName,
			},
			subject,
			text: text || '',
			html: html || text || '',
			attachments: sendGridAttachments,
			custom_args: {
				timestamp: new Date().toISOString(),
				service: 'gsgx-ltd-api'
			}
		};

		try {
			logger.info('Sending email via SendGrid', {
				to: recipients,
				subject,
				attachmentCount: attachments.length
			});

			const [response] = await sgMail.send(msg);

			logger.info('Email sent successfully via SendGrid', {
				to: recipients,
				subject,
				statusCode: response.statusCode,
				messageId: response.headers['x-message-id']
			});

			return {
				success: true,
				messageId: response.headers['x-message-id'],
				statusCode: response.statusCode
			};
		} catch (error) {
			logger.error('SendGrid email failed', {
				to: recipients,
				subject,
				error: error.message,
				code: error.code
			});

			// Detailed error diagnostics
			if (error.response) {
				const { body } = error.response;
				logger.error('SendGrid error details', { body });
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
		const html = this.getWelcomeEmailTemplate(userName);
		const text = `Welcome to ${this.companyName}! Hello ${userName}, Thank you for joining our platform. We're excited to have you on board!`;

		return this.sendEmail(to, subject, text, html);
	}

	/**
	 * Send group invitation email
	 */
	async sendGroupInvitation(to, groupName, inviterName, groupId) {
		const subject = `You've been invited to join ${groupName}`;
		const html = this.getGroupInvitationTemplate(groupName, inviterName, groupId);
		const text = `Group Invitation: ${inviterName} has invited you to join the group "${groupName}". Join at: https://yourplatform.com/groups/${groupId}`;

		return this.sendEmail(to, subject, text, html);
	}

	/**
	 * Send password reset email
	 */
	async sendPasswordReset(to, userName, resetToken) {
		const subject = 'Password Reset Request';
		const resetLink = `https://yourplatform.com/reset-password?token=${resetToken}`;
		const html = this.getPasswordResetTemplate(userName, resetLink);
		const text = `Password Reset Request: Hello ${userName}, We received a request to reset your password. Use this link to reset: ${resetLink} This link expires in 1 hour.`;

		return this.sendEmail(to, subject, text, html);
	}

	/**
	 * Send security alert email
	 */
	async sendSecurityAlert(to, userName, alertType, details) {
		const subject = `Security Alert - ${alertType}`;
		const html = this.getSecurityAlertTemplate(userName, alertType, details);
		const text = `Security Alert - ${alertType}\n\nHello ${userName},\n\nA security event has been detected on your account:\n\nAlert Type: ${alertType}\nTime: ${new Date().toISOString()}\nIP Address: ${details.ip || 'Unknown'}\nLocation: ${details.location || 'Unknown'}\nDevice: ${details.device || 'Unknown'}\n\nIf this was not you, please contact our support team immediately.\n\nBest regards,\n${this.companyName} Security Team`;

		return this.sendEmail(to, subject, text, html);
	}

	/**
	 * Send 2FA setup email
	 */
	async send2FASetupEmail(to, userName, qrCodeUrl) {
		const subject = 'Two-Factor Authentication Setup';
		const html = this.get2FASetupTemplate(userName, qrCodeUrl);
		const text = `Two-Factor Authentication Setup\n\nHello ${userName},\n\nYou have enabled two-factor authentication for your account. Scan the QR code below with your authenticator app:\n\n${qrCodeUrl}\n\nIf you did not enable 2FA, please contact support immediately.`;

		return this.sendEmail(to, subject, text, html);
	}

	/**
	 * Send session termination email
	 */
	async sendSessionTerminationEmail(to, userName, sessionDetails) {
		const subject = 'Session Terminated - Security Alert';
		const html = this.getSessionTerminationTemplate(userName, sessionDetails);
		const text = `Session Terminated\n\nHello ${userName},\n\nYour session has been terminated:\n\nDevice: ${sessionDetails.device}\nBrowser: ${sessionDetails.browser}\nIP: ${sessionDetails.ip}\nLocation: ${sessionDetails.location}\nTime: ${sessionDetails.timestamp}\n\nIf you did not terminate this session, please change your password immediately.`;

		return this.sendEmail(to, subject, text, html);
	}

	/**
	 * Send notification email
	 */
	async sendNotificationEmail(to, title, message, actionUrl = null, actionText = null) {
		const html = this.getNotificationTemplate(title, message, actionUrl, actionText);
		const text = `${title}\n\n${message}${actionUrl ? `\n\n${actionText}: ${actionUrl}` : ''}`;

		return this.sendEmail(to, title, text, html);
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

	// Email template methods
	getWelcomeEmailTemplate(userName) {
		return `
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
	}

	getGroupInvitationTemplate(groupName, inviterName, groupId) {
		return `
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
	}

	getPasswordResetTemplate(userName, resetLink) {
		return `
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
	}

	getSecurityAlertTemplate(userName, alertType, details) {
		return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #DC2626; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { padding: 30px; background: #f9f9f9; border-left: 1px solid #e0e0e0; border-right: 1px solid #e0e0e0; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; background: #fff; border-radius: 0 0 10px 10px; border: 1px solid #e0e0e0; border-top: none; }
          .details { background: #fff; padding: 15px; border: 1px solid #ddd; border-radius: 4px; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Security Alert</h1>
          </div>
          <div class="content">
            <h2>Hello ${userName},</h2>
            <p>A security event has been detected on your account:</p>
            <div class="details">
              <strong>Alert Type:</strong> ${alertType}<br>
              <strong>Time:</strong> ${new Date().toISOString()}<br>
              <strong>IP Address:</strong> ${details.ip || 'Unknown'}<br>
              <strong>Location:</strong> ${details.location || 'Unknown'}<br>
              <strong>Device:</strong> ${details.device || 'Unknown'}<br>
            </div>
            <p>If this was not you, please contact our support team immediately.</p>
            <p>Best Regards,</p>
            <p><strong>${this.companyName} Security Team</strong></p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} ${this.companyName}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
	}

	get2FASetupTemplate(userName, qrCodeUrl) {
		return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #8B5CF6; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { padding: 30px; background: #f9f9f9; border-left: 1px solid #e0e0e0; border-right: 1px solid #e0e0e0; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; background: #fff; border-radius: 0 0 10px 10px; border: 1px solid #e0e0e0; border-top: none; }
          .qr-code { text-align: center; margin: 20px 0; }
          .qr-code img { max-width: 200px; border: 1px solid #ddd; padding: 10px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Two-Factor Authentication Setup</h1>
          </div>
          <div class="content">
            <h2>Hello ${userName},</h2>
            <p>You have enabled two-factor authentication for your account. Scan the QR code below with your authenticator app:</p>
            <div class="qr-code">
              <img src="${qrCodeUrl}" alt="QR Code" />
            </div>
            <p>If you did not enable 2FA, please contact support immediately.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} ${this.companyName}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
	}

	getSessionTerminationTemplate(userName, sessionDetails) {
		return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #F59E0B; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { padding: 30px; background: #f9f9f9; border-left: 1px solid #e0e0e0; border-right: 1px solid #e0e0e0; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; background: #fff; border-radius: 0 0 10px 10px; border: 1px solid #e0e0e0; border-top: none; }
          .details { background: #fff; padding: 15px; border: 1px solid #ddd; border-radius: 4px; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Session Terminated</h1>
          </div>
          <div class="content">
            <h2>Hello ${userName},</h2>
            <p>Your session has been terminated:</p>
            <div class="details">
              <strong>Device:</strong> ${sessionDetails.device}<br>
              <strong>Browser:</strong> ${sessionDetails.browser}<br>
              <strong>IP:</strong> ${sessionDetails.ip}<br>
              <strong>Location:</strong> ${sessionDetails.location}<br>
              <strong>Time:</strong> ${sessionDetails.timestamp}<br>
            </div>
            <p>If you did not terminate this session, please change your password immediately.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} ${this.companyName}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
	}

	getNotificationTemplate(title, message, actionUrl, actionText) {
		return `
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
	}
}

// Create singleton instance
const emailService = new EmailService();

module.exports = emailService;