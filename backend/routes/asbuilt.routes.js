const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
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

module.exports = router;

