const winston = require('winston');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Define log directory
const logDir = path.join(__dirname, '../logs');

// Create log directories if they do not exist
if (!fs.existsSync(logDir)) {
	fs.mkdirSync(logDir, { recursive: true });
}

// Define the log format
const logFormat = winston.format.combine(
	winston.format.timestamp({
		format: 'YYYY-MM-DD HH:mm:ss'
	}),
	winston.format.errors({ stack: true }),
	winston.format.splat(),
	winston.format.json()
);

// Custom format for console
const consoleFormat = winston.format.combine(
	winston.format.colorize(),
	winston.format.printf(({ level, message, timestamp, ...meta }) => {
		let metaStr = '';
		if (Object.keys(meta).length > 0) {
			metaStr = '\n' + JSON.stringify(meta, null, 2);
		}
		return `${timestamp} [${level}]: ${message}${metaStr}`;
	})
);

// Create the logger
const logger = winston.createLogger({
	level: process.env.LOG_LEVEL || 'info',
	format: logFormat,
	defaultMeta: { service: 'gsgx-ltd-api' },
	transports: [
		// Write all logs with importance level of 'error' or less to error.log
		new winston.transports.File({
			filename: path.join(logDir, 'error.log'),
			level: 'error',
			maxsize: 5242880, // 5MB
			maxFiles: 5,
			tailable: true,
		}),
		// Write all logs with importance level of 'info' or less to combined.log
		new winston.transports.File({
			filename: path.join(logDir, 'combined.log'),
			level: 'info',
			maxsize: 5242880, // 5MB
			maxFiles: 5,
			tailable: true,
		}),
		// Security events log
		new winston.transports.File({
			filename: path.join(logDir, 'security.log'),
			level: 'warn',
			maxsize: 5242880,
			maxFiles: 10,
			tailable: true,
			format: winston.format.combine(
				winston.format.timestamp(),
				winston.format.json()
			)
		}),
	],
});

// If we're not in production, log to the console as well
if (process.env.NODE_ENV !== 'production') {
	logger.add(
		new winston.transports.Console({
			format: consoleFormat,
			level: process.env.LOG_LEVEL || 'info',
		})
	);
}

// Handle uncaught exceptions
logger.exceptions.handle(
	new winston.transports.File({
		filename: path.join(logDir, 'exceptions.log'),
		maxsize: 5242880,
		maxFiles: 5,
		tailable: true,
	})
);

// Handle unhandled promise rejections
process.on('unhandledRejection', (ex) => {
	logger.error('Unhandled Rejection:', ex);
	throw ex;
});

// Add custom methods for security logging
logger.security = (message, meta = {}) => {
	logger.warn(message, { ...meta, type: 'security_event' });
};

logger.audit = (message, meta = {}) => {
	logger.info(message, { ...meta, type: 'audit_event' });
};

module.exports = logger;