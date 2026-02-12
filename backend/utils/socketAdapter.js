/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * FieldLedger - Socket.IO Redis Adapter
 * Enables horizontal scaling across multiple server instances
 */

const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');
const log = require('./logger');

let pubClient = null;
let subClient = null;

/**
 * Create Redis adapter for Socket.IO
 * Falls back to in-memory adapter if Redis is not configured
 */
async function createRedisAdapter() {
  const redisUrl = process.env.REDIS_URL;
  
  if (!redisUrl) {
    log.info('REDIS_URL not set, using in-memory Socket.IO adapter');
    return null;
  }

  try {
    pubClient = createClient({ url: redisUrl });
    subClient = pubClient.duplicate();

    // Error handlers
    pubClient.on('error', (err) => {
      log.error({ err }, 'Redis Pub Client error');
    });
    
    subClient.on('error', (err) => {
      log.error({ err }, 'Redis Sub Client error');
    });

    // Connect both clients
    await Promise.all([pubClient.connect(), subClient.connect()]);
    
    log.info('Redis adapter connected successfully');
    
    return createAdapter(pubClient, subClient);
  } catch (error) {
    log.error({ err: error }, 'Failed to connect to Redis, falling back to in-memory adapter');
    return null;
  }
}

/**
 * Gracefully close Redis connections
 */
async function closeRedisConnections() {
  try {
    if (pubClient) await pubClient.quit();
    if (subClient) await subClient.quit();
    log.info('Redis connections closed');
  } catch (error) {
    log.error({ err: error }, 'Error closing Redis connections');
  }
}

// Store and retrieve Socket.IO instance for use in route files
let ioInstance = null;

function setIO(io) {
  ioInstance = io;
}

function getIO() {
  return ioInstance;
}

/**
 * Get Redis connection health for deep health check.
 * @returns {{ configured: boolean, connected: boolean, latencyMs: number, error?: string }}
 */
async function getRedisHealth() {
  if (!process.env.REDIS_URL) {
    return { configured: false, connected: false, latencyMs: 0 };
  }

  if (!pubClient) {
    return { configured: true, connected: false, latencyMs: 0, error: 'client_not_initialized' };
  }

  const start = Date.now();
  try {
    await pubClient.ping();
    return { configured: true, connected: true, latencyMs: Date.now() - start };
  } catch (error) {
    return { configured: true, connected: false, latencyMs: Date.now() - start, error: error.message };
  }
}

module.exports = {
  createRedisAdapter,
  closeRedisConnections,
  getRedisHealth,
  setIO,
  getIO
};

