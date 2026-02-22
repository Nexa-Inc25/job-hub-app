/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * FieldLedger - Notification Service
 * Centralized service for sending real-time notifications
 * 
 * Features:
 * - Delivery receipts (tracks if client received notification)
 * - Retry for failed WebSocket pushes (falls back to polling)
 * - Offline queue (delivers on reconnect)
 * - Notification grouping (collapses 5+ same-type notifications)
 */

const Notification = require('../models/Notification');

// Socket.io instance - set by server.js
let io = null;

// Pending deliveries awaiting acknowledgement
const pendingDeliveries = new Map();

// Retry configuration
const DELIVERY_RETRY_MAX = 3;
const DELIVERY_RETRY_DELAY_MS = 5000;

// Grouping threshold
const GROUP_THRESHOLD = 5;
const GROUP_WINDOW_MS = 60 * 1000; // 1 minute window for grouping

/**
 * Initialize the notification service with socket.io instance
 */
function initialize(socketIo) {
  io = socketIo;
  console.log('[NotificationService] Initialized with Socket.IO');

  // Listen for delivery receipts from clients
  if (io) {
    io.on('connection', (socket) => {
      socket.on('notification:ack', (data) => {
        handleDeliveryReceipt(data.notificationId, socket.userId);
      });

      // Deliver queued notifications on reconnect
      socket.on('notification:request_pending', () => {
        deliverPendingNotifications(socket.userId, socket);
      });
    });
  }
}

/**
 * Handle delivery receipt from client
 */
async function handleDeliveryReceipt(notificationId, userId) {
  try {
    const key = `${notificationId}:${userId}`;
    const pending = pendingDeliveries.get(key);
    if (pending) {
      clearTimeout(pending.retryTimeout);
      pendingDeliveries.delete(key);
    }

    // Mark as delivered in database
    await Notification.findOneAndUpdate(
      { _id: notificationId, userId },
      { deliveredAt: new Date(), deliveryStatus: 'delivered' }
    );
  } catch (error) {
    console.error('[NotificationService] Delivery receipt error:', error);
    // Fail silently per coding conventions
  }
}

/**
 * Deliver pending notifications for a user who just reconnected
 */
async function deliverPendingNotifications(userId, socket) {
  try {
    if (!userId || !socket) return;

    const pending = await Notification.find({
      userId,
      deliveryStatus: { $in: ['pending', 'failed', null] },
      read: false,
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    if (pending.length > 0) {
      console.log(`[NotificationService] Delivering ${pending.length} pending notifications to user ${userId}`);

      // Group if too many of the same type
      const grouped = groupNotifications(pending);

      for (const notification of grouped) {
        socket.emit('notification', {
          id: notification._id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          data: notification.data,
          createdAt: notification.createdAt,
          grouped: notification._grouped || false,
          groupCount: notification._groupCount || 1,
        });
      }
    }
  } catch (error) {
    console.error('[NotificationService] Pending delivery error:', error);
    // Fail silently
  }
}

/**
 * Group notifications by type when there are 5+ of the same type
 * within the grouping time window
 */
function groupNotifications(notifications) {
  const byType = {};
  const result = [];

  for (const n of notifications) {
    const key = n.type;
    if (!byType[key]) {
      byType[key] = [];
    }
    byType[key].push(n);
  }

  for (const [type, items] of Object.entries(byType)) {
    if (items.length >= GROUP_THRESHOLD) {
      // Check if items are within the grouping window
      const newest = new Date(items[0].createdAt).getTime();
      const oldest = new Date(items[items.length - 1].createdAt).getTime();
      const withinWindow = (newest - oldest) <= GROUP_WINDOW_MS;

      if (withinWindow) {
        // Collapse into a single grouped notification
        result.push({
          ...items[0],
          title: `${items.length} ${type.replaceAll('_', ' ')} notifications`,
          message: `You have ${items.length} new ${type.replaceAll('_', ' ')} notifications`,
          _grouped: true,
          _groupCount: items.length,
        });
      } else {
        // Not within window, keep them separate
        result.push(...items);
      }
    } else {
      result.push(...items);
    }
  }

  return result;
}

/**
 * Emit notification via WebSocket with retry logic
 */
function emitWithRetry(userId, notification, attempt = 0) {
  if (!io) return;

  const key = `${notification._id}:${userId}`;
  
  try {
    io.to(`user:${userId}`).emit('notification', {
      id: notification._id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      data: notification.data,
      createdAt: notification.createdAt,
    });

    // Track delivery and set retry timeout
    if (attempt < DELIVERY_RETRY_MAX) {
      const retryTimeout = setTimeout(async () => {
        // Check if delivery was acknowledged
        if (pendingDeliveries.has(key)) {
          console.warn(`[NotificationService] Delivery not acked for ${notification._id}, retry #${attempt + 1}`);
          
          // Check if user is still connected
          const sockets = await io.in(`user:${userId}`).fetchSockets();
          if (sockets.length > 0) {
            emitWithRetry(userId, notification, attempt + 1);
          } else {
            // User disconnected — mark as pending for reconnect delivery
            pendingDeliveries.delete(key);
            await Notification.findByIdAndUpdate(notification._id, {
              deliveryStatus: 'pending',
            }).catch(() => {});
          }
        }
      }, DELIVERY_RETRY_DELAY_MS);

      pendingDeliveries.set(key, { notification, attempt, retryTimeout });
    } else {
      // Max retries reached — mark as failed
      pendingDeliveries.delete(key);
      Notification.findByIdAndUpdate(notification._id, {
        deliveryStatus: 'failed',
      }).catch(() => {});
    }
  } catch (error) {
    console.error('[NotificationService] Emit error:', error);
    // Fail silently per coding conventions
  }
}

/**
 * Send a notification to a specific user
 * @param {Object} options
 * @param {string} options.userId - Target user ID
 * @param {string} options.companyId - Company context
 * @param {string} options.type - Notification type
 * @param {string} options.title - Notification title
 * @param {string} options.message - Notification message
 * @param {Object} options.data - Additional data (jobId, woNumber, etc.)
 */
async function notifyUser({ userId, companyId, type, title, message, data = {}, link }) {
  try {
    const notificationData = link ? { ...data, link } : data;

    const notification = await Notification.create({
      userId,
      companyId,
      type,
      title,
      message,
      data: notificationData,
      deliveryStatus: 'pending',
    });

    // Emit via WebSocket with retry logic
    emitWithRetry(userId, notification);

    return notification;
  } catch (error) {
    console.error('[NotificationService] Error sending notification:', error);
    throw error;
  }
}

/**
 * Send a notification to all users in a company
 * @param {Object} options
 * @param {string} options.companyId - Target company ID
 * @param {string} options.type - Notification type
 * @param {string} options.title - Notification title
 * @param {string} options.message - Notification message
 * @param {Object} options.data - Additional data
 * @param {string[]} options.roles - Optional: only notify users with these roles
 */
async function notifyCompany({ companyId, type, title, message, data = {}, roles = null }) {
  try {
    const User = require('../models/User');
    
    // Find all users in the company
    const query = { companyId };
    if (roles && roles.length > 0) {
      query.role = { $in: roles };
    }
    
    const users = await User.find(query).select('_id').lean();
    
    // Create notifications for each user
    const notifications = await Promise.all(
      users.map(user => 
        notifyUser({
          userId: user._id,
          companyId,
          type,
          title,
          message,
          data
        })
      )
    );

    return notifications;
  } catch (error) {
    console.error('[NotificationService] Error sending company notification:', error);
    throw error;
  }
}

/**
 * Send a notification to all stakeholders of a job
 * @param {Object} options
 * @param {Object} options.job - Job document (with assignedToGF, assignedTo populated)
 * @param {string} options.type - Notification type
 * @param {string} options.title - Notification title
 * @param {string} options.message - Notification message
 * @param {Object} options.data - Additional data
 * @param {string[]} options.excludeUserIds - User IDs to exclude (e.g., the actor)
 */
async function notifyJobStakeholders({ job, type, title, message, data = {}, excludeUserIds = [] }) {
  try {
    const stakeholderIds = new Set();
    
    // Add GF assigned to job
    if (job.assignedToGF) {
      stakeholderIds.add(job.assignedToGF.toString());
    }
    
    // Add foreman/crew assigned
    if (job.assignedTo) {
      stakeholderIds.add(job.assignedTo.toString());
    }
    
    // Add assigned by (usually PM)
    if (job.assignedBy) {
      stakeholderIds.add(job.assignedBy.toString());
    }
    
    // Remove excluded users
    excludeUserIds.forEach(id => stakeholderIds.delete(id.toString()));
    
    // Enrich data with job info
    const enrichedData = {
      ...data,
      jobId: job._id,
      woNumber: job.woNumber
    };
    
    // Send to all stakeholders
    const notifications = await Promise.all(
      Array.from(stakeholderIds).map(userId =>
        notifyUser({
          userId,
          companyId: job.companyId,
          type,
          title,
          message,
          data: enrichedData
        })
      )
    );

    return notifications;
  } catch (error) {
    console.error('[NotificationService] Error notifying job stakeholders:', error);
    throw error;
  }
}

// ==========================================
// Specific Notification Helpers
// ==========================================

/**
 * Notify GF when a unit is approved
 */
async function notifyUnitApproved({ job, unitEntry, approvedBy }) {
  if (!job.assignedToGF) {
    console.log('[NotificationService] No GF assigned to job, skipping notification');
    return null;
  }

  return notifyUser({
    userId: job.assignedToGF,
    companyId: job.companyId,
    type: 'unit_approved',
    title: 'Unit Approved',
    message: `Unit ${unitEntry.unitCode} on WO ${job.woNumber} has been approved`,
    data: {
      jobId: job._id,
      unitEntryId: unitEntry._id,
      woNumber: job.woNumber,
      actorId: approvedBy._id,
      actorName: approvedBy.name
    }
  });
}

/**
 * Notify GF when a unit is rejected
 */
async function notifyUnitRejected({ job, unitEntry, rejectedBy, reason }) {
  if (!job.assignedToGF) {
    console.log('[NotificationService] No GF assigned to job, skipping notification');
    return null;
  }

  return notifyUser({
    userId: job.assignedToGF,
    companyId: job.companyId,
    type: 'unit_rejected',
    title: 'Unit Rejected',
    message: `Unit ${unitEntry.unitCode} on WO ${job.woNumber} was rejected: ${reason}`,
    data: {
      jobId: job._id,
      unitEntryId: unitEntry._id,
      woNumber: job.woNumber,
      rejectionReason: reason,
      actorId: rejectedBy._id,
      actorName: rejectedBy.name
    }
  });
}

/**
 * Notify PMs and assigned GF when a unit is submitted
 */
async function notifyUnitSubmitted({ job, unitEntry, submittedBy }) {
  const notifications = [];
  
  // Notify assigned GF
  if (job.assignedToGF && job.assignedToGF.toString() !== submittedBy._id.toString()) {
    notifications.push(
      notifyUser({
        userId: job.assignedToGF,
        companyId: job.companyId,
        type: 'unit_submitted',
        title: 'Unit Submitted for Review',
        message: `${submittedBy.name} submitted unit ${unitEntry.unitCode} on WO ${job.woNumber}`,
        data: {
          jobId: job._id,
          unitEntryId: unitEntry._id,
          woNumber: job.woNumber,
          actorId: submittedBy._id,
          actorName: submittedBy.name
        }
      })
    );
  }
  
  // Notify company PMs
  const pmNotifications = await notifyCompany({
    companyId: job.companyId,
    type: 'unit_submitted',
    title: 'Unit Submitted for Review',
    message: `${submittedBy.name} submitted unit ${unitEntry.unitCode} on WO ${job.woNumber}`,
    data: {
      jobId: job._id,
      unitEntryId: unitEntry._id,
      woNumber: job.woNumber,
      actorId: submittedBy._id,
      actorName: submittedBy.name
    },
    roles: ['pm', 'admin']
  });
  
  notifications.push(...pmNotifications);
  return notifications;
}

/**
 * Notify relevant GFs when a claim is created
 */
async function notifyClaimCreated({ claim, createdBy }) {
  const Job = require('../models/Job');
  
  // Get unique GFs from all jobs in the claim
  const jobs = await Job.find({ 
    _id: { $in: claim.jobs || [] } 
  }).select('assignedToGF companyId').lean();
  
  const gfIds = new Set();
  jobs.forEach(job => {
    if (job.assignedToGF) {
      gfIds.add(job.assignedToGF.toString());
    }
  });
  
  // Remove creator if they're a GF
  gfIds.delete(createdBy._id.toString());
  
  const notifications = await Promise.all(
    Array.from(gfIds).map(gfId =>
      notifyUser({
        userId: gfId,
        companyId: claim.companyId,
        type: 'claim_created',
        title: 'New Claim Created',
        message: `${createdBy.name} created claim ${claim.claimNumber || claim._id}`,
        data: {
          claimId: claim._id,
          actorId: createdBy._id,
          actorName: createdBy.name
        }
      })
    )
  );

  return notifications;
}

/**
 * Notify user when they're assigned to a job
 */
async function notifyJobAssigned({ job, assignedTo, assignedBy }) {
  return notifyUser({
    userId: assignedTo._id || assignedTo,
    companyId: job.companyId,
    type: 'job_assigned',
    title: 'Job Assigned to You',
    message: `You've been assigned to WO ${job.woNumber}`,
    data: {
      jobId: job._id,
      woNumber: job.woNumber,
      actorId: assignedBy._id,
      actorName: assignedBy.name
    }
  });
}

/**
 * Notify job stakeholders when a document is uploaded
 */
async function notifyDocumentUploaded({ job, document, uploadedBy }) {
  return notifyJobStakeholders({
    job,
    type: 'document_uploaded',
    title: 'New Document Uploaded',
    message: `${uploadedBy.name} uploaded "${document.name}" to WO ${job.woNumber}`,
    data: {
      documentId: document._id?.toString() || document.r2Key,
      documentName: document.name,
      actorId: uploadedBy._id,
      actorName: uploadedBy.name
    },
    excludeUserIds: [uploadedBy._id]
  });
}

/**
 * Get unread notification count for a user
 */
async function getUnreadCount(userId) {
  return Notification.countDocuments({ userId, read: false });
}

/**
 * Get notifications for a user
 */
async function getNotifications(userId, { limit = 20, skip = 0 } = {}) {
  return Notification.find({ userId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
}

/**
 * Mark a notification as read
 */
async function markAsRead(notificationId, userId) {
  return Notification.findOneAndUpdate(
    { _id: notificationId, userId },
    { read: true, readAt: new Date() },
    { new: true }
  );
}

/**
 * Mark all notifications as read for a user
 */
async function markAllAsRead(userId) {
  return Notification.updateMany(
    { userId, read: false },
    { read: true, readAt: new Date() }
  );
}

// Legacy aliases for cross-domain contract
const createNotification = notifyUser;

module.exports = {
  initialize,
  createNotification,
  notifyUser,
  notifyCompany,
  notifyJobStakeholders,
  notifyUnitApproved,
  notifyUnitRejected,
  notifyUnitSubmitted,
  notifyClaimCreated,
  notifyJobAssigned,
  notifyDocumentUploaded,
  getUnreadCount,
  getNotifications,
  markAsRead,
  markAllAsRead,
  // New exports
  groupNotifications,
  handleDeliveryReceipt,
  deliverPendingNotifications,
};
