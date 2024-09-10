const express = require('express');
const router = express.Router();
const {
	createInvoice,
	updateInvoice,
	printInvoice,
	spoolInvoices,
	trackInvoice,
	sendReminder,
	downloadInvoice,
	generateReceipt,
	softDelete
} = require('../controllers/revenueController');

// @desc    Create a new invoice
// @route   POST /api/revenue/createInvoice
// @access  Private
router.post('/', createInvoice);

// @desc    Update an existing invoice
// @route   PUT /api/revenue/updateInvoice/:id
// @access  Private
router.put('/updateInvoice/:id', updateInvoice);

// @desc    Print an invoice as a PDF
// @route   GET /api/revenue/printInvoice/:id
// @access  Private
router.get('/printInvoice/:id', printInvoice);
router.get('/downloadInvoice/:id', downloadInvoice);

// @desc    Spool invoices based on filters
// @route   GET /api/revenue/spoolInvoices
// @access  Private
router.get('/spoolInvoices', spoolInvoices);

// @desc    Track payment status of an invoice
// @route   GET /api/revenue/trackInvoice/:id
// @access  Private
router.get('/trackInvoice/:id', trackInvoice);

// @desc    Send a payment reminder for unpaid invoices
// @route   POST /api/revenue/sendReminder/:id
// @access  Private
router.post('/sendReminder/:id', sendReminder);

// @desc    Generate and send payment receipt for a paid invoice
// @route   POST /api/revenue/generateReceipt/:id
// @access  Private
router.post('/generateReceipt/:id', generateReceipt);
router.post('/delete/:id', softDelete);

module.exports = router;
