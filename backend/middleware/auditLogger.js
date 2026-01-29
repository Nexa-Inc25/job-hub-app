/**
 * Audit Logging Middleware
 * 
 * Provides functions to log security-relevant actions for PG&E compliance.
 * Used throughout the API to track document access, user actions, and security events.
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
 * @param {String} options.resourceType - Type of resource affected
 * @param {String} options.resourceId - ID of resource affected
 * @param {String} options.resourceName - Name of resource for display
 * @param {Object} options.details - Additional context
 * @param {Boolean} options.success - Whether action succeeded
 * @param {String} options.errorMessage - Error message if failed
 * @param {String} options.severity - 'info', 'warning', or 'critical'
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

  return AuditLog.log({
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
 */
const logAuth = {
  loginSuccess: (req, user) => logAudit(req, 'LOGIN_SUCCESS', {
    resourceType: 'user',
    resourceId: user._id,
    resourceName: user.email,
    details: { role: user.role, isAdmin: user.isAdmin }
  }),

  loginFailed: (req, email, reason) => logAudit(req, 'LOGIN_FAILED', {
    resourceType: 'user',
    resourceName: email,
    success: false,
    errorMessage: reason,
    severity: 'warning',
    details: { email, reason }
  }),

  logout: (req) => logAudit(req, 'LOGOUT'),

  passwordChange: (req, userId) => logAudit(req, 'PASSWORD_CHANGE', {
    resourceType: 'user',
    resourceId: userId,
    severity: 'warning'
  }),

  accountLocked: (req, email, attempts) => logAudit(req, 'ACCOUNT_LOCKED', {
    resourceType: 'user',
    resourceName: email,
    severity: 'critical',
    details: { failedAttempts: attempts }
  })
};

/**
 * Log document events
 */
const logDocument = {
  view: (req, doc, jobId) => logAudit(req, 'DOCUMENT_VIEW', {
    resourceType: 'document',
    resourceId: doc._id,
    resourceName: doc.name,
    details: { jobId, folder: doc.folder }
  }),

  download: (req, doc, jobId) => logAudit(req, 'DOCUMENT_DOWNLOAD', {
    resourceType: 'document',
    resourceId: doc._id,
    resourceName: doc.name,
    details: { jobId }
  }),

  upload: (req, filename, jobId, folder) => logAudit(req, 'DOCUMENT_UPLOAD', {
    resourceType: 'document',
    resourceName: filename,
    details: { jobId, folder }
  }),

  delete: (req, doc, jobId) => logAudit(req, 'DOCUMENT_DELETE', {
    resourceType: 'document',
    resourceId: doc._id,
    resourceName: doc.name,
    severity: 'warning',
    details: { jobId }
  }),

  approve: (req, doc, jobId) => logAudit(req, 'DOCUMENT_APPROVE', {
    resourceType: 'document',
    resourceId: doc._id,
    resourceName: doc.name,
    details: { jobId }
  }),

  reject: (req, doc, jobId, reason) => logAudit(req, 'DOCUMENT_REJECT', {
    resourceType: 'document',
    resourceId: doc._id,
    resourceName: doc.name,
    severity: 'warning',
    details: { jobId, reason }
  }),

  export: (req, docs, jobId, method) => logAudit(req, 'DOCUMENT_EXPORT', {
    resourceType: 'document',
    details: { jobId, documentCount: docs.length, method }
  })
};

/**
 * Log job events
 */
const logJob = {
  create: (req, job) => logAudit(req, 'JOB_CREATE', {
    resourceType: 'job',
    resourceId: job._id,
    resourceName: job.pmNumber || job.title,
    details: { pmNumber: job.pmNumber, woNumber: job.woNumber }
  }),

  update: (req, job, changes) => logAudit(req, 'JOB_UPDATE', {
    resourceType: 'job',
    resourceId: job._id,
    resourceName: job.pmNumber || job.title,
    details: { changedFields: Object.keys(changes) }
  }),

  delete: (req, jobId, pmNumber) => logAudit(req, 'JOB_DELETE', {
    resourceType: 'job',
    resourceId: jobId,
    resourceName: pmNumber,
    severity: 'warning'
  }),

  statusChange: (req, job, oldStatus, newStatus) => logAudit(req, 'JOB_STATUS_CHANGE', {
    resourceType: 'job',
    resourceId: job._id,
    resourceName: job.pmNumber || job.title,
    details: { oldStatus, newStatus }
  }),

  assign: (req, job, assigneeId, assigneeName) => logAudit(req, 'JOB_ASSIGN', {
    resourceType: 'job',
    resourceId: job._id,
    resourceName: job.pmNumber || job.title,
    details: { assigneeId, assigneeName }
  }),

  review: (req, job, decision) => logAudit(req, 'JOB_REVIEW', {
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
  create: (req, newUser) => logAudit(req, 'USER_CREATE', {
    resourceType: 'user',
    resourceId: newUser._id,
    resourceName: newUser.email,
    details: { role: newUser.role }
  }),

  update: (req, user, changes) => logAudit(req, 'USER_UPDATE', {
    resourceType: 'user',
    resourceId: user._id,
    resourceName: user.email,
    details: { changedFields: Object.keys(changes) }
  }),

  delete: (req, userId, email) => logAudit(req, 'USER_DELETE', {
    resourceType: 'user',
    resourceId: userId,
    resourceName: email,
    severity: 'warning'
  }),

  roleChange: (req, user, oldRole, newRole) => logAudit(req, 'USER_ROLE_CHANGE', {
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
  rateLimitExceeded: (req) => logAudit(req, 'RATE_LIMIT_EXCEEDED', {
    severity: 'warning'
  }),

  unauthorizedAccess: (req, resource) => logAudit(req, 'UNAUTHORIZED_ACCESS_ATTEMPT', {
    resourceType: resource?.type,
    resourceId: resource?.id,
    severity: 'critical',
    success: false
  }),

  suspiciousActivity: (req, description) => logAudit(req, 'SUSPICIOUS_ACTIVITY', {
    severity: 'critical',
    details: { description }
  })
};

/**
 * Log data export events
 */
const logExport = {
  email: (req, jobId, folderName, recipients) => logAudit(req, 'EMAIL_SHARE', {
    resourceType: 'folder',
    details: { jobId, folderName, recipientCount: recipients?.length }
  }),

  bulkDownload: (req, jobId, fileCount) => logAudit(req, 'BULK_DOWNLOAD', {
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

