const mongoose = require('mongoose');
const cron = require('node-cron');
const Invoice = require('../models/Revenue'); // Ensure this is the correct path to your Invoice model
const Client = require('../models/Client');
const sendEmail = require("../utils/emailService");
const Account = require("../models/Account");
const {pdfGenerate} = require("../utils/pdfGenerator"); // Assuming Client model exists
require('dotenv').config();

// Function to check and update overdue invoices
const checkOverdueInvoices = async () => {
	try {
		await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

		const thirtyDaysAgo = new Date();
		thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

		// Find invoices approved 30+ days ago and not paid
		const invoices = await Invoice.find({
			status: 'approved',
			updatedAt: { $lte: thirtyDaysAgo }
		});

		for (const invoice of invoices) {
			const client = await Client.findById(invoice.clientId);
			if (!client || !client.email) {
				console.warn(`Client not found or missing email for Invoice ${invoice.invoiceNo}`);
				continue;
			}

			// Update invoice status to overdue
			invoice.status = 'overdue';
			await invoice.save();
			const existingAccount = await Account.findOne({ _id: client.account });
			const pdfInvoice = await pdfGenerate({invoiceType: invoice.invoiceType, transactionDate: invoice.transactionDate.toLocaleDateString(), invoiceNo: invoice.invoiceNo, transactionDueDate: invoice.transactionDueDate, currency: invoice.currency, data: invoice, accountName: existingAccount.accountName, accountNumber: existingAccount.accountNumber, bankName: existingAccount.bankName, taxName: "Global SJX Limited", taxNumber: "10582697-0001"}, "acs_rba_invoice.ejs");
			const attachment = {
				filename: "Invoice.pdf",
				content: pdfInvoice,
				contentType: "application/pdf"
			};
			// Send email to client
			const subject = `Invoice ${invoice.invoiceNo} is Overdue`;
			const text = `
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
					        </style>
					      </head>
					      <body>
						<p>Dear ${client.name},</p>
                          <p>Kindly be informed that the attached invoice <strong>${invoice.invoiceNo}</strong> is currently overdue for payment. 
                          Please be informed that a 10% per annum of the total amount would be charged as penalty if payment is not made from this notice.</p>
                          <p>Amount Due: <strong>${invoice.amountDue} ${invoice.currency}</strong></p>
                          <p>Yours,</p>
                          <p style="color: #964FFE">Global SJX Limited,</p>
                          </body>
    					</html>
`;

			await sendEmail(client.email, subject, text, "",[attachment]);
			console.log(`Overdue email sent to ${client.email} for Invoice ${invoice.invoiceNo}`);
		}

		await mongoose.connection.close();
	} catch (error) {
		console.error('Error processing overdue invoices:', error);
	}
};

// Schedule the job to run every day at midnight
cron.schedule('0 0 * * *', () => {
	console.log('Running overdue invoice check...');
	checkOverdueInvoices();
});

module.exports = checkOverdueInvoices;

