/**
 * Job Hub Pro - Tailboard Controller
 * Copyright (c) 2024-2026 Job Hub Pro. All Rights Reserved.
 * 
 * Handles CRUD operations for daily tailboard/JHA meetings.
 */

const Tailboard = require('../models/Tailboard');
const Job = require('../models/Job');
const crypto = require('node:crypto');
const { generateTailboardPdf } = require('../services/pdf.service');

/**
 * Create a new tailboard
 * POST /api/tailboards
 */
const createTailboard = async (req, res) => {
  try {
    const {
      jobId,
      date,
      startTime,
      taskDescription,
      hazards,
      ppeRequired,
      crewMembers,
      weatherConditions,
      siteConditions,
      emergencyContact,
      nearestHospital,
      additionalNotes
    } = req.body;

    // Validate job exists
    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Create tailboard with job info pre-populated
    const tailboard = new Tailboard({
      jobId,
      companyId: job.companyId || req.user.companyId,
      date: date || new Date(),
      startTime,
      jobLocation: job.address || `${job.city || ''}`,
      woNumber: job.woNumber,
      foremanId: req.user._id,
      foremanName: req.user.name,
      taskDescription,
      hazards: hazards || [],
      ppeRequired: ppeRequired || Tailboard.STANDARD_PPE.map(ppe => ({
        item: ppe.item,
        checked: false
      })),
      crewMembers: crewMembers || [],
      weatherConditions,
      siteConditions,
      emergencyContact,
      nearestHospital,
      additionalNotes,
      status: 'draft'
    });

    await tailboard.save();

    res.status(201).json(tailboard);
  } catch (error) {
    console.error('Error creating tailboard:', error);
    res.status(500).json({ error: 'Failed to create tailboard' });
  }
};

/**
 * Get all tailboards for a job
 * GET /api/tailboards/job/:jobId
 */
const getTailboardsByJob = async (req, res) => {
  try {
    const { jobId } = req.params;

    const tailboards = await Tailboard.find({ jobId })
      .sort({ date: -1 })
      .populate('foremanId', 'name email')
      .lean();

    res.json(tailboards);
  } catch (error) {
    console.error('Error fetching tailboards:', error);
    res.status(500).json({ error: 'Failed to fetch tailboards' });
  }
};

/**
 * Get a single tailboard
 * GET /api/tailboards/:id
 */
const getTailboard = async (req, res) => {
  try {
    const tailboard = await Tailboard.findById(req.params.id)
      .populate('foremanId', 'name email')
      .populate('crewMembers.userId', 'name email')
      .lean();

    if (!tailboard) {
      return res.status(404).json({ error: 'Tailboard not found' });
    }

    res.json(tailboard);
  } catch (error) {
    console.error('Error fetching tailboard:', error);
    res.status(500).json({ error: 'Failed to fetch tailboard' });
  }
};

/**
 * Update a tailboard
 * PUT /api/tailboards/:id
 */
const updateTailboard = async (req, res) => {
  try {
    const tailboard = await Tailboard.findById(req.params.id);

    if (!tailboard) {
      return res.status(404).json({ error: 'Tailboard not found' });
    }

    // Only allow updates if still in draft status
    if (tailboard.status === 'completed') {
      return res.status(400).json({ error: 'Cannot update completed tailboard' });
    }

    const allowedUpdates = [
      'date', 'startTime', 'taskDescription', 'hazards', 'ppeRequired',
      'crewMembers', 'weatherConditions', 'siteConditions', 'emergencyContact',
      'nearestHospital', 'additionalNotes', 'foremanSignature'
    ];

    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        tailboard[field] = req.body[field];
      }
    });

    await tailboard.save();

    res.json(tailboard);
  } catch (error) {
    console.error('Error updating tailboard:', error);
    res.status(500).json({ error: 'Failed to update tailboard' });
  }
};

/**
 * Add a crew member signature
 * POST /api/tailboards/:id/sign
 */
const addSignature = async (req, res) => {
  try {
    const { name, role, signatureData, userId } = req.body;

    if (!name || !signatureData) {
      return res.status(400).json({ error: 'Name and signature are required' });
    }

    const tailboard = await Tailboard.findById(req.params.id);

    if (!tailboard) {
      return res.status(404).json({ error: 'Tailboard not found' });
    }

    // Check if this person already signed
    const existingSignature = tailboard.crewMembers.find(
      member => member.name.toLowerCase() === name.toLowerCase()
    );

    if (existingSignature) {
      // Update existing signature
      existingSignature.signatureData = signatureData;
      existingSignature.signedAt = new Date();
      if (role) existingSignature.role = role;
    } else {
      // Add new signature
      tailboard.crewMembers.push({
        userId: userId || null,
        name,
        role: role || 'crew',
        signatureData,
        signedAt: new Date()
      });
    }

    await tailboard.save();

    res.json(tailboard);
  } catch (error) {
    console.error('Error adding signature:', error);
    res.status(500).json({ error: 'Failed to add signature' });
  }
};

/**
 * Complete/finalize a tailboard
 * POST /api/tailboards/:id/complete
 */
const completeTailboard = async (req, res) => {
  try {
    const tailboard = await Tailboard.findById(req.params.id);

    if (!tailboard) {
      return res.status(404).json({ error: 'Tailboard not found' });
    }

    // Validate minimum requirements
    if (!tailboard.hazards || tailboard.hazards.length === 0) {
      return res.status(400).json({ error: 'At least one hazard must be identified' });
    }

    if (!tailboard.crewMembers || tailboard.crewMembers.length === 0) {
      return res.status(400).json({ error: 'At least one crew member must sign' });
    }

    // Check all crew members have signed
    const unsignedMembers = tailboard.crewMembers.filter(m => !m.signatureData);
    if (unsignedMembers.length > 0) {
      return res.status(400).json({ 
        error: 'All crew members must sign before completing',
        unsignedMembers: unsignedMembers.map(m => m.name)
      });
    }

    tailboard.status = 'completed';
    tailboard.completedAt = new Date();

    // Generate share token for Phase 2 QR functionality
    tailboard.shareToken = crypto.randomBytes(32).toString('hex');
    tailboard.shareTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await tailboard.save();

    res.json(tailboard);
  } catch (error) {
    console.error('Error completing tailboard:', error);
    res.status(500).json({ error: 'Failed to complete tailboard' });
  }
};

/**
 * Get tailboard by share token (for QR code access - Phase 2)
 * GET /api/tailboards/shared/:token
 */
const getTailboardByToken = async (req, res) => {
  try {
    const tailboard = await Tailboard.findOne({
      shareToken: req.params.token,
      shareTokenExpiry: { $gt: new Date() }
    }).lean();

    if (!tailboard) {
      return res.status(404).json({ error: 'Tailboard not found or link expired' });
    }

    // Return limited view for external access
    res.json({
      woNumber: tailboard.woNumber,
      date: tailboard.date,
      jobLocation: tailboard.jobLocation,
      foremanName: tailboard.foremanName,
      taskDescription: tailboard.taskDescription,
      hazards: tailboard.hazards,
      ppeRequired: tailboard.ppeRequired,
      crewMembers: tailboard.crewMembers.map(m => ({
        name: m.name,
        role: m.role,
        signedAt: m.signedAt
      })),
      completedAt: tailboard.completedAt
    });
  } catch (error) {
    console.error('Error fetching shared tailboard:', error);
    res.status(500).json({ error: 'Failed to fetch tailboard' });
  }
};

/**
 * Get hazard categories and common items
 * GET /api/tailboards/categories
 */
const getCategories = async (req, res) => {
  try {
    res.json({
      hazardCategories: Tailboard.HAZARD_CATEGORIES,
      standardPPE: Tailboard.STANDARD_PPE
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
};

/**
 * Get today's tailboard for a job (if exists)
 * GET /api/tailboards/job/:jobId/today
 */
const getTodaysTailboard = async (req, res) => {
  try {
    const { jobId } = req.params;
    
    // Get start and end of today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const tailboard = await Tailboard.findOne({
      jobId,
      date: { $gte: today, $lt: tomorrow }
    }).lean();

    if (!tailboard) {
      return res.status(404).json({ error: 'No tailboard for today' });
    }

    res.json(tailboard);
  } catch (error) {
    console.error('Error fetching today\'s tailboard:', error);
    res.status(500).json({ error: 'Failed to fetch tailboard' });
  }
};

/**
 * Generate PDF for a tailboard
 * GET /api/tailboards/:id/pdf
 */
const generatePdf = async (req, res) => {
  try {
    const tailboard = await Tailboard.findById(req.params.id).lean();

    if (!tailboard) {
      return res.status(404).json({ error: 'Tailboard not found' });
    }

    const pdfBuffer = await generateTailboardPdf(tailboard);

    // Set response headers for PDF download
    const filename = `Tailboard_${tailboard.woNumber || 'JHA'}_${new Date(tailboard.date).toISOString().split('T')[0]}.pdf`;
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generating tailboard PDF:', error);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
};

module.exports = {
  createTailboard,
  getTailboardsByJob,
  getTailboard,
  updateTailboard,
  addSignature,
  completeTailboard,
  getTailboardByToken,
  getCategories,
  getTodaysTailboard,
  generatePdf
};
