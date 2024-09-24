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

// Utility function to generate a random number with a specific prefix
const generateRandomNumberWithPrefix = (prefix) => {
	return `${prefix}${Math.floor(10000 + Math.random() * 90000)}`;
};
const recalculateClientTotals = async (clientId) => {
	const result = await Revenue.aggregate([
		{ $match: { clientId: mongoose.Types.ObjectId(clientId) } },
		{
			$group: {
				_id: null,
				totalAmountDue: { $sum: "$amountDue" },
				totalInvoicesNGN: { $sum: "$totalInvoiceFee_ngn" }
			}
		}
	]);

	const totals = result[0] || { totalAmountDue: 0, totalInvoicesNGN: 0 };

	await Client.findByIdAndUpdate(clientId, {
		clientAmountDue: totals.totalAmountDue,
		clientTotalInvoice: totals.totalInvoicesNGN
	});
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

	// Create invoice record
	const newInvoice = new Revenue(invoiceData);
	const savedInvoice = await newInvoice.save();

	const totalInvoices = await Revenue.aggregate([
		{ $match: { clientId: new mongoose.Types.ObjectId(clientId) } },
		{ $group: { _id: null, clientTotalInvoice: { $sum: "$amountDue" } } }
	]);

	const totalAmountDue = totalInvoices[0]?.clientTotalInvoice || 0;

	// Update the client's total invoice amount
	existingClient.clientTotalInvoice = totalAmountDue;
	await existingClient.save();
	await recalculateClientTotals(invoiceData.clientId);
	// Handle tax and other logic
	const taxRate = determineTaxRate(savedInvoice);
	const taxAmount = savedInvoice.totalInvoiceFee_ngn * (savedInvoice.vat / 100);
	const netAmount = savedInvoice.totalInvoiceFee_ngn - taxAmount;
	const taxEntity = new Tax({
		taxId: generateRandomNumberWithPrefix('TAX'),
		invoiceNo: savedInvoice.invoiceNo,
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
});

// @route   PUT /api/revenue/updateInvoice/:id
// @access  Private
exports.updateInvoice = asyncHandler(async (req, res) => {
	const { id } = req.params;

	const updatedInvoice = await Revenue.findByIdAndUpdate(id, req.body, {
		new: true,
		runValidators: true,
	});
	await recalculateClientTotals(updatedInvoice.clientId);

	if (!updatedInvoice) {
		return res.status(404).json({ success: false, error: 'Invoice not found' });
	}

	res.status(200).json({
		responseCode: "00",
		responseMessage: "Invoice updated successfully",
		responseData: updatedInvoice
	});
});


// @desc    Print an invoice as a PDF
// @route   GET /api/revenue/printInvoice/:id
// @access  Private
exports.printInvoice = asyncHandler(async (req, res) => {
	const { id } = req.params;

	const invoice = await Revenue.findById(id);
	await recalculateClientTotals(invoice.clientId);

	if (!invoice) {
		return res.status(404).json({ success: false, error: 'Invoice not found' });
	}

	// const invoiceHTML = path.resolve(__dirname, `../templates/${invoice.invoiceType.toLowerCase()}_invoice.html`);
	// const invoicePDF = await generatePDF(invoiceHTML, invoice);
	//
	// res.contentType("application/pdf");
	// res.send(invoicePDF);

	res.status(200).json({
		responseCode: "00",
		responseMessage: "Completed successfully",
		responseData: invoice
	});
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

	const invoices = await Revenue.find({ status: { $ne: 'deleted' } });
	res.status(200).json({ responseCode: "00", responseMessage: "Invoices spooled successfully", responseData: invoices});
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

exports.softDelete = asyncHandler( async (req,  res) => {
	const client = await Revenue.findByIdAndUpdate(req.body.id, { status: 'deleted' });
	await recalculateClientTotals(client.clientId);

	res.status(200).json({
		responseCode: "00",
		responseMessage: "Client deleted successfully"
	})
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