/**
 * @file notificationRoutes.js
 * @description Notification API routes
 */

const express = require('express');
const router = express.Router();
const { protect, authorizeRole, authorizePermissions } = require('../middlewares/authMiddleware');
const asyncHandler = require('express-async-handler');
const notificationService = require('../services/notificationService');
const Notification = require('../models/Notification');
const logger = require('../utils/logger');

// ============================================================
// IN-APP NOTIFICATIONS
// ============================================================

/**
 * Get user notifications
 * @route GET /api/notifications
 * @access Private
 */
router.get(
    '/',
    protect,
    asyncHandler(async (req, res) => {
        const { limit = 50, skip = 0 } = req.query;

        const result = await notificationService.getUserNotifications(
            req.user._id,
            parseInt(limit),
            parseInt(skip)
        );

        res.json({
            success: true,
            message: 'Notifications retrieved successfully',
            data: result.data,
            pagination: result.pagination,
        });
    })
);

/**
 * Get unread notification count
 * @route GET /api/notifications/unread/count
 * @access Private
 */
router.get(
    '/unread/count',
    protect,
    asyncHandler(async (req, res) => {
        const count = await Notification.countDocuments({
            userId: req.user._id,
            read: false,
        });

        res.json({
            success: true,
            unreadCount: count,
        });
    })
);

/**
 * Mark notification as read
 * @route PATCH /api/notifications/:id/read
 * @access Private
 */
router.patch(
    '/:id/read',
    protect,
    asyncHandler(async (req, res) => {
        const result = await notificationService.markAsRead(req.params.id);

        res.json({
            success: true,
            message: 'Notification marked as read',
            data: result.data,
        });
    })
);

/**
 * Mark all notifications as read
 * @route PATCH /api/notifications/read-all
 * @access Private
 */
router.patch(
    '/read-all',
    protect,
    asyncHandler(async (req, res) => {
        const result = await notificationService.markAllAsRead(req.user._id);

        res.json(result);
    })
);

/**
 * Delete notification
 * @route DELETE /api/notifications/:id
 * @access Private
 */
router.delete(
    '/:id',
    protect,
    asyncHandler(async (req, res) => {
        const result = await notificationService.deleteNotification(req.params.id);

        res.json({
            success: true,
            message: 'Notification deleted',
        });
    })
);

/**
 * Delete all notifications
 * @route DELETE /api/notifications/delete-all
 * @access Private
 */
router.delete(
    '/delete-all',
    protect,
    asyncHandler(async (req, res) => {
        await Notification.deleteMany({ userId: req.user._id });

        res.json({
            success: true,
            message: 'All notifications deleted',
        });
    })
);

// ============================================================
// ADMIN ENDPOINTS
// ============================================================

/**
 * Send bulk notification (Admin only)
 * @route POST /api/notifications/bulk
 * @access Private - Admin
 */
router.post(
    '/bulk',
    protect,
    authorizeRole('admin', 'superadmin'),
    asyncHandler(async (req, res) => {
        const { userIds, title, message, type = 'info' } = req.body;

        if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'userIds must be a non-empty array',
            });
        }

        const result = await notificationService.bulkSendNotifications(
            userIds,
            title,
            message,
            type
        );

        res.json({
            success: true,
            message: `Notifications sent to ${result.count} users`,
            data: result.data,
        });
    })
);

module.exports = router;