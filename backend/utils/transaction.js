/**
 * Database Transaction Utilities
 * 
 * Provides helpers for MongoDB transactions to ensure data consistency
 * during multi-step operations (unit approval, claim creation, etc.).
 * 
 * @module utils/transaction
 */

const mongoose = require('mongoose');

/**
 * Execute a function within a MongoDB transaction
 * 
 * Automatically handles session creation, commit, and rollback.
 * If the callback throws an error, the transaction is aborted.
 * 
 * @param {Function} fn - Async function to execute within transaction
 *                        Receives the session as its argument
 * @returns {Promise} Result of the function
 * 
 * @example
 * const result = await withTransaction(async (session) => {
 *   const unit = await UnitEntry.findByIdAndUpdate(
 *     unitId,
 *     { status: 'approved' },
 *     { session, new: true }
 *   );
 *   await Claim.findByIdAndUpdate(
 *     unit.claimId,
 *     { $inc: { approvedTotal: unit.totalAmount } },
 *     { session }
 *   );
 *   return unit;
 * });
 */
async function withTransaction(fn) {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const result = await fn(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

/**
 * Execute a function with retry logic for transient transaction errors
 * 
 * MongoDB can throw transient errors during high contention.
 * This wrapper retries the transaction up to maxRetries times.
 * 
 * @param {Function} fn - Async function to execute within transaction
 * @param {Object} options - Options
 * @param {number} options.maxRetries - Maximum number of retries (default: 3)
 * @param {number} options.retryDelay - Base delay between retries in ms (default: 100)
 * @returns {Promise} Result of the function
 */
async function withTransactionRetry(fn, options = {}) {
  const { maxRetries = 3, retryDelay = 100 } = options;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await withTransaction(fn);
    } catch (error) {
      // Check if it's a retryable error
      const isRetryable = 
        error.hasErrorLabel?.('TransientTransactionError') ||
        error.code === 112 || // WriteConflict
        error.message?.includes('TransientTransactionError');
      
      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }
      
      console.warn(
        `[Transaction] Transient error on attempt ${attempt}/${maxRetries}, retrying...`,
        error.message
      );
      
      // Exponential backoff
      await new Promise(r => setTimeout(r, retryDelay * attempt));
    }
  }
}

/**
 * Check if transactions are supported on the current MongoDB connection
 * 
 * Transactions require replica sets or sharded clusters.
 * Returns false for standalone MongoDB instances.
 * 
 * @returns {Promise<boolean>} True if transactions are supported
 */
async function supportsTransactions() {
  try {
    // Check if we're connected to a replica set
    const adminDb = mongoose.connection.db.admin();
    const serverStatus = await adminDb.serverStatus();
    return !!(serverStatus.repl || serverStatus.sharding);
  } catch {
    return false;
  }
}

/**
 * Execute a function within a transaction if supported, otherwise run directly
 * 
 * This is useful for development environments that may use standalone MongoDB.
 * In production (with replica sets), transactions will be used automatically.
 * 
 * @param {Function} fn - Async function to execute
 * @param {Object} options - Options (passed to withTransactionRetry if transactions are used)
 * @returns {Promise} Result of the function
 */
async function withOptionalTransaction(fn, options = {}) {
  const hasTransactionSupport = await supportsTransactions();
  
  if (hasTransactionSupport) {
    return withTransactionRetry(fn, options);
  }
  
  // Fallback: run without transaction (for dev environments)
  console.warn('[Transaction] Transactions not supported, running without transaction');
  return fn(null);
}

module.exports = {
  withTransaction,
  withTransactionRetry,
  supportsTransactions,
  withOptionalTransaction
};

