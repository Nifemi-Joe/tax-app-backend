/**
 * @file AuditTombstone.js
 * @description Minimal, personal-data-free record left behind when an audit event is lawfully
 * purged under the retention policy (or a write failed after a sequence was allocated).
 * Lets integrity verification tell a lawful deletion from tampering.
 */

'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const auditTombstoneSchema = new Schema(
  {
    chainKey: { type: String, required: true },
    seq: { type: Number, required: true },
    eventId: { type: String },
    hash: { type: String },
    reason: { type: String, enum: ['retention', 'write_failed'], required: true },
    category: { type: String },
    eventTimestamp: { type: Date },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'audit_tombstones', versionKey: false },
);

auditTombstoneSchema.index({ chainKey: 1, seq: 1 }, { unique: true });

module.exports = mongoose.models.AuditTombstone || mongoose.model('AuditTombstone', auditTombstoneSchema);
