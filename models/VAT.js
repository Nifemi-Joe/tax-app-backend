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
		createdBy: {
			type: String,
			required: [true, 'Vat Created By is required'],
		},
		updatedBy: {
			type: String,
		},
		companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true }, // Belongs to a company
		deletedBy: {
			type: String,
		},
	},
	{ timestamps: true }
);

module.exports = mongoose.model('VAT', vatSchema);
