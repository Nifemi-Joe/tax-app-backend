// controllers/auditLogController.js

const asyncHandler = require('express-async-handler');
const AuditLog = require('../models/AuditLog');

// @desc    Get all audit logs
// @route   GET /api/audit-logs
// @access  Private/Admin
exports.getAuditLogs = asyncHandler(async (req, res) => {
	const logs = await AuditLog.find().sort({ timestamp: -1 });
	if (logs){
		res.status(200).json(logs)
	}
	else{
		res.status(200).json({responseCde: "22", responseMessage: "No audit logs found."})

	}
});
