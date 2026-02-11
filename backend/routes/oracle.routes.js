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
const { oracleService } = require('../services/oracle');

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
    console.error('[Oracle Routes] Status error:', error);
    res.status(500).json({ error: error.message });
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
    console.error('[Oracle Routes] Test connection error:', error);
    res.status(500).json({ error: error.message });
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
    console.error('[Oracle Routes] Unifier upload error:', error);
    res.status(500).json({ error: error.message });
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
    console.error('[Oracle Routes] Unifier BP record error:', error);
    res.status(500).json({ error: error.message });
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
    console.error('[Oracle Routes] Unifier package submission error:', error);
    res.status(500).json({ error: error.message });
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
    console.error('[Oracle Routes] EAM work order error:', error);
    res.status(500).json({ error: error.message });
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
    console.error('[Oracle Routes] EAM asset error:', error);
    res.status(500).json({ error: error.message });
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
    console.error('[Oracle Routes] EAM process as-built error:', error);
    res.status(500).json({ error: error.message });
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
    console.error('[Oracle Routes] P6 get project error:', error);
    res.status(500).json({ error: error.message });
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
    console.error('[Oracle Routes] P6 get activities error:', error);
    res.status(500).json({ error: error.message });
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
    console.error('[Oracle Routes] P6 update progress error:', error);
    res.status(500).json({ error: error.message });
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
    console.error('[Oracle Routes] P6 complete activity error:', error);
    res.status(500).json({ error: error.message });
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
    console.error('[Oracle Routes] P6 process as-built error:', error);
    res.status(500).json({ error: error.message });
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
    
    // Log the operation
    console.log(`[Oracle Routes] Push-all for ${submission.pmNumber}:`, {
      success: result.success,
      allSuccess: result.allSuccess,
      systemsAttempted: Object.keys(result.systems).length
    });
    
    res.json(result);
  } catch (error) {
    console.error('[Oracle Routes] Push-all error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

