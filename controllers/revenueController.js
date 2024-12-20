const Revenue = require('../models/Revenue');
const Tax = require('../models/Tax');
const Client = require('../models/Client');
const WHT = require('../models/WHT'); // Import the WHT model
const { generatePDF, pdfGenerate} = require('../utils/pdfGenerator'); // Utility function to generate PDFs
const { check, validationResult } = require('express-validator');
const path = require('path');
const jsPDF = require('jspdf');
const fs = require("fs");
const mongoose = require('mongoose');
const { Schema } = mongoose;
const asyncHandler = require('express-async-handler');
const ejs = require("ejs");
const htmlPdf = require("html-pdf-node");
const User = require("../models/User");
const logAction = require("../utils/auditLogger");
const sendEmail = require("../utils/emailService");

const generateEmailContent = (role, invoiceData) => {
	let emailContent = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@200;400;600&display=swap" rel="stylesheet">
        <title>Invoice Created</title>
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
            <h1>Invoice Created</h1>
          </div>
          <div class="content">
            <p>Dear User,</p>
            <p>Invoice ${invoiceData.invoiceNo} has been successfully created. Below are the invoice details:</p>
            <ul>
              <li><strong>Invoice No:</strong> ${invoiceData.invoiceNo}</li>
              <li><strong>Reference Number:</strong> ${invoiceData.referenceNumber}</li>
              <li><strong>Client:</strong> ${invoiceData.name}</li>
              <li><strong>Amount Due:</strong> ${invoiceData.amountDue}</li>
              <li><strong>Amount Paid:</strong> ${invoiceData.amountPaid}</li>
              <li><strong>Amount Currency:</strong> ${invoiceData.currency}</li>
              <li><strong>Due Date:</strong> ${invoiceData.transactionDueDate}</li>
            </ul>
            <h3>Tax Details:</h3>
		      <ul>
		        <li><strong>VAT Rate:</strong> ${invoiceData.vat}%</li>
		        <li><strong>Tax Amount:</strong> ${invoiceData.taxAmountDeducted}</li>
		        <li><strong>Net Amount:</strong> ${invoiceData.netAmount}</li>
		      </ul>
		
		      <h3>Client Details:</h3>
		      <ul>
		        <li><strong>Client Name:</strong> ${invoiceData.name}</li>
		        <li><strong>Client Email:</strong> ${invoiceData.email}</li>
		      </ul>
            <p>Please click the button below to update the status of the invoice in the app:</p>
            <a href="${invoiceData.statusUpdateLink}" style="padding: 10px 20px; background-color: #964FFE; color: #fff; text-decoration: none;"><span>Update Invoice</span></a>
            <p>To download the invoice as a PDF, click the button below:</p>
            <a href="http://localhost:3009/download-invoice/${invoiceData.invoiceNo}" class="button">Download PDF</a>
            <p>If you encounter any issues, please contact our support team.</p>
            <p>Best Regards,<br>GSJX LTD Team</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 GSJX LTD. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;

	// Modify content for client-specific emails
	if (role === 'client') {
		emailContent = emailContent.replace('<p>Please click the button below to update the status of the invoice in the app:</p>', '');
		emailContent = emailContent.replace('<span>Update Invoice</span>', '')
	}

	return emailContent;
};
const generateUpdateEmailContent = (role, invoiceData) => {
	let emailContent = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@200;400;600&display=swap" rel="stylesheet">
        <title>Invoice Created</title>
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
            <h1>Invoice Updated</h1>
          </div>
          <div class="content">
            <p>Dear User,</p>
            <p>Invoice ${invoiceData.invoiceNo} has been successfully updated. Below are the invoice details:</p>
            <ul>
              <li><strong>Invoice No:</strong> ${invoiceData.invoiceNo}</li>
              <li><strong>Reference Number:</strong> ${invoiceData.referenceNumber}</li>
              <li><strong>Client:</strong> ${invoiceData.name}</li>
              <li><strong>Amount Due:</strong> ${invoiceData.amountDue}</li>
              <li><strong>Amount Paid:</strong> ${invoiceData.amountPaid}</li>
              <li><strong>Amount Currency:</strong> ${invoiceData.currency}</li>
              <li><strong>Due Date:</strong> ${invoiceData.transactionDueDate}</li>
            </ul>
            <h3>Tax Details:</h3>
		      <ul>
		        <li><strong>VAT Rate:</strong> ${invoiceData.vat}%</li>
		        <li><strong>Tax Amount:</strong> ${invoiceData.taxAmountDeducted}</li>
		        <li><strong>Net Amount:</strong> ${invoiceData.netAmount}</li>
		      </ul>
		
		      <h3>Client Details:</h3>
		      <ul>
		        <li><strong>Client Name:</strong> ${invoiceData.name}</li>
		        <li><strong>Client Email:</strong> ${invoiceData.email}</li>
		      </ul>
            <p>Please click the button below to update the status of the invoice in the app:</p>
            <a href="${invoiceData.statusUpdateLink}" style="padding: 10px 20px; background-color: #964FFE; color: #fff; text-decoration: none;"><span>Update Invoice</span></a>
            <p>To download the invoice as a PDF, click the button below:</p>
            <a href="http://localhost:3009/download-invoice/${invoiceData.invoiceNo}" class="button">Download PDF</a>
            <p>If you encounter any issues, please contact our support team.</p>
            <p>Best Regards,<br>GSJX LTD Team</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 GSJX LTD. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;

	// Modify content for client-specific emails
	if (role === 'client') {
		emailContent = emailContent.replace('<p>Please click the button below to update the status of the invoice in the app:</p>', '');
		emailContent = emailContent.replace('<span>Update Invoice</span>', '')
	}

	return emailContent;
};

const generateCompleteEmailContent = (role, invoiceData) => {
	let emailContent = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@200;400;600&display=swap" rel="stylesheet">
        <title>Acknowledgment Email</title>
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
            <h1>Payment Acknowledgment</h1>
          </div>
          <div class="content">
            <p>Dear ${role === 'client' ? invoiceData.name : 'User'},</p>
            <p>We are pleased to inform you that payment for invoice <strong>${invoiceData.invoiceNo}</strong> has been successfully received. Below are the details:</p>
            <ul>
              <li><strong>Invoice No:</strong> ${invoiceData.invoiceNo}</li>
              <li><strong>Amount Paid:</strong> ${invoiceData.amountPaid}</li>
              <li><strong>Currency:</strong> ${invoiceData.currency}</li>
              <li><strong>Payment Date:</strong> ${new Date().toLocaleDateString()}</li>
            </ul>
            <p>Thank you for your prompt payment. ${role === 'client' ? 'We appreciate your continued business.' : ''}</p>
            ${role !== 'client' ? '<p>You can view the updated invoice details in the application.</p>' : ''}
            <p>Best Regards,<br>GSJX LTD Team</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 GSJX LTD. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;
	return emailContent;
};


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
	await check('transactionDate', 'Transaction Date is required').notEmpty().run(req);
	const user = await User.findById(req.user._id,); // Assuming you have a User model

	// Extract relevant fields from req.body
	const { invoiceType, service1, service2, roles, otherInvoiceServices, clientId, amountDue, transactionDate } = req.body;

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
	if (existingClient.status !== "active"){
		return res.status(404).json({
			responseCode: "22",
			responseMessage: "Client awaiting approval."
		});
	}

	// Automatically generate the invoice number and reference number
	const invoiceNo = generateRandomNumberWithPrefix('INV');
	const referenceNumber = generateRandomNumberWithPrefix('REF');

	// Set the transaction date to today's date

	// Calculate total fee including VAT
	const totalInvoiceFeePlusVat_usd = invoiceData.totalInvoiceFee_usd + (invoiceData.totalInvoiceFee_usd * invoiceData.vat / 100);
	const totalInvoiceFeePlusVat_ngn = invoiceData.totalInvoiceFee_ngn + (invoiceData.totalInvoiceFee_ngn * invoiceData.vat / 100);
	invoiceData.statusUpdateLink = "http://localhost:3000/revenue"
	invoiceData.invoiceNo = invoiceNo;
	invoiceData.referenceNumber = referenceNumber;
	invoiceData.transactionDate = transactionDate;
	invoiceData.totalInvoiceFeePlusVat_usd = totalInvoiceFeePlusVat_usd;
	invoiceData.totalInvoiceFeePlusVat_ngn = totalInvoiceFeePlusVat_ngn;
	invoiceData.rateDate = transactionDate;
	// invoiceData.companyId = req.user.companyId;
	invoiceData.createdBy = req.user._id;

	// Create invoice record
	const newInvoice = new Revenue(invoiceData);
	const savedInvoice = await newInvoice.save();

	const totalInvoices = await Revenue.aggregate([
		{ $match: { clientId: new mongoose.Types.ObjectId(clientId) } },
		{ $group: { _id: null, clientTotalInvoice: { $sum: "$amountDue" } } }
	]);

	// Update the client's total invoice amount
	existingClient.clientTotalInvoice = totalInvoices[0]?.clientTotalInvoice || 0;
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
		taxRate: savedInvoice.vat || 7.5,
		taxAmountDeducted: taxAmount,
		netAmount: netAmount,
		companyId: savedInvoice.companyId,
		createdBy: savedInvoice.createdBy
	});
	const templatePath = path.resolve(__dirname, "../templates/invoiceglobalsjx.pdf");


	await taxEntity.save();
	let clientIdd = savedInvoice.clientId
	const whtRate = invoiceData.wht || 10; // Assume a default WHT rate if not provided
	const whtAmount = savedInvoice.totalInvoiceFee_ngn * (whtRate / 100);

	const whtEntity = new WHT({
		whtId: generateRandomNumberWithPrefix('WHT'),
		invoiceNo: savedInvoice.invoiceNo,
		clientId: savedInvoice.clientId,
		totalTransactionAmount: savedInvoice.totalInvoiceFee_ngn,
		whtRate: whtRate,
		whtAmount: whtAmount,
		status: "unpaid",
		createdBy: savedInvoice.createdBy
	});

	await whtEntity.save();
	const existingTax = await Tax.findOne({clientId: clientIdd});
	const combinedObj = {  ...existingClient, taxAmountDeducted: taxAmount, netAmount: netAmount, ...invoiceData, name: existingClient.name, email: existingClient.email, firstname: user.name || user.firstname };
	console.log(combinedObj)
	const emailContentClient = generateEmailContent('client', combinedObj);
	await sendEmail(existingClient.email, 'Invoice Created', emailContentClient, "",[{filename: "AccountDetails.pdf", path: templatePath}]);
	await sendEmail(user.email, 'Invoice Created', emailContentClient, "",[{filename: "AccountDetails.pdf", path: templatePath}]);
	const backofficeEmails = await User.find({ role: { $in: ['admin', 'backoffice', "superadmin"] } });
	backofficeEmails.forEach(user => {
		const emailContentAdmin = generateEmailContent('admin', combinedObj);
		sendEmail(user.email, 'New Invoice Created', emailContentAdmin, "",[{filename: "AccountDetails.pdf", path: templatePath}]);
	});
	await existingClient.save();

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
	await logAction(req.user._id, user.name || user.firstname + " " + user.lastname, 'created_invoice', "Revenue Management", `Created invoice for client ${existingClient.name} by ${user.email}`, req.body.ip );
});

// @route   PUT /api/revenue/updateInvoice/:id
// @access  Private
// @route   PUT /api/revenue/updateInvoice/:id
// @access  Private
exports.updateInvoice = asyncHandler(async (req, res, next) => {
	try {
		const { id } = req.params;

		const templatePath = path.resolve(__dirname, "../templates/invoiceglobalsjx.pdf");
		const updatedInvoice = await Revenue.findByIdAndUpdate(id, req.body, {
			new: true,
			runValidators: true,
		});
		const existingClient = await Client.findById(updatedInvoice.clientId);
		const user = await User.findById(req.user._id);
		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({ success: false, responseCode: "22",
				responseMessage: 'Invalid invoice ID' });
		}


		if (!updatedInvoice) {
			return res.status(404).json({ success: false, responseCode: "22",
				responseMessage: 'Invoice not found' });
		}

		if (updatedInvoice.totalInvoiceFeePlusVat_ngn === updatedInvoice.amountPaid || updatedInvoice.status === "paid") {
			updatedInvoice.status = "paid";
			await updatedInvoice.save();

			// Find the associated tax record and update its status to "paid"
			const taxRecord = await Tax.findOne({ invoiceNo: updatedInvoice.invoiceNo });
			const whtRecord = await WHT.findOne({ invoiceNo: updatedInvoice.invoiceNo });

			if (taxRecord) {
				taxRecord.status = "paid";
				await taxRecord.save();
			}
			if (whtRecord){
				whtRecord.status = "paid";
				await whtRecord.save();
			}
			const emailContentClient = generateCompleteEmailContent('client', updatedInvoice);
			await sendEmail(existingClient.email, 'Payment - Acknowledgement', emailContentClient, "", [{ filename: "AccountDetails.pdf", path: templatePath }]);
			await sendEmail(user.email, 'Payment - Acknowledgement', emailContentClient, "", [{ filename: "AccountDetails.pdf", path: templatePath }]);

			const backofficeEmails = await User.find({ role: { $in: ['admin', 'backoffice', "superadmin"] } });
			backofficeEmails.forEach(user => {
				const emailContentAdmin = generateCompleteEmailContent('admin', updatedInvoice);
				sendEmail(user.email, 'Payment - Acknowledgement', emailContentAdmin, "", [{ filename: "AccountDetails.pdf", path: templatePath }]);
			});

			await logAction(req.user._id, user.name || user.firstname + " " + user.lastname, 'updated_invoice', "Revenue Management", `Updated invoice for client ${existingClient.name} by ${user.email}`, req.body.ip);

			return res.status(200).json({
				responseCode: "00",
				responseMessage: "Invoice updated successfully",
				responseData: updatedInvoice
			});
		}

		await recalculateClientTotals(updatedInvoice.clientId);


		// Send notifications
		const emailContentClient = generateUpdateEmailContent('client', updatedInvoice);
		await sendEmail(existingClient.email, 'Invoice Updated', emailContentClient, "", [{ filename: "AccountDetails.pdf", path: templatePath }]);
		await sendEmail(user.email, 'Invoice Updated', emailContentClient, "", [{ filename: "AccountDetails.pdf", path: templatePath }]);

		const backofficeEmails = await User.find({ role: { $in: ['admin', 'backoffice', "superadmin"] } });
		backofficeEmails.forEach(user => {
			const emailContentAdmin = generateUpdateEmailContent('admin', updatedInvoice);
			sendEmail(user.email, 'Invoice Updated', emailContentAdmin, "", [{ filename: "AccountDetails.pdf", path: templatePath }]);
		});

		await logAction(req.user._id, user.name || user.firstname + " " + user.lastname, 'updated_invoice', "Revenue Management", `Updated invoice for client ${existingClient.name} by ${user.email}`, req.body.ip);

		res.status(200).json({
			responseCode: "00",
			responseMessage: "Invoice updated successfully",
			responseData: updatedInvoice
		});
	} catch (error) {
		console.error(error); // Log the specific error
		res.status(500).json({ success: false, responseCode: "00",
			responseMessage: 'Internal server error' });
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
	let invoices;
	if (req.user.role === "admin" || req.user.role === "superadmin") {
		invoices = await Revenue.find({status: {$ne: 'deleted'}});

	}
	else {
		invoices = await Revenue.find({ status: { $ne: 'deleted' } });

	}
	if (invoices){
		res.status(200).json({ responseCode: "00", responseMessage: "Invoices spooled successfully", responseData: invoices});
	}
	else {
		res.status(200).json({ responseCode: "22", responseMessage: "No invooices found."});
	}
});

exports.getInvoiceData = async (invoiceNo) => {
	try {
		// Fetch the invoice data from the database
		const invoiceData = await Revenue.findOne({ invoiceNo });

		// Check if the invoice exists
		if (!invoiceData) {
			throw new Error('Invoice not found');
		}

		// Return the fetched invoice data
		return invoiceData;
	} catch (error) {
		console.error('Error fetching invoice data:', error.message);
		throw error; // Rethrow the error to be handled by the calling function
	}
}

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