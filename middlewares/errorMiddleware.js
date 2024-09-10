const mongoose = require('mongoose');
const { ValidationError } = require('express-validator');

// Middleware to handle errors
const errorHandler = (err, req, res, next) => {
	console.error(err.stack);

	// Default status code and message
	let statusCode = err.statusCode || 500;
	let message = err.message || 'Server Error';

	// Mongoose validation error handling
	if (err instanceof mongoose.Error.ValidationError) {
		statusCode = 400;
		message = Object.values(err.errors).map(val => val.message).join(', ');
	}

	// express-validator errors handling
	if (err instanceof ValidationError) {
		statusCode = 400;
		message = err.errors.map(error => error.msg).join(', ');
	}

	// Custom error handling
	if (err.isCustomError) {
		statusCode = err.statusCode;
		message = err.message;
	}

	// Response
	res.status(statusCode).json({
		success: false,
		message,
		stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
	});
};

// Middleware to handle 404 errors
const notFound = (req, res, next) => {
	res.status(404).json({ success: false, message: 'Resource not found' });
};

// Middleware to handle uncaught exceptions and promise rejections
const uncaughtExceptions = (err, req, res, next) => {
	console.error('Uncaught Exception:', err.message);
	res.status(500).json({ success: false, message: 'Something went wrong' });
};

// Middleware to handle unhandled promise rejections
const unhandledRejections = (reason, promise) => {
	console.error('Unhandled Rejection at:', promise, 'reason:', reason);
	process.exit(1); // Exit the process to avoid running with a broken state
};

process.on('uncaughtException', uncaughtExceptions);
process.on('unhandledRejection', unhandledRejections);

module.exports = {
	errorHandler,
	notFound,
	uncaughtExceptions,
	unhandledRejections
};
