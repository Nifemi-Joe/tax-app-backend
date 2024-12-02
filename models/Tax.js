const mongoose = require('mongoose');

const TaxSchema = new mongoose.Schema({
	taxId: { type: String, unique: true, required: true },
	invoiceNo: { type: String, required: true },
	clientId: { type: String, required: true },
	taxType: { type: String, required: true },
	totalAmount: {
		type: Number,
		required: true,
		set: (value) => parseFloat(value.toFixed(2)) // Ensure totalAmount is fixed to 2 decimal places
	},
	companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true }, // Belongs to a company
	taxRate: {
		type: Number,
		required: true,
		set: (value) => parseFloat(value.toFixed(2)) // Ensure taxRate is fixed to 2 decimal places
	},
	taxAmountDeducted: {
		type: Number,
		required: true,
		set: (value) => parseFloat(value.toFixed(2)) // Ensure taxAmountDeducted is fixed to 2 decimal places
	},
	netAmount: {
		type: Number,
		required: true,
		set: (value) => parseFloat(value.toFixed(2)) // Ensure netAmount is fixed to 2 decimal places
	},
	date: { type: Date, default: Date.now },
	status: { type: String, enum: ['paid', 'unpaid'], default: 'unpaid' },
});

const Tax = mongoose.model('Tax', TaxSchema);

module.exports = Tax;
