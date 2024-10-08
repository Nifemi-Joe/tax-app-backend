const Tax = require('../models/Tax');
const { generateTaxReportPDF } = require('../utils/pdfGenerator');
const asyncHandler = require('express-async-handler');
const { check, validationResult } = require('express-validator');
const path = require('path');
const Employee = require("../models/Employee");
const Client = require("../models/Client");
const User = require("../models/User");
const logAction = require("../utils/auditLogger");

// @desc    Get all taxes
// @route   GET /api/taxes
// @access  Private
exports.getAllTaxes = asyncHandler(async (req, res) => {
	try {
		const taxes = await Tax.find();
		res.status(200).json({ responseCode: "00", responseMessage: "Completed successfully", responseData: taxes });
	} catch (error) {
		res.status(500).json({ responseCode: "22", responseMessage: 'Server Error' });
	}
});

// @desc    Get tax by ID
// @route   GET /api/taxes/:id
// @access  Private
exports.getTaxById = asyncHandler(async (req, res) => {
	try {
		const tax = await Tax.findById(req.params.id);
		if (!tax) return res.status(404).json({ success: false, error: 'Tax not found' });
		res.status(200).json({ success: true, data: tax });
	} catch (error) {
		res.status(500).json({ success: false, error: 'Server Error' });
	}
});

// @desc    Create a new tax record
// @route   POST /api/taxes
// @access  Private
exports.createTax = asyncHandler(async (req, res) => {
	await check('taxName', 'Tax name is required').notEmpty().run(req);
	await check('rate', 'Tax rate is required').isNumeric().run(req);

	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return res.status(400).json({ errors: errors.array() });
	}

	try {
		const { taxName, rate } = req.body;

		// Create tax record
		const newTax = await Tax.create({ taxName, rate });

		res.status(201).json({ success: true, data: newTax });
	} catch (error) {
		res.status(500).json({ success: false, error: 'Server Error' });
	}
});

// @desc    Update a tax record
// @route   PUT /api/taxes/:id
// @access  Private
exports.updateTax = asyncHandler(async (req, res) => {
	await check('taxName', 'Tax name is required').optional().notEmpty().run(req);
	await check('rate', 'Tax rate is required').optional().isNumeric().run(req);

	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return res.status(400).json({ errors: errors.array() });
	}

	try {
		const updatedTax = await Tax.findByIdAndUpdate(req.params.id, req.body, { new: true });
		if (!updatedTax) return res.status(404).json({ success: false, error: 'Tax not found' });
		res.status(200).json({ success: true, data: updatedTax });
	} catch (error) {
		res.status(500).json({ success: false, error: 'Server Error' });
	}
});

// @desc    Delete a tax record
// @route   DELETE /api/taxes/:id
// @access  Private
exports.deleteTax = asyncHandler(async (req, res) => {
	try {
		const deletedTax = await Tax.findByIdAndDelete(req.params.id);
		if (!deletedTax) return res.status(404).json({ success: false, error: 'Tax not found' });
		res.status(200).json({ success: true, data: {} });
		const user = await User.findById(req.user._id,); // Assuming you have a User model
		await logAction(req.user._id, user.name || user.firstname + " " + user.lastname, 'deleted_tax', "Tax Management", `Deleted tax by ${user.email}`, req.body.ip );
	} catch (error) {
		res.status(500).json({ success: false, error: 'Server Error' });
	}
});

// @desc    Calculate and apply taxes to invoices
// @route   POST /api/taxes/calculate
// @access  Private
exports.calculateAndApplyTaxes = asyncHandler(async (req, res) => {
	try {
		const taxes = await Tax.find();
		const invoices = await Invoice.find();

		invoices.forEach(invoice => {
			let totalTax = 0;
			taxes.forEach(tax => {
				const taxAmount = (invoice.amount * tax.rate) / 100;
				totalTax += taxAmount;
			});

			invoice.tax = totalTax;
			invoice.totalAmount = invoice.amount + totalTax;
			invoice.save();
		});

		res.status(200).json({ success: true, message: 'Taxes calculated and applied successfully' });
	} catch (error) {
		res.status(500).json({ success: false, error: 'Failed to calculate or apply taxes' });
	}
});

// @desc    Generate tax report for a specific period
// @route   GET /api/taxes/report
// @access  Private
exports.generateTaxReport = asyncHandler(async (req, res) => {
	const { startDate, endDate } = req.query;

	try {
		const invoices = await Invoice.find({
			date: { $gte: new Date(startDate), $lte: new Date(endDate) }
		}).populate('tax');

		let totalTaxes = {};
		invoices.forEach(invoice => {
			invoice.tax.forEach(tax => {
				if (!totalTaxes[tax.taxName]) {
					totalTaxes[tax.taxName] = 0;
				}
				totalTaxes[tax.taxName] += (invoice.amount * tax.rate) / 100;
			});
		});

		const reportData = {
			startDate,
			endDate,
			totalTaxes,
			totalAmount: invoices.reduce((sum, invoice) => sum + invoice.amount, 0),
			totalTax: Object.values(totalTaxes).reduce((sum, tax) => sum + tax, 0)
		};

		const reportHTML = path.join(__dirname, '../templates/tax_report.html');
		const reportPDF = await generateTaxReportPDF(reportHTML, reportData);

		res.status(200).json({ success: true, message: 'Tax report generated successfully', data: reportPDF });
	} catch (error) {
		res.status(500).json({ success: false, error: 'Failed to generate tax report' });
	}
});

// Create Tax Entity on Invoice Creation
exports.createTaxEntity = async () => {
	const taxRate = determineTaxRate();
	const taxAmount = invoice.totalAmount * (taxRate / 100);
	const netAmount = invoice.totalAmount - taxAmount;

	const taxEntity = new Tax({
		taxId: generateUniqueTaxId(),
		invoiceNo: invoice.invoiceNo,
		taxType: invoice.taxType,
		totalAmount: invoice.totalAmount,
		taxRate: taxRate,
		taxAmountDeducted: taxAmount,
		netAmount: netAmount,
	});

	await taxEntity.save();
};

// Pay Tax
exports.payTax = asyncHandler(async (req, res) => {
	const tax = await Tax.findById(req.params.id);
	if (!tax) {
		res.status(404).json({ responseCode: "22", responseMessage: 'Tax entity not found' });
		return;
	}
	const updates = req.body;

	const updatedTax = await Tax.findByIdAndUpdate(req.params.id, updates, {
		new: true,
		runValidators: true,
	});
	// tax.status = 'paid';
	// await tax.save();
	res.status(200).json({
		responseCode: "00",
		responseMessagee: "Tax paid successfully!",
		responseData: updatedTax
	});
	// Update the total tax paid
	// await updateTaxTotals();
});

// Generate Summary
exports.generateTaxSummary = async () => {
	const taxes = await Tax.find();
	let totalTaxToBePaid = 0;
	let totalTaxPaid = 0;

	taxes.forEach(tax => {
		if (tax.status === 'unpaid') {
			totalTaxToBePaid += tax.taxAmountDeducted;
		} else if (tax.status === 'paid') {
			totalTaxPaid += tax.taxAmountDeducted;
		}
	});

	return {
		totalTaxToBePaid,
		totalTaxPaid,
		totalOutstanding: totalTaxToBePaid - totalTaxPaid,
	};
};

// Utility functions
function generateUniqueTaxId() {
	// Generate a unique tax ID
	return 'TAX-' + Date.now();
}

function determineTaxRate(invoice) {
	// Logic to determine the applicable tax rate
	// This might be based on the type of service/product in the invoice
	return 7.5; // Example VAT rate
}

async function updateTaxTotals() {
	// Recalculate total taxes to be paid and paid
	// This function can be called after each tax payment
}

