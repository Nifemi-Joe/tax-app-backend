const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const htmlPdf = require('html-pdf-node');
async function generatePDF(templatePath, invoiceData) {
	try {
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
		console.log(data);
		console.log(file);
		console.log(templatePath)

		// Render the EJS template with the invoice data
		const html = await ejs.renderFile(templatePath, data);

		// PDF options
		const options = { format: 'A4', orientation: 'portrait', border: '10mm', timeout: 90000 };

		// Generate PDF with html-pdf-node
		const pdfBuffer = await htmlPdf.generatePdf({ content: html }, options);
		return pdfBuffer;
	} catch (error) {
		throw new Error('Error generating PDF: ' + error.message);
	}
};

module.exports = { generatePDF, pdfGenerate };
