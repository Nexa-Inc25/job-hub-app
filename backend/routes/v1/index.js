/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * API v1 Routes
 * 
 * Versioned API routes for backwards compatibility.
 * All routes are prefixed with /api/v1/
 * 
 * @module routes/v1
 */

const express = require('express');
const router = express.Router();

// Import route modules
const authRoutes = require('../auth.routes');
const jobsRoutes = require('../jobs.routes');
const adminRoutes = require('../admin.routes');
// files.routes deleted — Ghost Ship Audit Fix #1 (Zero Public URL architecture)

/**
 * @swagger
 * tags:
 *   - name: v1
 *     description: API Version 1 (stable)
 */

/**
 * API Version Info
 */
router.get('/', (req, res) => {
  res.json({
    version: '1.0.0',
    status: 'stable',
    documentation: '/api-docs',
    endpoints: {
      auth: '/api/v1/auth',
      jobs: '/api/v1/jobs',
      admin: '/api/v1/admin'
    },
    deprecation: null
  });
});

/**
 * Mount route modules
 * These are the same as the non-versioned routes,
 * but mounted under /api/v1 for explicit versioning
 */

// Auth routes: /api/v1/auth/*
router.use('/auth', authRoutes);

// Jobs routes: /api/v1/jobs/*
router.use('/jobs', jobsRoutes);

// Admin routes: /api/v1/admin/*
router.use('/admin', adminRoutes);

// Files routes removed — all file access via /api/files/signed/* with AuthZ

module.exports = router;

