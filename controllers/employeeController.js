const Employee = require('../models/Employee');
const asyncHandler = require('express-async-handler');
const { check, validationResult } = require('express-validator');
const nodemailer = require('nodemailer');
const logAction = require("../utils/auditLogger");
const User = require("../models/User");

// @desc    Create a new employee
// @route   POST /api/employees
// @access  Private
exports.createEmployee = asyncHandler(async (req, res) => {
	await check('firstname', 'Firstname is required').not().isEmpty().run(req);
	await check('surname', 'Surname is required').not().isEmpty().run(req);
	await check('email', 'Please include a valid email').isEmail().run(req);
	await check('position', 'Position is required').not().isEmpty().run(req);
	await check('salary', 'Salary must be a positive number').isFloat({ min: 0 }).run(req);

	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return res.status(400).json({ errors: errors.array() });
	}

	const reqData = req.body;
	const email = reqData.email;
	const employeeExists = await Employee.findOne({ email });

	if (employeeExists) {
		res.status(400).json({ responseCode: "22", responseMessage: 'Employee already exists' });
		return;
	}

	const employee = await Employee.create(reqData);

	if (employee) {
		res.status(201).json({
			responseCode: "00",
			responseMessagee: "Employee added successfully!",
			responseData: employee
		});
	} else {
		res.status(400).json({ responseCode: "22", responseMessage: 'Invalid employee data' });
	}
	const user = await User.findById(req.user._id,); // Assuming you have a User model

	await logAction(req.user._id || employee.createdBy, user.name || user.firstname + " " + user.lastname, 'created_employee', "Employee Management", `Created employee ${employee.email} by ${user.email}`, req.body.ip );

});

// @desc    Update employee details
// @route   PUT /api/employees/:id
// @access  Private
exports.updateEmployee = asyncHandler(async (req, res) => {
	const employee = await Employee.findById(req.params.id);

	if (!employee) {
		res.status(404).json({ responseCode: "22", responseMessage: 'Employee not found' });
		return;
	}

	const updates = req.body;

	const updatedEmployee = await Employee.findByIdAndUpdate(req.params.id, updates, {
		new: true,
		runValidators: true,
	});

	res.status(200).json({
		responseCode: "00",
		responseMessagee: "Employee updated successfully!",
		responseData: updatedEmployee
	});
	const user = await User.findById(req.user._id,); // Assuming you have a User model
	await logAction(req.user._id || employee.updatedBy, user.name || user.firstname + " " + user.lastname, 'updated_employee', "Employee Management", `Updated employee ${employee.email} by ${user.email}`, req.body.ip );

});

// @desc    Print employee details
// @route   GET /api/employees/:id/print
// @access  Private
exports.printEmployeeDetails = asyncHandler(async (req, res) => {
	const employee = await Employee.findById(req.params.id);

	if (!employee) {
		res.status(404).json({ message: 'Employee not found' });
		return;
	}

	// Simulate printing by sending a response with employee details
	res.status(200).json(employee);
});

// @desc    Send email to employee
// @route   POST /api/employees/:id/send-email
// @access  Private
exports.sendEmailToEmployee = asyncHandler(async (req, res) => {
	const { subject, message } = req.body;

	const employee = await Employee.findById(req.params.id);

	if (!employee) {
		res.status(404).json({ message: 'Employee not found' });
		return;
	}

	let transporter = nodemailer.createTransport({
		service: 'gmail',
		auth: {
			user: process.env.EMAIL_USER,
			pass: process.env.EMAIL_PASS,
		},
	});

	let mailOptions = {
		from: process.env.EMAIL_USER,
		to: employee.email,
		subject: subject,
		text: message,
	};

	transporter.sendMail(mailOptions, function (error, info) {
		if (error) {
			res.status(500).json({ message: 'Email could not be sent', error });
		} else {
			res.status(200).json({ message: 'Email sent successfully' });
		}
	});
});

// @desc    Mark employee as inactive
// @route   PUT /api/employees/:id/inactivate
// @access  Private
exports.markEmployeeInactive = asyncHandler(async (req, res) => {
	const employee = await Employee.findById(req.params.id);

	if (!employee) {
		res.status(404).json({ message: 'Employee not found' });
		return;
	}

	employee.status = 'inactive';
	employee.inactiveReason = req.body.reason;

	await employee.save();

	res.status(200).json({ message: 'Employee marked as inactive', employee });
});

// @desc    Get list of active employees
// @route   GET /api/employees/active
// @access  Private
exports.getActiveEmployees = asyncHandler(async (req, res) => {
	const employees = await Employee.find({ status: 'active', companyId: req.user.companyId  });

	res.status(200).json(employees);
});

// @desc    Get list of inactive employees
// @route   GET /api/employees/inactive
// @access  Private
exports.getInactiveEmployees = asyncHandler(async (req, res) => {
	const employees = await Employee.find({ status: 'inactive', company: req.user.companyId  });

	res.status(200).json(employees);
});

// @desc    Get list of all employees
// @route   GET /api/employees
// @access  Private
exports.getAllEmployees = asyncHandler(async (req, res) => {
	const employees = await Employee.find({company: req.user.companyId });
	if (employees){
		res.status(200).json({
			responseCode: "00",
			responseMessage: "Completed successfully!",
			responseData: employees
		});
	}
	else {
		res.status(200).json({
			responseCode: "22",
			responseMessage: "No employees found."
		});
	}
});

// @desc    Soft delete an employee
// @route   PUT /api/employees/:id/soft-delete
// @access  Private
exports.softDeleteEmployee = asyncHandler(async (req, res) => {
	const employee = await Employee.findById(req.params.id);

	if (!employee) {
		res.status(404).json({ responseCode: "22", responseMessage: 'Employee not found' });
		return;
	}

	if (employee.status === 'deleted') {
		return res.status(400).json({ responseCode: "22", responseMessage: 'Employee already deleted' });
	}

	employee.status = 'deleted';
	employee.deletedAt = Date.now();

	await employee.save();

	res.status(200).json({
		responseCode: "00",
		responseMessage: "Employee soft deleted successfully!",
		responseData: employee
	});
	const user = await User.findById(req.user._id,); // Assuming you have a User model
	await logAction(req.user._id || employee.deletedBy, user.name || user.firstname + " " + user.lastname, 'deleted_employee', "Employee Management", `Deleted employee ${employee.email} by ${user.email}`, req.body.ip );

});

