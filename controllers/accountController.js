const asyncHandler = require('express-async-handler');
const Account = require('../models/Account');
const User = require('../models/User');

// Create a new account
exports.createAccount = asyncHandler(async (req, res) => {
	const { bankName, accountName, accountNumber, accountType } = req.body;

	if (!bankName || !accountName || !accountNumber || !accountType) {
		return res.status(404).json({ responseMessage: 'All fields are required', responseCode: "22" });
	}

	// Check for existing account number
	const existingAccount = await Account.findOne({ accountNumber });
	if (existingAccount) {
		return res.status(400).json({ responseMessage: 'Account number already exists', responseCode: "22" });
	}

	const account = new Account({
		bankName,
		accountName,
		accountNumber,
		accountType,
		createdBy: req.user._id,
		status: "pending"
	});

	const savedAccount = await account.save();
	res.status(201).json({
		responseMessage: 'Account created successfully',
		responseData: savedAccount,
		responseCode: "00"
	});
});

// Get all accounts
exports.getAccounts = asyncHandler(async (req, res) => {
	const accounts = await Account.find().populate('createdBy', 'name email');
	res.status(200).json({responseData: accounts, responseCode: "00", responseMessage: "Completed successfully"});
});

// Get a single account
exports.getAccountById = asyncHandler(async (req, res) => {
	const account = await Account.findById(req.params.id).populate('createdBy', 'name email');

	if (!account) {
		return res.status(404).json({ responseMessage: 'Account not found', responseCode: "22" });
	}

	res.status(200).json({responseData: account, responseCode: "00", responseMessage: "Completed successfully"});
});

// Update account details
exports.updateAccount = asyncHandler(async (req, res) => {
	const { bankName, accountName, accountNumber, accountType, status } = req.body;

	const account = await Account.findById(req.params.id);
	if (!account) {
		return res.status(404).json({ responseCode: "00", responseMessage: 'Account not found' });
	}

	account.bankName = bankName || account.bankName;
	account.accountName = accountName || account.accountName;
	account.accountNumber = accountNumber || account.accountNumber;
	account.accountType = accountType || account.accountType;
	account.status = status || account.status;
	account.updatedAt = Date.now();

	const updatedAccount = await account.save();
	res.status(200).json({
		responseCode: "00",
		responseMessage: 'Account updated successfully',
		responseData: updatedAccount,
	});
});

// Delete an account
exports.deleteAccount = asyncHandler(async (req, res) => {
	const account = await Account.findById(req.params.id);

	if (!account) {
		return res.status(404).json({ responseCode: "22", responseMessage: 'Account not found' });
	}

	await account.deleteOne();
	res.status(200).json({ responseCode: "00", responseMessage: 'Account deleted successfully' });
});
