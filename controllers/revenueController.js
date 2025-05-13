const Revenue = require('../models/Revenue');
const Tax = require('../models/Tax');
const Client = require('../models/Client');
const WHT = require('../models/WHT'); // Import the WHT model
const { generatePDF, pdfGenerate} = require('../utils/pdfGenerator'); // Utility function to generate PDFs
const { check, validationResult } = require('express-validator');
const path = require('path');
const jsPDF = require('jspdf');
const fs = require('fs');
const mongoose = require('mongoose');
const { Schema } = mongoose;
const asyncHandler = require('express-async-handler');
const ejs = require("ejs");
const User = require("../models/User");
const logAction = require("../utils/auditLogger");
const sendEmail = require("../utils/emailService");
const Account = require("../models/Account");
const formatCurrency = (amount, currency) => {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: currency,
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	}).format(amount);
};

const generateEmailContent = (role, invoiceData, client) => {
	let emailContent = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@200;400;600&display=swap" rel="stylesheet">
        <title>Invoice Created</title>
        <style>
          body { font-family: "Outfit" !important; sans-serif; background-color: #f9f9f9; color: #333; margin: 0; padding: 0; }
          .email-container { max-width: 600px; margin: 20px auto; background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1); }
          .header { text-align: center; background-color: #964FFE; color: #fff; padding: 10px 0; border-radius: 8px 8px 0 0; }
          .content { padding: 20px; line-height: 1.6; font-family: "Outfit" !important;}
          .cotent p, .content li {font-family: "Outfit" !important;}
          .footer { text-align: center; font-size: 12px; color: #888; margin-top: 20px; }
          li {
          color: black !important;
          }
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
              <li><strong>Client:</strong> ${client.name}</li>
              <li><strong>Amount:</strong> ${invoiceData.currency === 'NGN' ? formatCurrency(invoiceData.totalInvoiceFee_ngn , 'NGN') : formatCurrency(invoiceData.totalInvoiceFee_usd , 'USD')}</li>
              <li><strong>Amount Currency:</strong> ${invoiceData.currency}</li>
              <li><strong>Due Date:</strong> ${new Date(invoiceData.transactionDueDate).toLocaleDateString()}</li>
            </ul>
            <h3>Tax Details:</h3>
		      <ul>
		        <li><strong>VAT Rate:</strong> ${invoiceData.vat}%</li>
		     	<li><strong>Tax Amount:</strong> ${invoiceData.currency === 'NGN' ? formatCurrency((invoiceData.amountDue-invoiceData.totalInvoiceFee_ngn , 'NGN')) : formatCurrency((invoiceData.totalInvoiceFeePlusVat_usd-invoiceData.totalInvoiceFee_usd) , 'USD')}</li>
		        <li><strong>Net Amount Due:</strong> ${invoiceData.currency === 'NGN' ? formatCurrency(invoiceData.amountDue , 'NGN') : formatCurrency(invoiceData.totalInvoiceFeePlusVat_usd , 'USD')}</li>
		      </ul>
		
		      <h3>Client Details:</h3>
		      <ul>
		        <li><strong>Client Name:</strong> ${client.name}</li>
		        <li><strong>Client Email:</strong> ${client.email[0]}</li>
		      </ul>
            <p>Please click the button below to update the status of the invoice in the app:</p>
            <a href="${invoiceData.statusUpdateLink}" style="padding: 10px 20px; background-color: #964FFE; color: #fff; text-decoration: none;"><span>Update Invoice</span></a>
            <p>All enquiries on this invoice should be sent to - <a>All enquiries on this invoice should be sent to</a> with a copy to <a>ifeanyi.iroegbu@globalsjxltd.com</a></p>
            <p>Please find attached your invoice.</p>
            <p>If you encounter any issues, please contact our support team.</p>
            <p>Best Regards,<br>Global SJX Finance</p>
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
const generateUpdateEmailContent = (role, invoiceData, client) => {
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
          li {
          color: black !important;
          }
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
              <li><strong>Client:</strong> ${client.name}</li>
              <li><strong>Amount Due:</strong> ${invoiceData.currency === 'NGN' ? formatCurrency(invoiceData.amountDue , 'NGN') : formatCurrency(invoiceData.totalInvoiceFeePlusVat_usd , 'USD')}</li>
              <li><strong>Amount Currency:</strong> ${invoiceData.currency}</li>
              <li><strong>Due Date:</strong> ${new Date(invoiceData.transactionDueDate).toLocaleDateString()}</li>
            </ul>
            <h3>Tax Details:</h3>
		      <ul>
		        <li><strong>VAT Rate:</strong> ${invoiceData.vat}%</li>
		     	<li><strong>Tax Amount:</strong> ${invoiceData.currency === 'NGN' ? formatCurrency((invoiceData.amountDue-invoiceData.totalInvoiceFee_ngn) , 'USD') : formatCurrency((invoiceData.totalInvoiceFeePlusVat_usd-invoiceData.totalInvoiceFee_usd) , 'USD')}</li>
		        <li style="font-size: 14px; font-weight: 500"><strong>Net Amount Due:</strong> ${invoiceData.currency === 'NGN' ? formatCurrency(invoiceData.amountDue , 'NGN') : invoiceData.totalInvoiceFeePlusVat_usd , 'USD'}</li>
		     </ul>
		
		      <h3>Client Details:</h3>
		      <ul>
		        <li><strong>Client Name:</strong> ${client.name}</li>
		        <li><strong>Client Email:</strong> ${client.email[0]}</li>
		      </ul>
            <p>Please click the button below to update the status of the invoice in the app:</p>
            <a href="${invoiceData.statusUpdateLink}" style="padding: 10px 20px; background-color: #964FFE; color: #fff; text-decoration: none;"><span>Update Invoice</span></a>
            <p>Please find attached your invoice.</p>
            <p>If you encounter any issues, please contact our support team.</p>
            <p>Best Regards,<br>Global SJX Finance</p>
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

const generateCompleteEmailContent = (role, invoiceData, client) => {
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
          li {
          color: black !important;
          }
        </style>
      </head>
      <body>
        <div class="email-container">
          <div class="header">
            <h1>Payment Acknowledgment</h1>
          </div>
          <div class="content">
            <p>Dear ${role === 'client' ? client.name : 'User'},</p>
            <p>We are pleased to inform you that payment for invoice <strong>${invoiceData.invoiceNo}</strong> has been successfully received. Below are the details:</p>
            <ul>
              <li><strong>Invoice No:</strong> ${invoiceData.invoiceNo}</li>
              <li><strong>Amount Paid:</strong> ${invoiceData.currency === 'NGN' ? formatCurrency(invoiceData.amountPaid , 'NGN') : formatCurrency(invoiceData.totalInvoiceFeePlusVat_usd , 'USD')}</li>
              <li><strong>Currency:</strong> ${invoiceData.currency}</li>
              <li><strong>Payment Date:</strong> ${new Date(invoiceData.paymentDate).toLocaleDateString()}</li>
              <li><strong>Issue Date:</strong> ${new Date(invoiceData.transactionDate).toLocaleDateString()}</li>
              <li><strong>Due Date:</strong> ${new Date(invoiceData.transactionDueDate).toLocaleDateString()}</li>
            </ul>
            <p>Thank you for your prompt payment. ${role === 'client' ? 'We appreciate your continued business.' : ''}</p>
            ${role !== 'client' ? '<p>You can view the updated invoice details in the application.</p>' : ''}
            <p>Best Regards,<br>Global SJX Finance</p>
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

const generateEmailRejectedContent = (role, invoiceData, client) => {
	let emailContent = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@200;400;600&display=swap" rel="stylesheet">
        <title>Invoice Status Update</title>
        <style>
          body { font-family: "Outfit" !important; sans-serif; background-color: #f9f9f9; color: #333; margin: 0; padding: 0; }
          .email-container { max-width: 600px; margin: 20px auto; background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1); }
          .header { text-align: center; background-color: #964FFE; color: #fff; padding: 10px 0; border-radius: 8px 8px 0 0; }
          .content { padding: 20px; line-height: 1.6; font-family: "Outfit" !important;}
          .footer { text-align: center; font-size: 12px; color: #888; margin-top: 20px; }
          .button { padding: 10px 20px; background-color: #964FFE; color: #fff; text-decoration: none; }
          li {
          color: black !important;
          }
        </style>
      </head>
      <body>
        <div class="email-container">
          <div class="header">
            <h1>Invoice Status Update</h1>
          </div>
          <div class="content">
            <p>Dear ${client.name},</p>
            <p>We would like to inform you that Invoice ${invoiceData.invoiceNo} has been updated. Below are the updated invoice details:</p>
            <ul>
              <li><strong>Invoice No:</strong> ${invoiceData.invoiceNo}</li>
              <li><strong>Reference Number:</strong> ${invoiceData.referenceNumber}</li>
              <li><strong>Client:</strong> ${client.name}</li>
              <li><strong>Amount Due:</strong> ${invoiceData.currency === 'NGN' ? formatCurrency(invoiceData.amountDue , 'NGN') : formatCurrency(invoiceData.totalInvoiceFeePlusVat_usd , 'USD')}</li>
              <li><strong>Currency:</strong> ${invoiceData.currency}</li>
              <li><strong>Due Date:</strong> ${invoiceData.transactionDueDate}</li>
            </ul>

            <h3>Reason for Rejection:</h3>
            <p>${invoiceData.rejectionReason}</p>

            <h3>Instructions:</h3>
            <p>Please click the button below to login.</p>
            <a href="https://cheerful-cendol-19cd82.netlify.app/" class="button">Login</a>

            <p>If you need any assistance, feel free to contact our support team.</p>
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
	await check('period', 'Transaction Period is required').notEmpty().run(req);
	await check('amountDue', 'Amount Due is required and must be a valid number').isFloat().run(req);
	await check('transactionDate', 'Transaction Date is required').notEmpty().run(req);
	const user = await User.findById(req.user._id,); // Assuming you have a User model

	// Extract relevant fields from req.body
	const { invoiceType, service1, service2, roles, otherInvoiceServices, clientId, amountDue, transactionDate } = req.body;

	if ((invoiceType === 'ACS_RBA' || invoiceType === "RBA_ACS" || invoiceType === "ACS_RENTAL" || invoiceType === "RBA_RENTAL"|| invoiceType === "RBA_ACS" || invoiceType === "ACS_RENTAL" || invoiceType === "RBA_RENTAL") && (!service1 || !service2)) {
		return res.status(400).json({ responseMessage: 'Service1 and Service2 are required for ACS_RBA invoices', responseCode: "22" });
	} else if ((invoiceType === 'OUTSOURCING' || invoiceType === "CONSULTATION" || invoiceType === "TRAINING" || invoiceType === "LICENSE") && !roles) {
		return res.status(400).json({ responseMessage: 'Roles are required for OUTSOURCING invoices', responseCode: "22" });
	} else if (invoiceType === 'OTHER_INVOICES' && !otherInvoiceServices) {
		return res.status(400).json({ responseMessage: 'Service details are required for OTHER_INVOICES', responseCode: "22" });
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
	if (!existingClient.account){
		return res.status(404).json({
			responseCode: "24",
			responseMessage: "Client does not have a linked account"
		});
	}
	const existingAccount = await Account.findOne({ _id: existingClient.account });
	// Automatically generate the invoice number and reference number
	const invoiceNo = generateRandomNumberWithPrefix('INV');
	const referenceNumber = generateRandomNumberWithPrefix('REF');
	// Set the transaction date to today's date
	// Calculate total fee including VAT
	const totalInvoiceFeePlusVat_usd = invoiceData.taxOption ? invoiceData.totalInvoiceFee_usd + (invoiceData.totalInvoiceFee_usd * invoiceData.vat / 100) : invoiceData.totalInvoiceFee_usd;
	const totalInvoiceFeePlusVat_ngn = invoiceData.taxOption ? invoiceData.totalInvoiceFee_ngn + (invoiceData.totalInvoiceFee_ngn * invoiceData.vat / 100) : invoiceData.totalInvoiceFee_ngn;
	invoiceData.statusUpdateLink = "http://localhost:3000/revenue"
	invoiceData.invoiceNo = invoiceNo;
	invoiceData.referenceNumber = referenceNumber;
	invoiceData.transactionDate = transactionDate;
	invoiceData.totalInvoiceFeePlusVat_usd = totalInvoiceFeePlusVat_usd;
	invoiceData.totalInvoiceFeePlusVat_ngn = totalInvoiceFeePlusVat_ngn;
	invoiceData.rateDate = transactionDate;
	let cbnratedate = new Date(invoiceData.cbnratedate);
	invoiceData.cbnratedate = cbnratedate;
	console.log(invoiceData);
	let newDate = new Date(transactionDate);
	newDate.setDate(newDate.getDate() + 14);
	invoiceData.transactionDueDate = newDate;
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
	await existingClient.save();
	await whtEntity.save();
	const existingTax = await Tax.findOne({clientId: clientIdd});
	const combinedObj = {  ...existingClient, taxAmountDeducted: taxAmount, netAmount: netAmount, ...invoiceData, phone: existingClient.phone, name: existingClient.name, email: existingClient.email, firstname: user.name || user.firstname };
	const emailContentClient = generateEmailContent('client', combinedObj, existingClient);
	let formatDate = new Date(transactionDate).toLocaleDateString();
	// const pdf = await pdfGenerate({accountName: existingAccount.accountName, accountNumber: existingAccount.accountNumber, bankName: existingAccount.bankName, taxName: "Global SJX Limited", taxNumber: "10582697-0001"}, "accountDetails.ejs")
	const pdfInvoice = await pdfGenerate({invoiceType, transactionDate: formatDate, invoiceNo, transactionDueDate: newDate.toLocaleDateString(), currency: savedInvoice.currency, data: combinedObj, accountName: existingAccount.accountName, accountNumber: existingAccount.accountNumber, bankName: existingAccount.bankName, phone: existingClient.phone, name: existingClient.name,clientname:  existingClient.name, email: existingClient.email, taxName: "Global SJX Limited", taxNumber: "10582697-0001"}, "acs_rba_invoice.ejs")
	const attachment = {
		filename: "Invoice.pdf",
		content: pdfInvoice,
		contentType: "application/pdf"
	}
	sendEmail(user.email, 'Invoice Created', emailContentClient, "",[attachment]);
	const backofficeEmails = await User.find({ role: { $in: ['admin', 'backoffice', "superadmin"] } });
	backofficeEmails.forEach(user => {
		const emailContentAdmin = generateEmailContent('admin', combinedObj, existingClient);
		sendEmail(user.email, 'New Invoice Created', emailContentAdmin, "",[attachment]);
	});
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

		const updatedInvoice = await Revenue.findByIdAndUpdate(id, req.body, {
			new: true,
			runValidators: true,
		});
		console.log(updatedInvoice)
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
		if (updatedInvoice.status === "rejected"){
			const backofficeEmails = await User.find({ role: { $in: ['frontOffice', 'admin', 'superadmin'] } });
			backofficeEmails.forEach(user => {
				const emailContentAdmin = generateEmailRejectedContent('admin', updatedInvoice, existingClient);
				sendEmail(user.email, 'Invoice Rejected', emailContentAdmin, "");
			});
			return res.status(200).json({
				responseCode: "00",
				responseMessage: "Invoice updated successfully",
				responseData: updatedInvoice
			});
		}
		let newDate = new Date(updatedInvoice.transactionDate);
		newDate.setDate(newDate.getDate() + 14);
		const totalInvoiceFeePlusVat_usd = updatedInvoice.taxOption ? updatedInvoice.totalInvoiceFee_usd + (updatedInvoice.totalInvoiceFee_usd * updatedInvoice.vat / 100) : updatedInvoice.totalInvoiceFee_usd;
		const totalInvoiceFeePlusVat_ngn = updatedInvoice.taxOption ? updatedInvoice.totalInvoiceFee_ngn + (updatedInvoice.totalInvoiceFee_ngn * updatedInvoice.vat / 100) : updatedInvoice.totalInvoiceFee_ngn;
		updatedInvoice.totalInvoiceFeePlusVat_ngn = totalInvoiceFeePlusVat_ngn
		updatedInvoice.totalInvoiceFeePlusVat_usd = totalInvoiceFeePlusVat_usd
		updatedInvoice.save();
		const combinedObj = {...updatedInvoice, ...existingClient};
		const existingAccount = await Account.findOne({ _id: existingClient.account });
		const pdfInvoice = await pdfGenerate({invoiceType: updatedInvoice.invoiceType, transactionDate: updatedInvoice.transactionDate.toLocaleDateString(), invoiceNo: updatedInvoice.invoiceNo, transactionDueDate: newDate.toLocaleDateString(), currency: updatedInvoice.currency, data: updatedInvoice, phone: existingClient.phone, name: existingClient.name,clientname:  existingClient.name, email: existingClient.email, accountName: existingAccount.accountName, accountNumber: existingAccount.accountNumber, bankName: existingAccount.bankName, taxName: "Global SJX Limited", taxNumber: "10582697-0001"}, "acs_rba_invoice.ejs");
		const attachment = {
			filename: "Invoice.pdf",
			content: pdfInvoice,
			contentType: "application/pdf"
		};
		await recalculateClientTotals(updatedInvoice.clientId);
		// Send notif
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

			const emailContentClient = generateCompleteEmailContent('client', updatedInvoice, existingClient);
			const attachment = {
				filename: "Invoice.pdf",
				content: pdfInvoice,
				contentType: "application/pdf"
			};
			await sendEmail(existingClient.email, 'Payment - Acknowledgement', emailContentClient, "", [attachment]);
			existingClient.email.forEach((person)=> {
				sendEmail(person, 'Payment - Acknowledgement', emailContentClient, "", [attachment]);
			})
			sendEmail(user.email, 'Payment - Acknowledgement', emailContentClient, "", [attachment]);
			const backofficeEmails = await User.find({ role: { $in: ['admin', 'backoffice', "superadmin"] } });
			backofficeEmails.forEach(user => {
				const emailContentAdmin = generateCompleteEmailContent('admin', updatedInvoice, existingClient);
				sendEmail(user.email, 'Payment - Acknowledgement', emailContentAdmin, "", [attachment]);
			});

			await logAction(req.user._id, user.name || user.firstname + " " + user.lastname, 'updated_invoice', "Revenue Management", `Updated invoice for client ${existingClient.name} by ${user.email}`, req.body.ip);

			return res.status(200).json({
				responseCode: "00",
				responseMessage: "Invoice updated successfully",
				responseData: updatedInvoice
			});
		}
		else if (updatedInvoice.status === "approved"){
			const attachment = {
				filename: "Invoice.pdf",
				content: pdfInvoice,
				contentType: "application/pdf"
			};
			const emailContentClients = generateEmailContent('client', updatedInvoice, existingClient);
			existingClient.email.forEach((person)=> {
				sendEmail(person, 'Invoice Created', emailContentClients, "", [attachment]);
			})
			const emailContentClientss = generateEmailContent('admin', updatedInvoice, existingClient);
			await sendEmail(user.email, 'Invoice Approved', emailContentClientss, "", [attachment]);
			const backofficeEmails = await User.find({ role: { $in: ['admin', 'backoffice', "superadmin"] } });
			backofficeEmails.forEach(user => {
				const emailContentAdmin = generateUpdateEmailContent('admin', updatedInvoice, existingClient);
				sendEmail(user.email, 'Invoice Approved', emailContentAdmin, "", [attachment]);
			});
		}
		else{
			const attachment = {
				filename: "Invoice.pdf",
				content: pdfInvoice,
				contentType: "application/pdf"
			};
			const emailContentClient = generateUpdateEmailContent('client', updatedInvoice, existingClient);
			existingClient.email.forEach((person)=> {
				sendEmail(person, 'Invoice Updated', emailContentClient, "", [attachment]);
			})
			const backofficeEmails = await User.find({ role: { $in: ['admin', 'backoffice', "superadmin"] } });
			backofficeEmails.forEach(user => {
				const emailContentAdmin = generateUpdateEmailContent('admin', updatedInvoice, existingClient);
				sendEmail(user.email, 'Invoice Updated', emailContentAdmin, "", [attachment]);
			});
		}
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
		let invoice;

		// Check if the parameter contains "INV" to determine search method
		if (id.includes("INV")) {
			// Search by invoiceNo
			invoice = await Revenue.findOne({ invoiceNo: id });
		} else {
			// Search by ID
			invoice = await Revenue.findById(id);
		}

		if (!invoice) {
			return res.status(404).json({
				success: false,
				error: 'Invoice not found'
			});
		}

		res.status(200).json({
			responseCode: "00",
			responseMessage: "Completed successfully",
			responseData: invoice,
		});
	} catch (error) {
		console.error('Error in printInvoice:', error.message);
		res.status(500).json({
			success: false,
			error: 'Internal Server Error'
		});
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

	const query = { status: { $ne: 'deleted' } };

	if (client) query.client = client;
	if (startDate && endDate) {
		query.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
	}

	let invoices = await Revenue.find(query)
		.sort({ status: 1, updatedAt: -1, createdAt: -1 }) // Prioritize "paid" status and sort by recent updates/creation
		.exec();

	if (invoices.length > 0) {
		res.status(200).json({
			responseCode: "00",
			responseMessage: "Invoices spooled successfully",
			responseData: invoices
		});
	} else {
		res.status(200).json({
			responseCode: "22",
			responseMessage: "No invoices found."
		});
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
	await WHT.deleteMany({ invoiceNo: revenue.invoiceNo });

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