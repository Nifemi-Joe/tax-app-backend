'use strict';

const mongoose = require('mongoose');
const { NOTIFICATION_TYPES } = require('../utils/assetConstants');

const notificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  asset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', default: null },
  assetId: { type: String, default: '' },
  assetTitle: { type: String, default: '' },
  type: { type: String, enum: NOTIFICATION_TYPES, required: true },
  severity: { type: String, enum: ['info', 'warning', 'high', 'critical'], default: 'info' },
  message: { type: String, required: true, maxlength: 1000 },
  dueDate: { type: Date, default: null },
  daysRemaining: { type: Number, default: null },
  dedupeKey: { type: String, required: true },     // guarantees a reminder fires once per milestone per recipient
  emailedAt: { type: Date, default: null },
  readAt: { type: Date, default: null },
  acknowledgedAt: { type: Date, default: null },
  acknowledgedBy: { type: String, default: '' },
}, { timestamps: true });

notificationSchema.index({ recipient: 1, dedupeKey: 1 }, { unique: true });
notificationSchema.index({ recipient: 1, readAt: 1, createdAt: -1 });
// keep 18 months of reminders, then let Mongo clean up (the evidence lives in AssetEvent)
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 548 });

module.exports = mongoose.model('AssetNotification', notificationSchema);
