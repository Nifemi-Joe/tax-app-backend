// middlewares/errorMiddleware.js

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

	// Handle CastError separately
	if (err.name === 'CastError') {
		statusCode = 400;
		message = `Invalid ${err.path}: ${err.value}`;
	}

	// Custom error handling
	if (err.isCustomError) {
		statusCode = err.statusCode;
		message = err.message;
	}
	if (err.name === 'JsonWebTokenError') {
		message = 'Not authorized, token failed';
	}

	if (err.name === 'TokenExpiredError') {
		message = 'Not authorized, token expired';
	}

	// Prevent sending headers if response is already sent
	if (res.headersSent) {
		return next(err);
	}

	// Response
	res.status(statusCode).json({
		responseCode: statusCode === 200 ? "00" : "22",
		responseMessage: message,
		stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
	});
};

// Middleware to handle 404 errors
const notFound = (req, res, next) => {
	res.status(404).json({ responseCode: "22", responseMessage: 'Resource not found' });
};

// Middleware to validate ObjectId
const validateObjectId = (paramName) => {
	return (req, res, next) => {
		const id = req.params[paramName];
		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({
				responseCode: "22",
				responseMessage: `Invalid ID`,
			});
		}
		next();
	};
};

module.exports = {
	errorHandler,
	notFound,
	validateObjectId
};
