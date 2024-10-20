const mongoose = require('mongoose');
const rateSchema = new mongoose.Schema({
	value: {
		type: Number,
		required: true,
	},
	status: {
		type: String,
		default: 'active',
		enum: ['active', 'deleted'],
	},
	currency: {
		type: String,
		default: 'USD',
	},
	companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true }, // Belongs to a company
	createdAt: {
		type: Date,
		default: Date.now,
	},
	createdBy: {
		type: String,
		required: [true, 'Rate Created By is required'],
	},
	updatedBy: {
		type: String,
	},
	deletedBy: {
		type: String,
	},
});

module.exports = mongoose.model('Rate', rateSchema);
