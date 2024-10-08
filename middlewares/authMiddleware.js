// middleware/authMiddleware.js

const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const User = require('../models/User');

const protect = asyncHandler(async (req, res, next) => {
	let token;

	if (
		req.headers.authorization &&
		req.headers.authorization.startsWith('Bearer')
	) {
		try {
			token = req.headers.authorization.split(' ')[1];

			const decoded = jwt.verify(token, process.env.JWT_SECRET);

			req.user = await User.findById(decoded.id).select('-password');
			if (!req.user) {
				res.status(401).json({
					responseCode: "22",
					responseMessage: "Not authorized, user not found"
				});
				throw new Error('Not authorized, user not found');
			}

			next();
		} catch (error) {
			console.error(error);
			res.status(401).json({
				responseCode: "22",
				responseMessage: "Not authorized, user not found"
			});
			throw new Error('Not authorized, token failed');
		}
	}

	if (!token) {
		res.status(401).json({
			responseCode: "22",
			responseMessage: "Not authorized, user not found"
		});
		throw new Error('Not authorized, no token');
	}
});

// Authorization based on roles
const authorize = (...roles) => {
	return (req, res, next) => {
		if (!roles.includes(req.user.role)) {
			res.status(403).json({
				responseCode: "22",
				responseMessage: "Not authorized, user not found"
			});;
			throw new Error('User role not authorized for this action');
		}
		next();
	};
};

// middlewares/authorizePermissions.js

const authorizePermissions = (...requiredPermissions) => {
	return (req, res, next) => {
		if (!req.user) {
			res.status(401).json({ responseCode: "22", responseMessage: 'Not authorized, no user' });
			throw new Error('Not authorized, no user');
		}

		// Allow admins and superadmins to bypass permission checks
		const userRole = req.user.role;
		if (userRole === 'admin' || userRole === 'superadmin') {
			return next();
		}

		// Check if user has all required permissions
		const userPermissions = req.user.permissions;
		const hasPermissions = requiredPermissions.every(permission => userPermissions.includes(permission));

		if (!hasPermissions) {
			res.status(403).json({ responseCode: "22", responseMessage: 'Forbidden: You do not have the required permissions' });
			throw new Error('Forbidden: You do not have the required permissions');
		}

		next();
	};
};



module.exports = { protect, authorize, authorizePermissions };
