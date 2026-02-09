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
 * This prevents unhandled rejections from crashing the process
 * and ensures all errors are properly handled by secureErrorHandler.
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

