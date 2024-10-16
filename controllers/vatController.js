// controllers/vatController.js

const VAT = require('../models/VAT');
const asyncHandler = require('express-async-handler');
const { check, validationResult } = require('express-validator');
const nodemailer = require('nodemailer');

// @desc    Create a new VAT rate
// @route   POST /api/vats
// @access  Private (e.g., Admin)
exports.createVAT = asyncHandler(async (req, res) => {
	console.log(req.user)

	// Validation
	await check('value', 'VAT value is required and must be a positive number')
		.isFloat({ min: 0 })
		.run(req);

	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return res.status(400).json({ errors: errors.array() });
	}

	const { value } = req.body;
	const body = req.body
	// Check if VAT already exists with the same value
	const vatExists = await VAT.findOne({ value });

	const vat = await VAT.create({...body, companyId: req.user.companyId, createdBy: req.user._id});

	if (vat) {
		res.status(201).json({
			responseCode: "00",
			responseMessage: "VAT rate created successfully!",
			responseData: vat
		});
	} else {
		res.status(400).json({ responseCode: "22", responseMessage: 'Invalid VAT data' });
	}
});

// @desc    Update VAT rate
// @route   PUT /api/vats/:id
// @access  Private (e.g., Admin)
exports.updateVAT = asyncHandler(async (req, res) => {
	const { id } = req.params;

	// Validate the ObjectId
	if (!VAT.findById(id)) {
		return res.status(404).json({ responseCode: "22", responseMessage: 'VAT rate not found' });
	}

	// Validation
	await check('value', 'VAT value must be a positive number')
		.optional()
		.isFloat({ min: 0 })
		.run(req);

	await check('status', 'Status must be either active or inactive')
		.optional()
		.isIn(['active', 'inactive'])
		.run(req);

	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return res.status(400).json({ errors: errors.array() });
	}

	const updates = req.body;

	const updatedVAT = await VAT.findByIdAndUpdate(id, updates, {
		new: true,
		runValidators: true,
	});

	if (updatedVAT) {
		res.status(200).json({
			responseCode: "00",
			responseMessage: "VAT rate updated successfully!",
			responseData: updatedVAT
		});
	} else {
		res.status(400).json({ responseCode: "22", responseMessage: 'Invalid VAT data' });
	}
});

// @desc    Print VAT rate details
// @route   GET /api/vats/:id/print
// @access  Private (e.g., Admin)
exports.printVATDetails = asyncHandler(async (req, res) => {
	const vat = await VAT.findById(req.params.id);

	if (!vat) {
		res.status(404).json({ responseCode: "22", responseMessage: 'VAT rate not found' });
		return;
	}

	// Simulate printing by sending VAT details
	res.status(200).json({
		responseCode: "00",
		responseMessage: "VAT rate details fetched successfully",
		responseData: vat
	});
});

// @desc    Send email about VAT rate (Optional)
// @route   POST /api/vats/:id/send-email
// @access  Private (e.g., Admin)
exports.sendEmailAboutVAT = asyncHandler(async (req, res) => {
	const { subject, message } = req.body;

	const vat = await VAT.findById(req.params.id);

	if (!vat) {
		res.status(404).json({ responseCode: "22", responseMessage: 'VAT rate not found' });
		return;
	}

	// Configure Nodemailer transporter
	let transporter = nodemailer.createTransport({
		service: 'gmail', // or any other email service
		auth: {
			user: process.env.EMAIL_USER,
			pass: process.env.EMAIL_PASS,
		},
	});

	// Define mail options
	let mailOptions = {
		from: process.env.EMAIL_USER,
		to: req.user.email, // Assuming req.user is available and contains the admin's email
		subject: subject,
		text: `${message}\n\nVAT Rate Details:\nValue: ${vat.value}%\nStatus: ${vat.status}\nCreated At: ${new Date(vat.createdAt).toLocaleString()}`,
	};

	// Send email
	transporter.sendMail(mailOptions, function (error, info) {
		if (error) {
			res.status(500).json({ responseCode: "22", responseMessage: 'Email could not be sent', error });
		} else {
			res.status(200).json({ responseCode: "00", responseMessage: 'Email sent successfully' });
		}
	});
});

// @desc    Mark VAT rate as inactive
// @route   PUT /api/vats/:id/inactivate
// @access  Private (e.g., Admin)
exports.markVATAinactive = asyncHandler(async (req, res) => {
	const vat = await VAT.findById(req.params.id);

	if (!vat) {
		res.status(404).json({ responseCode: "22", responseMessage: 'VAT rate not found' });
		return;
	}

	vat.status = 'inactive';
	vat.inactiveReason = req.body.reason || 'No reason provided';

	await vat.save();

	res.status(200).json({ responseCode: "00", responseMessage: 'VAT rate marked as inactive', responseData: vat });
});

// @desc    Get list of active VAT rates
// @route   GET /api/vats/active
// @access  Private (e.g., Admin)
exports.getActiveVATS = asyncHandler(async (req, res) => {
	const vats = await VAT.find({ status: 'active', companyId: req.user.companyId  }).sort({ createdAt: -1 });

	res.status(200).json({
		responseCode: "00",
		responseMessage: "Active VAT rates fetched successfully",
		responseData: vats
	});
});

// @desc    Get list of inactive VAT rates
// @route   GET /api/vats/inactive
// @access  Private (e.g., Admin)
exports.getInactiveVATS = asyncHandler(async (req, res) => {
	const vats = await VAT.find({ status: 'inactive', company: req.user.companyId  }).sort({ createdAt: -1 });

	res.status(200).json({
		responseCode: "00",
		responseMessage: "Inactive VAT rates fetched successfully",
		responseData: vats
	});
});

// @desc    Get list of all VAT rates
// @route   GET /api/vats
// @access  Private (e.g., Admin)
exports.getAllVATS = asyncHandler(async (req, res) => {
	const vats = await VAT.find({ companyId: req.user.companyId }).sort({ createdAt: -1  });

	if (vats) {
		res.status(200).json({
			responseCode: "00",
			responseMessage: "VAT rates fetched successfully!",
			responseData: vats
		});
	} else {
		res.status(200).json({ responseCode: "22", responseMessage: 'Issue fetching VAT rates' });
	}
});
exports.deleteVAT = asyncHandler(async (req, res) => {
	const vat = await VAT.findById(req.params.id);

	if (!vat) {
		return res.status(404).json({ responseCode: "22", responseMessage: 'VAT rate not found' });
	}

	vat.deleted = true;
	vat.deletedAt = new Date();

	await vat.save();

	res.status(200).json({ responseCode: "00", responseMessage: 'VAT rate marked as deleted', responseData: vat });
});

