/**
 * FieldLedger - Security Hardening Middleware
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Additional security layers for PG&E/enterprise compliance.
 */

const crypto = require('node:crypto');

/**
 * Generate unique request ID for audit correlation
 */
const requestId = (req, res, next) => {
  req.requestId = crypto.randomUUID();
  res.setHeader('X-Request-ID', req.requestId);
  next();
};

/**
 * Security headers beyond Helmet defaults
 */
const additionalSecurityHeaders = (req, res, next) => {
  // Prevent browsers from MIME-sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // XSS Protection (legacy but still useful)
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Permissions policy (disable unnecessary features)
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');
  
  // Cache control for sensitive endpoints
  if (req.path.includes('/api/admin') || req.path.includes('/api/auth')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  
  next();
};

/**
 * Sanitize request body - remove potential XSS/injection patterns and NoSQL operators
 * Also validates ObjectId parameters to prevent NoSQL injection via type confusion
 */
const sanitizeInput = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query);
  }
  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeObject(req.params);
    // Validate common ID parameters to ensure they're valid ObjectId strings
    // This prevents NoSQL injection via type confusion attacks
    for (const [key, value] of Object.entries(req.params)) {
      if ((key === 'id' || key.endsWith('Id')) && value) {
        // Ensure it's a string and matches ObjectId format (24 hex chars)
        if (typeof value !== 'string' || !/^[a-fA-F0-9]{24}$/.test(value)) {
          // For security, reject malformed IDs early
          // But allow the route handler to provide a better error message
          req.params[key] = null;
        }
      }
    }
  }
  next();
};

/**
 * Recursively sanitize object to prevent NoSQL injection
 * - Removes keys starting with $ (MongoDB operators)
 * - Removes prototype pollution attempts
 * - Sanitizes string values
 */
function sanitizeObject(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  // Handle strings
  if (typeof obj === 'string') {
    // Remove null bytes
    let cleaned = obj.replace(/\0/g, '');
    
    // Limit string length to prevent DoS
    if (cleaned.length > 50000) {
      cleaned = cleaned.substring(0, 50000);
    }
    
    return cleaned;
  }
  
  // Handle non-objects
  if (typeof obj !== 'object') {
    return obj;
  }
  
  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  
  // Handle Date objects
  if (obj instanceof Date) {
    return obj;
  }
  
  // Handle plain objects - remove dangerous keys
  const result = {};
  for (const key of Object.keys(obj)) {
    // Block MongoDB operators ($where, $gt, $ne, etc.)
    if (key.startsWith('$')) {
      console.warn(`[SECURITY] Blocked MongoDB operator in input: ${key}`);
      continue;
    }
    
    // Block prototype pollution attempts
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      console.warn(`[SECURITY] Blocked prototype pollution attempt: ${key}`);
      continue;
    }
    
    result[key] = sanitizeObject(obj[key]);
  }
  
  return result;
}

/**
 * Validate content type for POST/PUT/PATCH requests
 */
const validateContentType = (req, res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const contentType = req.headers['content-type'] || '';
    
    // Skip for file uploads
    if (contentType.includes('multipart/form-data')) {
      return next();
    }
    
    // Require proper content type for JSON endpoints
    if (req.path.startsWith('/api/') && !contentType.includes('application/json') && !contentType.includes('application/x-www-form-urlencoded')) {
      // Allow if no body
      if (req.body && Object.keys(req.body).length > 0) {
        console.warn(`Invalid content type for ${req.method} ${req.path}: ${contentType}`);
      }
    }
  }
  next();
};

/**
 * Prevent parameter pollution
 */
const preventParamPollution = (req, res, next) => {
  // If query params are arrays, take only the first value
  if (req.query) {
    for (const key of Object.keys(req.query)) {
      if (Array.isArray(req.query[key])) {
        req.query[key] = req.query[key][0];
      }
    }
  }
  next();
};

/**
 * Log slow requests (potential DoS or performance issues)
 */
const slowRequestLogger = (threshold = 10000) => (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > threshold) {
      console.warn(`[SLOW REQUEST] ${req.method} ${req.path} took ${duration}ms`);
    }
  });
  
  next();
};

/**
 * Block suspicious user agents (basic bot protection)
 */
const blockSuspiciousAgents = (req, res, next) => {
  const ua = req.headers['user-agent'] || '';
  
  // Block empty user agents on API endpoints
  if (!ua && req.path.startsWith('/api/') && req.path !== '/api/health') {
    console.warn(`Blocked request with no user-agent: ${req.method} ${req.path} from ${req.ip}`);
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  // Block known malicious patterns
  const suspiciousPatterns = [
    /sqlmap/i,
    /nikto/i,
    /nessus/i,
    /burpsuite/i,
    /nmap/i,
    /masscan/i,
  ];
  
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(ua)) {
      console.warn(`Blocked suspicious user-agent: ${ua} from ${req.ip}`);
      return res.status(403).json({ error: 'Forbidden' });
    }
  }
  
  next();
};

/**
 * Secure error handler - never leak stack traces
 */
const secureErrorHandler = (err, req, res, next) => {
  // Log full error internally
  console.error(`[ERROR] ${req.method} ${req.path}:`, err);
  
  // Never expose internal errors to client
  const statusCode = err.statusCode || err.status || 500;
  
  // Sanitize error message
  let message = 'An error occurred';
  
  if (statusCode === 400) {
    message = err.message || 'Bad request';
  } else if (statusCode === 401) {
    message = 'Authentication required';
  } else if (statusCode === 403) {
    message = 'Access denied';
  } else if (statusCode === 404) {
    message = 'Resource not found';
  } else if (statusCode === 429) {
    message = 'Too many requests';
  }
  
  res.status(statusCode).json({
    error: message,
    requestId: req.requestId
  });
};

/**
 * Request size limits per endpoint type
 */
const REQUEST_LIMITS = {
  default: '1mb',
  upload: '150mb',
  json: '10mb'
};

const asyncHandler = require('./asyncHandler');

module.exports = {
  requestId,
  additionalSecurityHeaders,
  sanitizeInput,
  validateContentType,
  preventParamPollution,
  slowRequestLogger,
  blockSuspiciousAgents,
  secureErrorHandler,
  asyncHandler,
  REQUEST_LIMITS
};

