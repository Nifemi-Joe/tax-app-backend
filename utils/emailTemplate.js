/**
 * @file emailTemplate.js
 * @description Email template generator with various templates
 */

const logger = require('./logger');

/**
 * Email templates
 */
const templates = {
    welcome: (context) => ({
        subject: 'Welcome to GSJX LTD',
        html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to GSJX LTD</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #f4f4f4; }
        .container { max-width: 600px; margin: 20px auto; padding: 0; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #964FFE 0%, #7c3aed 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .header h1 { margin: 0; font-size: 28px; }
        .content { padding: 30px; }
        .content p { margin: 10px 0; }
        .info-box { background: #f9f9f9; padding: 15px; border-left: 4px solid #964FFE; margin: 15px 0; }
        .password-box { background: #fff; padding: 15px; border: 2px dashed #964FFE; border-radius: 4px; font-size: 16px; font-weight: bold; word-break: break-all; text-align: center; margin: 15px 0; }
        .button { display: inline-block; padding: 12px 24px; background: #964FFE; color: white; text-decoration: none; border-radius: 4px; margin: 15px 0; font-weight: bold; }
        .button:hover { background: #7c3aed; }
        .footer { text-align: center; padding: 20px; font-size: 12px; color: #888; border-top: 1px solid #eee; }
        .footer p { margin: 5px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Welcome to GSJX LTD! 👋</h1>
        </div>
        <div class="content">
            <p>Dear <strong>${context.name || 'User'}</strong>,</p>
            <p>Your account has been successfully created by an administrator.</p>
            
            <div class="info-box">
                <strong>📧 Email:</strong> ${context.email}<br>
                <strong>👤 Role:</strong> ${context.role || 'Standard User'}<br>
                <strong>🏢 Department:</strong> ${context.department || 'N/A'}
            </div>

            <p>Your temporary password is:</p>
            <div class="password-box">${context.password}</div>

            <p>⚠️ <strong>Important:</strong> For security reasons, please change your password immediately after logging in.</p>

            <a href="${context.frontendUrl}/login" class="button">Login to Your Account</a>

            <p>If you have any questions or need assistance, please contact our support team.</p>

            <p>Best Regards,<br><strong>GSJX LTD Team</strong></p>
        </div>
        <div class="footer">
            <p>&copy; ${new Date().getFullYear()} GSJX LTD. All rights reserved.</p>
            <p>This is an automated message. Please do not reply to this email.</p>
        </div>
    </div>
</body>
</html>
		`
    }),

    passwordReset: (context) => ({
        subject: 'Your Password Has Been Reset',
        html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Password Reset</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #f4f4f4; }
        .container { max-width: 600px; margin: 20px auto; padding: 0; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #964FFE 0%, #7c3aed 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .header h1 { margin: 0; font-size: 28px; }
        .content { padding: 30px; }
        .alert { background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 4px; margin: 15px 0; }
        .password-box { background: #fff; padding: 15px; border: 2px dashed #964FFE; border-radius: 4px; font-size: 16px; font-weight: bold; word-break: break-all; text-align: center; margin: 15px 0; }
        .button { display: inline-block; padding: 12px 24px; background: #964FFE; color: white; text-decoration: none; border-radius: 4px; margin: 15px 0; font-weight: bold; }
        .footer { text-align: center; padding: 20px; font-size: 12px; color: #888; border-top: 1px solid #eee; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔑 Password Reset</h1>
        </div>
        <div class="content">
            <p>Hello <strong>${context.name || 'User'}</strong>,</p>
            <p>Your password has been successfully reset by an administrator.</p>

            <div class="alert">
                <strong>⚠️ Important:</strong> Your temporary password is valid for 24 hours only. Please log in and change it immediately.
            </div>

            <p><strong>Your Temporary Password:</strong></p>
            <div class="password-box">${context.password}</div>

            <a href="${context.frontendUrl}/login" class="button">Login and Change Password</a>

            <p><strong>Security Tips:</strong></p>
            <ul>
                <li>Never share your password with anyone</li>
                <li>Use a strong, unique password with numbers and special characters</li>
                <li>Log out from all devices after resetting your password</li>
                <li>Enable two-factor authentication for extra security</li>
            </ul>

            <p>Best Regards,<br><strong>GSJX LTD Security Team</strong></p>
        </div>
        <div class="footer">
            <p>&copy; ${new Date().getFullYear()} GSJX LTD. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
		`
    }),

    passwordChanged: (context) => ({
        subject: 'Your Password Has Been Changed',
        html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Password Changed</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #f4f4f4; }
        .container { max-width: 600px; margin: 20px auto; padding: 0; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .header h1 { margin: 0; font-size: 28px; }
        .content { padding: 30px; }
        .success-box { background: #d4edda; border: 1px solid #28a745; padding: 15px; border-radius: 4px; margin: 15px 0; color: #155724; }
        .info-box { background: #f9f9f9; padding: 15px; border-left: 4px solid #964FFE; margin: 15px 0; }
        .footer { text-align: center; padding: 20px; font-size: 12px; color: #888; border-top: 1px solid #eee; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>✅ Password Changed Successfully</h1>
        </div>
        <div class="content">
            <p>Hello <strong>${context.name || 'User'}</strong>,</p>

            <div class="success-box">
                <strong>Your password has been changed successfully!</strong>
            </div>

            <p><strong>Change Details:</strong></p>
            <div class="info-box">
                Time: ${new Date().toLocaleString()}<br>
                IP Address: ${context.ipAddress || 'N/A'}
            </div>

            <p>If you did not make this change, please <a href="${context.frontendUrl}/security">reset your password immediately</a> and contact our support team.</p>

            <p>Best Regards,<br><strong>GSJX LTD Security Team</strong></p>
        </div>
        <div class="footer">
            <p>&copy; ${new Date().getFullYear()} GSJX LTD. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
		`
    }),

    emailVerification: (context) => ({
        subject: 'Verify Your Email Address',
        html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Email Verification</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #f4f4f4; }
        .container { max-width: 600px; margin: 20px auto; padding: 0; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #964FFE 0%, #7c3aed 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .header h1 { margin: 0; font-size: 28px; }
        .content { padding: 30px; }
        .verification-code { background: #f9f9f9; padding: 15px; border: 2px dashed #964FFE; border-radius: 4px; font-size: 20px; font-weight: bold; text-align: center; margin: 15px 0; letter-spacing: 2px; }
        .button { display: inline-block; padding: 12px 24px; background: #964FFE; color: white; text-decoration: none; border-radius: 4px; margin: 15px 0; font-weight: bold; }
        .footer { text-align: center; padding: 20px; font-size: 12px; color: #888; border-top: 1px solid #eee; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📧 Verify Your Email</h1>
        </div>
        <div class="content">
            <p>Hello <strong>${context.name || 'User'}</strong>,</p>
            <p>Thank you for registering with GSJX LTD. Please verify your email address to activate your account.</p>

            <p><strong>Your Verification Code:</strong></p>
            <div class="verification-code">${context.verificationCode}</div>

            <p>Or click the button below to verify:</p>
            <a href="${context.verificationLink}" class="button">Verify Email</a>

            <p><small>This code will expire in 24 hours.</small></p>

            <p>If you did not create this account, please ignore this email.</p>

            <p>Best Regards,<br><strong>GSJX LTD Team</strong></p>
        </div>
        <div class="footer">
            <p>&copy; ${new Date().getFullYear()} GSJX LTD. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
		`
    }),

    loginAlert: (context) => ({
        subject: 'New Login to Your Account',
        html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login Alert</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #f4f4f4; }
        .container { max-width: 600px; margin: 20px auto; padding: 0; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #0066cc 0%, #0052a3 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .header h1 { margin: 0; font-size: 28px; }
        .content { padding: 30px; }
        .info-box { background: #e7f3ff; border: 1px solid #0066cc; padding: 15px; border-radius: 4px; margin: 15px 0; }
        .footer { text-align: center; padding: 20px; font-size: 12px; color: #888; border-top: 1px solid #eee; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔐 Login Alert</h1>
        </div>
        <div class="content">
            <p>Hello <strong>${context.name || 'User'}</strong>,</p>
            <p>A new login to your account has been detected. Here are the details:</p>

            <div class="info-box">
                <strong>📍 Location:</strong> ${context.location || 'Unknown'}<br>
                <strong>🖥️ Device:</strong> ${context.device || 'Unknown'}<br>
                <strong>🌐 Browser:</strong> ${context.browser || 'Unknown'}<br>
                <strong>IP Address:</strong> ${context.ipAddress || 'Unknown'}<br>
                <strong>⏰ Time:</strong> ${new Date().toLocaleString()}
            </div>

            <p>If this was you, you can safely ignore this email.</p>
            <p>If you don't recognize this login, please <a href="${context.frontendUrl}/security">secure your account immediately</a>.</p>

            <p>Best Regards,<br><strong>GSJX LTD Security Team</strong></p>
        </div>
        <div class="footer">
            <p>&copy; ${new Date().getFullYear()} GSJX LTD. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
		`
    }),

    suspiciousActivity: (context) => ({
        subject: 'Suspicious Activity Detected on Your Account',
        html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Suspicious Activity Alert</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #f4f4f4; }
        .container { max-width: 600px; margin: 20px auto; padding: 0; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .header h1 { margin: 0; font-size: 28px; }
        .content { padding: 30px; }
        .alert-box { background: #f8d7da; border: 1px solid #dc3545; padding: 15px; border-radius: 4px; margin: 15px 0; color: #721c24; }
        .button { display: inline-block; padding: 12px 24px; background: #dc3545; color: white; text-decoration: none; border-radius: 4px; margin: 15px 0; font-weight: bold; }
        .footer { text-align: center; padding: 20px; font-size: 12px; color: #888; border-top: 1px solid #eee; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>⚠️ Suspicious Activity Alert</h1>
        </div>
        <div class="content">
            <p>Hello <strong>${context.name || 'User'}</strong>,</p>

            <div class="alert-box">
                <strong>Suspicious activity has been detected on your account!</strong>
            </div>

            <p><strong>Activity Details:</strong></p>
            <ul>
                <li>Activity Type: ${context.activityType || 'Unknown'}</li>
                <li>Time: ${new Date().toLocaleString()}</li>
                <li>IP Address: ${context.ipAddress || 'Unknown'}</li>
                <li>Location: ${context.location || 'Unknown'}</li>
            </ul>

            <p>If this was you, you can ignore this email. Otherwise, take immediate action:</p>
            <a href="${context.frontendUrl}/security" class="button">Review Account Activity</a>

            <p>If you need further assistance, please contact our support team immediately.</p>

            <p>Best Regards,<br><strong>GSJX LTD Security Team</strong></p>
        </div>
        <div class="footer">
            <p>&copy; ${new Date().getFullYear()} GSJX LTD. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
		`
    }),

    invoiceReminder: (context) => ({
        subject: `Invoice Reminder: ${context.invoiceNumber} - Amount Due: ${context.amount}`,
        html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Invoice Reminder</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #f4f4f4; }
        .container { max-width: 600px; margin: 20px auto; padding: 0; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #964FFE 0%, #7c3aed 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .header h1 { margin: 0; font-size: 28px; }
        .content { padding: 30px; }
        .invoice-box { background: #f9f9f9; padding: 15px; border-left: 4px solid #964FFE; margin: 15px 0; }
        .button { display: inline-block; padding: 12px 24px; background: #964FFE; color: white; text-decoration: none; border-radius: 4px; margin: 15px 0; font-weight: bold; }
        .footer { text-align: center; padding: 20px; font-size: 12px; color: #888; border-top: 1px solid #eee; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📄 Invoice Reminder</h1>
        </div>
        <div class="content">
            <p>Dear <strong>${context.clientName || 'Valued Client'}</strong>,</p>
            <p>We hope this email finds you well. This is a friendly reminder about an outstanding invoice.</p>

            <div class="invoice-box">
                <strong>Invoice Number:</strong> ${context.invoiceNumber}<br>
                <strong>Amount Due:</strong> ${context.amount}<br>
                <strong>Due Date:</strong> ${context.dueDate}<br>
                <strong>Days Overdue:</strong> ${context.daysOverdue || '0'}
            </div>

            <p>Please settle this invoice at your earliest convenience. If you have already made the payment, please disregard this message.</p>

            <a href="${context.invoiceLink}" class="button">View Invoice</a>

            <p>If you have any questions or need any clarification, please don't hesitate to contact us.</p>

            <p>Thank you for your business!</p>

            <p>Best Regards,<br><strong>GSJX LTD Finance Team</strong></p>
        </div>
        <div class="footer">
            <p>&copy; ${new Date().getFullYear()} GSJX LTD. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
		`
    }),

    auditAlert: (context) => ({
        subject: context.subject || 'Security Alert - Account Activity',
        html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Security Alert</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #f4f4f4; }
        .container { max-width: 600px; margin: 20px auto; padding: 0; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #ffc107 0%, #ff9800 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .header h1 { margin: 0; font-size: 28px; }
        .content { padding: 30px; }
        .alert-box { background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 4px; margin: 15px 0; }
        .details { background: #f9f9f9; padding: 15px; border-left: 4px solid #ffc107; margin: 15px 0; }
        .footer { text-align: center; padding: 20px; font-size: 12px; color: #888; border-top: 1px solid #eee; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔔 Security Alert</h1>
        </div>
        <div class="content">
            <p>Hello <strong>${context.name || 'User'}</strong>,</p>

            <div class="alert-box">
                <strong>${context.message || 'An important activity has been recorded on your account.'}</strong>
            </div>

            <div class="details">
                ${context.details || ''}
            </div>

            <p>If you have any questions or concerns, please contact our support team immediately.</p>

            <p>Best Regards,<br><strong>GSJX LTD Security Team</strong></p>
        </div>
        <div class="footer">
            <p>&copy; ${new Date().getFullYear()} GSJX LTD. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
		`
    }),
};

/**
 * Generate email template
 * @param {string} templateName - Name of the template
 * @param {object} context - Template context/variables
 * @returns {Promise<object>} - Email template object with subject and html
 */
exports.generateEmailTemplate = async (templateName, context = {}) => {
    try {
        const template = templates[templateName];

        if (!template) {
            throw new Error(`Template '${templateName}' not found`);
        }

        // Add frontend URL if not provided
        if (!context.frontendUrl) {
            context.frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        }

        return template(context);
    } catch (error) {
        logger.error('Error generating email template:', error);
        throw error;
    }
};

/**
 * Get available templates
 */
exports.getAvailableTemplates = () => {
    return Object.keys(templates);
};

module.exports = exports;