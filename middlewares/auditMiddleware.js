const AuditLog = require('../models/AuditLog');

const auditLogger = (action, module) => {
	return async (req, res, next) => {
		// After response is sent, log the action
		res.on('finish', async () => {
			try {
				await AuditLog.create({
					user: req.user ? req.user._id : null,
					action,
					module,
					details: `${req.method} ${req.originalUrl}`
				});
			} catch (err) {
				console.error('Failed to log audit:', err);
			}
		});
		next();
	};
};

module.exports = auditLogger;
