const fs = require('fs');
const pdf = require('pdfkit');
const handlebars = require('handlebars');
const ejs = require('ejs');
const htmlPdf = require('html-pdf-node');
async function generatePDF(templatePath, invoiceData) {
	const templateHtml = fs.readFileSync(templatePath, 'utf8');
	const template = handlebars.compile(templateHtml);
	const html = template(invoiceData);

	return new Promise((resolve, reject) => {
		const doc = new pdf();
		let buffers = [];
		doc.on('data', buffers.push.bind(buffers));
		doc.on('end', () => {
			const pdfData = Buffer.concat(buffers);
			resolve(pdfData);
		});

		// Add the generated HTML to the PDF (requires a library like `pdfmake` for full HTML-to-PDF support)
		doc.text(html);
		doc.end();
	});
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
