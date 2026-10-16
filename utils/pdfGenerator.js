const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const pdf = require('html-pdf');

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
		// Resolve the path to the EJS template
		const templatePath = path.join(__dirname, '../templates', file);

		// Render the EJS template with the provided data
		const html = await ejs.renderFile(templatePath, data);

		// Options for PDF generation
		const pdfOptions = {
			format: 'A4', // Paper format
			border: {
				top: '10mm', // Margin top
				right: '10mm', // Margin right
				bottom: '10mm', // Margin bottom
				left: '10mm', // Margin left
			},
		};

		// Generate PDF from HTML
		const pdfBuffer = await new Promise((resolve, reject) => {
			pdf.create(html, pdfOptions).toBuffer((err, buffer) => {
				if (err) {
					reject(new Error('Error generating PDF: ' + err.message));
				} else {
					resolve(buffer);
				}
			});
		});

		return pdfBuffer;
	} catch (error) {
		throw new Error('Error generating PDF: ' + error.message);
	}
};
module.exports = { generatePDF, pdfGenerate };
