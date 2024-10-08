// models/AuditLog.js

const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
	userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
	userName: { type: String, required: true },
	action: { type: String, required: true },
	module: { type: String, required: true },
	details: { type: Object },
	ipAddress: { type: String }, // IP address of the user
	timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
