/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Oracle Integration Routes
 * 
 * API endpoints for Oracle Cloud integrations:
 * - Primavera Unifier
 * - Enterprise Asset Management (EAM)
 * - Primavera P6
 * 
 * All endpoints require authentication.
 */

const express = require('express');
const router = express.Router();
const log = require('../utils/logger');
const { oracleService } = require('../services/oracle');
const Claim = require('../models/Claim');

/**
 * @swagger
 * tags:
 *   name: Oracle
 *   description: Oracle Cloud integration endpoints
 */

/**
 * @swagger
 * /api/oracle/status:
 *   get:
 *     summary: Get Oracle integration status
 *     tags: [Oracle]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Status of all Oracle integrations
 */
router.get('/status', async (req, res) => {
  try {
    const status = oracleService.getStatus();
    
    // Generate warnings for unconfigured integrations
    const warnings = [];
    if (!status.unifier.configured) warnings.push('Unifier: Using mock responses');
    if (!status.eam.configured) warnings.push('EAM: Using mock responses');
    if (!status.p6.configured) warnings.push('P6: Using mock responses');
    
    res.json({
      success: true,
      integrations: status,
      configuredCount: Object.values(status).filter(s => s.configured).length,
      totalCount: Object.keys(status).length,
      warnings,
      mockMode: warnings.length > 0
    });
  } catch (error) {
    log.error({ err: error }, 'Oracle status error');
    res.status(500).json({ error: error.message, code: 'STATUS_ERROR' });
  }
});

/**
 * @swagger
 * /api/oracle/test/{system}:
 *   post:
 *     summary: Test connection to an Oracle system
 *     tags: [Oracle]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: system
 *         required: true
 *         schema:
 *           type: string
 *           enum: [unifier, eam, p6]
 *     responses:
 *       200:
 *         description: Connection test result
 */
router.post('/test/:system', async (req, res) => {
  try {
    const { system } = req.params;
    const result = await oracleService.testConnection(system);
    
    res.json({
      system,
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    log.error({ err: error }, 'Oracle test connection error');
    res.status(500).json({ error: error.message, code: 'CONNECTION_TEST_ERROR' });
  }
});

// ============================================
// PRIMAVERA UNIFIER ENDPOINTS
// ============================================

/**
 * @swagger
 * /api/oracle/unifier/upload:
 *   post:
 *     summary: Upload document to Primavera Unifier
 *     tags: [Oracle]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - projectNumber
 *               - fileName
 *             properties:
 *               projectNumber:
 *                 type: string
 *               folderPath:
 *                 type: string
 *                 default: /As-Builts
 *               fileName:
 *                 type: string
 *               fileContent:
 *                 type: string
 *                 description: Base64 encoded file content
 *     responses:
 *       200:
 *         description: Upload result
 */
router.post('/unifier/upload', async (req, res) => {
  try {
    const { projectNumber, folderPath, fileName, fileContent, metadata } = req.body;
    
    if (!projectNumber || !fileName) {
      return res.status(400).json({ error: 'projectNumber and fileName are required' });
    }
    
    const result = await oracleService.unifier.uploadDocument({
      projectNumber,
      folderPath: folderPath || '/As-Builts',
      fileName,
      fileContent,
      metadata
    });
    
    res.json(result);
  } catch (error) {
    log.error({ err: error }, 'Unifier upload error');
    res.status(500).json({ error: error.message, code: 'UNIFIER_UPLOAD_ERROR' });
  }
});

/**
 * @swagger
 * /api/oracle/unifier/bp-record:
 *   post:
 *     summary: Create business process record in Unifier
 *     tags: [Oracle]
 *     security:
 *       - bearerAuth: []
 */
router.post('/unifier/bp-record', async (req, res) => {
  try {
    const { projectNumber, bpName, recordData } = req.body;
    
    if (!projectNumber || !bpName) {
      return res.status(400).json({ error: 'projectNumber and bpName are required' });
    }
    
    const result = await oracleService.unifier.createBPRecord({
      projectNumber,
      bpName,
      recordData
    });
    
    res.json(result);
  } catch (error) {
    log.error({ err: error }, 'Unifier BP record error');
    res.status(500).json({ error: error.message, code: 'UNIFIER_BP_ERROR' });
  }
});

/**
 * @swagger
 * /api/oracle/unifier/submit-package:
 *   post:
 *     summary: Submit complete as-built package to Unifier
 *     tags: [Oracle]
 *     security:
 *       - bearerAuth: []
 */
router.post('/unifier/submit-package', async (req, res) => {
  try {
    const submission = req.body;
    
    if (!submission.pmNumber) {
      return res.status(400).json({ error: 'pmNumber is required' });
    }
    
    const result = await oracleService.unifier.submitAsBuiltPackage(submission);
    res.json(result);
  } catch (error) {
    log.error({ err: error }, 'Unifier package submission error');
    res.status(500).json({ error: error.message, code: 'UNIFIER_PACKAGE_ERROR' });
  }
});

// ============================================
// EAM ENDPOINTS
// ============================================

/**
 * @swagger
 * /api/oracle/eam/work-order/complete:
 *   post:
 *     summary: Complete a work order in Oracle EAM
 *     tags: [Oracle]
 *     security:
 *       - bearerAuth: []
 */
router.post('/eam/work-order/complete', async (req, res) => {
  try {
    const { workOrderNumber, completionDate, completionData } = req.body;
    
    if (!workOrderNumber) {
      return res.status(400).json({ error: 'workOrderNumber is required' });
    }
    
    const result = await oracleService.eam.completeWorkOrder({
      workOrderNumber,
      completionDate: completionDate || new Date().toISOString(),
      completionData
    });
    
    res.json(result);
  } catch (error) {
    log.error({ err: error }, 'EAM work order error');
    res.status(500).json({ error: error.message, code: 'EAM_WORK_ORDER_ERROR' });
  }
});

/**
 * @swagger
 * /api/oracle/eam/asset:
 *   post:
 *     summary: Create or update asset in Oracle EAM
 *     tags: [Oracle]
 *     security:
 *       - bearerAuth: []
 */
router.post('/eam/asset', async (req, res) => {
  try {
    const { assetNumber, assetType, assetData, action } = req.body;
    
    if (!assetType || !assetData) {
      return res.status(400).json({ error: 'assetType and assetData are required' });
    }
    
    let result;
    if (action === 'create') {
      result = await oracleService.eam.createAsset({ assetType, assetData });
    } else {
      if (!assetNumber) {
        return res.status(400).json({ error: 'assetNumber is required for update' });
      }
      result = await oracleService.eam.updateAsset({ assetNumber, assetType, assetData });
    }
    
    res.json(result);
  } catch (error) {
    log.error({ err: error }, 'EAM asset error');
    res.status(500).json({ error: error.message, code: 'EAM_ASSET_ERROR' });
  }
});

/**
 * @swagger
 * /api/oracle/eam/process-asbuilt:
 *   post:
 *     summary: Process as-built for EAM (work order + assets)
 *     tags: [Oracle]
 *     security:
 *       - bearerAuth: []
 */
router.post('/eam/process-asbuilt', async (req, res) => {
  try {
    const submission = req.body;
    
    if (!submission.pmNumber) {
      return res.status(400).json({ error: 'pmNumber is required' });
    }
    
    const result = await oracleService.eam.processAsBuilt(submission);
    res.json(result);
  } catch (error) {
    log.error({ err: error }, 'EAM process as-built error');
    res.status(500).json({ error: error.message, code: 'EAM_ASBUILT_ERROR' });
  }
});

// ============================================
// P6 ENDPOINTS
// ============================================

/**
 * @swagger
 * /api/oracle/p6/project/{projectCode}:
 *   get:
 *     summary: Get P6 project details
 *     tags: [Oracle]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectCode
 *         required: true
 *         schema:
 *           type: string
 */
router.get('/p6/project/:projectCode', async (req, res) => {
  try {
    const { projectCode } = req.params;
    const project = await oracleService.p6.getProject(projectCode);
    res.json(project);
  } catch (error) {
    log.error({ err: error }, 'P6 get project error');
    res.status(500).json({ error: error.message, code: 'P6_PROJECT_ERROR' });
  }
});

/**
 * @swagger
 * /api/oracle/p6/project/{projectCode}/activities:
 *   get:
 *     summary: Get P6 project activities
 *     tags: [Oracle]
 *     security:
 *       - bearerAuth: []
 */
router.get('/p6/project/:projectCode/activities', async (req, res) => {
  try {
    const { projectCode } = req.params;
    const activities = await oracleService.p6.getActivities(projectCode);
    res.json(activities);
  } catch (error) {
    log.error({ err: error }, 'P6 get activities error');
    res.status(500).json({ error: error.message, code: 'P6_ACTIVITIES_ERROR' });
  }
});

/**
 * @swagger
 * /api/oracle/p6/activity/progress:
 *   post:
 *     summary: Update P6 activity progress
 *     tags: [Oracle]
 *     security:
 *       - bearerAuth: []
 */
router.post('/p6/activity/progress', async (req, res) => {
  try {
    const { projectCode, activityCode, percentComplete, actualStartDate, actualFinishDate, customFields } = req.body;
    
    if (!projectCode || !activityCode) {
      return res.status(400).json({ error: 'projectCode and activityCode are required' });
    }
    
    const result = await oracleService.p6.updateActivityProgress({
      projectCode,
      activityCode,
      percentComplete,
      actualStartDate,
      actualFinishDate,
      customFields
    });
    
    res.json(result);
  } catch (error) {
    log.error({ err: error }, 'P6 update progress error');
    res.status(500).json({ error: error.message, code: 'P6_PROGRESS_ERROR' });
  }
});

/**
 * @swagger
 * /api/oracle/p6/activity/complete:
 *   post:
 *     summary: Complete a P6 activity
 *     tags: [Oracle]
 *     security:
 *       - bearerAuth: []
 */
router.post('/p6/activity/complete', async (req, res) => {
  try {
    const { projectCode, activityCode, completionDate } = req.body;
    
    if (!projectCode || !activityCode) {
      return res.status(400).json({ error: 'projectCode and activityCode are required' });
    }
    
    const result = await oracleService.p6.completeActivity(projectCode, activityCode, completionDate);
    res.json(result);
  } catch (error) {
    log.error({ err: error }, 'P6 complete activity error');
    res.status(500).json({ error: error.message, code: 'P6_COMPLETE_ERROR' });
  }
});

/**
 * @swagger
 * /api/oracle/p6/process-asbuilt:
 *   post:
 *     summary: Process as-built completion for P6
 *     tags: [Oracle]
 *     security:
 *       - bearerAuth: []
 */
router.post('/p6/process-asbuilt', async (req, res) => {
  try {
    const submission = req.body;
    
    if (!submission.pmNumber) {
      return res.status(400).json({ error: 'pmNumber is required' });
    }
    
    const result = await oracleService.p6.processAsBuiltCompletion(submission);
    res.json(result);
  } catch (error) {
    log.error({ err: error }, 'P6 process as-built error');
    res.status(500).json({ error: error.message, code: 'P6_ASBUILT_ERROR' });
  }
});

// ============================================
// FBDI VALIDATION
// ============================================

/**
 * @swagger
 * /api/oracle/validate-export:
 *   post:
 *     summary: Validate a claim has all required FBDI fields before export
 *     tags: [Oracle]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - claimId
 *             properties:
 *               claimId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Validation result
 */
router.post('/validate-export', async (req, res) => {
  try {
    const { claimId } = req.body;
    
    if (!claimId) {
      return res.status(400).json({ error: 'claimId is required', code: 'MISSING_CLAIM_ID' });
    }
    
    const claim = await Claim.findById(claimId).lean();
    if (!claim) {
      return res.status(404).json({ error: 'Claim not found', code: 'CLAIM_NOT_FOUND' });
    }
    
    const errors = [];
    
    // Validate required header fields
    if (!claim.oracle?.vendorId && !claim.oracle?.vendorName) {
      errors.push({ field: 'oracle.vendorId', message: 'Vendor ID or vendor name is required' });
    }
    if (!claim.oracle?.businessUnit) {
      errors.push({ field: 'oracle.businessUnit', message: 'Business unit is required' });
    }
    if (!claim.amountDue && claim.amountDue !== 0) {
      errors.push({ field: 'amountDue', message: 'Invoice amount (amountDue) is required' });
    }
    if (!claim.oracle?.paymentTerms) {
      errors.push({ field: 'oracle.paymentTerms', message: 'Payment terms are required' });
    }
    if (!claim.claimNumber) {
      errors.push({ field: 'claimNumber', message: 'Claim number is required for invoice number' });
    }
    
    // Validate line items exist
    if (!claim.lineItems || claim.lineItems.length === 0) {
      errors.push({ field: 'lineItems', message: 'At least one line item is required' });
    } else {
      // Validate each line item
      const units = new Set();
      for (let i = 0; i < claim.lineItems.length; i++) {
        const line = claim.lineItems[i];
        if (!line.itemCode) {
          errors.push({ field: `lineItems[${i}].itemCode`, message: `Line ${i + 1}: item code is required` });
        }
        if (line.quantity === undefined || line.quantity === null) {
          errors.push({ field: `lineItems[${i}].quantity`, message: `Line ${i + 1}: quantity is required` });
        }
        if (line.unitPrice === undefined || line.unitPrice === null) {
          errors.push({ field: `lineItems[${i}].unitPrice`, message: `Line ${i + 1}: unit price is required` });
        }
        if (!line.unit) {
          errors.push({ field: `lineItems[${i}].unit`, message: `Line ${i + 1}: unit of measure is required` });
        }
        if (line.unit) {
          units.add(line.unit);
        }
        if (!line.description) {
          errors.push({ field: `lineItems[${i}].description`, message: `Line ${i + 1}: description is required` });
        }
      }
      
      // Warn about inconsistent units (different is valid, just informational)
      if (units.size > 3) {
        errors.push({ field: 'lineItems.unit', message: `${units.size} different units of measure found — verify consistency` });
      }
    }
    
    // Validate GL date
    if (!claim.oracle?.glDate && !claim.submittedAt && !claim.createdAt) {
      errors.push({ field: 'oracle.glDate', message: 'GL date is required (will default from submission date)' });
    }
    
    log.info({ claimId, valid: errors.length === 0, errorCount: errors.length }, 'FBDI export validation');
    
    res.json({
      valid: errors.length === 0,
      claimId,
      claimNumber: claim.claimNumber,
      errors,
    });
  } catch (error) {
    log.error({ err: error }, 'FBDI validation error');
    res.status(500).json({ error: error.message, code: 'VALIDATION_ERROR' });
  }
});

// ============================================
// ORACLE HEALTH
// ============================================

/**
 * @swagger
 * /api/oracle/health:
 *   get:
 *     summary: Health check for all Oracle integrations
 *     tags: [Oracle]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Health status of all Oracle adapters
 */
router.get('/health', async (req, res) => {
  try {
    const test = async (name, adapter) => {
      const start = Date.now();
      try {
        if (!adapter.isConfigured()) {
          return { status: 'unconfigured', latencyMs: 0 };
        }
        await adapter.authenticate();
        return { status: 'healthy', latencyMs: Date.now() - start };
      } catch (error) {
        return { status: 'unhealthy', latencyMs: Date.now() - start, error: error.message };
      }
    };
    
    const [unifier, eam, p6] = await Promise.allSettled([
      test('unifier', oracleService.unifier),
      test('eam', oracleService.eam),
      test('p6', oracleService.p6),
    ]);
    
    const result = {
      unifier: unifier.status === 'fulfilled' ? unifier.value : { status: 'error', error: unifier.reason?.message },
      eam: eam.status === 'fulfilled' ? eam.value : { status: 'error', error: eam.reason?.message },
      p6: p6.status === 'fulfilled' ? p6.value : { status: 'error', error: p6.reason?.message },
    };
    
    log.info({ health: result }, 'Oracle health check');
    
    res.json(result);
  } catch (error) {
    log.error({ err: error }, 'Oracle health check error');
    res.status(500).json({ error: error.message, code: 'HEALTH_CHECK_ERROR' });
  }
});

// ============================================
// UNIFIED ORACLE PUSH
// ============================================

/**
 * @swagger
 * /api/oracle/push-all:
 *   post:
 *     summary: Push as-built to all configured Oracle systems
 *     tags: [Oracle]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - pmNumber
 *             properties:
 *               pmNumber:
 *                 type: string
 *               sections:
 *                 type: array
 *               pushToUnifier:
 *                 type: boolean
 *                 default: true
 *               pushToEAM:
 *                 type: boolean
 *                 default: true
 *               pushToP6:
 *                 type: boolean
 *                 default: true
 */
router.post('/push-all', async (req, res) => {
  try {
    const { pushToUnifier, pushToEAM, pushToP6, ...submission } = req.body;
    
    if (!submission.pmNumber) {
      return res.status(400).json({ error: 'pmNumber is required' });
    }
    
    const result = await oracleService.submitToOracle(submission, {
      pushToUnifier: pushToUnifier !== false,
      pushToEAM: pushToEAM !== false,
      pushToP6: pushToP6 !== false
    });
    
    log.info({ pmNumber: submission.pmNumber, success: result.success, allSuccess: result.allSuccess }, 'Push-all completed');
    
    res.json(result);
  } catch (error) {
    log.error({ err: error }, 'Push-all error');
    res.status(500).json({ error: error.message, code: 'PUSH_ALL_ERROR' });
  }
});

module.exports = router;

