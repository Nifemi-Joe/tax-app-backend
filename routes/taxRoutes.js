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

// @route   GET /api/taxes
// @desc    Get all taxes
// @access  Private
router.get('/', getAllTaxes);

// @route   GET /api/taxes/:id
// @desc    Get tax by ID
// @access  Private
router.get('/:id', getTaxById);

// @route   POST /api/taxes
// @desc    Create a new tax record
// @access  Private
router.post('/', createTax);

// @route   PUT /api/taxes/:id
// @desc    Update a tax record
// @access  Private
router.put('/:id', updateTax);

// @route   DELETE /api/taxes/:id
// @desc    Delete a tax record
// @access  Private
router.delete('/:id', deleteTax);

// @route   POST /api/taxes/calculate
// @desc    Calculate and apply taxes to invoices
// @access  Private
router.post('/calculate', calculateAndApplyTaxes);

router.post('/pay/:id', payTax);
router.get('/summary', generateTaxSummary);

// @route   GET /api/taxes/report
// @desc    Generate tax report for a specific period
// @access  Private
router.get('/report', generateTaxReport);

module.exports = router;
