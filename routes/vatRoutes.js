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
	getAllVATS,
	deleteVAT
} = require('../controllers/vatController');
const {protect, authorize, authorizePermissions} = require("../middlewares/authMiddleware");
// const { protect, admin } = require('../middleware/authMiddleware'); // Assuming you have authentication middleware

// Create a new VAT rate
router.post('/', protect,authorize('superadmin', 'admin', 'clientAdmin'), authorizePermissions('create-vat'), createVAT);

// Update an existing VAT rate
router.put('/update/:id',  protect,authorize('superadmin', 'admin', 'clientAdmin'), authorizePermissions('update-vat'),updateVAT);

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
router.get('/read', getAllVATS);

router.delete('/delete/:id',  protect,authorize('superadmin', 'admin', 'clientAdmin'), authorizePermissions('delete-vat'), deleteVAT);


module.exports = router;
