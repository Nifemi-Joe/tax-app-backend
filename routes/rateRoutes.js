const express = require('express');
const router = express.Router();
const {
	createRate,
	updateRate,
	getCurrentRate,
	getRateHistory,
	softDeleteRate,
	getAllActiveRates
} = require('../controllers/RateController');

// @route   POST /api/rates
// @desc    Create a new rate
// @access  Private
router.post('/', createRate);

// @route   PUT /api/rates/:id
// @desc    Update existing rate
// @access  Private
router.put('/:id', updateRate);

// @route   GET /api/rates/current
// @desc    Get the current/latest rate
// @access  Private
router.get('/current', getCurrentRate);

// @route   GET /api/rates/history
// @desc    Get the rate history
// @access  Private
router.get('/history', getRateHistory);

// @route   PUT /api/rates/:id/delete
// @desc    Soft delete a rate
// @access  Private
router.put('/:id/delete', softDeleteRate);

// @route   GET /api/rates
// @desc    Get all active rates (not deleted)
// @access  Private
router.get('/read', getAllActiveRates);

module.exports = router;
