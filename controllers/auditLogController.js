/**
 * @file auditLogController.js
 * @description Audit log management controller
 * Implements ISMS A.12.4.1 (Event logging) and A.12.4.2 (Audit trail)
 */

const asyncHandler = require('express-async-handler');
const { validationResult } = require('express-validator');
const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

/**
 * @desc    Get audit logs
 * @route   GET /api/audit/logs
 * @access  Private (Admin/Superadmin or self)
 */
exports.getAuditLogs = asyncHandler(async (req, res) => {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return res.status(400).json({
			success: false,
			message: 'Validation failed',
			errors: errors.array(),
		});
	}

	const {
		limit = 50,
		skip = 0,
		action,
		resource,
		severity,
		status,
		startDate,
		endDate,
		userId,
	} = req.query;

	try {
		const currentUser = req.user;
		const isPrivileged = ['superadmin', 'admin'].includes(currentUser.role);

		// Users can only see their own logs unless they're admin
		const targetUserId = isPrivileged && userId ? userId : currentUser._id;

		const query = { user: targetUserId };

		if (action) query.action = action;
		if (resource) query.resource = resource;
		if (severity) query.severity = severity;
		if (status) query.status = status;

		if (startDate || endDate) {
			query.timestamp = {};
			if (startDate) query.timestamp.$gte = new Date(startDate);
			if (endDate) query.timestamp.$lte = new Date(endDate);
		}

		const total = await AuditLog.countDocuments(query);

		const logs = await AuditLog.find(query)
			.sort({ timestamp: -1 })
			.limit(parseInt(limit))
			.skip(parseInt(skip))
			.populate('user', 'name email')
			.populate('targetUser', 'name email');

		res.json({
			responseCode: '00',
			responseMessage: 'Audit logs retrieved successfully',
			responseData: logs,
			pagination: {
				total,
				limit: parseInt(limit),
				skip: parseInt(skip),
				pages: Math.ceil(total / parseInt(limit)),
			},
		});
	} catch (error) {
		logger.error('Error fetching audit logs:', error);
		res.status(500).json({
			success: false,
			message: 'Error fetching audit logs',
			error: error.message,
		});
	}
});

/**
 * @desc    Get security events
 * @route   GET /api/audit/security-events
 * @access  Private
 */
exports.getSecurityEvents = asyncHandler(async (req, res) => {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return res.status(400).json({
			success: false,
			message: 'Validation failed',
			errors: errors.array(),
		});
	}

	try {
		const { limit = 20 } = req.query;
		const userId = req.user._id;

		const events = await AuditLog.getSecurityEvents(userId, parseInt(limit));

		res.json({
			responseCode: '00',
			responseMessage: 'Security events retrieved successfully',
			responseData: events,
		});
	} catch (error) {
		logger.error('Error fetching security events:', error);
		res.status(500).json({
			success: false,
			message: 'Error fetching security events',
			error: error.message,
		});
	}
});

/**
 * @desc    Get audit log statistics
 * @route   GET /api/audit/statistics
 * @access  Private (Admin/Superadmin)
 */
exports.getAuditStatistics = asyncHandler(async (req, res) => {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return res.status(400).json({
			success: false,
			message: 'Validation failed',
			errors: errors.array(),
		});
	}

	try {
		const { days = 30 } = req.query;
		const startDate = new Date();
		startDate.setDate(startDate.getDate() - parseInt(days));

		const stats = await AuditLog.aggregate([
			{
				$match: {
					timestamp: { $gte: startDate },
				}
			},
			{
				$facet: {
					totalEvents: [
						{ $count: 'count' }
					],
					byAction: [
						{ $group: { _id: '$action', count: { $sum: 1 } } },
						{ $sort: { count: -1 } }
					],
					byResource: [
						{ $group: { _id: '$resource', count: { $sum: 1 } } },
						{ $sort: { count: -1 } }
					],
					bySeverity: [
						{ $group: { _id: '$severity', count: { $sum: 1 } } },
						{ $sort: { count: -1 } }
					],
					byStatus: [
						{ $group: { _id: '$status', count: { $sum: 1 } } },
						{ $sort: { count: -1 } }
					],
					failedAttempts: [
						{ $match: { status: 'failed' } },
						{ $count: 'count' }
					],
					criticalEvents: [
						{ $match: { severity: 'critical' } },
						{ $count: 'count' }
					]
				}
			}
		]);

		const result = {
			totalEvents: stats[0]?.totalEvents[0]?.count || 0,
			byAction: stats[0]?.byAction || [],
			byResource: stats[0]?.byResource || [],
			bySeverity: stats[0]?.bySeverity || [],
			byStatus: stats[0]?.byStatus || [],
			failedAttempts: stats[0]?.failedAttempts[0]?.count || 0,
			criticalEvents: stats[0]?.criticalEvents[0]?.count || 0,
			period: `${days} days`,
			startDate,
			endDate: new Date(),
		};

		res.json({
			responseCode: '00',
			responseMessage: 'Audit statistics retrieved successfully',
			responseData: result,
		});
	} catch (error) {
		logger.error('Error fetching audit statistics:', error);
		res.status(500).json({
			success: false,
			message: 'Error fetching audit statistics',
			error: error.message,
		});
	}
});

/**
 * @desc    Create audit log (internal use)
 * @route   POST /api/audit/log
 * @access  Private (System)
 */
exports.createAuditLog = asyncHandler(async (req, res) => {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return res.status(400).json({
			success: false,
			message: 'Validation failed',
			errors: errors.array(),
		});
	}

	try {
		const {
			action,
			resource,
			details,
			severity = 'medium',
			status = 'success',
			metadata = {},
			targetUser,
			targetResource,
			endpoint,
			method,
			statusCode,
			errorMessage,
			duration,
			sensitive = false,
		} = req.body;

		const log = await AuditLog.createLog({
			user: req.user._id,
			action,
			resource,
			details,
			ip: req.ip,
			userAgent: req.get('User-Agent'),
			severity,
			status,
			metadata,
			targetUser,
			targetResource,
			endpoint,
			method,
			statusCode,
			errorMessage,
			duration,
			sensitive,
		});

		res.status(201).json({
			responseCode: '01',
			responseMessage: 'Audit log created successfully',
			responseData: log,
		});
	} catch (error) {
		logger.error('Error creating audit log:', error);
		res.status(500).json({
			success: false,
			message: 'Error creating audit log',
			error: error.message,
		});
	}
});

/**
 * @desc    Export audit logs (GDPR compliant)
 * @route   GET /api/audit/export
 * @access  Private
 */
exports.exportAuditLogs = asyncHandler(async (req, res) => {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return res.status(400).json({
			success: false,
			message: 'Validation failed',
			errors: errors.array(),
		});
	}

	try {
		const { format = 'json', startDate, endDate } = req.query;
		const userId = req.user._id;

		const query = { user: userId };
		if (startDate || endDate) {
			query.timestamp = {};
			if (startDate) query.timestamp.$gte = new Date(startDate);
			if (endDate) query.timestamp.$lte = new Date(endDate);
		}

		const logs = await AuditLog.find(query).sort({ timestamp: -1 });

		// Audit log for export
		await AuditLog.createLog({
			user: userId,
			action: 'data_export',
			resource: 'audit',
			details: `User exported audit logs (${logs.length} records)`,
			ip: req.ip,
			userAgent: req.get('User-Agent'),
			severity: 'medium',
			status: 'success',
			endpoint: req.originalUrl,
			method: req.method,
		}).catch(err => logger.error('Audit log failed:', err));

		if (format === 'csv') {
			// Convert to CSV
			const csvHeader = 'Timestamp,User,Action,Resource,Details,IP Address,Status,Severity\n';
			const csvRows = logs.map(log => {
				return [
					log.timestamp.toISOString(),
					log.user?.toString() || 'System',
					log.action,
					log.resource,
					`"${log.details.replace(/"/g, '""')}"`,
					log.ip,
					log.status,
					log.severity,
				].join(',');
			}).join('\n');

			res.setHeader('Content-Type', 'text/csv; charset=utf-8');
			res.setHeader('Content-Disposition', `attachment; filename=audit-logs-${Date.now()}.csv`);
			return res.send(csvHeader + csvRows);
		}

		// JSON format
		res.setHeader('Content-Type', 'application/json');
		res.setHeader('Content-Disposition', `attachment; filename=audit-logs-${Date.now()}.json`);
		res.json({
			responseCode: '00',
			responseMessage: 'Audit logs exported successfully',
			responseData: logs,
			exportMetadata: {
				exportedAt: new Date().toISOString(),
				totalLogs: logs.length,
				format,
				filters: { startDate, endDate },
				exportedBy: userId,
			},
		});
	} catch (error) {
		logger.error('Error exporting audit logs:', error);
		res.status(500).json({
			success: false,
			message: 'Error exporting audit logs',
			error: error.message,
		});
	}
});

/**
 * @desc    Get critical logs
 * @route   GET /api/audit/critical
 * @access  Private (Admin/Superadmin)
 */
exports.getCriticalLogs = asyncHandler(async (req, res) => {
	try {
		const { limit = 20, days = 7 } = req.query;
		const startDate = new Date();
		startDate.setDate(startDate.getDate() - parseInt(days));

		const logs = await AuditLog.getCriticalLogs(parseInt(limit))
			.where('timestamp').gte(startDate);

		res.json({
			responseCode: '00',
			responseMessage: 'Critical logs retrieved successfully',
			responseData: logs,
		});
	} catch (error) {
		logger.error('Error fetching critical logs:', error);
		res.status(500).json({
			success: false,
			message: 'Error fetching critical logs',
			error: error.message,
		});
	}
});

module.exports = exports;