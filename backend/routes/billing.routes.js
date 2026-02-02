/**
 * FieldLedger - Billing Routes
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Endpoints for unit-price billing:
 * - Unit entries (the "Digital Receipt")
 * - Claims/invoices
 * - Oracle Payables export
 * 
 * @swagger
 * tags:
 *   - name: Units
 *     description: Unit entry management for field work verification
 *   - name: Claims
 *     description: Invoice/claim generation and Oracle export
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const UnitEntry = require('../models/UnitEntry');
const Claim = require('../models/Claim');
const PriceBook = require('../models/PriceBook');
const Job = require('../models/Job');
const User = require('../models/User');
const { sanitizeString, sanitizeObjectId, sanitizeInt, sanitizeDate } = require('../utils/sanitize');

// ============================================================================
// UNIT ENTRIES - The "Digital Receipt"
// ============================================================================

/**
 * @swagger
 * /api/billing/units:
 *   get:
 *     summary: List unit entries for company
 *     tags: [Units]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: jobId
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, submitted, verified, disputed, approved, invoiced, paid]
 *       - in: query
 *         name: workCategory
 *         schema:
 *           type: string
 *           enum: [electrical, civil, traffic_control, vegetation, inspection, other]
 *       - in: query
 *         name: tier
 *         schema:
 *           type: string
 *           enum: [prime, sub, sub_of_sub]
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: List of unit entries
 */
router.get('/units', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    console.log('[Units] User:', user?.email, 'Role:', user?.role, 'CompanyId:', user?.companyId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const { jobId, status, workCategory, tier, startDate, endDate, limit = 100 } = req.query;
    
    // Sanitize all query parameters to prevent NoSQL injection
    const safeJobId = sanitizeObjectId(jobId);
    const safeStatus = sanitizeString(status);
    const safeWorkCategory = sanitizeString(workCategory);
    const safeTier = sanitizeString(tier);
    const safeStartDate = sanitizeDate(startDate);
    const safeEndDate = sanitizeDate(endDate);
    const safeLimit = sanitizeInt(limit, 100, 500);
    
    const query = { 
      companyId: user.companyId,
      isDeleted: { $ne: true }
    };

    if (safeJobId) {
      query.jobId = safeJobId;
    }
    if (safeStatus) query.status = safeStatus;
    if (safeWorkCategory) query['performedBy.workCategory'] = safeWorkCategory;
    if (safeTier) query['performedBy.tier'] = safeTier;
    
    if (safeStartDate || safeEndDate) {
      query.workDate = {};
      if (safeStartDate) query.workDate.$gte = safeStartDate;
      if (safeEndDate) query.workDate.$lte = safeEndDate;
    }

    // Role-based filtering
    // Foreman only sees their own entries
    // GF, QA, PM, Admin see all company units for review
    if (user.role === 'foreman') {
      query.enteredBy = user._id;
    }
    // GF, QA, PM, and Admin can see all units in their company (no additional filter)

    console.log('[Units] Query:', JSON.stringify(query));
    const units = await UnitEntry.find(query)
      .populate('enteredBy', 'name email')
      .populate('verifiedBy', 'name')
      .sort({ workDate: -1, createdAt: -1 })
      .limit(safeLimit);

    console.log('[Units] Found:', units.length, 'units');
    res.json(units);
  } catch (err) {
    console.error('Error listing units:', err);
    res.status(500).json({ error: 'Failed to list unit entries' });
  }
});

/**
 * @swagger
 * /api/billing/units/unbilled:
 *   get:
 *     summary: Get approved units not yet on a claim
 *     tags: [Units]
 *     security:
 *       - bearerAuth: []
 */
router.get('/units/unbilled', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const units = await UnitEntry.getUnbilledByCompany(user.companyId);
    
    // Group by job for easier claim building
    const groupedByJob = {};
    for (const unit of units) {
      const jobId = unit.jobId.toString();
      if (!groupedByJob[jobId]) {
        groupedByJob[jobId] = { 
          jobId, 
          units: [], 
          totalAmount: 0 
        };
      }
      groupedByJob[jobId].units.push(unit);
      groupedByJob[jobId].totalAmount += unit.totalAmount;
    }

    res.json({
      totalUnits: units.length,
      totalAmount: units.reduce((sum, u) => sum + u.totalAmount, 0),
      byJob: Object.values(groupedByJob)
    });
  } catch (err) {
    console.error('Error getting unbilled units:', err);
    res.status(500).json({ error: 'Failed to get unbilled units' });
  }
});

/**
 * @swagger
 * /api/billing/units/disputed:
 *   get:
 *     summary: Get disputed units needing resolution
 *     tags: [Units]
 *     security:
 *       - bearerAuth: []
 */
router.get('/units/disputed', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const units = await UnitEntry.getDisputed(user.companyId);
    res.json(units);
  } catch (err) {
    console.error('Error getting disputed units:', err);
    res.status(500).json({ error: 'Failed to get disputed units' });
  }
});

/**
 * @swagger
 * /api/billing/units/{id}:
 *   get:
 *     summary: Get unit entry by ID
 *     tags: [Units]
 *     security:
 *       - bearerAuth: []
 */
router.get('/units/:id', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const unitId = sanitizeObjectId(req.params.id);
    if (!unitId) {
      return res.status(400).json({ error: 'Invalid unit entry ID' });
    }

    const unit = await UnitEntry.findOne({
      _id: unitId,
      companyId: user.companyId,
      isDeleted: { $ne: true }
    })
      .populate('enteredBy', 'name email')
      .populate('verifiedBy', 'name')
      .populate('approvedBy', 'name');

    if (!unit) {
      return res.status(404).json({ error: 'Unit entry not found' });
    }

    res.json(unit);
  } catch (err) {
    console.error('Error getting unit:', err);
    res.status(500).json({ error: 'Failed to get unit entry' });
  }
});

/**
 * @swagger
 * /api/billing/units:
 *   post:
 *     summary: Create unit entry (Digital Receipt)
 *     description: Creates a unit entry with GPS-verified photo(s). Rate is locked at time of creation.
 *     tags: [Units]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - jobId
 *               - priceBookItemId
 *               - quantity
 *               - workDate
 *               - location
 *               - performedBy
 *               - photos
 *     responses:
 *       201:
 *         description: Unit entry created
 */
router.post('/units', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const {
      jobId: rawJobId, priceBookId: rawPriceBookId, priceBookItemId: rawPriceBookItemId, itemCode,
      quantity, workDate, location, performedBy, photos,
      notes, fieldConditions, photoWaived, photoWaivedReason,
      offlineId
    } = req.body;

    // Sanitize ObjectIds from user input
    const jobId = sanitizeObjectId(rawJobId);
    const priceBookId = sanitizeObjectId(rawPriceBookId);
    const priceBookItemId = sanitizeObjectId(rawPriceBookItemId);

    // Validate required fields
    if (!jobId || !quantity || !workDate || !location || !performedBy) {
      return res.status(400).json({ error: 'Missing required fields: jobId, quantity, workDate, location, performedBy' });
    }

    // Validate job exists and user has access
    const job = await Job.findOne({ 
      _id: jobId, 
      companyId: user.companyId,
      isDeleted: { $ne: true }
    });
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Validate photos (at least 1 required unless waived)
    if (!photoWaived && (!photos || photos.length === 0)) {
      return res.status(400).json({ error: 'At least one photo is required for unit verification' });
    }

    // Get rate from price book (lock at creation time)
    let rateItem;
    let priceBookRef;
    
    if (priceBookItemId && priceBookId) {
      const priceBook = await PriceBook.findById(priceBookId);
      if (priceBook) {
        rateItem = priceBook.items.id(priceBookItemId);
        priceBookRef = priceBook._id;
      }
    } else if (itemCode && job.utilityId) {
      // Lookup by item code in active price book
      rateItem = await PriceBook.findItemByCode(user.companyId, job.utilityId, itemCode);
      if (rateItem) {
        const activePriceBook = await PriceBook.getActive(user.companyId, job.utilityId);
        priceBookRef = activePriceBook?._id;
      }
    }

    if (!rateItem) {
      return res.status(400).json({ error: 'Rate item not found in price book' });
    }

    // Create unit entry with locked rate
    const unitEntry = await UnitEntry.create({
      jobId,
      companyId: user.companyId,
      priceBookId: priceBookRef,
      priceBookItemId: rateItem._id,
      
      // Snapshot from price book (locked rate)
      itemCode: rateItem.itemCode,
      description: rateItem.description,
      category: rateItem.category,
      subcategory: rateItem.subcategory,
      
      // Quantity and pricing
      quantity,
      unit: rateItem.unit,
      unitPrice: rateItem.unitPrice, // LOCKED at entry time
      totalAmount: quantity * rateItem.unitPrice,
      
      // Digital receipt data
      workDate: new Date(workDate),
      location,
      photos: photos || [],
      photoWaived: photoWaived || false,
      photoWaivedReason,
      photoWaivedBy: photoWaived ? user._id : undefined,
      
      // Who performed the work
      performedBy: {
        ...performedBy,
        foremanId: performedBy.foremanId || user._id,
        foremanName: performedBy.foremanName || user.name
      },
      
      // Entry metadata
      enteredBy: user._id,
      enteredAt: new Date(),
      status: 'draft',
      
      // Notes
      notes,
      fieldConditions,
      
      // Offline sync
      offlineId,
      syncStatus: offlineId ? 'pending' : 'synced',  // 'pending' if from offline, 'synced' if direct
      syncedAt: offlineId ? undefined : new Date()   // Only set syncedAt if directly created (not offline)
    });

    // Auto-submit the unit if it has required evidence (photo or waiver + GPS)
    const hasRequiredEvidence = (photos && photos.length > 0) || photoWaived;
    const hasValidGPS = location?.latitude && location?.longitude && location?.accuracy <= 100;
    
    if (hasRequiredEvidence && hasValidGPS) {
      await unitEntry.submit(user._id);
    }

    res.status(201).json(unitEntry);
  } catch (err) {
    console.error('Error creating unit entry:', err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to create unit entry' });
  }
});

/**
 * @swagger
 * /api/billing/units/{id}/submit:
 *   post:
 *     summary: Submit unit for review
 *     tags: [Units]
 *     security:
 *       - bearerAuth: []
 */
router.post('/units/:id/submit', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const unitId = sanitizeObjectId(req.params.id);
    if (!unitId) {
      return res.status(400).json({ error: 'Invalid unit ID' });
    }

    const unit = await UnitEntry.findOne({
      _id: unitId,
      companyId: user.companyId,
      isDeleted: { $ne: true }
    });

    if (!unit) {
      return res.status(404).json({ error: 'Unit entry not found' });
    }

    if (unit.status !== 'draft') {
      return res.status(400).json({ error: 'Only draft units can be submitted' });
    }

    await unit.submit(user._id);
    res.json(unit);
  } catch (err) {
    console.error('Error submitting unit:', err);
    res.status(500).json({ error: 'Failed to submit unit' });
  }
});

/**
 * @swagger
 * /api/billing/units/{id}/verify:
 *   post:
 *     summary: Verify unit entry (GF/QA action)
 *     tags: [Units]
 *     security:
 *       - bearerAuth: []
 */
router.post('/units/:id/verify', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const unitId = sanitizeObjectId(req.params.id);
    if (!unitId) {
      return res.status(400).json({ error: 'Invalid unit ID' });
    }

    // Only GF, QA, PM, or admin can verify
    if (!['gf', 'qa', 'pm', 'admin'].includes(user.role) && !req.isAdmin) {
      return res.status(403).json({ error: 'Only GF, QA, PM, or admin can verify units' });
    }

    const unit = await UnitEntry.findOne({
      _id: unitId,
      companyId: user.companyId,
      isDeleted: { $ne: true }
    });

    if (!unit) {
      return res.status(404).json({ error: 'Unit entry not found' });
    }

    if (unit.status !== 'submitted') {
      return res.status(400).json({ error: 'Only submitted units can be verified' });
    }

    const { notes } = req.body;
    await unit.verify(user._id, notes);
    res.json(unit);
  } catch (err) {
    console.error('Error verifying unit:', err);
    res.status(500).json({ error: 'Failed to verify unit' });
  }
});

/**
 * @swagger
 * /api/billing/units/{id}/approve:
 *   post:
 *     summary: Approve unit for billing (PM action)
 *     tags: [Units]
 *     security:
 *       - bearerAuth: []
 */
router.post('/units/:id/approve', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const unitId = sanitizeObjectId(req.params.id);
    if (!unitId) {
      return res.status(400).json({ error: 'Invalid unit ID' });
    }

    // Only PM or admin can approve for billing
    if (!['pm', 'admin'].includes(user.role) && !req.isAdmin) {
      return res.status(403).json({ error: 'Only PM or admin can approve units for billing' });
    }

    const unit = await UnitEntry.findOne({
      _id: unitId,
      companyId: user.companyId,
      isDeleted: { $ne: true }
    });

    if (!unit) {
      return res.status(404).json({ error: 'Unit entry not found' });
    }

    if (unit.status !== 'verified') {
      return res.status(400).json({ error: 'Only verified units can be approved' });
    }

    const { notes } = req.body;
    await unit.approve(user._id, notes);
    res.json(unit);
  } catch (err) {
    console.error('Error approving unit:', err);
    res.status(500).json({ error: 'Failed to approve unit' });
  }
});

/**
 * @swagger
 * /api/billing/units/{id}/dispute:
 *   post:
 *     summary: Dispute a unit entry
 *     tags: [Units]
 *     security:
 *       - bearerAuth: []
 */
router.post('/units/:id/dispute', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const unitId = sanitizeObjectId(req.params.id);
    if (!unitId) {
      return res.status(400).json({ error: 'Invalid unit ID' });
    }

    const unit = await UnitEntry.findOne({
      _id: unitId,
      companyId: user.companyId,
      isDeleted: { $ne: true }
    });

    if (!unit) {
      return res.status(404).json({ error: 'Unit entry not found' });
    }

    const { reason, category } = req.body;
    if (!reason) {
      return res.status(400).json({ error: 'Dispute reason is required' });
    }

    await unit.dispute(user._id, reason, category || 'other');
    res.json(unit);
  } catch (err) {
    console.error('Error disputing unit:', err);
    res.status(500).json({ error: 'Failed to dispute unit' });
  }
});

/**
 * @swagger
 * /api/billing/units/{id}/resolve-dispute:
 *   post:
 *     summary: Resolve a dispute on a unit entry
 *     description: PM/GF can resolve disputes by accepting, adjusting, or voiding the unit
 *     tags: [Units]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: Unit ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - resolution
 *               - action
 *             properties:
 *               resolution:
 *                 type: string
 *                 description: Explanation of how the dispute was resolved
 *               action:
 *                 type: string
 *                 enum: [accept, adjust, void, resubmit]
 *                 description: Action taken to resolve dispute
 *               adjustedQuantity:
 *                 type: number
 *                 description: New quantity if action is 'adjust'
 *               adjustedReason:
 *                 type: string
 *                 description: Reason for adjustment
 */
router.post('/units/:id/resolve-dispute', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const unitId = sanitizeObjectId(req.params.id);
    if (!unitId) {
      return res.status(400).json({ error: 'Invalid unit ID' });
    }

    // Only PM/GF/admin can resolve disputes
    if (!['pm', 'gf', 'admin'].includes(user.role) && !user.isAdmin) {
      return res.status(403).json({ error: 'Not authorized to resolve disputes' });
    }

    const unit = await UnitEntry.findOne({
      _id: unitId,
      companyId: user.companyId,
      isDisputed: true,
      isDeleted: { $ne: true }
    });

    if (!unit) {
      return res.status(404).json({ error: 'Disputed unit entry not found' });
    }

    const { resolution, action, adjustedQuantity, adjustedReason } = req.body;
    
    if (!resolution) {
      return res.status(400).json({ error: 'Resolution explanation is required' });
    }
    
    if (!action || !['accept', 'adjust', 'void', 'resubmit'].includes(action)) {
      return res.status(400).json({ error: 'Valid action required: accept, adjust, void, or resubmit' });
    }

    // Apply resolution based on action
    switch (action) {
      case 'accept':
        // Accept unit as-is, move to approved status
        unit.status = 'approved';
        unit.approvedAt = new Date();
        unit.approvedBy = user._id;
        break;
        
      case 'adjust':
        // Adjust quantity and re-approve - quantity must be different from current
        if (adjustedQuantity === undefined || adjustedQuantity === unit.quantity) {
          return res.status(400).json({ 
            error: 'Adjusted quantity must be provided and different from current quantity' 
          });
        }
        unit.adjustments.push({
          date: new Date(),
          adjustedBy: user._id,
          reason: adjustedReason || 'Dispute resolution adjustment',
          originalQuantity: unit.quantity,  // Match schema field name
          newQuantity: adjustedQuantity,
          originalTotal: unit.totalAmount,  // Match schema field name
          newTotal: adjustedQuantity * unit.unitPrice
        });
        unit.quantity = adjustedQuantity;
        unit.totalAmount = adjustedQuantity * unit.unitPrice;
        unit.status = 'approved';
        unit.approvedAt = new Date();
        unit.approvedBy = user._id;
        break;
        
      case 'void':
        // Void the unit - it won't be billed
        unit.status = 'draft';  // Reset to draft so it's not included
        unit.isDeleted = true;
        unit.deletedAt = new Date();
        unit.deletedBy = user._id;
        break;
        
      case 'resubmit':
        // Send back to foreman for resubmission
        unit.status = 'draft';
        break;
    }

    // Mark dispute as resolved
    unit.disputeResolution = resolution;
    unit.disputeResolvedAt = new Date();
    unit.disputeResolvedBy = user._id;
    unit.isDisputed = false;

    await unit.save();

    res.json({
      message: `Dispute resolved: ${action}`,
      unit
    });
  } catch (err) {
    console.error('Error resolving dispute:', err);
    res.status(500).json({ error: 'Failed to resolve dispute' });
  }
});

/**
 * @swagger
 * /api/billing/units/{id}:
 *   delete:
 *     summary: Soft delete unit entry
 *     tags: [Units]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/units/:id', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const unitId = sanitizeObjectId(req.params.id);
    if (!unitId) {
      return res.status(400).json({ error: 'Invalid unit ID' });
    }

    const unit = await UnitEntry.findOne({
      _id: unitId,
      companyId: user.companyId,
      isDeleted: { $ne: true }
    });

    if (!unit) {
      return res.status(404).json({ error: 'Unit entry not found' });
    }

    // Can only delete draft units (or admin can delete any)
    if (unit.status !== 'draft' && !req.isAdmin) {
      return res.status(400).json({ error: 'Can only delete draft units' });
    }

    const { reason } = req.body;
    unit.isDeleted = true;
    unit.deletedAt = new Date();
    unit.deletedBy = user._id;
    unit.deleteReason = reason || 'Deleted by user';
    await unit.save();

    res.json({ success: true, message: 'Unit entry deleted' });
  } catch (err) {
    console.error('Error deleting unit:', err);
    res.status(500).json({ error: 'Failed to delete unit' });
  }
});


// ============================================================================
// CLAIMS - Invoice Generation and Oracle Export
// ============================================================================

/**
 * @swagger
 * /api/billing/claims:
 *   get:
 *     summary: List claims for company
 *     tags: [Claims]
 *     security:
 *       - bearerAuth: []
 */
router.get('/claims', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const { status, jobId, limit = 50 } = req.query;
    const query = { companyId: user.companyId };

    if (status) query.status = sanitizeString(status);
    const safeJobId = sanitizeObjectId(jobId);
    if (safeJobId) {
      query.jobId = safeJobId;
    }

    const claims = await Claim.find(query)
      .populate('createdBy', 'name')
      .populate('approvedBy', 'name')
      .sort({ createdAt: -1 })
      .limit(Number.parseInt(limit, 10));

    res.json(claims);
  } catch (err) {
    console.error('Error listing claims:', err);
    res.status(500).json({ error: 'Failed to list claims' });
  }
});

/**
 * @swagger
 * /api/billing/claims/unpaid:
 *   get:
 *     summary: Get claims with outstanding balance
 *     tags: [Claims]
 *     security:
 *       - bearerAuth: []
 */
router.get('/claims/unpaid', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const claims = await Claim.getUnpaid(user.companyId);
    
    const totalOutstanding = claims.reduce((sum, c) => sum + c.balanceDue, 0);
    
    res.json({
      count: claims.length,
      totalOutstanding,
      claims
    });
  } catch (err) {
    console.error('Error getting unpaid claims:', err);
    res.status(500).json({ error: 'Failed to get unpaid claims' });
  }
});

/**
 * @swagger
 * /api/billing/claims/past-due:
 *   get:
 *     summary: Get past due claims
 *     tags: [Claims]
 *     security:
 *       - bearerAuth: []
 */
router.get('/claims/past-due', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const claims = await Claim.getPastDue(user.companyId);
    res.json(claims);
  } catch (err) {
    console.error('Error getting past due claims:', err);
    res.status(500).json({ error: 'Failed to get past due claims' });
  }
});

/**
 * @swagger
 * /api/billing/claims/{id}:
 *   get:
 *     summary: Get claim by ID
 *     tags: [Claims]
 *     security:
 *       - bearerAuth: []
 */
router.get('/claims/:id', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const claimId = sanitizeObjectId(req.params.id);
    if (!claimId) {
      return res.status(400).json({ error: 'Invalid claim ID' });
    }

    const claim = await Claim.findOne({
      _id: claimId,
      companyId: user.companyId
    })
      .populate('createdBy', 'name')
      .populate('approvedBy', 'name')
      .populate('lineItems.unitEntryId');

    if (!claim) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    res.json(claim);
  } catch (err) {
    console.error('Error getting claim:', err);
    res.status(500).json({ error: 'Failed to get claim' });
  }
});

/**
 * @swagger
 * /api/billing/claims:
 *   post:
 *     summary: Create claim from approved units
 *     tags: [Claims]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - unitIds
 *             properties:
 *               unitIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               jobId:
 *                 type: string
 *               periodStart:
 *                 type: string
 *                 format: date
 *               periodEnd:
 *                 type: string
 *                 format: date
 *     responses:
 *       201:
 *         description: Claim created
 */
router.post('/claims', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    // Only PM or admin can create claims
    if (!['pm', 'admin'].includes(user.role) && !req.isAdmin) {
      return res.status(403).json({ error: 'Only PM or admin can create claims' });
    }

    const { unitIds, jobId, periodStart, periodEnd, retentionRate, taxRate, internalNotes } = req.body;

    if (!unitIds || !Array.isArray(unitIds) || unitIds.length === 0) {
      return res.status(400).json({ error: 'unitIds array is required' });
    }

    // Sanitize all unit IDs to prevent NoSQL injection
    const safeUnitIds = unitIds.map(id => sanitizeObjectId(id)).filter(Boolean);
    if (safeUnitIds.length === 0) {
      return res.status(400).json({ error: 'No valid unit IDs provided' });
    }

    // Fetch all units
    const units = await UnitEntry.find({
      _id: { $in: safeUnitIds },
      companyId: user.companyId,
      status: 'approved',
      claimId: null,
      isDeleted: { $ne: true }
    });

    if (units.length === 0) {
      return res.status(400).json({ error: 'No valid approved units found' });
    }

    if (units.length !== safeUnitIds.length) {
      return res.status(400).json({ 
        error: 'Some units are not eligible for billing (not approved, already on claim, or not found)',
        found: units.length,
        requested: safeUnitIds.length
      });
    }

    // Get job and utility info
    const safeJobId = sanitizeObjectId(jobId);
    const job = safeJobId ? await Job.findById(safeJobId) : await Job.findById(units[0].jobId);
    
    // Calculate subtotal
    const subtotal = units.reduce((sum, u) => sum + u.totalAmount, 0);
    
    // Calculate retention and tax
    const retentionAmt = retentionRate ? subtotal * retentionRate : 0;
    const taxAmt = taxRate ? subtotal * taxRate : 0;
    
    // adjustmentTotal starts at 0 for new claims (consistent with pre-save hook)
    const adjustmentTotal = 0;
    const totalAmount = subtotal + adjustmentTotal + taxAmt;
    const amountDue = totalAmount - retentionAmt;

    // Create claim
    const claim = new Claim({
      companyId: user.companyId,
      jobId: job?._id,
      jobIds: [...new Set(units.map(u => u.jobId))],
      utilityId: job?.utilityId,
      claimType: 'progress',
      periodStart: periodStart ? new Date(periodStart) : undefined,
      periodEnd: periodEnd ? new Date(periodEnd) : undefined,
      lineItems: [],
      subtotal,
      retentionRate: retentionRate || 0,
      retentionAmount: retentionAmt,
      taxRate: taxRate || 0,
      taxAmount: taxAmt,
      adjustmentTotal,  // Explicit initialization
      totalAmount,      // Matches pre-save: subtotal + adjustmentTotal + taxAmount
      amountDue,        // Matches pre-save: totalAmount - retentionAmount
      createdBy: user._id,
      internalNotes,
      changeLog: [{
        userId: user._id,
        action: 'created',
        details: `Created with ${units.length} units`
      }]
    });

    // Add line items from units (build array first, update units after claim saves)
    let lineNumber = 1;
    for (const unit of units) {
      claim.lineItems.push({
        unitEntryId: unit._id,
        lineNumber: lineNumber++,
        itemCode: unit.itemCode,
        description: unit.description,
        quantity: unit.quantity,
        unit: unit.unit,
        unitPrice: unit.unitPrice,
        totalAmount: unit.totalAmount,
        workDate: unit.workDate,
        photoCount: unit.photos?.length || 0,
        hasGPS: !!unit.location?.latitude,
        gpsAccuracy: unit.location?.accuracy,
        gpsQuality: unit.gpsQuality,
        performedByTier: unit.performedBy?.tier,
        subContractorId: unit.performedBy?.subContractorId,
        subContractorName: unit.performedBy?.subContractorName,
        workCategory: unit.performedBy?.workCategory
      });
    }

    // Save claim FIRST - if this fails, units remain in 'approved' state (no orphans)
    await claim.save();
    
    // Only after successful claim save, mark units as invoiced
    const approvedUnitIds = units.map(u => u._id);
    await UnitEntry.updateMany(
      { _id: { $in: approvedUnitIds } },
      { 
        $set: { 
          status: 'invoiced',
          claimId: claim._id 
        }
      }
    );

    res.status(201).json(claim);
  } catch (err) {
    console.error('Error creating claim:', err);
    res.status(500).json({ error: 'Failed to create claim' });
  }
});

/**
 * @swagger
 * /api/billing/claims/{id}:
 *   put:
 *     summary: Update a claim
 *     tags: [Claims]
 *     security:
 *       - bearerAuth: []
 */
router.put('/claims/:id', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const claimId = sanitizeObjectId(req.params.id);
    if (!claimId) {
      return res.status(400).json({ error: 'Invalid claim ID' });
    }

    const claim = await Claim.findOne({
      _id: claimId,
      companyId: user.companyId
    });

    if (!claim) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    // Only allow updates on draft/pending claims
    if (!['draft', 'pending_review'].includes(claim.status)) {
      return res.status(400).json({ error: 'Cannot update claim in current status' });
    }

    const { notes, dueDate, status } = req.body;
    
    if (notes !== undefined) claim.notes = notes;
    if (dueDate) claim.dueDate = new Date(dueDate);
    if (status && ['draft', 'pending_review', 'approved'].includes(status)) {
      const previousStatus = claim.status;
      claim.status = status;
      claim.changeLog.push({
        userId: user._id,
        action: 'status_changed',
        details: `Status changed from ${previousStatus} to ${status}`,
        previousStatus,
        newStatus: status
      });
      
      if (status === 'approved') {
        claim.approvedBy = user._id;
        claim.approvedAt = new Date();
      }
    }

    claim.updatedAt = new Date();
    await claim.save();
    res.json(claim);
  } catch (err) {
    console.error('Error updating claim:', err);
    res.status(500).json({ error: 'Failed to update claim' });
  }
});

/**
 * @swagger
 * /api/billing/claims/{id}:
 *   delete:
 *     summary: Delete a claim
 *     tags: [Claims]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/claims/:id', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const claimId = sanitizeObjectId(req.params.id);
    if (!claimId) {
      return res.status(400).json({ error: 'Invalid claim ID' });
    }

    const claim = await Claim.findOne({
      _id: claimId,
      companyId: user.companyId
    });

    if (!claim) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    // Only allow deletion of draft claims
    if (claim.status !== 'draft') {
      return res.status(400).json({ error: 'Only draft claims can be deleted' });
    }

    // Mark associated units as no longer invoiced
    await UnitEntry.updateMany(
      { _id: { $in: claim.lineItems.map(li => li.unitEntryId) } },
      { $set: { status: 'approved', claimId: null } }
    );

    await Claim.deleteOne({ _id: claim._id });
    res.json({ message: 'Claim deleted successfully' });
  } catch (err) {
    console.error('Error deleting claim:', err);
    res.status(500).json({ error: 'Failed to delete claim' });
  }
});

/**
 * @swagger
 * /api/billing/claims/{id}/approve:
 *   post:
 *     summary: Approve claim for submission
 *     tags: [Claims]
 *     security:
 *       - bearerAuth: []
 */
router.post('/claims/:id/approve', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const claimId = sanitizeObjectId(req.params.id);
    if (!claimId) {
      return res.status(400).json({ error: 'Invalid claim ID' });
    }

    if (!req.isAdmin && user.role !== 'pm') {
      return res.status(403).json({ error: 'Only PM or admin can approve claims' });
    }

    const claim = await Claim.findOne({
      _id: claimId,
      companyId: user.companyId
    });

    if (!claim) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    if (!['draft', 'pending_review'].includes(claim.status)) {
      return res.status(400).json({ error: 'Claim cannot be approved in current status' });
    }

    const { notes } = req.body;
    
    claim.status = 'approved';
    claim.approvedBy = user._id;
    claim.approvedAt = new Date();
    claim.approvalNotes = notes;
    claim.changeLog.push({
      userId: user._id,
      action: 'approved',
      details: notes || 'Approved for submission',
      previousStatus: claim.status,
      newStatus: 'approved'
    });

    await claim.save();
    res.json(claim);
  } catch (err) {
    console.error('Error approving claim:', err);
    res.status(500).json({ error: 'Failed to approve claim' });
  }
});

/**
 * @swagger
 * /api/billing/claims/{id}/submit:
 *   post:
 *     summary: Mark claim as submitted to utility
 *     tags: [Claims]
 *     security:
 *       - bearerAuth: []
 */
router.post('/claims/:id/submit', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const claimId = sanitizeObjectId(req.params.id);
    if (!claimId) {
      return res.status(400).json({ error: 'Invalid claim ID' });
    }

    const claim = await Claim.findOne({
      _id: claimId,
      companyId: user.companyId
    });

    if (!claim) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    if (claim.status !== 'approved') {
      return res.status(400).json({ error: 'Claim must be approved before submission' });
    }

    const { submissionMethod, submissionReference, dueDate } = req.body;

    claim.status = 'submitted';
    claim.submittedAt = new Date();
    claim.submittedBy = user._id;
    claim.submissionMethod = submissionMethod || 'portal';
    claim.submissionReference = submissionReference;
    claim.dueDate = dueDate ? new Date(dueDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Default Net 30
    claim.changeLog.push({
      userId: user._id,
      action: 'submitted',
      details: `Submitted via ${submissionMethod || 'portal'}`,
      previousStatus: 'approved',
      newStatus: 'submitted'
    });

    await claim.save();
    res.json(claim);
  } catch (err) {
    console.error('Error submitting claim:', err);
    res.status(500).json({ error: 'Failed to submit claim' });
  }
});

/**
 * @swagger
 * /api/billing/claims/{id}/payment:
 *   post:
 *     summary: Record payment received
 *     tags: [Claims]
 *     security:
 *       - bearerAuth: []
 */
router.post('/claims/:id/payment', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const claimId = sanitizeObjectId(req.params.id);
    if (!claimId) {
      return res.status(400).json({ error: 'Invalid claim ID' });
    }

    const claim = await Claim.findOne({
      _id: claimId,
      companyId: user.companyId
    });

    if (!claim) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    const { amount, paymentDate, paymentMethod, referenceNumber, notes } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid payment amount is required' });
    }

    await claim.recordPayment({
      amount,
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      paymentMethod: paymentMethod || 'ach',
      referenceNumber,
      notes
    }, user._id);

    // If claim is now fully paid, mark all associated units as 'paid'
    if (claim.status === 'paid') {
      const unitIds = claim.lineItems.map(li => li.unitEntryId).filter(Boolean);
      if (unitIds.length > 0) {
        await UnitEntry.updateMany(
          { _id: { $in: unitIds } },
          { 
            $set: { 
              status: 'paid',
              paidAt: new Date(),
              paidBy: user._id
            }
          }
        );
      }
    }

    res.json(claim);
  } catch (err) {
    console.error('Error recording payment:', err);
    res.status(500).json({ error: 'Failed to record payment' });
  }
});

/**
 * @swagger
 * /api/billing/claims/{id}/export-oracle:
 *   get:
 *     summary: Export claim in Oracle Payables format
 *     description: Returns JSON matching Oracle REST API schema for Payables Invoice Import
 *     tags: [Claims]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Oracle Payables JSON
 */
router.get('/claims/:id/export-oracle', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const claimId = sanitizeObjectId(req.params.id);
    if (!claimId) {
      return res.status(400).json({ error: 'Invalid claim ID' });
    }

    const claim = await Claim.findOne({
      _id: claimId,
      companyId: user.companyId
    });

    if (!claim) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    // Generate Oracle payload
    const oraclePayload = claim.toOraclePayload();

    // Track export
    claim.oracle = claim.oracle || {};
    claim.oracle.exportedAt = new Date();
    claim.oracle.exportedBy = user._id;
    claim.oracle.exportFormat = 'json';
    claim.oracle.exportStatus = 'exported';
    claim.changeLog.push({
      userId: user._id,
      action: 'oracle_export',
      details: 'Exported to Oracle Payables format'
    });
    await claim.save();

    res.json({
      exportedAt: new Date().toISOString(),
      claimNumber: claim.claimNumber,
      format: 'Oracle Payables REST API',
      payload: oraclePayload
    });
  } catch (err) {
    console.error('Error exporting to Oracle:', err);
    res.status(500).json({ error: 'Failed to export to Oracle format' });
  }
});

/**
 * @swagger
 * /api/billing/claims/{id}/export-csv:
 *   get:
 *     summary: Export claim line items as CSV
 *     tags: [Claims]
 *     security:
 *       - bearerAuth: []
 */
router.get('/claims/:id/export-csv', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const claimId = sanitizeObjectId(req.params.id);
    if (!claimId) {
      return res.status(400).json({ error: 'Invalid claim ID' });
    }

    const claim = await Claim.findOne({
      _id: claimId,
      companyId: user.companyId
    });

    if (!claim) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    // Build CSV
    const headers = ['Line#', 'ItemCode', 'Description', 'Quantity', 'Unit', 'UnitPrice', 'TotalAmount', 'WorkDate', 'PhotoCount', 'HasGPS', 'Tier', 'SubContractor', 'WorkCategory'];
    const rows = claim.lineItems.map(li => [
      li.lineNumber,
      li.itemCode,
      `"${li.description.replaceAll('"', '""')}"`,
      li.quantity,
      li.unit,
      li.unitPrice.toFixed(2),
      li.totalAmount.toFixed(2),
      li.workDate ? li.workDate.toISOString().split('T')[0] : '',
      li.photoCount || 0,
      li.hasGPS ? 'Yes' : 'No',
      li.performedByTier || 'prime',
      li.subContractorName || '',
      li.workCategory || ''
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${claim.claimNumber}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error('Error exporting CSV:', err);
    res.status(500).json({ error: 'Failed to export CSV' });
  }
});

/**
 * @swagger
 * /api/billing/claims/{id}/export-fbdi:
 *   get:
 *     summary: Export claim in Oracle FBDI (File-Based Data Import) format
 *     description: Returns CSV files matching Oracle's bulk import template for Payables
 *     tags: [Claims]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Oracle FBDI CSV (headers + lines)
 */
router.get('/claims/:id/export-fbdi', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const claimId = sanitizeObjectId(req.params.id);
    if (!claimId) {
      return res.status(400).json({ error: 'Invalid claim ID' });
    }

    const claim = await Claim.findOne({
      _id: claimId,
      companyId: user.companyId
    });

    if (!claim) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    // Generate FBDI format
    const fbdi = claim.toOracleFBDI();

    // Track export
    claim.oracle = claim.oracle || {};
    claim.oracle.exportedAt = new Date();
    claim.oracle.exportedBy = user._id;
    claim.oracle.exportFormat = 'fbdi';
    claim.oracle.exportStatus = 'exported';
    claim.changeLog.push({
      userId: user._id,
      action: 'oracle_export_fbdi',
      details: 'Exported to Oracle FBDI CSV format'
    });
    await claim.save();

    // Build combined CSV with header section and lines section
    const headerCsv = [
      '# AP_INVOICES_INTERFACE - Invoice Headers',
      fbdi.headerColumns.join(','),
      fbdi.header.map(v => typeof v === 'string' && v.includes(',') ? `"${v}"` : v).join(',')
    ].join('\n');

    const linesCsv = [
      '',
      '# AP_INVOICE_LINES_INTERFACE - Invoice Lines',
      fbdi.lineColumns.join(','),
      ...fbdi.lines.map(row => row.map(v => typeof v === 'string' && v.includes(',') ? `"${v}"` : v).join(','))
    ].join('\n');

    const fullCsv = headerCsv + '\n' + linesCsv;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${claim.claimNumber}_FBDI.csv"`);
    res.send(fullCsv);
  } catch (err) {
    console.error('Error exporting FBDI:', err);
    res.status(500).json({ error: 'Failed to export FBDI format' });
  }
});

/**
 * @swagger
 * /api/billing/claims/bulk-export-fbdi:
 *   post:
 *     summary: Bulk export multiple claims in Oracle FBDI format
 *     description: Export multiple approved claims for batch import to Oracle Payables
 *     tags: [Claims]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               claimIds:
 *                 type: array
 *                 items:
 *                   type: string
 */
router.post('/claims/bulk-export-fbdi', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const { claimIds } = req.body;
    if (!claimIds || !Array.isArray(claimIds) || claimIds.length === 0) {
      return res.status(400).json({ error: 'claimIds array required' });
    }

    // Sanitize all claim IDs to prevent NoSQL injection
    const safeClaimIds = claimIds.map(id => sanitizeObjectId(id)).filter(Boolean);
    if (safeClaimIds.length === 0) {
      return res.status(400).json({ error: 'No valid claim IDs provided' });
    }

    const claims = await Claim.find({
      _id: { $in: safeClaimIds },
      companyId: user.companyId,
      status: { $in: ['approved', 'submitted'] }
    });

    if (claims.length === 0) {
      return res.status(404).json({ error: 'No valid claims found for export' });
    }

    // Collect all FBDI data
    let allHeaders = [];
    let allLines = [];
    let headerColumns = null;
    let lineColumns = null;

    for (const claim of claims) {
      const fbdi = claim.toOracleFBDI();
      headerColumns = headerColumns || fbdi.headerColumns;
      lineColumns = lineColumns || fbdi.lineColumns;
      allHeaders.push(fbdi.header);
      allLines.push(...fbdi.lines);

      // Track export
      claim.oracle = claim.oracle || {};
      claim.oracle.exportedAt = new Date();
      claim.oracle.exportedBy = user._id;
      claim.oracle.exportFormat = 'fbdi_bulk';
      claim.oracle.exportStatus = 'exported';
      claim.changeLog.push({
        userId: user._id,
        action: 'oracle_bulk_export',
        details: `Bulk exported with ${claims.length - 1} other claims`
      });
      await claim.save();
    }

    // Build combined FBDI file
    const headerCsv = [
      '# AP_INVOICES_INTERFACE - Invoice Headers',
      `# Exported: ${new Date().toISOString()}`,
      `# Claims: ${claims.length}`,
      headerColumns.join(','),
      ...allHeaders.map(row => row.map(v => typeof v === 'string' && v.includes(',') ? `"${v}"` : v).join(','))
    ].join('\n');

    const linesCsv = [
      '',
      '# AP_INVOICE_LINES_INTERFACE - Invoice Lines',
      `# Total Lines: ${allLines.length}`,
      lineColumns.join(','),
      ...allLines.map(row => row.map(v => typeof v === 'string' && v.includes(',') ? `"${v}"` : v).join(','))
    ].join('\n');

    const fullCsv = headerCsv + '\n' + linesCsv;
    const filename = `FieldLedger_FBDI_${new Date().toISOString().split('T')[0]}_${claims.length}claims.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(fullCsv);
  } catch (err) {
    console.error('Error bulk exporting FBDI:', err);
    res.status(500).json({ error: 'Failed to bulk export FBDI format' });
  }
});

module.exports = router;

