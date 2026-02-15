/**
 * FieldLedger - Bidding Intelligence Routes
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Endpoints for bid intelligence and cost analytics:
 * - Historical cost analysis by item
 * - Company-wide analytics
 * - AI-assisted bid estimation
 * - Productivity metrics
 * 
 * @swagger
 * tags:
 *   - name: Bidding
 *     description: Bidding Intelligence & Cost Analytics
 */

const express = require('express');
const router = express.Router();
const biddingService = require('../services/biddingIntelligence.service');
const User = require('../models/User');
const { sanitizeString, sanitizeObjectId, sanitizeInt } = require('../utils/sanitize');

/**
 * @swagger
 * /api/bidding/analytics:
 *   get:
 *     summary: Get company-wide cost analytics
 *     description: Overview of billing data, trends, and top items
 *     tags: [Bidding]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: dateRange
 *         schema:
 *           type: integer
 *         description: Number of days of history (default 365)
 *     responses:
 *       200:
 *         description: Company analytics data
 */
router.get('/analytics', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    // Require PM, GF, or Admin role
    if (!['pm', 'gf', 'admin'].includes(user.role) && !req.isAdmin) {
      return res.status(403).json({ error: 'Not authorized to view analytics' });
    }

    const dateRange = sanitizeInt(req.query.dateRange, 365, 730);
    const groupBy = sanitizeString(req.query.groupBy) || 'category';

    const analytics = await biddingService.getCompanyAnalytics(user.companyId, {
      dateRange,
      groupBy,
    });

    res.json(analytics);
  } catch (err) {
    console.error('Error getting analytics:', err);
    res.status(500).json({ error: 'Failed to get analytics' });
  }
});

/**
 * @swagger
 * /api/bidding/cost-analysis/{itemCode}:
 *   get:
 *     summary: Get historical cost analysis for an item
 *     description: Statistical analysis of historical pricing for a specific item code
 *     tags: [Bidding]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: itemCode
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: dateRange
 *         schema:
 *           type: integer
 *         description: Days of history to analyze (default 365)
 *     responses:
 *       200:
 *         description: Item cost analysis
 */
router.get('/cost-analysis/:itemCode', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const itemCode = sanitizeString(req.params.itemCode);
    if (!itemCode) {
      return res.status(400).json({ error: 'Item code is required' });
    }

    const dateRange = sanitizeInt(req.query.dateRange, 365, 730);
    const minSamples = sanitizeInt(req.query.minSamples, 5, 50);

    const analysis = await biddingService.getItemCostAnalysis(
      user.companyId,
      itemCode,
      { dateRange, minSamples }
    );

    res.json(analysis);
  } catch (err) {
    console.error('Error getting item cost analysis:', err);
    res.status(500).json({ error: 'Failed to get cost analysis' });
  }
});

/**
 * @swagger
 * /api/bidding/estimate:
 *   post:
 *     summary: Generate a bid estimate from scope items
 *     description: Uses historical data to suggest pricing for a new bid
 *     tags: [Bidding]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - scopeItems
 *             properties:
 *               scopeItems:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     itemCode:
 *                       type: string
 *                     quantity:
 *                       type: number
 *               contingencyRate:
 *                 type: number
 *                 default: 10
 *               markupRate:
 *                 type: number
 *                 default: 15
 *               confidence:
 *                 type: string
 *                 enum: [conservative, moderate, aggressive]
 *                 default: moderate
 *     responses:
 *       200:
 *         description: Generated bid estimate
 */
router.post('/estimate', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    // Require PM, GF, or Admin role
    if (!['pm', 'gf', 'admin'].includes(user.role) && !req.isAdmin) {
      return res.status(403).json({ error: 'Not authorized to generate estimates' });
    }

    const { scopeItems, contingencyRate, markupRate, confidence } = req.body;

    if (!scopeItems || !Array.isArray(scopeItems) || scopeItems.length === 0) {
      return res.status(400).json({ error: 'Scope items array is required' });
    }

    // Validate and sanitize scope items
    const validItems = scopeItems.filter(item => 
      item.itemCode && typeof item.quantity === 'number' && item.quantity > 0
    ).map(item => ({
      itemCode: sanitizeString(item.itemCode),
      quantity: item.quantity,
    }));

    if (validItems.length === 0) {
      return res.status(400).json({ error: 'No valid scope items provided' });
    }

    const validConfidence = ['conservative', 'moderate', 'aggressive'].includes(confidence)
      ? confidence
      : 'moderate';

    const estimate = await biddingService.generateBidEstimate(
      user.companyId,
      validItems,
      {
        contingencyRate: typeof contingencyRate === 'number' ? contingencyRate : 10,
        markupRate: typeof markupRate === 'number' ? markupRate : 15,
        confidence: validConfidence,
      }
    );

    res.json(estimate);
  } catch (err) {
    console.error('Error generating estimate:', err);
    res.status(500).json({ error: 'Failed to generate estimate' });
  }
});

/**
 * @swagger
 * /api/bidding/productivity:
 *   get:
 *     summary: Get productivity rates (units per labor hour)
 *     description: Analyze how quickly items are installed based on historical data
 *     tags: [Bidding]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: itemCode
 *         schema:
 *           type: string
 *         description: Optional specific item code
 *     responses:
 *       200:
 *         description: Productivity rates
 */
router.get('/productivity', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const itemCode = sanitizeString(req.query.itemCode);
    
    const productivity = await biddingService.getProductivityRates(
      user.companyId,
      itemCode || null
    );

    res.json(productivity);
  } catch (err) {
    console.error('Error getting productivity rates:', err);
    res.status(500).json({ error: 'Failed to get productivity rates' });
  }
});

/**
 * @swagger
 * /api/bidding/compare/{jobId}:
 *   get:
 *     summary: Compare bid to actual costs for a job
 *     description: Analyze variance between estimated and actual costs
 *     tags: [Bidding]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Bid vs actual comparison
 */
router.get('/compare/:jobId', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const jobId = sanitizeObjectId(req.params.jobId);
    if (!jobId) {
      return res.status(400).json({ error: 'Valid job ID is required' });
    }

    const comparison = await biddingService.compareBidToActual(
      user.companyId,
      jobId
    );

    res.json(comparison);
  } catch (err) {
    console.error('Error comparing bid to actual:', err);
    res.status(500).json({ error: err.message || 'Failed to compare bid to actual' });
  }
});

/**
 * @swagger
 * /api/bidding/accuracy:
 *   get:
 *     summary: Get company-wide bid accuracy trend data
 *     description: Shows how accurately bids match actual costs across jobs
 *     tags: [Bidding]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *         description: Number of days of history (default 365)
 *     responses:
 *       200:
 *         description: Bid accuracy data and monthly trend
 */
router.get('/accuracy', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    // Require PM, GF, or Admin role
    if (!['pm', 'gf', 'admin'].includes(user.role) && !req.isAdmin) {
      return res.status(403).json({ error: 'Not authorized to view bid accuracy' });
    }

    const days = sanitizeInt(req.query.days, 365, 730);

    const accuracy = await biddingService.getCompanyBidAccuracy(
      user.companyId,
      { days }
    );

    res.json(accuracy);
  } catch (err) {
    console.error('Error getting bid accuracy:', err);
    res.status(500).json({ error: 'Failed to get bid accuracy data' });
  }
});

/**
 * @swagger
 * /api/bidding/suggest/{itemCode}:
 *   get:
 *     summary: Get AI-suggested bid price for an item
 *     description: Quick endpoint for real-time bid assistance
 *     tags: [Bidding]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: itemCode
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Suggested bid prices
 */
router.get('/suggest/:itemCode', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const itemCode = sanitizeString(req.params.itemCode);
    if (!itemCode) {
      return res.status(400).json({ error: 'Item code is required' });
    }

    const analysis = await biddingService.getItemCostAnalysis(
      user.companyId,
      itemCode,
      { dateRange: 365, minSamples: 3 }
    );

    if (!analysis.hasData) {
      return res.json({
        itemCode,
        hasSuggestion: false,
        message: analysis.message,
      });
    }

    res.json({
      itemCode,
      hasSuggestion: true,
      suggestedBidPrice: analysis.suggestedBidPrice,
      avgHistoricalPrice: analysis.statistics.avgUnitPrice,
      priceStability: analysis.statistics.priceStability,
      trend: analysis.statistics.trend,
      sampleCount: analysis.sampleCount,
    });
  } catch (err) {
    console.error('Error getting bid suggestion:', err);
    res.status(500).json({ error: 'Failed to get bid suggestion' });
  }
});

module.exports = router;

