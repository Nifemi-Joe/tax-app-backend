const mongoose = require('mongoose');

const accountSchema = new mongoose.Schema(
	{
		bankName: {
			type: String,
			required: [true, 'Bank name is required'],
			trim: true,
		},
		accountName: {
			type: String,
			required: [true, 'Account name is required'],
			trim: true,
		},
		accountNumber: {
			type: String,
			required: [true, 'Account number is required'],
			unique: true,
			trim: true,
		},
		accountType: {
			type: String,
			enum: ['savings', 'current', 'business'],
			required: [true, 'Account type is required'],
		},
		status: {
			type: String,
			enum: ['active', 'pending', 'closed'],
			default: 'Active',
		},
		createdBy: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true,
		},
		createdAt: {
			type: Date,
			default: Date.now,
		},
		updatedAt: {
			type: Date,
		},
	},
	{
		timestamps: true, // Automatically add createdAt and updatedAt fields
	}
);

module.exports = mongoose.model('Account', accountSchema);
