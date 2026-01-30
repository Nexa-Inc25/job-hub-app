/**
 * Test App Helper
 * 
 * Creates a configured Express app for testing without starting the server.
 * Uses mongodb-memory-server (configured in setup.js).
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const jwt = require('jsonwebtoken');

// Models
const User = require('../../models/User');
const Job = require('../../models/Job');

/**
 * Create a test-ready Express app with minimal middleware
 */
function createTestApp() {
  const app = express();
  
  // Basic middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cors());
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(mongoSanitize());
  
  return app;
}

/**
 * Generate a valid JWT token for testing
 */
function generateTestToken(userId, role = 'crew', options = {}) {
  const payload = {
    userId,
    role,
    isAdmin: options.isAdmin || false,
    isSuperAdmin: options.isSuperAdmin || false,
    companyId: options.companyId || null
  };
  
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
}

/**
 * Create a test user and return user object + token
 */
async function createTestUser(overrides = {}) {
  const bcrypt = require('bcryptjs');
  
  const defaultUser = {
    email: `test-${Date.now()}@example.com`,
    password: await bcrypt.hash('TestPassword123!', 10),
    name: 'Test User',
    role: 'crew',
    isAdmin: false,
    isSuperAdmin: false
  };
  
  const userData = { ...defaultUser, ...overrides };
  const user = await User.create(userData);
  const token = generateTestToken(user._id, user.role, {
    isAdmin: user.isAdmin,
    isSuperAdmin: user.isSuperAdmin,
    companyId: user.companyId
  });
  
  return { user, token };
}

/**
 * Create a test job
 */
async function createTestJob(overrides = {}) {
  const defaultJob = {
    title: 'Test Job',
    pmNumber: `PM-${Date.now()}`,
    status: 'new',
    address: '123 Test Street'
  };
  
  const jobData = { ...defaultJob, ...overrides };
  return Job.create(jobData);
}

/**
 * Auth middleware for testing
 */
function testAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const token = authHeader.split(' ')[1];
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    req.userRole = decoded.role;
    req.isAdmin = decoded.isAdmin;
    req.isSuperAdmin = decoded.isSuperAdmin;
    req.companyId = decoded.companyId;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = {
  createTestApp,
  generateTestToken,
  createTestUser,
  createTestJob,
  testAuthMiddleware
};

