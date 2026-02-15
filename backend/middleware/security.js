/**
 * FieldLedger - Security Hardening Middleware
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 *
 * Additional security layers for PG&E/enterprise compliance.
 */

const crypto = require('node:crypto');
const rateLimit = require('express-rate-limit');
const log = require('../utils/logger');

/**
 * Generate unique request ID for audit correlation and attach a
 * pino child logger to the request so every downstream log line
 * includes the request-id automatically.
 *
 * Sets the `X-Request-ID` response header and `req.requestId`.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const requestId = (req, res, next) => {
  const id = req.headers['x-request-id'] || crypto.randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-ID', id);

  // Pino child logger scoped to this request
  req.log = log.child({ requestId: id });

  next();
};

/**
 * Security headers beyond Helmet defaults.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const additionalSecurityHeaders = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');

  if (req.path.includes('/api/admin') || req.path.includes('/api/auth')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }

  next();
};

/**
 * Sanitize request body — remove potential XSS/injection patterns and NoSQL operators.
 * Also validates ObjectId parameters to prevent NoSQL injection via type confusion.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const sanitizeInput = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    const sanitizedQuery = sanitizeObject(req.query);
    Object.defineProperty(req, 'query', { value: sanitizedQuery, writable: true, configurable: true, enumerable: true });
  }
  if (req.params && typeof req.params === 'object') {
    const sanitizedParams = sanitizeObject(req.params);
    for (const key of Object.keys(req.params)) { delete req.params[key]; }
    Object.assign(req.params, sanitizedParams);
    for (const [key, value] of Object.entries(req.params)) {
      if ((key === 'id' || key.endsWith('Id')) && value) {
        if (typeof value !== 'string' || !/^[a-fA-F0-9]{24}$/.test(value)) {
          req.params[key] = null;
        }
      }
    }
  }
  next();
};

/**
 * Recursively sanitize an object to prevent NoSQL injection.
 * Removes keys starting with `$` (MongoDB operators) and prototype-pollution attempts.
 *
 * @param {*} obj - Value to sanitize
 * @returns {*} Sanitized value
 */
function sanitizeObject(obj) {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    let cleaned = obj.replace(/\0/g, '');
    if (cleaned.length > 50000) cleaned = cleaned.substring(0, 50000);
    return cleaned;
  }

  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeObject);
  if (obj instanceof Date) return obj;

  const result = {};
  for (const key of Object.keys(obj)) {
    if (key.startsWith('$')) { log.warn({ blockedKey: key }, 'Blocked MongoDB operator in input'); continue; }
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') { log.warn({ blockedKey: key }, 'Blocked prototype pollution attempt'); continue; }
    result[key] = sanitizeObject(obj[key]);
  }
  return result;
}

/**
 * Validate content type for POST/PUT/PATCH requests.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const validateContentType = (req, res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('multipart/form-data')) return next();
    if (req.path.startsWith('/api/') && !contentType.includes('application/json') && !contentType.includes('application/x-www-form-urlencoded')) {
      if (req.body && Object.keys(req.body).length > 0) {
        log.warn({ method: req.method, path: req.path, contentType }, 'Invalid content type');
      }
    }
  }
  next();
};

/**
 * Prevent parameter pollution — when query params are arrays, keep only the first value.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const preventParamPollution = (req, res, next) => {
  if (req.query) {
    const query = { ...req.query };
    let modified = false;
    for (const key of Object.keys(query)) {
      if (Array.isArray(query[key])) { query[key] = query[key][0]; modified = true; }
    }
    if (modified) {
      Object.defineProperty(req, 'query', { value: query, writable: true, configurable: true, enumerable: true });
    }
  }
  next();
};

/**
 * Log slow requests (potential DoS or performance issues).
 *
 * @param {number} [threshold=10000] - Duration in ms after which a request is considered slow
 * @returns {import('express').RequestHandler}
 */
const slowRequestLogger = (threshold = 10000) => (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > threshold) log.warn({ method: req.method, path: req.path, durationMs: duration, requestId: req.requestId }, 'Slow request');
  });
  next();
};

/**
 * Block suspicious user agents (basic bot protection).
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const blockSuspiciousAgents = (req, res, next) => {
  const ua = req.headers['user-agent'] || '';

  if (!ua && req.path.startsWith('/api/') && req.path !== '/api/health') {
    log.warn({ method: req.method, path: req.path, ip: req.ip }, 'Blocked request with no user-agent');
    return res.status(403).json({ error: 'Forbidden' });
  }

  const suspiciousPatterns = [/sqlmap/i, /nikto/i, /nessus/i, /burpsuite/i, /nmap/i, /masscan/i];
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(ua)) { log.warn({ userAgent: ua, ip: req.ip }, 'Blocked suspicious user-agent'); return res.status(403).json({ error: 'Forbidden' }); }
  }

  next();
};

/**
 * Secure error handler — never leak stack traces.
 *
 * @param {Error} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next
 */
const secureErrorHandler = (err, req, res, _next) => {
  log.error({ err, method: req.method, path: req.path, requestId: req.requestId }, 'Express error');
  const statusCode = err.statusCode || err.status || 500;

  let message = 'An error occurred';
  if (statusCode === 400) message = err.message || 'Bad request';
  else if (statusCode === 401) message = 'Authentication required';
  else if (statusCode === 403) message = 'Access denied';
  else if (statusCode === 404) message = 'Resource not found';
  else if (statusCode === 429) message = 'Too many requests';

  res.status(statusCode).json({ error: message, requestId: req.requestId });
};

/**
 * Request size limits per endpoint type.
 * @type {{ default: string, upload: string, json: string }}
 */
const REQUEST_LIMITS = { default: '1mb', upload: '150mb', json: '10mb' };

// ---------------------------------------------------------------------------
// Per-route rate-limiter factory  (Task 4)
// ---------------------------------------------------------------------------

/**
 * Create a per-route rate limiter with custom options.
 *
 * @param {Object} opts
 * @param {number}  opts.windowMs   - Time window in milliseconds (default 60 000)
 * @param {number}  opts.max        - Max requests per window (default 100)
 * @param {string}  opts.message    - Error message returned to client
 * @param {Function} [opts.skip]    - Optional skip predicate `(req) => boolean`
 * @param {Function} [opts.keyGenerator] - Optional key generator `(req) => string`
 * @returns {import('express').RequestHandler}
 */
function createRateLimiter(opts = {}) {
  const {
    windowMs = 60 * 1000,
    max = 100,
    message = 'Too many requests, please slow down',
    skip,
    keyGenerator
  } = opts;

  const cfg = {
    windowMs,
    max,
    message: { error: message, retryAfter: Math.ceil(windowMs / 1000) },
    standardHeaders: true,
    legacyHeaders: false
  };

  if (typeof skip === 'function') cfg.skip = skip;
  if (typeof keyGenerator === 'function') cfg.keyGenerator = keyGenerator;

  return rateLimit(cfg);
}

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
  REQUEST_LIMITS,
  createRateLimiter
};
