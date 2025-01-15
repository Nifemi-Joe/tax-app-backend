const mongoose = require('mongoose');
const { Schema } = mongoose;

const vatSchema = new Schema(
	{
		value: {
			type: Number,
			required: [true, 'Tax value is required'],
			min: [0, 'Tax value cannot be negative'],
			set: (value) => parseFloat(value.toFixed(2)), // Ensure the VAT value is rounded to 2 decimal places
		},
		status: {
			type: String,
			enum: ['active', 'inactive'],
			default: 'active',
		},
		type: {
			type: String,
			enum: ['VAT', 'WHT'],
			default: 'WHT',
		},
		inactiveReason: {
			type: String,
			default: '',
		},
		createdBy: {
			type: String,
			required: [true, 'Vat Created By is required'],
		},
		updatedBy: {
			type: String,
		},
		deletedBy: {
			type: String,
		},
	},
	{ timestamps: true }
);

module.exports = mongoose.model('VAT', vatSchema);
