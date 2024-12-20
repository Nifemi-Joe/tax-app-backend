const mongoose = require('mongoose');

// Expense Schema
const expenseSchema = new mongoose.Schema(
	{
		description: {
			type: String,
			trim: true,
			maxlength: [500, 'Description cannot be more than 500 characters'],
		},
		companyId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Company',
			required: true, // Belongs to a company
		},
		amount: {
			type: Number,
			required: [true, 'Amount is required'],
			min: [0, 'Amount must be a positive number'],
		},
		status: {
			type: String,
			required: true,
			default: "created",
			enum: ["created", "approved", "deleted"]
		},
		category: {
			type: String,
			enum: [
				'Travelling',
				'Office Confectioneries',
				'Welfare',
				'Office Equipment',
				'Vehicles',
				'Power Generating Equipment',
				'Others',
				'Meals',
				'Entertainment',
				'Utilities',
				'Other',
				'Salaries',
				'Furnitures',
				'Rent',
				'Fueling',
				'Electricity',
				'Corporate Social Responsibility',
				'Training',
				'Consulting Services',
				'Software Acquisition',
			],
			default: 'Others',
		},
		date: {
			type: Date,
			required: [true, 'Date is required'],
			default: Date.now,
		},
		user: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: [true, 'User ID is required'],
		},
		receipt: {
			type: String,
			trim: true,
			maxlength: [500, 'Receipt URL cannot be more than 500 characters'],
		},
		image: {
			type: String,
			trim: true,
			maxlength: [100000, 'Image cannot be more than 100000 characters'],
		},
		createdBy: {
			type: String,
			required: [true, 'Expense Created By is required'],
		},
		updatedBy: {
			type: String,
		},
		deletedBy: {
			type: String,
		},
	},
	{
		timestamps: true,
	}
);

// Middleware to format `amount` to two decimal places before saving
expenseSchema.pre('save', function (next) {
	if (this.amount !== undefined) {
		this.amount = Number(this.amount.toFixed(2));
	}
	next();
});

// Define a method to get formatted expense data
expenseSchema.methods.getFormattedExpense = function () {
	return {
		id: this._id,
		description: this.description || 'No description provided',
		amount: this.amount.toFixed(2), // Format amount to two decimal places
		category: this.category,
		date: this.date.toISOString().split('T')[0], // Format date to YYYY-MM-DD
		receipt: this.receipt || 'No receipt provided',
	};
};

module.exports = mongoose.model('Expense', expenseSchema);
