const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const crypto = require('crypto');

const AsBuiltSubmission = require('../models/AsBuiltSubmission');
const RoutingRule = require('../models/RoutingRule');
const User = require('../models/User');
const Job = require('../models/Job');
const AsBuiltRouter = require('../services/asbuilt/AsBuiltRouter');
const { sanitizeString, sanitizeObjectId, sanitizePmNumber } = require('../utils/sanitize');

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
    
    if (!safeJobId || !safePmNumber || !fileKey) {
      return res.status(400).json({ error: 'Valid jobId, pmNumber, and fileKey are required' });
    }
    
    // Validate job exists and belongs to user's company
    const job = await Job.findOne({ _id: safeJobId, companyId: user.companyId });
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Get utilityId - from request, job, or default to PG&E
    let effectiveUtilityId = safeUtilityId || job.utilityId;
    if (!effectiveUtilityId) {
      // Default to PG&E utility
      const Utility = require('../models/Utility');
      const defaultUtility = await Utility.findOne({ slug: 'pge' });
      effectiveUtilityId = defaultUtility?._id;
    }
    
    // Create hash for original file
    const fileHash = crypto
      .createHash('sha256')
      .update(`${fileKey}-${Date.now()}`)
      .digest('hex');
    
    // Create submission
    const submission = await AsBuiltSubmission.create({
      companyId: user.companyId,
      jobId: safeJobId,
      utilityId: effectiveUtilityId,
      pmNumber: safePmNumber,
      jobNumber: job.jobNumber,
      workOrderNumber: job.workOrderNumber,
      circuitId: job.circuitId,
      originalFile: {
        key: fileKey,
        filename: filename || `${pmNumber}_asbuilt.pdf`,
        hash: fileHash,
        pageCount: pageCount || 40,
        uploadedAt: new Date()
      },
      submittedBy: user._id,
      status: 'uploaded'
    });
    
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
    if (status) query.status = status;
    if (jobId) query.jobId = jobId;
    
    const submissions = await AsBuiltSubmission.find(query)
      .sort({ submittedAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .populate('jobId', 'pmNumber title')
      .populate('submittedBy', 'name email')
      .select('-sections -auditLog');
    
    const total = await AsBuiltSubmission.countDocuments(query);
    
    res.json({
      submissions,
      total,
      limit: parseInt(limit),
      skip: parseInt(skip)
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
    startDate.setDate(startDate.getDate() - parseInt(days));
    
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
    if (utilityId) query.utilityId = utilityId;
    if (sectionType) query.sectionType = sectionType;
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
    
    const { name, utilityId, sectionType, destination, ...rest } = req.body;
    
    if (!name || !utilityId || !sectionType || !destination) {
      return res.status(400).json({ error: 'name, utilityId, sectionType, and destination are required' });
    }
    
    const rule = await RoutingRule.create({
      name,
      utilityId,
      companyId: user.companyId,
      sectionType,
      destination,
      ...rest,
      createdBy: user._id
    });
    
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

