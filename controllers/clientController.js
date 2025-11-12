const Client = require('../models/Client');
const User = require('../models/User');
const Account = require('../models/Account'); // Import the Account model

const asyncHandler = require('express-async-handler');
const { check, validationResult } = require('express-validator');
const nodemailer = require('nodemailer');
const logAction = require('../utils/auditLogger');
const AuditLog = require('../models/AuditLog');
const emailService = require('../utils/emailService');

// @desc    Create a new client
// @route   POST /api/clients
// @access  Private
exports.createClient = asyncHandler(async (req, res) => {
	// Validate inputs
	await check('name', 'Name is required').not().isEmpty().run(req);
	await check('email', 'Email is required').isArray().withMessage('Emails must be an array').run(req);
	await check('phone', 'Phone number is required').isArray().withMessage('Phone numbers must be an array').run(req);
	await check('account', 'Account ID is required').not().isEmpty().run(req);
	await check('address', 'Address is required').not().isEmpty().run(req);
	await check('createdBy', 'Client created by is required').not().isEmpty().run(req);
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return res.status(400).json({ errors: errors.array() });
	}

	const { name, email, phone, address, createdBy, status = 'pending', account } = req.body;

	// Check if client already exists
	const clientExists = await Client.findOne({ email, status: { $ne: 'deleted' } });
	if (clientExists) {
		return res.status(400).json({ responseCode: "22",
			responseMessage: 'Client already exists' });
	}

	const clientAccount = await Account.findById(account);
	if (!clientAccount) {
		return res.status(400).json({ responseCode: "22",
			responseMessage: 'Invalid account ID' });
	}

	if (clientAccount.status !== "active") {
		return res.status(400).json({ responseCode: "22",
			responseMessage: 'The account details are not active.' });
	}
	// Create the client
	const client = await Client.create(req.body);

	if (client) {
		const user = await User.findById(req.user._id); // Get the user who created the client

		// Log the action in audit logs
		await AuditLog.create({
			userId: user._id,
			userName: user.firstname ? user.firstname + " " + user.lastname : user.name,
			action: 'create_user',
			module: 'Client Management',
			details: `Created client ${client.email} by ${user.email}`,
			ipAddress: req.ip,
		});

		// Send email to the front office user
		const emailFrontOfficeContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@200;400;600&display=swap" rel="stylesheet">
          <title>Client Creation Notification</title>
          <style>
            body {
              font-family: "Outfit", sans-serif  !important;
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
              <h1>Client Creation Notification</h1>
            </div>
            <div class="content">
              <p>Dear ${user.name || user.firstname || "User"},</p>
              <p>You have successfully created a new client. The back office team will activate this client soon.</p>
              <p>Client Details:</p>
              <ul>
                <li><strong>Name:</strong> ${client.name}</li>
                <li><strong>Email:</strong> ${client.email}</li>
                <li><strong>Phone:</strong> ${client.phone}</li>
                <li><strong>Address:</strong> ${client.address}</li>
              </ul>
              <p>If you did not initiate this action, please contact our support team immediately.</p>
            </div>
            <div class="footer">
              <p>&copy; 2024 GSJX LTD. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
        `;

		// Send email to admins and back office
		const admins = await User.find({ role: { $in: ['admin', 'back_office', "superadmin"] } });
		console.log(admins)
		admins.forEach(async (admin) => {
			console.log("i am here")
			const emailAdminContent = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@200;400;600&display=swap" rel="stylesheet">
              <title>Client Creation Notification</title>
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
                .button {
                  display: inline-block;
                  padding: 10px 20px;
                  margin: 20px auto;
                  background-color: #964FFE;
                  color: #fff !important;
                  text-decoration: none;
                  border-radius: 5px;
                  display: block;
    			width: max-content;
                }
              </style>
            </head>
            <body>
              <div class="email-container">
                <div class="header">
                  <h1>Client Creation Notification</h1>
                </div>
                <div class="content">
                  <p>Dear Admin/Back Office,</p>
                  <p>A new client has been created by the Front Office. Please review and activate the client by clicking the button below.</p>
                  <p>Client Details:</p>
                  <ul>
                    <li><strong>Name:</strong> ${name}</li>
                    <li><strong>Email:</strong> ${email}</li>
                    <li><strong>Phone:</strong> ${phone}</li>
                    <li><strong>Address:</strong> ${address}</li>
                  </ul>
                  <a href="${process.env.ACTIVATION_LINK}/${client._id}" class="button">Activate Client</a>
                </div>
                <div class="footer">
                  <p>&copy; 2024 GSJX LTD. All rights reserved.</p>
                </div>
              </div>
            </body>
            </html>
            `;
			await emailService.sendEmail(admin.email, 'New Client Created - Activate Now', emailAdminContent);
		});
		await emailService.sendEmail(user.email, 'New Client Created', emailFrontOfficeContent);

		// Respond back to the front-end
		res.status(201).json({
			responseCode: "00",
			responseMessage: "Client created successfully. Admins have been notified for activation.",
			responseData: client,
		});
	} else {
		res.status(400).json({
			responseCode: "22",
			responseMessage: "Invalid client data",
		});
	}
});// @desc    Update client details
// @route   PUT /api/clients/:id
// @access  Private
exports.updateClient = asyncHandler(async (req, res) => {
	await check('updatedBy', 'Client updated by is required').not().isEmpty().run(req);

	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return res.status(400).json({ errors: errors.array() });
	}

	const client = await Client.findById(req.params.id);

	if (!client) {
		res.status(404).json({
			responseCode: "24",
			responseMessage: "Client not found"
		});
		return;
	}

	const updates = req.body;

	const updatedClient = await Client.findByIdAndUpdate(req.params.id, updates, {
		new: true,
		runValidators: true,
	});
	const user = await User.findById(req.user._id,); // Assuming you have a User model

	res.status(200).json({
		responseCode: "00",
		responseMessage: "Completed successfully",
		responseData: updatedClient
	});
	await logAction(user._id || updatedClient.updatedBy, user.name || user.firstname + " " + user.lastname, 'updated_client', "Client Management", `Updated client ${updatedClient.email} by ${user.email}`, req.body.ip );

});

// @desc    Print client details
// @route   GET /api/clients/:id/print
// @access  Private
exports.printClientDetails = asyncHandler(async (req, res) => {
	const client = await Client.findById(req.params.id);

	if (!client) {
		res.status(404).json({
			responseCode: "24",
			responseMessage: "Client not found"
		});
		return;
	}

	// Simulate printing by sending a response with client details
	res.status(200).json(
		{
			responseCode: "00",
			responseMessage: "Completed successfully",
			responseData: client
		}
		);
});

// @desc    Send email to client
// @route   POST /api/clients/:id/send-email
// @access  Private
exports.sendEmailToClient = asyncHandler(async (req, res) => {
	const { subject, message } = req.body;

	const client = await Client.findById(req.params.id);

	if (!client) {
		res.status(404).json({ message: 'Client not found' });
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
		to: client.email,
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

// @desc    Mark client as inactive
// @route   PUT /api/clients/:id/inactivate
// @access  Private
exports.markClientInactive = asyncHandler(async (req, res) => {
	const client = await Client.findById(req.params.id);

	if (!client) {
		res.status(404).json({ message: 'Client not found' });
		return;
	}

	client.status = 'inactive';
	client.inactiveReason = req.body.reason;

	await client.save();

	res.status(200).json({ message: 'Client marked as inactive', client });
});

// @desc    Get list of active clients
// @route   GET /api/clients/active
// @access  Private
exports.getActiveClients = asyncHandler(async (req, res) => {
	const clients = await Client.find({ status: 'active', company: req.user.company._id });

	res.status(200).json(clients);
});

// @desc    Get list of inactive clients
// @route   GET /api/clients/inactive
// @access  Private
exports.getInactiveClients = asyncHandler(async (req, res) => {
	const clients = await Client.find({ status: 'inactive', company: req.user.company._id });

	res.status(200).json(clients);
});

exports.softDelete = asyncHandler( async (req,  res) => {
	await check('deletedBy', 'Client deleted by is required').not().isEmpty().run(req);

	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return res.status(400).json({ errors: errors.array() });
	}
	const user = await User.findById(req.user._id,); // Assuming you have a User model

	const client = await Client.findByIdAndUpdate(req.body.id, { status: 'deleted' });
	res.status(200).json({
		responseCode: "00",
		responseMessage: "Client deleted successfully"
	})
	await logAction(req.user._id || updatedClient.updatedBy, user.name || user.firstname + " " + user.lastname, 'deleted_client', "Client Management", `Deleted client ${updatedClient.email} by ${user.email}`, req.body.ip );

});


// @desc    Get list of all clients
// @route   GET /api/clients
// @access  Private
exports.getAllClients = asyncHandler(async (req, res) => {
	const clients = await Client.find({ status: { $ne: 'deleted'} });
	if (clients){
		res.status(200).json({
			responseCode: "00",
			responseMessage: "Completed successfully",
			responseData: clients
		});
	}
	else {
		res.status(200).json({
			responseCode: "22",
			responseMessage: "No clients found."
		});
	}
});
