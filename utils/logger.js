const winston = require('winston');
const path = require('path');

// Define log file paths
const logDir = path.join(__dirname, '../logs'); // Adjust the path as needed

// Create log directories if they do not exist
const fs = require('fs');
if (!fs.existsSync(logDir)) {
	fs.mkdirSync(logDir, { recursive: true });
}

// Define the log format
const logFormat = winston.format.combine(
	winston.format.timestamp(),
	winston.format.errors({ stack: true }),
	winston.format.splat(),
	winston.format.json()
);

// Create a transport for file logging
const fileTransport = new winston.transports.File({
	filename: path.join(logDir, 'application.log'),
	level: 'info',
	format: logFormat,
});

// Create a transport for error logging
const errorTransport = new winston.transports.File({
	filename: path.join(logDir, 'error.log'),
	level: 'error',
	format: logFormat,
});

// Create a transport for console logging (for development)
const consoleTransport = new winston.transports.Console({
	format: winston.format.combine(
		winston.format.colorize(),
		winston.format.simple()
	),
});

// Create the logger
const logger = winston.createLogger({
	level: 'info',
	format: logFormat,
	transports: [
		fileTransport,
		errorTransport,
		consoleTransport,
	],
});

// Add a custom error handling transport to handle uncaught exceptions and unhandled rejections
logger.exceptions.handle(
	new winston.transports.File({ filename: path.join(logDir, 'exceptions.log') })
);

process.on('unhandledRejection', (ex) => {
	throw ex;
});

// Add a custom log level if needed
logger.add(new winston.transports.File({
	filename: path.join(logDir, 'combined.log'),
	level: 'debug',
	format: logFormat,
}));

// Helper function to log messages
const log = (level, message, meta = {}) => {
	logger.log(level, message, meta);
};

// Export the logger and helper function
module.exports = {
	logger,
	log,
};
