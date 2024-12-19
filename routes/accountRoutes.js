const express = require('express');
const {
	createAccount,
	getAccounts,
	getAccountById,
	updateAccount,
	deleteAccount,
} = require('../controllers/accountController');
const { protect, authorize} = require('../middlewares/authMiddleware');

const router = express.Router();

router.route('/')
	.post(protect, authorize('superadmin', 'admin', 'frontOffice'), createAccount) // Only authenticated users can create accounts
	.get(protect, getAccounts); // Only authenticated users can view accounts

router.route('/:id')
	.get(protect, getAccountById) // Get a single account by ID
	.put(protect, authorize('superadmin', 'admin', 'backOffice'), updateAccount) // Update account details
	.delete(protect, authorize('superadmin', 'admin'), deleteAccount); // Only admins can delete accounts

module.exports = router;
