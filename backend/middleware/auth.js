/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 *
 * Authentication Middleware
 * JWT token verification for protected routes.
 * IP whitelist enforcement for enterprise companies.
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Company = require('../models/Company');
const { getClientIP } = require('./ipBlocker');

// ---------------------------------------------------------------------------
// FAIL-FAST: JWT_SECRET is non-negotiable. If it's missing at module load
// time, the process must die immediately — not silently sign tokens with
// undefined. (Ghost Ship Audit Fix #2)
// ---------------------------------------------------------------------------
if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set. Cannot start auth middleware.');
  console.error('Set JWT_SECRET in your environment before starting the server.');
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;

/** Cache for company security settings (avoid DB lookup on every request) */
const companySecurityCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** Window (in seconds) before expiry in which a refreshed token is issued */
const TOKEN_REFRESH_WINDOW_S = 15 * 60; // 15 minutes

/**
 * Get company security settings with caching.
 *
 * @param {import('mongoose').Types.ObjectId|string} companyId
 * @returns {Promise<Object|null>} Security settings or null
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
      companySecurityCache.set(cacheKey, { settings: company.securitySettings, timestamp: Date.now() });
      return company.securitySettings;
    }
  } catch (err) {
    console.error('[Auth] Failed to fetch company settings:', err.message);
  }

  return null;
}

/**
 * Check if an IP is in a whitelist.
 * Supports exact matches and CIDR notation (e.g., "192.168.1.0/24").
 *
 * @param {string} clientIP
 * @param {string[]} whitelist
 * @returns {boolean}
 */
function isIPInWhitelist(clientIP, whitelist) {
  if (!whitelist || whitelist.length === 0) return true;
  if (!clientIP || clientIP === 'unknown') return false;

  for (const entry of whitelist) {
    if (entry === clientIP) return true;

    if (entry.includes('/')) {
      try {
        const [network, bits] = entry.split('/');
        const mask = ~(Math.pow(2, 32 - parseInt(bits)) - 1);
        const ipToNum = (ip) => ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
        if ((ipToNum(clientIP) & mask) === (ipToNum(network) & mask)) return true;
      } catch {
        // Invalid CIDR, skip
      }
    }
  }

  return false;
}

/**
 * Clear company security cache.
 * Call when security settings are updated.
 *
 * @param {string} [companyId] - Clear one company, or all if omitted
 */
function clearCompanySecurityCache(companyId) {
  if (companyId) companySecurityCache.delete(companyId.toString());
  else companySecurityCache.clear();
}

/**
 * Issue a refreshed JWT when the current token is within
 * {@link TOKEN_REFRESH_WINDOW_S} of expiry.
 *
 * The `mfaVerified` claim from the original token is carried forward so
 * that a token refresh does not silently downgrade an MFA-verified session.
 *
 * @param {Object} user - Lean user document (minus password)
 * @param {Object} decoded - Original decoded JWT payload
 * @returns {string} New JWT
 */
function issueRefreshedToken(user, decoded) {
  return jwt.sign(
    {
      userId: user._id,
      isAdmin: user.isAdmin,
      isSuperAdmin: user.isSuperAdmin || false,
      role: user.role,
      canApprove: user.canApprove || false,
      name: user.name,
      mfaVerified: decoded.mfaVerified || false,
      pwv: user.passwordVersion || 0
    },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '24h' }
  );
}

/**
 * Verify JWT token and attach user to request.
 * Also enforces company IP whitelist if configured.
 *
 * **Token refresh**: if the token is within 15 min of expiry a new token
 * is returned via the `X-Refreshed-Token` response header so the
 * frontend can transparently replace it.
 *
 * Populates:
 * - `req.user`, `req.userId`, `req.userEmail`, `req.userName`
 * - `req.userRole`, `req.companyId`
 * - `req.tokenExpiresAt` (Date — when the current token expires)
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @throws {Error} 401 for missing/invalid/expired tokens, 403 for IP whitelist violation
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader;

    if (!token) {
      return res.status(401).json({ error: 'No token provided', code: 'TOKEN_MISSING' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          error: 'Token expired',
          code: 'TOKEN_EXPIRED',
          expiredAt: error.expiredAt
        });
      }
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          error: 'Malformed or invalid token',
          code: 'TOKEN_INVALID'
        });
      }
      if (error.name === 'NotBeforeError') {
        return res.status(401).json({
          error: 'Token not yet valid',
          code: 'TOKEN_NOT_ACTIVE'
        });
      }
      return res.status(401).json({ error: 'Authentication failed', code: 'AUTH_FAILED' });
    }

    // Fetch user to ensure they still exist and get latest data
    const user = await User.findById(decoded.userId || decoded.id)
      .select('-password')
      .lean();

    if (!user) {
      return res.status(401).json({ error: 'User account not found or deactivated', code: 'USER_NOT_FOUND' });
    }

    // ── Password version gate ────────────────────────────────────────────
    // Reject tokens minted before a password change. Pre-feature tokens
    // (no pwv claim) are allowed through until they naturally expire.
    if (decoded.pwv !== undefined && decoded.pwv !== (user.passwordVersion || 0)) {
      return res.status(401).json({
        error: 'Password has been changed. Please log in again.',
        code: 'PASSWORD_CHANGED'
      });
    }

    // ── Company security policy enforcement ─────────────────────────────
    // Single DB lookup (cached 5 min) drives both IP whitelist and MFA checks.
    if (user.companyId) {
      const securitySettings = await getCompanySecuritySettings(user.companyId);

      // IP whitelist (Enterprise security feature)
      if (securitySettings?.ipWhitelist?.length > 0) {
        const clientIP = getClientIP(req);

        if (!isIPInWhitelist(clientIP, securitySettings.ipWhitelist)) {
          console.warn(`[Auth] IP whitelist violation: ${clientIP} not in company whitelist for user ${user.email}`);
          return res.status(403).json({
            error: 'Access denied',
            code: 'IP_NOT_WHITELISTED',
            message: 'Your IP address is not authorized for this organization. Contact your administrator.'
          });
        }
      }

      // Company-enforced MFA (PG&E Exhibit DATA-1 compliance).
      // Deny access when the company requires MFA but this session was not
      // established via the MFA verification flow. Two trigger paths:
      //   1. mfaRequired === true        → all users must complete MFA
      //   2. mfaRequiredForRoles includes this user's role → role-specific
      if (securitySettings && !decoded.mfaVerified) {
        const allUsersRequired = securitySettings.mfaRequired === true;
        const roleRequired =
          Array.isArray(securitySettings.mfaRequiredForRoles) &&
          securitySettings.mfaRequiredForRoles.length > 0 &&
          securitySettings.mfaRequiredForRoles.includes(user.role);

        if (allUsersRequired || roleRequired) {
          return res.status(403).json({
            error: 'MFA verification required',
            code: 'MFA_REQUIRED',
            message: user.mfaEnabled
              ? 'Your organization requires multi-factor authentication. Please log in again and complete MFA verification.'
              : 'Your organization requires multi-factor authentication. Please enable MFA in your account settings, then log in again.',
            mfaEnabled: user.mfaEnabled || false
          });
        }
      }
    }

    // Populate request — companyId is explicitly null when absent, never undefined.
    // This prevents undefined === undefined bypasses in downstream access checks.
    req.user = user;
    req.userId = user._id.toString();
    req.userEmail = user.email;
    req.userName = user.name;
    req.userRole = user.role;
    req.companyId = user.companyId ? user.companyId.toString() : null;
    req.isAdmin = user.isAdmin || false;
    req.isSuperAdmin = user.isSuperAdmin || false;
    req.canApprove = user.canApprove || false;

    // Token expiry info for frontend
    if (decoded.exp) {
      req.tokenExpiresAt = new Date(decoded.exp * 1000);

      // Token refresh: carry mfaVerified forward so refreshes don't downgrade
      const secondsRemaining = decoded.exp - Math.floor(Date.now() / 1000);
      if (secondsRemaining > 0 && secondsRemaining <= TOKEN_REFRESH_WINDOW_S) {
        const refreshedToken = issueRefreshedToken(user, decoded);
        res.setHeader('X-Refreshed-Token', refreshedToken);
      }
    }

    next();
  } catch (error) {
    console.error('[Auth] Unexpected error:', error);
    return res.status(401).json({ error: 'Authentication failed', code: 'AUTH_FAILED' });
  }
};

/**
 * Alias for {@link authenticateToken} (backwards compatibility).
 */
const authenticateUser = authenticateToken;

/**
 * Optional authentication — attaches user if token present, continues otherwise.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader;

    if (!token) return next();

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId || decoded.id)
      .select('-password')
      .lean();

    if (user) {
      req.user = user;
      req.userId = user._id.toString();
    }
    next();
  } catch {
    // Token invalid but optional — continue without user
    next();
  }
};

/**
 * Role-based authorization middleware factory.
 *
 * @param {...string} allowedRoles - Roles that are allowed access
 * @returns {import('express').RequestHandler}
 */
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Access denied',
        code: 'ROLE_FORBIDDEN',
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
