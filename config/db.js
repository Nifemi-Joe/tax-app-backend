const mongoose = require('mongoose');
const winston = require('winston'); // For logging
require('dotenv').config(); // Load environment variables

// Create a custom logger with winston
const logger = winston.createLogger({
	level: 'info',
	format: winston.format.combine(
		winston.format.timestamp(),
		winston.format.json()
	),
	transports: [
		new winston.transports.Console(),
		new winston.transports.File({ filename: 'logs/app.log' })
	],
});

// Load environment variables
const dbUri = process.env.DB_URI || 'mongodb://localhost:27017/fintech_app';
const options = {
	useNewUrlParser: true,
	useUnifiedTopology: true,
	poolSize: 10, // Maintain up to 10 socket connections
	serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
	socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
	family: 4, // Use IPv4, skip trying IPv6
	autoIndex: false, // Disable auto-indexing in production for performance
	ssl: process.env.NODE_ENV === 'production', // Use SSL in production
	sslValidate: true, // Validate SSL certificates
	sslCA: process.env.SSL_CA_PATH, // Path to CA certificate (if SSL is used)
	retryWrites: true, // Retry write operations upon failure
};

// Connect to the MongoDB database
mongoose.connect(dbUri, options)
	.then(() => logger.info(`Connected to MongoDB at ${dbUri}`))
	.catch((err) => {
		logger.error(`Failed to connect to MongoDB: ${err.message}`);
		process.exit(1); // Exit the process if the connection fails
	});

// Connection event listeners
mongoose.connection.on('connected', () => {
	logger.info('Mongoose connection open');
});

mongoose.connection.on('error', (err) => {
	logger.error(`Mongoose connection error: ${err.message}`);
});

mongoose.connection.on('disconnected', () => {
	logger.warn('Mongoose connection disconnected');
});

// Graceful shutdown handling
const gracefulExit = () => {
	mongoose.connection.close(() => {
		logger.info('Mongoose connection closed through app termination');
		process.exit(0);
	});
};

// Listen for process termination signals to handle graceful shutdown
process.on('SIGINT', gracefulExit).on('SIGTERM', gracefulExit);

module.exports = mongoose;
