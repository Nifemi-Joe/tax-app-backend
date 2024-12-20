const mongoose = require('mongoose');

const WHTSchema = new mongoose.Schema({
	whtId: { type: String, required: true, unique: true },
	invoiceNo: { type: String, required: true },
	clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
	totalTransactionAmount: { type: Number, required: true },
	whtRate: { type: Number, required: true },
	whtAmount: { type: Number, required: true },
	createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
	createdAt: { type: Date, default: Date.now },
	status: {type: String, default: "unpaid", enum: ["paid", "unpaid", "deleted"]}
});

module.exports = mongoose.model('WHT', WHTSchema);
