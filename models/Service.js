const mongoose = require('mongoose');

// Service Schema
const serviceSchema = new mongoose.Schema({
	name: {
		type: String,
		required: [true, 'Service name is required'],
		trim: true,
		maxlength: [100, 'Service name cannot be more than 100 characters']
	},
	description: {
		type: String,
		trim: true,
		maxlength: [500, 'Description cannot be more than 500 characters']
	},
	price: {
		type: Number,
		required: [true, 'Price is required'],
		min: [0, 'Price must be a positive number']
	},
	category: {
		type: String,
		enum: ['Consulting', 'Development', 'Design', 'Support', 'Other'],
		default: 'Other'
	},
	duration: {
		type: String,
		trim: true,
		maxlength: [100, 'Duration cannot be more than 100 characters']
	},
	available: {
		type: Boolean,
		default: true
	},
	user: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'User',
		required: [true, 'User ID is required']
	},
	imageUrl: {
		type: String,
		trim: true,
		maxlength: [500, 'Image URL cannot be more than 500 characters']
	}
}, {
	timestamps: true
});

// Ensure the price is a realistic value
serviceSchema.pre('save', function(next) {
	if (this.price < 0) {
		return next(new Error('Price must be a positive number.'));
	}
	next();
});

// Define a method to get formatted service data
serviceSchema.methods.getFormattedService = function() {
	return {
		id: this._id,
		name: this.name,
		description: this.description || 'No description provided',
		price: this.price.toFixed(2), // Format price to two decimal places
		category: this.category,
		duration: this.duration || 'No duration specified',
		available: this.available,
		imageUrl: this.imageUrl || 'No image available'
	};
};

module.exports = mongoose.model('Service', serviceSchema);