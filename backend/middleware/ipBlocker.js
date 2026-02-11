/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
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
 * - MongoDB persistence for durability across restarts
 * - In-memory cache for fast lookups
 */

const AuditLog = require('../models/AuditLog');
const BlockedIP = require('../models/BlockedIP');

// In-memory cache for fast lookups (synced with MongoDB)
const blockedIPsCache = new Map(); // IP -> { until: Date, reason: string, permanent: boolean }
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
  
  // Cleanup/sync interval
  CLEANUP_INTERVAL_MS: 5 * 60 * 1000, // Every 5 minutes
  
  // Cache TTL - how long to trust cache before checking DB
  CACHE_TTL_MS: 60 * 1000, // 1 minute
};

// Load permanent blocklist from environment variable
const envBlockedIPs = new Set();
if (process.env.BLOCKED_IPS) {
  process.env.BLOCKED_IPS.split(',').forEach(ip => {
    const trimmed = ip.trim();
    if (trimmed) {
      envBlockedIPs.add(trimmed);
      blockedIPsCache.set(trimmed, { 
        until: null, 
        reason: 'Permanent blocklist (ENV)', 
        permanent: true,
        cached: Date.now()
      });
    }
  });
}

/**
 * Initialize blocklist from MongoDB on startup
 */
async function initializeBlocklist() {
  try {
    const blocked = await BlockedIP.getBlocked();
    for (const block of blocked) {
      blockedIPsCache.set(block.ip, {
        until: block.expiresAt,
        reason: block.reason,
        permanent: block.permanent,
        cached: Date.now()
      });
    }
    console.log(`[IP Blocker] Loaded ${blocked.length} blocked IPs from database`);
  } catch (err) {
    console.error('[IP Blocker] Failed to load blocklist from DB:', err.message);
  }
}

// Initialize on module load (non-blocking)
if (process.env.NODE_ENV !== 'test') {
  initializeBlocklist();
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
 * Check if IP is blocked (sync - uses cache)
 * For hot path performance, checks cache first
 */
function isBlocked(ip) {
  // Check env blocklist first (always in memory)
  if (envBlockedIPs.has(ip)) return true;
  
  const cached = blockedIPsCache.get(ip);
  if (!cached) return false;
  
  // Check permanent blocks
  if (cached.permanent) return true;
  
  // Check temporary blocks
  if (cached.until && new Date() < cached.until) {
    return true;
  }
  
  // Block has expired, remove from cache
  blockedIPsCache.delete(ip);
  return false;
}

/**
 * Check if IP is blocked (async - checks DB if cache miss or stale)
 */
async function isBlockedAsync(ip) {
  // Check env blocklist first
  if (envBlockedIPs.has(ip)) return true;
  
  // Check cache
  const cached = blockedIPsCache.get(ip);
  if (cached) {
    // Cache hit - check if still valid
    if (cached.permanent) return true;
    if (cached.until && new Date() < cached.until) return true;
    
    // Expired
    blockedIPsCache.delete(ip);
    return false;
  }
  
  // Cache miss - check database
  try {
    const isBlockedInDB = await BlockedIP.isBlocked(ip);
    if (isBlockedInDB) {
      // Refresh cache
      const info = await BlockedIP.getBlockInfo(ip);
      if (info) {
        blockedIPsCache.set(ip, {
          until: info.expiresAt,
          reason: info.reason,
          permanent: info.permanent,
          cached: Date.now()
        });
      }
    }
    return isBlockedInDB;
  } catch (err) {
    // DB error - fall back to cache-only
    console.error('[IP Blocker] DB check failed:', err.message);
    return false;
  }
}

/**
 * Get remaining block time in minutes
 */
function getBlockTimeRemaining(ip) {
  const block = blockedIPsCache.get(ip);
  if (!block) return 0;
  if (block.permanent) return Infinity;
  if (!block.until) return 0;
  
  const remaining = Math.ceil((block.until - new Date()) / 60000);
  return remaining > 0 ? remaining : 0;
}

/**
 * Record a failed login attempt
 */
async function recordFailedAttempt(ip) {
  const now = new Date();
  const existing = failedAttempts.get(ip);
  
  if (existing) {
    // Check if within window
    if (now - existing.firstAttempt < CONFIG.ATTEMPT_WINDOW_MS) {
      existing.count++;
      existing.lastAttempt = now;
      
      // Check if threshold exceeded
      if (existing.count >= CONFIG.FAILED_ATTEMPTS_THRESHOLD) {
        await blockIP(ip, CONFIG.AUTO_BLOCK_DURATION_MS, `Exceeded ${CONFIG.FAILED_ATTEMPTS_THRESHOLD} failed login attempts`);
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
 * Block an IP address (persists to MongoDB)
 */
async function blockIP(ip, durationMs, reason, permanent = false) {
  try {
    // Persist to MongoDB with escalation
    const block = await BlockedIP.blockIP(ip, {
      reason,
      durationMs,
      permanent,
      escalate: true
    });
    
    // Update cache
    blockedIPsCache.set(ip, {
      until: block.expiresAt,
      reason: block.reason,
      permanent: block.permanent,
      cached: Date.now()
    });
    
    return { 
      ip, 
      until: block.expiresAt, 
      permanent: block.permanent, 
      reason: block.reason,
      blockCount: block.blockCount
    };
  } catch (err) {
    // DB error - fall back to in-memory only
    console.error('[IP Blocker] Failed to persist block:', err.message);
    
    const until = permanent ? null : new Date(Date.now() + durationMs);
    blockedIPsCache.set(ip, {
      until,
      reason,
      permanent,
      cached: Date.now()
    });
    
    console.error(`[IP BLOCKED] ${ip} - ${reason} - Duration: ${permanent ? 'PERMANENT' : `${Math.ceil(durationMs / 60000)} minutes`} (in-memory only)`);
    
    return { ip, until, permanent, reason };
  }
}

/**
 * Unblock an IP address (sync version for backward compatibility)
 */
function unblockIPSync(ip) {
  const wasBlocked = blockedIPsCache.has(ip);
  blockedIPsCache.delete(ip);
  failedAttempts.delete(ip);
  
  // Fire-and-forget DB cleanup
  BlockedIP.unblockIP(ip).catch(() => {});
  
  if (wasBlocked) {
    console.log(`[IP UNBLOCKED] ${ip}`);
  }
  
  return wasBlocked;
}

/**
 * Unblock an IP address (async version)
 */
async function unblockIP(ip) {
  blockedIPsCache.delete(ip);
  failedAttempts.delete(ip);
  
  try {
    const wasBlocked = await BlockedIP.unblockIP(ip);
    return wasBlocked;
  } catch (err) {
    console.error('[IP Blocker] Failed to unblock in DB:', err.message);
    return true; // Assume it was blocked if we can't check
  }
}

/**
 * Get all blocked IPs (from database)
 */
async function getBlockedIPs() {
  try {
    const blocks = await BlockedIP.getBlocked();
    const now = new Date();
    
    return blocks.map(block => ({
      ip: block.ip,
      reason: block.reason,
      blockedAt: block.createdAt,
      until: block.expiresAt,
      permanent: block.permanent,
      blockCount: block.blockCount,
      remainingMinutes: block.permanent ? null : Math.ceil((block.expiresAt - now) / 60000)
    }));
  } catch (err) {
    console.error('[IP Blocker] Failed to get blocked IPs from DB:', err.message);
    
    // Fall back to cache
    const result = [];
    const now = new Date();
    
    for (const [ip, block] of blockedIPsCache.entries()) {
      if (block.permanent || (block.until && block.until > now)) {
        result.push({
          ip,
          reason: block.reason,
          until: block.until,
          permanent: block.permanent,
          remainingMinutes: block.permanent ? null : Math.ceil((block.until - now) / 60000)
        });
      }
    }
    
    return result;
  }
}

/**
 * Cleanup expired blocks and old attempt records
 * Also syncs cache with database
 */
async function cleanup() {
  const now = new Date();
  
  // Clean expired blocks from cache
  for (const [ip, block] of blockedIPsCache.entries()) {
    if (!block.permanent && block.until && block.until <= now) {
      blockedIPsCache.delete(ip);
    }
  }
  
  // Clean old attempt records
  for (const [ip, attempts] of failedAttempts.entries()) {
    if (now - attempts.firstAttempt > CONFIG.ATTEMPT_WINDOW_MS) {
      failedAttempts.delete(ip);
    }
  }
  
  // Sync cache with database (refresh from DB)
  try {
    const dbBlocks = await BlockedIP.getBlocked();
    const dbIPs = new Set(dbBlocks.map(b => b.ip));
    
    // Add any DB blocks not in cache
    for (const block of dbBlocks) {
      if (!blockedIPsCache.has(block.ip)) {
        blockedIPsCache.set(block.ip, {
          until: block.expiresAt,
          reason: block.reason,
          permanent: block.permanent,
          cached: Date.now()
        });
      }
    }
    
    // Remove cache entries not in DB (except env blocklist)
    for (const [ip] of blockedIPsCache.entries()) {
      if (!dbIPs.has(ip) && !envBlockedIPs.has(ip)) {
        blockedIPsCache.delete(ip);
      }
    }
  } catch (err) {
    // DB sync failed - cache continues to work independently
    console.error('[IP Blocker] Cache sync failed:', err.message);
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
    const block = blockedIPsCache.get(ip);
    
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
  res.json = async function(body) {
    // Check if this was a failed login (401 status)
    if (res.statusCode === 401) {
      try {
        const result = await recordFailedAttempt(ip);
        
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
      } catch (err) {
        console.error('[IP Blocker] Failed to record attempt:', err.message);
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
  unblockIPSync,
  isBlocked,
  isBlockedAsync,
  getBlockedIPs,
  recordFailedAttempt,
  getClientIP,
  cleanup,
  stopCleanupInterval,
  initializeBlocklist,
  CONFIG
};

