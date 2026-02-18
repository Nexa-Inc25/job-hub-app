/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Audit Logging Middleware
 * 
 * Provides functions to log security-relevant actions for PG&E compliance.
 * Used throughout the API to track document access, user actions, and security events.
 *
 * NERC CIP COMPLIANCE: Every helper is explicitly async and awaits the
 * database write. Callers MUST await these functions. Fire-and-forget
 * is a compliance violation — if the log isn't written, the event didn't happen.
 */

const AuditLog = require('../models/AuditLog');

/**
 * Extract request metadata for audit logs
 */
const getRequestMetadata = (req) => ({
  ipAddress: req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress,
  userAgent: req.headers['user-agent'],
  requestMethod: req.method,
  requestPath: req.originalUrl || req.path
});

/**
 * Get user info from request (set by auth middleware)
 */
const getUserInfo = (req) => ({
  userId: req.userId,
  userEmail: req.userEmail,
  userName: req.userName,
  userRole: req.userRole,
  companyId: req.companyId
});

/**
 * Log an audit event
 * 
 * @param {Object} req - Express request object
 * @param {String} action - Action type from AuditLog enum
 * @param {Object} options - Additional options
 * @returns {Promise} Resolves when log is persisted to database
 */
const logAudit = async (req, action, options = {}) => {
  const {
    resourceType = null,
    resourceId = null,
    resourceName = null,
    details = {},
    success = true,
    errorMessage = null,
    severity = 'info'
  } = options;

  const category = AuditLog.getCategoryForAction(action);
  const userInfo = getUserInfo(req);
  const requestMeta = getRequestMetadata(req);

  return await AuditLog.log({
    ...userInfo,
    ...requestMeta,
    action,
    resourceType,
    resourceId,
    resourceName,
    details,
    success,
    errorMessage,
    category,
    severity
  });
};

/**
 * Log authentication events
 * Note: Auth events happen before user is set on req, so we pass user info explicitly
 */
const logAuth = {
  loginSuccess: async (req, user) => {
    const requestMeta = getRequestMetadata(req);
    return await AuditLog.log({
      ...requestMeta,
      userId: user._id,
      userEmail: user.email,
      userName: user.name,
      userRole: user.role,
      companyId: user.companyId,
      action: 'LOGIN_SUCCESS',
      resourceType: 'user',
      resourceId: user._id,
      resourceName: user.email,
      category: 'authentication',
      severity: 'info',
      details: { role: user.role, isAdmin: user.isAdmin }
    });
  },

  loginFailed: async (req, email, reason) => {
    const requestMeta = getRequestMetadata(req);
    return await AuditLog.log({
      ...requestMeta,
      userEmail: email,
      action: 'LOGIN_FAILED',
      resourceType: 'user',
      resourceName: email,
      category: 'authentication',
      severity: 'warning',
      success: false,
      errorMessage: reason,
      details: { email, reason }
    });
  },

  logout: async (req) => await logAudit(req, 'LOGOUT'),

  passwordChange: async (req, userId) => await logAudit(req, 'PASSWORD_CHANGE', {
    resourceType: 'user',
    resourceId: userId,
    severity: 'warning'
  }),

  accountLocked: async (req, email, attempts) => {
    const requestMeta = getRequestMetadata(req);
    return await AuditLog.log({
      ...requestMeta,
      userEmail: email,
      action: 'ACCOUNT_LOCKED',
      resourceType: 'user',
      resourceName: email,
      category: 'security',
      severity: 'critical',
      details: { failedAttempts: attempts }
    });
  }
};

/**
 * Log document events
 */
const logDocument = {
  view: async (req, doc, jobId) => await logAudit(req, 'DOCUMENT_VIEW', {
    resourceType: 'document',
    resourceId: doc._id,
    resourceName: doc.name,
    details: { jobId, folder: doc.folder }
  }),

  download: async (req, doc, jobId) => await logAudit(req, 'DOCUMENT_DOWNLOAD', {
    resourceType: 'document',
    resourceId: doc._id,
    resourceName: doc.name,
    details: { jobId }
  }),

  upload: async (req, filename, jobId, folder) => await logAudit(req, 'DOCUMENT_UPLOAD', {
    resourceType: 'document',
    resourceName: filename,
    details: { jobId, folder }
  }),

  delete: async (req, doc, jobId) => await logAudit(req, 'DOCUMENT_DELETE', {
    resourceType: 'document',
    resourceId: doc._id,
    resourceName: doc.name,
    severity: 'warning',
    details: { jobId }
  }),

  approve: async (req, doc, jobId) => await logAudit(req, 'DOCUMENT_APPROVE', {
    resourceType: 'document',
    resourceId: doc._id,
    resourceName: doc.name,
    details: { jobId }
  }),

  reject: async (req, doc, jobId, reason) => await logAudit(req, 'DOCUMENT_REJECT', {
    resourceType: 'document',
    resourceId: doc._id,
    resourceName: doc.name,
    severity: 'warning',
    details: { jobId, reason }
  }),

  export: async (req, docs, jobId, method) => await logAudit(req, 'DOCUMENT_EXPORT', {
    resourceType: 'document',
    details: { jobId, documentCount: docs.length, method }
  })
};

/**
 * Log job events
 */
const logJob = {
  create: async (req, job) => await logAudit(req, 'JOB_CREATE', {
    resourceType: 'job',
    resourceId: job._id,
    resourceName: job.pmNumber || job.title,
    details: { pmNumber: job.pmNumber, woNumber: job.woNumber }
  }),

  update: async (req, job, changes) => await logAudit(req, 'JOB_UPDATE', {
    resourceType: 'job',
    resourceId: job._id,
    resourceName: job.pmNumber || job.title,
    details: { changedFields: Object.keys(changes) }
  }),

  delete: async (req, jobId, pmNumber) => await logAudit(req, 'JOB_DELETE', {
    resourceType: 'job',
    resourceId: jobId,
    resourceName: pmNumber,
    severity: 'warning'
  }),

  statusChange: async (req, job, oldStatus, newStatus) => await logAudit(req, 'JOB_STATUS_CHANGE', {
    resourceType: 'job',
    resourceId: job._id,
    resourceName: job.pmNumber || job.title,
    details: { oldStatus, newStatus }
  }),

  assign: async (req, job, assigneeId, assigneeName) => await logAudit(req, 'JOB_ASSIGN', {
    resourceType: 'job',
    resourceId: job._id,
    resourceName: job.pmNumber || job.title,
    details: { assigneeId, assigneeName }
  }),

  review: async (req, job, decision) => await logAudit(req, 'JOB_REVIEW', {
    resourceType: 'job',
    resourceId: job._id,
    resourceName: job.pmNumber || job.title,
    details: { decision }
  })
};

/**
 * Log user management events
 */
const logUser = {
  create: async (req, newUser) => await logAudit(req, 'USER_CREATE', {
    resourceType: 'user',
    resourceId: newUser._id,
    resourceName: newUser.email,
    details: { role: newUser.role }
  }),

  update: async (req, user, changes) => await logAudit(req, 'USER_UPDATE', {
    resourceType: 'user',
    resourceId: user._id,
    resourceName: user.email,
    details: { changedFields: Object.keys(changes) }
  }),

  delete: async (req, userId, email) => await logAudit(req, 'USER_DELETE', {
    resourceType: 'user',
    resourceId: userId,
    resourceName: email,
    severity: 'warning'
  }),

  roleChange: async (req, user, oldRole, newRole) => await logAudit(req, 'USER_ROLE_CHANGE', {
    resourceType: 'user',
    resourceId: user._id,
    resourceName: user.email,
    severity: 'warning',
    details: { oldRole, newRole }
  })
};

/**
 * Log security events
 */
const logSecurity = {
  rateLimitExceeded: async (req) => await logAudit(req, 'RATE_LIMIT_EXCEEDED', {
    severity: 'warning'
  }),

  unauthorizedAccess: async (req, resource) => await logAudit(req, 'UNAUTHORIZED_ACCESS_ATTEMPT', {
    resourceType: resource?.type,
    resourceId: resource?.id,
    severity: 'critical',
    success: false
  }),

  suspiciousActivity: async (req, description) => await logAudit(req, 'SUSPICIOUS_ACTIVITY', {
    severity: 'critical',
    details: { description }
  })
};

/**
 * Log data export events
 */
const logExport = {
  email: async (req, jobId, folderName, recipients) => await logAudit(req, 'EMAIL_SHARE', {
    resourceType: 'folder',
    details: { jobId, folderName, recipientCount: recipients?.length }
  }),

  bulkDownload: async (req, jobId, fileCount) => await logAudit(req, 'BULK_DOWNLOAD', {
    resourceType: 'job',
    resourceId: jobId,
    details: { fileCount }
  })
};

module.exports = {
  logAudit,
  logAuth,
  logDocument,
  logJob,
  logUser,
  logSecurity,
  logExport,
  getRequestMetadata,
  getUserInfo
};
