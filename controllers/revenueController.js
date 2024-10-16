const Revenue = require('../models/Revenue');
const Tax = require('../models/Tax');
const Client = require('../models/Client');
const { generatePDF, pdfGenerate} = require('../utils/pdfGenerator'); // Utility function to generate PDFs
const { check, validationResult } = require('express-validator');
const path = require('path');
const jsPDF = require('jspdf');
const mongoose = require('mongoose');
const { Schema } = mongoose;
const asyncHandler = require('express-async-handler');
const ejs = require("ejs");
const htmlPdf = require("html-pdf-node");
const User = require("../models/User");
const logAction = require("../utils/auditLogger");

// Utility function to generate a random number with a specific prefix
const generateRandomNumberWithPrefix = (prefix) => {
	return `${prefix}${Math.floor(10000 + Math.random() * 90000)}`;
};
const recalculateClientTotals = async (clientId) => {
	try {
		// Validate the clientId
		if (!mongoose.Types.ObjectId.isValid(clientId)) {
			throw new Error('Invalid client ID');
		}

		const objectId = new mongoose.Types.ObjectId(clientId);

		// Fetch all active (non-deleted) invoices for the client
		const invoices = await Revenue.find({ clientId: objectId, status: { $ne: 'deleted' } });

		// Calculate totals
		let totalPaid = 0;
		let totalDue = 0;
		let totalAmount = 0;

		invoices.forEach(invoice => {
			totalPaid += invoice.amountPaid;
			totalDue += invoice.amountDue;
			totalAmount += invoice.totalInvoiceFeePlusVat_ngn;
		});

		// Update client totals
		await Client.findByIdAndUpdate(clientId, {
			clientAmountPaid: totalPaid,
			clientAmountDue: totalAmount - totalPaid,
			clientTotalInvoice: totalAmount,
			updatedAt: Date.now(),
		});

		console.log(`Recalculated totals for client ID: ${clientId}`);
	} catch (error) {
		console.error(`Error in recalculateClientTotals: ${error.message}`);
		throw error; // Rethrow to be handled by the caller
	}
};

function determineTaxRate(invoice) {
	// Logic to determine the applicable tax rate
	// This might be based on the type of service/product in the invoice
	return 7.5; // Example VAT rate
}

// @desc    Create a new invoice
// @route   POST /api/revenue/createInvoice
// @access  Private
exports.createInvoice = asyncHandler(async (req, res) => {
	// Validate incoming request
	await check('userId', 'User ID is required').notEmpty().run(req);
	await check('clientId', 'Client ID is required').notEmpty().run(req);
	await check('amountDue', 'Amount Due is required and must be a valid number').isFloat().run(req);
	await check('transactionDueDate', 'Transaction Due Date is required').notEmpty().run(req);

	// Extract relevant fields from req.body
	const { invoiceType, service1, service2, roles, otherInvoiceServices, clientId, amountDue } = req.body;

	if (invoiceType === 'ACS_RBA' && (!service1 || !service2)) {
		return res.status(400).json({ error: 'Service1 and Service2 are required for ACS_RBA invoices' });
	} else if (invoiceType === 'OUTSOURCING' && !roles) {
		return res.status(400).json({ error: 'Roles are required for OUTSOURCING invoices' });
	} else if (invoiceType === 'OTHER_INVOICES' && !otherInvoiceServices) {
		return res.status(400).json({ error: 'Service details are required for OTHER_INVOICES' });
	}

	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return res.status(400).json({ errors: errors.array() });
	}

	let invoiceData = req.body;

	// Validate client existence
	const existingClient = await Client.findById(clientId);
	if (!existingClient) {
		return res.status(404).json({
			responseCode: "24",
			responseMessage: "Client not found"
		});
	}

	// Automatically generate the invoice number and reference number
	const invoiceNo = generateRandomNumberWithPrefix('INV');
	const referenceNumber = generateRandomNumberWithPrefix('REF');

	// Set the transaction date to today's date
	const transactionDate = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD

	// Calculate total fee including VAT
	const totalInvoiceFeePlusVat_usd = invoiceData.totalInvoiceFee_usd + (invoiceData.totalInvoiceFee_usd * invoiceData.vat / 100);
	const totalInvoiceFeePlusVat_ngn = invoiceData.totalInvoiceFee_ngn + (invoiceData.totalInvoiceFee_ngn * invoiceData.vat / 100);

	invoiceData.invoiceNo = invoiceNo;
	invoiceData.referenceNumber = referenceNumber;
	invoiceData.transactionDate = transactionDate;
	invoiceData.totalInvoiceFeePlusVat_usd = totalInvoiceFeePlusVat_usd;
	invoiceData.totalInvoiceFeePlusVat_ngn = totalInvoiceFeePlusVat_ngn;
	invoiceData.rateDate = transactionDate;
	invoiceData.companyId = req.user.companyId;
	invoiceData.createdBy = req.user._id

	// Create invoice record
	const newInvoice = new Revenue(invoiceData);
	const savedInvoice = await newInvoice.save();

	const totalInvoices = await Revenue.aggregate([
		{ $match: { clientId: new mongoose.Types.ObjectId(clientId) } },
		{ $group: { _id: null, clientTotalInvoice: { $sum: "$amountDue" } } }
	]);

	// Update the client's total invoice amount
	existingClient.clientTotalInvoice = totalInvoices[0]?.clientTotalInvoice || 0;
	await existingClient.save();
	await recalculateClientTotals(invoiceData.clientId);
	// Handle tax and other logic
	const taxRate = determineTaxRate(savedInvoice);
	const taxAmount = savedInvoice.totalInvoiceFee_ngn * (savedInvoice.vat / 100);
	const netAmount = savedInvoice.totalInvoiceFee_ngn - taxAmount;
	const taxEntity = new Tax({
		taxId: generateRandomNumberWithPrefix('TAX'),
		invoiceNo: savedInvoice.invoiceNo,
		clientId: savedInvoice.clientId,
		taxType: "VAT", // Example tax type
		totalAmount: savedInvoice.totalInvoiceFee_ngn,
		taxRate: savedInvoice.vat,
		taxAmountDeducted: taxAmount,
		netAmount: netAmount
	});
	await taxEntity.save();
	console.log(taxEntity);
	// // Render the invoice template
	// const invoiceHTML = path.resolve(__dirname, `../templates/${invoiceType.toLowerCase()}_invoice.html`);
	// const pdfBuffer = await generatePDF(invoiceHTML, savedInvoice);

	// res.setHeader('Content-Disposition', `attachment; filename=invoice_${savedInvoice.invoiceNo}.pdf`);
	// res.setHeader('Content-Type', 'application/pdf');
	res.status(201).json({
		responseCode: "00",
		responseMessage: "Invoice created successfully",
		responseData: savedInvoice
	});
	const user = await User.findById(req.user._id,); // Assuming you have a User model
	await logAction(req.user._id, user.name || user.firstname + " " + user.lastname, 'created_invoice', "Revenue Management", `Created invoice for client ${existingClient.name} by ${user.email}`, req.body.ip );
});

// @route   PUT /api/revenue/updateInvoice/:id
// @access  Private
exports.updateInvoice = asyncHandler(async (req, res, next) => {
	try {
		const { id } = req.params;

		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({ success: false, error: 'Invalid invoice ID' });
		}

		const updatedInvoice = await Revenue.findByIdAndUpdate(id, req.body, {
			new: true,
			runValidators: true,
		});

		if (!updatedInvoice) {
			return res.status(404).json({ success: false, error: 'Invoice not found' });
		}
		console.log('Client ID:', updatedInvoice.clientId);

		await recalculateClientTotals(updatedInvoice.clientId);

		res.status(200).json({
			responseCode: "00",
			responseMessage: "Invoice updated successfully",
			responseData: updatedInvoice
		});
		const existingClient = await Client.findById(updatedInvoice.clientId);
		const user = await User.findById(req.user._id,); // Assuming you have a User model
		await logAction(req.user._id, user.name || user.firstname + " " + user.lastname, 'updated_invoice', "Revenue Management", `Updated invoice for client ${existingClient.name} by ${user.email}`, req.body.ip );
	} catch (error) {
		console.error(error); // Log the specific error
		res.status(500).json({ success: false, error: 'Internal server error' });
	}
});


// @desc    Print an invoice as a PDF
// @route   GET /api/revenue/printInvoice/:id
// @access  Private
exports.printInvoice = asyncHandler(async (req, res) => {
	try {
		const { id } = req.params;
		const invoice = await Revenue.findById(id);

		if (!invoice) {
			return res.status(404).json({ success: false, error: 'Invoice not found' });
		}

		res.status(200).json({
			responseCode: "00",
			responseMessage: "Completed successfully",
			responseData: invoice,
		});
	} catch (error) {
		console.error('Error in printInvoice:', error.message);
		res.status(500).json({ success: false, error: 'Internal Server Error' });
	}
});

exports.downloadInvoice = asyncHandler(async (req, res) => {
	const { id } = req.params;

	// Fetch the invoice from the database
	const invoice = await Revenue.findById(id);
	if (!invoice) {
		return res.status(404).json({ success: false, error: 'Invoice not found' });
	}

	// Set the path to the invoice HTML template (EJS file)
	const templatePath = path.join(__dirname, '../templates/acs_rba_invoice.ejs');
	const htmlContent = await ejs.renderFile(templatePath, {invoice});

	// Options for generating PDF
	const options = { format: 'A4' };
	// Render the invoice data into the template
	const pdfBuffer = await htmlPdf.generatePdf({ content: htmlContent }, options);

	// Set the headers for downloading the file
	res.setHeader('Content-Disposition', `attachment; filename=invoice_${invoice.invoiceNo}.pdf`);
	res.setHeader('Content-Type', 'application/pdf');

	// Send the PDF as the response
	res.send(pdfBuffer);
});

// @desc    Spool invoices based on filters (client-wise, monthly, quarterly, yearly)
// @route   GET /api/revenue/spoolInvoices
// @access  Private
exports.spoolInvoices = asyncHandler(async (req, res) => {
	const { client, startDate, endDate } = req.query;

	const query = {};

	if (client) query.client = client;
	if (startDate && endDate) {
		query.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
	}

	const invoices = await Revenue.find({ status: { $ne: 'deleted' }, companyId: req.user.companyId });
	if (invoices){
		res.status(200).json({ responseCode: "00", responseMessage: "Invoices spooled successfully", responseData: invoices});
	}
	else {
		res.status(200).json({ responseCode: "22", responseMessage: "No invooices found."});
	}
});

// @desc    Track payment status of an invoice
// @route   GET /api/revenue/trackInvoice/:id
// @access  Private
exports.trackInvoice = asyncHandler(async (req, res) => {
	const { id } = req.params;

	const invoice = await Revenue.findById(id);

	if (!invoice) {
		return res.status(404).json({ success: false, error: 'Invoice not found' });
	}

	res.status(200).json({ success: true, message: 'Invoice status retrieved successfully', status: invoice.status });
});

// @desc    Send a payment reminder for unpaid invoices (Functionality Removed)
// @route   POST /api/revenue/sendReminder/:id
// @access  Private
exports.sendReminder = asyncHandler(async (req, res) => {
	res.status(200).json({ success: true, message: 'Payment reminder functionality is currently disabled' });
});

// @desc    Generate and send payment receipt for a paid invoice (Functionality Removed)
// @route   POST /api/revenue/generateReceipt/:id
// @access  Private
exports.generateReceipt = asyncHandler(async (req, res) => {
	res.status(200).json({ success: true, message: 'Receipt generation functionality is currently disabled' });
});

exports.softDelete = asyncHandler(async (req, res) => {
	// Soft delete the revenue by updating its status
	const revenue = await Revenue.findByIdAndUpdate(req.body.id, { status: 'deleted' });

	if (!revenue) {
		return res.status(404).json({
			responseCode: "01",
			responseMessage: "Revenue not found"
		});
	}

	// Recalculate client totals
	await recalculateClientTotals(revenue.clientId);

	// Find and delete taxes associated with this revenue's invoiceNo
	await Tax.deleteMany({ invoiceNo: revenue.invoiceNo });

	res.status(200).json({
		responseCode: "00",
		responseMessage: "Revenue and associated taxes deleted successfully"
	});
	const existingClient = await Client.findById(revenue.clientId);
	const user = await User.findById(req.user._id,); // Assuming you have a User model
	await logAction(req.user._id, user.name || user.firstname + " " + user.lastname, 'deleted_invoice', "Revenue Management", `Deleted invoice for client ${existingClient.name} by ${user.email}`, req.body.ip );
});



exports.deleteInvoice = async (req, res) => {
	try {
		const deletedInvoice = await Revenue.findByIdAndDelete(req.params.id);
		await recalculateClientTotals(deletedInvoice.clientId);

		if (!deletedInvoice) return res.status(404).json({ message: 'Invoice not found' });
		res.status(200).json({ message: 'Invoice deleted successfully' });
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
};