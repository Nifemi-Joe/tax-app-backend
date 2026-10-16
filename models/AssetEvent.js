/**
 * @file AssetEvent.js
 * @description Append-only, hash-chained evidence log for every asset
 * Each event stores HMAC-SHA256(secret, canonical(event) + prevHash)
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const eventSchema = new Schema({
  asset: {
    type: Schema.Types.ObjectId,
    ref: 'Asset',
    required: true
  },
  assetId: {
    type: String,
    required: true
  },
  seq: {
    type: Number,
    required: true
  },
  action: {
    type: String,
    required: true,
    maxlength: 60
  },
  actor: {
    id: { type: String, required: true },
    name: { type: String, default: '' },
    role: { type: String, default: '' },
  },
  ip: {
    type: String,
    default: ''
  },
  userAgent: {
    type: String,
    default: '',
    maxlength: 300
  },
  changes: [{
    _id: false,
    field: String,
    from: String,
    to: String
  }],
  note: {
    type: String,
    default: '',
    maxlength: 2000
  },
  at: {
    type: Date,
    required: true
  },
  prevHash: {
    type: String,
    default: ''
  },
  hash: {
    type: String,
    required: true
  },
}, {
  timestamps: false,
  versionKey: false
});

// ============================================================
// INDEXES
// ============================================================
eventSchema.index({ asset: 1 });
eventSchema.index({ assetId: 1 });
eventSchema.index({ at: 1 });
eventSchema.index({ asset: 1, seq: 1 }, { unique: true });

// ============================================================
// IMMUTABILITY ENFORCEMENT
// ============================================================
const blocked = (name) => function blockedOp(next) {
  next(new Error(`AssetEvent is append-only: ${name} is not allowed`));
};

['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne',
  'deleteOne', 'deleteMany', 'findOneAndDelete', 'findOneAndRemove'].forEach((op) => {
  eventSchema.pre(op, blocked(op));
});

eventSchema.pre('save', function guard(next) {
  if (!this.isNew) {
    return next(new Error('AssetEvent is append-only: save() on an existing event is not allowed'));
  }
  return next();
});

// ============================================================
// INSTANCE METHODS
// ============================================================
eventSchema.methods.toJSON = function() {
  return {
    _id: this._id,
    asset: this.asset,
    assetId: this.assetId,
    seq: this.seq,
    action: this.action,
    actor: this.actor,
    ip: this.ip,
    userAgent: this.userAgent,
    changes: this.changes,
    note: this.note,
    at: this.at,
    hash: this.hash,
  };
};

// ============================================================
// STATIC METHODS
// ============================================================
eventSchema.statics.getChainForAsset = function(assetId) {
  return this.find({ assetId }).sort({ seq: 1 });
};

eventSchema.statics.getLatestEvent = function(assetId) {
  return this.findOne({ assetId }).sort({ seq: -1 });
};

module.exports = mongoose.model('AssetEvent', eventSchema);