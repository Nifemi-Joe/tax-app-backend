const AuditLog = require('../models/AuditLog');
const logger = require('./logger');

const logAction = async (userId, userName, action, module, details, ipAddress, userAgent = null) => {
	try {
		await AuditLog.create({
			userId,
			userName,
			action,
			module,
			details,
			ipAddress,
			userAgent,
			timestamp: new Date(),
		});
	} catch (error) {
		logger.error('Audit log failed:', error);
		// Don't break the main flow if audit logging fails
	}
};

module.exports = logAction;