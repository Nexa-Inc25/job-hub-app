/**
 * FieldLedger - Unit-Price Billing for Utility Contractors
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and Confidential. Unauthorized copying or distribution prohibited.
 */

require('dotenv').config();

// ============================================
// SENTRY — must be initialized before all other imports
// Captures unhandled exceptions, unhandled rejections, and Express errors.
// Only active when SENTRY_DSN is set (production). Silent no-op otherwise.
// ============================================
const Sentry = require('@sentry/node');
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.npm_package_version || '1.0.0',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
    attachStacktrace: true,
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
      }
      return event;
    },
  });
}

// ============================================
// STRUCTURED LOGGING — must be first after dotenv
// Redirects all console.log/warn/error through pino for JSON output in production
// ============================================
const log = require('./utils/logger');
const { redirectConsole } = require('./utils/logger');
redirectConsole();

log.info('=== Server starting ===');
log.info({ nodeVersion: process.version, heapMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) }, 'Process info');

// ============================================
// ENVIRONMENT VALIDATION - Fail fast on missing config
// ============================================
const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!mongoUri) {
  console.error('❌ FATAL: Missing MongoDB connection string');
  console.error('   Set either MONGODB_URI or MONGO_URI environment variable.');
  console.error('   See .env.example for required variables.');
  process.exit(1);
}
if (!process.env.JWT_SECRET) {
  console.error('❌ FATAL: Missing JWT_SECRET environment variable');
  console.error('   See .env.example for required variables.');
  process.exit(1);
}
process.env.MONGODB_URI = mongoUri;

if (process.env.NODE_ENV === 'production') {
  if (process.env.JWT_SECRET?.length < 32) {
    console.warn('⚠️  WARNING: JWT_SECRET is too short for production. Use 32+ characters.');
  }
}

const express = require('express');
const mongoose = require('mongoose');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const fs = require('fs');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
const Job = require('./models/Job');
const {
  requestId,
  additionalSecurityHeaders,
  sanitizeInput,
  preventParamPollution,
  slowRequestLogger,
  blockSuspiciousAgents,
  secureErrorHandler
} = require('./middleware/security');
const {
  loginValidation,
  signupValidation,
  mfaValidation
} = require('./middleware/validators');
const {
  ipBlockerMiddleware,
  loginAttemptTracker
} = require('./middleware/ipBlocker');
const { createRateLimiter } = require('./middleware/security');
const { authenticateUser } = require('./middleware/auth');
const authController = require('./controllers/auth.controller');
const r2Storage = require('./utils/storage');
const { setupSwagger } = require('./config/swagger');
const { registerRoutes } = require('./routes');

log.info({ heapMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) }, 'All modules loaded');
console.log('R2 Storage configured:', r2Storage.isR2Configured());

const app = express();
const server = http.createServer(app);

// ============================================
// HEALTH CHECK - FIRST! (Before all middleware for fast response)
// ============================================
/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Health check endpoint
 *     tags: [Health]
 *     security: []
 *     responses:
 *       200:
 *         description: Server is healthy
 */
app.get('/api/health', (req, res) => {
  const memUsage = process.memoryUsage();
  const dbState = mongoose.connection.readyState;
  const dbStates = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
  const { getCircuitBreakerHealth } = require('./utils/circuitBreaker');
  const circuitHealth = getCircuitBreakerHealth();
  const isDbHealthy = dbState === 1 || dbState === 2;
  const hasOpenCircuits = circuitHealth.openai.isOpen || circuitHealth.r2.isOpen;
  const isHealthy = isDbHealthy;

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? (hasOpenCircuits ? 'degraded' : 'ok') : 'unhealthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    database: { status: dbStates[dbState] || 'unknown', connected: dbState === 1 },
    services: {
      storage: {
        configured: r2Storage.isR2Configured(),
        status: r2Storage.isR2Configured() ? (circuitHealth.r2.isOpen ? 'circuit_open' : 'ok') : 'local_fallback',
        failures: circuitHealth.r2.failures
      },
      ai: {
        configured: Boolean(process.env.OPENAI_API_KEY),
        status: process.env.OPENAI_API_KEY ? (circuitHealth.openai.isOpen ? 'circuit_open' : 'ok') : 'disabled',
        failures: circuitHealth.openai.failures
      }
    },
    system: {
      uptime: Math.floor(process.uptime()),
      memory: { heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), unit: 'MB' }
    },
    features: { aiEnabled: Boolean(process.env.OPENAI_API_KEY), r2Storage: r2Storage.isR2Configured() }
  });
});

/**
 * @swagger
 * /api/health/deep:
 *   get:
 *     summary: Deep health check with live service pings
 *     tags: [Health]
 *     security: []
 *     responses:
 *       200:
 *         description: All critical services healthy
 *       503:
 *         description: One or more critical services unreachable
 */
app.get('/api/health/deep', async (_req, res) => {
  const checks = {};
  const TIMEOUT_MS = 5000;
  const withTimeout = (promise, label) =>
    Promise.race([promise, new Promise((_resolve, reject) => setTimeout(() => reject(new Error(`${label} health check timed out`)), TIMEOUT_MS))]);

  const mongoStart = Date.now();
  try {
    await withTimeout(mongoose.connection.db.admin().ping(), 'MongoDB');
    checks.mongodb = { ok: true, latencyMs: Date.now() - mongoStart };
  } catch (err) {
    checks.mongodb = { ok: false, latencyMs: Date.now() - mongoStart, error: err.message };
  }

  try { checks.storage = await withTimeout(r2Storage.pingStorage(), 'R2'); } catch (err) { checks.storage = { ok: false, latencyMs: 0, error: err.message }; }

  const { getRedisHealth } = require('./utils/socketAdapter');
  try { checks.redis = await withTimeout(getRedisHealth(), 'Redis'); } catch (err) { checks.redis = { configured: Boolean(process.env.REDIS_URL), connected: false, latencyMs: 0, error: err.message }; }

  const { getCircuitBreakerHealth } = require('./utils/circuitBreaker');
  checks.circuitBreakers = getCircuitBreakerHealth();

  const criticalOk = checks.mongodb.ok;
  const storageOk = checks.storage.ok || checks.storage.error === 'not_configured';
  const redisOk = !checks.redis.configured || checks.redis.connected;
  const allOk = criticalOk && storageOk && redisOk;
  const status = criticalOk ? (allOk ? 'ok' : 'degraded') : 'unhealthy';

  res.status(criticalOk ? 200 : 503).json({
    status, timestamp: new Date().toISOString(), version: process.env.npm_package_version || '1.0.0', checks,
    system: { uptime: Math.floor(process.uptime()), memory: { heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024), heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024), rss: Math.round(process.memoryUsage().rss / 1024 / 1024), unit: 'MB' }, nodeVersion: process.version }
  });
});

const PORT = process.env.PORT || 5000;
console.log('Health endpoints registered');

// ============================================
// API DOCUMENTATION
// ============================================
setupSwagger(app);
app.set('trust proxy', 1);

// ============================================
// SECURITY MIDDLEWARE
// ============================================
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://*.r2.cloudflarestorage.com', 'https://*.cloudflare.com'],
      connectSrc: ["'self'", 'https://api.openweathermap.org', 'https://api.openai.com', 'https://*.r2.cloudflarestorage.com', 'wss://*'],
      frameSrc: ["'none'"], objectSrc: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"], upgradeInsecureRequests: []
    }
  },
  frameguard: { action: 'deny' }, noSniff: true, xssFilter: true
}));

app.use(requestId);
app.use(additionalSecurityHeaders);
app.use(ipBlockerMiddleware);
app.use(blockSuspiciousAgents);
app.use(preventParamPollution);
app.use(sanitizeInput);
app.use(slowRequestLogger(15000));

// Express 5 compatibility shim: materialize req.query into writable data property
app.use((req, _res, next) => {
  const q = req.query;
  Object.defineProperty(req, 'query', { value: q, writable: true, configurable: true, enumerable: true });
  next();
});

app.use(mongoSanitize());

// ============================================
// RATE LIMITING (per-route overrides via createRateLimiter)
// ============================================
const authLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 15, message: 'Too many login attempts, please try again after 15 minutes' });
const apiLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 300, message: 'Too many requests, please slow down', skip: (req) => req.path === '/api/health' || req.path === '/api/health/deep' });
const heavyLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 30, message: 'Too many file operations, please wait' });
const aiLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 10, message: 'Too many AI requests, please wait' });

app.use('/api/login', authLimiter, loginAttemptTracker);
app.use('/api/signup', authLimiter);
app.use('/api/ai/*path', aiLimiter);
app.use('/api/billing/claims/:claimId/export', heavyLimiter);
app.use('/api/billing/export', heavyLimiter);
app.use('/api/files/upload', heavyLimiter);
app.use('/api/asbuilt/submit', heavyLimiter);
app.use('/api/', apiLimiter);

// ============================================
// CORS
// ============================================
const envCorsOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(o => o.trim()).filter(Boolean) : [];
const productionOrigins = [
  'https://fieldledger.io', 'https://www.fieldledger.io', 'https://app.fieldledger.io',
  'https://fieldledger.vercel.app', ...envCorsOrigins, process.env.FRONTEND_URL,
];
const devOrigins = process.env.NODE_ENV === 'production' ? [] : ['http://localhost:3000', 'http://localhost:5173'];
const uniqueOrigins = [...new Set([...productionOrigins, ...devOrigins].filter(Boolean))];

console.log('Allowed CORS origins:', uniqueOrigins);

const io = socketIo(server, { cors: { origin: uniqueOrigins, methods: ['GET', 'POST'], credentials: true }, pingTimeout: 60000, pingInterval: 25000 });

const notificationService = require('./services/notification.service');
notificationService.initialize(io);

const { createRedisAdapter, setIO } = require('./utils/socketAdapter');
setIO(io);
(async () => {
  try {
    const redisAdapter = await createRedisAdapter();
    if (redisAdapter) { io.adapter(redisAdapter); console.log('[Socket.IO] Using Redis adapter for scaling'); }
  } catch (err) { console.error('[Socket.IO] Redis adapter setup failed:', err.message); }
})();

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && uniqueOrigins.includes(origin)) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Access-Control-Allow-Credentials', 'true'); }
  else if (!origin) { res.setHeader('Access-Control-Allow-Origin', '*'); }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

app.get('/', (_req, res) => {
  res.json({ name: 'FieldLedger API', version: '1.0.0-pilot', status: 'running', health: '/api/health', docs: 'Coming soon' });
});

// Stripe webhook needs raw body — must be BEFORE express.json()
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Uploads directory
let uploadsDir = path.join(__dirname, 'uploads');
try {
  if (!fs.existsSync(uploadsDir)) { fs.mkdirSync(uploadsDir, { recursive: true }); }
} catch (err) {
  console.warn('Could not create uploads dir, using /tmp:', err.message);
  uploadsDir = '/tmp/uploads';
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
}

// ============================================
// AUTH ENDPOINTS (mounted directly — before route modules)
// ============================================
app.post('/api/signup', signupValidation, authController.signup);
app.post('/api/login', loginValidation, authController.login);
app.post('/api/auth/mfa/verify', mfaValidation, authController.verifyMfa);
app.post('/api/auth/mfa/setup', authenticateUser, authController.setupMfa);
app.post('/api/auth/mfa/enable', authenticateUser, mfaValidation, authController.enableMfa);
app.post('/api/auth/mfa/disable', authenticateUser, authController.disableMfa);
app.get('/api/auth/mfa/status', authenticateUser, authController.getMfaStatus);

// ============================================
// ROUTE MODULES (via route loader)
// ============================================
registerRoutes(app, { uploadsDir });

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ============================================
// MONGODB CONNECTION WITH RETRY
// ============================================
const { runMigration } = require('./utils/migration');
const { scheduleCleanup: scheduleDemoCleanup } = require('./utils/demoCleanup');
const Company = require('./models/Company');

const MONGO_OPTIONS = { maxPoolSize: 10, serverSelectionTimeoutMS: 5000, socketTimeoutMS: 45000, retryWrites: true, w: 'majority' };

/**
 * Connect to MongoDB with exponential backoff retry.
 * @param {number} [maxRetries=5]
 * @returns {Promise<boolean>}
 */
async function connectWithRetry(maxRetries = 5) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI, MONGO_OPTIONS);
      console.log('MongoDB connected successfully');
      return true;
    } catch (err) {
      console.error(`MongoDB connection attempt ${attempt}/${maxRetries} failed:`, err.message);
      if (attempt === maxRetries) {
        console.error('❌ FATAL: Could not connect to MongoDB after', maxRetries, 'attempts');
        if (process.env.NODE_ENV === 'production') process.exit(1);
        throw err;
      }
      const delay = Math.pow(2, attempt - 1) * 1000;
      console.log(`Retrying in ${delay / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

mongoose.connection.on('disconnected', () => { console.warn('⚠️ MongoDB disconnected. Attempting to reconnect...'); });
mongoose.connection.on('reconnected', () => { console.log('✅ MongoDB reconnected'); });
mongoose.connection.on('error', (err) => { console.error('MongoDB connection error:', err.message); });

connectWithRetry()
  .then(async () => {
    await runMigration();

    // Reset stuck AI extractions
    try {
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      const stuckExtractions = await Job.updateMany(
        { aiExtractionStarted: { $lt: thirtyMinutesAgo }, aiExtractionComplete: { $ne: true } },
        { $unset: { aiExtractionStarted: 1, aiExtractionEnded: 1, aiProcessingTimeMs: 1 }, $set: { aiExtractionComplete: false } }
      );
      if (stuckExtractions.modifiedCount > 0) console.log(`[CLEANUP] Reset ${stuckExtractions.modifiedCount} stuck AI extractions`);
    } catch (cleanupErr) { console.error('[CLEANUP] Error resetting stuck extractions:', cleanupErr.message); }

    scheduleDemoCleanup();

    // Security review cadence enforcement — log warnings for overdue companies
    try {
      const overdue = await Company.find({
        isActive: true,
        'securitySettings.nextSecurityReview': { $lt: new Date() }
      }).select('name securitySettings.nextSecurityReview').lean();

      for (const c of overdue) {
        log.warn({ company: c.name, overdueDate: c.securitySettings?.nextSecurityReview }, '[COMPLIANCE] Security review overdue');
      }
      if (overdue.length > 0) {
        log.warn({ count: overdue.length }, `[COMPLIANCE] ${overdue.length} company(ies) have overdue security reviews`);
      }
    } catch (err) { log.error({ err }, '[COMPLIANCE] Failed to check security review cadence'); }

    server.listen(PORT, '0.0.0.0', () => {
      log.info({ port: PORT, env: process.env.NODE_ENV || 'development', health: '/api/health', deepHealth: '/api/health/deep', docs: '/api-docs', demo: '/api/demo/start-session' }, 'Server listening');
      const { oracleService } = require('./services/oracle');
      const oracleStatus = oracleService.getStatus();
      const unconfigured = Object.entries(oracleStatus).filter(([, s]) => !s.configured).map(([name]) => name);
      if (unconfigured.length > 0) { console.warn(`⚠️  Oracle integrations in MOCK MODE: ${unconfigured.join(', ')}`); }
      else { console.log('   Oracle integrations: All configured'); }
    });
  })
  .catch(err => { console.error('MongoDB connection failed:', err); process.exit(1); });

// ============================================
// Socket.IO Authentication & Connection Handling
// ============================================
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
    if (!token) return next(new Error('Authentication required'));
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('_id name email role companyId').lean();
    if (!user) return next(new Error('User not found'));
    socket.user = user;
    socket.userId = user._id.toString();
    socket.companyId = user.companyId?.toString();
    next();
  } catch (err) { console.error('[Socket.IO] Auth error:', err.message); next(new Error('Invalid token')); }
});

io.on('connection', (socket) => {
  const { userId, companyId, user } = socket;
  console.log(`[Socket.IO] User connected: ${user.name} (${userId})`);
  socket.join(`user:${userId}`);
  if (companyId) socket.join(`company:${companyId}`);

  // Tenant-scoped job room join — prevents cross-company real-time data leaks.
  // Before subscribing to a job's events, verify the job belongs to the user's
  // company (fail-closed: no companyId or no matching job = denied).
  socket.on('join:job', async (jobId) => {
    if (!jobId || !mongoose.Types.ObjectId.isValid(jobId)) {
      return socket.emit('error', { code: 'INVALID_JOB_ID', message: 'Invalid job ID' });
    }

    if (!companyId) {
      return socket.emit('error', { code: 'NO_COMPANY', message: 'Company context required' });
    }

    try {
      const job = await Job.findOne({ _id: jobId, companyId }).select('_id').lean();
      if (!job) {
        log.warn({ userId, companyId, jobId }, '[Socket.IO] join:job denied — tenant mismatch');
        return socket.emit('error', { code: 'JOB_ACCESS_DENIED', message: 'Access denied' });
      }

      socket.join(`job:${jobId}`);
    } catch (err) {
      log.error({ err, userId, jobId }, '[Socket.IO] join:job ownership check failed');
      socket.emit('error', { code: 'JOIN_ERROR', message: 'Failed to join job room' });
    }
  });

  socket.on('leave:job', (jobId) => { socket.leave(`job:${jobId}`); });
  socket.on('disconnect', (reason) => { console.log(`[Socket.IO] User disconnected: ${user.name} (${reason})`); });
  socket.emit('connected', { userId, userName: user.name });
});

// ============================================
// ERROR HANDLING — single handler, never leaks stack traces in production
// ============================================
app.use((err, req, res, _next) => {
  const rid = req.requestId || req.headers['x-request-id'] || 'unknown';
  const statusCode = err.statusCode || err.status || 500;

  if (statusCode >= 500) {
    Sentry.captureException(err, {
      tags: { requestId: rid },
      extra: { path: req.path, method: req.method, userId: req.userId, companyId: req.companyId },
    });
  }

  log.error({ err, method: req.method, path: req.path, requestId: rid }, 'Express error');

  let message = 'An error occurred';
  if (statusCode === 400) message = err.message || 'Bad request';
  else if (statusCode === 401) message = 'Authentication required';
  else if (statusCode === 403) message = 'Access denied';
  else if (statusCode === 404) message = 'Resource not found';
  else if (statusCode === 429) message = 'Too many requests';

  res.status(statusCode).json({ error: message, requestId: rid });
});

process.on('uncaughtException', (err) => {
  Sentry.captureException(err, { tags: { fatal: true } });
  log.fatal({ err }, 'Uncaught Exception');
  setTimeout(() => process.exit(1), 1000);
});
process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  Sentry.captureException(err, { tags: { unhandledRejection: true } });
  log.error({ err }, 'Unhandled Rejection');
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================
let isShuttingDown = false;
async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  log.info({ signal }, 'Graceful shutdown starting');
  server.close(async () => {
    log.info('HTTP server closed');
    try {
      await Sentry.flush(2000);
      await mongoose.connection.close(); log.info('MongoDB connection closed');
      io.close(); log.info('Socket.io closed');
      log.info('Graceful shutdown complete'); process.exit(0);
    }
    catch (err) { log.error({ err }, 'Error during shutdown'); process.exit(1); }
  });
  setTimeout(() => { log.error('Forced shutdown after 30s timeout'); process.exit(1); }, 30000);
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
