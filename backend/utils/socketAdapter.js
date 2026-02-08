/**
 * FieldLedger - Socket.IO Redis Adapter
 * Enables horizontal scaling across multiple server instances
 */

const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');

let pubClient = null;
let subClient = null;

/**
 * Create Redis adapter for Socket.IO
 * Falls back to in-memory adapter if Redis is not configured
 */
async function createRedisAdapter() {
  const redisUrl = process.env.REDIS_URL;
  
  if (!redisUrl) {
    console.log('[SocketAdapter] REDIS_URL not set, using in-memory adapter');
    return null;
  }

  try {
    pubClient = createClient({ url: redisUrl });
    subClient = pubClient.duplicate();

    // Error handlers
    pubClient.on('error', (err) => {
      console.error('[SocketAdapter] Redis Pub Client Error:', err.message);
    });
    
    subClient.on('error', (err) => {
      console.error('[SocketAdapter] Redis Sub Client Error:', err.message);
    });

    // Connect both clients
    await Promise.all([pubClient.connect(), subClient.connect()]);
    
    console.log('[SocketAdapter] Redis adapter connected successfully');
    
    return createAdapter(pubClient, subClient);
  } catch (error) {
    console.error('[SocketAdapter] Failed to connect to Redis:', error.message);
    console.log('[SocketAdapter] Falling back to in-memory adapter');
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
    console.log('[SocketAdapter] Redis connections closed');
  } catch (error) {
    console.error('[SocketAdapter] Error closing Redis connections:', error.message);
  }
}

module.exports = {
  createRedisAdapter,
  closeRedisConnections
};

