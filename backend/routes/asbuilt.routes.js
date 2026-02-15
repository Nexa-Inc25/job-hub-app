/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
const express = require('express');
const router = express.Router();
const crypto = require('node:crypto');

const AsBuiltSubmission = require('../models/AsBuiltSubmission');
const RoutingRule = require('../models/RoutingRule');
const User = require('../models/User');
const Job = require('../models/Job');
const AsBuiltRouter = require('../services/asbuilt/AsBuiltRouter');
const { sanitizeString, sanitizeObjectId, sanitizePmNumber } = require('../utils/sanitize');

// ============================================================================
// HELPER FUNCTIONS - Extracted to reduce cognitive complexity
// ============================================================================

/**
 * Sanitize destination object for routing rules
 * @param {Object} destination - Raw destination from request body
 * @returns {Object|null} Sanitized destination or null if invalid
 */
function sanitizeDestination(destination) {
  if (!destination || typeof destination !== 'object') return null;
  
  const validTypes = ['email', 'sftp', 'api', 'folder'];
  const type = validTypes.includes(destination.type) ? destination.type : 'folder';
  
  const config = destination.config && typeof destination.config === 'object' ? {
    email: sanitizeString(destination.config.email),
    host: sanitizeString(destination.config.host),
    port: typeof destination.config.port === 'number' ? destination.config.port : undefined,
    username: sanitizeString(destination.config.username),
    path: sanitizeString(destination.config.path),
    url: sanitizeString(destination.config.url),
    folderPath: sanitizeString(destination.config.folderPath)
  } : {};
  
  return { type, config };
}

/**
 * Sanitize pageDetection object for routing rules
 * @param {Object} pageDetection - Raw pageDetection from request body
 * @returns {Object|undefined} Sanitized pageDetection or undefined if not provided
 */
function sanitizePageDetection(pageDetection) {
  if (!pageDetection || typeof pageDetection !== 'object') return undefined;
  
  return {
    startPattern: sanitizeString(pageDetection.startPattern),
    endPattern: sanitizeString(pageDetection.endPattern),
    keywords: Array.isArray(pageDetection.keywords) 
      ? pageDetection.keywords.map(k => sanitizeString(k)).filter(Boolean) 
      : [],
    headerMatch: sanitizeString(pageDetection.headerMatch)
  };
}

/**
 * Sanitize metadataMapping object for routing rules
 * @param {Object} metadataMapping - Raw metadataMapping from request body
 * @returns {Object|undefined} Sanitized metadataMapping or undefined if not provided
 */
function sanitizeMetadataMapping(metadataMapping) {
  if (!metadataMapping || typeof metadataMapping !== 'object') return undefined;
  
  return {
    pmNumber: sanitizeString(metadataMapping.pmNumber),
    woNumber: sanitizeString(metadataMapping.woNumber),
    circuitId: sanitizeString(metadataMapping.circuitId),
    address: sanitizeString(metadataMapping.address)
  };
}

/**
 * Sanitize conditions array for routing rules
 * @param {Array} conditions - Raw conditions array from request body
 * @returns {Array|undefined} Sanitized conditions or undefined if not provided
 */
function sanitizeConditions(conditions) {
  if (!Array.isArray(conditions)) return undefined;
  
  const validOperators = new Set(['equals', 'contains', 'startsWith', 'endsWith', 'regex', 'exists', 'notExists']);
  
  return conditions
    .map(c => {
      if (!c || typeof c !== 'object') return null;
      return {
        field: sanitizeString(c.field),
        operator: validOperators.has(c.operator) ? c.operator : 'equals',
        value: sanitizeString(c.value)
      };
    })
    .filter(Boolean);
}

/**
 * Sanitize notifications object for routing rules
 * @param {Object} notifications - Raw notifications from request body
 * @returns {Object|undefined} Sanitized notifications or undefined if not provided
 */
function sanitizeNotifications(notifications) {
  if (!notifications || typeof notifications !== 'object') return undefined;
  
  const sanitizeEmailList = (list) => 
    Array.isArray(list) ? list.map(e => sanitizeString(e)).filter(Boolean) : [];
  
  return {
    onSuccess: sanitizeEmailList(notifications.onSuccess),
    onFailure: sanitizeEmailList(notifications.onFailure),
    onRetry: sanitizeEmailList(notifications.onRetry)
  };
}

/**
 * Build rule data object with optional fields
 * @param {Object} params - Parameters for building rule data
 * @returns {Object} Complete rule data object
 */
function buildRuleData(params) {
  const {
    safeName, safeUtilityId, companyId, safeSectionType, safeDestination, createdBy,
    safeDescription, safePageDetection, safeMetadataMapping, safeConditions,
    priority, isActive, requiresApproval, maxRetries, retryDelayMinutes, safeNotifications
  } = params;
  
  const ruleData = {
    name: safeName,
    utilityId: safeUtilityId,
    companyId,
    sectionType: safeSectionType,
    destination: safeDestination,
    createdBy
  };
  
  if (safeDescription) ruleData.description = safeDescription;
  if (safePageDetection) ruleData.pageDetection = safePageDetection;
  if (safeMetadataMapping) ruleData.metadataMapping = safeMetadataMapping;
  if (safeConditions && safeConditions.length > 0) ruleData.conditions = safeConditions;
  if (typeof priority === 'number' && priority >= 0 && priority <= 100) ruleData.priority = priority;
  if (typeof isActive === 'boolean') ruleData.isActive = isActive;
  if (typeof requiresApproval === 'boolean') ruleData.requiresApproval = requiresApproval;
  if (typeof maxRetries === 'number' && maxRetries >= 0 && maxRetries <= 10) ruleData.maxRetries = maxRetries;
  if (typeof retryDelayMinutes === 'number' && retryDelayMinutes >= 0 && retryDelayMinutes <= 1440) ruleData.retryDelayMinutes = retryDelayMinutes;
  if (safeNotifications) ruleData.notifications = safeNotifications;
  
  return ruleData;
}

/**
 * @swagger
 * /api/asbuilt/submit:
 *   post:
 *     summary: Submit an as-built package for processing
 *     tags: [As-Built Router]
 */
router.post('/submit', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }
    
    const { jobId, pmNumber, fileKey, filename, pageCount, utilityId } = req.body;
    
    // Sanitize inputs to prevent NoSQL injection
    const safeJobId = sanitizeObjectId(jobId);
    const safePmNumber = sanitizePmNumber(pmNumber);
    const safeUtilityId = sanitizeObjectId(utilityId);
    const safeFilename = sanitizeString(filename);
    const safeFileKey = sanitizeString(fileKey);
    const safePageCount = Number.isInteger(pageCount) && pageCount > 0 ? pageCount : 40;
    
    if (!safeJobId || !safePmNumber || !safeFileKey) {
      return res.status(400).json({ error: 'Valid jobId, pmNumber, and fileKey are required' });
    }
    
    // Validate job exists and belongs to user's company
    const job = await Job.findOne({ _id: safeJobId, companyId: user.companyId });
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Get utilityId - from request, job, or default to PG&E
    // Ensure all ObjectIds are properly sanitized
    let effectiveUtilityId = safeUtilityId || sanitizeObjectId(job.utilityId);
    if (!effectiveUtilityId) {
      // Default to PG&E utility
      const Utility = require('../models/Utility');
      const defaultUtility = await Utility.findOne({ slug: 'pge' });
      effectiveUtilityId = defaultUtility?._id;
    }
    
    // Create hash for original file
    const fileHash = crypto
      .createHash('sha256')
      .update(`${safeFileKey}-${Date.now()}`)
      .digest('hex');
    
    // Sanitize job-derived fields (even from database, ensure they're clean strings)
    const safeJobNumber = sanitizeString(job.jobNumber);
    const safeWorkOrderNumber = sanitizeString(job.workOrderNumber);
    const safeCircuitId = sanitizeString(job.circuitId);
    
    // Build submission data object with only sanitized/validated fields
    // All user inputs have been sanitized above via sanitizeObjectId, sanitizePmNumber, sanitizeString
    const submissionData = {
      companyId: user.companyId,  // From authenticated user - trusted
      jobId: safeJobId,           // Sanitized via sanitizeObjectId
      utilityId: effectiveUtilityId, // Sanitized via sanitizeObjectId
      pmNumber: safePmNumber,     // Sanitized via sanitizePmNumber
      jobNumber: safeJobNumber,   // Sanitized via sanitizeString
      workOrderNumber: safeWorkOrderNumber, // Sanitized via sanitizeString
      circuitId: safeCircuitId,   // Sanitized via sanitizeString
      originalFile: {
        key: safeFileKey,         // Sanitized via sanitizeString
        filename: safeFilename || `${safePmNumber}_asbuilt.pdf`,
        hash: fileHash,           // Generated server-side
        pageCount: safePageCount, // Validated as integer
        uploadedAt: new Date()
      },
      submittedBy: user._id,      // From authenticated user - trusted
      status: 'uploaded'          // Hardcoded value
    };
    
    // Create with sanitized data object (NOSONAR - all fields sanitized above)
    const submission = await AsBuiltSubmission.create(submissionData); // NOSONAR
    
    submission.addAuditEntry('uploaded', `As-built package uploaded by ${user.name}`, user._id);
    await submission.save();
    
    // Start processing in background
    setImmediate(async () => {
      try {
        await AsBuiltRouter.processSubmission(submission._id);
      } catch (error) {
        console.error('As-built processing error:', error);
      }
    });
    
    res.status(201).json({
      message: 'As-built package submitted for processing',
      submissionId: submission.submissionId,
      status: submission.status
    });
    
  } catch (err) {
    console.error('Error submitting as-built:', err);
    res.status(500).json({ error: 'Failed to submit as-built package' });
  }
});

/**
 * @swagger
 * /api/asbuilt:
 *   get:
 *     summary: List as-built submissions
 *     tags: [As-Built Router]
 */
router.get('/', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }
    
    const { status, jobId, limit = 50, skip = 0 } = req.query;
    
    const query = { companyId: user.companyId };
    if (status) query.status = sanitizeString(status);
    const safeJobId = sanitizeObjectId(jobId);
    if (safeJobId) query.jobId = safeJobId;
    
    const submissions = await AsBuiltSubmission.find(query)
      .sort({ submittedAt: -1 })
      .limit(Number.parseInt(limit, 10))
      .skip(Number.parseInt(skip, 10))
      .populate('jobId', 'pmNumber title')
      .populate('submittedBy', 'name email')
      .select('-sections -auditLog');
    
    const total = await AsBuiltSubmission.countDocuments(query);
    
    res.json({
      submissions,
      total,
      limit: Number.parseInt(limit, 10),
      skip: Number.parseInt(skip, 10)
    });
    
  } catch (err) {
    console.error('Error listing as-built submissions:', err);
    res.status(500).json({ error: 'Failed to list submissions' });
  }
});

/**
 * @swagger
 * /api/asbuilt/{id}:
 *   get:
 *     summary: Get as-built submission details
 *     tags: [As-Built Router]
 */
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }
    
    const submissionId = sanitizeObjectId(req.params.id);
    if (!submissionId) {
      return res.status(400).json({ error: 'Invalid submission ID' });
    }
    
    const submission = await AsBuiltSubmission.findOne({
      _id: submissionId,
      companyId: user.companyId
    })
      .populate('jobId', 'pmNumber title workOrderNumber circuitId')
      .populate('submittedBy', 'name email');
    
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    
    res.json(submission);
    
  } catch (err) {
    console.error('Error getting as-built submission:', err);
    res.status(500).json({ error: 'Failed to get submission' });
  }
});

/**
 * @swagger
 * /api/asbuilt/{id}/status:
 *   get:
 *     summary: Get submission status with section delivery details
 *     tags: [As-Built Router]
 */
router.get('/:id/status', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }
    
    const status = await AsBuiltRouter.getSubmissionStatus(req.params.id);
    
    if (!status) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    
    res.json(status);
    
  } catch (err) {
    console.error('Error getting submission status:', err);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

/**
 * @swagger
 * /api/asbuilt/{id}/retry:
 *   post:
 *     summary: Retry failed section deliveries
 *     tags: [As-Built Router]
 */
router.post('/:id/retry', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }
    
    const submissionId = sanitizeObjectId(req.params.id);
    if (!submissionId) {
      return res.status(400).json({ error: 'Invalid submission ID' });
    }
    
    const submission = await AsBuiltSubmission.findOne({
      _id: submissionId,
      companyId: user.companyId
    });
    
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    
    const failedCount = submission.sections.filter(s => s.deliveryStatus === 'failed').length;
    
    if (failedCount === 0) {
      return res.status(400).json({ error: 'No failed sections to retry' });
    }
    
    submission.addAuditEntry('section_retried', `Retry initiated by ${user.name}`, user._id);
    await submission.save();
    
    // Retry in background
    setImmediate(async () => {
      try {
        await AsBuiltRouter.retryFailedSections(submission._id);
      } catch (error) {
        console.error('Retry error:', error);
      }
    });
    
    res.json({
      message: `Retrying ${failedCount} failed section(s)`,
      submissionId: submission.submissionId
    });
    
  } catch (err) {
    console.error('Error retrying sections:', err);
    res.status(500).json({ error: 'Failed to retry' });
  }
});

/**
 * @swagger
 * /api/asbuilt/analytics/summary:
 *   get:
 *     summary: Get as-built routing analytics
 *     tags: [As-Built Router]
 */
router.get('/analytics/summary', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }
    
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - Number.parseInt(days, 10));
    
    // Get aggregated stats
    const stats = await AsBuiltSubmission.aggregate([
      {
        $match: {
          companyId: user.companyId,
          submittedAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: null,
          totalSubmissions: { $sum: 1 },
          deliveredCount: {
            $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
          },
          partialCount: {
            $sum: { $cond: [{ $eq: ['$status', 'partially_delivered'] }, 1, 0] }
          },
          failedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
          },
          processingCount: {
            $sum: { $cond: [{ $in: ['$status', ['uploaded', 'processing', 'classified', 'routing']] }, 1, 0] }
          },
          avgProcessingTime: { $avg: '$processingDuration' },
          totalSections: { $sum: '$routingSummary.totalSections' },
          deliveredSections: { $sum: '$routingSummary.deliveredSections' },
          failedSections: { $sum: '$routingSummary.failedSections' }
        }
      }
    ]);
    
    // Get by destination breakdown
    const byDestination = await AsBuiltSubmission.aggregate([
      {
        $match: {
          companyId: user.companyId,
          submittedAt: { $gte: startDate }
        }
      },
      { $unwind: '$sections' },
      {
        $group: {
          _id: '$sections.destination',
          count: { $sum: 1 },
          delivered: {
            $sum: { $cond: [{ $eq: ['$sections.deliveryStatus', 'delivered'] }, 1, 0] }
          },
          failed: {
            $sum: { $cond: [{ $eq: ['$sections.deliveryStatus', 'failed'] }, 1, 0] }
          }
        }
      },
      { $sort: { count: -1 } }
    ]);
    
    // Get recent submissions
    const recent = await AsBuiltSubmission.find({
      companyId: user.companyId
    })
      .sort({ submittedAt: -1 })
      .limit(10)
      .select('submissionId pmNumber status routingSummary submittedAt');
    
    res.json({
      period: `Last ${days} days`,
      summary: stats[0] || {
        totalSubmissions: 0,
        deliveredCount: 0,
        partialCount: 0,
        failedCount: 0,
        processingCount: 0,
        avgProcessingTime: 0,
        totalSections: 0,
        deliveredSections: 0,
        failedSections: 0
      },
      byDestination,
      recent
    });
    
  } catch (err) {
    console.error('Error getting analytics:', err);
    res.status(500).json({ error: 'Failed to get analytics' });
  }
});

// ==================== ROUTING RULES MANAGEMENT ====================

/**
 * @swagger
 * /api/asbuilt/rules:
 *   get:
 *     summary: List routing rules
 *     tags: [As-Built Router]
 */
router.get('/rules', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }
    
    // Only admins and PMs can view rules
    if (!req.isAdmin && user.role !== 'pm') {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    
    const { utilityId, sectionType, isActive } = req.query;
    
    const query = {};
    const safeUtilityId = sanitizeObjectId(utilityId);
    if (safeUtilityId) query.utilityId = safeUtilityId;
    if (sectionType) query.sectionType = sanitizeString(sectionType);
    if (isActive !== undefined) query.isActive = isActive === 'true';
    
    // Include company-specific and utility-wide rules
    query.$or = [
      { companyId: null },
      { companyId: user.companyId }
    ];
    
    const rules = await RoutingRule.find(query)
      .sort({ priority: 1, createdAt: -1 })
      .populate('utilityId', 'name slug')
      .populate('createdBy', 'name');
    
    res.json(rules);
    
  } catch (err) {
    console.error('Error listing routing rules:', err);
    res.status(500).json({ error: 'Failed to list rules' });
  }
});

/**
 * @swagger
 * /api/asbuilt/rules:
 *   post:
 *     summary: Create a routing rule
 *     tags: [As-Built Router]
 */
router.post('/rules', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }
    
    // Only admins can create rules
    if (!req.isAdmin) {
      return res.status(403).json({ error: 'Only admins can create routing rules' });
    }
    
    const { 
      name, utilityId, sectionType, destination,
      description, pageDetection, metadataMapping, conditions,
      priority, isActive, requiresApproval, maxRetries, retryDelayMinutes,
      notifications
    } = req.body;
    
    if (!name || !utilityId || !sectionType || !destination) {
      return res.status(400).json({ error: 'name, utilityId, sectionType, and destination are required' });
    }
    
    // Sanitize basic inputs
    const safeName = sanitizeString(name);
    const safeUtilityId = sanitizeObjectId(utilityId);
    const safeSectionType = sanitizeString(sectionType);
    const safeDescription = sanitizeString(description);
    
    if (!safeUtilityId) {
      return res.status(400).json({ error: 'Invalid utilityId' });
    }
    
    // Sanitize complex objects using helper functions
    const safeDestination = sanitizeDestination(destination);
    if (!safeDestination) {
      return res.status(400).json({ error: 'Valid destination is required' });
    }
    
    const safePageDetection = sanitizePageDetection(pageDetection);
    const safeMetadataMapping = sanitizeMetadataMapping(metadataMapping);
    const safeConditions = sanitizeConditions(conditions);
    const safeNotifications = sanitizeNotifications(notifications);
    
    // Build rule data using helper function
    const ruleData = buildRuleData({
      safeName, safeUtilityId, companyId: user.companyId, safeSectionType, 
      safeDestination, createdBy: user._id, safeDescription, safePageDetection, 
      safeMetadataMapping, safeConditions, priority, isActive, requiresApproval, 
      maxRetries, retryDelayMinutes, safeNotifications
    });
    
    // Create with sanitized data object (NOSONAR - all fields sanitized above)
    const rule = await RoutingRule.create(ruleData); // NOSONAR
    
    res.status(201).json(rule);
    
  } catch (err) {
    console.error('Error creating routing rule:', err);
    res.status(500).json({ error: 'Failed to create rule' });
  }
});

/**
 * @swagger
 * /api/asbuilt/rules/{id}:
 *   put:
 *     summary: Update a routing rule
 *     tags: [As-Built Router]
 */
router.put('/rules/:id', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }
    
    if (!req.isAdmin) {
      return res.status(403).json({ error: 'Only admins can update routing rules' });
    }
    
    const rule = await RoutingRule.findById(req.params.id);
    if (!rule) {
      return res.status(404).json({ error: 'Rule not found' });
    }
    
    // Can only update company-specific rules
    if (rule.companyId && rule.companyId.toString() !== user.companyId.toString()) {
      return res.status(403).json({ error: 'Cannot update rules from another company' });
    }
    
    Object.assign(rule, req.body);
    rule.updatedBy = user._id;
    await rule.save();
    
    res.json(rule);
    
  } catch (err) {
    console.error('Error updating routing rule:', err);
    res.status(500).json({ error: 'Failed to update rule' });
  }
});

/**
 * @swagger
 * /api/asbuilt/rules/{id}:
 *   delete:
 *     summary: Delete a routing rule
 *     tags: [As-Built Router]
 */
router.delete('/rules/:id', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }
    
    if (!req.isAdmin) {
      return res.status(403).json({ error: 'Only admins can delete routing rules' });
    }
    
    const rule = await RoutingRule.findById(req.params.id);
    if (!rule) {
      return res.status(404).json({ error: 'Rule not found' });
    }
    
    // Can only delete company-specific rules
    if (!rule.companyId || rule.companyId.toString() !== user.companyId.toString()) {
      return res.status(403).json({ error: 'Cannot delete utility-wide or other company rules' });
    }
    
    await rule.deleteOne();
    
    res.json({ message: 'Rule deleted' });
    
  } catch (err) {
    console.error('Error deleting routing rule:', err);
    res.status(500).json({ error: 'Failed to delete rule' });
  }
});

// ==================== DEFAULT PG&E ROUTING RULES SEED ====================

/**
 * @swagger
 * /api/asbuilt/rules/seed-pge:
 *   post:
 *     summary: Seed default PG&E routing rules
 *     tags: [As-Built Router]
 */
router.post('/rules/seed-pge', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!req.isAdmin) {
      return res.status(403).json({ error: 'Only admins can seed rules' });
    }
    
    const { utilityId } = req.body;
    if (!utilityId) {
      return res.status(400).json({ error: 'utilityId is required' });
    }
    
    // Default PG&E routing rules
    const defaultRules = [
      {
        name: 'Construction Sketch to GIS',
        sectionType: 'construction_sketch',
        destination: { type: 'gis_api' },
        priority: 10
      },
      {
        name: 'Circuit Map to District Office',
        sectionType: 'circuit_map',
        destination: { type: 'email', email: { to: ['district-office@pge.com'] } },
        priority: 10
      },
      {
        name: 'Equipment Info to Oracle EAM',
        sectionType: 'equipment_info',
        destination: { type: 'oracle_api', oracle: { module: 'eam' } },
        priority: 10
      },
      {
        name: 'Billing Form to Oracle Payables',
        sectionType: 'billing_form',
        destination: { type: 'oracle_api', oracle: { module: 'payables' } },
        priority: 10
      },
      {
        name: 'CCSC to Regulatory Portal',
        sectionType: 'ccsc',
        destination: { type: 'webhook', webhook: { url: 'https://cpuc.ca.gov/api' } },
        priority: 10
      },
      {
        name: 'Permits to SharePoint',
        sectionType: 'permits',
        destination: { type: 'sharepoint', sharepoint: { libraryName: 'Completed Permits' } },
        priority: 10
      },
      {
        name: 'TCP to UTCS SharePoint',
        sectionType: 'tcp',
        destination: { type: 'sharepoint', sharepoint: { libraryName: 'Traffic Control Plans' } },
        priority: 10
      },
      {
        name: 'Face Sheet to Oracle PPM',
        sectionType: 'face_sheet',
        destination: { type: 'oracle_api', oracle: { module: 'ppm' } },
        priority: 20
      }
    ];
    
    const created = [];
    for (const ruleData of defaultRules) {
      // Check if rule already exists
      const exists = await RoutingRule.findOne({
        utilityId,
        sectionType: ruleData.sectionType,
        companyId: null
      });
      
      if (!exists) {
        const rule = await RoutingRule.create({
          ...ruleData,
          utilityId,
          companyId: null, // Utility-wide rule
          createdBy: user._id,
          isActive: true
        });
        created.push(rule.name);
      }
    }
    
    res.json({
      message: `Created ${created.length} default PG&E routing rules`,
      rules: created
    });
    
  } catch (err) {
    console.error('Error seeding rules:', err);
    res.status(500).json({ error: 'Failed to seed rules' });
  }
});

// ============================================================================
// UTILITY AS-BUILT CONFIGURATION ENDPOINTS
// ============================================================================

const UtilityAsBuiltConfig = require('../models/UtilityAsBuiltConfig');
const { getPGEConfig } = require('../seeds/pge-asbuilt-config');
const { getSCEConfig } = require('../seeds/sce-asbuilt-config');

/**
 * Get or auto-seed utility config. Uses findOneAndUpdate with upsert
 * to avoid race conditions when multiple concurrent requests arrive
 * before the config exists (prevents E11000 duplicate key errors).
 * 
 * Also updates the config if the seed version has changed (effectiveDate).
 */
async function getOrSeedConfig(utilityCode) {
  let config = await UtilityAsBuiltConfig.findByUtilityCode(utilityCode);
  
  // Auto-seed supported utilities
  const seedMap = { PGE: getPGEConfig, SCE: getSCEConfig };
  const seedFn = seedMap[utilityCode];

  if (seedFn) {
    const seed = seedFn();

    // Check if config needs updating (version mismatch or doesn't exist)
    const needsUpdate = !config ||
      config.procedureVersion !== seed.procedureVersion ||
      config.workTypes?.length !== seed.workTypes?.length;

    if (needsUpdate) {
      config = await UtilityAsBuiltConfig.findOneAndUpdate(
        { utilityCode },
        { $set: seed },
        { upsert: true, new: true }
      );
      return config;
    }
  }

  return config || null;
}

/**
 * GET /config/:utilityCode
 * Fetch the active As-Built configuration for a utility.
 * The frontend uses this to drive the As-Built wizard, symbol palette,
 * checklist, and validation rules — all without hardcoding any utility logic.
 */
router.get('/config/:utilityCode', async (req, res) => {
  try {
    const utilityCode = sanitizeString(req.params.utilityCode)?.toUpperCase();
    if (!utilityCode) {
      return res.status(400).json({ error: 'Utility code is required' });
    }

    const config = await getOrSeedConfig(utilityCode);

    if (!config) {
      return res.status(404).json({ error: `No As-Built configuration found for utility: ${utilityCode}` });
    }

    res.json(config);
  } catch (err) {
    console.error('Error fetching utility config:', err);
    res.status(500).json({ error: 'Failed to fetch utility configuration' });
  }
});

/**
 * GET /config/:utilityCode/symbols
 * Fetch just the symbol library for a utility (lightweight endpoint for the sketch markup editor).
 */
router.get('/config/:utilityCode/symbols', async (req, res) => {
  try {
    const utilityCode = sanitizeString(req.params.utilityCode)?.toUpperCase();
    if (!utilityCode) {
      return res.status(400).json({ error: 'Utility code is required' });
    }

    const config = await getOrSeedConfig(utilityCode);

    if (!config?.symbolLibrary) {
      return res.status(404).json({ error: `No symbol library found for utility: ${utilityCode}` });
    }

    res.json({
      standardId: config.symbolLibrary.standardId,
      standardName: config.symbolLibrary.standardName,
      symbols: config.symbolLibrary.symbols,
      colorConventions: config.colorConventions,
    });
  } catch (err) {
    console.error('Error fetching symbols:', err);
    res.status(500).json({ error: 'Failed to fetch symbol library' });
  }
});

/**
 * GET /config/:utilityCode/checklist
 * Fetch just the completion checklist for a utility (for the CCSC native checklist UI).
 */
router.get('/config/:utilityCode/checklist', async (req, res) => {
  try {
    const utilityCode = sanitizeString(req.params.utilityCode)?.toUpperCase();
    if (!utilityCode) {
      return res.status(400).json({ error: 'Utility code is required' });
    }

    const config = await getOrSeedConfig(utilityCode);

    if (!config?.checklist) {
      return res.status(404).json({ error: `No checklist found for utility: ${utilityCode}` });
    }

    res.json(config.checklist);
  } catch (err) {
    console.error('Error fetching checklist:', err);
    res.status(500).json({ error: 'Failed to fetch checklist' });
  }
});

/**
 * GET /config/:utilityCode/work-types
 * Fetch work types and their required documents.
 */
router.get('/config/:utilityCode/work-types', async (req, res) => {
  try {
    const utilityCode = sanitizeString(req.params.utilityCode)?.toUpperCase();
    if (!utilityCode) {
      return res.status(400).json({ error: 'Utility code is required' });
    }

    const config = await getOrSeedConfig(utilityCode);

    if (!config) {
      return res.status(404).json({ error: `No configuration found for utility: ${utilityCode}` });
    }

    res.json({
      workTypes: config.workTypes,
      pageRanges: config.pageRanges,
    });
  } catch (err) {
    console.error('Error fetching work types:', err);
    res.status(500).json({ error: 'Failed to fetch work types' });
  }
});

// ============================================================================
// PAGE CLASSIFICATION ENDPOINT
// ============================================================================

/**
 * POST /classify-pages
 * Classify pages of a job package PDF by matching text content against
 * the utility's detection keywords. Returns a map of sectionType → pageNumbers.
 * 
 * Since job packages are NOT always in the same page order, this replaces
 * fixed page ranges with content-based detection.
 */
router.post('/classify-pages', async (req, res) => {
  try {
    const { jobId, utilityCode = 'PGE' } = req.body;
    
    const safeJobId = sanitizeObjectId(jobId);
    if (!safeJobId) {
      return res.status(400).json({ error: 'jobId is required' });
    }

    // Load utility config for detection keywords
    const config = await UtilityAsBuiltConfig.findByUtilityCode(
      sanitizeString(utilityCode)?.toUpperCase() || 'PGE'
    );
    if (!config?.pageRanges) {
      return res.status(404).json({ error: 'No utility configuration found' });
    }

    // Find the job package PDF
    const job = await Job.findById(safeJobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Collect all PDF documents from the job
    const allDocs = [];
    for (const folder of job.folders || []) {
      for (const doc of folder.documents || []) {
        if (doc.type === 'pdf' && !doc.extractedFrom) allDocs.push(doc);
      }
      for (const sub of folder.subfolders || []) {
        for (const doc of sub.documents || []) {
          if (doc.type === 'pdf' && !doc.extractedFrom) allDocs.push(doc);
        }
      }
    }

    // Find the main job package (largest PDF or one named "pack"/"package")
    const jobPackage = allDocs.find(d =>
      d.name?.toLowerCase().includes('pack') ||
      d.name?.toLowerCase().includes('package')
    ) || allDocs.sort((a, b) => (b.size || 0) - (a.size || 0))[0];

    if (!jobPackage?.r2Key) {
      return res.status(404).json({ error: 'No job package PDF found' });
    }

    // Extract text from each page using pdf-parse (lazy loaded)
    const _pdfUtils = (() => {
      try { return require('../utils/pdfUtils'); }
      catch { return null; }
    })();

    const r2Storage = require('../utils/storage');
    let pdfBuffer;
    try {
      const fileData = await r2Storage.getFileStream(jobPackage.r2Key);
      if (!fileData?.stream) {
        return res.status(404).json({ error: 'Could not read job package PDF' });
      }
      const chunks = [];
      for await (const chunk of fileData.stream) {
        chunks.push(chunk);
      }
      pdfBuffer = Buffer.concat(chunks);
    } catch (err) {
      console.error('Error reading PDF from R2:', err);
      return res.status(500).json({ error: 'Failed to read job package PDF' });
    }

    // Parse PDF and get text per page
    try {
      const pdfParse = require('pdf-parse');
      // pdf-parse doesn't give per-page text easily, so use pdfjs-dist if available
      // Fallback: use the full text and match keywords
      const parsed = await pdfParse(pdfBuffer);
      
      // Split by form feed or page markers if possible
      // pdf-parse joins all pages — we need per-page text for classification
      // Use a simple heuristic: split on common PG&E page headers
      const fullText = parsed.text || '';
      const totalPages = parsed.numpages || 0;
      
      // For now, search the full text for each keyword and report which sections exist
      const classification = {};
      for (const range of config.pageRanges) {
        if (range.detectionKeyword) {
          const found = fullText.toLowerCase().includes(range.detectionKeyword.toLowerCase());
          if (found) {
            classification[range.sectionType] = {
              detected: true,
              label: range.label,
              keyword: range.detectionKeyword,
              // Fall back to config page numbers as best guess for page position
              suggestedPages: { start: range.start, end: range.end },
            };
          }
        }
      }

      res.json({
        totalPages,
        classification,
        pdfName: jobPackage.name,
        r2Key: jobPackage.r2Key,
        detectedSections: Object.keys(classification).length,
        totalConfiguredSections: config.pageRanges.length,
      });
    } catch (err) {
      console.error('Error parsing PDF:', err);
      res.status(500).json({ error: 'Failed to parse job package PDF' });
    }
  } catch (err) {
    console.error('Error classifying pages:', err);
    res.status(500).json({ error: 'Failed to classify pages' });
  }
});

// ============================================================================
// PAGE CLASSIFICATION
// ============================================================================

const { classifyPages } = require('../services/asbuilt/PageClassifier');
const r2Storage = require('../utils/storage');

/**
 * POST /classify
 * Classify each page of a job's uploaded package PDF by content.
 * Stores the result on the job record so the wizard knows which pages
 * belong to which document section — regardless of upload order.
 */
router.post('/classify', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const jobId = sanitizeObjectId(req.body.jobId);
    if (!jobId) {
      return res.status(400).json({ error: 'Valid jobId is required' });
    }

    const job = await Job.findOne({ _id: jobId, companyId: user.companyId });
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Find the job package PDF — look for the main PDF in the job file system
    // Priority: explicit pdfKey in body > job.packagePdfKey > first PDF in root/Job Package folder
    let pdfBuffer = null;
    let pdfKey = sanitizeString(req.body.pdfKey) || job.packagePdfKey || null;

    if (pdfKey && r2Storage.isR2Configured()) {
      // Load from R2
      try {
        const fileData = await r2Storage.getFileStream(pdfKey);
        if (fileData?.stream) {
          const chunks = [];
          for await (const chunk of fileData.stream) {
            chunks.push(chunk);
          }
          pdfBuffer = Buffer.concat(chunks);
        }
      } catch (r2Err) {
        console.warn('[AsBuilt:Classify] Failed to load PDF from R2:', r2Err.message);
      }
    }

    if (!pdfBuffer) {
      // Search job folders for a PDF file (likely the job package)
      const allDocs = [];
      for (const folder of job.folders || []) {
        for (const doc of folder.documents || []) {
          if (doc.name?.toLowerCase().endsWith('.pdf') && doc.r2Key) {
            allDocs.push(doc);
          }
        }
        for (const sf of folder.subfolders || []) {
          for (const doc of sf.documents || []) {
            if (doc.name?.toLowerCase().endsWith('.pdf') && doc.r2Key) {
              allDocs.push(doc);
            }
          }
        }
      }

      // Prefer the largest PDF (job packages are typically the biggest file)
      if (allDocs.length > 0) {
        const bestDoc = allDocs.sort((a, b) => (b.size || 0) - (a.size || 0))[0];
        pdfKey = bestDoc.r2Key;
        try {
          const fileData = await r2Storage.getFileStream(pdfKey);
          if (fileData?.stream) {
            const chunks = [];
            for await (const chunk of fileData.stream) {
              chunks.push(chunk);
            }
            pdfBuffer = Buffer.concat(chunks);
          }
        } catch (r2Err) {
          console.warn('[AsBuilt:Classify] Failed to load PDF from R2:', r2Err.message);
        }
      }
    }

    if (!pdfBuffer) {
      return res.status(404).json({ error: 'No job package PDF found. Upload the job package first.' });
    }

    // Load utility config for detection keywords
    const utilityCode = sanitizeString(req.body.utilityCode)?.toUpperCase() || 'PGE';
    const config = await UtilityAsBuiltConfig.findByUtilityCode(utilityCode);
    if (!config?.pageRanges?.length) {
      return res.status(400).json({ error: `No page classification config found for utility: ${utilityCode}` });
    }

    // Run classification
    const classification = await classifyPages(pdfBuffer, config.pageRanges);

    // Save to job
    job.packageClassification = classification;
    job.packageClassifiedAt = new Date();
    if (pdfKey) job.packagePdfKey = pdfKey;
    await job.save();

    // Build summary for response
    const summary = {};
    for (const c of classification) {
      if (!summary[c.sectionType]) {
        summary[c.sectionType] = { pages: [], confidence: c.confidence };
      }
      summary[c.sectionType].pages.push(c.pageIndex);
    }

    res.json({
      success: true,
      totalPages: classification.length,
      classified: classification.filter(c => c.sectionType !== 'other').length,
      unclassified: classification.filter(c => c.sectionType === 'other').length,
      summary,
      classification,
    });
  } catch (err) {
    console.error('[AsBuilt:Classify] Error:', err);
    res.status(500).json({ error: 'Failed to classify job package pages' });
  }
});

/**
 * GET /classify/:jobId
 * Get the stored page classification for a job.
 */
router.get('/classify/:jobId', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const jobId = sanitizeObjectId(req.params.jobId);
    if (!jobId) {
      return res.status(400).json({ error: 'Valid jobId is required' });
    }

    const job = await Job.findOne({ _id: jobId, companyId: user.companyId })
      .select('packageClassification packageClassifiedAt packagePdfKey')
      .lean();

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (!job.packageClassification?.length) {
      return res.status(404).json({ error: 'Job package has not been classified yet' });
    }

    const summary = {};
    for (const c of job.packageClassification) {
      if (!summary[c.sectionType]) {
        summary[c.sectionType] = { pages: [], confidence: c.confidence };
      }
      summary[c.sectionType].pages.push(c.pageIndex);
    }

    res.json({
      classifiedAt: job.packageClassifiedAt,
      pdfKey: job.packagePdfKey,
      totalPages: job.packageClassification.length,
      summary,
      classification: job.packageClassification,
    });
  } catch (err) {
    console.error('[AsBuilt:Classify] Error:', err);
    res.status(500).json({ error: 'Failed to get classification' });
  }
});

// ============================================================================
// AS-BUILT WIZARD SUBMISSION ENDPOINTS
// ============================================================================

const utvacValidator = require('../services/asbuilt/UTVACValidator');
const namingConvention = require('../services/asbuilt/NamingConvention');

/**
 * POST /wizard/validate
 * Pre-flight validation of wizard submission (called from Review step).
 * Returns UTVAC score, errors, and warnings without creating a submission.
 */
router.post('/wizard/validate', async (req, res) => {
  try {
    const { submission } = req.body;
    if (!submission) {
      return res.status(400).json({ error: 'Submission data required' });
    }

    // Load job for context
    let job = null;
    if (submission.jobId) {
      job = await Job.findById(sanitizeObjectId(submission.jobId));
    }

    // Get photos for the job
    const photos = job?.folders
      ?.flatMap(f => f.documents || [])
      ?.filter(d => d.type === 'photo' || d.type === 'image') || [];

    const result = await utvacValidator.validate(submission, { job, photos });

    res.json(result);
  } catch (err) {
    console.error('Error validating submission:', err);
    res.status(500).json({ error: 'Validation failed' });
  }
});

/**
 * POST /wizard/submit
 * Submit a completed as-built package from the wizard.
 * 1. Validates via UTVAC
 * 2. Generates SAP-compliant file names
 * 3. Creates an AsBuiltSubmission record
 * 4. Queues for processing by the AsBuiltRouter
 */
router.post('/wizard/submit', async (req, res) => {
  try {
    const { submission } = req.body;
    if (!submission) {
      return res.status(400).json({ error: 'Submission data required' });
    }

    // Load job
    const job = submission.jobId
      ? await Job.findById(sanitizeObjectId(submission.jobId))
      : null;

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Load utility config for naming conventions
    const config = await UtilityAsBuiltConfig.findByUtilityCode(
      sanitizeString(submission.utilityCode)?.toUpperCase() || 'PGE'
    );

    // ---- Step 1: Validate ----
    const photos = job.folders
      ?.flatMap(f => f.documents || [])
      ?.filter(d => d.type === 'photo' || d.type === 'image') || [];

    const validation = await utvacValidator.validate(submission, { job, photos });

    if (!validation.valid) {
      return res.status(422).json({
        error: 'Submission failed UTVAC validation',
        validation,
      });
    }

    // ---- Step 2: Generate SAP names ----
    const fileNames = config
      ? namingConvention.generatePackageNames(config.namingConventions, {
          pmNumber: job.pmNumber,
          notificationNumber: job.notificationNumber,
        })
      : {};

    // ---- Step 3: Create AsBuiltSubmission ----
    const asBuiltSubmission = new AsBuiltSubmission({
      companyId: job.companyId,
      jobId: job._id,
      pmNumber: job.pmNumber,
      notificationNumber: job.notificationNumber,
      utilityCode: submission.utilityCode || 'PGE',
      workType: submission.workType,
      status: 'uploaded',
      submittedBy: req.userId || submission.submittedBy,
      submittedAt: new Date(),
      wizardData: submission.stepData,
      validationScore: validation.score,
      validationChecks: validation.checks,
      fileNames,
    });

    await asBuiltSubmission.save();

    // ---- Step 4: Save as-built summary to Close Out Documents folder ----
    try {
      const aciFolder = job.folders?.find(f => f.name === 'ACI');
      if (aciFolder) {
        if (!aciFolder.subfolders) aciFolder.subfolders = [];
        let closeOutFolder = aciFolder.subfolders.find(sf => sf.name === 'Close Out Documents');
        if (!closeOutFolder) {
          closeOutFolder = { name: 'Close Out Documents', documents: [], subfolders: [] };
          aciFolder.subfolders.push(closeOutFolder);
        }
        if (!closeOutFolder.documents) closeOutFolder.documents = [];

        const dateStr = new Date().toISOString().split('T')[0];
        const docName = `${job.pmNumber || job.woNumber || 'job'}_AsBuilt_${dateStr}.json`;

        // Remove old version if exists
        const existingIdx = closeOutFolder.documents.findIndex(d =>
          d.name?.includes('AsBuilt') && d.type === 'filled_pdf'
        );
        if (existingIdx !== -1) {
          closeOutFolder.documents.splice(existingIdx, 1);
        }

        // Save reference document pointing to the AsBuiltSubmission
        closeOutFolder.documents.push({
          name: docName.replace('.json', '.html'),
          type: 'other',
          uploadDate: new Date(),
          uploadedBy: req.userId,
          isCompleted: true,
          completedDate: new Date(),
          completedBy: req.userId,
          extractedFrom: `AsBuiltSubmission:${asBuiltSubmission._id}`,
          // URL for viewable HTML summary
          url: `/api/asbuilt/wizard/view/${asBuiltSubmission._id}`,
          path: `/api/asbuilt/wizard/view/${asBuiltSubmission._id}`,
        });

        console.log(`As-built saved to Close Out Documents: ${docName}`);
      }
    } catch (folderErr) {
      console.warn('Failed to save as-built to Close Out folder:', folderErr.message);
    }

    // ---- Step 5: Update job status + log note ----
    job.notes = job.notes || [];
    job.notes.push({
      message: `As-built package submitted via wizard (UTVAC score: ${validation.score}%)`,
      userId: req.userId,
      userName: 'System',
      noteType: 'update',
      createdAt: new Date(),
    });

    // Advance job to pending review if it's still in progress
    const reviewStatuses = ['in_progress', 'pending_gf_review'];
    if (reviewStatuses.includes(job.status)) {
      job.status = 'pending_gf_review';
      job.crewSubmittedDate = new Date();
      job.crewSubmittedBy = req.userId;
    }

    await job.save();

    // ---- Step 6: Queue for AsBuiltRouter processing ----
    // The router will split, classify, and route sections to destinations
    try {
      // AsBuiltRouter is a singleton — call methods directly
      AsBuiltRouter.processSubmission(asBuiltSubmission._id).catch(err => {
        console.error('AsBuiltRouter processing error:', err);
      });
    } catch (routerErr) {
      console.error('Failed to start AsBuiltRouter:', routerErr);
      // Non-fatal — submission is saved, routing can be retried
    }

    res.status(201).json({
      success: true,
      submissionId: asBuiltSubmission._id,
      validation: {
        score: validation.score,
        passedChecks: validation.passedChecks,
        totalChecks: validation.totalChecks,
        warnings: validation.warnings,
      },
      fileNames,
    });
  } catch (err) {
    console.error('Error submitting as-built:', err);
    res.status(500).json({ error: 'Failed to submit as-built package' });
  }
});

/**
 * GET /wizard/status/:submissionId
 * Check the processing status of a submitted as-built package.
 */
router.get('/wizard/status/:submissionId', async (req, res) => {
  try {
    const id = sanitizeObjectId(req.params.submissionId);
    if (!id) {
      return res.status(400).json({ error: 'Invalid submission ID' });
    }

    const submission = await AsBuiltSubmission.findById(id).select(
      'status routingSummary processingStartedAt processingCompletedAt validationScore'
    );

    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    res.json({
      status: submission.status,
      routingSummary: submission.routingSummary,
      validationScore: submission.validationScore,
      processingStartedAt: submission.processingStartedAt,
      processingCompletedAt: submission.processingCompletedAt,
    });
  } catch (err) {
    console.error('Error fetching status:', err);
    res.status(500).json({ error: 'Failed to fetch status' });
  }
});

/**
 * GET /wizard/view/:submissionId
 * Render a human-readable HTML summary of the as-built submission.
 * Used as the viewable document in the Close Out Documents folder.
 */
router.get('/wizard/view/:submissionId', async (req, res) => {
  // Allow this HTML page to be viewed directly or in a frame from the app
  res.removeHeader('X-Frame-Options');
  res.set('Content-Security-Policy', "frame-ancestors 'self' https://app.fieldledger.io https://fieldledger.io https://fieldledger.vercel.app http://localhost:5173");
  
  try {
    const id = sanitizeObjectId(req.params.submissionId);
    if (!id) return res.status(400).send('Invalid submission ID');

    const submission = await AsBuiltSubmission.findById(id);
    if (!submission) return res.status(404).send('Submission not found');

    // Load the job for context
    const job = await Job.findById(submission.jobId).select(
      'pmNumber woNumber notificationNumber address city client jobScope'
    );

    const stepData = submission.wizardData || {};
    const score = submission.validationScore || 0;
    const submittedAt = submission.submittedAt
      ? new Date(submission.submittedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
      : 'Unknown';

    // Build HTML sections from wizard step data
    const sections = [];

    // EC Tag
    if (stepData.ec_tag) {
      const ec = stepData.ec_tag;
      sections.push(`
        <div class="section">
          <h3>EC Tag Completion</h3>
          <table>
            <tr><td><strong>Status</strong></td><td>${ec.completionType || '—'}</td></tr>
            <tr><td><strong>Crew Type</strong></td><td>${ec.crewType || '—'}</td></tr>
            <tr><td><strong>Actual Hours</strong></td><td>${ec.actualHours || '—'}</td></tr>
            <tr><td><strong>LAN ID</strong></td><td>${ec.lanId || '—'}</td></tr>
            <tr><td><strong>Date</strong></td><td>${ec.completionDate || '—'}</td></tr>
          </table>
          ${ec.signatureData ? '<p>✅ Signature captured</p>' : '<p>⚠️ No signature</p>'}
        </div>
      `);
    }

    // Billing Form
    if (stepData.billing_form) {
      const bf = stepData.billing_form;
      sections.push(`
        <div class="section">
          <h3>Billing Completion (Exhibit B)</h3>
          <table>
            <tr><td><strong>Division</strong></td><td>${bf.division || '—'}</td></tr>
            <tr><td><strong>Accessibility</strong></td><td>${bf.accessibility || '—'}</td></tr>
            <tr><td><strong>MAT Code</strong></td><td>${bf.matCode || '—'}</td></tr>
            <tr><td><strong>Tag Type Poles</strong></td><td>${bf.tagTypePoles || '—'}</td></tr>
            <tr><td><strong>Traffic Control</strong></td><td>${bf.trafficControl || '—'}</td></tr>
            <tr><td><strong>Fire Watch</strong></td><td>${bf.fireWatch || '—'}</td></tr>
            <tr><td><strong>ST Crew</strong></td><td>${bf.stCrewHeadcount || '0'} workers, ${bf.stHours || '0'} hrs</td></tr>
            <tr><td><strong>Premium Crew</strong></td><td>${bf.premiumCrewHeadcount || '0'} workers, ${bf.premiumHours || '0'} hrs</td></tr>
          </table>
          ${bf.comments ? `<p><strong>Comments:</strong> ${bf.comments}</p>` : ''}
        </div>
      `);
    }

    // CCSC Checklist
    if (stepData.ccsc) {
      const ccsc = stepData.ccsc;
      const checkedCount = ccsc.checkedItems?.length || 0;
      const totalCount = ccsc.totalItems || checkedCount;
      sections.push(`
        <div class="section">
          <h3>Completion Checklist (CCSC)</h3>
          <p><strong>${checkedCount}/${totalCount}</strong> items checked</p>
          ${ccsc.comments ? `<p><strong>Comments:</strong> ${ccsc.comments}</p>` : ''}
          ${ccsc.signatureData ? '<p>✅ Signature captured</p>' : ''}
        </div>
      `);
    }

    // Sketch
    if (stepData.sketch) {
      const sk = stepData.sketch;
      sections.push(`
        <div class="section">
          <h3>Construction Sketch</h3>
          <p>${sk.builtAsDesigned
            ? '✅ Built As Designed — no redlines needed'
            : `Markup: ${sk.strokeCount || 0} strokes, ${sk.lineCount || 0} lines, ${sk.symbolCount || 0} symbols`
          }</p>
        </div>
      `);
    }

    // FDA Equipment
    if (stepData.fda) {
      sections.push(`
        <div class="section">
          <h3>Equipment Attributes (FDA)</h3>
          <p>Equipment data recorded for Asset Registry</p>
        </div>
      `);
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>As-Built Summary — ${job?.pmNumber || submission.pmNumber || 'Unknown'}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; max-width: 800px; margin: 0 auto; background: #f8f9fa; color: #1a1a1a; }
    h1 { font-size: 1.5rem; margin-bottom: 4px; }
    h2 { font-size: 1rem; color: #666; margin-bottom: 16px; font-weight: 400; }
    h3 { font-size: 1.1rem; margin-bottom: 12px; color: #1565c0; }
    .header { background: #1565c0; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
    .header h1, .header h2 { color: white; }
    .score { display: inline-block; background: ${score >= 80 ? '#2e7d32' : score >= 50 ? '#ed6c02' : '#d32f2f'}; color: white; padding: 4px 12px; border-radius: 20px; font-weight: 700; font-size: 0.9rem; margin-top: 8px; }
    .section { background: white; padding: 16px; border-radius: 8px; margin-bottom: 12px; border: 1px solid #e0e0e0; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 6px 8px; border-bottom: 1px solid #f0f0f0; font-size: 0.9rem; }
    td:first-child { width: 160px; color: #666; }
    .meta { font-size: 0.8rem; color: #999; margin-top: 16px; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <h1>As-Built Package Summary</h1>
    <h2>PM# ${job?.pmNumber || submission.pmNumber || '—'} | ${job?.address || '—'}, ${job?.city || ''}</h2>
    <span class="score">UTVAC Score: ${score}%</span>
  </div>

  <div class="section">
    <h3>Submission Details</h3>
    <table>
      <tr><td><strong>Work Type</strong></td><td>${submission.workType || '—'}</td></tr>
      <tr><td><strong>Notification #</strong></td><td>${job?.notificationNumber || submission.notificationNumber || '—'}</td></tr>
      <tr><td><strong>Client</strong></td><td>${job?.client || '—'}</td></tr>
      <tr><td><strong>Submitted</strong></td><td>${submittedAt}</td></tr>
      <tr><td><strong>Submission ID</strong></td><td>${submission.submissionId || submission._id}</td></tr>
    </table>
  </div>

  ${sections.join('\n')}

  <p class="meta">Generated by FieldLedger As-Built Wizard • ${new Date().toLocaleDateString('en-US')}</p>
</body>
</html>`;

    res.set('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    console.error('Error rendering as-built view:', err);
    res.status(500).send('Failed to load as-built summary');
  }
});

module.exports = router;

