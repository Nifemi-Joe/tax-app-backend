const express = require('express');
const router = express.Router();
const {
    createTaxReturn,
    updateTaxReturn,
    getAllTaxReturns,
    getTaxReturnById,
    deleteTaxReturn,
    getTaxReturnsReport,
    getTaxReturnsSummary
} = require('../controllers/taxReturnController');

const { protect, authorize, authorizePermissions } = require('../middlewares/authMiddleware');
const { validateObjectId } = require('../middlewares/errorMiddleware');

// Get report - must be before /:id route
router.get('/report', protect, getTaxReturnsReport);

// Get summary statistics
router.get('/summary', protect, getTaxReturnsSummary);

// Create a new tax return
router.post('/', protect, authorize('superadmin', 'admin', 'frontOffice', 'backOffice'), createTaxReturn);

// Get all tax returns
router.get('/', protect, getAllTaxReturns);

// Get tax return by ID
router.get('/:id', protect, validateObjectId('id'), getTaxReturnById);

// Update tax return
router.put('/:id', protect, authorize('superadmin', 'admin', 'backOffice'), validateObjectId('id'), updateTaxReturn);

// Delete tax return (soft delete)
router.delete('/:id', protect, authorize('superadmin', 'admin'), validateObjectId('id'), deleteTaxReturn);

module.exports = router;