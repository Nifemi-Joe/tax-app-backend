const mongoose = require('mongoose');

// SLA Schema
const slaSchema = new mongoose.Schema({
	serviceName: {
		type: String,
		required: [true, 'Service name is required'],
		trim: true,
		maxlength: [100, 'Service name cannot be more than 100 characters']
	},
	description: {
		type: String,
		required: [true, 'Description is required'],
		trim: true,
		maxlength: [500, 'Description cannot be more than 500 characters']
	},
	slaType: {
		type: String,
		enum: ['Standard', 'Premium', 'Enterprise'],
		default: 'Standard'
	},
	responseTime: {
		type: Number,
		required: [true, 'Response time is required'],
		min: [0, 'Response time must be a positive number'],
		max: [72, 'Response time cannot exceed 72 hours'] // Example constraint
	},
	resolutionTime: {
		type: Number,
		required: [true, 'Resolution time is required'],
		min: [0, 'Resolution time must be a positive number'],
		max: [168, 'Resolution time cannot exceed 168 hours'] // Example constraint
	},
	penalties: {
		type: String,
		trim: true,
		maxlength: [500, 'Penalties description cannot be more than 500 characters']
	},
	createdAt: {
		type: Date,
		default: Date.now
	},
	updatedAt: {
		type: Date,
		default: Date.now
	}
}, {
	timestamps: true
});

// Update updatedAt field before saving
slaSchema.pre('save', function(next) {
	this.updatedAt = Date.now();
	next();
});

// Ensure the SLA response and resolution times are realistic and aligned
slaSchema.pre('save', function(next) {
	if (this.responseTime > this.resolutionTime) {
		return next(new Error('Response time cannot be greater than resolution time.'));
	}
	next();
});

module.exports = mongoose.model('SLA', slaSchema);
