// models/VAT.js

const mongoose = require('mongoose');
const { Schema } = mongoose;

const vatSchema = new Schema(
	{
		value: {
			type: Number,
			required: [true, 'VAT value is required'],
			min: [0, 'VAT value cannot be negative'],
		},
		status: {
			type: String,
			enum: ['active', 'inactive'],
			default: 'active',
		},
		inactiveReason: {
			type: String,
			default: '',
		},
	},
	{ timestamps: true }
);

module.exports = mongoose.model('VAT', vatSchema);
