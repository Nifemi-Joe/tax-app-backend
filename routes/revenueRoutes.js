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
const {validateObjectId} = require('../middlewares/errorMiddleware');
const {protect, authorize, authorizePermissions} = require("../middlewares/authMiddleware");

// @desc    Create a new invoice
// @route   POST /api/revenue/createInvoice
// @access  Private
router.post('/', protect,authorize('superadmin', 'admin', 'frontOffice'), authorizePermissions('create-invoice'), createInvoice);

// @desc    Update an existing invoice
// @route   PUT /api/revenue/updateInvoice/:id
// @access  Private
router.put('/updateInvoice/:id', protect,authorize('superadmin', 'admin', 'backOffice'), authorizePermissions('update-invoice'), validateObjectId('id'), updateInvoice);

// @desc    Print an invoice as a PDF
// @route   GET /api/revenue/printInvoice/:id
// @access  Private
router.get('/printInvoice/:id', protect, validateObjectId('id'), printInvoice);
router.get('/downloadInvoice/:id', protect,validateObjectId('id'), downloadInvoice);

// @desc    Spool invoices based on filters
// @route   GET /api/revenue/spoolInvoices
// @access  Private
router.get('/spoolInvoices', protect,spoolInvoices);

// @desc    Track payment status of an invoice
// @route   GET /api/revenue/trackInvoice/:id
// @access  Private
router.get('/trackInvoice/:id',  protect,validateObjectId('id'), trackInvoice);

// @desc    Send a payment reminder for unpaid invoices
// @route   POST /api/revenue/sendReminder/:id
// @access  Private
router.post('/sendReminder/:id', protect, validateObjectId('id'), sendReminder);

// @desc    Generate and send payment receipt for a paid invoice
// @route   POST /api/revenue/generateReceipt/:id
// @access  Private
router.post('/generateReceipt/:id', protect ,validateObjectId('id'), generateReceipt);
router.post('/delete/:id', protect,authorize('superadmin', 'admin'), authorizePermissions('delete-invoice'), validateObjectId('id'), softDelete);

module.exports = router;
