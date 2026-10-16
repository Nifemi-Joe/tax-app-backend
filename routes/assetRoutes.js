const express = require('express');
const asyncHandler = require('express-async-handler');
const rateLimit = require('express-rate-limit');
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/authMiddleware');
const assetController = require('../controllers/assetController');

const router = express.Router();

// ============================================================================
// RATE LIMITERS
// ============================================================================

const readLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 240,
  message: 'Too many read requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.user && ['admin', 'superadmin'].includes(req.user.role),
});

const writeLimit = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 40,
  message: 'Too many write requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.user && ['admin', 'superadmin'].includes(req.user.role),
});

const heavyLimit = rateLimit({
  windowMs: 1 * 60 * 60 * 1000, // 1 hour
  max: 6,
  message: 'Too many heavy operations, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.user && ['admin', 'superadmin'].includes(req.user.role),
});

// ============================================================================
// ROUTES - ORDER MATTERS: Specific routes BEFORE parameterized routes
// ============================================================================

// ---- METADATA & STATS (specific routes first) ----

/**
 * @route   GET /api/assets/meta
 * @desc    Get asset metadata (categories, classifications, statuses)
 * @access  Private
 */
router.get(
    '/meta',
    protect,
    readLimit,
    asyncHandler(assetController.meta)
);

/**
 * @route   GET /api/assets/stats
 * @desc    Get asset statistics
 * @access  Private
 */
router.get(
    '/stats',
    protect,
    readLimit,
    asyncHandler(assetController.getStats)
);

/**
 * @route   GET /api/assets/data-quality
 * @desc    Get data quality report
 * @access  Private
 */
router.get(
    '/data-quality',
    protect,
    readLimit,
    asyncHandler(assetController.dataQuality)
);

/**
 * @route   GET /api/assets/export/csv
 * @desc    Export assets to CSV
 * @access  Private
 */
router.get(
    '/export/csv',
    protect,
    readLimit,
    heavyLimit,
    asyncHandler(assetController.exportCsv)
);

// ---- NOTIFICATIONS (specific routes) ----

/**
 * @route   GET /api/assets/notifications/mine
 * @desc    Get current user's notifications
 * @access  Private
 */
router.get(
    '/notifications/mine',
    protect,
    readLimit,
    asyncHandler(assetController.myNotifications)
);

/**
 * @route   PUT /api/assets/notifications/all/read
 * @desc    Mark all notifications as read
 * @access  Private
 */
router.put(
    '/notifications/all/read',
    protect,
    writeLimit,
    asyncHandler(assetController.markAllRead)
);

/**
 * @route   PUT /api/assets/notifications/:id/read
 * @desc    Mark notification as read
 * @access  Private
 */
router.put(
    '/notifications/:id/read',
    protect,
    writeLimit,
    asyncHandler(assetController.markRead)
);

/**
 * @route   PUT /api/assets/notifications/:id/ack
 * @desc    Acknowledge notification
 * @access  Private
 */
router.put(
    '/notifications/:id/ack',
    protect,
    writeLimit,
    asyncHandler(assetController.acknowledge)
);

// ---- SCAN (specific route) ----

/**
 * @route   POST /api/assets/scan
 * @desc    Run lifecycle scan
 * @access  Private (Admin only)
 */
router.post(
    '/scan',
    protect,
    authorize('admin', 'superadmin'),
    heavyLimit,
    asyncHandler(assetController.runScan)
);

// ---- COLLECTION ROUTES (generic CRUD) ----

/**
 * @route   GET /api/assets
 * @desc    List all assets
 * @access  Private
 */
router.get(
    '/',
    protect,
    readLimit,
    asyncHandler(assetController.listAssets)
);

/**
 * @route   POST /api/assets
 * @desc    Create new asset
 * @access  Private (Admin/Manager only)
 */
router.post(
    '/',
    protect,
    authorize('admin', 'manager', 'superadmin'),
    writeLimit,
    asyncHandler(assetController.createAsset)
);

// ---- PARAMETERIZED ROUTES (with :id) - AFTER all specific routes ----

/**
 * @route   GET /api/assets/:id
 * @desc    Get asset by ID
 * @access  Private
 */
router.get(
    '/:id',
    protect,
    readLimit,
    asyncHandler(assetController.getAsset)
);

/**
 * @route   PUT /api/assets/:id
 * @desc    Update asset
 * @access  Private (Admin/Manager only)
 */
router.put(
    '/:id',
    protect,
    authorize('admin', 'manager', 'superadmin'),
    writeLimit,
    asyncHandler(assetController.updateAsset)
);

/**
 * @route   DELETE /api/assets/:id
 * @desc    Archive asset (soft delete)
 * @access  Private (Admin only)
 */
router.delete(
    '/:id',
    protect,
    authorize('admin', 'superadmin'),
    writeLimit,
    asyncHandler(assetController.archiveAsset)
);

/**
 * @route   POST /api/assets/:id/lifecycle
 * @desc    Perform lifecycle action on asset
 * @access  Private (Admin/Manager only)
 */
router.post(
    '/:id/lifecycle',
    protect,
    authorize('admin', 'manager', 'superadmin'),
    writeLimit,
    asyncHandler(assetController.lifecycleAction)
);

/**
 * @route   POST /api/assets/:id/review
 * @desc    Review asset
 * @access  Private (Admin/Manager only)
 */
router.post(
    '/:id/review',
    protect,
    authorize('admin', 'manager', 'superadmin'),
    writeLimit,
    asyncHandler(assetController.reviewAsset)
);

/**
 * @route   GET /api/assets/:id/verify
 * @desc    Verify asset integrity chain
 * @access  Private
 */
router.get(
    '/:id/verify',
    protect,
    readLimit,
    asyncHandler(assetController.verifyAsset)
);

// ============================================================================
// ERROR HANDLER
// ============================================================================

router.use((err, req, res, next) => {
  console.error('Asset route error:', err);
  res.status(err.statusCode || 500).json({
    responseCode: '24',
    responseMessage: err.message || 'Internal server error',
  });
});

module.exports = router;