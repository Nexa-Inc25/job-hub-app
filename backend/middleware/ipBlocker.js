/**
 * IP Blocking Middleware
 * 
 * Provides automatic and manual IP blocking for brute force protection.
 * Integrates with the security alerts system for automatic blocking.
 * 
 * Features:
 * - Automatic temporary blocking after excessive failed logins
 * - Permanent blocklist for known malicious IPs
 * - Admin API to view/manage blocked IPs
 */

const AuditLog = require('../models/AuditLog');

// In-memory blocklist (would use Redis in production for multi-instance)
const blockedIPs = new Map(); // IP -> { until: Date, reason: string, permanent: boolean }
const failedAttempts = new Map(); // IP -> { count: number, firstAttempt: Date }

// Configuration
const CONFIG = {
  // Automatic blocking thresholds
  FAILED_ATTEMPTS_THRESHOLD: 10,     // Block after this many failures
  ATTEMPT_WINDOW_MS: 15 * 60 * 1000, // Within this time window (15 min)
  AUTO_BLOCK_DURATION_MS: 60 * 60 * 1000, // Block for 1 hour
  
  // Escalating blocks for repeat offenders
  ESCALATION_MULTIPLIER: 2, // Double block time each offense
  MAX_BLOCK_DURATION_MS: 24 * 60 * 60 * 1000, // Max 24 hour block
  
  // Cleanup interval
  CLEANUP_INTERVAL_MS: 5 * 60 * 1000, // Every 5 minutes
};

// Permanent blocklist (can be populated from env or database)
const permanentBlocklist = new Set([
  // Add known malicious IPs here, or load from env/database
  // Example: '192.168.1.100',
]);

// Load from environment variable if set
if (process.env.BLOCKED_IPS) {
  process.env.BLOCKED_IPS.split(',').forEach(ip => {
    const trimmed = ip.trim();
    if (trimmed) {
      permanentBlocklist.add(trimmed);
      blockedIPs.set(trimmed, { 
        until: null, 
        reason: 'Permanent blocklist (ENV)', 
        permanent: true 
      });
    }
  });
}

/**
 * Extract real IP from request (handles proxies)
 */
function getClientIP(req) {
  // Railway/Vercel use X-Forwarded-For
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // Take the first IP (client IP, not proxy IPs)
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

/**
 * Check if IP is blocked
 */
function isBlocked(ip) {
  const block = blockedIPs.get(ip);
  if (!block) return false;
  
  // Check permanent blocks
  if (block.permanent) return true;
  
  // Check temporary blocks
  if (block.until && new Date() < block.until) {
    return true;
  }
  
  // Block has expired, remove it
  blockedIPs.delete(ip);
  return false;
}

/**
 * Get remaining block time in minutes
 */
function getBlockTimeRemaining(ip) {
  const block = blockedIPs.get(ip);
  if (!block) return 0;
  if (block.permanent) return Infinity;
  if (!block.until) return 0;
  
  const remaining = Math.ceil((block.until - new Date()) / 60000);
  return remaining > 0 ? remaining : 0;
}

/**
 * Record a failed login attempt
 */
function recordFailedAttempt(ip) {
  const now = new Date();
  const existing = failedAttempts.get(ip);
  
  if (existing) {
    // Check if within window
    if (now - existing.firstAttempt < CONFIG.ATTEMPT_WINDOW_MS) {
      existing.count++;
      existing.lastAttempt = now;
      
      // Check if threshold exceeded
      if (existing.count >= CONFIG.FAILED_ATTEMPTS_THRESHOLD) {
        blockIP(ip, CONFIG.AUTO_BLOCK_DURATION_MS, `Exceeded ${CONFIG.FAILED_ATTEMPTS_THRESHOLD} failed login attempts`);
        failedAttempts.delete(ip);
        return { blocked: true, count: existing.count };
      }
      
      return { blocked: false, count: existing.count };
    }
    
    // Window expired, reset
    failedAttempts.set(ip, { count: 1, firstAttempt: now, lastAttempt: now });
    return { blocked: false, count: 1 };
  }
  
  // First attempt
  failedAttempts.set(ip, { count: 1, firstAttempt: now, lastAttempt: now });
  return { blocked: false, count: 1 };
}

/**
 * Block an IP address
 */
function blockIP(ip, durationMs, reason, permanent = false) {
  const existingBlock = blockedIPs.get(ip);
  let finalDuration = durationMs;
  
  // Escalate for repeat offenders
  if (existingBlock && !permanent) {
    const previousDuration = existingBlock.previousDuration || durationMs;
    finalDuration = Math.min(
      previousDuration * CONFIG.ESCALATION_MULTIPLIER,
      CONFIG.MAX_BLOCK_DURATION_MS
    );
  }
  
  const until = permanent ? null : new Date(Date.now() + finalDuration);
  
  blockedIPs.set(ip, {
    until,
    reason,
    permanent,
    blockedAt: new Date(),
    previousDuration: finalDuration
  });
  
  console.error(`[IP BLOCKED] ${ip} - ${reason} - Duration: ${permanent ? 'PERMANENT' : `${Math.ceil(finalDuration / 60000)} minutes`}`);
  
  return { ip, until, permanent, reason };
}

/**
 * Unblock an IP address
 */
function unblockIP(ip) {
  const wasBlocked = blockedIPs.has(ip);
  blockedIPs.delete(ip);
  failedAttempts.delete(ip);
  permanentBlocklist.delete(ip);
  
  if (wasBlocked) {
    console.log(`[IP UNBLOCKED] ${ip}`);
  }
  
  return wasBlocked;
}

/**
 * Get all blocked IPs
 */
function getBlockedIPs() {
  const result = [];
  const now = new Date();
  
  for (const [ip, block] of blockedIPs.entries()) {
    if (block.permanent || (block.until && block.until > now)) {
      result.push({
        ip,
        reason: block.reason,
        blockedAt: block.blockedAt,
        until: block.until,
        permanent: block.permanent,
        remainingMinutes: block.permanent ? null : Math.ceil((block.until - now) / 60000)
      });
    }
  }
  
  return result;
}

/**
 * Cleanup expired blocks and old attempt records
 */
function cleanup() {
  const now = new Date();
  
  // Clean expired blocks
  for (const [ip, block] of blockedIPs.entries()) {
    if (!block.permanent && block.until && block.until <= now) {
      blockedIPs.delete(ip);
    }
  }
  
  // Clean old attempt records
  for (const [ip, attempts] of failedAttempts.entries()) {
    if (now - attempts.firstAttempt > CONFIG.ATTEMPT_WINDOW_MS) {
      failedAttempts.delete(ip);
    }
  }
}

// Run cleanup periodically (only in production)
let cleanupInterval = null;
if (process.env.NODE_ENV !== 'test') {
  cleanupInterval = setInterval(cleanup, CONFIG.CLEANUP_INTERVAL_MS);
}

/**
 * Express middleware - blocks requests from blocked IPs
 */
const ipBlockerMiddleware = (req, res, next) => {
  const ip = getClientIP(req);
  
  if (isBlocked(ip)) {
    const remaining = getBlockTimeRemaining(ip);
    const block = blockedIPs.get(ip);
    
    // Log the blocked request
    console.warn(`[BLOCKED REQUEST] IP: ${ip}, Path: ${req.path}, Remaining: ${remaining === Infinity ? 'PERMANENT' : remaining + ' min'}`);
    
    // Log to audit trail
    AuditLog.log({
      timestamp: new Date(),
      action: 'BLOCKED_REQUEST',
      category: 'security',
      severity: 'warning',
      details: {
        ip,
        path: req.path,
        method: req.method,
        reason: block?.reason,
        remainingMinutes: remaining
      },
      ipAddress: ip,
      userAgent: req.headers['user-agent'],
      success: false
    }).catch(() => {}); // Fire and forget
    
    return res.status(403).json({
      error: 'Access denied',
      message: block?.permanent 
        ? 'Your IP address has been permanently blocked.'
        : `Your IP address has been temporarily blocked. Try again in ${remaining} minutes.`,
      retryAfter: block?.permanent ? null : remaining * 60
    });
  }
  
  // Attach helper to request for use in auth controller
  req.recordFailedLogin = () => recordFailedAttempt(ip);
  req.clientIP = ip;
  
  next();
};

/**
 * Middleware specifically for login endpoints - records failures and auto-blocks
 */
const loginAttemptTracker = (req, res, next) => {
  const ip = getClientIP(req);
  const originalJson = res.json.bind(res);
  
  // Intercept response to track failed logins
  res.json = function(body) {
    // Check if this was a failed login (401 status)
    if (res.statusCode === 401) {
      const result = recordFailedAttempt(ip);
      
      if (result.blocked) {
        // Override response to indicate blocking with correct 429 status
        res.status(429);
        return originalJson({
          error: 'Too many failed login attempts',
          message: 'Your IP has been temporarily blocked due to excessive failed login attempts. Please try again in 1 hour.',
          retryAfter: CONFIG.AUTO_BLOCK_DURATION_MS / 1000
        });
      }
      
      // Add warning header about remaining attempts
      const remaining = CONFIG.FAILED_ATTEMPTS_THRESHOLD - result.count;
      if (remaining <= 3) {
        res.setHeader('X-Attempts-Remaining', remaining);
      }
    }
    
    return originalJson(body);
  };
  
  next();
};

// Export for testing
const stopCleanupInterval = () => {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
};

module.exports = {
  ipBlockerMiddleware,
  loginAttemptTracker,
  blockIP,
  unblockIP,
  isBlocked,
  getBlockedIPs,
  recordFailedAttempt,
  getClientIP,
  cleanup,
  stopCleanupInterval,
  CONFIG
};

