const fs = require('fs');
const pdf = require('pdfkit');
const handlebars = require('handlebars');
const ejs = require('ejs');
const puppeteer = require('puppeteer');

const htmlPdf = require('html-pdf-node');
async function generatePDF(templatePath, invoiceData) {
	try {
		console.log(invoiceData); // Check if it contains invoiceNumber, name, etc.

		// Render the EJS template with the invoice data
		const htmlContent = await ejs.renderFile(templatePath, { data: invoiceData });

		// Launch Puppeteer with custom Chromium executable
		const browser = await puppeteer.launch({
			executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', // Path to Chrome/Chromium
			headless: true,
		});

		const page = await browser.newPage();
		await page.setContent(htmlContent);

		// Generate PDF options
		const pdfBuffer = await page.pdf({
			format: 'A4',
			printBackground: true,
		});

		await browser.close();

		// Save the PDF file
		const pdfFilePath = `/Users/mac/Downloads/generated-invoice.pdf`;
		fs.writeFileSync(pdfFilePath, pdfBuffer);

		return pdfFilePath; // Return file path or buffer
	} catch (error) {
		console.error("Error generating PDF: ", error);
		throw new Error('Error generating PDF: ' + error.message);
	}
}

exports.pdfGenerate = async (templatePath, data) => {
	try {

		// Render the EJS template with the invoice data
		const htmlContent = await ejs.renderFile(templatePath, data);

		// Options for generating PDF
		const options = { format: 'A4' };

		// Create a PDF buffer from the HTML content
		const pdfBuffer = await htmlPdf.generatePdf({ content: htmlContent }, options);

		return pdfBuffer;
	} catch (error) {
		throw new Error('Error generating PDF: ' + error.message);
	}
};

module.exports = { generatePDF };
