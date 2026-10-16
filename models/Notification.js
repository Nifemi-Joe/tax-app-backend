/**
 * @file Notification.js
 * @description Notification model for user notifications
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const notificationSchema = new Schema({
	userId: {
		type: Schema.Types.ObjectId,
		ref: 'User',
		required: true,
	},
	title: {
		type: String,
		required: true,
		trim: true,
		maxlength: 255
	},
	message: {
		type: String,
		required: true,
		trim: true
	},
	type: {
		type: String,
		enum: ['info', 'success', 'warning', 'error'],
		default: 'info'
	},
	read: {
		type: Boolean,
		default: false
	},
	readAt: {
		type: Date,
		default: null
	},
	actionUrl: {
		type: String,
		default: null
	},
	metadata: {
		type: Schema.Types.Mixed,
		default: {}
	}
}, {
	timestamps: true
});

// ============================================================
// INDEXES (using schema.index() only - NO index: true on fields)
// ============================================================
notificationSchema.index({ userId: 1 });
notificationSchema.index({ read: 1 });
notificationSchema.index({ createdAt: 1 });

// Compound indexes
notificationSchema.index({ userId: 1, read: 1 });
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

// ============================================================
// INSTANCE METHODS
// ============================================================
notificationSchema.methods.markAsRead = function() {
	this.read = true;
	this.readAt = new Date();
	return this.save();
};

notificationSchema.methods.markAsUnread = function() {
	this.read = false;
	this.readAt = null;
	return this.save();
};

// ============================================================
// STATIC METHODS
// ============================================================
notificationSchema.statics.getUnread = function(userId, limit = 20) {
	return this.find({
		userId,
		read: false
	})
		.sort({ createdAt: -1 })
		.limit(limit);
};

notificationSchema.statics.getByUser = function(userId, limit = 50, skip = 0) {
	return this.find({ userId })
		.sort({ createdAt: -1 })
		.limit(limit)
		.skip(skip);
};

notificationSchema.statics.markAllAsRead = function(userId) {
	return this.updateMany(
		{ userId, read: false },
		{ read: true, readAt: new Date() }
	);
};

notificationSchema.statics.deleteOld = function(daysOld = 30) {
	const date = new Date();
	date.setDate(date.getDate() - daysOld);
	return this.deleteMany({
		createdAt: { $lt: date },
		read: true
	});
};

module.exports = mongoose.model('Notification', notificationSchema);