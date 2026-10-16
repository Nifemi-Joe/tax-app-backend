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
    softDeleteExpense,
    getExpensesWithWHT,
    getExpenseWHTSummary,
    getExpenseTaxReturns
} = require('../controllers/expenseController');

// Middleware for authorization
const { validateObjectId } = require('../middlewares/errorMiddleware');
const { authorize, protect } = require("../middlewares/authMiddleware");

// Route to create a new expense
router.post('/create', protect, authorize('superadmin', 'admin', 'frontOffice'), createExpense);

// Route to update an existing expense
router.put('/update/:id', protect, authorize('superadmin', 'admin', 'backOffice'), validateObjectId('id'), updateExpense);

// Route to print an expense
router.get('/read-by-id/:id', protect, validateObjectId('id'), printExpense);

// Route to get a list of all expenses
router.get('/read', protect, getAllExpenses);

// Route to spool expenses by category or date range
router.post('/spool', protect, spoolExpenses);

// Route to track expense payments
router.get('/track/:id', protect, validateObjectId('id'), trackExpense);

// Route to disburse or claim an expense
router.put('/disburse/:id', protect, validateObjectId('id'), disburseExpense);

// Route to soft delete an expense
router.delete('/delete/:id', protect, authorize('superadmin', 'admin'), validateObjectId('id'), softDeleteExpense);

// ============== WHT Related Routes ==============

// Route to get all expenses with WHT enabled
router.get('/with-wht', protect, getExpensesWithWHT);

// Route to get WHT summary for expenses
router.get('/wht-summary', protect, getExpenseWHTSummary);

// Route to generate tax returns report
router.post('/tax-returns', protect, authorize('superadmin', 'admin', 'backOffice'), getExpenseTaxReturns);

module.exports = router;