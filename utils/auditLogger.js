// utils/auditLogger.js

const AuditLog = require('../models/AuditLog');

const logAction = async (userId, userName,action, moduleName, details, ipAddress) => {
	try {
		await AuditLog.create({
			userId: userId,
			userName,
			action,
			module: moduleName,
			details,
			ipAddress
		});
	} catch (error) {
		console.error('Failed to log action:', error);
	}
};

module.exports = logAction;
