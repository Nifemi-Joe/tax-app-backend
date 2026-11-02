/**
 * @file AuditChainHead.js
 * @description Monotonic sequence counter for the audit chain (+ distributed job locks).
 */

'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const auditChainHeadSchema = new Schema(
  {
    _id: { type: String },
    seq: { type: Number, default: 0 },
    lastVerifiedSeq: { type: Number, default: 0 },
    lastVerifiedAt: { type: Date },
    lastVerifyResult: { type: Schema.Types.Mixed },
    lockedUntil: { type: Date, default: null },
    lockOwner: { type: String },
  },
  { collection: 'audit_chain_heads', versionKey: false },
);

module.exports = mongoose.models.AuditChainHead || mongoose.model('AuditChainHead', auditChainHeadSchema);
