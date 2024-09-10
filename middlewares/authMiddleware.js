const jwt = require('jsonwebtoken');
const User = require('../models/User');
const asyncHandler = require('express-async-handler');
const { logger } = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';
// Middleware to protect routes
const protect = asyncHandler(async (req, res, next) => {
	let token;

	// Check for token in headers
	if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
		try {
			// Extract token from Bearer
			token = req.headers.authorization.split(' ')[1];

			// Verify token
			const decoded = jwt.verify(token, JWT_SECRET);

			// Get user from token
			req.user = await User.findById(decoded.id).select('-password');

			// Proceed to next middleware or route handler
			next();
		} catch (error) {
			res.status(401).json({ success: false, message: 'Not authorized, token failed' });
		}
	} else {
		res.status(401).json({ success: false, message: 'Not authorized, no token' });
	}
});

const authenticateToken = (req, res, next) => {
	const token = req.headers.authorization?.split(' ')[1]; // Assuming Bearer token

	if (!token) {
		return res.status(401).json({ success: false, error: 'Access token is required' });
	}

	jwt.verify(token, JWT_SECRET, (err, user) => {
		if (err) {
			logger.error('JWT verification error:', err.message);
			return res.status(403).json({ success: false, error: 'Invalid or expired token' });
		}

		req.user = user;
		next();
	});
};


// Middleware to allow only specific roles
const restrictTo = (...roles) => {
	return (req, res, next) => {
		if (!roles.includes(req.user.role)) {
			return res.status(403).json({ success: false, message: 'Access denied' });
		}
		next();
	};
};

module.exports = {
	protect,
	restrictTo,
	authenticateToken
};
