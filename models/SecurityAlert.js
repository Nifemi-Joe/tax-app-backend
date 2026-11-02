/**
 * @file SecurityAlert.js
 * @description Security alerts raised by the monitoring rules (ISO 27001 A.8.16, A.5.25/A.5.26).
 * Alerts have a workflow (open -> acknowledged/investigating -> resolved/false_positive); every
 * transition is kept in `history` AND written to the audit trail.
 */

'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const ALERT_TYPES = [
  'new_country', 'new_city', 'new_device', 'impossible_travel', 'multiple_countries', 'high_risk_country',
  'off_hours_privileged_login', 'automation_user_agent', 'brute_force', 'credential_stuffing',
  'privilege_change', 'mass_data_export', 'mass_deletion', 'access_denied_burst', 'audit_integrity_failure',
  'compromise_reported', 'audit_write_failure',
];
const ALERT_STATUSES = ['open', 'acknowledged', 'investigating', 'resolved', 'false_positive'];

const securityAlertSchema = new Schema({
  type: { type: String, enum: ALERT_TYPES, required: true },
  severity: { type: String, enum: ['info', 'low', 'medium', 'high', 'critical'], required: true },
  status: { type: String, enum: ALERT_STATUSES, default: 'open' },
  title: { type: String, required: true, maxlength: 300 },
  summary: { type: String, maxlength: 2000 },

  user: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  userSnapshot: {
    name: String, email: String, role: String, roleGroup: String,
  },
  companyId: { type: Schema.Types.ObjectId, default: null },

  riskScore: { type: Number, min: 0, max: 100 },
  reasons: { type: [String], default: undefined },
  evidence: { type: Schema.Types.Mixed },
  auditEventIds: { type: [String], default: [] },

  dedupeKey: { type: String },
  occurrences: { type: Number, default: 1 },
  firstOccurredAt: { type: Date, default: Date.now },
  lastOccurredAt: { type: Date, default: Date.now },

  allowUserResponse: { type: Boolean, default: false },
  responseTokenHash: { type: String, select: false },
  responseTokenExpires: { type: Date, select: false },
  userResponse: {
    answer: { type: String, enum: ['me', 'not_me'] },
    at: Date,
    ip: String,
    channel: { type: String, enum: ['email_link', 'in_app'] },
  },

  notifications: [{
    _id: false, channel: String, to: String, at: { type: Date, default: Date.now }, ok: Boolean, error: String,
  }],
  history: [{
    _id: false,
    at: { type: Date, default: Date.now },
    by: { userId: Schema.Types.ObjectId, name: String, role: String },
    action: String,
    fromStatus: String,
    toStatus: String,
    note: { type: String, maxlength: 2000 },
  }],
  resolvedAt: Date,
  resolvedBy: { userId: Schema.Types.ObjectId, name: String },
}, { timestamps: true, collection: 'security_alerts' });

securityAlertSchema.index({ dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } });
securityAlertSchema.index({ status: 1, severity: 1, lastOccurredAt: -1 });
securityAlertSchema.index({ user: 1, lastOccurredAt: -1 });
securityAlertSchema.index({ type: 1, lastOccurredAt: -1 });
securityAlertSchema.index({ responseTokenHash: 1 }, { sparse: true });

securityAlertSchema.statics.TYPES = ALERT_TYPES;
securityAlertSchema.statics.STATUSES = ALERT_STATUSES;

module.exports = mongoose.models.SecurityAlert || mongoose.model('SecurityAlert', securityAlertSchema);
