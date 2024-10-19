const express = require('express');
const router = express.Router();
const {
	getAllTaxes,
	getTaxById,
	createTax,
	updateTax,
	deleteTax,
	payTax,
	generateTaxSummary,
	calculateAndApplyTaxes,
	generateTaxReport
} = require('../controllers/taxController');
const {validateObjectId} = require('../middlewares/errorMiddleware');
const {protect, authorize, authorizePermissions} = require("../middlewares/authMiddleware");

// @route   GET /api/taxes
// @desc    Get all taxes
// @access  Private
router.get('/',protect, getAllTaxes);

// @route   GET /api/taxes/:id
// @desc    Get tax by ID
// @access  Private
router.get('read-by-id/:id', protect,validateObjectId('id'),getTaxById);

// @route   POST /api/taxes
// @desc    Create a new tax record
// @access  Private
router.post('/', protect,createTax);

// @route   PUT /api/taxes/:id
// @desc    Update a tax record
// @access  Private
router.put('/update/:id', protect,authorize('superadmin', 'admin', 'backOffice'), authorizePermissions('update-tax'),  validateObjectId('id'), updateTax);

// @route   DELETE /api/taxes/:id
// @desc    Delete a tax record
// @access  Private
router.delete('/delete/:id', protect,authorize('superadmin', 'admin', 'backOffice'), authorizePermissions('delete-tax'),  validateObjectId('id'),deleteTax);

// @route   POST /api/taxes/calculate
// @desc    Calculate and apply taxes to invoices
// @access  Private
router.post('/calculate', protect,calculateAndApplyTaxes);

router.post('/pay/:id', protect,authorize('superadmin', 'admin', 'backOffice'), authorizePermissions('pay-tax'), validateObjectId('id'), payTax);
router.get('/summary', protect,generateTaxSummary);

// @route   GET /api/taxes/report
// @desc    Generate tax report for a specific period
// @access  Private
router.get('/report', protect,generateTaxReport);

module.exports = router;
