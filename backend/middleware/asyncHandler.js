/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Async Handler Middleware
 * 
 * Wraps async route handlers to catch unhandled promise rejections
 * and forward them to Express error handling middleware.
 * 
 * NOTE: Express 5 natively catches rejected promises in async handlers
 * and forwards them to error middleware, making this wrapper technically
 * optional. However, keeping it is harmless and ensures backward
 * compatibility with Express 4 patterns. It can be safely removed
 * once all code has been audited against Express 5 error handling.
 * 
 * @example
 * router.get('/users', asyncHandler(async (req, res) => {
 *   const users = await User.find();
 *   res.json(users);
 * }));
 */

/**
 * Wrap an async function to catch errors and pass to next()
 * @param {Function} fn - Async route handler function
 * @returns {Function} Express middleware function
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;

