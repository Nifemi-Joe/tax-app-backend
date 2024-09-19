const mongoose = require('mongoose');

// Expense Schema
const expenseSchema = new mongoose.Schema({
	// title: {
	// 	type: String,
	// 	required: [true, 'Title is required'],
	// 	trim: true,
	// 	maxlength: [500, 'Title cannot be more than 500 characters']
	// },
	description: {
		type: String,
		trim: true,
		maxlength: [500, 'Description cannot be more than 500 characters']
	},
	amount: {
		type: Number,
		required: [true, 'Amount is required'],
		min: [0, 'Amount must be a positive number']
	},
	category: {
		type: String,
		enum: ['Travelling', 'Office Confectioneries', "Welfare", "Office Equipment", "Vehicles", "Power Generating Equipment", "Others", 'Meals', 'Entertainment', 'Utilities', 'Other', "Salaries","Furnitures", "Rent", "Fueling", "Electricity", "Corporate Social Responsibility", "Training", "Consulting Services", "Software Acquisition", ],
		default: 'Other'
	},
	date: {
		type: Date,
		required: [true, 'Date is required'],
		default: Date.now
	},
	user: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'User',
		required: [true, 'User ID is required']
	},
	receipt: {
		type: String,
		trim: true,
		maxlength: [500, 'Receipt URL cannot be more than 500 characters']
	},
	image: {
		type: String,
		trim: true,
		maxlength: [100000, 'Image cannot be more than 100000 characters']
	}
}, {
	timestamps: true
});

// Ensure the amount is a realistic value
expenseSchema.pre('save', function(next) {
	if (this.amount < 0) {
		return next(new Error('Amount must be a positive number.'));
	}
	next();
});

// Define a method to get formatted expense data
expenseSchema.methods.getFormattedExpense = function() {
	return {
		id: this._id,
		title: this.title,
		description: this.description || 'No description provided',
		amount: this.amount.toFixed(2), // Format amount to two decimal places
		category: this.category,
		date: this.date.toISOString().split('T')[0], // Format date to YYYY-MM-DD
		receipt: this.receipt || 'No receipt provided'
	};
};

module.exports = mongoose.model('Expense', expenseSchema);
