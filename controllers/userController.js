 const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Company = require("../models/Company");
const { validationResult } = require('express-validator');
const asyncHandler = require('express-async-handler');
const { logger } = require('../utils/logger');
const logAction = require("../utils/auditLogger");
const Service = require("../models/Service");

// Generate JWT
const generateToken = (id) => {
	return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
exports.userRegister = asyncHandler(async (req, res) => {
	const { email } = req.body;

	// Validation
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		res.status(400);
		throw new Error(errors.array().map(err => err.msg).join(', '));
	}

	const userExists = await User.findOne({ email });

	if (userExists) {
		res.status(400);
		throw new Error('User already exists');
	}

	const user = await User.create(req.body);

	if (user) {
		res.status(201).json({
			responseCode: "00",
			responseMessage: "User registered successfully",
			responseData: user,
			token: generateToken(user._id)
		});
		// Automatically create a company for the user
		const company = await Company.create({ name: `${req.body.companyName}`, adminId: user._id });
		user.companyId = company._id;
		await user.save();


		const users = await User.findById(req.user._id,); // Assuming you have a User model
		await logAction(req.user._id || "System", users.name || users.firstname + " " + users.lastname, 'registered_user', "User Management", `Registered user ${user.name || user.firstname + " " + user.lastname}  by ${users.email  || "System"}`, req.body.ip );
	} else {
		res.status(400).json({
			responseCode: "22",
			responseMessage: "Unable to create user at this time.",
		});
		throw new Error('Invalid user data');
	}
});

// @desc    Authenticate user & get token
// @route   POST /api/auth/login
// @access  Public
exports.authUser = asyncHandler(async (req, res) => {
	const { email, password } = req.body;

	// Validation
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		res.status(400);
		throw new Error(errors.array().map(err => err.msg).join(', '));
	}

	const user = await User.findOne({ email });

	if (user && (await user.matchPassword(password))) {
		res.json({
			responseCode: "00",
			responseMessage: "Completed Successfully",
			responseData: user,
			token: generateToken(user._id)
		});
		console.log(user);
		let userName = user.name ? user.name : user.firstname + " " + user.lastname;
		console.log(userName)
		userName = user.phoneNumber;
		console.log(userName);

		// const users = await User.findById(req.user._id,); // Assuming you have a User model
		await logAction(user._id, user.name ? user.name : user.firstname + " " + user.lastname, 'logged_in_user', "User Management", `User ${user.name ? user.name : user.firstname + " " + user.lastname} logged in`, req.body.ip );
	} else {
		res.status(202).json({
			responseCode: "22",
			responseMessage: "Invalid email or password",
		});
	}
});

// @desc    Get user profile
// @route   GET /api/auth/profile
// @access  Private
exports.getProfileUser = asyncHandler(async (req, res) => {
	const user = await User.findById(req.user._id);

	if (user) {
		res.json({
			responseCode: "00",
			responseMessage: "Completed Successfully",
			responseData: user
		});
	} else {
		res.status(404);
		throw new Error('User not found');
	}
});

// @desc    Reset user password
// @route   POST /api/auth/reset-password
// @access  Private (Admin)
exports.resetUserPassword = asyncHandler(async (req, res) => {
	const { userId, newPassword } = req.body;

	const user = await User.findById(userId);

	if (!user) {
		res.status(404);
		throw new Error('User not found');
	}

	user.password = newPassword;
	await user.save();

	res.json({ message: 'Password reset successfully' });
});

 exports.adminResetUserPassword = async (req, res) => {
	 const { userId } = req.body;
	 if (!userId) return res.status(400).json({ message: "User ID is required." });

	 try {
		 const user = await User.findById(userId);
		 if (!user) return res.status(404).json({ message: "User not found." });

		 // Generate a random password
		 const randomPassword = Math.random().toString(36).slice(-8);

		 // Hash the password
		 const hashedPassword = await bcrypt.hash(randomPassword, 10);
		 user.password = hashedPassword;
		 await user.save();

		 // Send the new password to the user's email
		 await sendEmail(user.email, "Password Reset", `Your new password is: ${randomPassword}`);

		 res.status(200).json({ message: "Password reset successfully and sent to the user." });
	 } catch (error) {
		 res.status(500).json({ message: "Error resetting password." });
	 }
 };

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private/Admin
exports.updateUser = asyncHandler(async (req, res) => {
	const { name, email, role, permissions, firstname, lastname } = req.body;

	const user = await User.findById(req.params.id);

	if (user) {
		const updatedUser = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });

		res.json({
			responseCode: "00",
			responseMessage: "Completed Successfully",
			responseData: updatedUser
		});
		const users = await User.findById(req.user._id,); // Assuming you have a User model
		await logAction(req.user._id, users.name || users.firstname + " " + users.lastname, 'updated_user', "User Management", `User ${updatedUser.name || updatedUser.firstname + " " + updatedUser.lastname} updated by ${users.name || users.firstname + " " + users.lastname}`, req.body.ip );
	} else {
		res.status(404);
		throw new Error('User not found');
	}
});

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private/Admin

// Function to verify a password
async function verifyPassword(inputPassword, storedHash) {
	try {
		// Compare the input password with the stored hash
		const isMatch = await bcrypt.compare(inputPassword, storedHash);

		if (isMatch) {
			console.log('Password matches!');
		} else {
			console.log('Password does not match.');
		}
	} catch (error) {
		console.error('Error verifying password:', error);
	}
}

// Example usage
const storedHash = '$2a$10$F9modV0EicPpZ01GycJAOOOjRPwmvx0jf7vBvpKMzVHE6VUGteUrS'; // Replace with the actual stored hash
const inputPassword = 'password123'; // Replace with the password the user is trying to log in with

verifyPassword(inputPassword, storedHash);
async function testPasswordHashing() {
	const password = 'password123'; // This should match the stored hash
	const hashedPassword = await bcrypt.hash(password, 10);
	console.log('Hashed Password:', hashedPassword);

	// Now compare the hashed password
	const isMatch = await bcrypt.compare(password, hashedPassword);
	console.log('Password match with newly hashed password:', isMatch);
}

testPasswordHashing();
// Secret key for JWT
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

// @desc    Register a new user
// @route   POST /api/users/register
// @access  Public
exports.registerUser = asyncHandler(async (req, res) => {
	// Validate request
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return res.status(400).json({ responseCode: "22", responseMessage: errors.array() });
	}
	const { name, email, password, phoneNumber, company } = req.body; // Include phoneNumber and company
	console.log(password);
	try {
		// Check if user already exists
		const existingUser = await User.findOne({ email });
		if (existingUser) {
			return res.status(400).json({ responseCode: "22", responseMessage: "User already exists" });
		}

		// Create new user
		const newUser = await User.create(req.body);

		// Send response
		res.status(201).json({
			responseCode: "00",
			responseMessage: 'User created successfully',
			responseData: newUser,
		});
	} catch (error) {
		logger.error('Error registering user:', error.stack); // Log stack trace for debugging
		res.status(500).json({ responseCode: "22", responseMessage: "Server error" });
	}
});

// @desc    Authenticate a user and get token
// @route   POST /api/users/login
// @access  Public
// @desc    Authenticate a user and get token
// @route   POST /api/users/login
// @access  Public
// @desc    Authenticate a user and get token
// @route   POST /api/users/login
// @access  Public


exports.loginUser = asyncHandler(async (req, res) => {
	// Validate request
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return res.status(400).json({
			responseCode: "22",
			responseMessage: errors.array(),
		});
	}

	const { email, password } = req.body;

	try {
		// Check if user exists
		const user = await User.findOne({ email });
		if (!user) {
			return res.status(400).json({
				responseCode: "22",
				responseMessage: 'Invalid credentials',
			});
		}

		// Compare passwords
		const trimmedPassword = password.trim();
		const isMatch = await bcrypt.compare(password, user.password);

		console.log("Password Match:", isMatch); // Add more debugging info if necessary

		if (!isMatch) {
			return res.status(400).json({
				responseCode: "22",
				responseMessage: 'Invalid credentials',
			});
		}

		// Generate JWT token
		const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '1h' });

		// Send response
		res.status(200).json({
			responseCode: "00",
			responseMessage: 'Completed successfully',
			responseData: user,
			token
		});
	} catch (error) {
		logger.error('Error logging in user:', error.message);
		res.status(500).json({
			responseCode: "11",
			responseMessage: 'Server error',
		});
	}
});

exports.getUsers = asyncHandler(async (req, res) => {
	const users = await User.find();
	if (users){
		res.status(200).json({
			responseCode: "00",
			responseMessage: 'Completed successfully',
			responseData: users,
		});
	}
	else{
		res.status(200).json({
			responseCode: "22",
			responseMessage: 'No users found.',
		});
	}

});

// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Private (Admin)
exports.getUserById = asyncHandler(async (req, res) => {
	const user = await User.findById(req.params.id);
	if (user) {
		res.status(200).json({
			responseCode: "00",
			responseMessage: 'Completed successfully',
			responseData: user,
		});
	} else {
		res.status(404).json({
			responseCode: "22",
			responseMessage: 'User not found',
		});
	}
});

// @desc    Update user details
// @route   PUT /api/users/:id
// @access  Private (Admin)
exports.updateUser = asyncHandler(async (req, res) => {
	const { id } = req.params;
	const userData = req.body;

	const user = await User.findById(id);
	if (user) {
		const updatedUser = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });

		res.json({
			responseCode: "00",
			responseMessage: "Completed Successfully",
			responseData: updatedUser
		});

	} else {
		res.status(404);
		throw new Error('User not found');
	}
});

// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private
exports.getUserProfile = asyncHandler(async (req, res) => {
	try {
		// Find user by ID from token
		const user = await User.findById(req.user.id).select('-password');
		if (!user) {
			return res.status(404).json({ success: false, error: 'User not found' });
		}

		// Send response
		res.status(200).json({ success: true, data: user });
	} catch (error) {
		logger.error('Error fetching user profile:', error.message);
		res.status(500).json({ success: false, error: 'Server Error' });
	}
});

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
exports.updateUserProfile = asyncHandler(async (req, res) => {
	const data = req.body;

	// Validate request
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return res.status(400).json({ success: false, errors: errors.array() });
	}

	try {
		const updateData = {};
		if (data.name) updateData.name = data.name;
		if (data.email) updateData.email = data.email;
		if (data.password) {
			// Hash new password
			updateData.password = await bcrypt.hash(data.password, 10);
		}
		if (data.firstLogin) updateData.firstLogin = data.firstLogin

		// Find and update user
		const updatedUser = await User.findByIdAndUpdate(req.user.id, updateData, { new: true }).select('-password');
		if (!updatedUser) {
			return res.status(404).json({ success: false, error: 'User not found' });
		}

		// Send response
		res.status(200).json({ success: true, data: updatedUser });
	} catch (error) {
		logger.error('Error updating user profile:', error.message);
		res.status(500).json({ success: false, error: 'Server Error' });
	}
});

// @desc    Delete a user
// @route   DELETE /api/users/profile
// @access  Private
exports.deleteUserProfile = asyncHandler(async (req, res) => {
	try {
		const userId = req.params.id;
		// Find and delete user
		const deletedUser = await User.findByIdAndDelete(req.user.id);
		if (!mongoose.Types.ObjectId.isValid(userId)){
			return res.status(400).json({
				responseCode: "22",
				responseMessage: "Invalid user ID",
			});
		}

		const user = await User.findById(userId);

		if (!user) {
			return res.status(404).json({
				responseCode: "22",
				responseMessage: "User not found",
			});
		}

		// Send response
		// Prevent deleting superadmin or your own account (optional)
		if (user.role === 'superadmin') {
			return res.status(403).json({
				responseCode: "22",
				responseMessage: "Cannot delete a superadmin user",
			});
		}

		if (user._id.toString() === req.user._id.toString()) {
			return res.status(403).json({
				responseCode: "22",
				responseMessage: "You cannot delete your own account",
			});
		}

		// Perform soft delete
		user.deleted = true;
		user.deletedAt = Date.now();
		await user.save();
		await logAction({
			userId: req.user._id,
			action: 'delete_user',
			module: 'User Management',
			details: `User ${user.email} deleted by ${req.user.email}`,
			ipAddress: req.ip,
		});

		res.status(200).json({
			responseCode: "00",
			responseMessage: "User deleted successfully",
		});

	} catch (error) {
		logger.error('Error deleting user profile:', error.message);
		res.status(500).json({ success: false, error: 'Server Error' });
	}
});
