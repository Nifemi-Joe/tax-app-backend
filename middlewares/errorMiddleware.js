const mongoose = require('mongoose');
const { ValidationError } = require('express-validator');
const logger = require('../utils/logger');

// Custom error class for application errors
class AppError extends Error {
	constructor(message, statusCode) {
		super(message);
		this.statusCode = statusCode;
		this.isCustomError = true;
		this.timestamp = new Date().toISOString();
		Error.captureStackTrace(this, this.constructor);
	}
}

// Middleware to handle errors
const errorHandler = (err, req, res, next) => {
	if (!err) return next();

	// Log the error with context
	logger.error(err.message, {
		stack: err.stack,
		url: req.originalUrl,
		method: req.method,
		ip: req.ip,
		user: req.user?._id,
		userAgent: req.get('User-Agent'),
		timestamp: new Date().toISOString()
	});

	// Default status code and message
	let statusCode = err.statusCode || 500;
	let message = err.message || 'Server Error';
	let details = null;

	// Mongoose validation error handling
	if (err.name === 'ValidationError' && err.errors) {
		statusCode = 400;
		message = 'Validation Error';
		details = Object.values(err.errors).map(val => ({
			field: val.path,
			message: val.message
		}));
	}

	// Mongoose CastError handling
	if (err.name === 'CastError') {
		statusCode = 400;
		message = 'Invalid ID format';
		details = {
			field: err.path,
			value: err.value
		};
	}

	// express-validator errors handling
	if (err.array && typeof err.array === 'function') {
		statusCode = 400;
		message = 'Validation Error';
		details = err.array().map(error => ({
			field: error.param,
			message: error.msg,
			value: error.value
		}));
	}

	// Handle duplicate key errors
	if (err.code === 11000) {
		const field = Object.keys(err.keyValue)[0];
		message = `${field} already exists`;
		statusCode = 400;
		details = {
			field: field,
			value: err.keyValue[field]
		};
	}

	// Handle JWT errors
	if (err.name === 'JsonWebTokenError') {
		message = 'Not authorized, token failed';
		statusCode = 401;
	}

	if (err.name === 'TokenExpiredError') {
		message = 'Not authorized, token expired';
		statusCode = 401;
	}

	// Handle MongoDB connection errors
	if (err.name === 'MongoNetworkError' || err.name === 'MongoTimeoutError') {
		message = 'Database connection error. Please try again later.';
		statusCode = 503;
	}

	// Handle file upload errors
	if (err.type === 'entity.too.large' || err.name === 'PayloadTooLargeError') {
		message = 'File too large. Please reduce file size and try again.';
		statusCode = 413;
	}

	// Handle session errors
	if (err.name === 'SessionError') {
		message = 'Session expired or invalid. Please log in again.';
		statusCode = 401;
	}

	// Handle rate limit errors
	if (err.name === 'RateLimitError') {
		message = 'Too many requests. Please try again later.';
		statusCode = 429;
	}

	// Custom error handling
	if (err.isCustomError) {
		statusCode = err.statusCode;
		message = err.message;
	}

	// Prevent sending headers if response is already sent
	if (res.headersSent) {
		return next(err);
	}

	// Response format
	const response = {
		responseCode: String(statusCode).padStart(2, '0'),
		responseMessage: message,
		timestamp: new Date().toISOString()
	};

	// Add details in development mode or for validation errors
	if (details && (process.env.NODE_ENV === 'development' || statusCode === 400)) {
		response.details = details;
	}

	// Add stack trace in development mode
	if (process.env.NODE_ENV === 'development') {
		response.stack = err.stack;
		response.error = err;
	}

	res.status(statusCode).json(response);
};

// Middleware to handle 404 errors
const notFound = (req, res, next) => {
	const error = new AppError(`Resource not found - ${req.originalUrl}`, 404);
	next(error);
};

// Middleware to validate ObjectId
const validateObjectId = (paramName) => {
	return (req, res, next) => {
		const id = req.params[paramName];
		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({
				responseCode: "22",
				responseMessage: `Invalid ID format for ${paramName}`,
				timestamp: new Date().toISOString()
			});
		}
		next();
	};
};

// Async handler wrapper to catch errors
const asyncHandler = (fn) => (req, res, next) => {
	Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
	errorHandler,
	notFound,
	validateObjectId,
	AppError,
	asyncHandler
};