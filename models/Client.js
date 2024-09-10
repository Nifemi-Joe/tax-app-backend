const mongoose = require('mongoose');
const { Schema } = mongoose;

// Define the Client schema
const clientSchema = new Schema({
	name: {
		type: String,
		required: [true, 'Client name is required'],
		trim: true,
		minlength: [2, 'Client name must be at least 2 characters long'],
		maxlength: [100, 'Client name must not exceed 100 characters'],
	},
	email: {
		type: String,
		required: [true, 'Client email is required'],
		trim: true,
		unique: true,
		lowercase: true,
		validate: {
			validator: function(v) {
				// Regular expression for email validation
				return /^([\w-]+(?:\.[\w-]+)*@([\w-]+\.)+[a-zA-Z]{2,7})$/.test(v);
			},
			message: props => `${props.value} is not a valid email address!`
		}
	},
	phone: {
		type: String,
		required: [true, 'Client phone number is required'],
		trim: true,
	},
	address: {
		type: String,
		trim: true,
		maxlength: [255, 'Address must not exceed 255 characters'],
	},
	company: {
		type: String,
		trim: true,
		maxlength: [255, 'Company name must not exceed 255 characters'],
	},
	clientTotalInvoice: {
		type: Number,
		default: 0
	},
	clientInvoices: {
		type: Array
	},
	clientProducts: {
		type: Array
	},
	createdAt: {
		type: Date,
		default: Date.now,
	},
	updatedAt: {
		type: Date,
		default: Date.now,
	},
	status: {
		type: String,
		enum: ['active', 'pending', 'deleted', 'inactive'],
		default: "active"
	}
});

// Middleware to update 'updatedAt' field before saving
clientSchema.pre('save', function(next) {
	if (this.isModified()) {
		this.updatedAt = Date.now();
	}
	next();
});

// Define and export the Client model
const Client = mongoose.model('Client', clientSchema);

module.exports = Client;
