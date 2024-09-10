const mongoose = require('mongoose');

const TaxSchema = new mongoose.Schema({
		taxId: { type: String, unique: true, required: true },
	invoiceNo: { type: String, required: true },
	taxType: { type: String, required: true },
	totalAmount: { type: Number, required: true },
	taxRate: { type: Number, required: true },
	taxAmountDeducted: { type: Number, required: true },
	netAmount: { type: Number, required: true },
	date: { type: Date, default: Date.now },
	status: { type: String, enum: ['paid', 'unpaid'], default: 'unpaid' },
});

const Tax = mongoose.model('Tax', TaxSchema);

module.exports = Tax;
