const mongoose = require('mongoose');

// Define the Notification schema
const notificationSchema = new mongoose.Schema({
	userId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'User',
		required: true,
		index: true
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
	read: {
		type: Boolean,
		default: false
	},
	createdAt: {
		type: Date,
		default: Date.now
	}
}, {
	timestamps: true // Automatically add `createdAt` and `updatedAt` fields
});

// Create a compound index for userId and read status to optimize query performance
notificationSchema.index({ userId: 1, read: 1 });

// Define the Notification model
const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
