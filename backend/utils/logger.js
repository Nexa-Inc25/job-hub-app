/**
 * FieldLedger - Logger Utility
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Environment-aware logging utility.
 * Suppresses debug logs in production while keeping info/warn/error.
 */

const isDev = process.env.NODE_ENV !== 'production';
const isTest = process.env.NODE_ENV === 'test';

/**
 * Format log prefix with timestamp and level
 */
function formatPrefix(level) {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level.toUpperCase()}]`;
}

/**
 * Logger with environment-aware log levels
 */
const logger = {
  /**
   * Debug logs - only shown in development
   * Use for verbose debugging information
   */
  debug: (...args) => {
    if (isDev && !isTest) {
      console.log(formatPrefix('debug'), ...args);
    }
  },
  
  /**
   * Info logs - shown in all environments
   * Use for important operational information
   */
  info: (...args) => {
    if (!isTest) {
      console.log(formatPrefix('info'), ...args);
    }
  },
  
  /**
   * Warning logs - shown in all environments
   * Use for potential issues that don't break functionality
   */
  warn: (...args) => {
    console.warn(formatPrefix('warn'), ...args);
  },
  
  /**
   * Error logs - shown in all environments
   * Use for errors and exceptions
   */
  error: (...args) => {
    console.error(formatPrefix('error'), ...args);
  },
  
  /**
   * Oracle-specific logger for integration debugging
   */
  oracle: {
    debug: (...args) => logger.debug('[Oracle]', ...args),
    info: (...args) => logger.info('[Oracle]', ...args),
    warn: (...args) => logger.warn('[Oracle]', ...args),
    error: (...args) => logger.error('[Oracle]', ...args),
  },
  
  /**
   * AsBuilt-specific logger
   */
  asbuilt: {
    debug: (...args) => logger.debug('[AsBuilt]', ...args),
    info: (...args) => logger.info('[AsBuilt]', ...args),
    warn: (...args) => logger.warn('[AsBuilt]', ...args),
    error: (...args) => logger.error('[AsBuilt]', ...args),
  },
  
  /**
   * Billing-specific logger
   */
  billing: {
    debug: (...args) => logger.debug('[Billing]', ...args),
    info: (...args) => logger.info('[Billing]', ...args),
    warn: (...args) => logger.warn('[Billing]', ...args),
    error: (...args) => logger.error('[Billing]', ...args),
  },
  
  /**
   * Check if debug logging is enabled
   */
  isDebugEnabled: () => isDev && !isTest,
  
  /**
   * Check if running in production
   */
  isProduction: () => !isDev,
};

module.exports = logger;

