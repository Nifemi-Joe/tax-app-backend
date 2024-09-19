const Client = require('../models/Client');
const asyncHandler = require('express-async-handler');
const { check, validationResult } = require('express-validator');
const nodemailer = require('nodemailer');

// @desc    Create a new client
// @route   POST /api/clients
// @access  Private
exports.createClient = asyncHandler(async (req, res) => {
	await check('name', 'Name is required').not().isEmpty().run(req);
	await check('email', 'Please include a valid email').isEmail().run(req);
	await check('phone', 'Phone number is required').isFloat().run(req);
	await check('address', 'Address is required').not().isEmpty().run(req);
	// await check('company', 'Company Name is required').not().isEmpty().run(req);

	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return res.status(400).json({ errors: errors.array() });
	}

	const { name, email, phone, address, status = 'active' } = req.body;

	const clientExists = await Client.findOne({ email });

	if (clientExists) {
		res.status(400).json({ message: 'Client already exists' });
		return;
	}

	const client = await Client.create({
		name,
		email,
		phone,
		address,
		status,
	});

	if (client) {
		res.status(201).json({
			responseCode: "00",
			responseMessage: "Client created successfully",
			responseData: {
				_id: client._id,
				name: client.name,
				email: client.email,
				phone: client.phone,
				// company: client.company,
				address: client.address,
				status: client.status,
			}
		});
	} else {
		res.status(400).json(
			{
				responseCode: "22",
				responseMessage: "Invalid client data",
			});
	}
});

// @desc    Update client details
// @route   PUT /api/clients/:id
// @access  Private
exports.updateClient = asyncHandler(async (req, res) => {
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

	res.status(200).json({
		responseCode: "00",
		responseMessage: "Completed successfully",
		responseData: updatedClient
	});
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
	const clients = await Client.find({ status: 'active' });

	res.status(200).json(clients);
});

// @desc    Get list of inactive clients
// @route   GET /api/clients/inactive
// @access  Private
exports.getInactiveClients = asyncHandler(async (req, res) => {
	const clients = await Client.find({ status: 'inactive' });

	res.status(200).json(clients);
});

exports.softDelete = asyncHandler( async (req,  res) => {
	const client = await Client.findByIdAndUpdate(req.body.id, { status: 'deleted' });
	res.status(200).json({
		responseCode: "00",
		responseMessage: "Client deleted successfully"
	})
});


// @desc    Get list of all clients
// @route   GET /api/clients
// @access  Private
exports.getAllClients = asyncHandler(async (req, res) => {
	const clients = await Client.find({ status: { $ne: 'deleted' } });
	if (clients){
		res.status(200).json({
			responseCode: "00",
			responseMessage: "Completed successfully",
			responseData: clients
		});
	}
	else {
		console.log('ISSUE')
	}
});
