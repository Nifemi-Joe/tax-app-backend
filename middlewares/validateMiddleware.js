const { body, validationResult } = require('express-validator');

// Middleware to validate request data
const validateRequest = (req, res, next) => {
	// Get validation results
	const errors = validationResult(req);

	// Check if there are validation errors
	if (!errors.isEmpty()) {
		// Return a 400 response with validation errors
		return res.status(400).json({
			success: false,
			errors: errors.array().map(err => ({
				param: err.param,
				msg: err.msg,
				value: err.value,
			})),
		});
	}

	// Proceed to the next middleware or route handler
	next();
};

const validateRegister = [
	body('name').notEmpty().withMessage('Name is required'),
	body('email').isEmail().withMessage('Invalid email address'),
	body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
	(req, res, next) => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			return res.status(400).json({ success: false, errors: errors.array() });
		}
		next();
	}
];

// Validation for user login
const validateLogin = [
	body('email').isEmail().withMessage('Invalid email address'),
	body('password').notEmpty().withMessage('Password is required'),
	(req, res, next) => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			return res.status(400).json({ success: false, errors: errors.array() });
		}
		next();
	}
];

// Validation for profile update
const validateProfileUpdate = [
	body('name').optional().notEmpty().withMessage('Name cannot be empty'),
	body('email').optional().isEmail().withMessage('Invalid email address'),
	body('password').optional().isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
	(req, res, next) => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			return res.status(400).json({ success: false, errors: errors.array() });
		}
		next();
	}
];

module.exports = { validateRegister, validateLogin, validateProfileUpdate };
