'use strict';

const mongoose = require('mongoose');
const {
  CATEGORY_KEYS, CLASSIFICATIONS, RATINGS, LIFECYCLE_STATUSES, EOL_STATES,
} = require('../utils/assetConstants');
const rules = require('../utils/assetRules');

const str = (max, extra = {}) => ({ type: String, trim: true, maxlength: max, default: '', ...extra });
const date = () => ({ type: Date, default: null });

const disposalSchema = new mongoose.Schema({
  reason: str(1000),
  method: str(200),
  previousStatus: { type: String, enum: [...LIFECYCLE_STATUSES, null], default: null },
  requestedBy: str(64), requestedByName: str(200), requestedAt: date(),
  approvedBy: str(64), approvedByName: str(200), approvedAt: date(),
  completedBy: str(64), completedAt: date(),
  certificateRef: str(200), // e.g. data-wipe certificate no., auction receipt, shredding certificate
}, { _id: false });

const assetSchema = new mongoose.Schema({
  assetId: { type: String, required: true, unique: true, trim: true, maxlength: 80 },
  legacyAssetId: str(80),
  title: { type: String, required: true, trim: true, maxlength: 300 },
  category: { type: String, required: true, enum: CATEGORY_KEYS },
  subCategory: str(120),
  description: str(2000),

  owner: str(200), custodian: str(200), users: str(300), location: str(300),
  ownerUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  custodianUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  classification: { type: String, enum: [...CLASSIFICATIONS, null], default: null },
  confidentiality: { type: String, enum: [...RATINGS, null], default: null },
  integrity: { type: String, enum: [...RATINGS, null], default: null },
  availability: { type: String, enum: [...RATINGS, null], default: null },
  value: { type: Number, min: 0, max: 9, default: null },       // computed from C/I/A when all three exist
  criticality: { type: String, enum: ['Low', 'Medium', 'High', 'Critical', null], default: null },

  vendor: str(200), serialNumber: str(200), makeModel: str(200), version: str(100),
  maintenanceStatus: str(100),

  // ---- lifecycle ---------------------------------------------------------
  lifecycleStatus: { type: String, enum: LIFECYCLE_STATUSES, default: 'active' },
  acquisitionDate: date(),
  expectedLifeMonths: { type: Number, min: 1, max: 600, default: null },
  endOfLifeOverride: date(),     // set by "extend life" (needs justification)
  endOfLifeDate: date(),         // computed
  eolState: { type: String, enum: EOL_STATES, default: 'unknown' },
  licenseExpiryDate: date(),
  warrantyExpiryDate: date(),
  reviewCycleMonths: { type: Number, min: 1, max: 120, default: null },
  lastReviewedAt: date(),
  lastReviewedBy: str(64),
  nextReviewDate: date(),        // computed
  disposalMethod: str(200),
  disposal: { type: disposalSchema, default: () => ({}) },

  backupSchedule: str(200), backupLocation: str(300), backupDetails: str(300),

  details: { type: mongoose.Schema.Types.Mixed, default: {} }, // category specific columns (IP, RAM, KRA...)
  tags: [{ type: String, trim: true, maxlength: 40 }],

  dataQualityFlags: [{ type: String }],
  completeness: { type: Number, min: 0, max: 100, default: 0 },
  source: { sheet: str(80), row: { type: Number, default: null } },

  // tamper-evidence anchors (see AssetEvent)
  eventCount: { type: Number, default: 0 },
  lastEventHash: str(128),

  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
  recordStatus: { type: String, enum: ['active', 'deleted'], default: 'active' },
  createdBy: str(64), updatedBy: str(64), deletedBy: str(64), deletedAt: date(), deleteReason: str(500),
}, {
  timestamps: true,
  optimisticConcurrency: true, // save() fails with VersionError if someone else changed the doc
  toJSON: {
    virtuals: false,
    transform: (_doc, ret) => { ret.revision = ret.__v; delete ret.__v; return ret; },
  },
});

assetSchema.pre('validate', function preValidate(next) {
  const v = rules.valueFromCIA(this.confidentiality, this.integrity, this.availability);
  if (v) this.value = v;
  this.criticality = rules.criticalityFromValue(this.value);

  this.endOfLifeDate = rules.computeEndOfLife(this);
  this.nextReviewDate = this.reviewCycleMonths && this.lastReviewedAt
    ? rules.addMonths(this.lastReviewedAt, this.reviewCycleMonths) : null;
  this.eolState = rules.computeEolState(this);

  const q = rules.assessQuality(this);
  const importFlags = (this.dataQualityFlags || []).filter((f) => f.startsWith('import_'));
  this.dataQualityFlags = [...importFlags, ...q.flags];
  this.completeness = q.completeness;
  next();
});

assetSchema.index({ category: 1, lifecycleStatus: 1 });
assetSchema.index({ recordStatus: 1, endOfLifeDate: 1 });
assetSchema.index({ recordStatus: 1, eolState: 1 });
assetSchema.index({ recordStatus: 1, nextReviewDate: 1 });
assetSchema.index({ recordStatus: 1, licenseExpiryDate: 1 });
assetSchema.index({ classification: 1 });
assetSchema.index({ criticality: 1 });

module.exports = mongoose.model('Asset', assetSchema);
