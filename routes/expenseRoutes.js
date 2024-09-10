const express = require('express');
const router = express.Router();
const {
	createExpense,
	updateExpense,
	printExpense,
	getAllExpenses,
	spoolExpenses,
	trackExpense,
	disburseExpense
} = require('../controllers/expenseController');

// Middleware for authorization (example)
const authMiddleware = require('../middlewares/authMiddleware');

// Route to create a new expense
router.post('/create', createExpense);

// Route to update an existing expense
router.put('/update/:id', updateExpense);

// Route to print an expense
router.get('/read-by-id/:id',printExpense);

// Route to get a list of all expenses
router.get('/read', getAllExpenses);

// Route to spool expenses by category or date range
router.post('/spool', spoolExpenses);

// Route to track expense payments
router.get('/track/:id', trackExpense);

// Route to disburse or claim an expense
router.put('/disburse/:id', disburseExpense);

module.exports = router;
