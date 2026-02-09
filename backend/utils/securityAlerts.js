/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Security Alerting System
 * 
 * Detects suspicious activity and can trigger alerts.
 * For PG&E/NERC compliance - immediate incident reporting.
 */

const AuditLog = require('../models/AuditLog');

// Thresholds for triggering alerts
const THRESHOLDS = {
  FAILED_LOGINS_PER_HOUR: 10,        // Multiple failed logins from same IP
  FAILED_LOGINS_PER_USER: 3,          // Failed logins for same user
  BULK_DOWNLOADS_PER_HOUR: 20,        // Unusual download activity
  DOCUMENT_DELETES_PER_HOUR: 10,      // Mass deletion warning
  UNAUTHORIZED_ACCESS_ATTEMPTS: 3,    // Permission denied events
};

// In-memory cache for rate tracking (could use Redis in production)
const activityCache = new Map();

/**
 * Clean up old cache entries (run periodically)
 */
function cleanupCache() {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [key, data] of activityCache.entries()) {
    if (data.timestamp < oneHourAgo) {
      activityCache.delete(key);
    }
  }
}

// Clean up every 10 minutes (only in production, not during tests)
let cleanupInterval = null;
if (process.env.NODE_ENV !== 'test') {
  cleanupInterval = setInterval(cleanupCache, 10 * 60 * 1000);
}

// Export for testing cleanup
const stopCleanupInterval = () => {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
};

/**
 * Increment counter for an activity type
 */
function incrementCounter(key) {
  const now = Date.now();
  const existing = activityCache.get(key);
  
  if (existing && now - existing.timestamp < 60 * 60 * 1000) {
    existing.count++;
    existing.lastActivity = now;
    return existing.count;
  }
  
  activityCache.set(key, { count: 1, timestamp: now, lastActivity: now });
  return 1;
}

/**
 * Get current count for an activity
 */
function getCounter(key) {
  const data = activityCache.get(key);
  if (!data) return 0;
  
  // Check if within the hour window
  if (Date.now() - data.timestamp > 60 * 60 * 1000) {
    activityCache.delete(key);
    return 0;
  }
  
  return data.count;
}

/**
 * Check for suspicious login activity
 */
async function checkLoginActivity(ip, email, success) {
  const alerts = [];
  
  if (!success) {
    // Track failed logins by IP
    const ipKey = `failed_login_ip:${ip}`;
    const ipCount = incrementCounter(ipKey);
    
    if (ipCount >= THRESHOLDS.FAILED_LOGINS_PER_HOUR) {
      alerts.push({
        type: 'BRUTE_FORCE_DETECTED',
        severity: 'critical',
        message: `Potential brute force attack from IP ${ip}: ${ipCount} failed attempts in 1 hour`,
        details: { ip, attemptCount: ipCount }
      });
    }
    
    // Track failed logins by user
    if (email) {
      const userKey = `failed_login_user:${email}`;
      const userCount = incrementCounter(userKey);
      
      if (userCount >= THRESHOLDS.FAILED_LOGINS_PER_USER) {
        alerts.push({
          type: 'ACCOUNT_ATTACK',
          severity: 'warning',
          message: `Multiple failed login attempts for user ${email}`,
          details: { email, attemptCount: userCount }
        });
      }
    }
  }
  
  return alerts;
}

/**
 * Check for unusual data access patterns
 */
async function checkDataAccessPattern(userId, companyId, action) {
  const alerts = [];
  
  if (action === 'BULK_DOWNLOAD' || action === 'DOCUMENT_EXPORT') {
    const key = `downloads:${userId}`;
    const count = incrementCounter(key);
    
    if (count >= THRESHOLDS.BULK_DOWNLOADS_PER_HOUR) {
      alerts.push({
        type: 'UNUSUAL_DOWNLOAD_ACTIVITY',
        severity: 'warning',
        message: `User has downloaded ${count} files in the last hour`,
        details: { userId, downloadCount: count }
      });
    }
  }
  
  if (action === 'DOCUMENT_DELETE') {
    const key = `deletes:${userId}`;
    const count = incrementCounter(key);
    
    if (count >= THRESHOLDS.DOCUMENT_DELETES_PER_HOUR) {
      alerts.push({
        type: 'MASS_DELETION_WARNING',
        severity: 'critical',
        message: `User is deleting an unusual number of documents: ${count} in 1 hour`,
        details: { userId, deleteCount: count }
      });
    }
  }
  
  return alerts;
}

/**
 * Check for unauthorized access attempts
 */
async function checkUnauthorizedAccess(userId, ip, resource) {
  const key = `unauthorized:${userId || ip}`;
  const count = incrementCounter(key);
  
  if (count >= THRESHOLDS.UNAUTHORIZED_ACCESS_ATTEMPTS) {
    return [{
      type: 'REPEATED_UNAUTHORIZED_ACCESS',
      severity: 'critical',
      message: `Repeated unauthorized access attempts detected`,
      details: { userId, ip, resource, attemptCount: count }
    }];
  }
  
  return [];
}

/**
 * Process and store security alerts
 */
async function processAlerts(alerts, req) {
  for (const alert of alerts) {
    console.error(`[SECURITY ALERT] ${alert.type}: ${alert.message}`);
    
    // Log to audit trail
    await AuditLog.log({
      timestamp: new Date(),
      userId: req?.userId,
      userEmail: req?.userEmail,
      companyId: req?.companyId,
      action: 'SUSPICIOUS_ACTIVITY',
      category: 'security',
      severity: alert.severity,
      details: {
        alertType: alert.type,
        alertMessage: alert.message,
        ...alert.details
      },
      ipAddress: req?.ip || req?.headers?.['x-forwarded-for'],
      userAgent: req?.headers?.['user-agent'],
      success: false
    });
    
    // Future: Send email/SMS alerts to security team
    // await sendSecurityAlert(alert);
  }
}

/**
 * Main security check function - call from middleware
 */
async function performSecurityCheck(req, action, details = {}) {
  let alerts = [];
  
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const userId = req.userId;
  const companyId = req.companyId;
  
  // Check based on action type
  if (action === 'LOGIN_SUCCESS' || action === 'LOGIN_FAILED') {
    const loginAlerts = await checkLoginActivity(ip, details.email, action === 'LOGIN_SUCCESS');
    alerts = alerts.concat(loginAlerts);
  }
  
  if (['BULK_DOWNLOAD', 'DOCUMENT_EXPORT', 'DOCUMENT_DELETE'].includes(action)) {
    const accessAlerts = await checkDataAccessPattern(userId, companyId, action);
    alerts = alerts.concat(accessAlerts);
  }
  
  if (action === 'UNAUTHORIZED_ACCESS_ATTEMPT') {
    const authAlerts = await checkUnauthorizedAccess(userId, ip, details.resource);
    alerts = alerts.concat(authAlerts);
  }
  
  // Process any alerts that were triggered
  if (alerts.length > 0) {
    await processAlerts(alerts, req);
  }
  
  return alerts;
}

/**
 * Get security stats for dashboard
 */
async function getSecurityStats(companyId, days = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const matchStage = {
    timestamp: { $gte: startDate },
    severity: { $in: ['warning', 'critical'] }
  };
  
  if (companyId) {
    matchStage.companyId = companyId;
  }
  
  const [
    alertsByType,
    alertsByDay,
    topIPs
  ] = await Promise.all([
    AuditLog.aggregate([
      { $match: matchStage },
      { $group: { _id: '$action', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
    
    AuditLog.aggregate([
      { $match: matchStage },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
        count: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ]),
    
    AuditLog.aggregate([
      { $match: { ...matchStage, action: 'LOGIN_FAILED' } },
      { $group: { _id: '$ipAddress', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ])
  ]);
  
  return {
    alertsByType,
    alertsByDay,
    topFailedLoginIPs: topIPs
  };
}

module.exports = {
  performSecurityCheck,
  checkLoginActivity,
  checkDataAccessPattern,
  checkUnauthorizedAccess,
  getSecurityStats,
  stopCleanupInterval,
  THRESHOLDS
};

