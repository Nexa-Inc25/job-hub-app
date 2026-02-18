/**
 * FieldLedger - Tailboard Controller
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 *
 * Handles CRUD operations for daily tailboard/JHA meetings.
 *
 * SECURITY — Ghost Ship Audit: Fail-Closed Tenant Isolation
 * Every query scopes by companyId. No findById without company filter.
 */

const Tailboard = require('../models/Tailboard');
const Job = require('../models/Job');
const User = require('../models/User');
const crypto = require('node:crypto');
const { generateTailboardPdf } = require('../services/pdf.service');
const { sanitizeObjectId, sanitizeString } = require('../utils/sanitize');
const log = require('../utils/logger');
const { logAudit } = require('../middleware/auditLogger');

// ---------------------------------------------------------------------------
// Fail-Closed Guard (same pattern as jobs.controller)
// ---------------------------------------------------------------------------

function requireCompanyContext(req, res) {
  if (req.isSuperAdmin) return null;
  const companyId = req.companyId?.toString();
  if (!companyId) {
    log.error({ userId: req.userId, requestId: req.requestId }, 'Tailboard access denied: no company context');
    res.status(403).json({ error: 'Unauthorized: Company context required.', code: 'NO_COMPANY' });
    return false;
  }
  return companyId;
}

function scopedQuery(id, companyId) {
  const query = { _id: id };
  if (companyId !== null) query.companyId = companyId;
  return query;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Save completed tailboard to job's Close Out Documents folder
 */
async function saveTailboardToCloseOut(tailboard, companyId) {
  const jobQuery = { _id: tailboard.jobId };
  if (companyId) jobQuery.companyId = companyId;

  const job = await Job.findOne(jobQuery);
  if (!job) return;

  const aciFolder = job.folders?.find(f => f.name === 'ACI');
  if (!aciFolder) return;

  if (!aciFolder.subfolders) aciFolder.subfolders = [];
  let closeOutFolder = aciFolder.subfolders.find(sf => sf.name === 'Close Out Documents');
  if (!closeOutFolder) {
    closeOutFolder = { name: 'Close Out Documents', documents: [], subfolders: [] };
    aciFolder.subfolders.push(closeOutFolder);
  }
  if (!closeOutFolder.documents) closeOutFolder.documents = [];

  const dateStr = new Date(tailboard.date || tailboard.createdAt).toISOString().split('T')[0];
  const tailboardFilename = `${job.pmNumber || job.woNumber}_Tailboard_${dateStr}.pdf`;

  const existingIdx = closeOutFolder.documents.findIndex(d =>
    d.name?.includes('Tailboard') && d.name?.includes(dateStr)
  );
  if (existingIdx !== -1) {
    closeOutFolder.documents.splice(existingIdx, 1);
  }

  closeOutFolder.documents.push({
    name: tailboardFilename,
    type: 'tailboard',
    tailboardId: tailboard._id,
    date: tailboard.date || tailboard.createdAt,
    crewSize: tailboard.crewMembers?.length || 0,
    hazardCount: tailboard.hazards?.length || 0,
    uploadDate: new Date(),
    isCompleted: true,
    completedAt: tailboard.completedAt,
    pdfUrl: `/api/tailboards/${tailboard._id}/pdf`,
    exportUrls: {
      pdf: `/api/tailboards/${tailboard._id}/pdf`,
      oracle: `/api/tailboards/${tailboard._id}/export?format=oracle`,
      sap: `/api/tailboards/${tailboard._id}/export?format=sap`,
    }
  });

  await job.save();
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * Create a new tailboard
 * POST /api/tailboards
 */
const createTailboard = async (req, res) => {
  try {
    const companyId = requireCompanyContext(req, res);
    if (companyId === false) return;

    const { jobId } = req.body;

    // Validate job exists AND belongs to this company
    const jobQuery = { _id: jobId };
    if (companyId !== null) jobQuery.companyId = companyId;
    const job = await Job.findOne(jobQuery);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const user = await User.findById(req.userId).select('name companyId');
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const defaultMitigations = Tailboard.SPECIAL_MITIGATIONS.map(m => ({
      item: m.id,
      value: null
    }));

    const defaultUgChecklist = Tailboard.UG_CHECKLIST_ITEMS.map(item => ({
      item: item.id,
      value: null
    }));

    const tailboard = new Tailboard({
      jobId,
      companyId: companyId || job.companyId || user.companyId,
      date: req.body.date || new Date(),
      startTime: req.body.startTime,
      jobLocation: job.address || `${job.city || ''}`,
      jobAddress: job.address,
      woNumber: job.woNumber,
      pmNumber: req.body.pmNumber || job.pmNumber,
      circuit: req.body.circuit,
      showUpYardLocation: req.body.showUpYardLocation,
      foremanId: req.userId,
      foremanName: user.name,
      generalForemanId: req.body.generalForemanId,
      generalForemanName: req.body.generalForemanName,
      inspector: req.body.inspector || null,
      inspectorName: req.body.inspectorName,
      eicName: req.body.eicName,
      eicPhone: req.body.eicPhone,
      taskDescription: req.body.taskDescription,
      jobSteps: req.body.jobSteps,
      hazardsDescription: req.body.hazardsDescription,
      mitigationDescription: req.body.mitigationDescription,
      hazards: req.body.hazards || [],
      specialMitigations: req.body.specialMitigations || defaultMitigations,
      ppeRequired: req.body.ppeRequired || Tailboard.STANDARD_PPE.map(ppe => ({
        item: ppe.item,
        checked: false
      })),
      sourceSideDevices: req.body.sourceSideDevices || [],
      grounding: req.body.grounding || { needed: null, accountedFor: null, locations: [] },
      nominalVoltages: req.body.nominalVoltages,
      copperConditionInspected: req.body.copperConditionInspected,
      notTiedIntoCircuit: req.body.notTiedIntoCircuit,
      ugChecklist: req.body.ugChecklist || defaultUgChecklist,
      crewMembers: req.body.crewMembers || [],
      weatherConditions: req.body.weatherConditions,
      siteConditions: req.body.siteConditions,
      emergencyContact: req.body.emergencyContact,
      emergencyPhone: req.body.emergencyPhone,
      nearestHospital: req.body.nearestHospital,
      nearMissReporting: req.body.nearMissReporting,
      additionalNotes: req.body.additionalNotes,
      status: 'draft'
    });

    await tailboard.save();

    await logAudit(req, 'DOCUMENT_CREATED', {
      resourceType: 'tailboard', resourceId: tailboard._id.toString(),
      resourceName: `Tailboard ${tailboard.woNumber || tailboard.pmNumber}`,
      details: { jobId, status: 'draft' }
    });

    res.status(201).json(tailboard);
  } catch (error) {
    log.error({ err: error, requestId: req.requestId }, 'Error creating tailboard');
    res.status(500).json({ error: 'Failed to create tailboard' });
  }
};

/**
 * Get all tailboards for a job
 * GET /api/tailboards/job/:jobId
 */
const getTailboardsByJob = async (req, res) => {
  try {
    const companyId = requireCompanyContext(req, res);
    if (companyId === false) return;

    const safeJobId = sanitizeObjectId(req.params.jobId);
    if (!safeJobId) {
      return res.status(400).json({ error: 'Invalid job ID' });
    }

    const query = { jobId: safeJobId };
    if (companyId !== null) query.companyId = companyId;

    const tailboards = await Tailboard.find(query)
      .sort({ date: -1 })
      .populate('foremanId', 'name email')
      .lean();

    res.json(tailboards);
  } catch (error) {
    log.error({ err: error, requestId: req.requestId }, 'Error fetching tailboards');
    res.status(500).json({ error: 'Failed to fetch tailboards' });
  }
};

/**
 * Get a single tailboard
 * GET /api/tailboards/:id
 */
const getTailboard = async (req, res) => {
  try {
    const companyId = requireCompanyContext(req, res);
    if (companyId === false) return;

    const tailboard = await Tailboard.findOne(scopedQuery(req.params.id, companyId))
      .populate('foremanId', 'name email')
      .populate('crewMembers.userId', 'name email')
      .lean();

    if (!tailboard) {
      return res.status(404).json({ error: 'Tailboard not found' });
    }

    res.json(tailboard);
  } catch (error) {
    log.error({ err: error, requestId: req.requestId }, 'Error fetching tailboard');
    res.status(500).json({ error: 'Failed to fetch tailboard' });
  }
};

/**
 * Update a tailboard
 * PUT /api/tailboards/:id
 */
const updateTailboard = async (req, res) => {
  try {
    const companyId = requireCompanyContext(req, res);
    if (companyId === false) return;

    const tailboard = await Tailboard.findOne(scopedQuery(req.params.id, companyId));
    if (!tailboard) {
      return res.status(404).json({ error: 'Tailboard not found' });
    }

    if (tailboard.status === 'completed') {
      return res.status(400).json({ error: 'Cannot update completed tailboard' });
    }

    const allowedUpdates = [
      'date', 'startTime', 'taskDescription', 'jobSteps', 'hazards',
      'hazardsDescription', 'mitigationDescription', 'specialMitigations',
      'ppeRequired', 'crewMembers', 'weatherConditions', 'siteConditions',
      'emergencyContact', 'emergencyPhone', 'nearestHospital', 'nearMissReporting',
      'additionalNotes', 'foremanSignature',
      'pmNumber', 'circuit', 'showUpYardLocation', 'generalForemanId',
      'generalForemanName', 'inspector', 'inspectorName', 'eicName', 'eicPhone',
      'sourceSideDevices', 'grounding', 'nominalVoltages', 'copperConditionInspected',
      'notTiedIntoCircuit', 'ugChecklist'
    ];

    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        tailboard[field] = (field === 'inspector' && req.body[field] === '') ? null : req.body[field];
      }
    });

    await tailboard.save();
    res.json(tailboard);
  } catch (error) {
    log.error({ err: error, requestId: req.requestId }, 'Error updating tailboard');
    res.status(500).json({ error: 'Failed to update tailboard' });
  }
};

/**
 * Add a crew member signature
 * POST /api/tailboards/:id/sign
 */
const addSignature = async (req, res) => {
  try {
    const companyId = requireCompanyContext(req, res);
    if (companyId === false) return;

    const { name, role, signatureData, userId } = req.body;
    if (!name || !signatureData) {
      return res.status(400).json({ error: 'Name and signature are required' });
    }

    const tailboard = await Tailboard.findOne(scopedQuery(req.params.id, companyId));
    if (!tailboard) {
      return res.status(404).json({ error: 'Tailboard not found' });
    }

    const existingSignature = tailboard.crewMembers.find(
      member => member.name.toLowerCase() === name.toLowerCase()
    );

    if (existingSignature) {
      existingSignature.signatureData = signatureData;
      existingSignature.signedAt = new Date();
      if (role) existingSignature.role = role;
    } else {
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
    log.error({ err: error, requestId: req.requestId }, 'Error adding signature');
    res.status(500).json({ error: 'Failed to add signature' });
  }
};

/**
 * Complete/finalize a tailboard
 * POST /api/tailboards/:id/complete
 */
const completeTailboard = async (req, res) => {
  try {
    const companyId = requireCompanyContext(req, res);
    if (companyId === false) return;

    const tailboard = await Tailboard.findOne(scopedQuery(req.params.id, companyId));
    if (!tailboard) {
      return res.status(404).json({ error: 'Tailboard not found' });
    }

    const hasHazards = (tailboard.hazards && tailboard.hazards.length > 0) ||
                       (tailboard.hazardsDescription && tailboard.hazardsDescription.trim().length > 0);

    if (!hasHazards) {
      return res.status(400).json({ error: 'Hazards must be identified (either structured or description)' });
    }

    if (!tailboard.crewMembers || tailboard.crewMembers.length === 0) {
      return res.status(400).json({ error: 'At least one crew member must sign' });
    }

    const unsignedMembers = tailboard.crewMembers.filter(m => !m.signatureData);
    if (unsignedMembers.length > 0) {
      return res.status(400).json({
        error: 'All crew members must sign before completing',
        unsignedMembers: unsignedMembers.map(m => m.name)
      });
    }

    tailboard.status = 'completed';
    tailboard.completedAt = new Date();
    tailboard.shareToken = crypto.randomBytes(32).toString('hex');
    tailboard.shareTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await tailboard.save();

    await logAudit(req, 'STATUS_CHANGED', {
      resourceType: 'tailboard', resourceId: tailboard._id.toString(),
      resourceName: `Tailboard ${tailboard.woNumber || tailboard.pmNumber}`,
      details: { oldStatus: 'draft', newStatus: 'completed', crewCount: tailboard.crewMembers?.length },
      severity: 'info'
    });

    try {
      await saveTailboardToCloseOut(tailboard, companyId);
    } catch (err) {
      log.warn({ err, tailboardId: tailboard._id }, 'Failed to save tailboard to Close Out folder');
    }

    res.json(tailboard);
  } catch (error) {
    log.error({ err: error, requestId: req.requestId }, 'Error completing tailboard');
    res.status(500).json({ error: 'Failed to complete tailboard' });
  }
};

/**
 * Get tailboard by share token (public endpoint — no company scope needed)
 * GET /api/tailboards/shared/:token
 */
const getTailboardByToken = async (req, res) => {
  try {
    const safeToken = sanitizeString(req.params.token);
    if (!safeToken) {
      return res.status(400).json({ error: 'Invalid token' });
    }

    const tailboard = await Tailboard.findOne({
      shareToken: safeToken,
      shareTokenExpiry: { $gt: new Date() }
    }).lean();

    if (!tailboard) {
      return res.status(404).json({ error: 'Tailboard not found or link expired' });
    }

    // Limited view for external access — no sensitive data
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
    log.error({ err: error, requestId: req.requestId }, 'Error fetching shared tailboard');
    res.status(500).json({ error: 'Failed to fetch tailboard' });
  }
};

/**
 * Get hazard categories, PPE, mitigations, and checklist items
 * GET /api/tailboards/categories
 */
const getCategories = async (_req, res) => {
  try {
    res.json({
      hazardCategories: Tailboard.HAZARD_CATEGORIES,
      standardPPE: Tailboard.STANDARD_PPE,
      specialMitigations: Tailboard.SPECIAL_MITIGATIONS,
      ugChecklistItems: Tailboard.UG_CHECKLIST_ITEMS,
      inspectorOptions: Tailboard.INSPECTOR_OPTIONS
    });
  } catch (_err) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
};

/**
 * Get today's tailboard for a job (if exists)
 * GET /api/tailboards/job/:jobId/today
 */
const getTodaysTailboard = async (req, res) => {
  try {
    const companyId = requireCompanyContext(req, res);
    if (companyId === false) return;

    const safeJobId = sanitizeObjectId(req.params.jobId);
    if (!safeJobId) {
      return res.status(400).json({ error: 'Invalid job ID' });
    }

    const now = new Date();
    const startOfYesterday = new Date(now);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    startOfYesterday.setHours(0, 0, 0, 0);

    const endOfToday = new Date(now);
    endOfToday.setDate(endOfToday.getDate() + 1);
    endOfToday.setHours(23, 59, 59, 999);

    const query = {
      jobId: safeJobId,
      date: { $gte: startOfYesterday, $lte: endOfToday }
    };
    if (companyId !== null) query.companyId = companyId;

    const tailboard = await Tailboard.findOne(query)
      .sort({ date: -1, createdAt: -1 })
      .lean();

    res.json(tailboard || null);
  } catch (error) {
    log.error({ err: error, requestId: req.requestId }, 'Error fetching today\'s tailboard');
    res.status(500).json({ error: 'Failed to fetch tailboard' });
  }
};

/**
 * Generate PDF for a tailboard
 * GET /api/tailboards/:id/pdf
 */
const generatePdf = async (req, res) => {
  try {
    const companyId = requireCompanyContext(req, res);
    if (companyId === false) return;

    const tailboard = await Tailboard.findOne(scopedQuery(req.params.id, companyId)).lean();
    if (!tailboard) {
      return res.status(404).json({ error: 'Tailboard not found' });
    }

    const pdfBuffer = await generateTailboardPdf(tailboard);
    const filename = `Tailboard_${tailboard.woNumber || 'JHA'}_${new Date(tailboard.date).toISOString().split('T')[0]}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (error) {
    log.error({ err: error, requestId: req.requestId }, 'Error generating tailboard PDF');
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
};

/**
 * Export tailboard in Oracle/SAP format
 * GET /api/tailboards/:id/export?format=oracle|sap
 */
const exportTailboard = async (req, res) => {
  try {
    const companyId = requireCompanyContext(req, res);
    if (companyId === false) return;

    const { format = 'oracle' } = req.query;

    const tailboard = await Tailboard.findOne(scopedQuery(req.params.id, companyId))
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
    log.error({ err: error, requestId: req.requestId }, 'Error exporting tailboard');
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
