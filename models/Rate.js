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
	createdAt: {
		type: Date,
		default: Date.now,
	}
});

module.exports = mongoose.model('Rate', rateSchema);
