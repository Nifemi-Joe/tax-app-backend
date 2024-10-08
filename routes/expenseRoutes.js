const express = require('express');
const router = express.Router();
const {
	createExpense,
	updateExpense,
	printExpense,
	getAllExpenses,
	spoolExpenses,
	trackExpense,
	disburseExpense,
	softDeleteExpense
} = require('../controllers/expenseController');

// Middleware for authorization (example)
const authMiddleware = require('../middlewares/authMiddleware');
const {validateObjectId} = require('../middlewares/errorMiddleware');
const {authorize, authorizePermissions, protect} = require("../middlewares/authMiddleware");

// Route to create a new expense
router.post('/create', protect, createExpense);

// Route to update an existing expense
router.put('/update/:id', protect,authorize('superadmin', 'admin', 'clientAdmin'), authorizePermissions('update-expense'),validateObjectId('id'), updateExpense);

// Route to print an expense
router.get('/read-by-id/:id', protect,validateObjectId('id'), printExpense);

// Route to get a list of all expenses
router.get('/read', protect,getAllExpenses);

// Route to spool expenses by category or date range
router.post('/spool', protect,spoolExpenses);

// Route to track expense payments
router.get('/track/:id', protect,validateObjectId('id'), trackExpense);

// Route to disburse or claim an expense
router.put('/disburse/:id', protect,validateObjectId('id'), disburseExpense);

router.delete('/delete/:id', protect,authorize('superadmin', 'admin', 'clientAdmin'), authorizePermissions('delete-expense'),validateObjectId('id'), softDeleteExpense);

module.exports = router;
