/**
 * FieldLedger - Tailboard Controller
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Handles CRUD operations for daily tailboard/JHA meetings.
 */

const Tailboard = require('../models/Tailboard');
const Job = require('../models/Job');
const User = require('../models/User');
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
      jobSteps,
      hazards,
      hazardsDescription,
      mitigationDescription,
      specialMitigations,
      ppeRequired,
      crewMembers,
      weatherConditions,
      siteConditions,
      emergencyContact,
      emergencyPhone,
      nearestHospital,
      nearMissReporting,
      additionalNotes,
      // New Alvah-specific fields
      pmNumber,
      circuit,
      showUpYardLocation,
      generalForemanId,
      generalForemanName,
      inspector,
      inspectorName,
      eicName,
      eicPhone,
      sourceSideDevices,
      grounding,
      nominalVoltages,
      copperConditionInspected,
      notTiedIntoCircuit,
      ugChecklist
    } = req.body;

    // Validate job exists
    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Get current user info
    const user = await User.findById(req.userId).select('name companyId');
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Initialize special mitigations with defaults if not provided
    const defaultMitigations = Tailboard.SPECIAL_MITIGATIONS.map(m => ({
      item: m.id,
      value: null
    }));

    // Initialize UG checklist with defaults if not provided
    const defaultUgChecklist = Tailboard.UG_CHECKLIST_ITEMS.map(item => ({
      item: item.id,
      value: null
    }));

    // Create tailboard with job info pre-populated
    const tailboard = new Tailboard({
      jobId,
      companyId: job.companyId || user.companyId,
      date: date || new Date(),
      startTime,
      jobLocation: job.address || `${job.city || ''}`,
      jobAddress: job.address,
      woNumber: job.woNumber,
      pmNumber: pmNumber || job.pmNumber,
      circuit,
      showUpYardLocation,
      foremanId: req.userId,
      foremanName: user.name,
      generalForemanId,
      generalForemanName,
      inspector,
      inspectorName,
      eicName,
      eicPhone,
      taskDescription,
      jobSteps,
      hazardsDescription,
      mitigationDescription,
      hazards: hazards || [],
      specialMitigations: specialMitigations || defaultMitigations,
      ppeRequired: ppeRequired || Tailboard.STANDARD_PPE.map(ppe => ({
        item: ppe.item,
        checked: false
      })),
      sourceSideDevices: sourceSideDevices || [],
      grounding: grounding || {
        needed: null,
        accountedFor: null,
        locations: []
      },
      nominalVoltages,
      copperConditionInspected,
      notTiedIntoCircuit,
      ugChecklist: ugChecklist || defaultUgChecklist,
      crewMembers: crewMembers || [],
      weatherConditions,
      siteConditions,
      emergencyContact,
      emergencyPhone,
      nearestHospital,
      nearMissReporting,
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
      'date', 'startTime', 'taskDescription', 'jobSteps', 'hazards', 
      'hazardsDescription', 'mitigationDescription', 'specialMitigations',
      'ppeRequired', 'crewMembers', 'weatherConditions', 'siteConditions', 
      'emergencyContact', 'emergencyPhone', 'nearestHospital', 'nearMissReporting',
      'additionalNotes', 'foremanSignature',
      // New Alvah-specific fields
      'pmNumber', 'circuit', 'showUpYardLocation', 'generalForemanId',
      'generalForemanName', 'inspector', 'inspectorName', 'eicName', 'eicPhone',
      'sourceSideDevices', 'grounding', 'nominalVoltages', 'copperConditionInspected',
      'notTiedIntoCircuit', 'ugChecklist'
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

    // Validate minimum requirements - need either hazards array or hazards description
    const hasHazards = (tailboard.hazards && tailboard.hazards.length > 0) || 
                       (tailboard.hazardsDescription && tailboard.hazardsDescription.trim().length > 0);
    
    if (!hasHazards) {
      return res.status(400).json({ error: 'Hazards must be identified (either structured or description)' });
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
 * Get hazard categories, PPE, mitigations, and checklist items
 * GET /api/tailboards/categories
 */
const getCategories = async (req, res) => {
  try {
    res.json({
      hazardCategories: Tailboard.HAZARD_CATEGORIES,
      standardPPE: Tailboard.STANDARD_PPE,
      specialMitigations: Tailboard.SPECIAL_MITIGATIONS,
      ugChecklistItems: Tailboard.UG_CHECKLIST_ITEMS,
      inspectorOptions: Tailboard.INSPECTOR_OPTIONS
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

/**
 * Export tailboard in Oracle/SAP format for utility submission
 * GET /api/tailboards/:id/export?format=oracle|sap
 */
const exportTailboard = async (req, res) => {
  try {
    const { format = 'oracle' } = req.query;
    
    const tailboard = await Tailboard.findById(req.params.id)
      .populate('jobId', 'woNumber pmNumber address city projectName')
      .lean();

    if (!tailboard) {
      return res.status(404).json({ error: 'Tailboard not found' });
    }

    const { formatTailboardForOracle, formatTailboardForSAP } = require('../utils/jobPackageExport');
    
    const job = tailboard.jobId || {};
    const exportData = format === 'sap'
      ? formatTailboardForSAP(tailboard, job)
      : formatTailboardForOracle(tailboard, job);

    res.json(exportData);
  } catch (error) {
    console.error('Error exporting tailboard:', error);
    res.status(500).json({ error: 'Failed to export tailboard' });
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
  generatePdf,
  exportTailboard
};
