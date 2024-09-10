
const { StatusCodes } = require('http-status-codes');

/**
 * @desc    Error handler middleware for Express
 * @param   {Error} err - The error object
 * @param   {Object} req - The request object
 * @param   {Object} res - The response object
 * @param   {Function} next - The next middleware function
 */
const errorHandler = (err, req, res, next) => {
	// Log the error details for internal monitoring
	console.error(err.stack || err.message);

	// Determine the status code
	const statusCode = err.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;
	const message = err.message || 'Something went wrong';

	// Send response to the client
	res.status(statusCode).json({
		success: false,
		error: {
			message,
			...(process.env.NODE_ENV === 'development' && { stack: err.stack })
		}
	});
};

// Custom error classes for better error handling

class AppError extends Error {
	constructor(message, statusCode) {
		super(message);
		this.statusCode = statusCode;
		this.isOperational = true; // Indicates operational errors (e.g., user input errors)
		Error.captureStackTrace(this, this.constructor);
	}
}

class NotFoundError extends AppError {
	constructor(message = 'Resource not found') {
		super(message, StatusCodes.NOT_FOUND);
	}
}

class UnauthorizedError extends AppError {
	constructor(message = 'Not authorized to access this resource') {
		super(message, StatusCodes.UNAUTHORIZED);
	}
}

class ForbiddenError extends AppError {
	constructor(message = 'Access denied') {
		super(message, StatusCodes.FORBIDDEN);
	}
}

class ValidationError extends AppError {
	constructor(message = 'Invalid input data') {
		super(message, StatusCodes.BAD_REQUEST);
	}
}

// Export error handler and custom error classes
module.exports = {
	errorHandler,
	AppError,
	NotFoundError,
	UnauthorizedError,
	ForbiddenError,
	ValidationError
};
