 const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Company = require("../models/Company");
const { validationResult } = require('express-validator');
const asyncHandler = require('express-async-handler');
const { logger } = require('../utils/logger');
const logAction = require("../utils/auditLogger");
const Service = require("../models/Service");
 const sendEmail = require("../utils/emailService");

 function generateRandomPassword(length = 12) {
	 const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()";
	 let password = '';
	 for (let i = 0; i < length; i++) {
		 password += charset.charAt(Math.floor(Math.random() * charset.length));
	 }
	 return password;
 }

 function validatePassword(password) {
	 const lengthRequirement = /.{8,}/;
	 const uppercaseRequirement = /[A-Z]/;
	 const lowercaseRequirement = /[a-z]/;
	 const numberRequirement = /\d/;
	 const specialCharRequirement = /[!@#$%^&*()_+\[\]{}|;:,.<>?]/;

	 return (
		 lengthRequirement.test(password) &&
		 uppercaseRequirement.test(password) &&
		 lowercaseRequirement.test(password) &&
		 numberRequirement.test(password) &&
		 specialCharRequirement.test(password)
	 );
 }
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
	const randomPassword = generateRandomPassword(); // Generate random password

	const user = await User.create(req.body);
	user.password = randomPassword; // Assign the random password
	await user.save();

	if (user) {
		res.status(201).json({
			responseCode: "00",
			responseMessage: "User registered successfully",
			responseData: user,
			token: generateToken(user._id)
		});
		// Automatically create a company for the user
		await user.save();
		if (user) {
			// 1. Email to the admin who created the user
			const adminEmailContent = `<!DOCTYPE html>
			<html lang="en">
				<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@200;400;600&display=swap" rel="stylesheet">
				<title>User Creation Success</title>
			<style>
				body {
				font-family: "Outfit", sans-serif !important;
				background-color: #f9f9f9;
				color: #333;
				margin: 0;
				padding: 0;
			}
				.email-container {
				max-width: 600px;
				margin: 20px auto;
				background: #fff;
				padding: 20px;
				border-radius: 8px;
				box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
			}
				.header {
				text-align: center;
				background-color: #964FFE;
				color: #fff;
				padding: 10px 0;
				border-radius: 8px 8px 0 0;
			}
				.content {
				padding: 20px;
				line-height: 1.6;
			}
				.footer {
				text-align: center;
				font-size: 12px;
				color: #888;
				margin-top: 20px;
			}
			</style>
		</head>
			<body>
			<div class="email-container">
				<div class="header">
					<h1>User Created Successfully</h1>
				</div>
				<div class="content">
					<p>Dear <strong>${adminUser.name ? adminUser.name : adminUser.firstname + " " + adminUser.lastname}</strong>,</p>
					<p>We are pleased to inform you that a new user has been successfully created by you. The user details are as follows:</p>
					<ul>
						<li><strong>Name:</strong> ${user.name || user.firstname + " " + user.lastname}</li>
						<li><strong>Email:</strong> ${user.email}</li>
					</ul>
					<p>Best Regards,</p>
					<p><strong>GSJX LTD Team</strong></p>
				</div>
				<div class="footer">
					<p>&copy; 2024 GSJX LTD. All rights reserved.</p>
				</div>
			</div>
			</body>
		</html>
			`;


			sendEmail(req.user.email, "New User Creation Successful", adminEmailContent);

			// 2. Email to all admins notifying the creation of the user
			const admins = await User.find({ role: { $in: ['superadmin', 'admin'] } }); // Get all admins
			const adminEmails = admins.map(admin => admin.email);

			adminEmails.forEach(email => sendEmail(email, "New User Created", adminEmailContent));

			// 3. Email to the newly created user with the random password and change password link
			const userEmailContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@200;400;600&display=swap" rel="stylesheet">
        <title>Welcome to GSJX LTD</title>
        <style>
          body {
            font-family: "Outfit", sans-serif !important;
            background-color: #f9f9f9;
            color: #333;
            margin: 0;
            padding: 0;
          }
          .email-container {
            max-width: 600px;
            margin: 20px auto;
            background: #fff;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
          }
          .header {
            text-align: center;
            background-color: #964FFE;
            color: #fff;
            padding: 10px 0;
            border-radius: 8px 8px 0 0;
          }
          .content {
            padding: 20px;
            line-height: 1.6;
          }
          .footer {
            text-align: center;
            font-size: 12px;
            color: #888;
            margin-top: 20px;
          }
        </style>
      </head>
      <body>
        <div class="email-container">
          <div class="header">
            <h1>Welcome to GSJX LTD!</h1>
          </div>
          <div class="content">
            <p>Dear <strong>${user.name ? user.name : user.firstname + " " + user.lastname}</strong>,</p>
            <p>Your account has been successfully created by an administrator. Below is your temporary password:</p>
            <p style="font-size: 18px; font-weight: bold; color: #363636;">${randomPassword}</p>
            <p>To ensure the security of your account, please click the link below to change your password:</p>
            <p>
              <a href="https://cheerful-cendol-19cd82.netlify.app/create-new-password?userId=${user.id}" style="color: #4b01c0; text-decoration: underline; font-weight: bold;">
                Change Your Password
              </a>
            </p>
            <p>Best Regards,</p>
            <p><strong>GSJX LTD Team</strong></p>
          </div>
          <div class="footer">
            <p>&copy; 2024 GSJX LTD. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

			sendEmail(user.email, "Welcome to GSJX LTD", userEmailContent);
		}


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

	 // Validate input
	 const errors = validationResult(req);
	 if (!errors.isEmpty()) {
		 return res.status(400).json({
			 responseCode: "01",
			 responseMessage: errors.array().map((err) => err.msg).join(', '),
		 });
	 }

	 // Check if user exists
	 const user = await User.findOne({ email });
	 try {
		 if (user && (await user.matchPassword(password))) {
			 const token = generateToken(user._id);

			 // Log user action
			 const userName = user.name ? user.name : `${user.firstname} ${user.lastname}`;
			 await logAction(
				 user._id,
				 userName,
				 'logged_in_user',
				 'User Management',
				 `User ${userName} logged in`,
				 req.body.ip
			 );

			 // Send welcome email
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
            font-family: "Outfit", sans-serif !important;
            background-color: #f9f9f9;
            color: #333;
            margin: 0;
            padding: 0;
          }
          .email-container {
            max-width: 600px;
            margin: 20px auto;
            background: #fff;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
          }
          .header {
            text-align: center;
            background-color: #964FFE;
            color: #fff;
            padding: 10px 0;
            border-radius: 8px 8px 0 0;
          }
          .content {
            padding: 20px;
            line-height: 1.6;
          }
          .footer {
            text-align: center;
            font-size: 12px;
            color: #888;
            margin-top: 20px;
          }
        </style>
      </head>
      <body>
        <div class="email-container">
          <div class="header">
            <h1>Welcome Back!</h1>
          </div>
          <div class="content">
            <p>Dear <strong>${userName}</strong>,</p>
            <p>Thank you for logging in to GSJX LTD. We are excited to have back!</p>
            <p>If you encounter any issues, our support team is here to help.</p>
            <p>Best Regards,</p>
            <p><strong>GSJX LTD Team</strong></p>
          </div>
          <div class="footer">
            <p>&copy; 2024 GSJX LTD. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
			 await sendEmail(user.email, "Welcome Back to GSJX LTD", emailContent);
			 // Respond with success
			 res.json({
				 responseCode: "00",
				 responseMessage: "Login successful",
				 responseData: user,
				 token,
			 });
		 }
		 else {
			 res.status(401).json({
				 responseCode: "22",
				 responseMessage: "Invalid email or password",
			 });
		 }
	 }
	 catch (e) {
		 console.log(e)
		 res.status(401).json({
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
	 const { userId, password } = req.body;

	 if (!userId || !password) {
		 res.status(400);
		 throw new Error('User ID and new password are required.');
	 }

	 try {
		 const user = await User.findById(userId);

		 if (!user) {
			 res.status(404).json({responseMessage: "User not found.", responseCode: "22"});
		 }
// Validate the new password
		 if (!validatePassword(password)) {
			 return res.status(400).json({ responseMessage: "Password does not meet security requirements.", responseCode: "22" });
		 }

		 // Hash the new password
		 const salt = await bcrypt.genSalt(10);
		 user.password = await bcrypt.hash(password, salt);
		 await user.save();

		 // Email HTML content
		 const emailContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@200;400;600&display=swap" rel="stylesheet">
        <title>Password Reset Confirmation</title>
        <style>
          body {
            font-family: 'Outfit', sans-serif !important;
            background-color: #f4f4f4;
            margin: 0;
            padding: 0;
            color: #333;
          }
          .email-container {
            max-width: 600px;
            margin: 20px auto;
            background: #fff;
            border-radius: 8px;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
            overflow: hidden;
          }
          .header {
            background-color: #964FFE;
            color: #fff;
            padding: 15px;
            text-align: center;
          }
          .content {
            padding: 20px;
            line-height: 1.6;
          }
          .footer {
            text-align: center;
            font-size: 12px;
            color: #888;
            padding: 10px;
          }
        </style>
      </head>
      <body>
        <div class="email-container">
          <div class="header">
            <h1>Password Reset Successful</h1>
          </div>
          <div class="content">
            <p>Dear <strong>${user.name ? user.name : user.firstname + ' ' + user.lastname}</strong>,</p>
            <p>This is a confirmation that your password has been successfully reset for your GSJX LTD account.</p>
            <p>If you did not request this change, please contact our support team immediately.</p>
            <p>Best Regards,</p>
            <p><strong>GSJX LTD Team</strong></p>
          </div>
          <div class="footer">
            <p>&copy; 2024 GSJX LTD. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

		 // Send the email
		 await sendEmail(user.email, 'Password Reset Confirmation', emailContent);

		 res.status(200).json({ responseMessage: 'Password reset successfully and email sent to the user.', responseCode: "00" });
	 } catch (error) {
		 console.error(error);
		 res.status(500).json({responseMessage: "Error resetting password.", responseCode: "22"});
	 }
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
		 user.firstname = user.firstname || "User";
		 user.lastname = user.lastname || "Reset";
		 await user.save();

		 // Email HTML content using the provided template
		 const emailContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Password Reset</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@200;400;600&display=swap" rel="stylesheet">
      </head>
      <body>
      <section class="email-section" style="font-family: 'Outfit', sans-serif  !important;">
          <div style="text-align: center; padding: 20px; font-size: 24px; font-weight: 600">
            GSJX LTD
          </div>
          <div style="background-color: rgba(150,79,254,0.7); padding: 30px; border-radius: 10px; margin: auto; width: 80%;">
            <p style="font-size: 18px; color: black; font-weight: 600">Password Reset</p>
            <p>Hello <strong>${user.name ? user.name : user.firstname + " " + user.lastname}</strong>,</p>
            <p>Your password has been successfully reset by the administrator. Below is your new password:</p>
            <p style="font-size: 18px; font-weight: bold; color: #363636;">${randomPassword}</p>
            <p>For enhanced security, we strongly recommend that you log in immediately and update your password.</p>
			<p>
			  To change your password, please click the link below:<br />
			  <a 
			    href="https://cheerful-cendol-19cd82.netlify.app/create-new-password?userId=${user.id}" 
			    style="color: #4b01c0; text-decoration: underline; font-weight: bold; font-size: 16px"
			  >
			    Change Your Password
			  </a>
			</p>
            <p style="margin-top: 30px;">Best Regards,</p>
            <p style="color: rgb(75,1,192);">Global SJX Ltd Team</p>
          </div>
          <footer style="text-align: center; margin-top: 20px;">
            <p style="color: #A7A7A7; font-size: 12px;">Copyright © 2021 GSJX LTD</p>
          </footer>
        </section>
      </body>
      </html>
    `;

    // Send the email
		 console.log(user.email)
    await sendEmail(user.email, "Password Reset", emailContent);

    res.status(200).json({ responseMessage: "Password reset successfully and sent to the user.", responseCode: "00" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ responseMessage: "Error resetting password.", responseCode: "22" });
  }
};

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private/Admin
exports.updateUser = asyncHandler(async (req, res) => {
	const { name, email, role, permissions, firstname, lastname, phone, gender } = req.body;

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
		const deletedUser = await User.findByIdAndDelete(userId);
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
