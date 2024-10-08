const express = require('express');
const router = express.Router();
const {
	getAllServices,
	getServiceById,
	createService,
	updateService,
	deleteService,
	generateServiceInvoice,
	trackServiceStatus,
	sendPaymentReminder,
	generateServiceReceipt
} = require('../controllers/serviceController');
const { protect } = require('../middlewares/authMiddleware');
const {validateObjectId} = require('../middlewares/errorMiddleware');

// @desc    Get all services
// @route   GET /api/services
// @access  Private
router.get('/', protect, getAllServices);

// @desc    Get service by ID
// @route   GET /api/services/:id
// @access  Private
router.get('read-by-id/:id', protect, validateObjectId('id'), getServiceById);

// @desc    Create a new service
// @route   POST /api/services
// @access  Private
router.post('/', protect, createService);

// @desc    Update a service
// @route   PUT /api/services/:id
// @access  Private
router.put('/update/:id', protect, validateObjectId('id'), updateService);

// @desc    Delete a service
// @route   DELETE /api/services/:id
// @access  Private
router.delete('/delete/:id', protect, validateObjectId('id'), deleteService);

// @desc    Generate and send service invoice PDF
// @route   POST /api/services/generateInvoice/:id
// @access  Private
router.post('/generateInvoice/:id', protect, validateObjectId('id'), generateServiceInvoice);

// @desc    Track service status
// @route   GET /api/services/trackStatus/:id
// @access  Private
router.get('/trackStatus/:id', protect, validateObjectId('id'), trackServiceStatus);

// @desc    Send payment reminder for unpaid services
// @route   POST /api/services/sendReminder/:id
// @access  Private
router.post('/sendReminder/:id', protect, validateObjectId('id'), sendPaymentReminder);

// @desc    Generate and send payment receipt for a paid service
// @route   POST /api/services/generateReceipt/:id
// @access  Private
router.post('/generateReceipt/:id', protect, validateObjectId('id'), generateServiceReceipt);

module.exports = router;
