// routes/vatRoutes.js

const express = require('express');
const router = express.Router();
const {
	createVAT,
	updateVAT,
	printVATDetails,
	sendEmailAboutVAT,
	markVATAinactive,
	getActiveVATS,
	getInactiveVATS,
	getAllVATS
} = require('../controllers/vatController');
// const { protect, admin } = require('../middleware/authMiddleware'); // Assuming you have authentication middleware

// Create a new VAT rate
router.post('/', createVAT);

// Update an existing VAT rate
router.put('/:id', updateVAT);

// Print VAT rate details
router.get('/:id/print', printVATDetails);

// Send email about VAT rate (Optional)
router.post('/:id/send-email', sendEmailAboutVAT);

// Mark VAT rate as inactive
router.put('/:id/inactivate', markVATAinactive);

// Get list of active VAT rates
router.get('/active', getActiveVATS);

// Get list of inactive VAT rates
router.get('/inactive', getInactiveVATS);

// Get list of all VAT rates
router.get('/', getAllVATS);

module.exports = router;
