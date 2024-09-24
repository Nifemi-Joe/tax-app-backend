const mongoose = require('mongoose');

const rateSchema = new mongoose.Schema({
	value: { type: Number, required: true },
	createdAt: { type: Date, default: Date.now },
});

const Rate = mongoose.model('Rate', rateSchema);
module.exports = Rate;
