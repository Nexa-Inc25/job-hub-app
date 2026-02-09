/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 * 
 * Authentication Middleware
 * JWT token verification for protected routes
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Verify JWT token and attach user to request
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

    req.user = user;
    req.userId = user._id.toString();
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
  } catch (error) {
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
  requireRole
};

