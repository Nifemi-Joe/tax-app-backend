const express = require('express');
const router = express.Router();
const {
	createRate,
	updateRate,
	getCurrentRate,
	getRateHistory,
	softDeleteRate,
	getAllActiveRates
} = require('../controllers/rateController');
const {validateObjectId} = require('../middlewares/errorMiddleware');
const {authorize, authorizePermissions, protect} = require("../middlewares/authMiddleware");

// @route   POST /api/rates
// @desc    Create a new rate
// @access  Private
router.post('/create', protect,authorize('superadmin', 'admin', 'clientAdmin'), authorizePermissions('create-rate'), createRate);

// @route   PUT /api/rates/:id
// @desc    Update existing rate
// @access  Private
router.put('/update/:id', protect, authorize('superadmin', 'admin', 'clientAdmin'), authorizePermissions('update-rate'), validateObjectId('id') , updateRate);

// @route   GET /api/rates/current
// @desc    Get the current/latest rate
// @access  Private
router.get('/current', protect,getCurrentRate);

// @route   GET /api/rates/history
// @desc    Get the rate history
// @access  Private
router.get('/history', protect,getRateHistory);

// @route   PUT /api/rates/:id/delete
// @desc    Soft delete a rate
// @access  Private
router.put('/delete/:id', protect,authorize('superadmin', 'admin', 'clientAdmin'), authorizePermissions('delete-rate'),  validateObjectId('id'), softDeleteRate);

// @route   GET /api/rates
// @desc    Get all active rates (not deleted)
// @access  Private
router.get('/read', protect,getAllActiveRates);

module.exports = router;
