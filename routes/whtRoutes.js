const express = require('express');
const router = express.Router();
const {
    createWHT,
    updateWHT,
    getAllWHT,
    getWHTBySource,
    getWHTReport,
    getWHTSummary,
    softDeleteWHT,
    getWHTBySourceId,
    payWHT
} = require('../controllers/whtController');
const { protect, authorize } = require('../middlewares/authMiddleware');
const { validateObjectId } = require('../middlewares/errorMiddleware');

// WHT Routes
router.post('/create', protect, createWHT);
router.put('/update/:id', protect, authorize('superadmin', 'admin', 'backOffice'), validateObjectId('id'), updateWHT);
router.get('/read', protect, getAllWHT);
router.get('/by-source/:sourceType', protect, getWHTBySource);
router.post('/report', protect, getWHTReport);
router.get('/summary', protect, getWHTSummary);
router.delete('/delete/:id', protect, authorize('superadmin', 'admin', 'backOffice'), validateObjectId('id'), softDeleteWHT);
router.get('/by-source-id/:sourceId', protect, validateObjectId('sourceId'), getWHTBySourceId);
router.post('/pay', protect, authorize('superadmin', 'admin', 'backOffice'), payWHT);

module.exports = router;