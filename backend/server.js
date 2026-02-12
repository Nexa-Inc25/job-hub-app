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
const multer = require('multer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
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

// Route modules
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
const jobDocumentsRoutes = require('./routes/job-documents.routes');
const jobCoreRoutes = require('./routes/job-core.routes');

const authController = require('./controllers/auth.controller');
const r2Storage = require('./utils/storage');
const { setupSwagger } = require('./config/swagger');

console.log('All modules loaded, memory:', Math.round(process.memoryUsage().heapUsed / 1024 / 1024), 'MB');

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
  } catch {
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

// ============================================
// ROUTE MODULES - Mounted after body parsers, before static files
// ============================================

// Public / self-authenticating routes
app.use('/api', apiRoutes);
app.use('/api/demo', demoRoutes);
app.use('/api/oracle', authenticateUser, oracleRoutes);
app.use('/api/stripe', stripeRoutes);            // Has its own webhook auth
app.use('/api/utilities', utilitiesRoutes);

// Authenticated routes - authenticateUser applied at mount level
app.use('/api/billing', authenticateUser, billingRoutes);
app.use('/api/pricebook', authenticateUser, priceBookRoutes);
app.use('/api/fieldtickets', authenticateUser, fieldTicketRoutes);
app.use('/api/voice', authenticateUser, voiceRoutes);
app.use('/api/bidding', authenticateUser, biddingRoutes);
app.use('/api/weather', authenticateUser, weatherRoutes);
app.use('/api/asbuilt', authenticateUser, asbuiltRoutes);
app.use('/api/asbuilt-assistant', authenticateUser, asbuiltAssistantRoutes);
app.use('/api/tailboard', authenticateUser, tailboardRoutes);
app.use('/api/notifications', authenticateUser, notificationRoutes);
app.use('/api/smartforms', authenticateUser, smartformsRoutes);
app.use('/api/procedures', authenticateUser, proceduresRoutes);
app.use('/api/specs', authenticateUser, specsRoutes);
app.use('/api/company', authenticateUser, companyRoutes);
app.use('/api/users', authenticateUser, usersRoutes);
app.use('/api/qa', authenticateUser, qaRoutes);
app.use('/api/feedback', authenticateUser, feedbackRoutes);
app.use('/api/superadmin', authenticateUser, superadminRoutes);
app.use('/api/admin', authenticateUser, adminPlatformRoutes);

// Job routes (multiple routers share /api/jobs prefix)
app.use('/api/jobs', authenticateUser, jobCoreRoutes);
app.use('/api/jobs', authenticateUser, jobDocumentsRoutes);
app.use('/api/jobs', authenticateUser, jobLifecycleRoutes);
app.use('/api/jobs', authenticateUser, jobExtendedRoutes);
app.use('/api/jobs', authenticateUser, jobMiscRoutes);

// Self-authenticating route modules (have their own authenticateUser internally)
app.use('/api/timesheet', timesheetRoutes);
app.use('/api/lme', lmeRoutes);

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
// Express error handler - must have 4 params for Express to recognize it
app.use((err, req, res, _next) => {
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

process.on('unhandledRejection', (reason, _promise) => {
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

