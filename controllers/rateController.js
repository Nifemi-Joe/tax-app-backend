const Rate = require('../models/Rate');
const asyncHandler = require('express-async-handler');
const { check, validationResult } = require('express-validator');
const User = require("../models/User");
const logAction = require("../utils/auditLogger");

// @desc    Create a new rate
// @route   POST /api/rates
// @access  Private
exports.createRate = asyncHandler(async (req, res) => {
	// Validate input
	await check('value', 'Rate value is required and must be a number').isFloat().run(req);

	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return res.status(400).json({ errors: errors.array() });
	}

	const { value } = req.body;

	const newRate = await Rate.create({
		value, createdBy: req.user._id, companyId: req.user.companyId, ...req.body
	});

	if (newRate) {
		res.status(201).json({
			responseCode: "00",
			responseMessage: "Rate created successfully",
			responseData: newRate
		});
	} else {
		res.status(400).json({
			responseCode: "22",
			responseMessage: "Invalid rate data",
		});
	}
	const user = await User.findById(req.user._id,); // Assuming you have a User model
	await logAction(req.user._id, user.name || user.firstname + " " + user.lastname, 'created_rate', "Rate Management", `Created rate ${newRate.value} by ${user.email}`, req.body.ip );
});

// @desc    Update existing rate
// @route   PUT /api/rates/:id
// @access  Private
exports.updateRate = asyncHandler(async (req, res) => {
	const rate = await Rate.findById(req.params.id);

	if (!rate) {
		res.status(404).json({
			responseCode: "24",
			responseMessage: "Rate not found",
		});
		return;
	}

	const updates = req.body;

	const updatedRate = await Rate.findByIdAndUpdate(req.params.id, updates, {
		new: true,
		runValidators: true,
	});

	res.status(200).json({
		responseCode: "00",
		responseMessage: "Rate updated successfully",
		responseData: updatedRate
	});
	const user = await User.findById(req.user._id,); // Assuming you have a User model
	await logAction(req.user._id, user.name || user.firstname + " " + user.lastname, 'updated_rate', "Rate Management", `Updated rate ${updatedRate.value} by ${user.email}`, req.body.ip );
});

// @desc    Get the current rate
// @route   GET /api/rates/current
// @access  Private
exports.getCurrentRate = asyncHandler(async (req, res) => {
	const currentRate = await Rate.find().sort({ createdAt: -1 }).limit(1);

	if (!currentRate || currentRate.length === 0) {
		res.status(404).json({
			responseCode: "24",
			responseMessage: "No rates available",
		});
		return;
	}

	res.status(200).json({
		responseCode: "00",
		responseMessage: "Rate fetched successfully",
		responseData: currentRate[0]
	});
});

// @desc    Get rate history
// @route   GET /api/rates/history
// @access  Private
exports.getRateHistory = asyncHandler(async (req, res) => {
	const rateHistory = await Rate.find().sort({ createdAt: -1, company: req.user.companyId  });

	if (!rateHistory || rateHistory.length === 0) {
		res.status(404).json({
			responseCode: "24",
			responseMessage: "No rate history available",
		});
		return;
	}

	res.status(200).json({
		responseCode: "00",
		responseMessage: "Rate history fetched successfully",
		responseData: rateHistory
	});
});

// @desc    Soft delete rate (mark rate as deleted)
// @route   PUT /api/rates/:id/delete
// @access  Private
exports.softDeleteRate = asyncHandler(async (req, res) => {
	const rate = await Rate.findByIdAndUpdate(req.params.id, { status: 'deleted' });

	if (!rate) {
		res.status(404).json({
			responseCode: "24",
			responseMessage: "Rate not found",
		});
		return;
	}

	res.status(200).json({
		responseCode: "00",
		responseMessage: "Rate deleted successfully",
	});
	const user = await User.findById(req.user._id,); // Assuming you have a User model
	await logAction(req.user._id, user.name || user.firstname + " " + user.lastname, 'deleted_rate', "Rate Management", `Deleted rate ${rate.value} by ${user.email}`, req.body.ip );
});

// @desc    Get all active rates
// @route   GET /api/rates
// @access  Private
exports.getAllActiveRates = asyncHandler(async (req, res) => {
	const rates = await Rate.find({ status: { $ne: 'deleted' } });

	if (!rates || rates.length === 0) {
		res.status(200).json({
			responseCode: "24",
			responseMessage: "No active rates found",
		});
		return;
	}

	res.status(200).json({
		responseCode: "00",
		responseMessage: "Rates fetched successfully",
		responseData: rates
	});
});
