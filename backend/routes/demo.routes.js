/**
 * FieldLedger - Demo Sandbox Routes
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Provides isolated demo environments for prospective users.
 * Each demo session creates a temporary company with sample data
 * that is automatically cleaned up after expiration.
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { createDemoSession, resetDemoSession } = require('../utils/demoSeeder');
const { cleanupExpiredDemoSessions } = require('../utils/demoCleanup');
const Company = require('../models/Company');
const User = require('../models/User');

// Check if demo mode is enabled
const isDemoEnabled = () => {
  return process.env.DEMO_ENABLED === 'true';
};

// Demo session duration in hours (default 2)
const DEMO_SESSION_HOURS = Number.parseInt(process.env.DEMO_SESSION_HOURS, 10) || 2;

// Maximum concurrent demo sessions (default 50)
const MAX_CONCURRENT_DEMOS = Number.parseInt(process.env.DEMO_MAX_CONCURRENT, 10) || 50;

/**
 * POST /api/demo/start-session
 * Creates a new isolated demo environment with sample data
 */
router.post('/start-session', async (req, res) => {
  try {
    // Check if demo is enabled
    if (!isDemoEnabled()) {
      return res.status(403).json({ 
        error: 'Demo mode is not enabled',
        message: 'Contact sales for a personalized demo'
      });
    }
    
    // Check concurrent demo limit
    const activeDemoCount = await Company.countDocuments({ 
      isDemo: true,
      demoExpiresAt: { $gt: new Date() }
    });
    
    if (activeDemoCount >= MAX_CONCURRENT_DEMOS) {
      return res.status(503).json({ 
        error: 'Demo capacity reached',
        message: 'Please try again in a few minutes'
      });
    }
    
    // Create the demo session
    const demoSession = await createDemoSession({
      sessionHours: DEMO_SESSION_HOURS
    });
    
    // Generate JWT token for demo user
    const token = jwt.sign({
      userId: demoSession.user._id,
      isAdmin: true,
      isSuperAdmin: false,
      role: 'admin',
      canApprove: true,
      name: demoSession.user.name,
      isDemo: true,
      demoSessionId: demoSession.sessionId,
      demoExpiresAt: demoSession.expiresAt
    }, process.env.JWT_SECRET, { 
      expiresIn: `${DEMO_SESSION_HOURS}h` 
    });
    
    res.json({
      success: true,
      token,
      user: {
        id: demoSession.user._id,
        email: demoSession.user.email,
        name: demoSession.user.name,
        role: 'admin',
        isDemo: true
      },
      company: {
        id: demoSession.company._id,
        name: demoSession.company.name
      },
      sessionId: demoSession.sessionId,
      expiresAt: demoSession.expiresAt,
      expiresIn: `${DEMO_SESSION_HOURS} hours`,
      sampleData: {
        jobCount: demoSession.jobs.length,
        lmeCount: demoSession.lmes?.length || 0
      },
      message: `Welcome to FieldLedger! Your demo expires in ${DEMO_SESSION_HOURS} hours.`
    });
    
  } catch (error) {
    console.error('Error starting demo session:', error);
    res.status(500).json({ 
      error: 'Failed to start demo session',
      message: error.message 
    });
  }
});

/**
 * POST /api/demo/reset
 * Resets the current demo session to fresh state
 * Requires valid demo token
 */
router.post('/reset', async (req, res) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const token = authHeader.substring(7);
    let payload;
    
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    // Verify this is a demo session
    if (!payload.isDemo || !payload.demoSessionId) {
      return res.status(403).json({ error: 'Not a demo session' });
    }
    
    // Reset the demo session
    const demoSession = await resetDemoSession(payload.demoSessionId);
    
    if (!demoSession) {
      return res.status(404).json({ error: 'Demo session not found or expired' });
    }
    
    res.json({
      success: true,
      message: 'Demo session reset to fresh state',
      sampleData: {
        jobCount: demoSession.jobs.length,
        lmeCount: demoSession.lmes?.length || 0
      }
    });
    
  } catch (error) {
    console.error('Error resetting demo session:', error);
    res.status(500).json({ 
      error: 'Failed to reset demo session',
      message: error.message 
    });
  }
});

/**
 * GET /api/demo/status
 * Check current demo session status
 */
router.get('/status', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.json({ isDemo: false, active: false });
    }
    
    const token = authHeader.substring(7);
    let payload;
    
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.json({ isDemo: false, active: false, expired: true });
    }
    
    if (!payload.isDemo) {
      return res.json({ isDemo: false, active: false });
    }
    
    // Check if demo company still exists
    const company = await Company.findOne({
      _id: payload.userId ? undefined : null, // We need to look up by session
      isDemo: true,
      demoSessionId: payload.demoSessionId
    });
    
    const now = new Date();
    const expiresAt = new Date(payload.demoExpiresAt);
    const remainingMs = expiresAt - now;
    const remainingMinutes = Math.max(0, Math.floor(remainingMs / 60000));
    
    res.json({
      isDemo: true,
      active: remainingMs > 0,
      sessionId: payload.demoSessionId,
      expiresAt: payload.demoExpiresAt,
      remainingMinutes,
      remainingFormatted: remainingMinutes > 60 
        ? `${Math.floor(remainingMinutes / 60)}h ${remainingMinutes % 60}m`
        : `${remainingMinutes}m`
    });
    
  } catch (error) {
    console.error('Error checking demo status:', error);
    res.status(500).json({ error: 'Failed to check demo status' });
  }
});

/**
 * POST /api/demo/cleanup (Admin only - for manual cleanup)
 * Triggers cleanup of all expired demo sessions
 */
router.post('/cleanup', async (req, res) => {
  try {
    // This should only be callable by super admins or via cron
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        if (!payload.isSuperAdmin) {
          return res.status(403).json({ error: 'Super admin access required' });
        }
      } catch {
        return res.status(401).json({ error: 'Invalid token' });
      }
    } else {
      // Allow internal calls with secret header
      const cleanupSecret = req.headers['x-cleanup-secret'];
      if (cleanupSecret !== process.env.DEMO_CLEANUP_SECRET) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
    }
    
    const result = await cleanupExpiredDemoSessions();
    
    res.json({
      success: true,
      message: 'Cleanup completed',
      ...result
    });
    
  } catch (error) {
    console.error('Error during demo cleanup:', error);
    res.status(500).json({ error: 'Cleanup failed' });
  }
});

/**
 * GET /api/demo/info
 * Public endpoint with demo information
 */
router.get('/info', (req, res) => {
  res.json({
    enabled: isDemoEnabled(),
    sessionDurationHours: DEMO_SESSION_HOURS,
    features: [
      'Full access to all FieldLedger features',
      'Pre-loaded sample jobs and data',
      'SmartForms PDF auto-fill demo',
      'Mobile-friendly crew closeout',
      'LME labor tracking',
      'File organization system'
    ],
    restrictions: [
      'Data resets when session expires',
      'Cannot send real emails/SMS',
      'Exported PDFs watermarked as DEMO'
    ]
  });
});

module.exports = router;

