const asyncHandler = require('express-async-handler');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Company = require('../models/Company');
const User = require('../models/User');
const { check, validationResult } = require('express-validator');

// @desc    Register a company and the admin user
// @route   POST /api/company/register
// @access  Public
exports.registerCompany = asyncHandler(async (req, res) => {
	// Validate input fields
	await check('companyName', 'Company Name is required').notEmpty().run(req);
	await check('email', 'Please include a valid email').isEmail().run(req);

	await check('adminName', 'Please include a valid admin name').notEmpty().run(req);
	await check('password', 'Password must be at least 6 characters long').isLength({ min: 6 }).run(req);

	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return res.status(400).json({ errors: errors.array() });
	}

	const { companyName, email, password } = req.body;

	// Check if the company already exists
	const companyExists = await Company.findOne({ companyName });
	if (companyExists) {
		return res.status(400).json({ message: 'Company already exists' });
	}

	// Check if the admin email is already registered
	const userExists = await User.findOne({ email });
	if (userExists) {
		return res.status(400).json({ message: 'Admin email already registered' });
	}

	// Create a new company
	const company = await Company.create({
		companyName,
		companyAdmin: email
	});

	// Hash the password for the admin user
	const salt = await bcrypt.genSalt(10);
	const hashedPassword = await bcrypt.hash(password, salt);

	// Create the admin user
	const adminUser = await User.create({
		companyId: company._id,
		email,
		password: hashedPassword,
		role: 'admin',
		firstLogin: true // This will force the password change on first login
	});

	if (company && adminUser) {
		const token = generateToken(adminUser._id);
		res.status(201).json({
			responseCode: '00',
			responseMessage: 'Company registered successfully',
			token,
			companyData: {
				_id: company._id,
				companyName: company.companyName,
				companyAdmin: adminUser.email
			}
		});
	} else {
		res.status(400).json({ message: 'Invalid company or admin data' });
	}
});

// @desc    Login for the company admin and employees
// @route   POST /api/company/login
// @access  Public
exports.loginUser = asyncHandler(async (req, res) => {
	const { email, password } = req.body;

	const user = await User.findOne({ email });
	if (user && (await bcrypt.compare(password, user.password))) {
		const token = generateToken(user._id);

		// If it's the first login, require a password change
		if (user.firstLogin) {
			return res.status(200).json({
				responseCode: '01',
				responseMessage: 'First login, please change your password',
				token
			});
		}

		res.json({
			responseCode: '00',
			responseMessage: 'Login successful',
			token
		});
	} else {
		res.status(400).json({ message: 'Invalid email or password' });
	}
});

// @desc    Change password on first login
// @route   PUT /api/user/change-password
// @access  Private
exports.changePassword = asyncHandler(async (req, res) => {
	const { newPassword } = req.body;
	const userId = req.user._id;

	const user = await User.findById(userId);
	if (user) {
		const salt = await bcrypt.genSalt(10);
		const hashedPassword = await bcrypt.hash(newPassword, salt);

		user.password = hashedPassword;
		user.firstLogin = false; // Reset the firstLogin flag after password change
		await user.save();

		res.json({
			responseCode: '00',
			responseMessage: 'Password changed successfully'
		});
	} else {
		res.status(404).json({ message: 'User not found' });
	}
});

// @desc    Add employee to the company
// @route   POST /api/company/add-employee
// @access  Private (Admin Only)
exports.addEmployee = asyncHandler(async (req, res) => {
	const { name, email, role } = req.body;

	const companyId = req.user.companyId;

	// Check if the employee email already exists
	const userExists = await User.findOne({ email });
	if (userExists) {
		return res.status(400).json({ message: 'Employee email already registered' });
	}

	// Create a new employee
	const randomPassword = Math.random().toString(36).substring(7); // Generate a random password
	const salt = await bcrypt.genSalt(10);
	const hashedPassword = await bcrypt.hash(randomPassword, salt);

	const employee = await User.create({
		name,
		email,
		password: hashedPassword,
		companyId,
		role,
		firstLogin: true // Employee will also be required to change password on first login
	});

	if (employee) {
		res.status(201).json({
			responseCode: '00',
			responseMessage: 'Employee added successfully',
			employeeData: {
				_id: employee._id,
				name: employee.name,
				email: employee.email,
				role: employee.role
			}
		});
	} else {
		res.status(400).json({ message: 'Invalid employee data' });
	}
});

// Generate JWT Token
const generateToken = (id) => {
	return jwt.sign({ id }, process.env.JWT_SECRET, {
		expiresIn: '30d',
	});
};

