const mongoose = require('mongoose');
const { Schema } = mongoose;

// Define the Client schema
const clientSchema = new Schema({
	name: {
		type: String,
		required: [true, 'Company name is required'],
		trim: true,
		minlength: [2, 'Company name must be at least 2 characters long'],
		maxlength: [100, 'Company name must not exceed 100 characters'],
	},
	email: {
		type: [String],
		required: [true, 'At least one email is required'],
		validate: [arrayLimit, 'Cannot have more than 10 email addresses'],
		lowercase: true,
	},
	phone: {
		type: [String],
		required: [true, 'At least one phone number is required'],
		validate: [arrayLimit, 'Cannot have more than 10 phone numbers'],
	},
	account: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'Account',
		required: [true, 'Account is required'],
	},
	createdBy: {
		type: String,
		required: [true, 'Client Created By is required'],
	},
	updatedBy: {
		type: String,
	},
	deletedBy: {
		type: String,
	},
	address: {
		type: String,
		trim: true,
		maxlength: [255, 'Address must not exceed 255 characters'],
	},
	clientTotalInvoice: {
		type: Number,
		default: 0,
	},
	clientAmountDue: {
		type: Number,
		default: 0,
	},
	clientAmountPaid: {
		type: Number,
		default: 0,
	},
	clientInvoices: {
		type: Array,
	},
	clientProducts: {
		type: Array,
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
		default: 'pending',
	},
});

// Validator function for array size
function arrayLimit(val) {
	return val.length <= 10;  // Limit to 5 emails or phone numbers
}

// Middleware to format numbers to two decimal places before saving
clientSchema.pre('save', function (next) {
	if (this.isModified()) {
		if (this.clientTotalInvoice !== undefined) {
			this.clientTotalInvoice = Number(this.clientTotalInvoice.toFixed(2));
		}
		if (this.clientAmountDue !== undefined) {
			this.clientAmountDue = Number(this.clientAmountDue.toFixed(2));
		}
		if (this.clientAmountPaid !== undefined) {
			this.clientAmountPaid = Number(this.clientAmountPaid.toFixed(2));
		}
		this.updatedAt = Date.now(); // Update the 'updatedAt' timestamp
	}
	next();
});

// Define and export the Client model
const Client = mongoose.model('Client', clientSchema);

module.exports = Client;
