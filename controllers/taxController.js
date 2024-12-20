const Tax = require('../models/Tax');
const { generateTaxReportPDF } = require('../utils/pdfGenerator');
const asyncHandler = require('express-async-handler');
const { check, validationResult } = require('express-validator');
const path = require('path');
const Employee = require("../models/Employee");
const WHT = require('../models/WHT'); // Import the WHT model
const Client = require("../models/Client");
const User = require("../models/User");
const logAction = require("../utils/auditLogger");
const sendEmail = require("../utils/emailService");

const generateEmailContent = (taxes, totalAmount, role) => {
	let taxDetails = taxes
		.map(
			(tax) => `
        <ul>
          <li><strong>Tax ID:</strong> ${tax.taxId}</li>
          <li><strong>Invoice No:</strong> ${tax.invoiceNo}</li>
          <li><strong>Tax Type:</strong> ${tax.taxType}</li>
          <li><strong>Tax Amount:</strong> ${tax.taxAmountDeducted}</li>
          <li><strong>Net Amount:</strong> ${tax.netAmount}</li>
        </ul>
      `
		)
		.join('');

	return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@200;400;600&display=swap" rel="stylesheet">
        <style>
          body { font-family: "Outfit", sans-serif; background-color: #f9f9f9; color: #333; margin: 0; padding: 0; }
          .email-container { max-width: 600px; margin: 20px auto; background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1); }
          .header { text-align: center; background-color: #964FFE; color: #fff; padding: 10px 0; border-radius: 8px 8px 0 0; }
          .content { padding: 20px; line-height: 1.6; }
          .footer { text-align: center; font-size: 12px; color: #888; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="email-container">
          <div class="header">
            <h1>Tax Payment Confirmation</h1>
          </div>
          <div class="content">
            <p>Dear ${role === 'admin' ? 'Admin' : 'User'},</p>
            <p>The following taxes have been successfully paid:</p>
            ${taxDetails}
            <p><strong>Total Amount Paid:</strong> ${totalAmount}</p>
            <p>Thank you for your prompt payment. If you have any questions, please contact our support team.</p>
            <p>Best Regards,<br>GSJX LTD Team</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 GSJX LTD. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;
};

// @desc    Get all taxes
// @route   GET /api/taxes
// @access  Private
exports.getAllTaxes = asyncHandler(async (req, res) => {
	try {
		const taxes = await Tax.find({});
		if (taxes){
			res.status(200).json({ responseCode: "00", responseMessage: "Completed successfully", responseData: taxes });
		}
		else{
			res.status(200).json({ responseCode: "22", responseMessage: 'No taxs found.' });
		}
	} catch (error) {
		res.status(200).json({ responseCode: "22", responseMessage: 'No taxees found.' });
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
		const newTax = await Tax.create({ taxName, rate, createdBy: req.user._id, companyId: req.user.companyId });

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

exports.getWHTDetails = asyncHandler(async (req, res) => {
	const { clientId } = req.query; // Optional filter by clientId

	const whtDetails = await WHT.find(clientId ? { clientId } : {})
		.populate('clientId', 'name email')
		.sort({ createdAt: -1 });

	res.status(200).json({
		responseCode: "00",
		responseMessage: "WHT details fetched successfully",
		responseData: whtDetails
	});
});

exports.getWHT = asyncHandler(async (req, res) => {

	const whtDetails = await WHT.find()
		.sort({ createdAt: -1 });

	res.status(200).json({
		responseCode: "00",
		responseMessage: "WHT details fetched successfully",
		responseData: whtDetails
	});
});

// Pay Tax
exports.payTax = asyncHandler(async (req, res) => {
	const { taxIds, userId } = req.body;
	const user = await User.findById(req.user._id); // Get the user who created the client


	const taxes = await Tax.find({ taxId: { $in: taxIds } });
	if (!taxes.length) {
		return res.status(404).json({ responseMessage: 'No valid taxes found for the provided IDs.', responseCode: "22"});
	}
	const alreadyPaidTaxes = taxes.filter(tax => tax.status === 'paid');
	if (alreadyPaidTaxes.length > 0) {
		const paidTaxIds = alreadyPaidTaxes.map(tax => tax.taxId);
		return res.status(400).json({
			responseMessage: 'Some taxes have already been paid.',
			responseCode: "22",
			alreadyPaidTaxIds: paidTaxIds,
		});
	}

	const totalAmount = taxes.reduce((sum, tax) => sum + tax.totalAmount, 0);

	await Tax.updateMany(
		{ taxId: { $in: taxIds } },
		{ status: 'paid' },
		{ multi: true }
	);

	const emailContentForUser = generateEmailContent(taxes, totalAmount, 'user');
	const emailContentForAdmin = generateEmailContent(taxes, totalAmount, 'admin');

	// Send emails
	await sendEmail(user.email, 'Tax Payment Confirmation', emailContentForUser);
	const admins = await User.find({ role: { $in: ['superadmin', 'admin'] } }); // Get all admins
	const adminEmails = admins.map(admin => admin.email);

	adminEmails.forEach(email => sendEmail(email, 'Tax Payment Notification', emailContentForAdmin));

	res.status(200).json({ responseMessage: 'Taxes paid successfully!', responseData: totalAmount, responseCode: "00" });
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

