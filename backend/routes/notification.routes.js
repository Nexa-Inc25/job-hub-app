/**
 * FieldLedger - Notification Routes
 * REST API for managing user notifications
 */

const express = require('express');
const router = express.Router();
const { param, query } = require('express-validator');
const notificationService = require('../services/notification.service');
const asyncHandler = require('../middleware/asyncHandler');

// All routes require authentication (applied in server.js)

/**
 * GET /api/notifications
 * Get paginated list of notifications for the current user
 */
router.get('/',
  [
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('skip').optional().isInt({ min: 0 }).toInt()
  ],
  asyncHandler(async (req, res) => {
    const limit = req.query.limit || 20;
    const skip = req.query.skip || 0;
    
    const notifications = await notificationService.getNotifications(req.userId, { limit, skip });
    const unreadCount = await notificationService.getUnreadCount(req.userId);
    
    res.json({
      notifications,
      unreadCount,
      pagination: {
        limit,
        skip,
        hasMore: notifications.length === limit
      }
    });
  })
);

/**
 * GET /api/notifications/unread/count
 * Get unread notification count for the current user
 */
router.get('/unread/count',
  asyncHandler(async (req, res) => {
    const count = await notificationService.getUnreadCount(req.userId);
    res.json({ count });
  })
);

/**
 * PUT /api/notifications/:id/read
 * Mark a specific notification as read
 */
router.put('/:id/read',
  [
    param('id').isMongoId().withMessage('Invalid notification ID')
  ],
  asyncHandler(async (req, res) => {
    const notification = await notificationService.markAsRead(req.params.id, req.userId);
    
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    res.json({ success: true, notification });
  })
);

/**
 * PUT /api/notifications/read-all
 * Mark all notifications as read for the current user
 */
router.put('/read-all',
  asyncHandler(async (req, res) => {
    const result = await notificationService.markAllAsRead(req.userId);
    
    res.json({ 
      success: true, 
      modifiedCount: result.modifiedCount 
    });
  })
);

module.exports = router;

