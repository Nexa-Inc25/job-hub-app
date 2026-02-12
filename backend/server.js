/**
 * FieldLedger - Unit-Price Billing for Utility Contractors
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and Confidential. Unauthorized copying or distribution prohibited.
 */

require('dotenv').config();

console.log('=== Server starting ===');
console.log('Node version:', process.version);
console.log('Memory usage:', Math.round(process.memoryUsage().heapUsed / 1024 / 1024), 'MB');

// ============================================
// ENVIRONMENT VALIDATION - Fail fast on missing config
// ============================================
// Support both MONGODB_URI and MONGO_URI for flexibility
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
// Normalize to MONGODB_URI for consistent access
process.env.MONGODB_URI = mongoUri;

// Warn about insecure defaults in production
if (process.env.NODE_ENV === 'production') {
  if (process.env.JWT_SECRET?.length < 32) {
    console.warn('⚠️  WARNING: JWT_SECRET is too short for production. Use 32+ characters.');
  }
}

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const crypto = require('node:crypto');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
const Job = require('./models/Job');
const AuditLog = require('./models/AuditLog');
const { logAuth, logDocument, logJob, logUser, logSecurity, logExport } = require('./middleware/auditLogger');
const mfa = require('./utils/mfa');
const { performSecurityCheck } = require('./utils/securityAlerts');
const {
  requestId,
  additionalSecurityHeaders,
  sanitizeInput,
  preventParamPollution,
  slowRequestLogger,
  blockSuspiciousAgents,
  secureErrorHandler,
  asyncHandler
} = require('./middleware/security');
const {
  loginValidation,
  signupValidation,
  mfaValidation
} = require('./middleware/validators');
const {
  ipBlockerMiddleware,
  loginAttemptTracker,
  blockIP,
  unblockIP,
  getBlockedIPs
} = require('./middleware/ipBlocker');
const Utility = require('./models/Utility');
const Company = require('./models/Company');
const SpecDocument = require('./models/SpecDocument');
const apiRoutes = require('./routes/api');
const proceduresRoutes = require('./routes/procedures.routes');
const asbuiltAssistantRoutes = require('./routes/asbuilt-assistant.routes');
const tailboardRoutes = require('./routes/tailboard.routes');
const priceBookRoutes = require('./routes/pricebook.routes');
const billingRoutes = require('./routes/billing.routes');
const asbuiltRoutes = require('./routes/asbuilt.routes');
const oracleRoutes = require('./routes/oracle.routes');
const timesheetRoutes = require('./routes/timesheet.routes');
const lmeRoutes = require('./routes/lme.routes');
const smartformsRoutes = require('./routes/smartforms.routes');
const demoRoutes = require('./routes/demo.routes');
const notificationRoutes = require('./routes/notification.routes');
const stripeRoutes = require('./routes/stripe.routes');
const fieldTicketRoutes = require('./routes/fieldticket.routes');
const voiceRoutes = require('./routes/voice.routes');
const biddingRoutes = require('./routes/bidding.routes');
const weatherRoutes = require('./routes/weather.routes');
const superadminRoutes = require('./routes/superadmin.routes');
const specsRoutes = require('./routes/specs.routes');
const companyRoutes = require('./routes/company.routes');
const usersRoutes = require('./routes/users.routes');
const qaRoutes = require('./routes/qa.routes');
const feedbackRoutes = require('./routes/feedback.routes');
const utilitiesRoutes = require('./routes/utilities.routes');
const adminPlatformRoutes = require('./routes/admin-platform.routes');
const jobExtendedRoutes = require('./routes/job-extended.routes');
const jobLifecycleRoutes = require('./routes/job-lifecycle.routes');
const jobMiscRoutes = require('./routes/job-misc.routes');
const authController = require('./controllers/auth.controller');
const r2Storage = require('./utils/storage');
const { setupSwagger } = require('./config/swagger');
const OpenAI = require('openai');
const sharp = require('sharp');
const heicConvert = require('heic-convert');
const aiDataCapture = require('./utils/aiDataCapture');
const documentAutoFill = require('./utils/documentAutoFill');
const archiver = require('archiver');
const { sendInvitation } = require('./services/email.service');
const { validateUrl, isUrlSafeSync } = require('./utils/urlValidator');

console.log('All modules loaded, memory:', Math.round(process.memoryUsage().heapUsed / 1024 / 1024), 'MB');

// Lazy load heavy PDF modules only when needed
let pdfImageExtractor = null;
let pdfUtils = null;
function getPdfImageExtractor() {
  if (!pdfImageExtractor) {
    pdfImageExtractor = require('./utils/pdfImageExtractor');
  }
  return pdfImageExtractor;
}
function getPdfUtils() {
  if (!pdfUtils) {
    pdfUtils = require('./utils/pdfUtils');
  }
  return pdfUtils;
}

// Log R2 configuration status
console.log('R2 Storage configured:', r2Storage.isR2Configured());

const app = express();
const server = http.createServer(app);

// ============================================
// HEALTH CHECK - FIRST! (Before all middleware for fast response)
// This ensures Railway/Docker healthchecks pass quickly
// ============================================
/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Health check endpoint
 *     description: Returns server health status. Does not require authentication.
 *     tags: [Health]
 *     security: []
 *     responses:
 *       200:
 *         description: Server is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 mongodb:
 *                   type: string
 *                   enum: [connected, connecting, disconnected]
 *                 uptime:
 *                   type: number
 *                   description: Server uptime in seconds
 */
app.get('/api/health', (req, res) => {
  const memUsage = process.memoryUsage();
  const dbState = mongoose.connection.readyState;
  const dbStates = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
  
  // Import circuit breaker health (lazy to avoid circular deps)
  const { getCircuitBreakerHealth } = require('./utils/circuitBreaker');
  const circuitHealth = getCircuitBreakerHealth();
  
  // Determine overall health
  // Accept "connecting" state (2) during startup to pass initial healthcheck
  const isDbHealthy = dbState === 1 || dbState === 2;
  
  // Check if any circuit breakers are open (degraded but not unhealthy)
  const hasOpenCircuits = circuitHealth.openai.isOpen || circuitHealth.r2.isOpen;
  
  const isHealthy = isDbHealthy;
  const statusCode = isHealthy ? 200 : 503;
  
  res.status(statusCode).json({ 
    status: isHealthy ? (hasOpenCircuits ? 'degraded' : 'ok') : 'unhealthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    
    // Database health
    database: {
      status: dbStates[dbState] || 'unknown',
      connected: dbState === 1
    },
    
    // External services health (circuit breaker status)
    services: {
      storage: {
        configured: r2Storage.isR2Configured(),
        status: r2Storage.isR2Configured() 
          ? (circuitHealth.r2.isOpen ? 'circuit_open' : 'ok')
          : 'local_fallback',
        failures: circuitHealth.r2.failures
      },
      ai: {
        configured: Boolean(process.env.OPENAI_API_KEY),
        status: process.env.OPENAI_API_KEY
          ? (circuitHealth.openai.isOpen ? 'circuit_open' : 'ok')
          : 'disabled',
        failures: circuitHealth.openai.failures
      }
    },
    
    // System metrics
    system: {
      uptime: Math.floor(process.uptime()),
      memory: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        unit: 'MB'
      }
    },
    
    // Feature flags (kept for backwards compatibility)
    features: {
      aiEnabled: Boolean(process.env.OPENAI_API_KEY),
      r2Storage: r2Storage.isR2Configured()
    }
  });
});

// ============================================
// PORT CONFIGURATION (server starts at end of file after all routes registered)
// ============================================
const PORT = process.env.PORT || 5000;

console.log('Health endpoint registered');

// ============================================
// API DOCUMENTATION (Swagger/OpenAPI)
// ============================================
setupSwagger(app);

// Trust proxy - required for rate limiting behind Railway/Vercel reverse proxy
// This allows express-rate-limit to correctly identify users via X-Forwarded-For
app.set('trust proxy', 1);

// ============================================
// SECURITY MIDDLEWARE
// ============================================

// Helmet - sets various HTTP security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },  // Allow R2 resources
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],  // TODO: Remove unsafe-inline with nonce-based CSP
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "https://*.r2.cloudflarestorage.com", "https://*.cloudflare.com"],
      connectSrc: [
        "'self'",
        "https://api.openweathermap.org",
        "https://api.openai.com",
        "https://*.r2.cloudflarestorage.com",
        "wss://*",  // WebSocket connections
      ],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: [],
    },
  },
  // Prevent clickjacking
  frameguard: { action: 'deny' },
  // Disable MIME sniffing
  noSniff: true,
  // Enable XSS filter
  xssFilter: true,
}));

// ============================================
// ADDITIONAL SECURITY HARDENING (Fort Knox Mode)
// ============================================
app.use(requestId);                    // Unique request ID for audit correlation
app.use(additionalSecurityHeaders);    // Extra security headers
app.use(ipBlockerMiddleware);          // Block IPs after excessive failed logins
app.use(blockSuspiciousAgents);        // Block known attack tools
app.use(preventParamPollution);        // Prevent parameter pollution attacks
app.use(sanitizeInput);                // Sanitize all input
app.use(slowRequestLogger(15000));     // Log requests taking > 15 seconds

// MongoDB query sanitization - prevents NoSQL injection
app.use(mongoSanitize());

// ============================================
// RATE LIMITING CONFIGURATION (Production-Tuned)
// ============================================
// Tiered rate limits based on endpoint sensitivity

// Auth endpoints - strict limits (prevent brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // 15 attempts per 15 min (1 per minute average)
  message: { 
    error: 'Too many login attempts, please try again after 15 minutes',
    retryAfter: 15 * 60
  },
  standardHeaders: true,
  legacyHeaders: false
  // Default keyGenerator handles IPv6 properly via req.ip
});

// General API rate limiting - balanced for real usage
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 300, // 300 requests per minute (5 per second)
  message: { 
    error: 'Too many requests, please slow down',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Don't rate limit health checks
    return req.path === '/api/health';
  }
});

// Heavy endpoints (file uploads, exports) - stricter limits
const heavyLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 heavy operations per minute
  message: { 
    error: 'Too many file operations, please wait',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Apply rate limiters (order matters - more specific first)
app.use('/api/login', authLimiter, loginAttemptTracker);   // Auth with auto-blocking
app.use('/api/signup', authLimiter);
app.use('/api/billing/claims/*/export', heavyLimiter);  // Export endpoints
app.use('/api/billing/export', heavyLimiter);           // Bulk exports
app.use('/api/files/upload', heavyLimiter);             // File uploads
app.use('/api/asbuilt/submit', heavyLimiter);           // As-built submissions
app.use('/api/', apiLimiter);                           // General API

// ============================================
// CORS - whitelist allowed origins for security
// Parse CORS_ORIGIN which may be a comma-separated list
const envCorsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim()).filter(Boolean)
  : [];

const allowedOrigins = [
  'https://fieldledger.io',
  'https://www.fieldledger.io',
  'https://app.fieldledger.io',
  'https://fieldledger.vercel.app',
  ...envCorsOrigins,
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:5173'
].filter(Boolean);

// Deduplicate origins
const uniqueOrigins = [...new Set(allowedOrigins)];

console.log('Allowed CORS origins:', uniqueOrigins);

const io = socketIo(server, {
  cors: {
    origin: uniqueOrigins,
    methods: ["GET", "POST"],
    credentials: true
  },
  // Ping timeout/interval for connection health
  pingTimeout: 60000,
  pingInterval: 25000
});

// Initialize notification service with socket.io
const notificationService = require('./services/notification.service');
notificationService.initialize(io);

// Setup Redis adapter for horizontal scaling (if REDIS_URL is set)
const { createRedisAdapter, setIO } = require('./utils/socketAdapter');
setIO(io); // Make io available to route files via getIO()
(async () => {
  try {
    const redisAdapter = await createRedisAdapter();
    if (redisAdapter) {
      io.adapter(redisAdapter);
      console.log('[Socket.IO] Using Redis adapter for scaling');
    }
  } catch (err) {
    console.error('[Socket.IO] Redis adapter setup failed:', err.message);
  }
})();

app.use((req, res, next) => {
  const origin = req.headers.origin;
  // Only log non-GET requests or errors (reduce log noise in production)
  
  // Only allow whitelisted origins when using credentials
  if (origin && uniqueOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else if (!origin) {
    // Allow requests without origin (e.g., same-origin, curl, etc.)
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  // Requests from non-whitelisted origins get no CORS headers (blocked)
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  // Handle preflight (no logging needed for OPTIONS)
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  next();
});

// Health check endpoint moved to top of file for fast response (line ~75)

// Root endpoint - redirect to health check or show status
app.get('/', (req, res) => {
  res.json({
    name: 'FieldLedger API',
    version: '1.0.0-pilot',
    status: 'running',
    health: '/api/health',
    docs: 'Coming soon'
  });
});

// Stripe webhook needs raw body for signature verification
// Must be BEFORE express.json() middleware
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '150mb' }));
app.use(express.urlencoded({ limit: '150mb', extended: true }));

// Ensure uploads directory exists
// In containerized environments, use /tmp as fallback
let uploadsDir = path.join(__dirname, 'uploads');
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('Created uploads directory:', uploadsDir);
  }
} catch (err) {
  console.warn('Could not create uploads dir, using /tmp:', err.message);
  uploadsDir = '/tmp/uploads';
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
}

// Multer setup for file uploads with security filter
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Sanitize filename to prevent path traversal
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, Date.now() + '-' + safeName);
  }
});

// File type filter for security
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/heic',      // iPhone photos
    'image/heif',      // iPhone photos alternative
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} not allowed`), false);
  }
};

const upload = multer({ 
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB max
});

// ============================================
// MONGODB CONNECTION WITH RETRY LOGIC
// ============================================
const { runMigration } = require('./utils/migration');
const { scheduleCleanup: scheduleDemoCleanup } = require('./utils/demoCleanup');

const MONGO_OPTIONS = {
  maxPoolSize: 10,              // Connection pool size
  serverSelectionTimeoutMS: 5000, // Timeout for server selection
  socketTimeoutMS: 45000,       // Socket timeout
  retryWrites: true,
  w: 'majority'
};

// Retry connection with exponential backoff
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
        // In production, exit to trigger container restart
        if (process.env.NODE_ENV === 'production') {
          process.exit(1);
        }
        throw err;
      }
      // Exponential backoff: 1s, 2s, 4s, 8s, 16s
      const delay = Math.pow(2, attempt - 1) * 1000;
      console.log(`Retrying in ${delay / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// MongoDB connection event handlers
mongoose.connection.on('disconnected', () => {
  console.warn('⚠️ MongoDB disconnected. Attempting to reconnect...');
});

mongoose.connection.on('reconnected', () => {
  console.log('✅ MongoDB reconnected');
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err.message);
});

connectWithRetry()
  .then(async () => {
    // Run migration to set up default utility/company for existing data
    await runMigration();
    
    // === CLEANUP STUCK EXTRACTIONS ON STARTUP ===
    // Reset any AI extractions that have been running for more than 30 minutes
    // This prevents jobs from being permanently stuck if server crashed during extraction
    try {
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      const stuckExtractions = await Job.updateMany(
        {
          aiExtractionStarted: { $lt: thirtyMinutesAgo },
          aiExtractionComplete: { $ne: true }
        },
        {
          $unset: { aiExtractionStarted: 1, aiExtractionEnded: 1, aiProcessingTimeMs: 1 },
          $set: { aiExtractionComplete: false }
        }
      );
      if (stuckExtractions.modifiedCount > 0) {
        console.log(`[CLEANUP] Reset ${stuckExtractions.modifiedCount} stuck AI extractions`);
      }
    } catch (cleanupErr) {
      console.error('[CLEANUP] Error resetting stuck extractions:', cleanupErr.message);
    }
    
    // === SCHEDULE DEMO SESSION CLEANUP ===
    // Always clean up expired demo sessions to prevent stale data buildup.
    // Demo sandbox routes (/api/demo/*) are always available for client demos.
    scheduleDemoCleanup();
    
    // ============================================
    // START SERVER (after MongoDB connection established)
    // This ensures health checks pass immediately since DB is already connected
    // ============================================
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Server listening on port ${PORT}`);
      console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`   Health endpoint: /api/health`);
      console.log(`   API docs: /api-docs`);
      console.log(`   Demo sandbox: /api/demo/start-session`);
      
      // Oracle integration status check
      const { oracleService } = require('./services/oracle');
      const oracleStatus = oracleService.getStatus();
      const unconfigured = Object.entries(oracleStatus)
        .filter(([, s]) => !s.configured)
        .map(([name]) => name);
      
      if (unconfigured.length > 0) {
        console.warn(`⚠️  Oracle integrations in MOCK MODE: ${unconfigured.join(', ')}`);
        console.warn(`   Configure environment variables for production. See .env.example`);
      } else {
        console.log(`   Oracle integrations: All configured`);
      }
    });
  })
  .catch(err => {
    console.error('MongoDB connection failed:', err);
    process.exit(1);
  });

// Authentication Middleware
const authenticateUser = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    req.isAdmin = decoded.isAdmin || false;
    req.isSuperAdmin = decoded.isSuperAdmin || false;  // FieldLedger platform owners only
    req.userRole = decoded.role || null;  // crew, foreman, gf, pm, admin
    req.canApprove = decoded.canApprove || false;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Admin-only middleware (company admin)
const requireAdmin = (req, res, next) => {
  console.log('requireAdmin check - userId:', req.userId, 'isAdmin:', req.isAdmin);
  if (!req.isAdmin) {
    console.log('Admin access denied for user:', req.userId);
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Super Admin middleware (FieldLedger platform owners only)
const requireSuperAdmin = (req, res, next) => {
  if (!req.isSuperAdmin) {
    console.log('Super Admin access denied for user:', req.userId);
    return res.status(403).json({ error: 'Super Admin access required. This feature is for FieldLedger platform owners only.' });
  }
  next();
};

/**
 * @swagger
 * /api/signup:
 *   post:
 *     summary: Register a new user
 *     description: Create a new user account. Password must be 8+ chars with uppercase, lowercase, and number.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SignupRequest'
 *     responses:
 *       201:
 *         description: User created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       400:
 *         description: Validation error or email already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.post('/api/signup', signupValidation, authController.signup);

/**
 * @swagger
 * /api/login:
 *   post:
 *     summary: Authenticate user
 *     description: Login with email and password. Returns JWT token or MFA challenge.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       401:
 *         description: Invalid credentials
 *       423:
 *         description: Account locked due to too many failed attempts
 */
app.post('/api/login', loginValidation, authController.login);

// ==================== MFA ENDPOINTS (delegated to auth controller) ====================
app.post('/api/auth/mfa/verify', mfaValidation, authController.verifyMfa);
app.post('/api/auth/mfa/setup', authenticateUser, authController.setupMfa);
app.post('/api/auth/mfa/enable', authenticateUser, mfaValidation, authController.enableMfa);
app.post('/api/auth/mfa/disable', authenticateUser, authController.disableMfa);
app.get('/api/auth/mfa/status', authenticateUser, authController.getMfaStatus);

// Admin: Upload master template forms (PG&E forms, etc.) - MUST be before /api/jobs middleware
app.post('/api/admin/templates', authenticateUser, requireAdmin, upload.array('templates', 20), async (req, res) => {
  try {
    console.log('=== Template Upload Request ===');
    console.log('User:', req.userId, 'isAdmin:', req.isAdmin);
    console.log('R2 configured:', r2Storage.isR2Configured());
    console.log('Files received:', req.files?.length || 0);
    console.log('File names:', req.files?.map(f => f.originalname));
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    
    const uploaded = [];
    
    // Upload to R2 if configured, otherwise local
    if (r2Storage.isR2Configured()) {
      console.log('Uploading to R2...');
      for (const file of req.files) {
        try {
          console.log(`Uploading ${file.originalname} to R2...`);
          const result = await r2Storage.uploadTemplate(file.path, file.originalname);
          console.log(`Upload result for ${file.originalname}:`, result);
          uploaded.push({
            name: file.originalname,
            url: result.key,
            r2Key: result.key
          });
          // Clean up local temp file
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (uploadErr) {
          console.error(`Error uploading ${file.originalname}:`, uploadErr);
          throw uploadErr;
        }
      }
    } else {
      console.log('R2 not configured, using local storage...');
      let templatesDir = path.join(__dirname, 'templates', 'master');
      try {
        if (!fs.existsSync(templatesDir)) {
          fs.mkdirSync(templatesDir, { recursive: true });
        }
      } catch (err) {
        console.warn('Could not create templates dir, using /tmp:', err.message);
        templatesDir = '/tmp/templates/master';
        if (!fs.existsSync(templatesDir)) {
          fs.mkdirSync(templatesDir, { recursive: true });
        }
      }
      
      for (const file of req.files) {
        const destPath = path.join(templatesDir, file.originalname);
        fs.renameSync(file.path, destPath);
        uploaded.push({
          name: file.originalname,
          path: destPath,
          url: `/templates/master/${encodeURIComponent(file.originalname)}`
        });
      }
    }
    
    console.log('Templates uploaded successfully:', uploaded.map(u => u.name));
    res.json({ message: 'Templates uploaded successfully', templates: uploaded });
  } catch (err) {
    console.error('Template upload error:', err.message);
    console.error('Stack:', err.stack);
    res.status(500).json({ error: 'Template upload failed: ' + err.message });
  }
});

// Get signed URL for a file (authenticated endpoint - returns JSON with signed URL)
app.get('/api/files/signed/:key(*)', authenticateUser, async (req, res) => {
  try {
    const fileKey = req.params.key;
    
    if (r2Storage.isR2Configured()) {
      const signedUrl = await r2Storage.getSignedDownloadUrl(fileKey);
      if (signedUrl) {
        return res.json({ url: signedUrl });
      }
    }
    
    // Fallback to local file URL
    const localPath = path.join(__dirname, 'uploads', fileKey);
    if (fs.existsSync(localPath)) {
      return res.json({ url: `/uploads/${fileKey}` });
    }
    
    res.status(404).json({ error: 'File not found' });
  } catch (err) {
    console.error('Error getting signed URL:', err);
    res.status(500).json({ error: 'Failed to get signed URL' });
  }
});

// Get file from R2 - streams file directly (NO AUTH - for direct <img> loading)
// Security: Files are only accessible if you know the exact path
app.get('/api/files/:key(*)', async (req, res) => {
  try {
    const fileKey = req.params.key;
    console.log('File request - key:', fileKey);
    
    if (r2Storage.isR2Configured()) {
      console.log('R2 configured, streaming file...');
      const fileData = await r2Storage.getFileStream(fileKey);
      
      if (fileData && fileData.stream) {
        console.log('File found, streaming with content-type:', fileData.contentType);
        res.setHeader('Content-Type', fileData.contentType || 'application/octet-stream');
        if (fileData.contentLength) {
          res.setHeader('Content-Length', fileData.contentLength);
        }
        // Enable caching
        res.setHeader('Cache-Control', 'public, max-age=3600');
        // Allow embedding in iframes (for PDF viewer)
        res.setHeader('Content-Disposition', 'inline');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        // CORS headers for cross-origin requests
        res.setHeader('Access-Control-Allow-Origin', '*');
        fileData.stream.pipe(res);
        return;
      }
    }
    
    // Fallback to local file
    const localPath = path.join(__dirname, 'uploads', fileKey);
    console.log('Checking local path:', localPath, 'exists:', fs.existsSync(localPath));
    if (fs.existsSync(localPath)) {
      return res.sendFile(localPath);
    }
    
    console.log('File not found:', fileKey);
    res.status(404).json({ error: 'File not found', key: fileKey });
  } catch (err) {
    console.error('Error getting file:', err);
    res.status(500).json({ error: 'Failed to get file' });
  }
});

// Get list of available master templates
app.get('/api/admin/templates', authenticateUser, async (req, res) => {
  try {
    console.log('=== Listing Templates ===');
    console.log('R2 configured:', r2Storage.isR2Configured());
    
    // If R2 is configured, list templates from R2
    if (r2Storage.isR2Configured()) {
      console.log('Listing templates from R2...');
      const r2Files = await r2Storage.listFiles('templates/');
      console.log('R2 files found:', r2Files.length, r2Files.map(f => f.Key));
      const templates = r2Files.map(f => ({
        name: f.Key.replace('templates/', ''),
        url: r2Storage.getPublicUrl(f.Key),
        r2Key: f.Key,
        size: f.Size,
        lastModified: f.LastModified
      }));
      console.log('Returning templates:', templates.length);
      return res.json({ templates });
    }
    
    // Fallback to local filesystem
    console.log('R2 not configured, checking local filesystem...');
    const templatesDir = path.join(__dirname, 'templates', 'master');
    if (!fs.existsSync(templatesDir)) {
      console.log('Templates dir does not exist:', templatesDir);
      return res.json({ templates: [] });
    }
    
    const files = fs.readdirSync(templatesDir);
    console.log('Local files found:', files);
    const templates = files.map(f => ({
      name: f,
      url: `/templates/master/${encodeURIComponent(f)}`
    }));
    
    res.json({ templates });
  } catch (err) {
    console.error('Error listing templates:', err);
    res.status(500).json({ error: 'Failed to list templates' });
  }
});

// Add templates to an existing job (for jobs created before templates were uploaded)
app.post('/api/jobs/:id/add-templates', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const job = await Job.findById(id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Get templates from R2 or local storage
    let templateFiles = [];
    if (r2Storage.isR2Configured()) {
      const r2Templates = await r2Storage.listFiles('templates/');
      templateFiles = r2Templates.map(f => ({
        name: f.Key.replace('templates/', ''),
        url: r2Storage.getPublicUrl(f.Key),
        r2Key: f.Key
      })).filter(f => f.name);
    } else {
      const masterTemplatesDir = path.join(__dirname, 'templates', 'master');
      if (fs.existsSync(masterTemplatesDir)) {
        const files = fs.readdirSync(masterTemplatesDir);
        templateFiles = files.map(filename => ({
          name: filename,
          url: `/templates/master/${encodeURIComponent(filename)}`,
          r2Key: null
        }));
      }
    }

    if (templateFiles.length === 0) {
      return res.json({ message: 'No templates available to add', templatesAdded: 0 });
    }

    // Find or create General Forms folder
    let aciFolder = job.folders.find(f => f.name === 'ACI');
    if (!aciFolder) {
      aciFolder = { name: 'ACI', documents: [], subfolders: [] };
      job.folders.push(aciFolder);
    }
    if (!aciFolder.subfolders) aciFolder.subfolders = [];

    let generalFormsFolder = aciFolder.subfolders.find(sf => sf.name === 'General Forms');
    if (!generalFormsFolder) {
      generalFormsFolder = { name: 'General Forms', documents: [] };
      aciFolder.subfolders.push(generalFormsFolder);
    }
    if (!generalFormsFolder.documents) generalFormsFolder.documents = [];

    // Only add templates that aren't already in the folder
    const existingNames = generalFormsFolder.documents.map(d => d.name);
    const newTemplates = templateFiles.filter(t => !existingNames.includes(t.name));

    for (const template of newTemplates) {
      generalFormsFolder.documents.push({
        name: template.name,
        url: template.url,
        r2Key: template.r2Key,
        type: 'template',
        isTemplate: true,
        uploadDate: new Date()
      });
    }

    job.markModified('folders');
    await job.save();

    res.json({ 
      message: `Added ${newTemplates.length} templates to General Forms`,
      templatesAdded: newTemplates.length,
      templates: newTemplates.map(t => t.name)
    });
  } catch (err) {
    console.error('Error adding templates to job:', err);
    res.status(500).json({ error: 'Failed to add templates' });
  }
});

// Mount Demo Sandbox routes FIRST (no auth required - public demo access)
app.use('/api/demo', demoRoutes);

// Mount API routes (for /api/ai/* endpoints) - must be before /api/jobs middleware
app.use('/api', authenticateUser, apiRoutes);

// Mount procedure document routes (for AI learning from PG&E docs)
app.use('/api/procedures', authenticateUser, proceduresRoutes);

// Mount as-built assistant routes (AI-guided as-built documentation)
app.use('/api/asbuilt-assistant', authenticateUser, asbuiltAssistantRoutes);

// Mount tailboard/JHA routes (daily safety tailboards)
app.use('/api/tailboards', authenticateUser, tailboardRoutes);

// Mount price book routes (unit-price rate management)
app.use('/api/pricebooks', authenticateUser, priceBookRoutes);

// Mount billing routes (unit entries, claims, Oracle export)
app.use('/api/billing', authenticateUser, billingRoutes);

// Mount field ticket routes (T&M / Change Order management)
app.use('/api/fieldtickets', authenticateUser, fieldTicketRoutes);

// Mount voice AI routes (speech-to-data capture)
app.use('/api/voice', authenticateUser, voiceRoutes);

// Mount bidding intelligence routes (cost analytics & estimation)
app.use('/api/bidding', authenticateUser, biddingRoutes);

// Mount weather routes (auto-weather for field operations)
app.use('/api/weather', authenticateUser, weatherRoutes);

// Mount as-built document routing (intelligent document router)
app.use('/api/asbuilt', authenticateUser, asbuiltRoutes);

// Mount Oracle integration routes (Unifier, EAM, P6)
app.use('/api/oracle', authenticateUser, oracleRoutes);

// Mount timesheet routes
app.use('/api/timesheets', timesheetRoutes);

// Mount LME routes (PG&E Daily Statement of Labor, Material, Equipment)
app.use('/api/lme', lmeRoutes);

// Mount SmartForms routes (PDF template field mapping and filling)
app.use('/api/smartforms', authenticateUser, smartformsRoutes);

// Mount Notification routes (real-time notifications)
app.use('/api/notifications', authenticateUser, notificationRoutes);

// Mount Stripe billing routes
// Note: Webhook endpoint uses express.raw() internally for signature verification
app.use('/api/stripe', stripeRoutes);

// Super Admin routes (platform owner only)
app.use('/api/superadmin', authenticateUser, requireSuperAdmin, superadminRoutes);

// Spec Library routes
app.use('/api/specs', authenticateUser, specsRoutes);

// Company self-management routes
app.use('/api/company', authenticateUser, companyRoutes);

// User management routes
app.use('/api/users', authenticateUser, usersRoutes);

// QA dashboard routes
app.use('/api/qa', authenticateUser, qaRoutes);

// Feedback routes  
app.use('/api/feedback', authenticateUser, feedbackRoutes);

// Utilities (public - no auth required)
app.use('/api/utilities', utilitiesRoutes);

// Admin platform routes (owner dashboard, audit, security)
app.use('/api/admin', authenticateUser, adminPlatformRoutes);

// Job extended routes (notes, audits, dependencies) + QA audit extraction
app.use('/api/jobs', authenticateUser, jobExtendedRoutes);
app.use('/api', authenticateUser, jobExtendedRoutes); // for /api/qa/extract-audit

// Job lifecycle routes (delete, archive, restore, status, review)
app.use('/api/jobs', authenticateUser, jobLifecycleRoutes);

// Job misc routes (prefield, AI suggestions, autofill, CSV export, admin setup)
app.use('/api/jobs', authenticateUser, jobMiscRoutes);
app.use('/api', authenticateUser, jobMiscRoutes); // for /api/autofill/* and /api/admin/* paths

// === USER MANAGEMENT ROUTES moved to routes/users.routes.js ===

// ==================== JOB ASSIGNMENT ENDPOINTS ====================

// PM assigns job to GF
app.put('/api/jobs/:id/assign-gf', authenticateUser, async (req, res) => {
  try {
    const { assignedToGF, notes } = req.body;
    
    // Only PM/Admin can assign to GF
    const user = await User.findById(req.userId);
    if (!user?.isAdmin && !['pm', 'admin'].includes(user?.role)) {
      return res.status(403).json({ error: 'Only PM or Admin can assign jobs to GF' });
    }
    
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // ============================================
    const query = { _id: req.params.id };
    if (user?.companyId) {
      query.companyId = user.companyId;
    }
    
    const job = await Job.findOne(query);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    job.assignedToGF = assignedToGF;
    job.assignedToGFBy = req.userId;
    job.assignedToGFDate = new Date();
    if (notes) job.assignmentNotes = notes;
    
    // Update status
    if (['new', 'pending'].includes(job.status)) {
      job.status = 'assigned_to_gf';
    }
    
    await job.save();
    await job.populate('assignedToGF', 'name email');
    
    console.log(`Job ${job.pmNumber || job._id} assigned to GF ${assignedToGF}`);
    res.json({ message: 'Job assigned to GF', job });
  } catch (err) {
    console.error('Error assigning to GF:', err);
    res.status(500).json({ error: 'Failed to assign to GF', details: err.message });
  }
});

// GF assigns crew to job (existing endpoint, updated for new workflow)
// Allow Admin, PM, or GF to assign crews
app.put('/api/jobs/:id/assign', authenticateUser, async (req, res) => {
  try {
    // Sanitize user input before logging to prevent log injection
    const safeJobId = String(req.params.id || '').slice(0, 50).replace(/[\n\r\t]/g, '');
    console.log('Assignment request:', safeJobId, 'userId:', req.userId);
    console.log('User:', req.userId, 'isAdmin:', req.isAdmin, 'role:', req.userRole);
    
    // Check permissions - Admin, PM, or GF can assign
    if (!req.isAdmin && !['admin', 'pm', 'gf'].includes(req.userRole)) {
      return res.status(403).json({ error: 'Only Admin, PM, or GF can assign crews' });
    }
    
    const { assignedTo, crewScheduledDate, crewScheduledEndDate, assignmentNotes } = req.body;
    
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // ============================================
    const user = await User.findById(req.userId).select('companyId');
    const query = { _id: req.params.id };
    if (user?.companyId) {
      query.companyId = user.companyId;
    }
    
    const job = await Job.findOne(query);
    if (!job) {
      console.log('Job not found or not in user company:', safeJobId);
      return res.status(404).json({ error: 'Job not found' });
    }
    
    job.assignedTo = assignedTo || null;
    job.assignedBy = req.userId;
    job.assignedDate = new Date();
    job.crewScheduledDate = crewScheduledDate ? new Date(crewScheduledDate) : null;
    job.crewScheduledEndDate = crewScheduledEndDate ? new Date(crewScheduledEndDate) : null;
    job.assignmentNotes = assignmentNotes || '';
    
    // Update status based on current state
    if (assignedTo) {
      if (['new', 'pending', 'assigned_to_gf', 'pre_fielding'].includes(job.status)) {
        job.status = 'scheduled';
      } else if (job.status === 'pre-field') {
        // Legacy status
        job.status = 'scheduled';
      }
    }
    
    await job.save();
    
    // Populate assigned user info for response
    await job.populate('assignedTo', 'name email');
    await job.populate('assignedBy', 'name email');
    
    console.log(`Job ${job.pmNumber || job._id} assigned to crew ${assignedTo} for ${crewScheduledDate}`);
    res.json(job);
  } catch (err) {
    console.error('Error assigning job:', err.message);
    console.error('Stack:', err.stack);
    res.status(500).json({ error: 'Failed to assign job', details: err.message });
  }
});

// Get calendar data for a foreman (jobs assigned to them)
app.get('/api/calendar', authenticateUser, async (req, res) => {
  try {
    const { month, year, userId, viewAll } = req.query;
    
    // ============================================
    // MULTI-TENANT SECURITY: Get user's company
    // ============================================
    const currentUser = await User.findById(req.userId).select('companyId');
    const userCompanyId = currentUser?.companyId;
    
    // Build date range for the month (month is 1-indexed from frontend, JS Date uses 0-indexed)
    const targetMonth = parseInt(month || (new Date().getMonth() + 1));
    const targetYear = parseInt(year || new Date().getFullYear());
    const startDate = new Date(targetYear, targetMonth - 1, 1); // First day of month
    const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59); // Last day of month
    
    console.log('Calendar request:', { month: targetMonth, year: targetYear, viewAll, userId, isAdmin: req.isAdmin, companyId: userCompanyId });
    console.log('Date range:', startDate.toISOString(), 'to', endDate.toISOString());
    
    // Build query - ALWAYS filter by company first
    const query = {
      crewScheduledDate: { $gte: startDate, $lte: endDate }
    };
    
    // ============================================
    // CRITICAL: Always filter by user's company
    // Users can ONLY see their own company's jobs
    // ============================================
    if (userCompanyId) {
      query.companyId = userCompanyId;
    } else {
      // No company = only see jobs they created or are assigned to
      query.$or = [{ userId: req.userId }, { assignedTo: req.userId }];
    }
    
    // Additional filtering within the company
    // If admin requesting viewAll, show all assigned jobs in their company
    // If admin requesting specific user's calendar, use that userId
    // Otherwise, show jobs assigned to the current user
    if (req.isAdmin && viewAll === 'true') {
      // Admin wants to see all scheduled jobs in THEIR COMPANY - just filter by date
      query.assignedTo = { $ne: null }; // Only show jobs that are assigned
    } else if (req.isAdmin && userId) {
      query.assignedTo = userId;
    } else {
      query.assignedTo = req.userId;
    }
    
    console.log('Calendar query:', JSON.stringify(query));
    
    // Find jobs within the date range
    const jobs = await Job.find(query)
      .populate('assignedTo', 'name email')
      .select('pmNumber woNumber title address client crewScheduledDate crewScheduledEndDate dueDate status priority assignmentNotes assignedTo')
      .sort({ crewScheduledDate: 1 });
    
    console.log('Calendar jobs found:', jobs.length, jobs.map(j => ({ id: j._id, pm: j.pmNumber, date: j.crewScheduledDate })));
    
    res.json(jobs);
  } catch (err) {
    console.error('Error fetching calendar:', err);
    res.status(500).json({ error: 'Failed to fetch calendar data' });
  }
});

// Get all assigned jobs for current user (for foreman dashboard)
app.get('/api/my-assignments', authenticateUser, async (req, res) => {
  try {
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // ============================================
    const user = await User.findById(req.userId).select('companyId');
    
    // Build query - assigned to this user AND in their company
    const query = { assignedTo: req.userId };
    if (user?.companyId) {
      query.companyId = user.companyId;
    }
    
    const jobs = await Job.find(query)
      .select('pmNumber woNumber title address client crewScheduledDate crewScheduledEndDate dueDate status priority assignmentNotes createdAt companyId')
      .sort({ crewScheduledDate: 1 });
    
    res.json(jobs);
  } catch (err) {
    console.error('Error fetching assignments:', err);
    res.status(500).json({ error: 'Failed to fetch assignments' });
  }
});

/**
 * @swagger
 * /api/jobs:
 *   get:
 *     summary: List work orders
 *     description: |
 *       Returns work orders accessible to the authenticated user.
 *       Results are filtered by company (multi-tenant) and user role:
 *       - **Admin/PM**: All jobs in their company
 *       - **GF**: Jobs assigned to them
 *       - **Foreman/Crew**: Only jobs directly assigned to them
 *     tags: [Jobs]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by PM#, WO#, title, address, or client
 *       - in: query
 *         name: includeArchived
 *         schema:
 *           type: boolean
 *         description: Include archived jobs (admin only)
 *     responses:
 *       200:
 *         description: List of jobs
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Job'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
app.get('/api/jobs', authenticateUser, async (req, res) => {
  try {
    // Reduced logging for high-frequency endpoint
    const { search, view, includeArchived, includeDeleted } = req.query;
    
    // Get user's company for multi-tenant filtering
    const user = await User.findById(req.userId).select('companyId');
    const userCompanyId = user?.companyId;
    
    // Build query based on user role
    let query = {};
    
    // By default, exclude deleted and archived jobs
    // Only admins can request to see deleted/archived
    if (!includeDeleted || !req.isAdmin) {
      query.isDeleted = { $ne: true };
    }
    if (!includeArchived) {
      query.isArchived = { $ne: true };
    }
    
    // ============================================
    // MULTI-TENANT SECURITY: Filter by companyId
    // ============================================
    // Every user MUST only see jobs from their own company
    // Super Admins see their own company's jobs (FieldLedger) - they use Owner Dashboard for analytics
    if (userCompanyId) {
      query.companyId = userCompanyId;
    } else {
      // User has no company - only see jobs they personally created
      query.userId = req.userId;
      console.log('User has no company - showing only their own jobs');
    }
    
    // Additional role-based filtering WITHIN the company
    // Admin and PM see all jobs in their company (they assign jobs to GFs)
    if (req.isAdmin || req.userRole === 'pm' || req.userRole === 'admin') {
      // companyId filter already applied above - they see all company jobs
      // PM/Admin is responsible for assigning jobs to GFs
    } 
    // GF ONLY sees jobs assigned specifically to them
    // Each GF has their own separate workload - no cross-contamination
    // PM assigns jobs to GFs, so unassigned jobs are PM's responsibility
    else if (req.userRole === 'gf') {
      query = {
        ...query,  // Keep companyId and isDeleted/isArchived filters
        $or: [
          { assignedToGF: req.userId },   // Jobs assigned to THIS GF only
          { userId: req.userId }           // Jobs they created (if any)
        ]
      };
      console.log('GF query - only showing jobs assigned to this GF:', req.userId);
    }
    // Foreman ONLY sees jobs assigned to them by their GF
    else if (req.userRole === 'foreman') {
      query = {
        ...query,  // Keep companyId filter
        $or: [
          { assignedTo: req.userId },     // Jobs assigned to this foreman by GF
          { userId: req.userId }           // Jobs they created (unlikely but safe)
        ]
      };
      console.log('Foreman query - only showing jobs assigned to this foreman:', req.userId);
    }
    // Crew members only see jobs they're actively working on
    else if (req.userRole === 'crew') {
      query = {
        ...query,
        assignedTo: req.userId  // Only jobs directly assigned to them
      };
      console.log('Crew query - only showing jobs assigned to this crew member:', req.userId);
    }

    // Add search filter if provided
    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(escapedSearch, 'i');
      query = {
        ...query,
        $and: [
          query.$or ? { $or: query.$or } : {},
          {
            $or: [
              { title: searchRegex },
              { pmNumber: searchRegex },
              { woNumber: searchRegex },
              { notificationNumber: searchRegex },
              { address: searchRegex },
              { city: searchRegex },
              { client: searchRegex },
              { description: searchRegex }
            ]
          }
        ].filter(q => Object.keys(q).length > 0)
      };
      // Clean up the query structure
      if (query.$and && query.$and.length > 0) {
        delete query.$or;
      }
    }

    // Only fetch fields needed for dashboard listing - exclude large nested folders/documents
    const jobs = await Job.find(query)
      .select('-folders') // Exclude folders array which contains all documents
      .populate('userId', 'name email _id')
      .populate('assignedTo', 'name email _id')
      .populate('assignedToGF', 'name email _id')
      .sort({ createdAt: -1 })
      .lean(); // Use lean() for faster read-only queries
    res.json(jobs);
  } catch (err) {
    console.error('Error fetching jobs:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create Emergency Work Order (minimal info, high priority)
app.post('/api/jobs/emergency', authenticateUser, async (req, res) => {
  try {
    const { woNumber, pmNumber, address, description } = req.body;
    
    if (!woNumber) {
      return res.status(400).json({ error: 'WO Number is required for emergency work orders' });
    }
    
    // Get user's company and default utility
    const user = await User.findById(req.userId);
    
    // Create emergency job with minimal required fields
    const job = new Job({
      title: `EMERGENCY - ${woNumber}`,
      description: description || 'Emergency Work Order',
      woNumber,
      pmNumber: pmNumber || '',
      address: address || '',
      priority: 'emergency',
      isEmergency: true,
      status: 'pending',
      userId: req.userId,
      companyId: user?.companyId,
      utilityId: user?.companyId ? (await Company.findById(user.companyId))?.defaultUtility : undefined,
      folders: [
        {
          name: 'ACI',
          documents: [],
          subfolders: [
            { name: 'Pre-Field Documents', documents: [], subfolders: [] },
            { name: 'Field As Built', documents: [], subfolders: [] },
            { name: 'Job Photos', documents: [], subfolders: [] },
            { name: 'GF Audit', documents: [], subfolders: [] }
          ]
        },
        {
          name: 'UTCS',  // Flagging/Traffic Control company
          documents: [],
          subfolders: [
            { name: 'Dispatch Docs', documents: [] },
            { name: 'No Parks', documents: [] },
            { name: 'Photos', documents: [] },
            { name: 'Time Sheets', documents: [] },
            { 
              name: 'TCP',
              documents: [],
              subfolders: [
                { name: 'TCP Maps', documents: [] }
              ]
            }
          ]
        }
      ]
    });
    
    await job.save();
    
    console.log('Emergency WO created:', job._id, 'WO#:', woNumber);
    res.status(201).json(job);
  } catch (err) {
    console.error('Error creating emergency WO:', err);
    res.status(500).json({ error: 'Failed to create emergency work order', details: err.message });
  }
});

// ==================== AI METADATA EXTRACTION ====================
// Extract job metadata from PDF before creating a job (for form auto-fill)
app.post('/api/ai/extract', authenticateUser, upload.single('pdf'), async (req, res) => {
  const startTime = Date.now();
  const APIUsage = require('./models/APIUsage');
  let pdfPath = null;
  
  // Get user's company for tracking
  let userCompanyId = null;
  try {
    const user = await User.findById(req.userId).select('companyId');
    userCompanyId = user?.companyId;
  } catch {
    // Silently ignore - userCompanyId will remain null for anonymous/failed lookups
  }
  
  // Quick regex extraction function - used as fallback
  const quickExtract = (text) => {
    const patterns = {
      pmNumber: /(?:PM|PM#|PM Number|Project)[:\s#]*(\d{7,8})/i,
      woNumber: /(?:WO|WO#|Work Order)[:\s#]*([A-Z0-9-]+)/i,
      notificationNumber: /(?:Notification|Notif|NOTIF)[:\s#]*(\d+)/i,
      matCode: /(?:MAT|MAT Code|MAT Codes|Mat\.?\s*Code)[:\s#]*([A-Z0-9-]+)/i,
      address: /(\d+\s+[A-Za-z0-9\s]+(?:St|Street|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Rd|Road|Way|Lane|Ln|Ct|Court)\.?)/i,
      city: /(?:City)[:\s]*([A-Za-z\s]+?)(?:,|\s+CA|\s+California|\n)/i,
      client: /(PG&E|Pacific Gas|SCE|Southern California Edison|SDG&E)/i,
    };
    const result = {};
    for (const [key, pattern] of Object.entries(patterns)) {
      const match = text.match(pattern);
      result[key] = match ? match[1].trim() : '';
    }
    return result;
  };
  
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No PDF file provided' });
    }
    
    pdfPath = req.file.path;
    
    // MEMORY PROTECTION: Check file size (max 5MB to prevent crashes)
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    if (req.file.size > MAX_FILE_SIZE) {
      // Still try regex extraction from filename
      const structured = {
        pmNumber: '', woNumber: '', notificationNumber: '', matCode: '',
        address: '', city: '', client: '', projectName: '', orderType: '',
        jobScope: null
      };
      try { fs.unlinkSync(pdfPath); } catch { /* Ignore cleanup errors */ }
      return res.json({ 
        success: true, 
        structured, 
        warning: 'File too large for AI extraction. Please enter details manually.' 
      });
    }
    
    if (!process.env.OPENAI_API_KEY) {
      try { fs.unlinkSync(pdfPath); } catch { /* Ignore cleanup errors */ }
      return res.json({ success: false, error: 'AI extraction not configured' });
    }
    
    // STEP 1: Parse PDF with memory-safe approach
    let text = '';
    let quickResults = {};
    
    try {
    const pdfParse = require('pdf-parse');
      // Read file in chunks to prevent memory spikes
      const stats = fs.statSync(pdfPath);
      if (stats.size > 2 * 1024 * 1024) {
        // For files > 2MB, just use filename
        text = req.file.originalname || '';
      } else {
    const pdfBuffer = fs.readFileSync(pdfPath);
        const parsePromise = pdfParse(pdfBuffer, { max: 1 }); // Only first page
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('PDF parse timeout')), 15000) // 15 sec timeout
        );
        const pdfData = await Promise.race([parsePromise, timeoutPromise]);
        text = pdfData.text.substring(0, 3000); // Reduced to 3000 chars
      }
      quickResults = quickExtract(text);
    } catch (parseErr) {
      console.warn('PDF parsing failed:', parseErr.message);
      text = req.file.originalname || '';
      quickResults = quickExtract(text);
    }
    
    // Check if quick extraction found any results
    const hasQuickResults = Object.values(quickResults).some(v => v);
    
    // STEP 3: AI enhancement (with shorter timeout)
    // If quick extraction found PM number, we can use faster settings
    const openai = new OpenAI({ 
      apiKey: process.env.OPENAI_API_KEY,
      timeout: hasQuickResults ? 30000 : 60000 // Shorter timeout if we have fallback
    });
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Extract utility work order fields from PG&E job package Face Sheet. Return ONLY valid JSON.

Required fields:
- pmNumber, woNumber, notificationNumber, matCode, address, city, client, projectName, orderType

Key identifiers to look for:
- notificationNumber: The notification number (often labeled "Notification", "Notif #", or similar, usually 9-10 digits)
- matCode: The MAT code (unit pricing code for billable work, often labeled "MAT", "MAT Code", "MAT Codes")

Job Scope (extract from Face Sheet "Scope" or "Description" sections):
- jobScope.summary: 1-2 sentence work description (e.g., "Install new transformer and 150ft underground primary")
- jobScope.workType: Type of work (e.g., "New Service", "Service Upgrade", "Pole Replacement", "Underground Conversion")
- jobScope.equipment: Array of equipment (e.g., ["Transformer 25kVA", "Pole 45ft Class 3", "Conductor 1/0 AL"])
- jobScope.footage: Total footage if mentioned (e.g., "150 ft UG, 75 ft OH")
- jobScope.voltage: Voltage level (e.g., "12kV", "21kV Primary", "120/240V Secondary")
- jobScope.phases: Number of phases (e.g., "1-phase", "3-phase")
- jobScope.specialNotes: Special conditions or notes

Look for sections labeled: "Scope of Work", "Job Description", "Work Description", "Material List", "Construction Details".
Use empty string for missing fields. Return ONLY valid JSON, no markdown.`
        },
        {
          role: 'user',
          content: text.substring(0, 4000) // More text for scope extraction
        }
      ],
      temperature: 0,
      max_tokens: 600 // Increased for job scope details
    });
    
    // Log successful API call
    const usage = response.usage || {};
    await APIUsage.logOpenAIUsage({
      operation: 'metadata-extraction',
      model: 'gpt-4o-mini',
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      success: true,
      responseTimeMs: Date.now() - startTime,
      userId: req.userId,
      companyId: userCompanyId,
      metadata: { textLength: text.length }
    });
    
    // Parse the AI response
    let aiResults = {};
    try {
      const content = response.choices[0]?.message?.content || '{}';
      console.log('AI extraction raw response:', content.substring(0, 500));
      // Remove markdown code blocks if present
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      aiResults = JSON.parse(cleanContent);
      
      // Log job scope extraction result
      if (aiResults.jobScope) {
        console.log('Job scope extracted:', JSON.stringify(aiResults.jobScope, null, 2));
      } else {
        console.log('No job scope found in AI response');
      }
    } catch (parseErr) {
      console.warn('Failed to parse AI response:', parseErr.message);
      console.warn('Raw content was:', response.choices[0]?.message?.content?.substring(0, 200));
    }
    
    // Merge: AI results take priority, fall back to quick regex results
    const structured = {
      pmNumber: aiResults.pmNumber || quickResults.pmNumber || '',
      woNumber: aiResults.woNumber || quickResults.woNumber || '',
      notificationNumber: aiResults.notificationNumber || quickResults.notificationNumber || '',
      matCode: aiResults.matCode || quickResults.matCode || '',
      address: aiResults.address || quickResults.address || '',
      city: aiResults.city || quickResults.city || '',
      client: aiResults.client || quickResults.client || '',
      projectName: aiResults.projectName || '',
      orderType: aiResults.orderType || '',
      jobScope: aiResults.jobScope || null
    };
    
    console.log('Structured extraction result:', {
      pmNumber: structured.pmNumber,
      hasJobScope: !!structured.jobScope,
      jobScopeSummary: structured.jobScope?.summary?.substring(0, 50)
    });
    
    // Clean up the uploaded file
    try {
      fs.unlinkSync(pdfPath);
    } catch {
      // Ignore cleanup errors - file may already be deleted
    }
    
    res.json({ success: true, structured });
  } catch (err) {
    console.warn('AI extraction failed:', err.message);
    
    // Clean up uploaded file
    if (pdfPath) {
      try { fs.unlinkSync(pdfPath); } catch { /* Ignore cleanup errors */ }
    }
    
    // Return empty results - let user fill manually
    // Don't try to re-parse PDF (could crash again)
    const emptyResults = {
      pmNumber: '', woNumber: '', notificationNumber: '', matCode: '',
      address: '', city: '', client: '', projectName: '', orderType: '',
      jobScope: null
    };
    
    res.json({ 
      success: true, 
      structured: emptyResults, 
      warning: 'AI extraction failed - please enter details manually' 
    });
  }
});

app.post('/api/jobs', authenticateUser, upload.single('pdf'), async (req, res) => {
  try {
    const { title, description, priority, dueDate, woNumber, address, client, pmNumber, notificationNumber, city, projectName, orderType, division, matCode, sapId, sapFuncLocation, jobScope, preFieldLabels, ecTag, crewMaterials } = req.body;
    const resolvedTitle = title || pmNumber || woNumber || 'Untitled Work Order';
    
    // Parse JSON fields if they're strings (from form data)
    const parseJsonField = (field, name) => {
      if (!field) return null;
      try {
        return typeof field === 'string' ? JSON.parse(field) : field;
      } catch (e) {
        console.warn(`Failed to parse ${name}:`, e.message);
        return null;
      }
    };
    
    const parsedJobScope = parseJsonField(jobScope, 'jobScope');
    const parsedPreFieldLabels = parseJsonField(preFieldLabels, 'preFieldLabels');
    const parsedEcTag = parseJsonField(ecTag, 'ecTag');
    const parsedCrewMaterials = parseJsonField(crewMaterials, 'crewMaterials');
    
    // Log what we received for debugging
    console.log('[Job Create] Received fields:', {
      pmNumber, notificationNumber, woNumber, sapId, sapFuncLocation,
      hasJobScope: !!parsedJobScope,
      hasCrewMaterials: !!parsedCrewMaterials,
      crewMaterialsCount: Array.isArray(parsedCrewMaterials) ? parsedCrewMaterials.length : 0
    });
    
    const resolvedDescription = description || [address, city, client].filter(Boolean).join(' | ') || '';
    
    // Get user's company for multi-tenant job creation and folder template
    const user = await User.findById(req.userId).select('companyId');
    const company = user?.companyId ? await Company.findById(user.companyId).select('folderTemplate name') : null;
    
    // Helper function to build folders with proper document arrays
    const buildFoldersFromTemplate = (template) => {
      if (!template || template.length === 0) return null;
      
      const buildSubfolders = (subs) => {
        if (!subs || subs.length === 0) return [];
        return subs.map(sf => ({
          name: sf.name,
          documents: [],
          subfolders: buildSubfolders(sf.subfolders)
        }));
      };
      
      return template.map(folder => ({
        name: folder.name,
        documents: [],
        subfolders: buildSubfolders(folder.subfolders)
      }));
    };
    
    // Use company's custom folder template if available, otherwise use Alvah default
    let jobFolders;
    if (company?.folderTemplate && company.folderTemplate.length > 0) {
      console.log(`Using custom folder template for company: ${company.name}`);
      jobFolders = buildFoldersFromTemplate(company.folderTemplate);
    } else {
      // Default folder structure (Alvah's structure)
      jobFolders = [
        {
          name: 'ACI',
          documents: [],
          subfolders: [
            { name: 'Close Out Documents', documents: [] },
            { name: 'Field As Built', documents: [] },
            { name: 'Field Reports', documents: [] },
            { name: 'Photos', documents: [] },
            { 
              name: 'Pre-Field Documents', 
              documents: [],
              subfolders: [
                { name: 'Job Photos', documents: [] },
                { name: 'Construction Sketches', documents: [] },
                { name: 'Circuit Maps', documents: [] }
              ]
            },
            { name: 'General Forms', documents: [] },
            { name: 'GF Audit', documents: [] }
          ]
        },
        {
          name: 'UCS',  // Civil company
          documents: [],
          subfolders: [
            { name: 'Dispatch Docs', documents: [] },
            { name: 'Civil Plans', documents: [] },
            { name: 'Photos', documents: [] },
            { name: 'Time Sheets', documents: [] }
          ]
        },
        {
          name: 'UTCS',  // Flagging/Traffic Control company
          documents: [],
          subfolders: [
            { name: 'Dispatch Docs', documents: [] },
            { name: 'No Parks', documents: [] },
            { name: 'Photos', documents: [] },
            { name: 'Time Sheets', documents: [] },
            { 
              name: 'TCP',
              documents: [],
              subfolders: [
                { name: 'TCP Maps', documents: [] }
              ]
            }
          ]
        }
      ];
    }
    
    const job = new Job({
      title: resolvedTitle,
      description: resolvedDescription,
      priority: priority || 'medium',
      dueDate,
      woNumber,
      address,
      city,
      client,
      pmNumber,
      notificationNumber,
      projectName,
      orderType,
      division: division || 'DA',
      matCode,
      sapId,                      // SAP Equipment ID from PG&E
      sapFuncLocation,            // SAP Functional Location from PG&E
      jobScope: parsedJobScope,  // Scope extracted from PG&E Face Sheet
      preFieldLabels: parsedPreFieldLabels,  // Pre-field crew labels
      ecTag: parsedEcTag,  // EC Tag and program info
      crewMaterials: parsedCrewMaterials,  // PG&E Crew Materials with M-Codes
      crewMaterialsExtractedAt: parsedCrewMaterials ? new Date() : undefined,
      userId: req.userId,
      companyId: user?.companyId,  // MULTI-TENANT: Assign job to user's company
      status: 'pending',
      folders: jobFolders
    });
    
    // If a PDF was uploaded, add it to the Field As Built folder (the job package)
    // NOTE: Don't delete local file here - background extraction needs it
    if (req.file?.path) {
      const aciFolder = job.folders.find(f => f.name === 'ACI');
      if (aciFolder) {
        const fieldAsBuiltFolder = aciFolder.subfolders.find(sf => sf.name === 'Field As Built');
        if (fieldAsBuiltFolder) {
          let docUrl = `/uploads/${path.basename(req.file.path)}`;
          let r2Key = null;
          
          // Upload to R2 if configured (but keep local copy for background extraction)
          if (r2Storage.isR2Configured()) {
            try {
              const result = await r2Storage.uploadJobFile(
                req.file.path,
                job._id.toString(),
                'job-package',
                req.file.originalname || 'Job_Package.pdf'
              );
              docUrl = r2Storage.getPublicUrl(result.key);
              r2Key = result.key;
              // DON'T delete local file here - background extraction needs it
              // It will be cleaned up after extraction completes
            } catch (uploadErr) {
              console.error('Failed to upload job package to R2:', uploadErr.message);
            }
          }
          
          fieldAsBuiltFolder.documents.push({
            name: req.file.originalname || 'Job Package.pdf',
            path: req.file.path,
            url: docUrl,
            r2Key: r2Key,
            type: 'pdf',
            uploadDate: new Date(),
            uploadedBy: req.userId
          });
        }
      }
    }
    
    // Load master templates from R2 and organize them into folders
    try {
      let templateFiles = [];
      
      // Get templates from R2 if configured
      if (r2Storage.isR2Configured()) {
        const r2Templates = await r2Storage.listFiles('templates/');
        templateFiles = r2Templates.map(f => ({
          name: f.Key.replace('templates/', ''),
          url: r2Storage.getPublicUrl(f.Key),
          r2Key: f.Key
        })).filter(f => f.name); // Filter out empty names
        console.log('Found', templateFiles.length, 'templates in R2');
      } else {
        // Fallback to local filesystem
        const masterTemplatesDir = path.join(__dirname, 'templates', 'master');
        if (fs.existsSync(masterTemplatesDir)) {
          const files = fs.readdirSync(masterTemplatesDir);
          templateFiles = files.map(filename => ({
            name: filename,
            url: `/templates/master/${encodeURIComponent(filename)}`,
            r2Key: null
          }));
        }
      }
      
      if (templateFiles.length > 0) {
        // Separate CWC from other templates
        const cwcTemplate = templateFiles.find(f => f.name.toLowerCase().includes('cwc'));
        const generalForms = templateFiles.filter(f => !f.name.toLowerCase().includes('cwc'));
        
        const aciFolder = job.folders.find(f => f.name === 'ACI');
        if (aciFolder) {
          // Add CWC to Pre-Field Documents only
          const preFieldFolder = aciFolder.subfolders.find(sf => sf.name === 'Pre-Field Documents');
          if (preFieldFolder && cwcTemplate) {
            preFieldFolder.documents = [{
              name: cwcTemplate.name,
              url: cwcTemplate.url,
              r2Key: cwcTemplate.r2Key,
              type: 'template',
              isTemplate: true,
              uploadDate: new Date()
            }];
          }
          
          // Add all other templates to General Forms
          const generalFormsFolder = aciFolder.subfolders.find(sf => sf.name === 'General Forms');
          if (generalFormsFolder && generalForms.length > 0) {
            generalFormsFolder.documents = generalForms.map(t => ({
              name: t.name,
              url: t.url,
              r2Key: t.r2Key,
              type: 'template',
              isTemplate: true,
              uploadDate: new Date()
            }));
          }
        }
        
        console.log('Added templates:', cwcTemplate ? 'CWC to Pre-Field,' : '', generalForms.length, 'to General Forms');
      } else {
        console.log('No templates found in R2 or local storage');
      }
    } catch (templateErr) {
      console.error('Error adding templates to job:', templateErr);
    }
    
    await job.save();
    console.log('Job created with folder structure:', job._id);
    
    // Audit log: Job created
    logJob.create(req, job);
    
    // Send response immediately - don't wait for asset extraction
    res.status(201).json(job);
    
    // Trigger AI asset extraction in the background if a PDF was uploaded
    if (req.file?.path && process.env.OPENAI_API_KEY) {
      extractAssetsInBackground(job._id, req.file.path).catch(err => {
        console.error('Background asset extraction error:', err.message);
      });
    }
  } catch (err) {
    console.error('Error creating job:', err);
    console.error('Error stack:', err.stack);
    // If it's a Mongoose validation error, provide more details
    if (err.name === 'ValidationError') {
      const validationErrors = Object.keys(err.errors).map(key => ({
        field: key,
        message: err.errors[key].message
      }));
      console.error('Validation errors:', validationErrors);
      return res.status(400).json({ error: 'Validation failed', details: validationErrors });
    }
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Background function to extract assets from job package PDF
async function extractAssetsInBackground(jobId, pdfPath) {
  const startTime = Date.now();
  console.log('Starting background asset extraction for job:', jobId);
  console.log('PDF path:', pdfPath);
  console.log('PDF exists:', fs.existsSync(pdfPath));
  
  try {
    let job = await Job.findById(jobId);
    if (!job) {
      console.log('Job not found for asset extraction:', jobId);
      return;
    }
    
    // Check if extraction is available
    const extractor = getPdfImageExtractor();
    console.log('Extraction available:', extractor.isExtractionAvailable());
    
    if (!extractor.isExtractionAvailable()) {
      console.error('PDF extraction not available - canvas libraries may not be loaded');
      // Mark extraction as complete (failed) so clients don't hang
      // Don't set aiExtractionStarted since extraction never actually started
      job.aiExtractionComplete = true;
      job.aiExtractionEnded = new Date();
      job.aiProcessingTimeMs = 0;
      await job.save();
      return;
    }
    
    // Track extraction start time
    job.aiExtractionStarted = new Date();
    await job.save(); // Save so clients can see extraction started
    
    // Use the extractAllAssets helper function (lazy loaded)
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const uploadsDir = path.join(__dirname, 'uploads');
    
    const extractedAssets = await extractor.extractAllAssets(pdfPath, jobId, uploadsDir, openai);
    console.log('Extracted assets:', {
      photos: extractedAssets.photos?.length || 0,
      drawings: extractedAssets.drawings?.length || 0,
      maps: extractedAssets.maps?.length || 0,
      tcpMaps: extractedAssets.tcpMaps?.length || 0
    });
    
    // Upload extracted assets to R2 and update URLs
    async function uploadAssetsToR2(assets, folder) {
      const uploaded = [];
      for (const asset of assets) {
        let url = `/uploads/job_${jobId}/${folder}/${asset.name}`;
        let r2Key = null;
        if (r2Storage.isR2Configured() && asset.path && fs.existsSync(asset.path)) {
          try {
            const result = await r2Storage.uploadJobFile(asset.path, jobId, folder, asset.name);
            url = r2Storage.getPublicUrl(result.key);
            r2Key = result.key;
            fs.unlinkSync(asset.path);
          } catch (err) {
            console.error(`Failed to upload ${asset.name}:`, err.message);
          }
        }
        // Don't include stale local path when using R2
        const { path: localPath, ...assetWithoutPath } = asset;
        uploaded.push({ ...assetWithoutPath, url, r2Key });
      }
      return uploaded;
    }
    
    extractedAssets.photos = await uploadAssetsToR2(extractedAssets.photos || [], 'photos');
    extractedAssets.drawings = await uploadAssetsToR2(extractedAssets.drawings || [], 'drawings');
    extractedAssets.maps = await uploadAssetsToR2(extractedAssets.maps || [], 'maps');
    extractedAssets.tcpMaps = await uploadAssetsToR2(extractedAssets.tcpMaps || [], 'tcp_maps');
    
    // Update job with extracted assets
    const aciFolder = job.folders.find(f => f.name === 'ACI');
    if (aciFolder) {
      const preFieldFolder = aciFolder.subfolders.find(sf => sf.name === 'Pre-Field Documents');
      if (preFieldFolder) {
        // Ensure nested subfolders exist
        if (!preFieldFolder.subfolders) preFieldFolder.subfolders = [];
        
        // Find or create Job Photos subfolder
        let jobPhotosFolder = preFieldFolder.subfolders.find(sf => sf.name === 'Job Photos');
        if (!jobPhotosFolder) {
          jobPhotosFolder = { name: 'Job Photos', documents: [], subfolders: [] };
          preFieldFolder.subfolders.push(jobPhotosFolder);
        }
        
        // Find or create Construction Sketches subfolder
        let drawingsFolder = preFieldFolder.subfolders.find(sf => sf.name === 'Construction Sketches');
        if (!drawingsFolder) {
          drawingsFolder = { name: 'Construction Sketches', documents: [], subfolders: [] };
          preFieldFolder.subfolders.push(drawingsFolder);
        }
        
        // Find or create Circuit Maps subfolder
        let mapsFolder = preFieldFolder.subfolders.find(sf => sf.name === 'Circuit Maps');
        if (!mapsFolder) {
          mapsFolder = { name: 'Circuit Maps', documents: [], subfolders: [] };
          preFieldFolder.subfolders.push(mapsFolder);
        }
        
        // Add extracted photos
        extractedAssets.photos.forEach(photo => {
          const doc = {
            name: photo.name,
            url: photo.url,
            type: 'image',
            extractedFrom: path.basename(pdfPath),
            uploadDate: new Date()
          };
          if (photo.r2Key) doc.r2Key = photo.r2Key;
          if (photo.path) doc.path = photo.path;
          jobPhotosFolder.documents.push(doc);
        });
        
        // Add extracted drawings
        extractedAssets.drawings.forEach(drawing => {
          const doc = {
            name: drawing.name,
            url: drawing.url,
            type: 'drawing',
            pageNumber: drawing.pageNumber,
            extractedFrom: path.basename(pdfPath),
            uploadDate: new Date()
          };
          if (drawing.r2Key) doc.r2Key = drawing.r2Key;
          if (drawing.path) doc.path = drawing.path;
          drawingsFolder.documents.push(doc);
        });
        
        // Add extracted maps
        extractedAssets.maps.forEach(map => {
          const doc = {
            name: map.name,
            url: map.url,
            type: 'map',
            pageNumber: map.pageNumber,
            extractedFrom: path.basename(pdfPath),
            uploadDate: new Date()
          };
          if (map.r2Key) doc.r2Key = map.r2Key;
          if (map.path) doc.path = map.path;
          mapsFolder.documents.push(doc);
        });
      }
    }
    
    // Add TCP Maps to UTCS folder structure
    if (extractedAssets.tcpMaps && extractedAssets.tcpMaps.length > 0) {
      const utcsFolder = job.folders.find(f => f.name === 'UTCS');
      if (utcsFolder) {
        // Find or create TCP subfolder
        let tcpFolder = utcsFolder.subfolders.find(sf => sf.name === 'TCP');
        if (!tcpFolder) {
          tcpFolder = { name: 'TCP', documents: [], subfolders: [{ name: 'TCP Maps', documents: [] }] };
          utcsFolder.subfolders.push(tcpFolder);
        }
        
        // Ensure TCP Maps subfolder exists
        if (!tcpFolder.subfolders) tcpFolder.subfolders = [];
        let tcpMapsFolder = tcpFolder.subfolders.find(sf => sf.name === 'TCP Maps');
        if (!tcpMapsFolder) {
          tcpMapsFolder = { name: 'TCP Maps', documents: [] };
          tcpFolder.subfolders.push(tcpMapsFolder);
        }
        
        // Add extracted TCP maps
        extractedAssets.tcpMaps.forEach(tcpMap => {
          const doc = {
            name: tcpMap.name,
            url: tcpMap.url,
            type: 'map',
            category: 'TCP_MAP',
            pageNumber: tcpMap.pageNumber,
            extractedFrom: path.basename(pdfPath),
            uploadDate: new Date()
          };
          if (tcpMap.r2Key) doc.r2Key = tcpMap.r2Key;
          tcpMapsFolder.documents.push(doc);
        });
        
        console.log(`Added ${extractedAssets.tcpMaps.length} TCP maps to UTCS/TCP/TCP Maps`);
      }
    }
    
    job.aiExtractionComplete = true;
    job.aiExtractionEnded = new Date();
    job.aiProcessingTimeMs = Date.now() - startTime;
    console.log(`AI extraction completed in ${(job.aiProcessingTimeMs / 1000).toFixed(1)}s`);
    
    job.aiExtractedAssets = [
      ...extractedAssets.photos.map(p => ({ type: 'photo', name: p.name, url: p.url, extractedAt: new Date() })),
      ...extractedAssets.drawings.map(d => ({ type: 'drawing', name: d.name, url: d.url, extractedAt: new Date() })),
      ...extractedAssets.maps.map(m => ({ type: 'map', name: m.name, url: m.url, extractedAt: new Date() })),
      ...(extractedAssets.tcpMaps || []).map(t => ({ type: 'tcp_map', name: t.name, url: t.url, extractedAt: new Date() }))
    ];
    
    // Store construction sketches for quick access in job details header
    const pdfBasename = path.basename(pdfPath);
    if (extractedAssets.drawings && extractedAssets.drawings.length > 0) {
      job.constructionSketches = extractedAssets.drawings.map(drawing => ({
        pageNumber: drawing.pageNumber,
        url: drawing.url,
        r2Key: drawing.r2Key || null,
        name: drawing.name,
        extractedFrom: pdfBasename,
        extractedAt: new Date()
      }));
      console.log(`Stored ${job.constructionSketches.length} construction sketches for quick access`);
    }
    
    // Remove extracted photo pages from the job package PDF (clean as-built)
    const photoPageNumbers = extractedAssets.photos
      .map(p => p.pageNumber)
      .filter(pn => typeof pn === 'number');
    
    if (photoPageNumbers.length > 0 && fs.existsSync(pdfPath)) {
      try {
        console.log(`Removing ${photoPageNumbers.length} photo pages from job package: pages ${photoPageNumbers.join(', ')}`);
        const { PDFDocument } = require('pdf-lib');
        const originalPdfBytes = fs.readFileSync(pdfPath);
        const originalPdf = await PDFDocument.load(originalPdfBytes);
        const totalPages = originalPdf.getPageCount();
        
        // Create a set of pages to remove (1-indexed in our data, 0-indexed in pdf-lib)
        const pagesToRemove = new Set(photoPageNumbers);
        
        // Create new PDF with only non-photo pages
        const cleanedPdf = await PDFDocument.create();
        for (let i = 0; i < totalPages; i++) {
          const pageNum = i + 1; // Convert to 1-indexed
          if (!pagesToRemove.has(pageNum)) {
            const [copiedPage] = await cleanedPdf.copyPages(originalPdf, [i]);
            cleanedPdf.addPage(copiedPage);
          }
        }
        
        const cleanedPagesCount = cleanedPdf.getPageCount();
        console.log(`Cleaned PDF: ${cleanedPagesCount} pages (removed ${totalPages - cleanedPagesCount} photo pages)`);
        
        // Only save if we have pages remaining
        if (cleanedPagesCount > 0) {
          const cleanedPdfBytes = await cleanedPdf.save();
          const cleanedPdfPath = pdfPath.replace('.pdf', '_cleaned.pdf');
          fs.writeFileSync(cleanedPdfPath, cleanedPdfBytes);
          
          // Update the Field As Built document with the cleaned PDF
          const aciForClean = job.folders.find(f => f.name === 'ACI');
          const fieldAsBuiltFolder = aciForClean?.subfolders?.find(sf => sf.name === 'Field As Built');
          
          if (fieldAsBuiltFolder && fieldAsBuiltFolder.documents.length > 0) {
            // Find the original job package document
            const originalDoc = fieldAsBuiltFolder.documents.find(d => 
              d.path === pdfPath || d.name.toLowerCase().includes('job package')
            ) || fieldAsBuiltFolder.documents[0];
            
            if (originalDoc) {
              // Upload cleaned PDF to R2 if configured
              if (r2Storage.isR2Configured()) {
                try {
                  const cleanedName = originalDoc.name.replace('.pdf', '_cleaned.pdf');
                  const result = await r2Storage.uploadJobFile(cleanedPdfPath, jobId, 'as_built', cleanedName);
                  const cleanedUrl = r2Storage.getPublicUrl(result.key);
                  
                  // Update the document reference
                  originalDoc.url = cleanedUrl;
                  originalDoc.r2Key = result.key;
                  originalDoc.name = cleanedName;
                  originalDoc.photoPagesRemoved = photoPageNumbers.length;
                  originalDoc.cleanedAt = new Date();
                  
                  console.log(`Updated job package with cleaned PDF: ${cleanedName}`);
                  
                  // Clean up local files
                  fs.unlinkSync(cleanedPdfPath);
                } catch (r2Err) {
                  console.error('Failed to upload cleaned PDF to R2:', r2Err.message);
                }
              } else {
                // Local storage - replace the file
                fs.renameSync(cleanedPdfPath, pdfPath);
                originalDoc.photoPagesRemoved = photoPageNumbers.length;
                originalDoc.cleanedAt = new Date();
              }
            }
          }
        }
      } catch (cleanErr) {
        console.error('Error creating cleaned PDF (non-fatal):', cleanErr.message);
        // Don't fail the whole extraction if cleaning fails
      }
    }
    
    // Log folder structure before saving
    const aciCheck = job.folders.find(f => f.name === 'ACI');
    const preFieldCheck = aciCheck?.subfolders?.find(sf => sf.name === 'Pre-Field Documents');
    const jobPhotosCheck = preFieldCheck?.subfolders?.find(sf => sf.name === 'Job Photos');
    console.log('Folder structure before save:', {
      hasACI: !!aciCheck,
      hasPreField: !!preFieldCheck,
      hasJobPhotos: !!jobPhotosCheck,
      jobPhotosDocCount: jobPhotosCheck?.documents?.length || 0,
      firstPhotoUrl: jobPhotosCheck?.documents?.[0]?.url
    });
    
    // Mark folders as modified and save with retry for version conflicts
    job.markModified('folders');
    job.markModified('aiExtractedAssets');
    
    let retries = 3;
    while (retries > 0) {
      try {
    await job.save();
        break; // Success - exit loop
      } catch (saveErr) {
        if (saveErr.name === 'VersionError' && retries > 1) {
          retries--; // Decrement retries counter after check
          console.log(`Version conflict in background extraction for job ${jobId}, ${retries} retries left...`);
          // Refresh job document and try again
          const refreshedJob = await Job.findById(jobId);
          if (refreshedJob) {
            refreshedJob.aiExtractionComplete = true;
            refreshedJob.aiExtractionEnded = new Date();
            refreshedJob.aiProcessingTimeMs = Date.now() - startTime;
            refreshedJob.aiExtractedAssets = job.aiExtractedAssets;
            refreshedJob.markModified('aiExtractedAssets');
            job = refreshedJob; // Update reference for next iteration
          }
          // Continue to next iteration
        } else if (saveErr.name === 'VersionError') {
          // Last retry - use atomic update as fallback
          console.log('Final retry failed, using atomic update for extraction metadata');
          await Job.findByIdAndUpdate(jobId, {
            $set: {
              aiExtractionComplete: true,
              aiExtractionEnded: new Date(),
              aiProcessingTimeMs: Date.now() - startTime,
              aiExtractedAssets: job.aiExtractedAssets
            }
          });
          break;
        } else {
          throw saveErr; // Non-version error, rethrow
        }
      }
    }
    
    console.log('Background asset extraction complete for job:', jobId, {
      photos: extractedAssets.photos.length,
      drawings: extractedAssets.drawings.length,
      maps: extractedAssets.maps.length,
      tcpMaps: extractedAssets.tcpMaps?.length || 0
    });
    
    // Clean up local PDF file after extraction is complete
    if (fs.existsSync(pdfPath)) {
      try {
        fs.unlinkSync(pdfPath);
        console.log('Cleaned up local PDF:', pdfPath);
      } catch (cleanupErr) {
        console.warn('Failed to cleanup local PDF:', cleanupErr.message);
      }
    }
    
  } catch (err) {
    console.error('Background asset extraction failed:', err);
    
    // Mark extraction as complete (with failure) so clients don't hang
    try {
      await Job.findByIdAndUpdate(jobId, {
        aiExtractionComplete: true,
        aiExtractionEnded: new Date(),
        aiProcessingTimeMs: Date.now() - startTime
      });
      console.log('Marked job extraction as complete (failed) for:', jobId);
    } catch (updateErr) {
      console.error('Failed to update job after extraction error:', updateErr.message);
    }
    
    // Still try to clean up local file on error
    if (fs.existsSync(pdfPath)) {
      try {
        fs.unlinkSync(pdfPath);
      } catch (cleanupErr) {
        // Ignore cleanup errors
      }
    }
  }
}

// Search jobs by PM number - MUST be before /api/jobs/:id to prevent route shadowing
app.get('/api/jobs/search/:pmNumber', authenticateUser, async (req, res) => {
  try {
    const { pmNumber } = req.params;
    
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // ============================================
    const user = await User.findById(req.userId).select('companyId');
    
    const query = {
      $or: [
        { pmNumber: { $regex: pmNumber, $options: 'i' } },
        { woNumber: { $regex: pmNumber, $options: 'i' } },
        { notificationNumber: { $regex: pmNumber, $options: 'i' } }
      ]
    };
    
    // CRITICAL: Only search within user's company
    if (user?.companyId) {
      query.companyId = user.companyId;
    } else {
      query.userId = req.userId; // No company = only own jobs
    }
    
    const jobs = await Job.find(query);
    res.json(jobs);
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

app.get('/api/jobs/:id', authenticateUser, async (req, res) => {
  try {
    // Sanitize user input before logging to prevent log injection
    const safeJobId = String(req.params.id || '').slice(0, 50).replace(/[\n\r\t]/g, '');
    console.log('Getting job by ID:', safeJobId);
    console.log('User ID from token:', req.userId, 'isAdmin:', req.isAdmin);

    // ============================================
    // MULTI-TENANT SECURITY: Get user's company
    // ============================================
    const currentUser = await User.findById(req.userId).select('companyId');
    const userCompanyId = currentUser?.companyId;
    
    // CRITICAL: Reject access if user has no company assignment
    // This prevents admins without a company from accessing any job
    if (!userCompanyId) {
      console.log('Access denied: User has no company assignment');
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Build query - ALWAYS filter by company
    const query = { _id: req.params.id, companyId: userCompanyId };
    
    // Non-admins also need ownership/assignment check within their company
    if (!req.isAdmin) {
      query.$or = [
        { userId: req.userId },
        { assignedTo: req.userId }
      ];
    }
    // Admins can view any job BUT only within their own company

    const job = await Job.findOne(query)
      .populate('assignedTo', 'name email')
      .populate('assignedBy', 'name email');
    console.log('Job found:', !!job, 'Query companyId:', userCompanyId);

    if (!job) {
      console.log('Job not found for user or not in their company');
      return res.status(404).json({ error: 'Job not found' });
    }

    console.log('Returning job data');
    res.json(job);
  } catch (err) {
    console.error('Error getting job by ID:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Save edited PDF to job folder - saves as DRAFT pending approval
// Format: DRAFT_[PM#]_[DocumentName]_[timestamp].pdf
// Final approved format: [PM#]_[DocumentName].pdf
app.post('/api/jobs/:id/save-edited-pdf', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { pdfData, originalName, folderName, subfolderName } = req.body;
    
    console.log('Save edited PDF request:', { id, originalName, folderName, subfolderName, pdfDataLength: pdfData?.length });
    
    // Validate request body
    if (!pdfData) {
      return res.status(400).json({ error: 'No PDF data provided' });
    }
    if (!originalName) {
      return res.status(400).json({ error: 'No original filename provided' });
    }
    
    // Allow job creator, assigned user, GF, or admin to save edits
    const user = await User.findById(req.userId);
    const isAdminOrManager = user && (user.isAdmin || ['gf', 'pm', 'admin'].includes(user.role));
    
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // ============================================
    const query = { 
      _id: id,
      $or: [
        { userId: req.userId },
        { assignedTo: req.userId },
        { assignedToGF: req.userId }
      ]
    };
    
    // CRITICAL: Always add company filter
    if (user?.companyId) {
      query.companyId = user.companyId;
    }
    
    let job = await Job.findOne(query);
    
    // If not found by assignment, admins/managers can still access (but only in their company)
    if (!job && isAdminOrManager) {
      const adminQuery = { _id: id };
      if (user?.companyId) {
        adminQuery.companyId = user.companyId;
      }
      job = await Job.findOne(adminQuery);
    }
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found or not authorized' });
    }
    
    const jobToUpdate = job || await Job.findById(id);
    if (!jobToUpdate) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Decode base64 PDF data
    const pdfBuffer = Buffer.from(pdfData, 'base64');
    
    // Generate proper filename
    const pmNumber = jobToUpdate.pmNumber || 'NOPM';
    
    // Clean up original name - keep it readable but remove .pdf extension
    let docName = originalName
      .replace(/\.pdf$/i, '')
      .replace(/[^a-zA-Z0-9\s\-_]/g, '') // Remove special chars except spaces, dashes, underscores
      .trim()
      .replace(/\s+/g, '_'); // Replace spaces with underscores
    
    // If docName is empty or too generic, use a default
    if (!docName || docName.length < 3) {
      docName = 'FilledForm';
    }
    
    // Check if user can approve (GF, PM, Admin) - their saves are auto-approved
    // (user already fetched above)
    const canAutoApprove = user && (user.canApprove || user.isAdmin || ['gf', 'pm', 'admin'].includes(user.role));
    
    // Add timestamp to ensure cache busting when same doc is edited multiple times
    const timestamp = Date.now();
    
    // DRAFT filename for non-approvers, final filename for approvers
    const draftFilename = `DRAFT_${pmNumber}_${docName}_${timestamp}.pdf`;
    const finalFilename = `${pmNumber}_${docName}.pdf`;
    const newFilename = canAutoApprove ? finalFilename : draftFilename;
    
    let uploadsLocalDir = path.join(__dirname, 'uploads');
    
    // Ensure uploads directory exists (fallback to /tmp in containers)
    try {
      if (!fs.existsSync(uploadsLocalDir)) {
        fs.mkdirSync(uploadsLocalDir, { recursive: true });
      }
    } catch (err) {
      console.warn('Could not create uploads dir, using /tmp:', err.message);
      uploadsLocalDir = '/tmp/uploads';
      if (!fs.existsSync(uploadsLocalDir)) {
        fs.mkdirSync(uploadsLocalDir, { recursive: true });
      }
    }
    
    const filePath = path.join(uploadsLocalDir, newFilename);
    
    // Save the file
    fs.writeFileSync(filePath, pdfBuffer);
    
    let docUrl = `/uploads/${newFilename}`;
    let r2Key = null;
    
    // Upload to R2 if configured - always to Close Out Documents folder
    if (r2Storage.isR2Configured()) {
      try {
        // All edited documents go to ACI/Close Out Documents for submission
        const closeOutFolderPath = 'ACI/Close Out Documents';
        const result = await r2Storage.uploadJobFile(filePath, id, closeOutFolderPath, newFilename);
        docUrl = r2Storage.getPublicUrl(result.key);
        r2Key = result.key;
        // Clean up local file
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (uploadErr) {
        console.error('Failed to upload edited PDF to R2:', uploadErr.message);
      }
    }
    
    // Always save edited documents to ACI > Close Out Documents for submission
    // This ensures all completed/filled forms are collected in one place for closeout
    const aciFolder = jobToUpdate.folders.find(f => f.name === 'ACI');
    if (aciFolder) {
      // Ensure subfolders array exists
      if (!aciFolder.subfolders) {
        aciFolder.subfolders = [];
      }
      
      // Find or create the Close Out Documents subfolder
      let closeOutFolder = aciFolder.subfolders.find(sf => sf.name === 'Close Out Documents');
      if (!closeOutFolder) {
        closeOutFolder = { name: 'Close Out Documents', documents: [], subfolders: [] };
        aciFolder.subfolders.push(closeOutFolder);
      }
      
      // Ensure documents array exists
      if (!closeOutFolder.documents) {
        closeOutFolder.documents = [];
      }
      
      // =========================================================================
      // REPLACE OLD FILLED VERSION: If same document (by base name) exists in 
      // Close Out folder, remove the OLD FILLED copy and replace with new one.
      // 
      // IMPORTANT: We NEVER delete the original blank template from its source
      // folder (Pre-Field Documents, General Forms, etc.). That stays available
      // for future use. We only manage filled copies here in Close Out.
      // =========================================================================
      const baseDocPattern = `${pmNumber}_${docName}`;
      const existingDocIndex = closeOutFolder.documents.findIndex(doc => {
        // Never match templates - only match previously filled copies
        if (doc.isTemplate) return false;
        
        // Match by finalName field (canonical name without DRAFT prefix or timestamp)
        if (doc.finalName === finalFilename) return true;
        // Also match by base pattern in the name (for legacy docs)
        const docBaseName = doc.name?.replace(/^DRAFT_/, '').replace(/_\d{13}\.pdf$/, '.pdf');
        return docBaseName === finalFilename || doc.name?.startsWith(baseDocPattern);
      });
      
      if (existingDocIndex !== -1) {
        const oldDoc = closeOutFolder.documents[existingDocIndex];
        console.log(`Replacing existing FILLED document in Close Out: ${oldDoc.name} -> ${newFilename}`);
        
        // Delete old FILLED file from R2 storage if it exists
        // (This is the previously filled version, NOT the original template)
        if (oldDoc.r2Key && r2Storage.isR2Configured()) {
          try {
            await r2Storage.deleteFile(oldDoc.r2Key);
            console.log(`Deleted old filled R2 file: ${oldDoc.r2Key}`);
          } catch (delErr) {
            console.warn(`Failed to delete old R2 file ${oldDoc.r2Key}:`, delErr.message);
          }
        }
        
        // Remove old filled document from array
        closeOutFolder.documents.splice(existingDocIndex, 1);
      }
      
      // NOTE: The original blank template remains in its source folder
      // (e.g., Pre-Field Documents, General Forms) and is NOT affected.
      // This ensures a blank form is always available for future jobs.
      
      // Add the new/updated FILLED document (copy, not template)
      const existingVersion = existingDocIndex !== -1 ? closeOutFolder.documents[existingDocIndex] : null;
      closeOutFolder.documents.push({
        name: newFilename,
        url: docUrl,
        r2Key: r2Key,
        type: 'filled_pdf', // Distinguish from 'template' type
        isTemplate: false,  // This is a FILLED copy, not the original blank
        isFilled: true,     // Explicit flag that this is a completed form
        isCompleted: canAutoApprove,
        completedDate: canAutoApprove ? new Date() : null,
        completedBy: canAutoApprove ? req.userId : null,
        uploadDate: new Date(),
        uploadedBy: req.userId,
        // Approval workflow fields
        approvalStatus: canAutoApprove ? 'approved' : 'pending_approval',
        draftName: canAutoApprove ? null : draftFilename,
        finalName: finalFilename,
        approvedBy: canAutoApprove ? req.userId : null,
        approvedDate: canAutoApprove ? new Date() : null,
        // Track source location (where the blank template lives)
        sourceFolder: folderName,
        sourceSubfolder: subfolderName || null,
        sourceTemplateName: originalName, // Original blank template name
        // Version tracking for re-edits
        version: existingVersion ? (existingVersion.version || 1) + 1 : 1,
        previousVersion: existingVersion?.name || null
      });
    }
    
    await jobToUpdate.save();
    
    const statusMsg = canAutoApprove ? 'approved' : 'pending approval';
    console.log(`Edited PDF saved to Close Out Documents (${statusMsg}):`, newFilename);
    res.json({ 
      message: `PDF saved to Close Out Documents (${statusMsg})`, 
      filename: newFilename,
      url: docUrl,
      folder: 'ACI/Close Out Documents',
      approvalStatus: canAutoApprove ? 'approved' : 'pending_approval',
      needsApproval: !canAutoApprove
    });
  } catch (err) {
    console.error('Error saving edited PDF:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to save PDF', details: err.message });
  }
});

// Approve a draft document (GF, PM, Admin only)
// Renames from DRAFT_xxx.pdf to final PG&E format
app.post('/api/jobs/:jobId/documents/:docId/approve', authenticateUser, async (req, res) => {
  try {
    const { jobId, docId } = req.params;
    
    // Check if user can approve
    const user = await User.findById(req.userId);
    const canApprove = user && (user.canApprove || user.isAdmin || ['gf', 'pm', 'admin'].includes(user.role));
    
    if (!canApprove) {
      return res.status(403).json({ error: 'You do not have permission to approve documents' });
    }
    
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // ============================================
    const query = { _id: jobId };
    if (user?.companyId) {
      query.companyId = user.companyId;
    }
    
    const job = await Job.findOne(query);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Find the document in any folder/subfolder
    let foundDoc = null;
    let foundFolder = null;
    let foundSubfolder = null;
    
    for (const folder of job.folders) {
      // Check folder documents
      const docInFolder = folder.documents.find(d => d._id.toString() === docId);
      if (docInFolder) {
        foundDoc = docInFolder;
        foundFolder = folder;
        break;
      }
      
      // Check subfolders
      for (const subfolder of folder.subfolders || []) {
        const docInSubfolder = subfolder.documents.find(d => d._id.toString() === docId);
        if (docInSubfolder) {
          foundDoc = docInSubfolder;
          foundFolder = folder;
          foundSubfolder = subfolder;
          break;
        }
        
        // Check nested subfolders
        for (const nestedSubfolder of subfolder.subfolders || []) {
          const docInNested = nestedSubfolder.documents.find(d => d._id.toString() === docId);
          if (docInNested) {
            foundDoc = docInNested;
            foundFolder = folder;
            foundSubfolder = nestedSubfolder;
            break;
          }
        }
        if (foundDoc) break;
      }
      if (foundDoc) break;
    }
    
    if (!foundDoc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    if (foundDoc.approvalStatus === 'approved') {
      return res.status(400).json({ error: 'Document is already approved' });
    }
    
    // Rename file in R2 from DRAFT to final name
    const finalName = foundDoc.finalName || foundDoc.name.replace(/^DRAFT_/, '').replace(/_\d{13}\.pdf$/, '.pdf');
    
    if (r2Storage.isR2Configured() && foundDoc.r2Key) {
      try {
        // Get the old file
        const oldKey = foundDoc.r2Key;
        const newKey = oldKey.replace(foundDoc.name, finalName);
        
        // Copy to new key and delete old
        await r2Storage.copyFile(oldKey, newKey);
        await r2Storage.deleteFile(oldKey);
        
        foundDoc.r2Key = newKey;
        foundDoc.url = r2Storage.getPublicUrl(newKey);
      } catch (renameErr) {
        console.error('Failed to rename file in R2:', renameErr.message);
        // Continue anyway - update the database even if rename fails
      }
    }
    
    // Update document status
    foundDoc.name = finalName;
    foundDoc.approvalStatus = 'approved';
    foundDoc.approvedBy = req.userId;
    foundDoc.approvedDate = new Date();
    foundDoc.isCompleted = true;
    foundDoc.completedDate = new Date();
    foundDoc.completedBy = req.userId;
    
    await job.save();
    
    console.log(`Document approved: ${finalName} by user ${req.userId}`);
    res.json({ 
      message: 'Document approved successfully',
      document: {
        id: foundDoc._id,
        name: finalName,
        url: foundDoc.url,
        approvalStatus: 'approved'
      }
    });
  } catch (err) {
    console.error('Error approving document:', err);
    res.status(500).json({ error: 'Failed to approve document', details: err.message });
  }
});

// Reject a draft document (GF, PM, Admin only)
app.post('/api/jobs/:jobId/documents/:docId/reject', authenticateUser, async (req, res) => {
  try {
    const { jobId, docId } = req.params;
    const { reason } = req.body;
    
    // Check if user can approve/reject
    const user = await User.findById(req.userId);
    const canApprove = user && (user.canApprove || user.isAdmin || ['gf', 'pm', 'admin'].includes(user.role));
    
    if (!canApprove) {
      return res.status(403).json({ error: 'You do not have permission to reject documents' });
    }
    
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // ============================================
    const query = { _id: jobId };
    if (user?.companyId) {
      query.companyId = user.companyId;
    }
    
    const job = await Job.findOne(query);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Find the document (same logic as approve)
    let foundDoc = null;
    for (const folder of job.folders) {
      const docInFolder = folder.documents.find(d => d._id.toString() === docId);
      if (docInFolder) { foundDoc = docInFolder; break; }
      
      for (const subfolder of folder.subfolders || []) {
        const docInSubfolder = subfolder.documents.find(d => d._id.toString() === docId);
        if (docInSubfolder) { foundDoc = docInSubfolder; break; }
      }
      if (foundDoc) break;
    }
    
    if (!foundDoc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // Update document status
    foundDoc.approvalStatus = 'rejected';
    foundDoc.rejectionReason = reason || 'No reason provided';
    
    await job.save();
    
    console.log(`Document rejected: ${foundDoc.name} by user ${req.userId}`);
    res.json({ 
      message: 'Document rejected',
      document: {
        id: foundDoc._id,
        name: foundDoc.name,
        approvalStatus: 'rejected',
        rejectionReason: foundDoc.rejectionReason
      }
    });
  } catch (err) {
    console.error('Error rejecting document:', err);
    res.status(500).json({ error: 'Failed to reject document', details: err.message });
  }
});

// Get all documents pending approval (Admin dashboard)
app.get('/api/admin/pending-approvals', authenticateUser, async (req, res) => {
  try {
    // Check if user can approve
    const user = await User.findById(req.userId);
    const canApprove = user && (user.canApprove || user.isAdmin || ['gf', 'pm', 'admin'].includes(user.role));
    
    if (!canApprove) {
      return res.status(403).json({ error: 'You do not have permission to view pending approvals' });
    }
    
    // Find all jobs with pending documents
    const jobs = await Job.find({}).select('pmNumber woNumber address folders').lean();
    
    const pendingDocs = [];
    for (const job of jobs) {
      for (const folder of job.folders || []) {
        // Check folder documents
        for (const doc of folder.documents || []) {
          if (doc.approvalStatus === 'pending_approval') {
            pendingDocs.push({
              jobId: job._id,
              pmNumber: job.pmNumber,
              woNumber: job.woNumber,
              address: job.address,
              folderName: folder.name,
              document: doc
            });
          }
        }
        
        // Check subfolders
        for (const subfolder of folder.subfolders || []) {
          for (const doc of subfolder.documents || []) {
            if (doc.approvalStatus === 'pending_approval') {
              pendingDocs.push({
                jobId: job._id,
                pmNumber: job.pmNumber,
                woNumber: job.woNumber,
                address: job.address,
                folderName: `${folder.name} > ${subfolder.name}`,
                document: doc
              });
            }
          }
        }
      }
    }
    
    res.json({ pendingDocuments: pendingDocs, count: pendingDocs.length });
  } catch (err) {
    console.error('Error fetching pending approvals:', err);
    res.status(500).json({ error: 'Failed to fetch pending approvals' });
  }
});

// ========================================
// === UTILITY ROUTES moved to routes/utilities.routes.js ===


// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/templates', express.static(path.join(__dirname, 'templates')));

// Upload file to a specific folder in a job
app.post('/api/jobs/:id/folders/:folderName/upload', authenticateUser, upload.array('files', 10), async (req, res) => {
  try {
    const { id, folderName } = req.params;
    const { subfolder } = req.body; // Optional subfolder name
    
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // ============================================
    const currentUser = await User.findById(req.userId).select('companyId');

    // Allow file upload if user has access to this job (IN THEIR COMPANY)
    const query = { _id: id };
    if (currentUser?.companyId) {
      query.companyId = currentUser.companyId;
    }
    
    let job;
    if (req.isAdmin || req.userRole === 'pm' || req.userRole === 'admin') {
      job = await Job.findOne(query);
    } else {
      query.$or = [
        { userId: req.userId },
        { assignedTo: req.userId },
        { assignedToGF: req.userId }
      ];
      job = await Job.findOne(query);
    }
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found or you do not have access' });
    }
    
    // Find the folder
    const folder = job.folders.find(f => f.name === folderName);
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    
    // Determine where to add documents
    // Supports nested subfolders with path like "Pre-Field Documents/Job Photos"
    let targetDocuments;
    if (subfolder) {
      const subfolderParts = subfolder.split('/');
      let currentFolder = folder;
      
      for (const part of subfolderParts) {
        const subfolderObj = currentFolder.subfolders?.find(sf => sf.name === part);
        if (!subfolderObj) {
          return res.status(404).json({ error: `Subfolder not found: ${part}` });
        }
        currentFolder = subfolderObj;
      }
      targetDocuments = currentFolder.documents;
    } else {
      targetDocuments = folder.documents;
    }
    
    // Upload files to R2 and create document records
    const uploadedDocs = [];
    for (const file of req.files) {
      let docUrl = `/uploads/${path.basename(file.path)}`;
      let r2Key = null;
      let finalName = file.originalname;
      let fileToUpload = file.path;
      let tempConvertedFile = null;
      
      // Convert HEIC to JPEG (iPhone photos)
      const isHeic = file.originalname.toLowerCase().endsWith('.heic') || 
                     file.originalname.toLowerCase().endsWith('.heif') ||
                     file.mimetype === 'image/heic' || 
                     file.mimetype === 'image/heif';
      
      if (isHeic) {
        try {
          console.log('Converting HEIC to JPEG:', file.originalname);
          tempConvertedFile = file.path + '.jpg';
          const inputBuffer = fs.readFileSync(file.path);
          const outputBuffer = await heicConvert({
            buffer: inputBuffer,
            format: 'JPEG',
            quality: 0.9
          });
          fs.writeFileSync(tempConvertedFile, Buffer.from(outputBuffer));
          fileToUpload = tempConvertedFile;
          // Update filename to .jpg
          finalName = file.originalname.replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg');
          // Update docUrl for local storage (Bug fix: was pointing to original HEIC file)
          docUrl = `/uploads/${path.basename(tempConvertedFile)}`;
          console.log('HEIC converted successfully:', finalName);
        } catch (convertErr) {
          console.error('Failed to convert HEIC:', convertErr.message);
          // Continue with original file
        }
      }
      
      if (r2Storage.isR2Configured()) {
        try {
          const folderPath = subfolder ? `${folderName}/${subfolder}` : folderName;
          const result = await r2Storage.uploadJobFile(fileToUpload, id, folderPath, finalName);
          docUrl = r2Storage.getPublicUrl(result.key);
          r2Key = result.key;
        } catch (uploadErr) {
          console.error('Failed to upload to R2:', uploadErr.message);
        }
      }
      
      // Clean up local files (always, regardless of R2 configuration)
      try {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
        if (tempConvertedFile && fs.existsSync(tempConvertedFile)) {
          fs.unlinkSync(tempConvertedFile);
        }
      } catch (cleanupErr) {
        console.error('Failed to clean up temp files:', cleanupErr.message);
      }
      
      uploadedDocs.push({
        name: finalName,
        url: docUrl,
        r2Key: r2Key,
        type: file.mimetype.includes('pdf') ? 'pdf' : file.mimetype.includes('image') || isHeic ? 'image' : 'other',
        uploadDate: new Date(),
        uploadedBy: req.userId
      });
    }
    
    targetDocuments.push(...uploadedDocs);
    
    // Retry save with version conflict handling
    let retries = 3;
    while (retries > 0) {
      try {
        job.markModified('folders'); // Ensure Mongoose detects nested changes
    await job.save();
        break; // Success
      } catch (saveErr) {
        if (saveErr.name === 'VersionError' && retries > 1) {
          console.log(`Version conflict saving job ${job._id}, retrying... (${retries - 1} left)`);
          // Reload the job and re-apply the documents
          const freshJob = await Job.findById(job._id);
          if (freshJob) {
            // Re-find the target folder/subfolder
            const freshFolder = freshJob.folders.find(f => f.name === folderName);
            if (freshFolder) {
              let freshTarget = freshFolder.documents;
              if (subfolder) {
                const parts = subfolder.split('/');
                let curr = freshFolder;
                for (const part of parts) {
                  curr = curr.subfolders?.find(sf => sf.name === part);
                  if (!curr) break;
                }
                if (curr) freshTarget = curr.documents;
              }
              // Only add docs that aren't already there (by r2Key or name)
              for (const doc of uploadedDocs) {
                const exists = freshTarget.some(d => d.r2Key === doc.r2Key || d.name === doc.name);
                if (!exists) {
                  freshTarget.push(doc);
                }
              }
              job = freshJob;
            }
          }
          retries--;
        } else if (saveErr.name === 'VersionError') {
          // Last retry - use atomic update as fallback (consistent with extraction endpoint)
          console.log('Final retry failed, using atomic update for file upload');
          
          // Build the path to the target array
          let arrayPath = `folders.$[folder].documents`;
          const arrayFilters = [{ 'folder.name': folderName }];
          
          if (subfolder) {
            const parts = subfolder.split('/');
            if (parts.length === 1) {
              arrayPath = `folders.$[folder].subfolders.$[sub].documents`;
              arrayFilters.push({ 'sub.name': parts[0] });
            } else if (parts.length === 2) {
              arrayPath = `folders.$[folder].subfolders.$[sub].subfolders.$[nested].documents`;
              arrayFilters.push({ 'sub.name': parts[0] }, { 'nested.name': parts[1] });
            }
          }
          
          // Use $push with $each for atomic document addition
          await Job.findByIdAndUpdate(
            job._id,
            { $push: { [arrayPath]: { $each: uploadedDocs } } },
            { arrayFilters }
          );
          break;
        } else {
          throw saveErr;
        }
      }
    }
    
    res.json({ message: 'Files uploaded successfully', documents: uploadedDocs });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed', details: err.message });
  }
});

// ==================== GENERIC FILE UPLOAD ====================
// Used by ForemanCloseOut and other components to upload files to a job folder
// Supports: folder, subfolder, file (single file upload)
app.post('/api/jobs/:id/upload', authenticateUser, upload.single('file'), async (req, res) => {
  try {
    const { id } = req.params;
    const { folder = 'ACI', subfolder = 'GF Audit', photoType, latitude, longitude } = req.body;
    
    const currentUser = await User.findById(req.userId).select('companyId');
    
    // Build query with company filter
    const query = { _id: id };
    if (currentUser?.companyId) {
      query.companyId = currentUser.companyId;
    }
    
    // Allow access for admin/PM or assigned users
    if (!(req.isAdmin || req.userRole === 'pm' || req.userRole === 'admin')) {
      query.$or = [
        { userId: req.userId },
        { assignedTo: req.userId },
        { assignedToGF: req.userId }
      ];
    }
    
    const job = await Job.findOne(query);
    if (!job) {
      return res.status(404).json({ error: 'Job not found or access denied' });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const file = req.file;
    const ext = path.extname(file.originalname).toLowerCase();
    const isPhoto = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic'].includes(ext);
    const timestamp = Date.now();
    
    // Generate filename
    const pmNumber = job.pmNumber || 'NOPM';
    const notifNumber = job.notificationNumber || '';
    const matCode = job.matCode || '';
    let newFilename;
    
    if (isPhoto) {
      newFilename = `${job.division || 'DA'}_${pmNumber}_${notifNumber}_${matCode}_Photo_${timestamp}${ext}`;
    } else {
      const baseName = file.originalname.replace(/[^a-zA-Z0-9\-_.]/g, '_');
      newFilename = `${pmNumber}_${baseName}_${timestamp}${ext}`;
    }
    
    // Upload to R2 or save locally
    let docUrl = `/uploads/${newFilename}`;
    let r2Key = null;
    
    if (r2Storage.isR2Configured()) {
      try {
        const folderPath = subfolder ? `${folder}/${subfolder}` : folder;
        const result = await r2Storage.uploadJobFile(file.path, id, folderPath, newFilename);
        docUrl = r2Storage.getPublicUrl(result.key);
        r2Key = result.key;
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      } catch (uploadErr) {
        console.error('R2 upload failed:', uploadErr.message);
      }
    } else {
      const destPath = path.join(__dirname, 'uploads', newFilename);
      fs.renameSync(file.path, destPath);
    }
    
    // Find target folder and subfolder
    let targetFolder = job.folders.find(f => f.name === folder);
    if (!targetFolder) {
      targetFolder = { name: folder, documents: [], subfolders: [] };
      job.folders.push(targetFolder);
    }
    
    let targetDocs = targetFolder.documents;
    if (subfolder) {
      if (!targetFolder.subfolders) targetFolder.subfolders = [];
      let subfolderObj = targetFolder.subfolders.find(sf => sf.name === subfolder);
      if (!subfolderObj) {
        subfolderObj = { name: subfolder, documents: [], subfolders: [] };
        targetFolder.subfolders.push(subfolderObj);
      }
      if (!subfolderObj.documents) subfolderObj.documents = [];
      targetDocs = subfolderObj.documents;
    }
    
    // Add document to folder
    const newDoc = {
      name: newFilename,
      url: docUrl,
      r2Key: r2Key,
      type: isPhoto ? 'photo' : 'document',
      photoType: photoType || null,
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,
      uploadDate: new Date(),
      uploadedBy: req.userId,
    };
    targetDocs.push(newDoc);
    
    await job.save();
    
    console.log(`File uploaded: ${newFilename} to ${folder}/${subfolder || ''}`);
    res.status(201).json({ 
      message: 'File uploaded successfully', 
      document: newDoc 
    });
  } catch (err) {
    console.error('File upload error:', err);
    res.status(500).json({ error: 'Upload failed', details: err.message });
  }
});

// Alias for /api/jobs/:id/files (used by ForemanCloseOut PDF save)
// Accepts: file, folder, subfolder - same as /api/jobs/:id/upload
app.post('/api/jobs/:id/files', authenticateUser, upload.single('file'), async (req, res) => {
  try {
    const { id } = req.params;
    const { folder = 'ACI', subfolder = 'Completed Forms' } = req.body;
    
    const currentUser = await User.findById(req.userId).select('companyId');
    
    const query = { _id: id };
    if (currentUser?.companyId) {
      query.companyId = currentUser.companyId;
    }
    
    if (!(req.isAdmin || req.userRole === 'pm' || req.userRole === 'admin')) {
      query.$or = [
        { userId: req.userId },
        { assignedTo: req.userId },
        { assignedToGF: req.userId }
      ];
    }
    
    const job = await Job.findOne(query);
    if (!job) {
      return res.status(404).json({ error: 'Job not found or access denied' });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const file = req.file;
    const ext = path.extname(file.originalname).toLowerCase();
    const isPdf = ext === '.pdf';
    const timestamp = Date.now();
    
    const pmNumber = job.pmNumber || 'NOPM';
    const baseName = file.originalname.replace(/[^a-zA-Z0-9\-_.]/g, '_');
    const newFilename = isPdf ? file.originalname : `${pmNumber}_${baseName}_${timestamp}${ext}`;
    
    let docUrl = `/uploads/${newFilename}`;
    let r2Key = null;
    
    if (r2Storage.isR2Configured()) {
      try {
        const folderPath = subfolder ? `${folder}/${subfolder}` : folder;
        const result = await r2Storage.uploadJobFile(file.path, id, folderPath, newFilename);
        docUrl = r2Storage.getPublicUrl(result.key);
        r2Key = result.key;
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      } catch (uploadErr) {
        console.error('R2 upload failed:', uploadErr.message);
      }
    } else {
      const destPath = path.join(__dirname, 'uploads', newFilename);
      fs.renameSync(file.path, destPath);
    }
    
    // Find target folder and subfolder
    let targetFolder = job.folders.find(f => f.name === folder);
    if (!targetFolder) {
      targetFolder = { name: folder, documents: [], subfolders: [] };
      job.folders.push(targetFolder);
    }
    
    let targetDocs = targetFolder.documents;
    if (subfolder) {
      if (!targetFolder.subfolders) targetFolder.subfolders = [];
      let subfolderObj = targetFolder.subfolders.find(sf => sf.name === subfolder);
      if (!subfolderObj) {
        subfolderObj = { name: subfolder, documents: [], subfolders: [] };
        targetFolder.subfolders.push(subfolderObj);
      }
      if (!subfolderObj.documents) subfolderObj.documents = [];
      targetDocs = subfolderObj.documents;
    }
    
    const newDoc = {
      name: newFilename,
      url: docUrl,
      r2Key: r2Key,
      type: isPdf ? 'filled_pdf' : 'other',
      uploadDate: new Date(),
      uploadedBy: req.userId,
    };
    targetDocs.push(newDoc);
    
    job.markModified('folders');
    await job.save();
    
    console.log(`File saved: ${newFilename} to ${folder}/${subfolder || ''}`);
    res.status(201).json({ 
      message: 'File saved successfully', 
      document: newDoc 
    });
  } catch (err) {
    console.error('File save error:', err);
    res.status(500).json({ error: 'Save failed', details: err.message });
  }
});

// ==================== GENERIC DOCUMENT UPLOAD (for offline sync) ====================
// Used by offline sync to upload documents/photos to a job
// Supports: folderName, subfolderName, document (file)
app.post('/api/jobs/:id/documents', authenticateUser, upload.single('document'), async (req, res) => {
  try {
    const { id } = req.params;
    const { folderName = 'ACI', subfolderName = 'GF Audit' } = req.body;
    
    const currentUser = await User.findById(req.userId).select('companyId');
    
    // Build query with company filter
    const query = { _id: id };
    if (currentUser?.companyId) {
      query.companyId = currentUser.companyId;
    }
    
    // Allow access for admin/PM or assigned users
    if (!(req.isAdmin || req.userRole === 'pm' || req.userRole === 'admin')) {
      query.$or = [
        { userId: req.userId },
        { assignedTo: req.userId },
        { assignedToGF: req.userId }
      ];
    }
    
    const job = await Job.findOne(query);
    if (!job) {
      return res.status(404).json({ error: 'Job not found or access denied' });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Determine file type and generate appropriate name
    const file = req.file;
    const ext = path.extname(file.originalname).toLowerCase();
    const isPhoto = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic'].includes(ext);
    const timestamp = Date.now();
    
    // Generate filename
    const pmNumber = job.pmNumber || 'NOPM';
    const notifNumber = job.notificationNumber || '';
    const matCode = job.matCode || '';
    let newFilename;
    
    if (isPhoto) {
      newFilename = `${job.division || 'DA'}_${pmNumber}_${notifNumber}_${matCode}_Photo_${timestamp}${ext}`;
    } else {
      const baseName = file.originalname.replace(/[^a-zA-Z0-9\-_.]/g, '_');
      newFilename = `${pmNumber}_${baseName}`;
    }
    
    // Upload to R2 or save locally
    let docUrl = `/uploads/${newFilename}`;
    let r2Key = null;
    
    if (r2Storage.isR2Configured()) {
      try {
        const folderPath = subfolderName ? `${folderName}/${subfolderName}` : folderName;
        const result = await r2Storage.uploadJobFile(file.path, id, folderPath, newFilename);
        docUrl = r2Storage.getPublicUrl(result.key);
        r2Key = result.key;
        // Clean up local temp file
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      } catch (uploadErr) {
        console.error('R2 upload failed, using local storage:', uploadErr.message);
        // Keep local file as fallback
      }
    } else {
      // Move to uploads folder
      const destPath = path.join(__dirname, 'uploads', newFilename);
      fs.renameSync(file.path, destPath);
    }
    
    // Find target folder and subfolder
    let folder = job.folders.find(f => f.name === folderName);
    if (!folder) {
      folder = { name: folderName, documents: [], subfolders: [] };
      job.folders.push(folder);
    }
    
    let targetDocs = folder.documents;
    if (subfolderName) {
      if (!folder.subfolders) folder.subfolders = [];
      let subfolder = folder.subfolders.find(sf => sf.name === subfolderName);
      if (!subfolder) {
        subfolder = { name: subfolderName, documents: [], subfolders: [] };
        folder.subfolders.push(subfolder);
      }
      if (!subfolder.documents) subfolder.documents = [];
      targetDocs = subfolder.documents;
    }
    
    // Add document to folder
    const newDoc = {
      name: newFilename,
      url: docUrl,
      r2Key: r2Key,
      type: isPhoto ? 'photo' : 'document',
      uploadDate: new Date(),
      uploadedBy: req.userId,
    };
    targetDocs.push(newDoc);
    
    await job.save();
    
    console.log(`Document uploaded: ${newFilename} to ${folderName}/${subfolderName || ''}`);
    res.status(201).json({ 
      message: 'Document uploaded successfully', 
      document: newDoc 
    });
  } catch (err) {
    console.error('Document upload error:', err);
    res.status(500).json({ error: 'Upload failed', details: err.message });
  }
});

// Upload photos specifically (for foreman job completion photos)
// Photos are named: DA_PM#_Notification#_MAT_Photo_timestamp.ext
app.post('/api/jobs/:id/photos', authenticateUser, upload.array('photos', 20), async (req, res) => {
  try {
    const { id } = req.params;
    
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // ============================================
    const currentUser = await User.findById(req.userId).select('companyId');
    
    console.log('Photo upload request:', {
      jobId: id,
      userId: req.userId,
      userRole: req.userRole,
      isAdmin: req.isAdmin,
      companyId: currentUser?.companyId,
      filesCount: req.files?.length
    });
    
    // Build base query with company filter
    const query = { _id: id };
    if (currentUser?.companyId) {
      query.companyId = currentUser.companyId;
    }
    
    // Allow photo upload if user is:
    // - Admin/PM (can access any job IN THEIR COMPANY)
    // - Owner of the job (userId)
    // - Assigned to the job (assignedTo)
    // - GF assigned to the job (assignedToGF)
    let job;
    if (req.isAdmin || req.userRole === 'pm' || req.userRole === 'admin') {
      console.log('Admin/PM access - finding job by ID in company');
      job = await Job.findOne(query);
    } else {
      console.log('Non-admin access - checking assignment in company');
      query.$or = [
        { userId: req.userId },
        { assignedTo: req.userId },
        { assignedToGF: req.userId }
      ];
      job = await Job.findOne(query);
    }
    
    if (!job) {
      console.log('Photo upload denied - job not found or no access');
      return res.status(404).json({ error: 'Job not found or you do not have access' });
    }
    
    console.log('Photo upload authorized for job:', job.pmNumber);
    
    // Get target folder from request body (defaults to ACI > Photos for backwards compatibility)
    const targetFolderName = req.body.folder || 'ACI';
    const targetSubfolderName = req.body.subfolder || 'Photos';
    
    console.log('Target folder path:', targetFolderName, '>', targetSubfolderName);
    
    // Find the target folder
    const parentFolder = job.folders.find(f => f.name === targetFolderName);
    if (!parentFolder) {
      return res.status(404).json({ error: `${targetFolderName} folder not found` });
    }
    
    // Find or create the subfolder
    let photosFolder = parentFolder.subfolders.find(sf => sf.name === targetSubfolderName);
    if (!photosFolder) {
      // Create subfolder if it doesn't exist
      photosFolder = { name: targetSubfolderName, documents: [], subfolders: [] };
      parentFolder.subfolders.push(photosFolder);
      console.log('Created new subfolder:', targetSubfolderName);
    }
    
    // Generate proper filenames and upload to R2 IN PARALLEL for speed
    const baseTimestamp = Date.now();
    const r2SubfolderPath = targetSubfolderName.toLowerCase().replace(/\s+/g, '_');
    const division = job.division || 'DA';
    const pmNumber = job.pmNumber || 'NOPM';
    const notification = job.notificationNumber || 'NONOTIF';
    const matCode = job.matCode || '2AA';
    
    console.log(`Processing ${req.files.length} photos in parallel, R2 configured:`, r2Storage.isR2Configured());
    
    // Process all photos in parallel for much faster uploads
    const uploadPromises = req.files.map(async (file, i) => {
      let ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      const uniqueTimestamp = `${baseTimestamp}_${i.toString().padStart(3, '0')}`;
      
      let fileToUpload = file.path;
      let tempProcessedFile = null;
      
      try {
        // Use sharp to compress and convert ALL images to optimized JPEG
        // This handles HEIC, PNG, large JPEGs, etc. - much faster than heic-convert
        const isImage = ['.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp', '.tiff'].includes(ext);
        
        if (isImage) {
          tempProcessedFile = file.path + '_optimized.jpg';
          await sharp(file.path)
            .rotate() // Auto-rotate based on EXIF
            .resize(2048, 2048, { // Max 2048px on longest side (good for field photos)
              fit: 'inside',
              withoutEnlargement: true
            })
            .jpeg({ 
              quality: 80, // Good balance of quality vs size
              mozjpeg: true // Better compression
            })
            .toFile(tempProcessedFile);
          
          fileToUpload = tempProcessedFile;
          ext = '.jpg';
        }
      } catch (sharpErr) {
        console.error('Sharp processing failed, trying heic-convert fallback:', sharpErr.message);
        // Fallback for HEIC if sharp fails (some edge cases)
        if (ext === '.heic' || ext === '.heif') {
          try {
            tempProcessedFile = file.path + '.jpg';
            const inputBuffer = fs.readFileSync(file.path);
            const outputBuffer = await heicConvert({
              buffer: inputBuffer,
              format: 'JPEG',
              quality: 0.8
            });
            fs.writeFileSync(tempProcessedFile, Buffer.from(outputBuffer));
            fileToUpload = tempProcessedFile;
            ext = '.jpg';
          } catch (convertErr) {
            console.error('HEIC fallback also failed:', convertErr.message);
          }
        }
      }
      
      const newFilename = `${division}_${pmNumber}_${notification}_${matCode}_Photo_${uniqueTimestamp}${ext}`;
      
      let docUrl = `/uploads/${newFilename}`;
      let r2Key = null;
      
      // Upload to R2 if configured
      if (r2Storage.isR2Configured()) {
        try {
          const result = await r2Storage.uploadJobFile(fileToUpload, id, r2SubfolderPath, newFilename);
          docUrl = r2Storage.getPublicUrl(result.key);
          r2Key = result.key;
          // Clean up local files
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
          if (tempProcessedFile && fs.existsSync(tempProcessedFile)) fs.unlinkSync(tempProcessedFile);
        } catch (uploadErr) {
          console.error('Failed to upload photo to R2:', uploadErr.message);
          // Fallback to local
          const newPath = path.join(__dirname, 'uploads', newFilename);
          fs.renameSync(fileToUpload, newPath);
          // Cleanup temp files - both original and any processed file that wasn't used
          if (tempProcessedFile && tempProcessedFile !== fileToUpload && fs.existsSync(tempProcessedFile)) {
            fs.unlinkSync(tempProcessedFile);
          }
          // Cleanup original file if we used a processed version
          if (file.path !== fileToUpload && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        }
      } else {
        const newPath = path.join(__dirname, 'uploads', newFilename);
        fs.renameSync(fileToUpload, newPath);
        // Cleanup original if we used processed file
        if (tempProcessedFile && file.path !== fileToUpload && fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      }
      
      return {
        name: newFilename,
        url: docUrl,
        r2Key: r2Key,
        type: 'image',
        uploadDate: new Date(),
        uploadedBy: req.userId
      };
    });
    
    // Wait for all uploads to complete in parallel
    const uploadedPhotos = await Promise.all(uploadPromises);
    console.log(`All ${uploadedPhotos.length} photos uploaded successfully`);
    
    // Use retry loop with reload to handle concurrent uploads
    let retries = 5;
    let saved = false;
    while (retries > 0 && !saved) {
      try {
        // Reload job fresh to get latest version
        const freshJob = await Job.findById(job._id);
        if (!freshJob) throw new Error('Job not found');
        
        // Find the target folder
        const freshParentFolder = freshJob.folders?.find(f => f.name === targetFolderName);
        if (!freshParentFolder) throw new Error(`${targetFolderName} folder not found`);
        
        let targetFolder;
        if (targetSubfolderName) {
          targetFolder = freshParentFolder.subfolders?.find(sf => sf.name === targetSubfolderName);
          if (!targetFolder) {
            // Create subfolder if missing
            targetFolder = { name: targetSubfolderName, documents: [], subfolders: [] };
            if (!freshParentFolder.subfolders) freshParentFolder.subfolders = [];
            freshParentFolder.subfolders.push(targetFolder);
          }
        } else {
          targetFolder = freshParentFolder;
        }
        
        if (!targetFolder.documents) targetFolder.documents = [];
        targetFolder.documents.push(...uploadedPhotos);
        freshJob.markModified('folders');
        await freshJob.save();
        saved = true;
      } catch (saveErr) {
        if (saveErr.name === 'VersionError' && retries > 1) {
          retries--;
          console.log(`Version conflict saving photos for job ${job._id}, retrying... (${retries} left)`);
          // NOSONAR: Math.random() for retry jitter timing is safe - not security-sensitive
          await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100)); // NOSONAR
        } else {
          throw saveErr;
        }
      }
    }
    
    if (!saved) {
      throw new Error('Failed to save photos after retries');
    }
    
    console.log('Photos uploaded:', uploadedPhotos.map(p => p.name));
    res.json({ message: 'Photos uploaded successfully', photos: uploadedPhotos });
  } catch (err) {
    console.error('Photo upload error:', err);
    res.status(500).json({ error: 'Photo upload failed', details: err.message });
  }
});

// ==================== EXPORT FOLDER TO EMAIL ====================
// Export folder contents (photos) as a ZIP file for emailing to Project Coordinator
// GF Audit workflow: GF takes prefield photos, uploads to GF Audit folder, exports to email PC
app.get('/api/jobs/:id/folders/:folderName/export', authenticateUser, async (req, res) => {
  try {
    const { id, folderName } = req.params;
    const { subfolder } = req.query; // Optional subfolder path
    
    // Fetch job with company security
    const currentUser = await User.findById(req.userId).select('companyId role');
    const query = { _id: id };
    if (currentUser?.companyId) {
      query.companyId = currentUser.companyId;
    }
    
    const job = await Job.findOne(query);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Find the folder
    const folder = job.folders.find(f => f.name === folderName);
    if (!folder) {
      return res.status(404).json({ error: `Folder "${folderName}" not found` });
    }
    
    // Get documents from folder or subfolder
    let documents = [];
    let exportFolderName = folderName;
    
    if (subfolder) {
      // Navigate to subfolder
      const subfolderParts = subfolder.split('/');
      let currentFolder = folder;
      
      for (const part of subfolderParts) {
        const nextFolder = currentFolder.subfolders?.find(sf => sf.name === part);
        if (!nextFolder) {
          return res.status(404).json({ error: `Subfolder "${part}" not found` });
        }
        currentFolder = nextFolder;
      }
      
      documents = currentFolder.documents || [];
      exportFolderName = subfolderParts[subfolderParts.length - 1];
    } else {
      documents = folder.documents || [];
    }
    
    if (documents.length === 0) {
      return res.status(400).json({ error: 'No documents to export in this folder' });
    }
    
    const zipFilename = `${job.pmNumber || job.woNumber || 'Job'}_${exportFolderName}_${Date.now()}.zip`;
    
    // First, fetch all files into memory
    const filesToZip = [];
    for (const doc of documents) {
      try {
        let fileBuffer = null;
        
        // Get file from R2 or local storage
        if (doc.r2Key && r2Storage.isR2Configured()) {
          // Fetch from R2 using getFileStream
          const r2Response = await r2Storage.getFileStream(doc.r2Key);
          if (r2Response?.stream) {
            const chunks = [];
            for await (const chunk of r2Response.stream) {
              chunks.push(chunk);
            }
            fileBuffer = Buffer.concat(chunks);
          }
        } else if (doc.url) {
          // Try to get from URL (could be external or local)
          if (doc.url.startsWith('http://') || doc.url.startsWith('https://')) {
            // External URL - validate before fetching (SSRF protection)
            const urlValidation = await validateUrl(doc.url, { 
              allowHttp: false,  // Only HTTPS
              requireAllowlist: true,  // Only trusted domains
              resolveDNS: true  // Check resolved IPs
            });
            
            if (urlValidation.valid) {
              const fetch = (await import('node-fetch')).default;
              const response = await fetch(urlValidation.url.href);
              if (response.ok) {
                fileBuffer = Buffer.from(await response.arrayBuffer());
              }
            } else {
              console.warn(`[SSRF Protection] Blocked fetch to: ${doc.url} - ${urlValidation.error}`);
            }
          } else if (doc.url.startsWith('/uploads/')) {
            // Local file
            const localPath = path.join(__dirname, doc.url);
            if (fs.existsSync(localPath)) {
              fileBuffer = fs.readFileSync(localPath);
            }
          }
        }
        
        if (fileBuffer) {
          filesToZip.push({ name: doc.name, buffer: fileBuffer });
          console.log(`Prepared for ZIP: ${doc.name}`);
        } else {
          console.warn(`Could not fetch file: ${doc.name}`);
        }
      } catch (docErr) {
        console.error(`Error fetching ${doc.name}:`, docErr.message);
      }
    }
    
    if (filesToZip.length === 0) {
      return res.status(400).json({ error: 'Could not fetch any files to export' });
    }
    
    // Create ZIP archive in memory first to ensure it's valid
    const archive = archiver('zip', { zlib: { level: 5 } });
    const zipChunks = [];
    
    // Set up promise to wait for end event BEFORE finalizing (avoid race condition)
    const archiveEndPromise = new Promise((resolve, reject) => {
      archive.on('end', resolve);
      archive.on('error', reject);
    });
    
    // Collect ZIP data into memory
    archive.on('data', (chunk) => zipChunks.push(chunk));
    archive.on('warning', (err) => console.warn('Archive warning:', err.message));
    
    // Track filenames to avoid duplicates (which can corrupt ZIP extraction)
    const usedNames = new Set();
    
    // Add all files to archive with unique names
    for (const file of filesToZip) {
      let fileName = file.name;
      
      // If duplicate, add counter suffix
      if (usedNames.has(fileName)) {
        const ext = path.extname(fileName);
        const base = path.basename(fileName, ext);
        let counter = 2;
        while (usedNames.has(`${base}_${counter}${ext}`)) {
          counter++;
        }
        fileName = `${base}_${counter}${ext}`;
      }
      
      usedNames.add(fileName);
      archive.append(file.buffer, { name: fileName });
    }
    
    // Finalize and wait for all data to be collected
    archive.finalize();
    await archiveEndPromise;
    
    // Combine all chunks into final ZIP buffer
    const zipBuffer = Buffer.concat(zipChunks);
    
    // Audit log: Bulk download/export
    logExport.bulkDownload(req, id, filesToZip.length);
    
    // Send the complete, valid ZIP
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);
    res.setHeader('Content-Length', zipBuffer.length);
    res.send(zipBuffer);
    
    console.log(`ZIP export complete: ${zipFilename} with ${filesToZip.length} files, size: ${zipBuffer.length} bytes`);
    
  } catch (err) {
    console.error('Export folder error:', err);
    res.status(500).json({ error: 'Failed to export folder', details: err.message });
  }
});

// ==================== JOB PACKAGE EXPORT FOR UTILITY SUBMISSION ====================
// Export complete job package (timesheet + tailboard + units) in Oracle/SAP format
// This accompanies the job package submission to PG&E, SCE, etc.
app.get('/api/jobs/:id/export-package', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { format = 'oracle', output = 'json' } = req.query; // format: oracle|sap, output: json|csv|pdf

    const user = await User.findById(req.userId).select('companyId role');
    const job = await Job.findOne({ _id: id, companyId: user?.companyId });
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Load related data
    const Timesheet = require('./models/Timesheet');
    const Tailboard = mongoose.models.Tailboard; // May not exist yet
    const UnitEntry = require('./models/UnitEntry');

    // Get latest timesheet for this job
    const timesheet = await Timesheet.findOne({ jobId: id })
      .sort({ date: -1 })
      .lean();

    // Get tailboard (stored in job or separate collection)
    let tailboard = null;
    if (Tailboard) {
      tailboard = await Tailboard.findOne({ jobId: id })
        .sort({ date: -1 })
        .lean();
    } else if (job.tailboard) {
      tailboard = job.tailboard;
    }

    // Get all approved/submitted units
    const units = await UnitEntry.find({
      jobId: id,
      status: { $in: ['approved', 'submitted', 'pending'] }
    }).lean();

    // Generate export
    const { 
      generateJobPackageExport, 
      generateJobPackageCSV,
      generateJobPackagePDF
    } = require('./utils/jobPackageExport');

    const exportData = generateJobPackageExport(job, {
      format,
      timesheet,
      tailboard,
      units,
    });

    // Return based on output format
    if (output === 'csv') {
      const csvFiles = generateJobPackageCSV(exportData);
      
      // If multiple files, zip them
      const fileCount = Object.keys(csvFiles).length;
      if (fileCount > 1) {
        const archive = archiver('zip', { zlib: { level: 5 } });
        const chunks = [];
        
        archive.on('data', chunk => chunks.push(chunk));
        
        for (const [filename, content] of Object.entries(csvFiles)) {
          archive.append(content, { name: filename });
        }
        
        await archive.finalize();
        const zipBuffer = Buffer.concat(chunks);
        
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${job.woNumber || job.pmNumber}_package.zip"`);
        return res.send(zipBuffer);
      } else {
        // Single file, return directly
        const [filename, content] = Object.entries(csvFiles)[0] || ['export.csv', ''];
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(content);
      }
    } else if (output === 'pdf') {
      const pdfBuffer = await generateJobPackagePDF(exportData);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${job.woNumber || job.pmNumber}_package.pdf"`);
      return res.send(Buffer.from(pdfBuffer));
    } else {
      // Default: JSON
      res.json(exportData);
    }

  } catch (err) {
    console.error('Job package export error:', err);
    res.status(500).json({ error: 'Failed to export job package', details: err.message });
  }
});

// Helper function to recursively find and remove a document from nested folders
function findAndRemoveDocument(folders, docId) {
  for (const folder of folders) {
    // Check folder documents
    const folderDocIndex = folder.documents?.findIndex(doc => doc._id?.toString() === docId);
    if (folderDocIndex !== undefined && folderDocIndex !== -1) {
      const removedDoc = folder.documents[folderDocIndex];
      folder.documents.splice(folderDocIndex, 1);
      return removedDoc;
    }
    
    // Recursively check subfolders
    if (folder.subfolders && folder.subfolders.length > 0) {
      const result = findAndRemoveDocument(folder.subfolders, docId);
      if (result) return result;
    }
  }
  return null;
}

// Delete a document from a job folder
app.delete('/api/jobs/:id/documents/:docId', authenticateUser, async (req, res) => {
  try {
    const { id, docId } = req.params;
    
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // ============================================
    const user = await User.findById(req.userId).select('companyId isAdmin role');
    const query = { _id: id };
    if (user?.companyId) {
      query.companyId = user.companyId;
    }
    // Non-admins need ownership/assignment check
    if (!user?.isAdmin && !['pm', 'admin'].includes(user?.role)) {
      query.$or = [
        { userId: req.userId },
        { assignedTo: req.userId },
        { assignedToGF: req.userId }
      ];
    }
    
    const job = await Job.findOne(query);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Find and remove the document (searches all nested levels)
    const removedDoc = findAndRemoveDocument(job.folders, docId);
    
    if (!removedDoc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // Try to delete the actual file from disk (if it's in uploads folder)
    if (removedDoc && removedDoc.url && removedDoc.url.startsWith('/uploads/')) {
      const filename = removedDoc.url.replace('/uploads/', '');
      const filePath = path.join(__dirname, 'uploads', filename);
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log('File deleted from disk:', filePath);
        }
      } catch (fileErr) {
        console.warn('Could not delete file from disk:', fileErr.message);
        // Don't fail the request if file deletion fails
      }
    }
    
    await job.save();
    
    // Audit log: Document deleted
    logDocument.delete(req, { _id: docId, name: removedDoc?.name || docId }, id);
    
    console.log('Document removed from job:', docId);
    res.json({ message: 'Document deleted successfully', documentId: docId });
  } catch (err) {
    console.error('Error deleting document:', err);
    res.status(500).json({ error: 'Failed to delete document', details: err.message });
  }
});

// Admin: Create a new folder in a job's file structure
app.post('/api/jobs/:id/folders', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { folderName, parentFolder, isSubfolder } = req.body;
    
    // Check if user is admin
    const user = await User.findById(req.userId);
    if (!user || !user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required to create folders' });
    }
    
    if (!folderName || folderName.trim().length === 0) {
      return res.status(400).json({ error: 'Folder name is required' });
    }
    
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // Admins can access any job IN THEIR COMPANY
    // ============================================
    const query = { _id: id };
    if (user?.companyId) {
      query.companyId = user.companyId;
    }
    
    const job = await Job.findOne(query);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const cleanFolderName = folderName.trim();
    
    if (isSubfolder && parentFolder) {
      // Create subfolder under an existing parent folder
      const parent = job.folders.find(f => f.name === parentFolder);
      if (!parent) {
        return res.status(404).json({ error: 'Parent folder not found' });
      }
      
      // Check if subfolder already exists
      if (parent.subfolders.some(sf => sf.name === cleanFolderName)) {
        return res.status(400).json({ error: 'Subfolder already exists' });
      }
      
      parent.subfolders.push({
        name: cleanFolderName,
        documents: []
      });
    } else {
      // Create top-level folder
      if (job.folders.some(f => f.name === cleanFolderName)) {
        return res.status(400).json({ error: 'Folder already exists' });
      }
      
      job.folders.push({
        name: cleanFolderName,
        documents: [],
        subfolders: []
      });
    }
    
    await job.save();
    
    console.log('Folder created:', cleanFolderName, isSubfolder ? `under ${parentFolder}` : '(top-level)');
    res.json({ message: 'Folder created successfully', job });
  } catch (err) {
    console.error('Error creating folder:', err);
    res.status(500).json({ error: 'Failed to create folder', details: err.message });
  }
});

// Admin: Delete a folder from a job's file structure
app.delete('/api/jobs/:id/folders/:folderName', authenticateUser, async (req, res) => {
  try {
    const { id, folderName } = req.params;
    const { parentFolder } = req.body;
    
    // Check if user is admin
    const user = await User.findById(req.userId);
    if (!user || !user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required to delete folders' });
    }
    
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // Admins can access any job IN THEIR COMPANY
    // ============================================
    const query = { _id: id };
    if (user?.companyId) {
      query.companyId = user.companyId;
    }
    
    const job = await Job.findOne(query);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    if (parentFolder) {
      // Delete subfolder
      const parent = job.folders.find(f => f.name === parentFolder);
      if (!parent) {
        return res.status(404).json({ error: 'Parent folder not found' });
      }
      
      const subfolderIndex = parent.subfolders.findIndex(sf => sf.name === folderName);
      if (subfolderIndex === -1) {
        return res.status(404).json({ error: 'Subfolder not found' });
      }
      
      parent.subfolders.splice(subfolderIndex, 1);
    } else {
      // Delete top-level folder
      const folderIndex = job.folders.findIndex(f => f.name === folderName);
      if (folderIndex === -1) {
        return res.status(404).json({ error: 'Folder not found' });
      }
      
      job.folders.splice(folderIndex, 1);
    }
    
    await job.save();
    
    console.log('Folder deleted:', folderName);
    res.json({ message: 'Folder deleted successfully', job });
  } catch (err) {
    console.error('Error deleting folder:', err);
    res.status(500).json({ error: 'Failed to delete folder', details: err.message });
  }
});

// Admin: Get current user info (including admin status)
app.get('/api/user/me', authenticateUser, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    console.error('Error getting user:', err);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// Helper function to recursively find a document in nested folders
function findDocumentRecursive(folders, docId) {
  for (const folder of folders) {
    // Check folder documents
    for (const doc of folder.documents || []) {
      if (doc._id?.toString() === docId) {
        return doc;
      }
    }
    
    // Recursively check subfolders
    if (folder.subfolders && folder.subfolders.length > 0) {
      const result = findDocumentRecursive(folder.subfolders, docId);
      if (result) return result;
    }
  }
  return null;
}

// Update document (mark as completed, save edited PDF)
app.put('/api/jobs/:id/documents/:docId', authenticateUser, async (req, res) => {
  try {
    const { id, docId } = req.params;
    const { isCompleted, pdfData } = req.body;
    
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // ============================================
    const user = await User.findById(req.userId).select('companyId');
    const query = { _id: id };
    if (user?.companyId) {
      query.companyId = user.companyId;
    }
    // Also check ownership/assignment
    query.$or = [
      { userId: req.userId },
      { assignedTo: req.userId },
      { assignedToGF: req.userId }
    ];
    
    const job = await Job.findOne(query);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Find the document in any folder/subfolder (searches all nested levels)
    const foundDoc = findDocumentRecursive(job.folders, docId);
    
    if (!foundDoc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // Update document
    if (isCompleted !== undefined) {
      foundDoc.isCompleted = isCompleted;
      foundDoc.completedDate = isCompleted ? new Date() : null;
      foundDoc.completedBy = isCompleted ? req.userId : null;
    }
    
    // If PDF data is provided, save the edited PDF
    if (pdfData) {
      const pdfBuffer = Buffer.from(pdfData, 'base64');
      // Use timestamp + docId + random suffix to prevent filename collisions
      const randomSuffix = crypto.randomBytes(4).toString('hex');
      const filename = `edited_${docId}_${Date.now()}_${randomSuffix}.pdf`;
      const newPath = path.join(__dirname, 'uploads', filename);
      fs.writeFileSync(newPath, pdfBuffer);
      foundDoc.path = newPath;
      foundDoc.url = `/uploads/${filename}`;
    }
    
    await job.save();
    res.json({ message: 'Document updated', document: foundDoc });
  } catch (err) {
    console.error('Document update error:', err);
    res.status(500).json({ error: 'Update failed', details: err.message });
  }
});

// ============================================
// Socket.IO Authentication & Connection Handling
// ============================================

// JWT authentication middleware for socket connections
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return next(new Error('Authentication required'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('_id name email role companyId').lean();
    
    if (!user) {
      return next(new Error('User not found'));
    }

    // Attach user to socket
    socket.user = user;
    socket.userId = user._id.toString();
    socket.companyId = user.companyId?.toString();
    
    next();
  } catch (err) {
    console.error('[Socket.IO] Auth error:', err.message);
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  const { userId, companyId, user } = socket;
  console.log(`[Socket.IO] User connected: ${user.name} (${userId})`);
  
  // Join user-specific room for direct notifications
  socket.join(`user:${userId}`);
  
  // Join company room for company-wide broadcasts
  if (companyId) {
    socket.join(`company:${companyId}`);
  }
  
  // Handle joining job-specific rooms
  socket.on('join:job', (jobId) => {
    socket.join(`job:${jobId}`);
    console.log(`[Socket.IO] ${user.name} joined job room: ${jobId}`);
  });
  
  socket.on('leave:job', (jobId) => {
    socket.leave(`job:${jobId}`);
  });
  
  // Handle disconnection
  socket.on('disconnect', (reason) => {
    console.log(`[Socket.IO] User disconnected: ${user.name} (${reason})`);
  });
  
  // Send initial connection confirmation
  socket.emit('connected', { userId, userName: user.name });
});

// ============================================
// ERROR HANDLING (Production-Grade)
// ============================================

// Express error handler - sanitized responses
app.use((err, req, res, next) => {
  const requestId = req.headers['x-request-id'] || 'unknown';
  
  // Log full error internally
  console.error(`[${requestId}] Express error:`, {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method
  });
  
  // Send sanitized response (no stack traces in production)
  const statusCode = err.statusCode || err.status || 500;
  res.status(statusCode).json({
    error: statusCode === 500 ? 'Internal server error' : err.message,
    requestId,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Global error handlers to prevent crashes
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err.message);
  console.error(err.stack);
  // Give time for logs to flush, then exit
  setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
});

// ============================================
// SECURE ERROR HANDLER (Fort Knox - Last Line of Defense)
// ============================================
// Must be last middleware - catches all errors and prevents stack trace leakage
app.use(secureErrorHandler);

// ============================================
// GRACEFUL SHUTDOWN HANDLING
// ============================================
let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  
  // Stop accepting new connections
  server.close(async () => {
    console.log('HTTP server closed');
    
    try {
      // Close database connection
      await mongoose.connection.close();
      console.log('MongoDB connection closed');
      
      // Close Socket.io
      io.close();
      console.log('Socket.io closed');
      
      console.log('✅ Graceful shutdown complete');
      process.exit(0);
    } catch (err) {
      console.error('Error during shutdown:', err);
      process.exit(1);
    }
  });
  
  // Force shutdown after 30 seconds
  setTimeout(() => {
    console.error('⚠️ Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
}

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ============================================
// REQUEST TIMEOUT MIDDLEWARE
// ============================================
const REQUEST_TIMEOUT_MS = 30000; // 30 seconds

app.use((req, res, next) => {
  // Set timeout for all requests
  req.setTimeout(REQUEST_TIMEOUT_MS, () => {
    if (!res.headersSent) {
      console.warn(`Request timeout: ${req.method} ${req.path}`);
      res.status(408).json({ error: 'Request timeout' });
    }
  });
  next();
});

// ============================================
// START SERVER (after MongoDB connection is established)
// ============================================
// Note: Server start is handled in connectWithRetry().then() block above
// This ensures health checks pass because MongoDB is connected before we listen

