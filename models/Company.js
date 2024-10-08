const mongoose = require('mongoose');
const { Schema } = mongoose;

// Define Company Schema
const companySchema = new Schema({
	name: { type: String, required: true },
	adminId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
	clients: [{ type: mongoose.Schema.Types.ObjectId, ref: "Client" }],
	taxes: [{ type: mongoose.Schema.Types.ObjectId, ref: "Tax" }],
	employees: [{ type: mongoose.Schema.Types.ObjectId, ref: "Employee" }],
	revenue: [{ type: mongoose.Schema.Types.ObjectId, ref: "Revenue" }],
	rate: [{ type: mongoose.Schema.Types.ObjectId, ref: "Rate" }],
	expense: [{ type: mongoose.Schema.Types.ObjectId, ref: "Expense" }],
	vat: [{ type: mongoose.Schema.Types.ObjectId, ref: "VAT" }],
	service: [{ type: mongoose.Schema.Types.ObjectId, ref: "Service" }],
	address: String,
	contactNumber: String,
	companyEmail: String,
	createdAt: {
		type: Date,
		default: Date.now,
	},
	updatedAt: {
		type: Date,
		default: Date.now,
	},
	createdBy: {
		type: String,
		required: [true, 'Company Created By is required'],
	},
	updatedBy: {
		type: String,
	},
	deletedBy: {
		type: String,
	},
});

// Middleware to update `updatedAt` before saving
companySchema.pre('save', function(next) {
	if (this.isModified()) {
		this.updatedAt = Date.now();
	}
	next();
});

const Company = mongoose.model('Company', companySchema);
module.exports = Company;
