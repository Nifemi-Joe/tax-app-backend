require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const { errorHandler, notFound } = require('./middlewares/errorMiddleware');
const {generatePDF} = require("./utils/pdfGenerator");
const {getInvoiceData} = require("./controllers/revenueController")

const app = express();
const port = process.env.PORT || 3009;


const corsOptions = {
	origin: 'http://localhost:3000/', // Allow requests from this origin
};

app.use(cors({
	origin: '*',
	methods: 'GET,POST,PUT,DELETE',
	credentials: true
}));
// Middleware
app.use(helmet());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
}).then(() => {
	console.log('Connected to MongoDB');
}).catch(err => {
	console.error('Error connecting to MongoDB', err);
});
app.set('views', path.join(__dirname, 'templates'));

// Set the view engine (assuming you're using EJS)
app.set('view engine', 'ejs');


// Routes
app.use('/api/employees', require('./routes/employeeRoutes'));
app.use('/api/clients', require('./routes/clientRoutes'));
app.use('/api/invoices', require('./routes/revenueRoutes'));
app.use('/api/user', require('./routes/userRoutes'));
app.use('/api/expenses', require('./routes/expenseRoutes'));
app.use('/api/tax', require('./routes/taxRoutes'));
app.use('/api/rate', require('./routes/rateRoutes'));
app.use('/api/vat',  require('./routes/vatRoutes'));
app.use('/api/company',  require('./routes/companyRoutes'));

app.use('/api/audit',  require('./routes/auditLogRoutes'));
app.get('/download-invoice/:invoiceNo', async (req, res) => {
	try {
		const invoiceNo = req.params.invoiceNo;
		const invoiceData = await getInvoiceData(invoiceNo); // Fetch invoice data from DB or similar

		const filePath = await generatePDF('/Users/mac/WebstormProjects/finance-app-backend/templates/acs_rba_invoice.html', invoiceData);

		// Serve the generated PDF file
		res.download(filePath, `invoice_${invoiceNo}.pdf`, (err) => {
			if (err) {
				console.error('Error downloading the PDF:', err);
				res.status(500).send('Error generating PDF.');
			}
		});
	} catch (error) {
		console.error('Error handling PDF request:', error);
		res.status(500).send('Error generating PDF.');
	}
});
// Handle 404
app.use(notFound);

// Error Handler Middleware (should be after all routes)
app.use(errorHandler);

// Handle Uncaught Exceptions
process.on('uncaughtException', (err) => {
	console.error('Uncaught Exception:', err.message);
	console.error(err.stack);
	// Optionally, perform cleanup and exit
	process.exit(1);
});

// Handle Unhandled Promise Rejections
process.on('unhandledRejection', (reason, promise) => {
	console.error('Unhandled Rejection at:', promise, 'reason:', reason);
	// Optionally, perform cleanup and exit
	process.exit(1);
});


// Error handling middleware
app.use((err, req, res, next) => {
	console.error(err.stack);
	res.status(500).send(err);
});

app.listen(port, () => {
	console.log(`Server running on port ${port}`);
});

