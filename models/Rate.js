const mongoose = require('mongoose');

const rateSchema = new mongoose.Schema({
	value: {
		type: Number,
		required: true,
	},
	cbnratedate: {
		type: Date,
		required: true,
		default: Date.now()
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

// Pre-save hook to ensure 'value' is stored with two decimal places
rateSchema.pre('save', function (next) {
	if (this.value !== undefined) {
		this.value = parseFloat(this.value.toFixed(3));  // Round to two decimal places
	}
	next();
});

module.exports = mongoose.model('Rate', rateSchema);
