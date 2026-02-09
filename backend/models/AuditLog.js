/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
const mongoose = require('mongoose');

/**
 * Audit Log Model
 * 
 * Tracks all security-relevant actions for PG&E/NERC compliance:
 * - Document access, uploads, downloads, deletions
 * - User authentication events
 * - Permission changes
 * - Data exports
 * 
 * Retention: 7 years per PG&E Exhibit 5 requirements
 */
const auditLogSchema = new mongoose.Schema({
  // When the action occurred
  // Note: TTL index defined below handles indexing + auto-deletion
  timestamp: {
    type: Date,
    default: Date.now,
    required: true,
  },
  
  // Who performed the action
  // Note: indexed via compound index userId_1_timestamp_-1
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  userEmail: String,
  userName: String,
  userRole: String,
  
  // Company for multi-tenant isolation
  // Note: indexed via compound index companyId_1_timestamp_-1
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company'
  },
  
  // What action was performed
  action: {
    type: String,
    required: true,
    enum: [
      // Authentication
      'LOGIN_SUCCESS',
      'LOGIN_FAILED',
      'LOGOUT',
      'PASSWORD_CHANGE',
      'PASSWORD_RESET_REQUEST',
      'MFA_ENABLED',
      'MFA_DISABLED',
      'ACCOUNT_LOCKED',
      'ACCOUNT_UNLOCKED',
      
      // Document actions
      'DOCUMENT_VIEW',
      'DOCUMENT_DOWNLOAD',
      'DOCUMENT_UPLOAD',
      'DOCUMENT_DELETE',
      'DOCUMENT_EDIT',
      'DOCUMENT_APPROVE',
      'DOCUMENT_REJECT',
      'DOCUMENT_EXPORT',
      
      // Job/Work Order actions
      'JOB_CREATE',
      'JOB_UPDATE',
      'JOB_DELETE',
      'JOB_STATUS_CHANGE',
      'JOB_ASSIGN',
      'JOB_REVIEW',
      
      // Photo actions
      'PHOTO_UPLOAD',
      'PHOTO_DELETE',
      'PHOTO_EXPORT',
      
      // User management
      'USER_CREATE',
      'USER_UPDATE',
      'USER_DELETE',
      'USER_ROLE_CHANGE',
      'USER_PERMISSION_CHANGE',
      
      // Data export/sharing
      'DATA_EXPORT',
      'EMAIL_SHARE',
      'BULK_DOWNLOAD',
      
      // Security events
      'SUSPICIOUS_ACTIVITY',
      'RATE_LIMIT_EXCEEDED',
      'UNAUTHORIZED_ACCESS_ATTEMPT',
      'API_KEY_CREATED',
      'API_KEY_REVOKED'
    ]
    // Note: indexed via compound index action_1_timestamp_-1
  },
  
  // What resource was affected
  resourceType: {
    type: String,
    enum: ['user', 'job', 'document', 'photo', 'folder', 'company', 'system', null]
  },
  resourceId: {
    type: mongoose.Schema.Types.ObjectId
  },
  resourceName: String,
  
  // Additional context
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Request metadata
  ipAddress: String,
  userAgent: String,
  requestMethod: String,
  requestPath: String,
  
  // Result
  success: {
    type: Boolean,
    default: true
  },
  errorMessage: String,
  
  // For compliance queries
  category: {
    type: String,
    enum: ['authentication', 'authorization', 'data_access', 'data_modification', 'security', 'admin'],
    index: true
  },
  
  // Severity for alerting
  severity: {
    type: String,
    enum: ['info', 'warning', 'critical'],
    default: 'info'
  }
}, {
  timestamps: false, // We use our own timestamp field
  collection: 'audit_logs'
});

// Compound indexes for common queries
auditLogSchema.index({ companyId: 1, timestamp: -1 });
auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ resourceType: 1, resourceId: 1, timestamp: -1 });
auditLogSchema.index({ severity: 1, timestamp: -1 });

// TTL index for automatic cleanup after 7 years (per PG&E requirements)
// 7 years = 2557 days
auditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 2557 * 24 * 60 * 60 });

// Static method to log an action
auditLogSchema.statics.log = async function(data) {
  try {
    const log = new this(data);
    await log.save();
    
    // If critical severity, could trigger alerts here
    if (data.severity === 'critical') {
      console.error('[SECURITY ALERT]', data.action, data.details);
      // Future: Send to monitoring service, email admins, etc.
    }
    
    return log;
  } catch (err) {
    // Audit logging should never break the main flow
    console.error('Audit log error:', err.message);
    return null;
  }
};

// Helper to determine category from action
auditLogSchema.statics.getCategoryForAction = function(action) {
  if (action.startsWith('LOGIN') || action.startsWith('LOGOUT') || action.startsWith('PASSWORD') || action.startsWith('MFA')) {
    return 'authentication';
  }
  if (action.includes('UNAUTHORIZED') || action.includes('PERMISSION')) {
    return 'authorization';
  }
  if (action.includes('VIEW') || action.includes('DOWNLOAD') || action.includes('EXPORT')) {
    return 'data_access';
  }
  if (action.includes('CREATE') || action.includes('UPDATE') || action.includes('DELETE') || action.includes('UPLOAD') || action.includes('EDIT')) {
    return 'data_modification';
  }
  if (action.includes('SUSPICIOUS') || action.includes('RATE_LIMIT') || action.includes('LOCKED')) {
    return 'security';
  }
  if (action.includes('USER_') || action.includes('API_KEY')) {
    return 'admin';
  }
  return 'data_access';
};

module.exports = mongoose.model('AuditLog', auditLogSchema);

