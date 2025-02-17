const fs = require('fs');
const pdf = require('html-pdf');
const path = require('path')
const ejs = require('ejs');
const htmlPdf = require('html-pdf-node');
async function generatePDF(templatePath, invoiceData) {
	try {
		console.log(invoiceData); // Check if it contains invoiceNumber, name, etc.

		// Render the EJS template with the invoice data
		const htmlContent = await ejs.renderFile(templatePath, { data: invoiceData });


		// Save the PDF file
		const pdfFilePath = `/Users/mac/Downloads/generated-invoice.pdf`;

		return pdfFilePath; // Return file path or buffer
	} catch (error) {
		console.error("Error generating PDF: ", error);
		throw new Error('Error generating PDF: ' + error.message);
	}
}

const pdfGenerate = async (data, file) => {
	try {
		const templatePath = path.join(__dirname, '../templates', file);

		// Render the EJS template with the invoice data
		const html = await ejs.renderFile(templatePath, data);

		// PDF options
		const options = { format: 'A4', orientation: 'portrait', border: '10mm' };

		return new Promise((resolve, reject) => {
			pdf.create(html, options).toBuffer((err, buffer) => {
				if (err) {
					reject(new Error('Error generating PDF: ' + err.message));
				} else {
					resolve(buffer);
				}
			});
		});
	} catch (error) {
		throw new Error('Error generating PDF: ' + error.message);
	}
};

module.exports = { generatePDF, pdfGenerate };
