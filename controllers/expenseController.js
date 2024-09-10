const Expense = require('../models/Expense');
const asyncHandler = require('express-async-handler');
const { check, validationResult } = require('express-validator');

// @desc    Create a new expense
// @route   POST /api/expenses
// @access  Private
exports.createExpense = asyncHandler(async (req, res) => {
	await check('amount', 'Amount must be a positive number').isFloat({ min: 0 }).run(req);
	await check('category', 'Category is required').not().isEmpty().run(req);
	await check('date', 'Date is required').isISO8601().run(req);

	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return res.status(400).json({ errors: errors.array() });
	}

	const expenseData = req.body;

	const expense = await Expense.create(expenseData);

	if (expense) {
		res.status(201).json({
			responseCode: "00",
			responseMessage: "Expense added successfully!",
			responseData: expense
		});
	} else {
		res.status(400).json(
			{
				responseCode: "24",
				responseMessage: "Invalid expense data"
			})
	}
});

// @desc    Update an existing expense
// @route   PUT /api/expenses/:id
// @access  Private
exports.updateExpense = asyncHandler(async (req, res) => {
	const expense = await Expense.findById(req.params.id);

	if (!expense) {
		res.status(404).json({ message: 'Expense not found' });
		return;
	}

	const updates = req.body;

	const updatedExpense = await Expense.findByIdAndUpdate(req.params.id, updates, {
		new: true,
		runValidators: true,
	});

	res.status(200).json(updatedExpense);
});

// @desc    Print an expense
// @route   GET /api/expenses/:id/print
// @access  Private
exports.printExpense = asyncHandler(async (req, res) => {
	const expense = await Expense.findById(req.params.id);

	if (!expense) {
		res.status(404).json({ message: 'Expense not found' });
		return;
	}

	// Simulate printing by sending a response with expense details
	res.status(200).json({
		responseCode: "00",
		responseMessage: "Completed successfully",
		responseData: expense
	});
});

// @desc    Get list of all expenses
// @route   GET /api/expenses
// @access  Private
exports.getAllExpenses = asyncHandler(async (req, res) => {
	const expenses = await Expense.find();

	res.status(200).json({
		responseCode: "00",
		responseMessage: "Completed successfully",
		responseData: expenses
	});
});

// @desc    Spool expenses by category or date range
// @route   POST /api/expenses/spool
// @access  Private
exports.spoolExpenses = asyncHandler(async (req, res) => {
	const { category, startDate, endDate } = req.body;

	let query = {};

	if (category) {
		query.category = category;
	}

	if (startDate || endDate) {
		query.date = {};
		if (startDate) query.date.$gte = startDate;
		if (endDate) query.date.$lte = endDate;
	}

	const expenses = await Expense.find(query);

	res.status(200).json({
		responseCode: "00",
		responseMessage: "Completed successfully",
		responseData: expenses
	});
});

// @desc    Track expense payments
// @route   GET /api/expenses/:id/track
// @access  Private
exports.trackExpense = asyncHandler(async (req, res) => {
	const expense = await Expense.findById(req.params.id);

	if (!expense) {
		res.status(404).json({ message: 'Expense not found' });
		return;
	}

	res.status(200).json({
		description: expense.description,
		amount: expense.amount,
		category: expense.category,
		date: expense.date,
		status: expense.status,
		paidOn: expense.paidOn,
	});
});

// @desc    Disburse or claim an expense
// @route   PUT /api/expenses/:id/disburse
// @access  Private
exports.disburseExpense = asyncHandler(async (req, res) => {
	const expense = await Expense.findById(req.params.id);

	if (!expense) {
		res.status(404).json({ message: 'Expense not found' });
		return;
	}

	if (expense.status !== 'Pending') {
		res.status(400).json({ message: 'Expense is already disbursed or claimed' });
		return;
	}

	expense.status = 'Disbursed';
	expense.paidOn = new Date();

	await expense.save();

	res.status(200).json({ message: 'Expense disbursed successfully', expense });
});
