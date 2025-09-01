require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { Invoice } = require('./models/Revenue'); // Assuming you have an Invoice model
const cron = require('node-cron');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const cors = require('cors');
const { errorHandler, notFound } = require('./middlewares/errorMiddleware');
const { generatePDF } = require("./utils/pdfGenerator");
const { getInvoiceData } = require("./controllers/revenueController")
const sendEmail = require("./utils/emailService");
const User = require('./models/User'); // Import User model (default export)

const app = express();
const port = process.env.PORT || 8080;

const corsOptions = {
	origin: '*', // Allow requests from your frontend
	methods: 'GET,POST,PUT,DELETE', // Allowed HTTP methods
	credentials: true, // Allow credentials (cookies, authorization headers)
	allowedHeaders: ['Content-Type', 'Authorization'], // Allowed headers
};

app.use(cors(corsOptions))

// Middleware
app.use(helmet());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));
// Increase body parser limits to handle large file uploads
app.use(express.json({
	limit: '50mb',  // Increase from default 1mb to 50mb
	extended: true
}));

app.use(express.urlencoded({
	limit: '50mb',  // Also increase for URL-encoded data
	extended: true
}));


// Function to create default superadmin user
const createDefaultUser = async () => {
	try {
		// Check if the superadmin user already exists
		const existingUser = await User.findOne({ email: 'nifemijoseph8@gmail.com' });

		if (existingUser) {
			console.log('Default superadmin user already exists');
			return;
		}

		// Create the default user
		const defaultUser = new User({
			firstname: 'Nifemi',
			lastname: 'Joseph',
			middlename: '',
			email: 'nifemijoseph8@gmail.com',
			phoneNumber: '07990965269',
			password: process.env.NEW_PASSWORD,
			department: 'IT Operation',
			position: 'Developer',
			role: 'superadmin',
			permissions: [
				'create-client',
				'view-client',
				'create-employee',
				'view-employee',
				'create-expense',
				'view-expense',
				'create-invoice',
				'view-invoice',
				'create-service',
				'view-service',
				'view-tax',
				'view-vat',
				'create-vat'
			],
			createdBy: 'System',
			status: 'active',
			firstLogin: true,
			generatedPassword: false
		});

		await defaultUser.save();

	} catch (error) {
		console.error('Error creating default user:', error);
	}
};

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
}).then(async () => {
	console.log('Connected to MongoDB');

	// Create default user after successful MongoDB connection
	await createDefaultUser();

}).catch(err => {
	console.error('Error connecting to MongoDB', err);
});

// Routes
app.use('/api/employees', require('./routes/employeeRoutes'));
app.use('/api/clients', require('./routes/clientRoutes'));
app.use('/api/invoices', require('./routes/revenueRoutes'));
app.use('/api/user', require('./routes/userRoutes'));
app.use('/api/expenses', require('./routes/expenseRoutes'));
app.use('/api/tax', require('./routes/taxRoutes'));
app.use('/api/rate', require('./routes/rateRoutes'));
app.use('/api/vat', require('./routes/vatRoutes'));
app.use('/api/services', require('./routes/serviceRoutes'));
app.use('/api/company', require('./routes/companyRoutes'));
app.use('/api/accounts', require("./routes/accountRoutes"));
app.use('/api/audit', require('./routes/auditLogRoutes'));

app.get('/test', (req, res) => {
	res.send('Hello from the test endpoint!');
});

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

cron.schedule('0 0 * * *', async () => { // This runs every day at midnight
	try {
		const invoices = await Invoice.find({
			transactionDate: { $lte: new Date(new Date() - 14 * 24 * 60 * 60 * 1000) }, // Invoices older than 14 days
			status: { $ne: 'paid' } // Filter invoices that are not paid
		});

		for (let invoice of invoices) {
			const client = invoice.client; // Assuming invoice has a 'client' reference

			// Send reminder email to the client
			const subject = `Reminder: Invoice #${invoice.invoiceNo} is Overdue`;
			const text = `Dear ${client.name},\n\nWe would like to remind you that your invoice #${invoice.invoiceNo}, created on ${invoice.createdAt}, is now 14 days old and still unpaid. Please settle the payment at your earliest convenience.\n\nIf you have already made the payment, please disregard this message.\n\nBest regards,\nGlobal SJX Ltd`;

			// Sending the email
			await sendEmail(client.email, subject, text);
			console.log(`Reminder email sent for Invoice #${invoice.invoiceNo} to ${client.email}`);
		}
	} catch (error) {
		console.error('Error sending reminder emails:', error);
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