const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const PDFDocument = require('pdfkit');
const puppeteer = require('puppeteer');
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
		console.log(templatePath);

		// Render the EJS template with the invoice data
		const html = await ejs.renderFile(templatePath, data);

		// Launch puppeteer to generate PDF
		const browser = await puppeteer.launch();
		const page = await browser.newPage();

		// Set the content of the page to the rendered HTML
		await page.setContent(html);
		await page.emulateMediaType('screen'); // Optional: sets print style if defined

		// Create the PDF
		const pdfBuffer = await page.pdf({ format: 'A4' });

		await browser.close();
		return pdfBuffer; // Return the generated PDF buffer
	} catch (error) {
		throw new Error('Error generating PDF: ' + error.message);
	}
};

module.exports = { generatePDF, pdfGenerate };
