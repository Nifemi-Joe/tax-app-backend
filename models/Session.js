/**
 * @file Session.js
 * @description Mongoose model for user sessions
 * Implements ISMS A.9.2.2 (User access provisioning) and A.12.4.1 (Event logging)
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const sessionSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'User is required'],
    },
    token: {
        type: String,
        required: [true, 'Token is required'],
        unique: true,
    },
    refreshToken: {
        type: String,
        unique: true,
        sparse: true,
    },
    device: {
        type: String,
        trim: true,
        default: 'Unknown Device',
    },
    browser: {
        type: String,
        trim: true,
        default: 'Unknown Browser',
    },
    os: {
        type: String,
        trim: true,
        default: 'Unknown OS',
    },
    ip: {
        type: String,
        trim: true,
        default: 'Unknown IP',
    },
    location: {
        type: String,
        trim: true,
        default: 'Unknown Location',
    },
    userAgent: {
        type: String,
        trim: true,
        default: '',
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    lastActive: {
        type: Date,
        default: Date.now,
    },
    expiresAt: {
        type: Date,
        required: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    terminatedAt: {
        type: Date,
        default: null,
    },
    terminatedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        default: null,
    },
    reasonTerminated: {
        type: String,
        trim: true,
        default: '',
    },
}, {
    timestamps: true,
});

// ============================================================
// INDEXES (using schema.index() only - NO index: true on fields)
// ============================================================
sessionSchema.index({ user: 1 });
sessionSchema.index({ token: 1 }, { unique: true });
sessionSchema.index({ isActive: 1 });
sessionSchema.index({ lastActive: 1 });
sessionSchema.index({ expiresAt: 1 });
sessionSchema.index({ createdAt: 1 });

// Compound indexes for efficient queries
sessionSchema.index({ user: 1, isActive: 1, lastActive: -1 });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

// ============================================================
// VIRTUALS
// ============================================================
sessionSchema.virtual('age').get(function() {
    return Date.now() - this.createdAt.getTime();
});

// ============================================================
// INSTANCE METHODS
// ============================================================
sessionSchema.methods.terminate = function(terminatedBy = null, reason = '') {
    this.isActive = false;
    this.terminatedAt = new Date();
    this.terminatedBy = terminatedBy;
    this.reasonTerminated = reason;
    return this.save();
};

sessionSchema.methods.isExpired = function() {
    return this.expiresAt < new Date();
};

sessionSchema.methods.updateActivity = function() {
    this.lastActive = new Date();
    return this.save();
};

// ============================================================
// STATIC METHODS
// ============================================================
sessionSchema.statics.cleanupExpired = function() {
    return this.deleteMany({
        $or: [
            { expiresAt: { $lt: new Date() } },
            { isActive: false, terminatedAt: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }
        ]
    });
};

sessionSchema.statics.getActiveSessions = function(userId) {
    return this.find({
        user: userId,
        isActive: true,
        expiresAt: { $gt: new Date() }
    }).sort({ lastActive: -1 });
};

sessionSchema.statics.terminateAllExcept = function(userId, currentSessionId, terminatedBy, reason = 'Security policy') {
    return this.updateMany(
        {
            user: userId,
            _id: { $ne: currentSessionId },
            isActive: true,
        },
        {
            $set: {
                isActive: false,
                terminatedAt: new Date(),
                terminatedBy: terminatedBy,
                reasonTerminated: reason,
            }
        }
    );
};

module.exports = mongoose.model('Session', sessionSchema);