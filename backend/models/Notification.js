/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * FieldLedger - Notification Model
 * Real-time notification storage for users
 */

const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  // Who receives this notification
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true 
  },
  
  // Company context for multi-tenant filtering
  companyId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Company',
    index: true 
  },
  
  // Notification type for filtering and icon display
  type: {
    type: String,
    enum: [
      'unit_approved',
      'unit_rejected', 
      'unit_submitted',
      'claim_created',
      'job_assigned',
      'job_status_changed',
      'document_uploaded',
      'mention',
      'system'
    ],
    required: true,
    index: true
  },
  
  // Display content
  title: { type: String, required: true },
  message: { type: String, required: true },
  
  // Additional data for navigation/context
  data: {
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job' },
    unitEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'UnitEntry' },
    claimId: { type: mongoose.Schema.Types.ObjectId, ref: 'Claim' },
    documentId: String,
    woNumber: String,
    rejectionReason: String,
    // Who triggered this notification
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    actorName: String
  },
  
  // Read status
  read: { type: Boolean, default: false, index: true },
  readAt: Date,
  
  // Delivery tracking
  deliveryStatus: { 
    type: String, 
    enum: ['pending', 'delivered', 'failed'],
    default: 'pending',
  },
  deliveredAt: Date,
  
  // Timestamps
  createdAt: { type: Date, default: Date.now, index: true },
  
  // Auto-expire old notifications (90 days)
  expiresAt: { 
    type: Date, 
    default: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
  }
});

// Compound index for efficient unread count queries
notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

// Compound index for listing notifications
notificationSchema.index({ userId: 1, createdAt: -1 });

// TTL index to automatically delete expired notifications
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Notification', notificationSchema);

