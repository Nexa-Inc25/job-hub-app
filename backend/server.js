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
  secureErrorHandler
} = require('./middleware/security');
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
  
  // Determine overall health
  const isHealthy = dbState === 1;
  const statusCode = isHealthy ? 200 : 503;
  
  res.status(statusCode).json({ 
    status: isHealthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    
    // Database health
    database: {
      status: dbStates[dbState] || 'unknown',
      connected: dbState === 1
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
    
    // Feature flags
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
  contentSecurityPolicy: false  // Disable CSP for now (can be strict later)
}));

// ============================================
// ADDITIONAL SECURITY HARDENING (Fort Knox Mode)
// ============================================
app.use(requestId);                    // Unique request ID for audit correlation
app.use(additionalSecurityHeaders);    // Extra security headers
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
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use forwarded IP for users behind proxies
    return req.ip || req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
  }
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
app.use('/api/login', authLimiter);
app.use('/api/signup', authLimiter);
app.use('/api/billing/claims/*/export', heavyLimiter);  // Export endpoints
app.use('/api/billing/export', heavyLimiter);           // Bulk exports
app.use('/api/files/upload', heavyLimiter);             // File uploads
app.use('/api/asbuilt/submit', heavyLimiter);           // As-built submissions
app.use('/api/', apiLimiter);                           // General API

// ============================================
// CORS - whitelist allowed origins for security
const allowedOrigins = [
  'https://fieldledger.io',
  'https://www.fieldledger.io',
  'https://app.fieldledger.io',
  'https://fieldledger.vercel.app',
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:5173'
].filter(Boolean);

console.log('Allowed CORS origins:', allowedOrigins);

const io = socketIo(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  }
});

app.use((req, res, next) => {
  const origin = req.headers.origin;
  // Only log non-GET requests or errors (reduce log noise in production)
  
  // Only allow whitelisted origins when using credentials
  if (origin && allowedOrigins.includes(origin)) {
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
  })
  .catch(err => console.error('MongoDB connection failed:', err));

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
app.post('/api/signup', authController.signup);

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
app.post('/api/login', authController.login);

// ==================== MFA ENDPOINTS (PG&E Compliance) ====================

// Verify MFA code during login
app.post('/api/auth/mfa/verify', async (req, res) => {
  try {
    const { mfaToken, code, trustDevice } = req.body;
    
    if (!mfaToken || !code) {
      return res.status(400).json({ error: 'MFA token and code are required' });
    }
    
    // Verify the temporary MFA token
    let decoded;
    try {
      decoded = jwt.verify(mfaToken, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'MFA session expired. Please login again.' });
    }
    
    if (!decoded.mfaPending) {
      return res.status(400).json({ error: 'Invalid MFA token' });
    }
    
    // Get user with MFA secret
    const user = await User.findById(decoded.userId).select('+mfaSecret +mfaBackupCodes');
    if (!user || !user.mfaEnabled) {
      return res.status(400).json({ error: 'MFA not enabled for this user' });
    }
    
    // Try TOTP code first
    let verified = mfa.verifyMFAToken(code, user.mfaSecret);
    
    // If TOTP fails, try backup code
    if (!verified && code.includes('-')) {
      const backupIndex = mfa.verifyBackupCode(code, user.mfaBackupCodes);
      if (backupIndex >= 0) {
        // Mark backup code as used
        user.mfaBackupCodes[backupIndex].used = true;
        user.mfaBackupCodes[backupIndex].usedAt = new Date();
        await user.save();
        verified = true;
      }
    }
    
    if (!verified) {
      logAuth.loginFailed(req, user.email, 'Invalid MFA code');
      return res.status(401).json({ error: 'Invalid verification code' });
    }
    
    // Optionally trust this device
    if (trustDevice) {
      const deviceId = mfa.generateDeviceId(req);
      user.mfaVerifiedDevices = user.mfaVerifiedDevices || [];
      user.mfaVerifiedDevices.push({
        deviceId,
        deviceName: req.headers['user-agent']?.substring(0, 100) || 'Unknown Device',
        lastUsed: new Date()
      });
      // Keep only last 5 trusted devices
      if (user.mfaVerifiedDevices.length > 5) {
        user.mfaVerifiedDevices = user.mfaVerifiedDevices.slice(-5);
      }
      await user.save();
    }
    
    // Issue full access token
    const token = jwt.sign({ 
      userId: user._id, 
      isAdmin: user.isAdmin,
      isSuperAdmin: user.isSuperAdmin || false,
      role: user.role,
      canApprove: user.canApprove || false,
      name: user.name
    }, process.env.JWT_SECRET, { expiresIn: '24h' });
    
    logAuth.loginSuccess(req, user);
    
    res.json({ 
      token, 
      userId: user._id, 
      isAdmin: user.isAdmin,
      isSuperAdmin: user.isSuperAdmin || false, 
      role: user.role, 
      canApprove: user.canApprove || false,
      name: user.name,
      mfaEnabled: true
    });
  } catch (err) {
    console.error('MFA verify error:', err);
    res.status(500).json({ error: 'MFA verification failed' });
  }
});

// Setup MFA - Generate secret and QR code
app.post('/api/auth/mfa/setup', authenticateUser, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (user.mfaEnabled) {
      return res.status(400).json({ error: 'MFA is already enabled' });
    }
    
    // Generate new secret and QR code
    const { secret, qrCodeDataUrl } = await mfa.generateMFASecret(user.email);
    
    // Store secret temporarily (not enabled yet)
    user.mfaSecret = secret;
    await user.save();
    
    res.json({
      qrCode: qrCodeDataUrl,
      secret: secret, // Allow manual entry if QR doesn't work
      message: 'Scan QR code with your authenticator app, then verify with a code'
    });
  } catch (err) {
    console.error('MFA setup error:', err);
    res.status(500).json({ error: 'Failed to setup MFA' });
  }
});

// Enable MFA - Verify initial code and activate
app.post('/api/auth/mfa/enable', authenticateUser, async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Verification code is required' });
    }
    
    const user = await User.findById(req.userId).select('+mfaSecret');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (!user.mfaSecret) {
      return res.status(400).json({ error: 'Please run MFA setup first' });
    }
    
    if (user.mfaEnabled) {
      return res.status(400).json({ error: 'MFA is already enabled' });
    }
    
    // Verify the code
    if (!mfa.verifyMFAToken(code, user.mfaSecret)) {
      return res.status(400).json({ error: 'Invalid verification code. Please try again.' });
    }
    
    // Generate backup codes
    const backupCodes = mfa.generateBackupCodes(10);
    const hashedBackupCodes = backupCodes.map(bc => ({
      code: mfa.hashBackupCode(bc.code),
      used: false
    }));
    
    // Enable MFA
    user.mfaEnabled = true;
    user.mfaEnabledAt = new Date();
    user.mfaBackupCodes = hashedBackupCodes;
    await user.save();
    
    // Log the event
    logAuth.loginSuccess(req, user); // Reusing for MFA enabled tracking
    
    res.json({
      success: true,
      message: 'MFA has been enabled',
      backupCodes: backupCodes.map(bc => bc.code) // Return plain codes once
    });
  } catch (err) {
    console.error('MFA enable error:', err);
    res.status(500).json({ error: 'Failed to enable MFA' });
  }
});

// Disable MFA
app.post('/api/auth/mfa/disable', authenticateUser, async (req, res) => {
  try {
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({ error: 'Password is required to disable MFA' });
    }
    
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Verify password
    if (!(await user.comparePassword(password))) {
      return res.status(401).json({ error: 'Invalid password' });
    }
    
    // Disable MFA
    user.mfaEnabled = false;
    user.mfaSecret = undefined;
    user.mfaBackupCodes = [];
    user.mfaVerifiedDevices = [];
    await user.save();
    
    res.json({ success: true, message: 'MFA has been disabled' });
  } catch (err) {
    console.error('MFA disable error:', err);
    res.status(500).json({ error: 'Failed to disable MFA' });
  }
});

// Get MFA status
app.get('/api/auth/mfa/status', authenticateUser, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('mfaEnabled mfaEnabledAt mfaVerifiedDevices');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      enabled: user.mfaEnabled || false,
      enabledAt: user.mfaEnabledAt,
      trustedDevices: (user.mfaVerifiedDevices || []).length
    });
  } catch (err) {
    console.error('MFA status error:', err);
    res.status(500).json({ error: 'Failed to get MFA status' });
  }
});

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

// Mount as-built document routing (intelligent document router)
app.use('/api/asbuilt', authenticateUser, asbuiltRoutes);

// Mount Oracle integration routes (Unifier, EAM, P6)
app.use('/api/oracle', authenticateUser, oracleRoutes);

// ==================== USER MANAGEMENT ENDPOINTS ====================

// Get current user profile - Now using modular controller
app.get('/api/users/me', authenticateUser, authController.getProfile);

// Get all users (for assignment dropdown) - Admin, PM, or GF
app.get('/api/users', authenticateUser, async (req, res) => {
  try {
    // Check permissions - Admin, PM, or GF can view users for assignment
    if (!req.isAdmin && !['admin', 'pm', 'gf'].includes(req.userRole)) {
      return res.status(403).json({ error: 'Only Admin, PM, or GF can view users' });
    }
    
    // ============================================
    // MULTI-TENANT SECURITY: Only show users from same company
    // ============================================
    const currentUser = await User.findById(req.userId).select('companyId');
    
    // CRITICAL: If user has no company, return empty array (fail-safe)
    if (!currentUser?.companyId) {
      return res.json([]);
    }
    
    const users = await User.find({ companyId: currentUser.companyId }, 'name email role isAdmin companyId').sort({ name: 1 });
    res.json(users);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get foremen only (for assignment)
app.get('/api/users/foremen', authenticateUser, async (req, res) => {
  try {
    // ============================================
    // MULTI-TENANT SECURITY: Only show foremen from same company
    // ============================================
    const currentUser = await User.findById(req.userId).select('companyId');
    
    // CRITICAL: If user has no company, return empty array (fail-safe)
    if (!currentUser?.companyId) {
      return res.json([]);
    }
    
    const query = { 
      companyId: currentUser.companyId,
      $or: [{ role: 'foreman' }, { role: 'admin' }, { isAdmin: true }] 
    };
    
    const foremen = await User.find(query, 'name email role companyId').sort({ name: 1 });
    res.json(foremen);
  } catch (err) {
    console.error('Error fetching foremen:', err);
    res.status(500).json({ error: 'Failed to fetch foremen' });
  }
});

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
    console.log('Assignment request:', req.params.id, req.body);
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
      console.log('Job not found or not in user company:', req.params.id);
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
    let query = {
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
  } catch (e) {}
  
  // Quick regex extraction function - used as fallback
  const quickExtract = (text) => {
    const patterns = {
      pmNumber: /(?:PM|PM#|PM Number|Project)[:\s#]*(\d{7,8})/i,
      woNumber: /(?:WO|WO#|Work Order)[:\s#]*([A-Z0-9-]+)/i,
      notificationNumber: /(?:Notification|Notif)[:\s#]*(\d+)/i,
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
        pmNumber: '', woNumber: '', notificationNumber: '',
        address: '', city: '', client: '', projectName: '', orderType: '',
        jobScope: null
      };
      try { fs.unlinkSync(pdfPath); } catch (e) {}
      return res.json({ 
        success: true, 
        structured, 
        warning: 'File too large for AI extraction. Please enter details manually.' 
      });
    }
    
    if (!process.env.OPENAI_API_KEY) {
      try { fs.unlinkSync(pdfPath); } catch (e) {}
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
- pmNumber, woNumber, notificationNumber, address, city, client, projectName, orderType

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
    } catch (e) {}
    
    res.json({ success: true, structured });
  } catch (err) {
    console.warn('AI extraction failed:', err.message);
    
    // Clean up uploaded file
    if (pdfPath) {
      try { fs.unlinkSync(pdfPath); } catch (e) {}
    }
    
    // Return empty results - let user fill manually
    // Don't try to re-parse PDF (could crash again)
    const emptyResults = {
      pmNumber: '', woNumber: '', notificationNumber: '',
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
    const { title, description, priority, dueDate, woNumber, address, client, pmNumber, notificationNumber, city, projectName, orderType, division, matCode, jobScope, preFieldLabels, ecTag } = req.body;
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
      jobScope: parsedJobScope,  // Scope extracted from PG&E Face Sheet
      preFieldLabels: parsedPreFieldLabels,  // Pre-field crew labels
      ecTag: parsedEcTag,  // EC Tag and program info
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
    const job = await Job.findById(jobId);
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
    console.log('Getting job by ID:', req.params.id);
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
    let query = { _id: req.params.id, companyId: userCompanyId };
    
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
      
      closeOutFolder.documents.push({
        name: newFilename,
        url: docUrl,
        r2Key: r2Key,
        type: 'pdf',
        isTemplate: false,
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
        // Track source location for reference
        sourceFolder: folderName,
        sourceSubfolder: subfolderName || null
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
// UTILITY & COMPANY MANAGEMENT ENDPOINTS
// ========================================

// Get all utilities (public - for signup dropdown)
app.get('/api/utilities', async (req, res) => {
  try {
    const utilities = await Utility.find({ isActive: true })
      .select('name slug shortName region')
      .lean();
    res.json(utilities);
  } catch (err) {
    console.error('Error fetching utilities:', err);
    res.status(500).json({ error: 'Failed to fetch utilities' });
  }
});

// Get utility by slug
app.get('/api/utilities/:slug', async (req, res) => {
  try {
    const utility = await Utility.findOne({ slug: req.params.slug, isActive: true });
    if (!utility) {
      return res.status(404).json({ error: 'Utility not found' });
    }
    res.json(utility);
  } catch (err) {
    console.error('Error fetching utility:', err);
    res.status(500).json({ error: 'Failed to fetch utility' });
  }
});

// Create utility (admin only)
app.post('/api/admin/utilities', authenticateUser, async (req, res) => {
  try {
    if (!req.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const utility = new Utility(req.body);
    await utility.save();
    
    console.log('Created utility:', utility.name);
    res.status(201).json(utility);
  } catch (err) {
    console.error('Error creating utility:', err);
    res.status(500).json({ error: 'Failed to create utility', details: err.message });
  }
});

// ========================================
// OWNER DASHBOARD - ADMIN ANALYTICS
// ========================================

const APIUsage = require('./models/APIUsage');
const AITrainingData = require('./models/AITrainingData');

// Owner Dashboard: Get comprehensive platform statistics (Super Admin only)
app.get('/api/admin/owner-stats', authenticateUser, requireSuperAdmin, async (req, res) => {
  try {
    
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // === USER METRICS ===
    // Only count users with a companyId (excludes super admins and orphaned users)
    const userFilter = { companyId: { $exists: true, $ne: null }, isSuperAdmin: { $ne: true } };
    const totalUsers = await User.countDocuments(userFilter);
    const newUsersThisMonth = await User.countDocuments({ 
      ...userFilter,
      createdAt: { $gte: thirtyDaysAgo } 
    });
    const newUsersThisWeek = await User.countDocuments({ 
      ...userFilter,
      createdAt: { $gte: sevenDaysAgo } 
    });
    
    // Users by role (only company users)
    const usersByRole = await User.aggregate([
      { $match: userFilter },
      { $group: { _id: '$role', count: { $sum: 1 } } }
    ]);
    
    // User growth trend (last 30 days, only company users)
    const userGrowth = await User.aggregate([
      { $match: { ...userFilter, createdAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    // === JOB METRICS ===
    const totalJobs = await Job.countDocuments({ isDeleted: { $ne: true } });
    const jobsThisMonth = await Job.countDocuments({ 
      createdAt: { $gte: thirtyDaysAgo },
      isDeleted: { $ne: true }
    });
    const jobsThisWeek = await Job.countDocuments({ 
      createdAt: { $gte: sevenDaysAgo },
      isDeleted: { $ne: true }
    });
    const jobsToday = await Job.countDocuments({ 
      createdAt: { $gte: today },
      isDeleted: { $ne: true }
    });
    
    // Jobs by status
    const jobsByStatus = await Job.aggregate([
      { $match: { isDeleted: { $ne: true } } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    
    // Jobs by priority
    const jobsByPriority = await Job.aggregate([
      { $match: { isDeleted: { $ne: true } } },
      { $group: { _id: '$priority', count: { $sum: 1 } } }
    ]);
    
    // Emergency jobs count
    const emergencyJobs = await Job.countDocuments({ 
      isEmergency: true, 
      isDeleted: { $ne: true } 
    });
    
    // Job creation trend (last 30 days)
    const jobCreationTrend = await Job.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo }, isDeleted: { $ne: true } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    // === AI EXTRACTION METRICS ===
    const jobsWithAIExtraction = await Job.countDocuments({ 
      aiExtractionComplete: true,
      isDeleted: { $ne: true }
    });
    
    // AI extraction performance stats
    const aiPerformanceStats = await Job.aggregate([
      { 
        $match: { 
          aiExtractionComplete: true, 
          aiProcessingTimeMs: { $exists: true, $gt: 0 } 
        } 
      },
      {
        $group: {
          _id: null,
          avgProcessingTimeMs: { $avg: '$aiProcessingTimeMs' },
          minProcessingTimeMs: { $min: '$aiProcessingTimeMs' },
          maxProcessingTimeMs: { $max: '$aiProcessingTimeMs' },
          totalExtractions: { $sum: 1 }
        }
      }
    ]);
    
    // Count extracted assets
    const extractedAssetsStats = await Job.aggregate([
      { $match: { aiExtractionComplete: true } },
      { $unwind: { path: '$aiExtractedAssets', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$aiExtractedAssets.type',
          count: { $sum: 1 }
        }
      }
    ]);
    
    // === API USAGE & COSTS ===
    let apiUsageStats = { openai: null, r2_storage: null };
    let dailyApiCosts = [];
    let totalApiCostThisMonth = 0;
    
    try {
      // Get API usage summary for this month
      const usageSummary = await APIUsage.getUsageSummary(thirtyDaysAgo, now);
      usageSummary.forEach(stat => {
        apiUsageStats[stat._id] = stat;
        totalApiCostThisMonth += stat.totalCostCents || 0;
      });
      
      // Get daily API costs for chart
      dailyApiCosts = await APIUsage.getDailyUsage(30);
    } catch (err) {
      console.log('API usage tracking not yet populated:', err.message);
    }
    
    // === AI TRAINING DATA METRICS ===
    let aiTrainingStats = { total: 0, complete: 0, validated: 0 };
    try {
      aiTrainingStats.total = await AITrainingData.countDocuments();
      aiTrainingStats.complete = await AITrainingData.countDocuments({ isComplete: true });
      aiTrainingStats.validated = await AITrainingData.countDocuments({ isValidated: true });
    } catch (err) {
      console.log('AI training data not yet populated:', err.message);
    }
    
    // === COMPANY METRICS ===
    const totalCompanies = await Company.countDocuments({ isActive: true });
    const totalUtilities = await Utility.countDocuments({ isActive: true });
    
    // === DOCUMENT METRICS ===
    // Count total documents across all jobs
    const documentStats = await Job.aggregate([
      { $match: { isDeleted: { $ne: true } } },
      { $unwind: '$folders' },
      { $unwind: { path: '$folders.documents', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: null,
          totalDocuments: { $sum: 1 },
          approvedDocuments: { 
            $sum: { $cond: [{ $eq: ['$folders.documents.approvalStatus', 'approved'] }, 1, 0] }
          },
          pendingDocuments: {
            $sum: { $cond: [{ $eq: ['$folders.documents.approvalStatus', 'pending_approval'] }, 1, 0] }
          }
        }
      }
    ]);
    
    // === WORKFLOW METRICS ===
    // Average time from job creation to completion
    const workflowStats = await Job.aggregate([
      { 
        $match: { 
          completedDate: { $exists: true },
          createdAt: { $gte: thirtyDaysAgo }
        } 
      },
      {
        $project: {
          completionTimeHours: {
            $divide: [
              { $subtract: ['$completedDate', '$createdAt'] },
              1000 * 60 * 60  // Convert ms to hours
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          avgCompletionTimeHours: { $avg: '$completionTimeHours' },
          minCompletionTimeHours: { $min: '$completionTimeHours' },
          maxCompletionTimeHours: { $max: '$completionTimeHours' },
          completedJobs: { $sum: 1 }
        }
      }
    ]);
    
    // === STORAGE METRICS (R2) ===
    let storageStats = { configured: r2Storage.isR2Configured() };
    
    res.json({
      timestamp: now.toISOString(),
      
      users: {
        total: totalUsers,
        newThisMonth: newUsersThisMonth,
        newThisWeek: newUsersThisWeek,
        byRole: usersByRole.reduce((acc, r) => ({ ...acc, [r._id || 'unknown']: r.count }), {}),
        growthTrend: userGrowth.map(d => ({ date: d._id, count: d.count }))
      },
      
      jobs: {
        total: totalJobs,
        thisMonth: jobsThisMonth,
        thisWeek: jobsThisWeek,
        today: jobsToday,
        emergency: emergencyJobs,
        byStatus: jobsByStatus.reduce((acc, s) => ({ ...acc, [s._id || 'unknown']: s.count }), {}),
        byPriority: jobsByPriority.reduce((acc, p) => ({ ...acc, [p._id || 'unknown']: p.count }), {}),
        creationTrend: jobCreationTrend.map(d => ({ date: d._id, count: d.count }))
      },
      
      aiExtraction: {
        totalJobsProcessed: jobsWithAIExtraction,
        performance: aiPerformanceStats[0] || { avgProcessingTimeMs: 0, totalExtractions: 0 },
        extractedAssets: extractedAssetsStats.reduce((acc, a) => ({ 
          ...acc, 
          [a._id || 'unknown']: a.count 
        }), {})
      },
      
      apiUsage: {
        openai: apiUsageStats.openai,
        storage: apiUsageStats.r2_storage,
        totalCostThisMonthCents: totalApiCostThisMonth,
        totalCostThisMonthDollars: (totalApiCostThisMonth / 100).toFixed(2),
        dailyCosts: dailyApiCosts.map(d => ({
          date: d._id.date,
          service: d._id.service,
          calls: d.calls,
          tokens: d.tokens,
          costCents: d.costCents
        }))
      },
      
      aiTraining: {
        totalRecords: aiTrainingStats.total,
        completeRecords: aiTrainingStats.complete,
        validatedRecords: aiTrainingStats.validated,
        completionRate: aiTrainingStats.total > 0 
          ? ((aiTrainingStats.complete / aiTrainingStats.total) * 100).toFixed(1) + '%'
          : '0%'
      },
      
      documents: documentStats[0] || { totalDocuments: 0, approvedDocuments: 0, pendingDocuments: 0 },
      
      workflow: workflowStats[0] || { avgCompletionTimeHours: 0, completedJobs: 0 },
      
      platform: {
        companies: totalCompanies,
        utilities: totalUtilities,
        storage: storageStats
      }
    });
    
  } catch (err) {
    console.error('Error fetching owner stats:', err);
    res.status(500).json({ error: 'Failed to fetch statistics', details: err.message });
  }
});

// Owner Dashboard: Get system health metrics (Super Admin only)
app.get('/api/admin/system-health', authenticateUser, requireSuperAdmin, async (req, res) => {
  try {
    
    const health = {
      timestamp: new Date().toISOString(),
      
      database: {
        status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        readyState: mongoose.connection.readyState
      },
      
      storage: {
        r2Configured: r2Storage.isR2Configured(),
        status: r2Storage.isR2Configured() ? 'configured' : 'local_only'
      },
      
      server: {
        uptime: process.uptime(),
        uptimeFormatted: formatUptime(process.uptime()),
        memoryUsage: {
          heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          external: Math.round(process.memoryUsage().external / 1024 / 1024),
          unit: 'MB'
        },
        nodeVersion: process.version
      },
      
      environment: {
        hasOpenAIKey: !!process.env.OPENAI_API_KEY,
        hasJwtSecret: !!process.env.JWT_SECRET,
        hasMongoUri: !!process.env.MONGO_URI,
        hasFrontendUrl: !!process.env.FRONTEND_URL
      }
    };
    
    res.json(health);
  } catch (err) {
    console.error('Error fetching system health:', err);
    res.status(500).json({ error: 'Failed to fetch system health' });
  }
});

// Helper function to format uptime
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);
  
  return parts.join(' ');
}

// ========================================
// AUDIT LOG ENDPOINTS - PG&E/NERC Compliance
// ========================================

// Get audit logs (Admin for company, Super Admin for all)
app.get('/api/admin/audit-logs', authenticateUser, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      action, 
      category, 
      severity, 
      userId: filterUserId,
      startDate,
      endDate,
      resourceType
    } = req.query;
    
    // Build query based on permissions
    const query = {};
    
    // Super admins can see all, regular admins only see their company
    if (!req.isSuperAdmin) {
      const user = await User.findById(req.userId).select('companyId isAdmin');
      if (!user?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      if (user.companyId) {
        query.companyId = user.companyId;
      }
    }
    
    // Apply filters
    if (action) query.action = action;
    if (category) query.category = category;
    if (severity) query.severity = severity;
    if (filterUserId) query.userId = filterUserId;
    if (resourceType) query.resourceType = resourceType;
    
    // Date range
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      AuditLog.countDocuments(query)
    ]);
    
    res.json({
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('Error fetching audit logs:', err);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// Get audit log summary/stats (for compliance dashboard)
app.get('/api/admin/audit-stats', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    
    // Build company filter
    const matchStage = { timestamp: { $gte: startDate } };
    if (!req.isSuperAdmin) {
      const user = await User.findById(req.userId).select('companyId');
      if (user?.companyId) {
        matchStage.companyId = user.companyId;
      }
    }
    
    const [
      actionCounts,
      severityCounts,
      categoryCounts,
      dailyActivity,
      securityEvents
    ] = await Promise.all([
      // Count by action type
      AuditLog.aggregate([
        { $match: matchStage },
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 }
      ]),
      
      // Count by severity
      AuditLog.aggregate([
        { $match: matchStage },
        { $group: { _id: '$severity', count: { $sum: 1 } } }
      ]),
      
      // Count by category
      AuditLog.aggregate([
        { $match: matchStage },
        { $group: { _id: '$category', count: { $sum: 1 } } }
      ]),
      
      // Daily activity (last 7 days)
      AuditLog.aggregate([
        { $match: { timestamp: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, ...matchStage } },
        { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
          count: { $sum: 1 }
        }},
        { $sort: { _id: 1 } }
      ]),
      
      // Recent security events (critical/warning)
      AuditLog.find({
        ...matchStage,
        severity: { $in: ['critical', 'warning'] }
      })
        .sort({ timestamp: -1 })
        .limit(10)
        .lean()
    ]);
    
    res.json({
      period: { days: parseInt(days), startDate },
      actionCounts: actionCounts.reduce((acc, { _id, count }) => ({ ...acc, [_id]: count }), {}),
      severityCounts: severityCounts.reduce((acc, { _id, count }) => ({ ...acc, [_id]: count }), {}),
      categoryCounts: categoryCounts.reduce((acc, { _id, count }) => ({ ...acc, [_id]: count }), {}),
      dailyActivity,
      recentSecurityEvents: securityEvents
    });
  } catch (err) {
    console.error('Error fetching audit stats:', err);
    res.status(500).json({ error: 'Failed to fetch audit stats' });
  }
});

// Export audit logs for compliance (CSV format)
app.get('/api/admin/audit-logs/export', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate, format = 'csv' } = req.query;
    
    // Build query
    const query = {};
    if (!req.isSuperAdmin) {
      const user = await User.findById(req.userId).select('companyId');
      if (user?.companyId) {
        query.companyId = user.companyId;
      }
    }
    
    if (startDate) query.timestamp = { $gte: new Date(startDate) };
    if (endDate) query.timestamp = { ...query.timestamp, $lte: new Date(endDate) };
    
    const logs = await AuditLog.find(query)
      .sort({ timestamp: -1 })
      .limit(10000) // Cap at 10k records for export
      .lean();
    
    // Log the export action itself
    logExport.bulkDownload(req, null, logs.length);
    
    if (format === 'csv') {
      const csvHeader = 'Timestamp,User,Email,Action,Category,Severity,Resource Type,Resource Name,IP Address,Success\\n';
      const csvRows = logs.map(log => 
        `"${log.timestamp.toISOString()}","${log.userName || ''}","${log.userEmail || ''}","${log.action}","${log.category || ''}","${log.severity}","${log.resourceType || ''}","${log.resourceName || ''}","${log.ipAddress || ''}","${log.success}"`
      ).join('\\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csvHeader + csvRows);
    } else {
      res.json(logs);
    }
  } catch (err) {
    console.error('Error exporting audit logs:', err);
    res.status(500).json({ error: 'Failed to export audit logs' });
  }
});

// ========================================
// SUPER ADMIN - COMPANY ONBOARDING
// Simple endpoints for non-technical owners to add companies/users
// ========================================

// Get all companies (Super Admin only)
app.get('/api/superadmin/companies', authenticateUser, requireSuperAdmin, async (req, res) => {
  try {
    const companies = await Company.find({ isActive: true })
      .populate('utilities', 'name shortName')
      .populate('ownerId', 'name email')
      .sort({ createdAt: -1 });
    
    // Add user count for each company
    const companiesWithCounts = await Promise.all(companies.map(async (company) => {
      const userCount = await User.countDocuments({ companyId: company._id });
      return {
        ...company.toObject(),
        userCount
      };
    }));
    
    res.json(companiesWithCounts);
  } catch (err) {
    console.error('Error fetching companies:', err);
    res.status(500).json({ error: 'Failed to fetch companies' });
  }
});

// Create a new company (Super Admin only)
app.post('/api/superadmin/companies', authenticateUser, requireSuperAdmin, async (req, res) => {
  try {
    const { name, email, phone, address, city, state, zip, contractorLicense } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Company name is required' });
    }
    
    // Check if company with same name already exists
    const existingCompany = await Company.findOne({ 
      name: { $regex: new RegExp(`^${name}$`, 'i') } 
    });
    if (existingCompany) {
      return res.status(400).json({ error: 'A company with this name already exists' });
    }
    
    const company = new Company({
      name,
      email,
      phone,
      address,
      city,
      state,
      zip,
      contractorLicense,
      subscription: {
        plan: 'starter',
        seats: 10,
        status: 'active'
      },
      settings: {
        timezone: 'America/Los_Angeles',
        defaultDivision: 'DA'
      },
      isActive: true
    });
    
    await company.save();
    
    console.log(`[SuperAdmin] Created company: ${company.name} (${company._id})`);
    res.status(201).json(company);
  } catch (err) {
    console.error('Error creating company:', err);
    res.status(500).json({ error: 'Failed to create company', details: err.message });
  }
});

// Get users for a specific company (Super Admin only)
app.get('/api/superadmin/companies/:companyId/users', authenticateUser, requireSuperAdmin, async (req, res) => {
  try {
    const { companyId } = req.params;
    
    const users = await User.find({ companyId })
      .select('-password')
      .sort({ createdAt: -1 });
    
    res.json(users);
  } catch (err) {
    console.error('Error fetching company users:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Create a user for a company (Super Admin only)
app.post('/api/superadmin/companies/:companyId/users', authenticateUser, requireSuperAdmin, async (req, res) => {
  try {
    const { companyId } = req.params;
    const { email, password, name, role, phone } = req.body;
    
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }
    
    // Verify company exists
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'A user with this email already exists' });
    }
    
    // Determine permissions based on role
    const userRole = role || 'crew';
    const isAdmin = ['pm', 'admin'].includes(userRole);
    const canApprove = ['gf', 'pm', 'admin'].includes(userRole);
    
    const user = new User({
      email: email.toLowerCase(),
      password,  // Will be hashed by pre-save hook
      name,
      role: userRole,
      phone,
      companyId,
      userType: 'contractor',
      isAdmin,
      canApprove,
      isSuperAdmin: false  // Only manually set super admins
    });
    
    await user.save();
    
    // Don't return password
    const userResponse = user.toObject();
    delete userResponse.password;
    
    console.log(`[SuperAdmin] Created user: ${user.email} (${userRole}) for company ${company.name}`);
    res.status(201).json(userResponse);
  } catch (err) {
    console.error('Error creating user:', err);
    res.status(500).json({ error: 'Failed to create user', details: err.message });
  }
});

// Update a user (Super Admin only)
app.put('/api/superadmin/users/:userId', authenticateUser, requireSuperAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, email, role, phone, isActive } = req.body;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Update fields
    if (name) user.name = name;
    if (email) user.email = email.toLowerCase();
    if (phone !== undefined) user.phone = phone;
    if (role) {
      user.role = role;
      user.isAdmin = ['pm', 'admin'].includes(role);
      user.canApprove = ['gf', 'pm', 'admin'].includes(role);
    }
    
    await user.save();
    
    const userResponse = user.toObject();
    delete userResponse.password;
    
    console.log(`[SuperAdmin] Updated user: ${user.email}`);
    res.json(userResponse);
  } catch (err) {
    console.error('Error updating user:', err);
    res.status(500).json({ error: 'Failed to update user', details: err.message });
  }
});

// Reset user password (Super Admin only)
app.post('/api/superadmin/users/:userId/reset-password', authenticateUser, requireSuperAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { newPassword } = req.body;
    
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    user.password = newPassword;  // Will be hashed by pre-save hook
    await user.save();
    
    console.log(`[SuperAdmin] Reset password for user: ${user.email}`);
    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error('Error resetting password:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Update company details (Super Admin only)
app.put('/api/superadmin/companies/:companyId', authenticateUser, requireSuperAdmin, async (req, res) => {
  try {
    const { companyId } = req.params;
    const { name, email, phone, address, city, state, zip, contractorLicense, folderTemplate } = req.body;
    
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    // Update fields if provided
    if (name) company.name = name;
    if (email !== undefined) company.email = email;
    if (phone !== undefined) company.phone = phone;
    if (address !== undefined) company.address = address;
    if (city !== undefined) company.city = city;
    if (state !== undefined) company.state = state;
    if (zip !== undefined) company.zip = zip;
    if (contractorLicense !== undefined) company.contractorLicense = contractorLicense;
    if (folderTemplate !== undefined) company.folderTemplate = folderTemplate;
    
    await company.save();
    
    console.log(`[SuperAdmin] Updated company: ${company.name}`);
    res.json(company);
  } catch (err) {
    console.error('Error updating company:', err);
    res.status(500).json({ error: 'Failed to update company' });
  }
});

// Update company folder template (Super Admin only)
app.put('/api/superadmin/companies/:companyId/folder-template', authenticateUser, requireSuperAdmin, async (req, res) => {
  try {
    const { companyId } = req.params;
    const { folderTemplate } = req.body;
    
    if (!folderTemplate || !Array.isArray(folderTemplate)) {
      return res.status(400).json({ error: 'folderTemplate must be an array' });
    }
    
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    company.folderTemplate = folderTemplate;
    await company.save();
    
    console.log(`[SuperAdmin] Updated folder template for: ${company.name}`);
    res.json({ 
      message: `Folder template updated for ${company.name}`,
      folderTemplate: company.folderTemplate 
    });
  } catch (err) {
    console.error('Error updating folder template:', err);
    res.status(500).json({ error: 'Failed to update folder template' });
  }
});

// Delete/deactivate a company (Super Admin only)
app.delete('/api/superadmin/companies/:companyId', authenticateUser, requireSuperAdmin, async (req, res) => {
  try {
    const { companyId } = req.params;
    
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    // Soft delete - mark as inactive
    company.isActive = false;
    await company.save();
    
    console.log(`[SuperAdmin] Deactivated company: ${company.name}`);
    res.json({ message: `Company "${company.name}" has been deactivated` });
  } catch (err) {
    console.error('Error deactivating company:', err);
    res.status(500).json({ error: 'Failed to deactivate company' });
  }
});

// Get all available utilities for dropdown (Super Admin only)
app.get('/api/superadmin/utilities', authenticateUser, requireSuperAdmin, async (req, res) => {
  try {
    const utilities = await Utility.find({ isActive: true })
      .select('name shortName slug')
      .sort({ name: 1 });
    res.json(utilities);
  } catch (err) {
    console.error('Error fetching utilities:', err);
    res.status(500).json({ error: 'Failed to fetch utilities' });
  }
});

// Admin: Cleanup emergency test jobs
app.delete('/api/admin/cleanup-emergency-jobs', authenticateUser, async (req, res) => {
  try {
    if (!req.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const result = await Job.deleteMany({
      $or: [
        { isEmergency: true },
        { title: /emergency/i },
        { priority: 'emergency' }
      ]
    });
    
    console.log(`Admin cleanup: Deleted ${result.deletedCount} emergency jobs`);
    res.json({ message: `Deleted ${result.deletedCount} emergency jobs` });
  } catch (err) {
    console.error('Error cleaning up emergency jobs:', err);
    res.status(500).json({ error: 'Failed to cleanup jobs', details: err.message });
  }
});

// Get current user's company
app.get('/api/company', authenticateUser, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(404).json({ error: 'No company associated with this user' });
    }
    
    const company = await Company.findById(user.companyId)
      .populate('utilities', 'name slug shortName')
      .populate('defaultUtility', 'name slug shortName');
    
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    res.json(company);
  } catch (err) {
    console.error('Error fetching company:', err);
    res.status(500).json({ error: 'Failed to fetch company' });
  }
});

// Update company settings (company admin only)
app.put('/api/company', authenticateUser, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(404).json({ error: 'No company associated with this user' });
    }
    
    // Check if user is company admin or system admin
    if (!user.isAdmin && user.role !== 'pm' && user.role !== 'admin') {
      return res.status(403).json({ error: 'Only company admins can update company settings' });
    }
    
    const company = await Company.findById(user.companyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    // Update allowed fields
    const allowedFields = ['name', 'phone', 'address', 'city', 'state', 'zip', 'settings', 'defaultUtility'];
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        company[field] = req.body[field];
      }
    });
    
    await company.save();
    
    console.log('Updated company:', company.name);
    res.json(company);
  } catch (err) {
    console.error('Error updating company:', err);
    res.status(500).json({ error: 'Failed to update company', details: err.message });
  }
});

// Create new company (for new contractor signup)
app.post('/api/companies', async (req, res) => {
  try {
    const { companyName, utilitySlug } = req.body;
    
    if (!companyName) {
      return res.status(400).json({ error: 'Company name is required' });
    }
    
    // Find the utility (default to PG&E if not specified)
    const utility = await Utility.findOne({ slug: utilitySlug || 'pge' });
    
    const company = new Company({
      name: companyName,
      utilities: utility ? [utility._id] : [],
      defaultUtility: utility?._id,
      subscription: {
        plan: 'free',
        seats: 5,
        status: 'trialing'
      }
    });
    
    await company.save();
    
    console.log('Created company:', company.name);
    res.status(201).json(company);
  } catch (err) {
    console.error('Error creating company:', err);
    res.status(500).json({ error: 'Failed to create company', details: err.message });
  }
});

// Get company users (company admin only)
app.get('/api/company/users', authenticateUser, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(404).json({ error: 'No company associated with this user' });
    }
    
    // Check if user can view company users
    if (!user.isAdmin && !['gf', 'pm', 'admin'].includes(user.role)) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    const users = await User.find({ companyId: user.companyId })
      .select('-password')
      .sort({ createdAt: -1 });
    
    res.json(users);
  } catch (err) {
    console.error('Error fetching company users:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Invite user to company (company admin only)
app.post('/api/company/invite', authenticateUser, async (req, res) => {
  try {
    const { email, name, role } = req.body;
    
    const inviter = await User.findById(req.userId);
    if (!inviter?.companyId) {
      return res.status(404).json({ error: 'No company associated with this user' });
    }
    
    // Check if user can invite
    if (!inviter.isAdmin && !['gf', 'pm', 'admin'].includes(inviter.role)) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }
    
    // Generate temporary password (user will reset on first login)
    // Use crypto.randomBytes for cryptographically secure randomness
    // Suffix ensures password meets complexity requirements: uppercase (A), lowercase (x), number (1), special (!)
    const tempPassword = crypto.randomBytes(6).toString('base64url') + 'Ax1!';
    
    const validRoles = ['crew', 'foreman', 'gf', 'qa', 'pm'];
    const userRole = validRoles.includes(role) ? role : 'crew';
    
    const newUser = new User({
      email,
      password: tempPassword,
      name: name || email.split('@')[0],
      role: userRole,
      companyId: inviter.companyId,
      isAdmin: ['gf', 'pm'].includes(userRole),
      canApprove: ['gf', 'pm'].includes(userRole)
    });
    
    await newUser.save();
    
    // Get company name for the invitation email
    const company = await Company.findById(inviter.companyId);
    const companyName = company?.name || 'Your Company';
    
    // Send invitation email with temp password
    // tempPassword should ONLY be sent via secure email, never in API responses
    try {
      await sendInvitation({
        email,
        name: newUser.name,
        tempPassword,
        inviterName: inviter.name,
        companyName,
        role: userRole
      });
      console.log('Invitation email sent to:', email);
    } catch (emailErr) {
      // Log but don't fail the invite if email fails
      console.error('Failed to send invitation email:', emailErr);
    }
    
    console.log('Invited user:', email, 'to company:', inviter.companyId);
    res.status(201).json({ 
      message: 'User invited successfully. Temporary password sent via email.',
      user: { email: newUser.email, name: newUser.name, role: newUser.role }
    });
  } catch (err) {
    console.error('Error inviting user:', err);
    res.status(500).json({ error: 'Failed to invite user', details: err.message });
  }
});

// Delete a job
// Admin/PM can delete any job, others can only delete their own
// SOFT DELETE - Preserve job data for AI training and compliance
// Jobs are never truly deleted - they're marked as deleted and hidden from UI
// R2 files and AI training data remain intact
app.delete('/api/jobs/:id', authenticateUser, async (req, res) => {
  try {
    console.log('Soft-deleting job by ID:', req.params.id);
    console.log('User ID from token:', req.userId, 'isAdmin:', req.isAdmin, 'role:', req.userRole);
    
    const { reason } = req.body || {};

    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // ============================================
    const currentUser = await User.findById(req.userId).select('companyId');
    const userCompanyId = currentUser?.companyId;

    let query = { _id: req.params.id };
    
    // CRITICAL: Always filter by company
    if (userCompanyId) {
      query.companyId = userCompanyId;
    }
    
    // Admin and PM can delete any job IN THEIR COMPANY
    // Others can only delete their own jobs
    if (!req.isAdmin && req.userRole !== 'pm' && req.userRole !== 'admin') {
      query.userId = req.userId;
    }
    
    const job = await Job.findOne(query);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Soft delete - mark as deleted but preserve all data
    job.isDeleted = true;
    job.deletedAt = new Date();
    job.deletedBy = req.userId;
    job.deleteReason = reason || 'User deleted from dashboard';
    
    await job.save();

    console.log('Job soft-deleted:', job._id, 'PM:', job.pmNumber);
    res.json({ 
      message: 'Work order removed from dashboard', 
      jobId: job._id,
      note: 'Data preserved for compliance and AI training'
    });
  } catch (err) {
    console.error('Error soft-deleting job:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// ARCHIVE JOB - Move completed/billed jobs to archive for long-term storage
// Keeps data for AI training and utility compliance (7+ year retention)
app.post('/api/jobs/:id/archive', authenticateUser, async (req, res) => {
  try {
    const { reason } = req.body;
    
    // Only admin/PM can archive jobs
    if (!req.isAdmin && req.userRole !== 'pm' && req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Only PM or Admin can archive jobs' });
    }
    
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // ============================================
    const currentUser = await User.findById(req.userId).select('companyId');
    const query = { _id: req.params.id };
    if (currentUser?.companyId) {
      query.companyId = currentUser.companyId;
    }
    
    const job = await Job.findOne(query);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Set archive fields
    job.isArchived = true;
    job.archivedAt = new Date();
    job.archivedBy = req.userId;
    job.archiveReason = reason || 'Manual archive';
    
    // Set retention policy - default 7 years for utility compliance
    const retentionYears = 7;
    job.retentionExpiresAt = new Date(Date.now() + retentionYears * 365 * 24 * 60 * 60 * 1000);
    job.retentionPolicy = 'utility_7_year';
    
    await job.save();
    
    console.log('Job archived:', job._id, 'PM:', job.pmNumber, 'Retention until:', job.retentionExpiresAt);
    res.json({ 
      message: 'Work order archived successfully',
      jobId: job._id,
      retentionExpiresAt: job.retentionExpiresAt,
      note: 'Job preserved for compliance. Can be retrieved from archive.'
    });
  } catch (err) {
    console.error('Error archiving job:', err);
    res.status(500).json({ error: 'Failed to archive job', details: err.message });
  }
});

// RESTORE JOB - Bring back a deleted or archived job
app.post('/api/jobs/:id/restore', authenticateUser, async (req, res) => {
  try {
    // Only admin can restore jobs
    if (!req.isAdmin && req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Only Admin can restore jobs' });
    }
    
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // ============================================
    const currentUser = await User.findById(req.userId).select('companyId');
    const query = { _id: req.params.id };
    if (currentUser?.companyId) {
      query.companyId = currentUser.companyId;
    }
    
    const job = await Job.findOne(query);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Clear delete/archive flags
    job.isDeleted = false;
    job.deletedAt = null;
    job.deletedBy = null;
    job.deleteReason = null;
    job.isArchived = false;
    job.archivedAt = null;
    job.archivedBy = null;
    job.archiveReason = null;
    
    await job.save();
    
    console.log('Job restored:', job._id, 'PM:', job.pmNumber);
    res.json({ 
      message: 'Work order restored successfully',
      jobId: job._id
    });
  } catch (err) {
    console.error('Error restoring job:', err);
    res.status(500).json({ error: 'Failed to restore job', details: err.message });
  }
});

// GET ARCHIVED JOBS - List all archived jobs for admin review
app.get('/api/jobs/archived', authenticateUser, async (req, res) => {
  try {
    // Only admin/PM can view archived jobs
    if (!req.isAdmin && req.userRole !== 'pm' && req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Only PM or Admin can view archived jobs' });
    }
    
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // ============================================
    const currentUser = await User.findById(req.userId).select('companyId');
    
    // CRITICAL: If user has no company, return empty result (fail-safe)
    if (!currentUser?.companyId) {
      return res.json({ jobs: [], total: 0, page: 1, totalPages: 0 });
    }
    
    const { search, page = 1, limit = 50 } = req.query;
    
    let query = { isArchived: true, companyId: currentUser.companyId };
    
    if (search) {
      const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$and = [
        { $or: [
          { pmNumber: searchRegex },
          { woNumber: searchRegex },
          { address: searchRegex },
          { city: searchRegex }
        ]}
      ];
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [jobs, total] = await Promise.all([
      Job.find(query)
        .select('pmNumber woNumber address city status archivedAt archivedBy archiveReason retentionExpiresAt')
        .populate('archivedBy', 'name')
        .sort({ archivedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Job.countDocuments(query)
    ]);
    
    res.json({
      jobs,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (err) {
    console.error('Error fetching archived jobs:', err);
    res.status(500).json({ error: 'Failed to fetch archived jobs', details: err.message });
  }
});

// GET DELETED JOBS - List soft-deleted jobs (admin only)
app.get('/api/jobs/deleted', authenticateUser, async (req, res) => {
  try {
    // Only admin can view deleted jobs
    if (!req.isAdmin && req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Only Admin can view deleted jobs' });
    }
    
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // ============================================
    const currentUser = await User.findById(req.userId).select('companyId');
    
    // CRITICAL: If user has no company, return empty result (fail-safe)
    if (!currentUser?.companyId) {
      return res.json({ jobs: [], total: 0, page: 1, totalPages: 0 });
    }
    
    const { search, page = 1, limit = 50 } = req.query;
    
    let query = { isDeleted: true, companyId: currentUser.companyId };
    
    if (search) {
      const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$and = [
        { $or: [
          { pmNumber: searchRegex },
          { woNumber: searchRegex },
          { address: searchRegex }
        ]}
      ];
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [jobs, total] = await Promise.all([
      Job.find(query)
        .select('pmNumber woNumber address city status deletedAt deletedBy deleteReason')
        .populate('deletedBy', 'name')
        .sort({ deletedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Job.countDocuments(query)
    ]);
    
    res.json({
      jobs,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (err) {
    console.error('Error fetching deleted jobs:', err);
    res.status(500).json({ error: 'Failed to fetch deleted jobs', details: err.message });
  }
});

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
    let query = { _id: id };
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
          let arrayFilters = [{ 'folder.name': folderName }];
          
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
    let query = { _id: id };
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
    
    // Generate proper filenames and upload to R2
    const baseTimestamp = Date.now();
    const uploadedPhotos = [];
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      let ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      const uniqueTimestamp = `${baseTimestamp}_${i.toString().padStart(3, '0')}`;
      const division = job.division || 'DA';
      const pmNumber = job.pmNumber || 'NOPM';
      const notification = job.notificationNumber || 'NONOTIF';
      const matCode = job.matCode || '2AA';
      
      let fileToUpload = file.path;
      let tempConvertedFile = null;
      
      // Convert HEIC/HEIF to JPG (browsers can't display HEIC)
      if (ext === '.heic' || ext === '.heif') {
        console.log('Converting HEIC/HEIF to JPG:', file.originalname);
        try {
          tempConvertedFile = file.path + '.jpg';
          const inputBuffer = fs.readFileSync(file.path);
          const outputBuffer = await heicConvert({
            buffer: inputBuffer,
            format: 'JPEG',
            quality: 0.9
          });
          fs.writeFileSync(tempConvertedFile, Buffer.from(outputBuffer));
          fileToUpload = tempConvertedFile;
          ext = '.jpg';
          console.log('HEIC converted successfully to JPG');
        } catch (convertErr) {
          console.error('Failed to convert HEIC:', convertErr.message);
          // Continue with original file
        }
      }
      
      const newFilename = `${division}_${pmNumber}_${notification}_${matCode}_Photo_${uniqueTimestamp}${ext}`;
      
      let docUrl = `/uploads/${newFilename}`;
      let r2Key = null;
      
      // Upload to R2 if configured
      // Use subfolder name for R2 path (e.g., 'gf_audit' for GF Audit folder)
      const r2SubfolderPath = targetSubfolderName.toLowerCase().replace(/\s+/g, '_');
      console.log('Manual photo upload - R2 configured:', r2Storage.isR2Configured());
      if (r2Storage.isR2Configured()) {
        try {
          console.log('Uploading photo to R2:', fileToUpload, '->', `jobs/${id}/${r2SubfolderPath}/${newFilename}`);
          const result = await r2Storage.uploadJobFile(fileToUpload, id, r2SubfolderPath, newFilename);
          docUrl = r2Storage.getPublicUrl(result.key);
          r2Key = result.key;
          console.log('Photo uploaded to R2 successfully:', r2Key, '-> URL:', docUrl);
          // Clean up local files
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
          if (tempConvertedFile && fs.existsSync(tempConvertedFile)) {
            fs.unlinkSync(tempConvertedFile);
          }
        } catch (uploadErr) {
          console.error('Failed to upload photo to R2:', uploadErr.message);
          // Fallback to local
          const newPath = path.join(__dirname, 'uploads', newFilename);
          fs.renameSync(fileToUpload, newPath);
        }
      } else {
        console.log('R2 not configured, saving locally');
        const newPath = path.join(__dirname, 'uploads', newFilename);
        fs.renameSync(fileToUpload, newPath);
      }
      
      uploadedPhotos.push({
        name: newFilename,
        url: docUrl,
        r2Key: r2Key,
        type: 'image',
        uploadDate: new Date(),
        uploadedBy: req.userId
      });
    }
    
    photosFolder.documents.push(...uploadedPhotos);
    await job.save();
    
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
            // External URL - fetch it
            const fetch = (await import('node-fetch')).default;
            const response = await fetch(doc.url);
            if (response.ok) {
              fileBuffer = Buffer.from(await response.arrayBuffer());
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

// Update job status - Full workflow:
// new → assigned_to_gf → pre_fielding → scheduled → in_progress → 
// pending_gf_review → pending_pm_approval → ready_to_submit → submitted → billed → invoiced
app.put('/api/jobs/:id/status', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      status, 
      bidAmount, 
      bidNotes, 
      estimatedHours,
      crewSize, 
      crewScheduledDate,
      preFieldNotes,
      siteConditions,
      submissionNotes,
      reviewNotes
    } = req.body;
    
    // Get current user's role
    const user = await User.findById(req.userId);
    const userRole = user?.role || 'crew';
    const isAdmin = user?.isAdmin || ['pm', 'admin'].includes(userRole);
    const isGF = ['gf', 'pm', 'admin'].includes(userRole);
    
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // ============================================
    // Allow job creator, assigned GF, assigned crew, or admin to update
    // But ALWAYS filter by company first
    const query = {
      _id: id,
      $or: [
        { userId: req.userId },
        { assignedToGF: req.userId },
        { assignedTo: req.userId },
        ...(isAdmin ? [{ _id: id }] : [])  // Admins can update any job IN THEIR COMPANY
      ]
    };
    
    // CRITICAL: Always add company filter
    if (user?.companyId) {
      query.companyId = user.companyId;
    }
    
    const job = await Job.findOne(query);
    if (!job) {
      return res.status(404).json({ error: 'Job not found or not authorized' });
    }
    
    const oldStatus = job.status;
    
    // Update fields based on what was provided
    if (status) job.status = status;
    if (bidAmount !== undefined) job.bidAmount = bidAmount;
    if (bidNotes !== undefined) job.bidNotes = bidNotes;
    if (estimatedHours !== undefined) job.estimatedHours = estimatedHours;
    if (crewSize !== undefined) job.crewSize = crewSize;
    if (crewScheduledDate !== undefined) job.crewScheduledDate = crewScheduledDate;
    if (preFieldNotes !== undefined) job.preFieldNotes = preFieldNotes;
    if (siteConditions !== undefined) job.siteConditions = siteConditions;
    
    // Handle status-specific updates
    switch (status) {
      case 'assigned_to_gf':
        // PM assigned job to GF
        if (!job.assignedToGFDate) {
          job.assignedToGFDate = new Date();
          job.assignedToGFBy = req.userId;
        }
        break;
        
      case 'pre_fielding':
        // GF started pre-fielding
        if (!job.preFieldDate) {
          job.preFieldDate = new Date();
        }
        break;
        
      case 'scheduled':
        // GF scheduled the job
        break;
      
      case 'stuck':
        // Job has issues blocking progress
        job.stuckDate = new Date();
        job.stuckBy = req.userId;
        if (req.body.stuckReason) {
          job.stuckReason = req.body.stuckReason;
        }
        break;
        
      case 'in_progress':
        // Crew started work
        break;
        
      case 'pending_gf_review':
        // Crew submitted work for GF review
        job.crewSubmittedDate = new Date();
        job.crewSubmittedBy = req.userId;
        if (submissionNotes) job.crewSubmissionNotes = submissionNotes;
        break;
        
      case 'pending_qa_review':
        // Status transition only - review fields are set by /review endpoint
        // Do NOT set gfReviewDate, gfReviewedBy, gfReviewStatus here
        break;
        
      case 'pending_pm_approval':
        // Status transition only - review fields are set by /review endpoint
        // Do NOT set qaReviewDate, qaReviewedBy, qaReviewStatus here
        break;
        
      case 'ready_to_submit':
        // Status transition only - review/approval fields are set by /review endpoint
        // Only set completion metadata if not already set (fallback for legacy flows)
        if (!job.completedDate) {
          job.completedDate = new Date();
          job.completedBy = req.userId;
        }
        break;
        
      case 'submitted':
        // Submitted to utility
        job.utilitySubmittedDate = new Date();
        job.utilityVisible = true;
        job.utilityStatus = 'submitted';
        break;
        
      case 'go_back':
        // Utility issued a go-back - mark as failed audit for tracking
        job.hasFailedAudit = true;
        break;
        
      case 'billed':
        job.billedDate = new Date();
        break;
        
      case 'invoiced':
        job.invoicedDate = new Date();
        break;
        
      // Legacy status mappings - map to new status AND execute transition logic
      case 'pending':
        job.status = 'new';
        break;
        
      case 'pre-field':
        job.status = 'pre_fielding';
        // Execute same logic as 'pre_fielding' case
        if (!job.preFieldDate) {
          job.preFieldDate = new Date();
        }
        break;
        
      case 'completed':
        job.status = 'ready_to_submit';
        job.completedDate = new Date();
        job.completedBy = req.userId;
        // Execute same logic as 'ready_to_submit' case
        job.pmApprovalDate = new Date();
        job.pmApprovedBy = req.userId;
        job.pmApprovalStatus = 'approved';
        break;
        
      case 'in-progress':
        // Legacy hyphenated version
        job.status = 'in_progress';
        break;
    }
    
    await job.save();
    
    console.log(`Job ${job.pmNumber || job._id} status: ${oldStatus} → ${job.status}`);
    
    // === AI DATA CAPTURE ===
    // Capture workflow transitions for AI training (non-blocking)
    (async () => {
      try {
        // Initialize training data if not exists
        await aiDataCapture.initializeTrainingData(job._id, req.userId);
        
        // Capture crew data when scheduled
        if (status === 'scheduled' && (crewSize || estimatedHours)) {
          await aiDataCapture.captureCrewData(job._id, {
            crewSize,
            estimatedHours,
            foremanId: job.assignedTo
          }, req.userId);
        }
        
        // Capture site conditions when pre-fielding
        if (status === 'pre_fielding' && (siteConditions || preFieldNotes)) {
          await aiDataCapture.captureSiteConditions(job._id, {
            siteConditions: siteConditions || preFieldNotes
          }, req.userId);
        }
        
        // Capture outcome when completed
        if (['ready_to_submit', 'completed'].includes(status)) {
          await aiDataCapture.captureJobOutcome(job._id, {
            firstTimeSuccess: !job.gfReviewStatus || job.gfReviewStatus === 'approved',
            revisionsRequired: job.gfReviewStatus === 'revision_requested' ? 1 : 0
          }, req.userId);
        }
      } catch (aiErr) {
        console.error('[AI Data] Error capturing workflow data:', aiErr);
      }
    })();
    
    res.json({ message: 'Job status updated', job, previousStatus: oldStatus });
  } catch (err) {
    console.error('Status update error:', err);
    res.status(500).json({ error: 'Status update failed', details: err.message });
  }
});

// GF/PM Review endpoint - approve or reject crew submission
app.post('/api/jobs/:id/review', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { action, notes } = req.body;  // action: 'approve', 'reject', 'request_revision'
    
    const user = await User.findById(req.userId);
    const userRole = user?.role || 'crew';
    const canReview = user?.canApprove || ['gf', 'pm', 'admin'].includes(userRole);
    
    if (!canReview) {
      return res.status(403).json({ error: 'You do not have permission to review jobs' });
    }
    
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // ============================================
    const query = { _id: id };
    if (user?.companyId) {
      query.companyId = user.companyId;
    }
    
    const job = await Job.findOne(query);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const isGF = ['gf'].includes(userRole) || job.assignedToGF?.toString() === req.userId;
    const isQA = ['qa', 'admin'].includes(userRole);  // Admin can perform QA reviews
    const isPM = ['pm', 'admin'].includes(userRole) || job.userId?.toString() === req.userId;
    
    // Determine which review stage we're in
    // Note: PM cannot bypass GF stage - must go through proper hierarchy: GF → QA → PM
    if (job.status === 'pending_gf_review' && isGF) {
      // GF reviewing crew submission (PM cannot review at this stage)
      job.gfReviewDate = new Date();
      job.gfReviewedBy = req.userId;
      job.gfReviewNotes = notes;
      
      if (action === 'approve') {
        job.gfReviewStatus = 'approved';
        job.status = 'pending_qa_review';  // Now goes to QA first
      } else if (action === 'reject') {
        job.gfReviewStatus = 'rejected';
        job.status = 'in_progress';  // Send back to crew
      } else if (action === 'request_revision') {
        job.gfReviewStatus = 'revision_requested';
        job.status = 'in_progress';
      }
    } else if (job.status === 'pending_qa_review' && isQA) {
      // QA reviewing after GF approval - PM cannot bypass QA stage
      job.qaReviewDate = new Date();
      job.qaReviewedBy = req.userId;
      job.qaReviewNotes = notes;
      
      // Handle specs referenced during review
      if (req.body.specsReferenced) {
        job.qaSpecsReferenced = req.body.specsReferenced;
      }
      
      if (action === 'approve') {
        job.qaReviewStatus = 'approved';
        job.status = 'pending_pm_approval';  // Now goes to PM
      } else if (action === 'reject') {
        job.qaReviewStatus = 'rejected';
        job.status = 'pending_gf_review';  // Send back to GF for corrections
      } else if (action === 'request_revision') {
        job.qaReviewStatus = 'revision_requested';
        job.status = 'pending_gf_review';
      }
    } else if (job.status === 'pending_pm_approval' && isPM) {
      // PM final approval
      job.pmApprovalDate = new Date();
      job.pmApprovedBy = req.userId;
      job.pmApprovalNotes = notes;
      
      if (action === 'approve') {
        job.pmApprovalStatus = 'approved';
        job.status = 'ready_to_submit';
        job.completedDate = new Date();
        job.completedBy = req.userId;
      } else if (action === 'reject') {
        job.pmApprovalStatus = 'rejected';
        job.status = 'pending_qa_review';  // Send back to QA
      } else if (action === 'request_revision') {
        job.pmApprovalStatus = 'revision_requested';
        job.status = 'pending_qa_review';
      }
    } else {
      return res.status(400).json({ 
        error: 'Job is not in a reviewable state or you are not the appropriate reviewer',
        currentStatus: job.status,
        yourRole: userRole
      });
    }
    
    await job.save();
    
    console.log(`Job ${job.pmNumber || job._id} reviewed: ${action} by ${user.email}`);
    res.json({ message: `Job ${action}d successfully`, job });
  } catch (err) {
    console.error('Review error:', err);
    res.status(500).json({ error: 'Review failed', details: err.message });
  }
});

// === JOB NOTES/CHAT ENDPOINTS ===

// Get notes for a job
app.get('/api/jobs/:id/notes', authenticateUser, async (req, res) => {
  try {
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // ============================================
    const user = await User.findById(req.userId).select('companyId');
    const query = { _id: req.params.id };
    if (user?.companyId) {
      query.companyId = user.companyId;
    }
    
    const job = await Job.findOne(query).select('notes companyId');
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json(job.notes || []);
  } catch (err) {
    console.error('Get notes error:', err);
    res.status(500).json({ error: 'Failed to get notes' });
  }
});

// Add a note to a job
app.post('/api/jobs/:id/notes', authenticateUser, async (req, res) => {
  try {
    const { message, noteType, dependencyId } = req.body;
    
    if (!message || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
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
    
    const newNote = {
      message: message.trim(),
      userId: req.userId,
      userName: user.name || user.email,
      userRole: user.role || 'crew',
      noteType: noteType || null,
      dependencyId: dependencyId || null,
      createdAt: new Date()
    };
    
    job.notes.push(newNote);
    await job.save();
    
    // Emit via socket for real-time updates
    io.emit(`job-note-${job._id}`, newNote);
    
    res.status(201).json(newNote);
  } catch (err) {
    console.error('Add note error:', err);
    res.status(500).json({ error: 'Failed to add note' });
  }
});

// === QA DASHBOARD ENDPOINTS ===

// Get jobs pending QA review
app.get('/api/qa/pending-review', authenticateUser, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    
    // QA and Admin can access QA dashboard (PM not involved in go-back workflow)
    if (!['qa', 'admin'].includes(user?.role) && !user?.isSuperAdmin) {
      return res.status(403).json({ error: 'QA access required' });
    }
    
    const query = { 
      status: 'pending_qa_review',
      isDeleted: { $ne: true }
    };
    
    // Multi-tenant: filter by company unless super admin
    if (user?.companyId && !user.isSuperAdmin) {
      query.companyId = user.companyId;
    }
    
    const jobs = await Job.find(query)
      .populate('userId', 'name email')
      .populate('assignedToGF', 'name email')
      .populate('assignedTo', 'name email')
      .sort({ crewSubmittedDate: -1 })
      .lean();
    
    res.json(jobs);
  } catch (err) {
    console.error('QA pending review error:', err);
    res.status(500).json({ error: 'Failed to get pending QA jobs' });
  }
});

// Get jobs with failed audits (utility inspector found infractions)
app.get('/api/qa/failed-audits', authenticateUser, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    
    // QA owns the failed audit workflow
    if (!['qa', 'admin'].includes(user?.role) && !user?.isSuperAdmin) {
      return res.status(403).json({ error: 'QA access required' });
    }
    
    const query = { 
      hasFailedAudit: true,
      isDeleted: { $ne: true }
    };
    
    if (user?.companyId && !user.isSuperAdmin) {
      query.companyId = user.companyId;
    }
    
    const jobs = await Job.find(query)
      .populate('userId', 'name email')
      .populate('assignedToGF', 'name email')
      .populate('auditHistory.correctionAssignedTo', 'name email')
      .sort({ 'auditHistory.receivedDate': -1 })
      .lean();
    
    res.json(jobs);
  } catch (err) {
    console.error('QA failed audits error:', err);
    res.status(500).json({ error: 'Failed to get failed audit jobs' });
  }
});

// Get QA dashboard stats
app.get('/api/qa/stats', authenticateUser, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    
    // QA dashboard is for QA role
    if (!['qa', 'admin'].includes(user?.role) && !user?.isSuperAdmin) {
      return res.status(403).json({ error: 'QA access required' });
    }
    
    const baseQuery = { isDeleted: { $ne: true } };
    if (user?.companyId && !user.isSuperAdmin) {
      baseQuery.companyId = user.companyId;
    }
    
    const [pendingReview, failedAudits, resolvedThisMonth, avgReviewTime] = await Promise.all([
      Job.countDocuments({ ...baseQuery, status: 'pending_qa_review' }),
      Job.countDocuments({ ...baseQuery, hasFailedAudit: true }),
      Job.countDocuments({ 
        ...baseQuery, 
        qaReviewDate: { 
          $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) 
        }
      }),
      Job.aggregate([
        { $match: { ...baseQuery, qaReviewDate: { $exists: true }, gfReviewDate: { $exists: true } } },
        { $project: { 
          reviewTime: { $subtract: ['$qaReviewDate', '$gfReviewDate'] } 
        }},
        { $group: { _id: null, avg: { $avg: '$reviewTime' } } }
      ])
    ]);
    
    res.json({
      pendingReview,
      failedAudits,
      resolvedThisMonth,
      avgReviewTimeHours: avgReviewTime[0]?.avg ? Math.round(avgReviewTime[0].avg / (1000 * 60 * 60)) : null
    });
  } catch (err) {
    console.error('QA stats error:', err);
    res.status(500).json({ error: 'Failed to get QA stats' });
  }
});

// Record a utility field audit result (pass or fail)
// Utility sends failed audits directly to QA - QA records them here
app.post('/api/jobs/:id/audit', authenticateUser, async (req, res) => {
  try {
    const { 
      result,  // 'pass' or 'fail'
      auditNumber,
      auditDate,
      inspectorName,
      inspectorId,
      infractionType,
      infractionDescription,
      specReference
    } = req.body;
    
    if (!result || !['pass', 'fail'].includes(result)) {
      return res.status(400).json({ error: 'Audit result (pass/fail) is required' });
    }
    
    if (result === 'fail' && !infractionDescription) {
      return res.status(400).json({ error: 'Infraction description is required for failed audits' });
    }
    
    const user = await User.findById(req.userId);
    
    // QA receives failed audits directly from utility - they record them
    // Admin can also record for flexibility
    if (!['qa', 'admin'].includes(user?.role) && !user?.isSuperAdmin) {
      return res.status(403).json({ error: 'QA access required - failed audits go directly to QA' });
    }
    
    const query = { _id: req.params.id };
    if (user?.companyId && !user.isSuperAdmin) {
      query.companyId = user.companyId;
    }
    
    const job = await Job.findOne(query);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const audit = {
      auditNumber: auditNumber || null,
      auditDate: auditDate ? new Date(auditDate) : new Date(),
      receivedDate: new Date(),
      inspectorName: inspectorName || null,
      inspectorId: inspectorId || null,
      result,
      status: result === 'pass' ? 'closed' : 'pending_qa'
    };
    
    // For failed audits, include infraction details
    if (result === 'fail') {
      audit.infractionType = infractionType || 'other';
      audit.infractionDescription = infractionDescription;
      audit.specReference = specReference || null;
    }
    
    if (!job.auditHistory) job.auditHistory = [];
    job.auditHistory.push(audit);
    
    if (result === 'fail') {
      job.hasFailedAudit = true;
      job.failedAuditCount = (job.failedAuditCount || 0) + 1;
    } else {
      job.passedAuditDate = new Date();
    }
    
    await job.save();
    
    console.log(`Audit recorded for job ${job.pmNumber || job._id}: ${result.toUpperCase()}`);
    res.status(201).json({ 
      message: `Audit recorded: ${result.toUpperCase()}`, 
      audit: job.auditHistory[job.auditHistory.length - 1],
      job 
    });
  } catch (err) {
    console.error('Record audit error:', err);
    res.status(500).json({ error: 'Failed to record audit' });
  }
});

// QA reviews a failed audit (accept infraction or dispute it)
// This is QA's responsibility - PM is not involved in go-back workflow
app.put('/api/jobs/:id/audit/:auditId/review', authenticateUser, async (req, res) => {
  try {
    const { id, auditId } = req.params;
    const { decision, qaNotes, disputeReason, specsReferenced, assignToGF, correctionNotes } = req.body;
    
    if (!decision || !['accepted', 'disputed'].includes(decision)) {
      return res.status(400).json({ error: 'Valid decision required (accepted or disputed)' });
    }
    
    const user = await User.findById(req.userId);
    
    // QA handles all failed audit reviews - PM not involved
    if (!['qa', 'admin'].includes(user?.role) && !user?.isSuperAdmin) {
      return res.status(403).json({ error: 'QA access required' });
    }
    
    const query = { _id: id };
    if (user?.companyId && !user.isSuperAdmin) {
      query.companyId = user.companyId;
    }
    
    const job = await Job.findOne(query);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const audit = job.auditHistory.id(auditId);
    if (!audit) {
      return res.status(404).json({ error: 'Audit not found' });
    }
    
    // Update audit with QA review
    audit.qaReviewedDate = new Date();
    audit.qaReviewedBy = req.userId;
    audit.qaDecision = decision;
    audit.qaNotes = qaNotes || '';
    
    if (specsReferenced && specsReferenced.length > 0) {
      audit.specsReferenced = specsReferenced;
    }
    
    if (decision === 'accepted') {
      // Infraction is valid - assign to GF for correction
      audit.status = 'correction_assigned';
      
      if (assignToGF) {
        audit.correctionAssignedTo = assignToGF;
        audit.correctionAssignedDate = new Date();
        audit.correctionNotes = correctionNotes || '';
        job.assignedToGF = assignToGF;
      }
    } else if (decision === 'disputed') {
      // Disputing the infraction with utility
      audit.status = 'disputed';
      audit.disputeReason = disputeReason || '';
      
      // Check if there are any other active failed audits
      const activeAudits = job.auditHistory.filter(a => 
        a.result === 'fail' && !['resolved', 'closed', 'disputed'].includes(a.status)
      );
      
      // If all failed audits are disputed/resolved, job can proceed
      if (activeAudits.length === 0) {
        job.hasFailedAudit = false;
      }
    }
    
    await job.save();
    
    console.log(`Audit ${auditId} reviewed: ${decision} by ${user.email}`);
    res.json({ message: `Audit ${decision}`, audit, job });
  } catch (err) {
    console.error('Review audit error:', err);
    res.status(500).json({ error: 'Failed to review audit' });
  }
});

// Submit correction with photo proof (GF/Crew uploads photos showing fix)
app.post('/api/jobs/:id/audit/:auditId/correction', authenticateUser, upload.array('photos', 10), async (req, res) => {
  try {
    const { id, auditId } = req.params;
    const { correctionDescription } = req.body;
    
    const user = await User.findById(req.userId);
    
    // GF, Foreman, PM, Admin can submit corrections
    if (!['gf', 'foreman', 'pm', 'admin', 'qa'].includes(user?.role) && !user?.isSuperAdmin) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    const query = { _id: id };
    if (user?.companyId && !user.isSuperAdmin) {
      query.companyId = user.companyId;
    }
    
    const job = await Job.findOne(query);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const audit = job.auditHistory.id(auditId);
    if (!audit) {
      return res.status(404).json({ error: 'Audit not found' });
    }
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Correction photos are required as proof' });
    }
    
    // Upload photos to R2
    const correctionPhotos = [];
    for (const file of req.files) {
      let photoData = {
        name: file.originalname,
        uploadDate: new Date(),
        uploadedBy: req.userId
      };
      
      if (r2Storage.isR2Configured()) {
        const r2Result = await r2Storage.uploadJobFile(
          file.path,
          id,
          'correction_photos',
          file.originalname
        );
        photoData.r2Key = r2Result.key;
        photoData.url = r2Storage.getPublicUrl(r2Result.key);
        // Clean up local file
        fs.unlinkSync(file.path);
      } else {
        photoData.url = `/uploads/${path.basename(file.path)}`;
      }
      
      correctionPhotos.push(photoData);
    }
    
    // Update audit with correction
    audit.correctionPhotos = [...(audit.correctionPhotos || []), ...correctionPhotos];
    audit.correctionDescription = correctionDescription || '';
    audit.correctionCompletedDate = new Date();
    audit.correctionCompletedBy = req.userId;
    audit.status = 'correction_submitted';
    
    await job.save();
    
    console.log(`Correction submitted for audit ${auditId} with ${correctionPhotos.length} photos`);
    res.json({ 
      message: 'Correction submitted with photo proof', 
      photos: correctionPhotos,
      audit 
    });
  } catch (err) {
    console.error('Submit correction error:', err);
    res.status(500).json({ error: 'Failed to submit correction' });
  }
});

// QA approves correction and resolves the failed audit
// QA owns the entire go-back workflow - PM not involved
app.put('/api/jobs/:id/audit/:auditId/resolve', authenticateUser, async (req, res) => {
  try {
    const { id, auditId } = req.params;
    const { resolutionNotes } = req.body;
    
    const user = await User.findById(req.userId);
    
    // Only QA can approve corrections and resolve audits
    if (!['qa', 'admin'].includes(user?.role) && !user?.isSuperAdmin) {
      return res.status(403).json({ error: 'QA access required' });
    }
    
    const query = { _id: id };
    if (user?.companyId && !user.isSuperAdmin) {
      query.companyId = user.companyId;
    }
    
    const job = await Job.findOne(query);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const audit = job.auditHistory.id(auditId);
    if (!audit) {
      return res.status(404).json({ error: 'Audit not found' });
    }
    
    audit.status = 'resolved';
    audit.resolvedDate = new Date();
    audit.resolvedBy = req.userId;
    audit.resolutionNotes = resolutionNotes || 'Correction approved';
    
    // Check remaining active failed audits
    const activeAudits = job.auditHistory.filter(a => 
      a.result === 'fail' && !['resolved', 'closed', 'disputed'].includes(a.status)
    );
    job.hasFailedAudit = activeAudits.length > 0;
    
    // If all audits resolved, job can be resubmitted to utility
    if (!job.hasFailedAudit) {
      job.status = 'ready_to_submit';
    }
    
    await job.save();
    
    console.log(`Audit ${auditId} resolved by ${user.email}`);
    res.json({ message: 'Audit resolved - correction approved', audit, job });
  } catch (err) {
    console.error('Resolve audit error:', err);
    res.status(500).json({ error: 'Failed to resolve audit' });
  }
});

// ==================== QA AUDIT PDF EXTRACTION ====================
// Upload and extract failed audit PDF from utility (e.g., PG&E)
// Finds the original job by PM number and creates the audit record
app.post('/api/qa/extract-audit', authenticateUser, upload.single('pdf'), async (req, res) => {
  const startTime = Date.now();
  const APIUsage = require('./models/APIUsage');
  let pdfPath = null;
  
  try {
    const user = await User.findById(req.userId);
    
    // Only QA can upload failed audits
    if (!['qa', 'admin'].includes(user?.role) && !user?.isSuperAdmin) {
      if (req.file) try { fs.unlinkSync(req.file.path); } catch (e) {}
      return res.status(403).json({ error: 'QA access required' });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file provided' });
    }
    
    pdfPath = req.file.path;
    
    // STEP 1: Parse PDF text
    let text = '';
    try {
      const pdfParse = require('pdf-parse');
      const pdfBuffer = fs.readFileSync(pdfPath);
      const pdfData = await pdfParse(pdfBuffer, { max: 3 }); // First 3 pages
      text = pdfData.text.substring(0, 8000);
    } catch (parseErr) {
      console.warn('PDF parsing failed:', parseErr.message);
      text = req.file.originalname || '';
    }
    
    // STEP 2: AI extraction with audit-specific prompt
    if (!process.env.OPENAI_API_KEY) {
      try { fs.unlinkSync(pdfPath); } catch (e) {}
      return res.status(500).json({ error: 'AI extraction not configured' });
    }
    
    const openai = new OpenAI({ 
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 60000
    });
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are extracting data from a PG&E (or utility) QA audit / go-back document.
          
Extract and return ONLY valid JSON with these fields:
- pmNumber: The PM Order number (7-8 digits, e.g., "35611981")
- woNumber: Work Order number if different from PM
- auditNumber: Audit or inspection number/reference
- auditDate: Date of inspection (YYYY-MM-DD format)
- inspectorName: Name of the utility inspector
- inspectorId: Inspector ID/badge number if present
- result: "pass" or "fail" (if this is a go-back/failed audit, it's "fail")
- infractionType: One of: workmanship, materials, safety, incomplete, as_built, photos, clearances, grounding, other
- infractionDescription: Detailed description of the issue/infraction
- specReference: Spec or standard reference cited (e.g., "TD-2305M-001")
- address: Job site address
- city: City

Use empty string "" for any missing fields. Return ONLY valid JSON, no markdown or explanation.`
        },
        {
          role: 'user',
          content: text
        }
      ],
      temperature: 0,
      max_tokens: 800
    });
    
    // Log API usage
    const usage = response.usage || {};
    await APIUsage.logOpenAIUsage({
      operation: 'audit-extraction',
      model: 'gpt-4o-mini',
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      success: true,
      responseTimeMs: Date.now() - startTime,
      userId: req.userId,
      companyId: user?.companyId,
      metadata: { textLength: text.length }
    });
    
    // Parse the AI response
    let extracted = {};
    try {
      const content = response.choices[0]?.message?.content || '{}';
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      extracted = JSON.parse(cleanContent);
    } catch (parseErr) {
      console.error('Failed to parse AI response:', parseErr);
      // Try basic regex extraction for PM number
      const pmMatch = text.match(/(?:PM|PM#|PM Number|Order)[:\s#]*(\d{7,8})/i);
      extracted = { pmNumber: pmMatch ? pmMatch[1] : '' };
    }
    
    console.log('Extracted audit data:', extracted);
    
    // STEP 3: Find the job by PM number
    if (!extracted.pmNumber) {
      // Don't delete PDF - let user try again or enter manually
      return res.json({
        success: false,
        error: 'Could not extract PM number from document',
        extracted,
        requiresManualEntry: true
      });
    }
    
    const jobQuery = { 
      pmNumber: extracted.pmNumber,
      isDeleted: { $ne: true }
    };
    if (user?.companyId) {
      jobQuery.companyId = user.companyId;
    }
    
    let job = await Job.findOne(jobQuery);
    let isNewAuditJob = false;
    
    // If job not found, create a new "audit work order"
    if (!job) {
      console.log(`No existing job found for PM ${extracted.pmNumber}, creating audit work order`);
      
      job = new Job({
        pmNumber: extracted.pmNumber,
        woNumber: extracted.woNumber || null,
        address: extracted.address || 'Address pending from audit',
        city: extracted.city || '',
        status: 'submitted', // These are already submitted jobs that got audited
        companyId: user?.companyId,
        utilityId: user?.utilityId,
        userId: req.userId, // Track who created the job (matches Job schema)
        createdFromAudit: true, // Flag to indicate this was created from an audit
        notes: [{
          message: `Created from utility audit - PM ${extracted.pmNumber} was audited but original work order was not found in system.`,
          userId: req.userId,
          userName: user?.name || 'QA System',
          userRole: user?.role || 'qa',
          noteType: 'update'
        }],
        folders: [
          { name: 'ACI', documents: [], subfolders: [] },
          { name: 'Job Package', documents: [], subfolders: [] },
          { name: 'QA Go Back', documents: [], subfolders: [] }
        ]
      });
      
      // Save new job first so it has an _id for file uploads
      await job.save();
      isNewAuditJob = true;
    }
    
    // STEP 4: Upload the PDF to "QA Go Back" folder
    let pdfUrl = `/uploads/${path.basename(pdfPath)}`;
    let r2Key = null;
    
    // Ensure QA Go Back folder exists on the job
    let qaFolder = job.folders.find(f => f.name === 'QA Go Back');
    if (!qaFolder) {
      job.folders.push({
        name: 'QA Go Back',
        documents: [],
        subfolders: []
      });
      qaFolder = job.folders[job.folders.length - 1];
    }
    
    // Upload to R2 if configured
    const auditFileName = `Audit_${extracted.auditNumber || Date.now()}_${extracted.pmNumber}.pdf`;
    if (r2Storage.isR2Configured()) {
      try {
        const result = await r2Storage.uploadJobFile(pdfPath, job._id.toString(), 'QA_Go_Back', auditFileName);
        pdfUrl = r2Storage.getPublicUrl(result.key);
        r2Key = result.key;
      } catch (uploadErr) {
        console.error('Failed to upload audit PDF to R2:', uploadErr.message);
      }
    }
    
    // Clean up local file (always, regardless of R2 configuration)
    try {
      if (fs.existsSync(pdfPath)) {
        fs.unlinkSync(pdfPath);
      }
    } catch (cleanupErr) {
      console.error('Failed to clean up audit PDF temp file:', cleanupErr.message);
    }
    
    // Add document to QA Go Back folder
    console.log(`Adding audit PDF to job ${job._id} (PM: ${job.pmNumber}), folder: QA Go Back`);
    qaFolder.documents.push({
      name: auditFileName,
      url: pdfUrl,
      r2Key: r2Key,
      type: 'pdf',
      uploadDate: new Date(),
      uploadedBy: req.userId
    });
    
    // Mark folders as modified for Mongoose to detect nested array changes
    job.markModified('folders');
    
    // STEP 5: Create the audit record
    const audit = {
      auditNumber: extracted.auditNumber || null,
      auditDate: extracted.auditDate ? new Date(extracted.auditDate) : new Date(),
      receivedDate: new Date(),
      inspectorName: extracted.inspectorName || null,
      inspectorId: extracted.inspectorId || null,
      result: extracted.result || 'fail',
      status: 'pending_qa',
      infractionType: extracted.infractionType || 'other',
      infractionDescription: extracted.infractionDescription || '',
      specReference: extracted.specReference || null
    };
    
    if (!job.auditHistory) job.auditHistory = [];
    job.auditHistory.push(audit);
    job.hasFailedAudit = true;
    job.failedAuditCount = (job.failedAuditCount || 0) + 1;
    
    // Mark audit history as modified
    job.markModified('auditHistory');
    
    await job.save();
    console.log(`Saved audit to job ${job._id}, folders count: ${job.folders.length}, QA Go Back docs: ${qaFolder.documents.length}`);
    
    const logMessage = isNewAuditJob 
      ? `Created new audit work order for PM ${job.pmNumber}: ${extracted.infractionType}`
      : `Failed audit extracted and recorded for job ${job.pmNumber}: ${extracted.infractionType}`;
    console.log(logMessage);
    
    res.json({
      success: true,
      message: isNewAuditJob 
        ? 'Audit work order created - original job was not in system'
        : 'Audit extracted and recorded successfully',
      isNewAuditJob,
      extracted,
      job: {
        _id: job._id,
        pmNumber: job.pmNumber,
        woNumber: job.woNumber,
        address: job.address,
        city: job.city,
        createdFromAudit: job.createdFromAudit
      },
      audit: job.auditHistory[job.auditHistory.length - 1],
      pdfUrl
    });
    
  } catch (err) {
    console.error('Audit extraction error:', err);
    // Clean up file on error
    if (pdfPath && fs.existsSync(pdfPath)) {
      try { fs.unlinkSync(pdfPath); } catch (e) {}
    }
    res.status(500).json({ error: 'Failed to extract audit', details: err.message });
  }
});

// Get audit history for a job
app.get('/api/jobs/:id/audits', authenticateUser, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    
    const query = { _id: req.params.id };
    if (user?.companyId && !user.isSuperAdmin) {
      query.companyId = user.companyId;
    }
    
    const job = await Job.findOne(query)
      .populate('auditHistory.qaReviewedBy', 'name email')
      .populate('auditHistory.resolvedBy', 'name email')
      .populate('auditHistory.correctionAssignedTo', 'name email')
      .populate('auditHistory.correctionCompletedBy', 'name email')
      .select('auditHistory hasFailedAudit failedAuditCount passedAuditDate pmNumber woNumber');
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json({
      auditHistory: job.auditHistory || [],
      hasFailedAudit: job.hasFailedAudit,
      failedAuditCount: job.failedAuditCount,
      passedAuditDate: job.passedAuditDate,
      jobInfo: { pmNumber: job.pmNumber, woNumber: job.woNumber }
    });
  } catch (err) {
    console.error('Get audits error:', err);
    res.status(500).json({ error: 'Failed to get audit history' });
  }
});

// === SPEC LIBRARY MANAGEMENT (QA manages utility specs) ===

// Multer setup for spec uploads (reusing existing upload config)
const specUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, `spec_${Date.now()}${path.extname(file.originalname)}`)
  }),
  limits: { fileSize: 50 * 1024 * 1024 },  // 50MB max for specs
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx', '.xls', '.xlsx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext) || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and Office documents are allowed'), false);
    }
  }
});

// Get all specs for a utility (with optional category filter)
app.get('/api/specs', authenticateUser, async (req, res) => {
  try {
    const { utilityId, category, section, division, search } = req.query;
    const user = await User.findById(req.userId);
    
    const query = { isDeleted: { $ne: true } };
    
    if (utilityId) {
      query.utilityId = utilityId;
    }
    
    if (division) {
      query.division = division;
    }
    
    if (category) {
      query.category = category;
    }
    
    if (section) {
      query.section = section;
    }
    
    // Multi-tenant filtering
    if (user?.companyId && !user.isSuperAdmin) {
      // Can see specs for their company OR utility-wide specs (no companyId)
      query.$or = [
        { companyId: user.companyId },
        { companyId: { $exists: false } },
        { companyId: null }
      ];
    }
    
    let specs;
    if (search) {
      // Try text search first, fallback to regex if no results
      try {
        specs = await SpecDocument.find({
          ...query,
          $text: { $search: search }
        })
          .populate('utilityId', 'name shortName')
          .populate('createdBy', 'name email')
          .sort({ score: { $meta: 'textScore' } })
          .lean();
      } catch {
        // Text search failed, use regex fallback
        specs = [];
      }
      
      // If text search returned no results, try regex search
      if (specs.length === 0) {
        const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        specs = await SpecDocument.find({
          ...query,
          $or: [
            { name: searchRegex },
            { description: searchRegex },
            { documentNumber: searchRegex },
            { section: searchRegex },
            { category: searchRegex },
            { tags: searchRegex }
          ]
        })
          .populate('utilityId', 'name shortName')
          .populate('createdBy', 'name email')
          .sort({ division: 1, section: 1, documentNumber: 1, name: 1 })
          .lean();
      }
    } else {
      specs = await SpecDocument.find(query)
        .populate('utilityId', 'name shortName')
        .populate('createdBy', 'name email')
        .sort({ division: 1, section: 1, documentNumber: 1, name: 1 })
        .lean();
    }
    
    res.json(specs);
  } catch (err) {
    console.error('Get specs error:', err);
    res.status(500).json({ error: 'Failed to get specs' });
  }
});

// Get single spec with version history
app.get('/api/specs/:id', authenticateUser, async (req, res) => {
  try {
    const spec = await SpecDocument.findById(req.params.id)
      .populate('utilityId', 'name shortName')
      .populate('createdBy', 'name email')
      .populate('versions.uploadedBy', 'name email')
      .populate('versions.supersededBy', 'name email');
    
    if (!spec || spec.isDeleted) {
      return res.status(404).json({ error: 'Spec not found' });
    }
    
    // Increment view count
    spec.viewCount += 1;
    spec.lastViewedAt = new Date();
    await spec.save();
    
    res.json(spec);
  } catch (err) {
    console.error('Get spec error:', err);
    res.status(500).json({ error: 'Failed to get spec' });
  }
});

// Create a new spec document
app.post('/api/specs', authenticateUser, specUpload.single('file'), async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    
    // Only QA, PM, Admin can manage specs
    if (!['qa', 'pm', 'admin'].includes(user?.role) && !user?.isSuperAdmin) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    const { 
      name, description, documentNumber, division, category, section, subcategory, 
      utilityId, effectiveDate, tags, versionNumber 
    } = req.body;
    
    // Section is now primary, category is optional (use section if not provided)
    const specSection = section || category || 'General';
    const specCategory = category || section || 'general';
    
    if (!name || !utilityId) {
      return res.status(400).json({ error: 'Name and utility are required' });
    }
    
    // Division defaults to overhead if not provided
    const specDivision = division || 'overhead';
    
    if (!req.file) {
      return res.status(400).json({ error: 'File is required' });
    }
    
    // Upload to R2
    let r2Key = null;
    let fileUrl = null;
    
    if (r2Storage.isR2Configured()) {
      const r2Result = await r2Storage.uploadFile(
        req.file.path,
        `specs/${utilityId}/${specDivision}/${specSection}/${Date.now()}_${req.file.originalname}`,
        req.file.mimetype || 'application/pdf'
      );
      r2Key = r2Result.key;
      fileUrl = r2Storage.getPublicUrl(r2Key);
      
      // Clean up local file
      fs.unlinkSync(req.file.path);
    } else {
      r2Key = req.file.path;
      fileUrl = `/uploads/${path.basename(req.file.path)}`;
    }
    
    const version = versionNumber || '1.0';
    
    const spec = new SpecDocument({
      name,
      description,
      documentNumber,
      division: specDivision,
      category: specCategory,
      section: specSection,
      subcategory,
      utilityId,
      companyId: user.companyId || null,
      effectiveDate: effectiveDate ? new Date(effectiveDate) : null,
      tags: tags ? (typeof tags === 'string' ? tags.split(',').map(t => t.trim()) : tags) : [],
      currentVersion: version,
      r2Key,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      versions: [{
        versionNumber: version,
        r2Key,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        uploadedBy: req.userId,
        isActive: true,
        notes: 'Initial upload'
      }],
      createdBy: req.userId
    });
    
    await spec.save();
    
    console.log(`Spec created: ${name} (${category}) by ${user.email}`);
    res.status(201).json(spec);
  } catch (err) {
    console.error('Create spec error:', err);
    res.status(500).json({ error: 'Failed to create spec' });
  }
});

// Upload new version of a spec (replaces old version)
app.post('/api/specs/:id/versions', authenticateUser, specUpload.single('file'), async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    
    if (!['qa', 'pm', 'admin'].includes(user?.role) && !user?.isSuperAdmin) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'File is required' });
    }
    
    const { versionNumber, notes } = req.body;
    
    if (!versionNumber) {
      return res.status(400).json({ error: 'Version number is required' });
    }
    
    const spec = await SpecDocument.findById(req.params.id);
    if (!spec || spec.isDeleted) {
      return res.status(404).json({ error: 'Spec not found' });
    }
    
    // Upload new version to R2
    let r2Key = null;
    
    if (r2Storage.isR2Configured()) {
      const r2Result = await r2Storage.uploadFile(
        req.file.path,
        `specs/${spec.utilityId}/${spec.category}/${Date.now()}_${req.file.originalname}`,
        req.file.mimetype || 'application/pdf'
      );
      r2Key = r2Result.key;
      fs.unlinkSync(req.file.path);
    } else {
      r2Key = req.file.path;
    }
    
    // Use the model method to handle version management
    await spec.addVersion({
      versionNumber,
      r2Key,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      notes: notes || `Updated to version ${versionNumber}`
    }, req.userId);
    
    console.log(`Spec ${spec.name} updated to version ${versionNumber} by ${user.email}`);
    res.json({ message: 'New version uploaded', spec });
  } catch (err) {
    console.error('Upload spec version error:', err);
    res.status(500).json({ error: 'Failed to upload new version' });
  }
});

// Update spec metadata (not the file)
app.put('/api/specs/:id', authenticateUser, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    
    if (!['qa', 'pm', 'admin'].includes(user?.role) && !user?.isSuperAdmin) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    const { name, description, documentNumber, division, category, section, subcategory, effectiveDate, expirationDate, tags } = req.body;
    
    const spec = await SpecDocument.findById(req.params.id);
    if (!spec || spec.isDeleted) {
      return res.status(404).json({ error: 'Spec not found' });
    }
    
    if (name) spec.name = name;
    if (description !== undefined) spec.description = description;
    if (documentNumber !== undefined) spec.documentNumber = documentNumber;
    if (division) spec.division = division;
    if (category) spec.category = category;
    if (section !== undefined) spec.section = section;
    if (subcategory !== undefined) spec.subcategory = subcategory;
    if (effectiveDate) spec.effectiveDate = new Date(effectiveDate);
    if (expirationDate) spec.expirationDate = new Date(expirationDate);
    if (tags) spec.tags = typeof tags === 'string' ? tags.split(',').map(t => t.trim()) : tags;
    
    spec.lastUpdatedBy = req.userId;
    
    await spec.save();
    
    res.json(spec);
  } catch (err) {
    console.error('Update spec error:', err);
    res.status(500).json({ error: 'Failed to update spec' });
  }
});

// Soft delete a spec
app.delete('/api/specs/:id', authenticateUser, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    
    if (!['qa', 'pm', 'admin'].includes(user?.role) && !user?.isSuperAdmin) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    const spec = await SpecDocument.findById(req.params.id);
    if (!spec) {
      return res.status(404).json({ error: 'Spec not found' });
    }
    
    spec.isDeleted = true;
    spec.deletedAt = new Date();
    spec.deletedBy = req.userId;
    
    await spec.save();
    
    console.log(`Spec ${spec.name} deleted by ${user.email}`);
    res.json({ message: 'Spec deleted' });
  } catch (err) {
    console.error('Delete spec error:', err);
    res.status(500).json({ error: 'Failed to delete spec' });
  }
});

// Get spec file (download)
app.get('/api/specs/:id/download', authenticateUser, async (req, res) => {
  try {
    const { version } = req.query;  // Optional: specific version
    
    const spec = await SpecDocument.findById(req.params.id);
    if (!spec || spec.isDeleted) {
      return res.status(404).json({ error: 'Spec not found' });
    }
    
    let r2Key = spec.r2Key;
    let fileName = spec.fileName;
    
    // If specific version requested
    if (version) {
      const versionDoc = spec.versions.find(v => v.versionNumber === version);
      if (!versionDoc) {
        return res.status(404).json({ error: 'Version not found' });
      }
      r2Key = versionDoc.r2Key;
      fileName = versionDoc.fileName;
    }
    
    if (r2Storage.isR2Configured()) {
      const fileData = await r2Storage.getFileStream(r2Key);
      if (!fileData) {
        return res.status(404).json({ error: 'File not found in storage' });
      }
      
      res.setHeader('Content-Type', fileData.contentType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      if (fileData.contentLength) {
        res.setHeader('Content-Length', fileData.contentLength);
      }
      
      fileData.stream.pipe(res);
    } else {
      // Local file
      if (!fs.existsSync(r2Key)) {
        return res.status(404).json({ error: 'File not found' });
      }
      res.download(r2Key, fileName);
    }
  } catch (err) {
    console.error('Download spec error:', err);
    res.status(500).json({ error: 'Failed to download spec' });
  }
});

// Get spec categories (for dropdowns)
app.get('/api/specs/meta/categories', authenticateUser, async (req, res) => {
  res.json([
    { value: 'overhead', label: 'Overhead Construction' },
    { value: 'underground', label: 'Underground Construction' },
    { value: 'safety', label: 'Safety Standards' },
    { value: 'equipment', label: 'Equipment Specs' },
    { value: 'materials', label: 'Material Specifications' },
    { value: 'procedures', label: 'Work Procedures' },
    { value: 'forms', label: 'Required Forms' },
    { value: 'traffic_control', label: 'Traffic Control Plans' },
    { value: 'environmental', label: 'Environmental Requirements' },
    { value: 'other', label: 'Other' }
  ]);
});

// Get all sections (optionally filtered by category) for tree navigation
app.get('/api/specs/meta/sections', authenticateUser, async (req, res) => {
  try {
    const { category, utilityId } = req.query;
    const user = await User.findById(req.userId);
    
    const matchStage = { isDeleted: { $ne: true } };
    if (category) matchStage.category = category;
    if (utilityId) matchStage.utilityId = new mongoose.Types.ObjectId(utilityId);
    
    // Multi-tenant filtering
    if (user?.companyId && !user.isSuperAdmin) {
      matchStage.$or = [
        { companyId: user.companyId },
        { companyId: { $exists: false } },
        { companyId: null }
      ];
    }
    
    // Aggregate to get unique sections grouped by category
    const result = await SpecDocument.aggregate([
      { $match: matchStage },
      { 
        $group: { 
          _id: { category: '$category', section: '$section' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.category': 1, '_id.section': 1 } }
    ]);
    
    // Transform into tree structure: { category: [sections] }
    const tree = {};
    for (const item of result) {
      const cat = item._id.category;
      const sec = item._id.section || 'Uncategorized';
      if (!tree[cat]) tree[cat] = [];
      tree[cat].push({ name: sec, count: item.count });
    }
    
    res.json(tree);
  } catch (err) {
    console.error('Get sections error:', err);
    res.status(500).json({ error: 'Failed to get sections' });
  }
});

// === JOB DEPENDENCIES MANAGEMENT ===

// Get dependencies for a job
app.get('/api/jobs/:id/dependencies', authenticateUser, async (req, res) => {
  try {
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // ============================================
    const user = await User.findById(req.userId).select('companyId');
    const query = { _id: req.params.id };
    if (user?.companyId) {
      query.companyId = user.companyId;
    }
    
    const job = await Job.findOne(query).select('dependencies companyId');
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json(job.dependencies || []);
  } catch (err) {
    console.error('Get dependencies error:', err);
    res.status(500).json({ error: 'Failed to get dependencies' });
  }
});

// Add a dependency to a job
app.post('/api/jobs/:id/dependencies', authenticateUser, async (req, res) => {
  try {
    const { type, description, scheduledDate, ticketNumber, notes } = req.body;
    
    if (!type) {
      return res.status(400).json({ error: 'Dependency type is required' });
    }
    
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
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const newDep = {
      type,
      description: description || '',
      status: 'required',
      scheduledDate: scheduledDate || null,
      ticketNumber: ticketNumber || '',
      notes: notes || ''
    };
    
    job.dependencies.push(newDep);
    await job.save();
    
    // Return the newly created dependency with its ID
    const createdDep = job.dependencies[job.dependencies.length - 1];
    res.status(201).json(createdDep);
  } catch (err) {
    console.error('Add dependency error:', err);
    res.status(500).json({ error: 'Failed to add dependency' });
  }
});

// Update a dependency
app.put('/api/jobs/:id/dependencies/:depId', authenticateUser, async (req, res) => {
  try {
    const { type, description, status, scheduledDate, completedDate, ticketNumber, notes } = req.body;
    
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
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const dep = job.dependencies.id(req.params.depId);
    if (!dep) {
      return res.status(404).json({ error: 'Dependency not found' });
    }
    
    // Update fields
    if (type !== undefined) dep.type = type;
    if (description !== undefined) dep.description = description;
    if (status !== undefined) dep.status = status;
    if (scheduledDate !== undefined) dep.scheduledDate = scheduledDate;
    if (completedDate !== undefined) dep.completedDate = completedDate;
    if (ticketNumber !== undefined) dep.ticketNumber = ticketNumber;
    if (notes !== undefined) dep.notes = notes;
    
    await job.save();
    res.json(dep);
  } catch (err) {
    console.error('Update dependency error:', err);
    res.status(500).json({ error: 'Failed to update dependency' });
  }
});

// Delete a dependency
app.delete('/api/jobs/:id/dependencies/:depId', authenticateUser, async (req, res) => {
  try {
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
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const dep = job.dependencies.id(req.params.depId);
    if (!dep) {
      return res.status(404).json({ error: 'Dependency not found' });
    }
    
    dep.deleteOne();
    await job.save();
    res.json({ message: 'Dependency deleted' });
  } catch (err) {
    console.error('Delete dependency error:', err);
    res.status(500).json({ error: 'Failed to delete dependency' });
  }
});

// === AI TRAINING DATA ENDPOINTS ===

// Capture pre-field checklist decisions for AI training
app.post('/api/jobs/:id/prefield-checklist', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { decisions } = req.body;  // { usa_dig: { checked: true, notes: "..." }, ... }
    
    // ============================================
    // MULTI-TENANT SECURITY: Verify job is in user's company
    // ============================================
    const user = await User.findById(req.userId).select('companyId');
    const query = { _id: id };
    if (user?.companyId) {
      query.companyId = user.companyId;
    }
    
    const job = await Job.findOne(query);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Capture for AI training
    await aiDataCapture.capturePreFieldDecisions(id, decisions, req.userId);
    
    res.json({ message: 'Pre-field checklist captured for AI training' });
  } catch (err) {
    console.error('Capture prefield error:', err);
    res.status(500).json({ error: 'Failed to capture pre-field data' });
  }
});

// Get AI suggestions for a job based on similar past jobs
app.get('/api/jobs/:id/ai-suggestions', authenticateUser, async (req, res) => {
  try {
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
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const suggestions = await aiDataCapture.getAISuggestions({
      city: job.city,
      orderType: job.orderType,
      division: job.division,
      matCode: job.matCode,
      address: job.address
    });
    
    res.json(suggestions);
  } catch (err) {
    console.error('Get AI suggestions error:', err);
    res.status(500).json({ error: 'Failed to get AI suggestions' });
  }
});

// === ADMIN SETUP ENDPOINTS ===

// Setup Alvah company (one-time use)
app.post('/api/admin/setup-alvah', authenticateUser, async (req, res) => {
  try {
    // Only allow admins
    if (!req.isAdmin && req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const results = { created: [], skipped: [], errors: [] };

    // Find or create PG&E utility
    let pgeUtility = await Utility.findOne({ slug: 'pge' });
    if (!pgeUtility) {
      pgeUtility = await Utility.create({
        name: 'Pacific Gas & Electric',
        slug: 'pge',
        region: 'California',
        isActive: true
      });
      results.created.push('PG&E Utility');
    }

    // Company info
    const COMPANY_INFO = {
      name: 'Alvah',
      email: 'info@alvah.com',
      state: 'CA',
    };

    // Users to create
    const USERS = [
      { email: 'leek@alvah.com', name: 'Lee Kizer', password: 'Alvah2025!', role: 'gf', isAdmin: false, canApprove: true },
      { email: 'mattf@alvah.com', name: 'Matt Ferrier', password: 'Alvah2025!', role: 'foreman', isAdmin: false, canApprove: false },
      { email: 'stephens@alvah.com', name: 'Stephen Shay', password: 'Alvah2025!', role: 'foreman', isAdmin: false, canApprove: false },
      { email: 'joeb@alvah.com', name: 'Joe Bodner', password: 'Alvah2025!', role: 'foreman', isAdmin: false, canApprove: false },
    ];

    // Check if company exists
    let company = await Company.findOne({ name: COMPANY_INFO.name });
    
    if (company) {
      results.skipped.push(`Company "${COMPANY_INFO.name}" already exists`);
    } else {
      company = new Company({
        ...COMPANY_INFO,
        utilities: [pgeUtility._id],
        defaultUtility: pgeUtility._id,
        subscription: { plan: 'starter', seats: 10, status: 'active' },
        settings: { timezone: 'America/Los_Angeles', defaultDivision: 'DA' },
        isActive: true
      });
      await company.save();
      results.created.push(`Company "${company.name}"`);
    }

    // Create users
    for (const userData of USERS) {
      const existingUser = await User.findOne({ email: userData.email });
      
      if (existingUser) {
        if (!existingUser.companyId) {
          existingUser.companyId = company._id;
          await existingUser.save();
          results.skipped.push(`${userData.email} - updated companyId`);
        } else {
          results.skipped.push(`${userData.email} - already exists`);
        }
        continue;
      }
      
      const user = new User({
        email: userData.email,
        name: userData.name,
        password: userData.password,
        role: userData.role,
        isAdmin: userData.isAdmin,
        canApprove: userData.canApprove,
        companyId: company._id,
        userType: 'contractor'
      });
      
      await user.save();
      results.created.push(`${userData.role.toUpperCase()} - ${userData.email} (${userData.name})`);
    }

    res.json({
      success: true,
      message: 'Alvah setup complete',
      companyId: company._id,
      results
    });

  } catch (err) {
    console.error('Setup Alvah error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update user to admin
app.post('/api/admin/make-admin/:email', authenticateUser, async (req, res) => {
  try {
    if (!req.isAdmin && req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { email } = req.params;
    const user = await User.findOne({ email: decodeURIComponent(email) });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.isAdmin = true;
    user.role = 'admin';
    user.canApprove = true;
    await user.save();

    res.json({
      success: true,
      message: `${user.name} (${user.email}) is now an admin`,
      user: { id: user._id, name: user.name, email: user.email, role: user.role, isAdmin: user.isAdmin }
    });
  } catch (err) {
    console.error('Make admin error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Capture form field data for AI training
app.post('/api/jobs/:id/capture-form', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { formType, fields, completionTimeSeconds } = req.body;
    
    // ============================================
    // MULTI-TENANT SECURITY: Verify job is in user's company
    // ============================================
    const user = await User.findById(req.userId).select('companyId');
    const query = { _id: id };
    if (user?.companyId) {
      query.companyId = user.companyId;
    }
    
    const job = await Job.findOne(query);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    await aiDataCapture.captureFormCompletion(id, formType, fields, completionTimeSeconds, req.userId);
    
    res.json({ message: 'Form data captured for AI training' });
  } catch (err) {
    console.error('Capture form error:', err);
    res.status(500).json({ error: 'Failed to capture form data' });
  }
});

// === DOCUMENT AUTO-FILL ENDPOINTS ===

// Get auto-fill values for a document type
app.get('/api/jobs/:id/autofill/:documentType', authenticateUser, async (req, res) => {
  try {
    const { id, documentType } = req.params;
    
    const autoFillResult = await documentAutoFill.generateAutoFill(
      documentType.toUpperCase(),
      id,
      req.userId
    );
    
    if (autoFillResult.error) {
      return res.status(400).json({ error: autoFillResult.error });
    }
    
    res.json(autoFillResult);
  } catch (err) {
    console.error('Auto-fill error:', err);
    res.status(500).json({ error: 'Failed to generate auto-fill' });
  }
});

// Get available document types for auto-fill
app.get('/api/autofill/document-types', authenticateUser, async (req, res) => {
  try {
    const types = documentAutoFill.getDocumentTypes();
    res.json(types);
  } catch (err) {
    console.error('Get document types error:', err);
    res.status(500).json({ error: 'Failed to get document types' });
  }
});

// Get full job details including dependencies, notes, schedule info
app.get('/api/jobs/:id/full-details', authenticateUser, async (req, res) => {
  try {
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // ============================================
    const user = await User.findById(req.userId).select('companyId');
    const query = { _id: req.params.id };
    if (user?.companyId) {
      query.companyId = user.companyId;
    }
    
    const job = await Job.findOne(query)
      // Core assignments
      .populate('assignedTo', 'name email role')
      .populate('assignedToGF', 'name email role')
      .populate('userId', 'name email role')
      // Who did what - audit trail
      .populate('assignedBy', 'name email role')
      .populate('assignedToGFBy', 'name email role')
      .populate('crewSubmittedBy', 'name email role')
      .populate('gfReviewedBy', 'name email role')
      .populate('pmApprovedBy', 'name email role')
      .populate('completedBy', 'name email role')
      // Notes
      .populate('notes.userId', 'name email role');
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json(job);
  } catch (err) {
    console.error('Get full details error:', err);
    res.status(500).json({ error: 'Failed to get job details' });
  }
});

// Note: API routes for /api/ai/* are mounted earlier via apiRoutes
// This line is kept for any additional routes in apiRoutes that need auth

// ==================== PILOT FEEDBACK SYSTEM ====================
// Critical for pilot success - allows users to report issues from the field

const Feedback = require('./models/Feedback');

// Submit feedback (any authenticated user)
app.post('/api/feedback', authenticateUser, async (req, res) => {
  try {
    const { type, priority, subject, description, currentPage, screenSize, jobId } = req.body;
    
    // Validate required fields
    if (!subject || !description) {
      return res.status(400).json({ error: 'Subject and description are required' });
    }
    
    // Get user info for denormalization
    const user = await User.findById(req.userId).select('name email role companyId');
    
    const feedback = new Feedback({
      userId: req.userId,
      userName: user?.name || 'Unknown',
      userEmail: user?.email,
      userRole: user?.role,
      companyId: user?.companyId,
      type: type || 'bug',
      priority: priority || 'medium',
      subject,
      description,
      currentPage,
      userAgent: req.headers['user-agent'],
      screenSize,
      jobId: jobId || null,
      status: 'new'
    });
    
    await feedback.save();
    
    console.log(`[FEEDBACK] New ${type} from ${user?.email}: ${subject}`);
    
    res.status(201).json({ 
      success: true, 
      message: 'Thank you for your feedback! Our team will review it shortly.',
      feedbackId: feedback._id 
    });
  } catch (err) {
    console.error('Submit feedback error:', err);
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

// Get all feedback (Super Admin only)
app.get('/api/admin/feedback', authenticateUser, async (req, res) => {
  try {
    if (!req.isSuperAdmin) {
      return res.status(403).json({ error: 'Super Admin access required' });
    }
    
    const { status, type, limit = 50 } = req.query;
    
    const query = {};
    if (status) query.status = status;
    if (type) query.type = type;
    
    const feedback = await Feedback.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate('jobId', 'pmNumber woNumber title');
    
    // Get counts by status
    const counts = await Feedback.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    
    res.json({ 
      feedback,
      counts: counts.reduce((acc, c) => ({ ...acc, [c._id]: c.count }), {})
    });
  } catch (err) {
    console.error('Get feedback error:', err);
    res.status(500).json({ error: 'Failed to get feedback' });
  }
});

// Update feedback status (Super Admin only)
app.put('/api/admin/feedback/:id', authenticateUser, async (req, res) => {
  try {
    if (!req.isSuperAdmin) {
      return res.status(403).json({ error: 'Super Admin access required' });
    }
    
    const { status, adminNotes } = req.body;
    
    const update = {};
    if (status) update.status = status;
    if (adminNotes !== undefined) update.adminNotes = adminNotes;
    if (status === 'resolved') update.resolvedAt = new Date();
    
    const feedback = await Feedback.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true }
    );
    
    if (!feedback) {
      return res.status(404).json({ error: 'Feedback not found' });
    }
    
    res.json(feedback);
  } catch (err) {
    console.error('Update feedback error:', err);
    res.status(500).json({ error: 'Failed to update feedback' });
  }
});

// ==================== CSV EXPORT FOR JOBS ====================
// Essential for contractors to share data outside the system
// Uses standard authenticateUser middleware for security

app.get('/api/jobs/export/csv', authenticateUser, async (req, res) => {
  try {
    // Get user's company (req.userId set by authenticateUser middleware)
    const user = await User.findById(req.userId).select('companyId isSuperAdmin');
    
    // Handle deleted/missing user
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    // Build query based on permissions
    const query = { isDeleted: { $ne: true } };
    if (!user.isSuperAdmin && user.companyId) {
      query.companyId = user.companyId;
    }
    
    // Optional filters
    const { status, startDate, endDate } = req.query;
    if (status) query.status = status;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    
    const jobs = await Job.find(query)
      .select('pmNumber woNumber notificationNumber title address city client status priority dueDate crewScheduledDate createdAt completedDate assignedTo')
      .populate('assignedTo', 'name email')
      .sort({ createdAt: -1 })
      .lean();
    
    // RFC 4180 compliant CSV escaping
    // Fields containing commas, quotes, or newlines must be quoted
    // Quotes within fields must be escaped by doubling them
    const escapeCSVField = (field) => {
      if (field === null || field === undefined) return '';
      const str = String(field);
      // Check if field needs quoting (contains comma, quote, or newline)
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        // Escape quotes by doubling them, then wrap in quotes
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };
    
    // Build CSV
    const headers = [
      'PM Number',
      'WO Number',
      'Notification #',
      'Title',
      'Address',
      'City',
      'Client',
      'Status',
      'Priority',
      'Due Date',
      'Scheduled Date',
      'Created Date',
      'Completed Date',
      'Assigned To'
    ];
    
    // Format date to ISO format (YYYY-MM-DD) to avoid locale-specific commas
    const formatDate = (date) => {
      if (!date) return '';
      const d = new Date(date);
      return d.toISOString().split('T')[0]; // Returns YYYY-MM-DD format
    };
    
    const rows = jobs.map(job => [
      escapeCSVField(job.pmNumber),
      escapeCSVField(job.woNumber),
      escapeCSVField(job.notificationNumber),
      escapeCSVField(job.title),
      escapeCSVField(job.address),
      escapeCSVField(job.city),
      escapeCSVField(job.client),
      escapeCSVField(job.status),
      escapeCSVField(job.priority),
      escapeCSVField(formatDate(job.dueDate)),
      escapeCSVField(formatDate(job.crewScheduledDate)),
      escapeCSVField(formatDate(job.createdAt)),
      escapeCSVField(formatDate(job.completedDate)),
      escapeCSVField(job.assignedTo ? (job.assignedTo.name || job.assignedTo.email) : '')
    ]);
    
    const csv = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');
    
    // Set headers for CSV download
    const filename = `jobs_export_${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    res.send(csv);
  } catch (err) {
    console.error('Export jobs CSV error:', err);
    res.status(500).json({ error: 'Failed to export jobs' });
  }
});

// Socket.io setup
io.on('connection', (socket) => {
  console.log('New client connected');
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
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
// START SERVER (after all middleware and routes are registered)
// ============================================
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server listening on port ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Health endpoint: /api/health`);
  console.log(`   API docs: /api-docs`);
});

