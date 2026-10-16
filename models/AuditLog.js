/**
 * @file AuditLog.js
 * @description Mongoose model for audit logs
 * Implements ISMS A.12.4.1 (Event logging) and A.12.4.2 (Audit trail)
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const auditLogSchema = new Schema({
	user: {
		type: Schema.Types.ObjectId,
		ref: 'User',
		default: null,
	},
	action: {
		type: String,
		required: [true, 'Action is required'],
		enum: [
			'login', 'logout', 'failed_login', 'password_change', 'password_reset',
			'user_register', 'user_update', 'user_delete', 'user_activate', 'user_deactivate',
			'2fa_enable', '2fa_disable', '2fa_verify', 'session_create', 'session_terminate',
			'session_timeout', 'security_setting_change',
			'data_export', 'data_import', 'account_delete', 'data_delete',
			'system_config_change', 'backup_create', 'backup_restore',
			'consent_grant', 'consent_withdraw', 'privacy_request',
		],
	},
	resource: {
		type: String,
		required: [true, 'Resource is required'],
		enum: [
			'user_profile', 'user_management', 'authentication', 'security',
			'gdpr', 'system', 'session', 'audit', 'compliance',
		],
	},
	details: {
		type: String,
		required: [true, 'Details are required'],
		trim: true,
		maxlength: [1000, 'Details cannot exceed 1000 characters'],
	},
	ip: {
		type: String,
		trim: true,
		default: 'Unknown',
	},
	userAgent: {
		type: String,
		trim: true,
		default: '',
	},
	location: {
		type: String,
		trim: true,
		default: 'Unknown',
	},
	severity: {
		type: String,
		enum: ['low', 'medium', 'high', 'critical'],
		default: 'medium',
	},
	status: {
		type: String,
		enum: ['success', 'failed', 'pending'],
		default: 'success',
	},
	metadata: {
		type: Schema.Types.Mixed,
		default: {},
	},
	timestamp: {
		type: Date,
		default: Date.now,
	},
	userAgentString: {
		type: String,
		trim: true,
		default: '',
	},
	sessionId: {
		type: Schema.Types.ObjectId,
		ref: 'Session',
		default: null,
	},
	targetUser: {
		type: Schema.Types.ObjectId,
		ref: 'User',
		default: null,
	},
	targetResource: {
		type: String,
		trim: true,
		default: '',
	},
	ipAddress: {
		type: String,
		trim: true,
		default: '',
	},
	endpoint: {
		type: String,
		trim: true,
		default: '',
	},
	method: {
		type: String,
		trim: true,
		default: '',
	},
	statusCode: {
		type: Number,
		default: 200,
	},
	errorMessage: {
		type: String,
		trim: true,
		default: '',
	},
	duration: {
		type: Number,
		default: 0,
	},
	userAgentInfo: {
		browser: { type: String, default: '' },
		os: { type: String, default: '' },
		device: { type: String, default: '' },
		isMobile: { type: Boolean, default: false },
	},
	sensitive: {
		type: Boolean,
		default: false,
	},
	retentionUntil: {
		type: Date,
		default: function() {
			return new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
		},
	},
}, {
	timestamps: true,
});

// ============================================================
// INDEXES (using schema.index() only - NO index: true on fields)
// ============================================================
auditLogSchema.index({ user: 1 });
auditLogSchema.index({ action: 1 });
auditLogSchema.index({ resource: 1 });
auditLogSchema.index({ ip: 1 });
auditLogSchema.index({ severity: 1 });
auditLogSchema.index({ status: 1 });
auditLogSchema.index({ timestamp: 1 });
auditLogSchema.index({ targetUser: 1 });
auditLogSchema.index({ sensitive: 1 });
auditLogSchema.index({ retentionUntil: 1 });

// Compound indexes
auditLogSchema.index({ user: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ resource: 1, timestamp: -1 });
auditLogSchema.index({ severity: 1, timestamp: -1 });
auditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 31536000 }); // 1 year TTL

// ============================================================
// PRE-SAVE MIDDLEWARE
// ============================================================
auditLogSchema.pre('save', function(next) {
	if (this.ipAddress && !this.ip) {
		this.ip = this.ipAddress;
	}
	if (this.userAgentString && !this.userAgent) {
		this.userAgent = this.userAgentString;
	}
	next();
});

// ============================================================
// STATIC METHODS
// ============================================================
auditLogSchema.statics.createLog = function(logData) {
	const {
		user, action, resource, details, ip, userAgent, location,
		severity = 'medium', status = 'success', metadata = {},
		sessionId, targetUser, targetResource, endpoint, method,
		statusCode, errorMessage, duration, sensitive = false
	} = logData;

	return this.create({
		user: user || null,
		action,
		resource,
		details,
		ip: ip || 'Unknown',
		userAgent: userAgent || '',
		location: location || 'Unknown',
		severity,
		status,
		metadata,
		sessionId: sessionId || null,
		targetUser: targetUser || null,
		targetResource: targetResource || '',
		endpoint: endpoint || '',
		method: method || '',
		statusCode: statusCode || 200,
		errorMessage: errorMessage || '',
		duration: duration || 0,
		sensitive,
		userAgentString: userAgent || '',
		ipAddress: ip || '',
	});
};

auditLogSchema.statics.getUserLogs = function(userId, options = {}) {
	const {
		limit = 50,
		skip = 0,
		action,
		resource,
		severity,
		status,
		startDate,
		endDate,
	} = options;

	const query = { user: userId };

	if (action) query.action = action;
	if (resource) query.resource = resource;
	if (severity) query.severity = severity;
	if (status) query.status = status;
	if (startDate || endDate) {
		query.timestamp = {};
		if (startDate) query.timestamp.$gte = new Date(startDate);
		if (endDate) query.timestamp.$lte = new Date(endDate);
	}

	return this.find(query)
		.sort({ timestamp: -1 })
		.limit(limit)
		.skip(skip)
		.populate('targetUser', 'name email')
		.populate('sessionId', 'device browser ip');
};

auditLogSchema.statics.getSecurityEvents = function(userId, limit = 20) {
	return this.find({
		user: userId,
		action: {
			$in: [
				'login', 'logout', 'failed_login', 'password_change', 'password_reset',
				'2fa_enable', '2fa_disable', 'session_create', 'session_terminate',
				'security_setting_change'
			]
		}
	})
		.sort({ timestamp: -1 })
		.limit(limit)
		.populate('sessionId', 'device browser ip');
};

auditLogSchema.statics.getCriticalLogs = function(limit = 50) {
	return this.find({
		severity: 'critical'
	})
		.sort({ timestamp: -1 })
		.limit(limit)
		.populate('user', 'name email');
};

auditLogSchema.statics.cleanupOldLogs = function() {
	return this.deleteMany({
		retentionUntil: { $lt: new Date() }
	});
};

module.exports = mongoose.model('AuditLog', auditLogSchema);