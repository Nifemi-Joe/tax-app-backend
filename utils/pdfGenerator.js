const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const PDFDocument = require('pdfkit');
async function generatePDF(templatePath, invoiceData) {
	try {
		// Render the EJS template with the invoice data
		const htmlContent = await ejs.renderFile(templatePath, { data: invoiceData });
		// Save the PDF file
		const pdfFilePath = ``;

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
		const doc = new PDFDocument();
		doc.pipe(fs.createWriteStream('Invoice.pdf'));
		doc.text(html);  // Render plain text (not HTML)
		doc.end();
	} catch (error) {
		throw new Error('Error generating PDF: ' + error.message);
	}
};

module.exports = { generatePDF, pdfGenerate };
