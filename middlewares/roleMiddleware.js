// middleware/roleMiddleware.js

const asyncHandler = require('express-async-handler');

// Middleware to check if user has required role(s)
const authorizeRoles = (...roles) => {
	return asyncHandler(async (req, res, next) => {
		if (!req.user) {
			res.status(401);
			throw new Error('Not authorized');
		}
		if (!roles.includes(req.user.role)) {
			res.status(403);
			throw new Error('Forbidden: You do not have the required permissions');
		}
		next();
	});
};

// Middleware to check for specific permissions
const authorizePermissions = (...perms) => {
	return asyncHandler(async (req, res, next) => {
		if (!req.user) {
			res.status(401);
			throw new Error('Not authorized');
		}
		const userPerms = req.user.permissions || [];
		const hasPermission = perms.every(perm => userPerms.includes(perm));
		if (!hasPermission) {
			res.status(403);
			throw new Error('Forbidden: You do not have the required permissions');
		}
		next();
	});
};

module.exports = { authorizeRoles, authorizePermissions };
