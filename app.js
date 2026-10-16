require('dotenv').config();
console.log('1 - Starting app...');

const express = require('express');
const mongoose = require('mongoose');
const cron = require('node-cron');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const { MongoStore } = require('connect-mongo'); // <-- FIXED IMPORT FOR v6

const { errorHandler, notFound } = require('./middlewares/errorMiddleware');
const { generatePDF } = require('./utils/pdfGenerator');
const { getInvoiceData } = require('./controllers/revenueController');
const emailService = require('./utils/emailService');
console.log('2 - Modules loaded');

const User = require('./models/User');
const Invoice = require('./models/Revenue');
const logger = require('./utils/logger');
const Session = require('./models/Session');
const AuditLog = require('./models/AuditLog');
console.log('3 - Models loaded');

const app = express();
const port = process.env.PORT || 8080;

// ============================================================
// CONNECT TO MONGODB FIRST
// ============================================================
console.log('4 - Connecting to MongoDB...');

mongoose
	.connect(process.env.MONGO_URI, {
		serverSelectionTimeoutMS: 5000,
		socketTimeoutMS: 45000,
	})
	.then(() => {
		console.log('✓ Connected to MongoDB');
		logger.info('Connected to MongoDB');
		startServer();
	})
	.catch((err) => {
		console.error('✗ MongoDB connection failed:', err.message);
		logger.error('MongoDB connection failed:', err);
		process.exit(1);
	});

// ============================================================
// SERVER START FUNCTION (runs after DB connection)
// ============================================================
function startServer() {
	console.log('5 - Starting server setup...');

	const corsOptions = {
		origin: process.env.FRONTEND_URL || 'http://localhost:3000',
		methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
		credentials: true,
		allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
	};

	app.use(cors(corsOptions));
	console.log('6 - CORS configured');

	app.use(
		helmet({
			contentSecurityPolicy: {
				directives: {
					defaultSrc: ["'self'"],
					scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
					styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
					imgSrc: ["'self'", 'data:', 'https:'],
					connectSrc: ["'self'", process.env.FRONTEND_URL],
					fontSrc: ["'self'", 'https://fonts.gstatic.com'],
					objectSrc: ["'none'"],
					mediaSrc: ["'self'"],
					frameSrc: ["'none'"],
				},
			},
			hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
			referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
		})
	);
	console.log('7 - Helmet configured');

	// ============================================================
	// SESSION CONFIGURATION - FIXED FOR connect-mongo v6
	// ============================================================
	console.log('8 - Configuring session store...');

	try {
		// v6 uses mongoUrl, NOT mongooseConnection
		const mongoStore = MongoStore.create({
			mongoUrl: process.env.MONGO_URI,
			collectionName: 'sessions',
			ttl: 14 * 24 * 60 * 60,
			autoRemove: 'native',
			touchAfter: 24 * 3600,
		});

		app.use(
			session({
				secret: process.env.SESSION_SECRET || 'your-session-secret-key-change-this',
				resave: false,
				saveUninitialized: false,
				store: mongoStore,
				cookie: {
					secure: process.env.NODE_ENV === 'production',
					httpOnly: true,
					maxAge: 1000 * 60 * 60 * 24 * 14,
					sameSite: 'strict',
				},
				name: 'sessionId',
			})
		);
		console.log('9 - Session store configured');
	} catch (sessionError) {
		console.error('✗ Session configuration failed:', sessionError);
		logger.error('Session configuration failed:', sessionError);
		throw sessionError;
	}

	const limiter = rateLimit({
		windowMs: 15 * 60 * 1000,
		max: 100,
		message: {
			responseCode: '429',
			responseMessage: 'Too many requests from this IP, please try again later.',
			timestamp: new Date().toISOString(),
		},
		standardHeaders: true,
		legacyHeaders: false,
		handler: (req, res) => {
			AuditLog.createLog({
				user: req.user?._id,
				action: 'rate_limit_exceeded',
				resource: 'system',
				details: `Rate limit exceeded for IP: ${req.ip}`,
				ip: req.ip,
				userAgent: req.get('User-Agent'),
				severity: 'medium',
				status: 'failed',
				endpoint: req.originalUrl,
				method: req.method,
			}).catch((err) => logger.error('Rate limit audit log failed:', err));
			res.status(429).json({
				responseCode: '429',
				responseMessage: 'Too many requests from this IP, please try again later.',
				timestamp: new Date().toISOString(),
			});
		},
	});
	console.log('10 - Rate limiter configured');
	app.use('/api/', limiter);

	const authLimiter = rateLimit({
		windowMs: 15 * 60 * 1000,
		max: 5,
		message: {
			responseCode: '429',
			responseMessage: 'Too many authentication attempts, please try again later.',
			timestamp: new Date().toISOString(),
		},
	});
	app.use('/api/user/login', authLimiter);
	app.use('/api/user/register', authLimiter);
	console.log('11 - Auth limiter configured');

	app.use(bodyParser.json({ limit: '50mb' }));
	app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
	app.use(express.json({ limit: '50mb' }));
	app.use(express.urlencoded({ limit: '50mb', extended: true }));
	app.use(cookieParser());
	app.use(mongoSanitize());
	app.use(xss());
	app.use(hpp());
	console.log('12 - Body parsers and sanitization configured');

	app.use((req, res, next) => {
		const start = Date.now();
		const originalResJson = res.json;
		res.json = function (data) {
			const duration = Date.now() - start;
			if (req.path.startsWith('/api/')) {
				AuditLog.createLog({
					user: req.user?._id,
					action: 'api_call',
					resource: 'system',
					details: `${req.method} ${req.path}`,
					ip: req.ip,
					userAgent: req.get('User-Agent'),
					severity: 'low',
					status: res.statusCode >= 400 ? 'failed' : 'success',
					endpoint: req.originalUrl,
					method: req.method,
					statusCode: res.statusCode,
					duration: duration,
					metadata: { query: req.query, body: req.body, params: req.params },
				}).catch((err) => logger.error('Audit log failed:', err));
			}
			return originalResJson.call(this, data);
		};
		next();
	});
	console.log('13 - Request logging configured');

	createDefaultUser();

	setInterval(async () => {
		try {
			await Session.cleanupExpired();
			logger.info('Expired sessions cleaned up');
		} catch (error) {
			logger.error('Session cleanup failed:', error);
		}
	}, 60 * 60 * 1000);
	console.log('14 - Session cleanup scheduled');

	console.log('15 - Setting up routes...');
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
	app.use('/api/accounts', require('./routes/accountRoutes'));
	app.use('/api/audit', require('./routes/auditLogRoutes'));
	app.use('/api/wht', require('./routes/whtRoutes'));
	app.use('/api/tax-returns', require('./routes/taxReturnRoutes'));
	app.use('/api/assets', require('./routes/assetRoutes'));
	app.use('/api/security', require('./routes/securityRoutes'));

	console.log('16 - Routes configured');

	app.get('/health', async (req, res) => {
		try {
			const dbStatus = mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected';
			const sessionStore = mongoose.connection.db.collection('sessions');
			const sessionCount = await sessionStore.countDocuments();
			res.status(200).json({
				status: 'OK',
				timestamp: new Date().toISOString(),
				uptime: process.uptime(),
				database: dbStatus,
				activeSessions: sessionCount,
				environment: process.env.NODE_ENV || 'development',
				version: process.env.npm_package_version || '1.0.0',
			});
		} catch (error) {
			res.status(503).json({ status: 'ERROR', timestamp: new Date().toISOString(), message: 'Health check failed', error: error.message });
		}
	});

	app.get('/test', (req, res) => res.send('Hello from the test endpoint!'));

	app.get('/download-invoice/:invoiceNo', async (req, res) => {
		try {
			const invoiceNo = req.params.invoiceNo;
			const invoiceData = await getInvoiceData(invoiceNo);
			const filePath = await generatePDF('/Users/mac/WebstormProjects/finance-app-backend/templates/acs_rba_invoice.html', invoiceData);
			await AuditLog.createLog({
				user: req.user?._id,
				action: 'data_export',
				resource: 'invoice',
				details: `Invoice downloaded: ${invoiceNo}`,
				ip: req.ip,
				userAgent: req.get('User-Agent'),
				severity: 'medium',
				status: 'success',
				endpoint: req.originalUrl,
				method: req.method,
			});
			res.download(filePath, `invoice_${invoiceNo}.pdf`, (err) => {
				if (err) {
					console.error('Error downloading the PDF:', err);
					logger.error('PDF download error:', err);
					if (!res.headersSent) res.status(500).send('Error generating PDF.');
				}
			});
		} catch (error) {
			console.error('Error handling PDF request:', error);
			logger.error('PDF request error:', error);
			if (!res.headersSent) res.status(500).send('Error generating PDF.');
		}
	});

	cron.schedule('0 0 * * *', async () => {
		try {
			console.log('Running cron job for invoice reminders...');
			logger.info('Running cron job for invoice reminders');
			const invoices = await Invoice.find({
				transactionDate: { $lte: new Date(new Date() - 14 * 24 * 60 * 60 * 1000) },
				status: { $ne: 'paid' },
			}).populate('client');
			for (const invoice of invoices) {
				const client = invoice.client;
				if (!client || !client.email) continue;
				const subject = `Reminder: Invoice #${invoice.invoiceNo} is Overdue`;
				const text = `Dear ${client.name},\n\nWe would like to remind you that your invoice #${invoice.invoiceNo}, created on ${invoice.createdAt}, is now 14 days old and still unpaid.\n\nBest regards,\nGlobal SJX Ltd`;
				await emailService.sendEmail(client.email, subject, text);
			}
			await AuditLog.createLog({
				user: null,
				action: 'system_task',
				resource: 'system',
				details: `Invoice reminder cron job completed. Processed ${invoices.length} invoices.`,
				ip: '127.0.0.1',
				userAgent: 'System',
				severity: 'low',
				status: 'success',
			});
		} catch (error) {
			console.error('Error sending reminder emails:', error);
			logger.error('Cron job error:', error);
		}
	});
	console.log('17 - Cron job scheduled');

	app.use(notFound);
	app.use(errorHandler);
	console.log('18 - Error handlers configured');

	process.on('uncaughtException', (err) => {
		console.error('Uncaught Exception:', err.message, err.stack);
		logger.error('Uncaught Exception:', err);
		process.exit(1);
	});
	process.on('unhandledRejection', (reason) => {
		console.error('Unhandled Rejection:', reason);
		logger.error('Unhandled Rejection:', reason);
		process.exit(1);
	});
	process.on('SIGINT', async () => {
		await mongoose.connection.close();
		process.exit(0);
	});
	process.on('SIGTERM', async () => {
		await mongoose.connection.close();
		process.exit(0);
	});

	app.listen(port, () => {
		console.log(`✓ Server running on port ${port}`);
		console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
		logger.info(`Server running on port ${port}`);
	});
}

async function createDefaultUser() {
	try {
		console.log('Creating default superadmin user...');
		const existingUser = await User.findOne({ email: 'itbiz@globalsjxltd.com' });
		if (existingUser) {
			console.log('Default superadmin user already exists');
			return;
		}
		const defaultUser = new User({
			name: 'IT Business Services',
			email: 'itbiz@globalsjxltd.com',
			password: process.env.NEW_PASSWORD || 'DefaultPassword123!',
			department: 'IT Business Services',
			position: 'BackOffice',
			role: 'superadmin',
		});
		await defaultUser.save();
		console.log('✓ Default superadmin user created successfully');
	} catch (error) {
		console.error('✗ Error creating default user:', error);
		logger.error('Error creating default user:', error);
	}
}

module.exports = app;