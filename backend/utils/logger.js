/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Structured Logger (pino)
 *
 * Replaces console.log/warn/error across the backend with JSON-structured
 * log output suitable for Railway, Datadog, Grafana Loki, etc.
 *
 * Usage (direct — preferred for new code):
 *   const log = require('../utils/logger');
 *   log.info('Server started');
 *   log.info({ port: 5000 }, 'Listening');
 *   log.warn({ userId, durationMs: 1200 }, 'Slow request');
 *   log.error({ err }, 'Unhandled exception');
 *
 * Legacy console.* calls are automatically redirected through pino via
 * `redirectConsole()`, so existing code gets structured output with zero
 * refactoring.  New code should use the logger directly for structured data.
 *
 * In development, pino-pretty renders human-friendly coloured output.
 * In production, raw JSON lines are emitted (one object per line).
 *
 * Environment variables:
 *   LOG_LEVEL  – pino level name (default: "info" in prod, "debug" otherwise)
 */

const pino = require('pino');

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

const logger = pino({
  level: process.env.LOG_LEVEL || (isTest ? 'silent' : isProduction ? 'info' : 'debug'),

  // In production emit raw JSON; in dev use pino-pretty for readability
  ...(isProduction || isTest
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname'
          }
        }
      }),

  // Serialise Error objects properly
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err
  },

  // Add service name so log aggregators can filter
  base: isProduction ? { service: 'fieldledger-api' } : undefined
});

/**
 * Format a single argument for message concatenation.
 * Errors keep their stack, objects become JSON, everything else -> String.
 *
 * @param {*} arg - Value to format
 * @returns {string} Formatted string
 */
function formatArg(arg) {
  if (arg instanceof Error) return arg.stack || arg.message;
  if (typeof arg === 'object' && arg !== null) {
    try { return JSON.stringify(arg); } catch { return String(arg); }
  }
  return String(arg);
}

/**
 * Redirect global console methods through pino.
 * Call once at the top of server.js so ALL logging (including
 * third-party libs) is captured as structured JSON in production.
 *
 * After calling this, `console.log('msg', value)` produces:
 *   `{"level":30,"time":1707600000000,"msg":"msg value"}`
 *
 * @returns {void}
 */
function redirectConsole() {
  const original = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    info: console.info.bind(console),
    debug: console.debug.bind(console)
  };

  console.log   = (...args) => logger.info(args.map(formatArg).join(' '));
  console.info  = (...args) => logger.info(args.map(formatArg).join(' '));
  console.warn  = (...args) => logger.warn(args.map(formatArg).join(' '));
  console.error = (...args) => logger.error(args.map(formatArg).join(' '));
  console.debug = (...args) => logger.debug(args.map(formatArg).join(' '));

  // Expose originals for rare cases where raw console is needed (e.g. tests)
  console._original = original;
}

module.exports = logger;
module.exports.redirectConsole = redirectConsole;
