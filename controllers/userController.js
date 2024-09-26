const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const asyncHandler = require('express-async-handler');
const { logger } = require('../utils/logger');

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
	const { name, email, password } = req.body;
	console.log(password);
	try {
		// Check if user already exists
		const existingUser = await User.findOne({ email });
		if (existingUser) {
			return res.status(400).json({ responseCode: "22", responseMessage: "User already exists" });
		}

		// Hash password
		// const hashedPassword = await bcrypt.hash(password, 10);
		// console.log(hashedPassword)
		console.log(password);

		// Create new user
		const newUser = await User.create({
			name,
			email,
			password: password,
		});

		// Send response
		res.status(201).json({
			responseCode: "00",
			responseMessage: 'User created successfully',
			responseData: newUser,
		});
	} catch (error) {
		logger.error('Error registering user:', error.message);
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
		const isMatch = bcrypt.compare(user.password, password);

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
	res.status(200).json({
		responseCode: "00",
		responseMessage: 'Completed successfully',
		responseData: users,
	});
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
		res.status(404);
		throw new Error('User not found');
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
		if (userData.name) user.name = userData.name;
		if (userData.gender) user.gender = userData.gender;
		if (userData.country) user.country = userData.country;
		if (userData.address) user.address = userData.address;
		if (userData.role) user.role = userData.role;
		if (userData.department) user.department = userData.department;
		if (userData.position) user.position = userData.position;
		if (userData.phone) user.phone = userData.phone;
		if (userData.email) user.email = userData.email;
		if (userData.password) {
			const salt = await bcrypt.genSalt(10);
			user.password = await bcrypt.hash(userData.password, salt);
		}

		const updatedUser = await user.save();
		res.status(200).json({
			responseCode: "00",
			responseMessage: 'Completed successfully',
			responseData: updatedUser,
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
		// Find and delete user
		const deletedUser = await User.findByIdAndDelete(req.user.id);
		if (!deletedUser) {
			return res.status(404).json({ success: false, error: 'User not found' });
		}

		// Send response
		res.status(200).json({ success: true, message: 'User deleted successfully' });
	} catch (error) {
		logger.error('Error deleting user profile:', error.message);
		res.status(500).json({ success: false, error: 'Server Error' });
	}
});
