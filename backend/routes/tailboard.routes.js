/**
 * Job Hub Pro - Tailboard Routes
 * Copyright (c) 2024-2026 Job Hub Pro. All Rights Reserved.
 * 
 * API routes for daily tailboard/JHA operations.
 */

const express = require('express');
const router = express.Router();
const tailboardController = require('../controllers/tailboard.controller');

// Middleware for authentication will be applied in server.js

// Get hazard categories and standard PPE (no auth needed for reference data)
router.get('/categories', tailboardController.getCategories);

// Get tailboard by share token (public access for QR code - Phase 2)
router.get('/shared/:token', tailboardController.getTailboardByToken);

// Protected routes (require authentication)
// Create new tailboard
router.post('/', tailboardController.createTailboard);

// Get all tailboards for a job
router.get('/job/:jobId', tailboardController.getTailboardsByJob);

// Get today's tailboard for a job
router.get('/job/:jobId/today', tailboardController.getTodaysTailboard);

// Get single tailboard
router.get('/:id', tailboardController.getTailboard);

// Update tailboard
router.put('/:id', tailboardController.updateTailboard);

// Add crew signature
router.post('/:id/sign', tailboardController.addSignature);

// Complete/finalize tailboard
router.post('/:id/complete', tailboardController.completeTailboard);

// Generate PDF for tailboard
router.get('/:id/pdf', tailboardController.generatePdf);

module.exports = router;
