/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 * 
 * Authentication Middleware
 * JWT token verification for protected routes
 * IP whitelist enforcement for enterprise companies
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Company = require('../models/Company');
const { getClientIP } = require('./ipBlocker');

// Cache for company security settings (avoid DB lookup on every request)
const companySecurityCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get company security settings with caching
 */
async function getCompanySecuritySettings(companyId) {
  if (!companyId) return null;
  
  const cacheKey = companyId.toString();
  const cached = companySecurityCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.settings;
  }
  
  try {
    const company = await Company.findById(companyId)
      .select('securitySettings')
      .lean();
    
    if (company?.securitySettings) {
      companySecurityCache.set(cacheKey, {
        settings: company.securitySettings,
        timestamp: Date.now()
      });
      return company.securitySettings;
    }
  } catch (err) {
    console.error('[Auth] Failed to fetch company settings:', err.message);
  }
  
  return null;
}

/**
 * Check if IP is in whitelist
 * Supports exact matches and CIDR notation (e.g., "192.168.1.0/24")
 */
function isIPInWhitelist(clientIP, whitelist) {
  if (!whitelist || whitelist.length === 0) return true; // No whitelist = allow all
  if (!clientIP || clientIP === 'unknown') return false;
  
  for (const entry of whitelist) {
    // Exact match
    if (entry === clientIP) return true;
    
    // CIDR notation support (basic)
    if (entry.includes('/')) {
      try {
        const [network, bits] = entry.split('/');
        const mask = ~(Math.pow(2, 32 - parseInt(bits)) - 1);
        
        const ipToNum = (ip) => ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
        
        if ((ipToNum(clientIP) & mask) === (ipToNum(network) & mask)) {
          return true;
        }
      } catch {
        // Invalid CIDR, skip
      }
    }
  }
  
  return false;
}

/**
 * Clear company security cache (call when settings are updated)
 */
function clearCompanySecurityCache(companyId) {
  if (companyId) {
    companySecurityCache.delete(companyId.toString());
  } else {
    companySecurityCache.clear();
  }
}

/**
 * Verify JWT token and attach user to request
 * Also enforces company IP whitelist if configured
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.slice(7) 
      : authHeader;
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Fetch user to ensure they still exist and get latest data
    const user = await User.findById(decoded.userId || decoded.id)
      .select('-password')
      .lean();
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Check company IP whitelist (Enterprise security feature)
    if (user.companyId) {
      const securitySettings = await getCompanySecuritySettings(user.companyId);
      
      if (securitySettings?.ipWhitelist?.length > 0) {
        const clientIP = getClientIP(req);
        
        if (!isIPInWhitelist(clientIP, securitySettings.ipWhitelist)) {
          console.warn(`[Auth] IP whitelist violation: ${clientIP} not in company whitelist for user ${user.email}`);
          return res.status(403).json({ 
            error: 'Access denied',
            message: 'Your IP address is not authorized for this organization. Contact your administrator.'
          });
        }
      }
    }

    req.user = user;
    req.userId = user._id.toString();
    req.userEmail = user.email;
    req.userName = user.name;
    req.userRole = user.role;
    req.companyId = user.companyId;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    console.error('[Auth] Token verification error:', error);
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

/**
 * Alias for authenticateToken (for backwards compatibility)
 */
const authenticateUser = authenticateToken;

/**
 * Optional authentication - attaches user if token present, continues otherwise
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.slice(7) 
      : authHeader;
    
    if (!token) {
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId || decoded.id)
      .select('-password')
      .lean();
    
    if (user) {
      req.user = user;
      req.userId = user._id.toString();
    }
    next();
  } catch {
    // Token invalid but optional, continue without user
    next();
  }
};

/**
 * Role-based authorization middleware factory
 * @param {string[]} allowedRoles - Array of roles that are allowed
 */
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Access denied',
        message: `Required role: ${allowedRoles.join(' or ')}`
      });
    }
    
    next();
  };
};

module.exports = {
  authenticateToken,
  authenticateUser,
  optionalAuth,
  requireRole,
  clearCompanySecurityCache,
  isIPInWhitelist
};

