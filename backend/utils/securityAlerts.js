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
const Company = require('../models/Company');
const emailService = require('../services/email.service');
const log = require('./logger');

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
function _getCounter(key) {
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

// ---------------------------------------------------------------------------
// Breach Notification Pipeline (PG&E Exhibit DATA-1 — 8-hour SLA)
// ---------------------------------------------------------------------------

/**
 * Tracks the last time an email was sent for a given alert type + company
 * to prevent flooding inboxes during sustained attacks. One email per
 * alert-type per company per hour is sufficient — the audit log has the
 * full timeline.
 */
const emailCooldownCache = new Map();
const EMAIL_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

/**
 * Check whether we've already emailed for this alert type + company recently.
 * Returns true if the email should be suppressed.
 *
 * @param {string} alertType
 * @param {string|null} companyId
 * @returns {boolean}
 */
function isEmailOnCooldown(alertType, companyId) {
  const key = `${alertType}:${companyId || 'global'}`;
  const lastSent = emailCooldownCache.get(key);
  if (lastSent && Date.now() - lastSent < EMAIL_COOLDOWN_MS) return true;
  emailCooldownCache.set(key, Date.now());
  return false;
}

/**
 * Resolve the set of email addresses that should receive a security alert.
 *
 * Sources (deduplicated):
 *   1. Company.securitySettings.securityAlertEmails (company-specific contacts)
 *   2. process.env.SECURITY_ALERT_EMAIL (platform security team)
 *
 * @param {string|null} companyId
 * @returns {Promise<string[]>} Unique recipient list (may be empty)
 */
async function resolveAlertRecipients(companyId) {
  const recipients = new Set();

  if (process.env.SECURITY_ALERT_EMAIL) {
    recipients.add(process.env.SECURITY_ALERT_EMAIL.trim().toLowerCase());
  }

  if (companyId) {
    try {
      const company = await Company.findById(companyId)
        .select('securitySettings.securityAlertEmails name')
        .lean();

      if (company?.securitySettings?.securityAlertEmails) {
        for (const addr of company.securitySettings.securityAlertEmails) {
          if (addr && typeof addr === 'string' && addr.includes('@')) {
            recipients.add(addr.trim().toLowerCase());
          }
        }
      }
    } catch (err) {
      log.error({ err, companyId }, '[SecurityAlerts] Failed to load company alert emails');
    }
  }

  return [...recipients];
}

/**
 * Build the HTML and plain-text bodies for a security alert email.
 *
 * @param {Object} alert
 * @param {Object|null} req - Express request (may be null for system-generated alerts)
 * @returns {{ subject: string, html: string, text: string }}
 */
function buildAlertEmail(alert, req) {
  const ts = new Date().toISOString();
  const companyId = req?.companyId || 'N/A';
  const userId = req?.userId || 'N/A';
  const userEmail = req?.userEmail || 'N/A';
  const ip = req?.ip || req?.headers?.['x-forwarded-for'] || 'unknown';
  const detailsJson = JSON.stringify(alert.details || {}, null, 2);

  const subject = `[FieldLedger ${alert.severity.toUpperCase()}] ${alert.type}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
      <div style="background-color: ${alert.severity === 'critical' ? '#d32f2f' : '#ed6c02'}; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0;">Security Alert — ${alert.severity.toUpperCase()}</h2>
      </div>
      <div style="border: 1px solid #e0e0e0; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
        <p style="font-size: 16px; font-weight: bold; color: #333;">${alert.type}</p>
        <p>${alert.message}</p>

        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 6px 12px; font-weight: bold; color: #555; width: 140px;">Timestamp</td><td style="padding: 6px 12px;">${ts}</td></tr>
          <tr style="background: #f9f9f9;"><td style="padding: 6px 12px; font-weight: bold; color: #555;">Company ID</td><td style="padding: 6px 12px;">${companyId}</td></tr>
          <tr><td style="padding: 6px 12px; font-weight: bold; color: #555;">User</td><td style="padding: 6px 12px;">${userEmail} (${userId})</td></tr>
          <tr style="background: #f9f9f9;"><td style="padding: 6px 12px; font-weight: bold; color: #555;">Source IP</td><td style="padding: 6px 12px;">${ip}</td></tr>
        </table>

        <details style="margin-top: 12px;">
          <summary style="cursor: pointer; font-weight: bold; color: #555;">Raw Details</summary>
          <pre style="background: #f5f5f5; padding: 12px; border-radius: 4px; overflow-x: auto; font-size: 12px;">${detailsJson}</pre>
        </details>

        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 24px 0;">
        <p style="color: #999; font-size: 12px;">
          PG&amp;E Exhibit DATA-1 requires notification within 8 hours of a suspected breach.
          This alert was generated automatically by FieldLedger at ${ts}.
        </p>
      </div>
    </div>
  `;

  const text = [
    `SECURITY ALERT — ${alert.severity.toUpperCase()}`,
    `Type: ${alert.type}`,
    `Message: ${alert.message}`,
    `Timestamp: ${ts}`,
    `Company ID: ${companyId}`,
    `User: ${userEmail} (${userId})`,
    `Source IP: ${ip}`,
    `Details: ${detailsJson}`,
    '',
    'PG&E Exhibit DATA-1 requires notification within 8 hours of a suspected breach.',
    `This alert was generated automatically by FieldLedger at ${ts}.`
  ].join('\n');

  return { subject, html, text };
}

/**
 * Send a security alert email to all resolved recipients.
 * Failures are logged but never propagated — the audit log is the
 * authoritative record, and a broken SMTP relay must not suppress alerts
 * or crash the request.
 *
 * @param {Object} alert
 * @param {Object|null} req
 * @returns {Promise<void>}
 */
async function sendAlertEmail(alert, req) {
  const companyId = req?.companyId || null;

  if (isEmailOnCooldown(alert.type, companyId)) {
    log.info({ alertType: alert.type, companyId }, '[SecurityAlerts] Email suppressed (cooldown)');
    return;
  }

  const recipients = await resolveAlertRecipients(companyId);
  if (recipients.length === 0) {
    log.warn({ alertType: alert.type, companyId }, '[SecurityAlerts] No alert recipients configured');
    return;
  }

  const { subject, html, text } = buildAlertEmail(alert, req);

  const results = await Promise.allSettled(
    recipients.map(to =>
      emailService.sendEmail({ to, subject, html, text })
    )
  );

  for (let i = 0; i < results.length; i++) {
    if (results[i].status === 'fulfilled') {
      log.info({ to: recipients[i], alertType: alert.type }, '[SecurityAlerts] Alert email sent');
    } else {
      log.error(
        { err: results[i].reason, to: recipients[i], alertType: alert.type },
        '[SecurityAlerts] Alert email delivery failed'
      );
    }
  }
}

/**
 * Process and store security alerts.
 *
 * Every alert is persisted to the audit log (authoritative record).
 * Critical-severity alerts also trigger email notification to the
 * company's security contacts and the platform security team, satisfying
 * the PG&E Exhibit DATA-1 8-hour breach notification SLA.
 */
async function processAlerts(alerts, req) {
  for (const alert of alerts) {
    log.error({ alertType: alert.type, severity: alert.severity }, `[SECURITY ALERT] ${alert.message}`);

    // 1. Persist to audit trail (authoritative — must succeed)
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

    // 2. Email notification for critical alerts (best-effort — never crashes)
    if (alert.severity === 'critical') {
      try {
        await sendAlertEmail(alert, req);
      } catch (err) {
        log.error({ err, alertType: alert.type }, '[SecurityAlerts] Unhandled error in email pipeline');
      }
    }
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

