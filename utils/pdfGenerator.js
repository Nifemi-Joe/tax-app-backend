const fs = require('fs');
const pdf = require('pdfkit');
const browserless = require('browserless');
const path = require('path')
const ejs = require('ejs');
const puppeteer = require('puppeteer');

const htmlPdf = require('html-pdf-node');
async function generatePDF(templatePath, invoiceData) {
	try {
		console.log(invoiceData); // Check if it contains invoiceNumber, name, etc.

		// Render the EJS template with the invoice data
		const htmlContent = await ejs.renderFile(templatePath, { data: invoiceData });

		// Launch Puppeteer with custom Chromium executable
		const chromePath =
			process.platform === 'darwin'
				? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' // macOS
				: process.platform === 'win32'
					? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' // Windows
					: '/usr/bin/google-chrome-stable'; // Linux

		// Launch Puppeteer with the custom Chrome executable
		const browser = await puppeteer.launch({
			executablePath: chromePath,
			args: ['--no-sandbox', '--disable-setuid-sandbox'], // Required for some environments
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

const pdfGenerate = async (data, file) => {
	try {
		const templatePath = path.join(__dirname, '../templates', file);

		// Render the EJS template with the invoice data
		const html = await ejs.renderFile(templatePath, data);

		// Create a browserless instance
		const browser = browserless({
			token: process.env.BROWSERLESS_API_KEY, // Use the API key from the environment variable
		});
		const buffer = await browser.pdf(html, {
			format: 'A4',
			printBackground: true,
		});

		await browser.close();
		return buffer;
	} catch (error) {
		throw new Error('Error generating PDF: ' + error.message);
	}
};

module.exports = { generatePDF, pdfGenerate };
