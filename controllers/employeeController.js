const Employee = require('../models/Employee');
const asyncHandler = require('express-async-handler');
const { check, validationResult } = require('express-validator');
const nodemailer = require('nodemailer');
const logAction = require("../utils/auditLogger");
const User = require("../models/User");
const sendEmail = require("../utils/emailService");
const crypto = require('crypto');
const bcrypt = require('bcryptjs');


// @desc    Create a new employee
// @route   POST /api/employees
// @access  Private
exports.createEmployee = asyncHandler(async (req, res) => {
	// Validation
	await check('firstname', 'Firstname is required').notEmpty().run(req);
	await check('surname', 'Surname is required').notEmpty().run(req);
	await check('email', 'A valid email is required').isEmail().run(req);
	await check('position', 'Position is required').notEmpty().run(req);
	await check('salary', 'Salary must be a positive number').isFloat({ min: 0 }).run(req);

	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return res.status(400).json({ errors: errors.array() });
	}

	const { firstname, surname, email, position, salary, phoneNumber, role, department } = req.body;
	const user = await User.findById(req.user._id); // Get the user who created the client

	// Check if employee already exists
	const existingUser = await User.findOne({ email });
	const existingEmployee = await Employee.findOne({ email });
	// Generate random password
	const randomPassword = crypto.randomBytes(8).toString('hex');
	const hashedPassword = await bcrypt.hash(randomPassword, 10);
	if (existingUser && existingEmployee) {
		res.status(400).json({responseMessage: "User with this email already exists", responseCode: "22"});
		return
	}
	if (existingUser && !existingEmployee) {
		const newemployee = await Employee.create({
			userId: user._id,
			position,
			salary,
			phoneNumber: phoneNumber,
			firstname,
			surname,
			department,
			email,
			password: randomPassword,
			createdBy: req.user._id,
		});
		const resetLink = `http://localhost:3000/create-new-password?email=${encodeURIComponent(email)}&id=${encodeURIComponent(user._id)}`;

		// Send email to the employee
		const emailContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@200;400;600&display=swap" rel="stylesheet">
      <title>Welcome to GSJX LTD</title>
      <style>
        body {
          font-family: 'Outfit', sans-serif;
          background-color: #f9f9f9;
          margin: 0;
          padding: 0;
          color: #333;
        }
        .email-container {
          max-width: 600px;
          margin: 20px auto;
          background: #ffffff;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
        }
        .header {
          text-align: center;
          background-color: #964FFE;
          color: #ffffff;
          padding: 20px;
          border-radius: 8px 8px 0 0;
        }
        .header h1 {
          margin: 0;
          font-size: 24px;
        }
        .content {
          padding: 20px;
          text-align: left;
        }
        .content p {
          font-size: 16px;
          margin: 10px 0;
        }
        .content a {
          display: inline-block;
          margin-top: 20px;
          padding: 10px 15px;
          font-size: 16px;
          text-decoration: none;
          color: #ffffff;
          background-color: #964FFE;
          border-radius: 4px;
        }
        .footer {
          margin-top: 20px;
          text-align: center;
          font-size: 12px;
          color: #999;
        }
        .footer p {
          margin: 5px 0;
        }
      </style>
    </head>
    <body>
      <div class="email-container">
        <div class="header">
          <h1>Welcome to GSJX LTD</h1>
        </div>
        <div class="content">
          <p>Dear ${firstname} ${surname},</p>
          <p>We’re excited to have you on board! Your account has been successfully created.</p>
          <p>You can reset your password and complete your setup using the button below:</p>
          <a href="${resetLink}">Reset Your Password</a>
          <p>For security reasons, please do not share this email with anyone.</p>
          <p>We’re here to help if you need assistance. Simply reply to this email or visit our <a href="https://example.com/support" style="color: #964FFE;">Support Center</a>.</p>
          <p>Best Regards,<br>The GSJX LTD Team</p>
        </div>
        <div class="footer">
          <p>GSJX LTD, 123 Example Street, City, Country</p>
          <p>&copy; ${new Date().getFullYear()} GSJX LTD. All Rights Reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
		await sendEmail(email, 'Welcome to GSJX LTD', emailContent);
		const frontOfficeContent = `
		<!DOCTYPE html>
		<html lang="en">
		<head>
		  <meta charset="UTF-8">
		  <meta name="viewport" content="width=device-width, initial-scale=1.0">
		  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@200;400;600&display=swap" rel="stylesheet">
		  <title>Employee Creation Notification</title>
		  <style>
		    body { font-family: "Outfit", sans-serif; background-color: #f9f9f9; color: #333; }
		    .email-container { max-width: 600px; margin: 20px auto; background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1); }
		    .header { text-align: center; background-color: #964FFE; color: #fff; padding: 10px 0; border-radius: 8px 8px 0 0; }
		    .content { padding: 20px; }
		  </style>
		</head>
		<body>
		  <div class="email-container">
		    <div class="header">
		      <h1>Employee Created Successfully</h1>
		    </div>
		    <div class="content">
		      <p>Dear ${user.name || user.firstname || "User"},</p>
		      <p>The employee <strong>${firstname + " " + surname}</strong> has been successfully created in the system.</p>
            	<p>If you did not request this change, please contact our support team immediately.</p>
		      <p>Best Regards,<br>GSJX LTD Team</p>
		    </div>
		  </div>
		</body>
		</html>
	`
		const admins = await User.find({ role: { $in: ['admin', "superadmin"] } });
		console.log(admins)
		admins.forEach(async (admin) => {
			await sendEmail(admin.email, 'New Employee Creation', frontOfficeContent);
		})
		res.status(201).json({ responseMessage: 'Employee created successfully.', responseData: newemployee, responseCode: "00" });
	}
	else if (!existingUser && !existingEmployee){
		const newuser = await User.create({
			firstname,
			lastname: surname,
			email,
			department,
			position,
			salary,
			phoneNumber: phoneNumber,
			createdBy: req.user._id,
			password: randomPassword,
			role: role,
		});

		const newemployee = await Employee.create({
			userId: newuser._id,
			position,
			salary,
			phoneNumber: phoneNumber,
			firstname,
			surname,
			department,
			email,
			password: randomPassword,
			createdBy: req.user._id,
		});
		const resetLink = `http://localhost:3000/create-new-password?email=${encodeURIComponent(email)}&id=${encodeURIComponent(user._id)}`;

		// Send email to the employee
		const emailContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@200;400;600&display=swap" rel="stylesheet">
      <title>Welcome to GSJX LTD</title>
      <style>
        body {
          font-family: 'Outfit', sans-serif;
          background-color: #f9f9f9;
          margin: 0;
          padding: 0;
          color: #333;
        }
        .email-container {
          max-width: 600px;
          margin: 20px auto;
          background: #ffffff;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
        }
        .header {
          text-align: center;
          background-color: #964FFE;
          color: #ffffff;
          padding: 20px;
          border-radius: 8px 8px 0 0;
        }
        .header h1 {
          margin: 0;
          font-size: 24px;
        }
        .content {
          padding: 20px;
          text-align: left;
        }
        .content p {
          font-size: 16px;
          margin: 10px 0;
        }
        .content a {
          display: inline-block;
          margin-top: 20px;
          padding: 10px 15px;
          font-size: 16px;
          text-decoration: none;
          color: #ffffff;
          background-color: #964FFE;
          border-radius: 4px;
        }
        .footer {
          margin-top: 20px;
          text-align: center;
          font-size: 12px;
          color: #999;
        }
        .footer p {
          margin: 5px 0;
        }
      </style>
    </head>
    <body>
      <div class="email-container">
        <div class="header">
          <h1>Welcome to GSJX LTD</h1>
        </div>
        <div class="content">
          <p>Dear ${firstname} ${surname},</p>
          <p>We’re excited to have you on board! Your account has been successfully created.</p>
          <p>You can reset your password and complete your setup using the button below:</p>
          <a href="${resetLink}">Reset Your Password</a>
          <p>For security reasons, please do not share this email with anyone.</p>
          <p>We’re here to help if you need assistance. Simply reply to this email or visit our <a href="https://example.com/support" style="color: #964FFE;">Support Center</a>.</p>
          <p>Best Regards,<br>The GSJX LTD Team</p>
        </div>
        <div class="footer">
          <p>GSJX LTD, 123 Example Street, City, Country</p>
          <p>&copy; ${new Date().getFullYear()} GSJX LTD. All Rights Reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
		await sendEmail(email, 'Welcome to GSJX LTD', emailContent);
		const frontOfficeContent = `
		<!DOCTYPE html>
		<html lang="en">
		<head>
		  <meta charset="UTF-8">
		  <meta name="viewport" content="width=device-width, initial-scale=1.0">
		  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@200;400;600&display=swap" rel="stylesheet">
		  <title>Employee Creation Notification</title>
		  <style>
		    body { font-family: "Outfit", sans-serif; background-color: #f9f9f9; color: #333; }
		    .email-container { max-width: 600px; margin: 20px auto; background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1); }
		    .header { text-align: center; background-color: #964FFE; color: #fff; padding: 10px 0; border-radius: 8px 8px 0 0; }
		    .content { padding: 20px; }
		  </style>
		</head>
		<body>
		  <div class="email-container">
		    <div class="header">
		      <h1>Employee Created Successfully</h1>
		    </div>
		    <div class="content">
		      <p>Dear ${user.name || user.firstname || "User"},</p>
		      <p>The employee <strong>${firstname + " " + surname}</strong> has been successfully created in the system.</p>
            	<p>If you did not request this change, please contact our support team immediately.</p>
		      <p>Best Regards,<br>GSJX LTD Team</p>
		    </div>
		  </div>
		</body>
		</html>
	`
		const admins = await User.find({ role: { $in: ['admin', "superadmin"] } });
		console.log(admins)
		admins.forEach(async (admin) => {
			await sendEmail(admin.email, 'New Employee Creation', frontOfficeContent);
		})
		res.status(201).json({ responseMessage: 'Employee created successfully.', responseData: newemployee, responseCode: "00" });
	}
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
	const employees = await Employee.find({ status: { $ne: 'deleted'} });
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

