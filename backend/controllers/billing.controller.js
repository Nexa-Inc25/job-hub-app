/**
 * FieldLedger - Billing Controller
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 *
 * Handlers for unit-price billing:
 * - Unit entries (the "Digital Receipt")
 * - Claims/invoices
 * - Oracle Payables export
 *
 * Extracted from billing.routes.js for modularity and testability.
 *
 * @module controllers/billing
 */

const UnitEntry = require('../models/UnitEntry');
const Claim = require('../models/Claim');
const PriceBook = require('../models/PriceBook');
const Job = require('../models/Job');
const User = require('../models/User');
const { sanitizeString, sanitizeObjectId, sanitizeInt, sanitizeDate } = require('../utils/sanitize');
const notificationService = require('../services/notification.service');

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Find rate item from price book by ID or item code
 */
async function findRateItem(priceBookId, priceBookItemId, itemCode, companyId, utilityId) {
  let rateItem = null;
  let priceBookRef = null;

  if (priceBookItemId && priceBookId) {
    const priceBook = await PriceBook.findById(priceBookId);
    if (priceBook) {
      rateItem = priceBook.items.id(priceBookItemId);
      priceBookRef = priceBook._id;
    }
  } else if (itemCode && utilityId) {
    rateItem = await PriceBook.findItemByCode(companyId, utilityId, itemCode);
    if (rateItem) {
      const activePriceBook = await PriceBook.getActive(companyId, utilityId);
      priceBookRef = activePriceBook?._id;
    }
  }

  return { rateItem, priceBookRef };
}

/**
 * Sanitize location object - only allow specific numeric fields
 */
function sanitizeLocation(location) {
  if (!location || typeof location !== 'object') return null;
  return {
    latitude: typeof location.latitude === 'number' ? location.latitude : undefined,
    longitude: typeof location.longitude === 'number' ? location.longitude : undefined,
    accuracy: typeof location.accuracy === 'number' ? location.accuracy : undefined,
    altitude: typeof location.altitude === 'number' ? location.altitude : undefined,
    altitudeAccuracy: typeof location.altitudeAccuracy === 'number' ? location.altitudeAccuracy : undefined,
    heading: typeof location.heading === 'number' ? location.heading : undefined,
    speed: typeof location.speed === 'number' ? location.speed : undefined,
    capturedAt: location.capturedAt ? new Date(location.capturedAt) : new Date()
  };
}

/**
 * Sanitize performedBy object - only allow specific fields with validation
 */
function sanitizePerformedBy(performedBy, user) {
  if (!performedBy || typeof performedBy !== 'object') {
    return {
      tier: 'prime',
      workCategory: 'electrical',
      foremanId: user._id,
      foremanName: user.name
    };
  }

  const validTiers = ['prime', 'sub', 'sub_of_sub'];
  const validWorkCategories = ['electrical', 'civil', 'overhead', 'underground', 'traffic_control', 'vegetation', 'inspection', 'emergency', 'other'];

  return {
    tier: validTiers.includes(performedBy.tier) ? performedBy.tier : 'prime',
    workCategory: validWorkCategories.includes(performedBy.workCategory) ? performedBy.workCategory : 'electrical',
    foremanId: sanitizeObjectId(performedBy.foremanId) || user._id,
    foremanName: sanitizeString(performedBy.foremanName) || user.name,
    subContractorId: sanitizeObjectId(performedBy.subContractorId),
    subContractorName: sanitizeString(performedBy.subContractorName),
    crewSize: typeof performedBy.crewSize === 'number' && performedBy.crewSize > 0 ? performedBy.crewSize : 1
  };
}

/**
 * Sanitize photos array - only allow specific fields
 */
function sanitizePhotos(photos) {
  if (!Array.isArray(photos)) return [];
  return photos.map(photo => {
    if (!photo || typeof photo !== 'object') return null;
    return {
      url: sanitizeString(photo.url),
      r2Key: sanitizeString(photo.r2Key),
      fileName: sanitizeString(photo.fileName),
      mimeType: sanitizeString(photo.mimeType) || 'image/jpeg',
      fileSize: typeof photo.fileSize === 'number' ? photo.fileSize : undefined,
      gpsCoordinates: photo.gpsCoordinates ? sanitizeLocation(photo.gpsCoordinates) : undefined,
      capturedAt: photo.capturedAt ? new Date(photo.capturedAt) : new Date(),
      deviceInfo: sanitizeString(photo.deviceInfo),
      appVersion: sanitizeString(photo.appVersion),
      photoType: ['before', 'during', 'after', 'measurement', 'issue', 'verification', 'other'].includes(photo.photoType)
        ? photo.photoType : 'after',
      description: sanitizeString(photo.description)
    };
  }).filter(Boolean);
}

/**
 * Sanitize fieldConditions object - only allow specific fields
 */
function sanitizeFieldConditions(fieldConditions) {
  if (!fieldConditions || typeof fieldConditions !== 'object') return undefined;
  return {
    weather: sanitizeString(fieldConditions.weather),
    groundCondition: sanitizeString(fieldConditions.groundCondition),
    accessNotes: sanitizeString(fieldConditions.accessNotes),
    safetyNotes: sanitizeString(fieldConditions.safetyNotes)
  };
}

/**
 * Find rate item from price book for unit repair
 */
async function findRateItemForRepair(unit) {
  if (unit.priceBookId && unit.priceBookItemId) {
    const priceBook = await PriceBook.findById(unit.priceBookId);
    if (priceBook) {
      const item = priceBook.items.id(unit.priceBookItemId);
      if (item) return item;
    }
  }

  if (unit.itemCode && unit.priceBookId) {
    const priceBook = await PriceBook.findById(unit.priceBookId);
    if (priceBook) {
      return priceBook.items.find(i => i.itemCode === unit.itemCode);
    }
  }

  return null;
}

/**
 * Process a single orphaned unit (delete or repair)
 */
async function processOrphanedUnit(unit, action) {
  if (action === 'delete') {
    await UnitEntry.deleteOne({ _id: unit._id });
    return { _id: unit._id, action: 'deleted', success: true };
  }

  if (action === 'repair') {
    const rateItem = await findRateItemForRepair(unit);

    if (rateItem) {
      unit.itemCode = rateItem.itemCode;
      unit.description = rateItem.description;
      unit.unit = rateItem.unit;
      unit.unitPrice = rateItem.unitPrice;
      unit.totalAmount = unit.quantity * rateItem.unitPrice;
      unit.category = rateItem.category;
      await unit.save();
      return { _id: unit._id, action: 'repaired', itemCode: rateItem.itemCode, success: true };
    }

    return { _id: unit._id, action: 'failed', reason: 'Could not find matching price book item', success: false };
  }

  return { _id: unit._id, action: 'skipped', success: false };
}

/**
 * Build unit entry data object from request and rate item
 */
function buildUnitEntryData(params) {
  const {
    jobId, companyId, priceBookRef, rateItem, quantity, workDate, location,
    photos, photoWaived, photoWaivedReason, performedBy, user, notes,
    fieldConditions, offlineId
  } = params;

  // Sanitize all nested user-controlled objects
  const safeLocation = sanitizeLocation(location);
  const safePerformedBy = sanitizePerformedBy(performedBy, user);
  const safePhotos = sanitizePhotos(photos);
  const safeFieldConditions = sanitizeFieldConditions(fieldConditions);
  const safeOfflineId = sanitizeString(offlineId);
  const safePhotoWaivedReason = sanitizeString(photoWaivedReason);

  return {
    jobId,
    companyId,
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
    unitPrice: rateItem.unitPrice,
    totalAmount: quantity * rateItem.unitPrice,
    // Digital receipt data
    workDate: new Date(workDate),
    location: safeLocation,
    photos: safePhotos,
    photoWaived: photoWaived === true,
    photoWaivedReason: safePhotoWaivedReason,
    photoWaivedBy: photoWaived === true ? user._id : undefined,
    // Who performed the work
    performedBy: safePerformedBy,
    // Entry metadata
    enteredBy: user._id,
    enteredAt: new Date(),
    status: 'draft',
    notes,
    fieldConditions: safeFieldConditions,
    // Offline sync
    offlineId: safeOfflineId,
    syncStatus: safeOfflineId ? 'pending' : 'synced',
    syncedAt: safeOfflineId ? undefined : new Date()
  };
}

/**
 * Apply dispute resolution action to a unit entry
 */
function applyDisputeResolution(unit, action, user, adjustedQuantity, adjustedReason) {
  switch (action) {
    case 'accept':
      unit.status = 'approved';
      unit.approvedAt = new Date();
      unit.approvedBy = user._id;
      return { success: true };

    case 'adjust':
      if (adjustedQuantity === undefined || adjustedQuantity === unit.quantity) {
        return {
          success: false,
          error: 'Adjusted quantity must be provided and different from current quantity'
        };
      }
      unit.adjustments.push({
        date: new Date(),
        adjustedBy: user._id,
        reason: adjustedReason || 'Dispute resolution adjustment',
        originalQuantity: unit.quantity,
        newQuantity: adjustedQuantity,
        originalTotal: unit.totalAmount,
        newTotal: adjustedQuantity * unit.unitPrice
      });
      unit.quantity = adjustedQuantity;
      unit.totalAmount = adjustedQuantity * unit.unitPrice;
      unit.status = 'approved';
      unit.approvedAt = new Date();
      unit.approvedBy = user._id;
      return { success: true };

    case 'void':
      unit.status = 'draft';
      unit.isDeleted = true;
      unit.deletedAt = new Date();
      unit.deletedBy = user._id;
      return { success: true };

    case 'resubmit':
      unit.status = 'draft';
      return { success: true };

    default:
      return { success: false, error: 'Invalid action' };
  }
}

/**
 * Send notification after dispute resolution
 */
async function sendDisputeResolutionNotification(unit, action, user, resolution) {
  try {
    const job = await Job.findById(unit.jobId).select('assignedToGF companyId woNumber').lean();
    if (!job) return;

    const isRejection = action === 'resubmit' || action === 'void';

    if (isRejection) {
      const reason = action === 'void'
        ? 'Unit voided: ' + resolution
        : 'Resubmission required: ' + resolution;
      await notificationService.notifyUnitRejected({
        job,
        unitEntry: unit,
        rejectedBy: user,
        reason
      });
    } else {
      await notificationService.notifyUnitApproved({
        job,
        unitEntry: unit,
        approvedBy: user
      });
    }
  } catch (error_) {
    console.error('[Units:ResolveDispute] Notification error:', error_.message);
  }
}

/**
 * Load and validate the current user, returning 400 if no companyId.
 * @returns {{ user: object } | null} user object or null if response already sent
 */
async function loadUser(req, res) {
  const user = await User.findById(req.userId);
  if (!user?.companyId) {
    res.status(400).json({ error: 'User not associated with a company' });
    return null;
  }
  return user;
}

// ============================================================================
// UNIT ENTRY HANDLERS
// ============================================================================

/**
 * List unit entries for company
 * GET /api/billing/units
 */
const listUnits = async (req, res) => {
  try {
    const user = await loadUser(req, res);
    if (!user) return;

    const { jobId, status, workCategory, tier, startDate, endDate, limit = 100 } = req.query;

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

    if (safeJobId) query.jobId = safeJobId;
    if (safeStatus) query.status = safeStatus;
    if (safeWorkCategory) query['performedBy.workCategory'] = safeWorkCategory;
    if (safeTier) query['performedBy.tier'] = safeTier;

    if (safeStartDate || safeEndDate) {
      query.workDate = {};
      if (safeStartDate) query.workDate.$gte = safeStartDate;
      if (safeEndDate) query.workDate.$lte = safeEndDate;
    }

    // Role-based filtering: foreman only sees own entries
    if (user.role === 'foreman') {
      query.enteredBy = user._id;
    }

    const units = await UnitEntry.find(query)
      .populate('enteredBy', 'name email')
      .populate('verifiedBy', 'name')
      .sort({ workDate: -1, createdAt: -1 })
      .limit(safeLimit);

    res.json(units);
  } catch (err) {
    console.error('Error listing units:', err);
    res.status(500).json({ error: 'Failed to list unit entries' });
  }
};

/**
 * Get approved units not yet on a claim
 * GET /api/billing/units/unbilled
 */
const getUnbilledUnits = async (req, res) => {
  try {
    const user = await loadUser(req, res);
    if (!user) return;

    const units = await UnitEntry.getUnbilledByCompany(user.companyId);

    // Group by job for easier claim building
    const groupedByJob = {};
    for (const unit of units) {
      const jId = unit.jobId.toString();
      if (!groupedByJob[jId]) {
        groupedByJob[jId] = { jobId: jId, units: [], totalAmount: 0 };
      }
      groupedByJob[jId].units.push(unit);
      groupedByJob[jId].totalAmount += unit.totalAmount;
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
};

/**
 * Get disputed units needing resolution
 * GET /api/billing/units/disputed
 */
const getDisputedUnits = async (req, res) => {
  try {
    const user = await loadUser(req, res);
    if (!user) return;

    const units = await UnitEntry.getDisputed(user.companyId);
    res.json(units);
  } catch (err) {
    console.error('Error getting disputed units:', err);
    res.status(500).json({ error: 'Failed to get disputed units' });
  }
};

/**
 * Get unit entry by ID
 * GET /api/billing/units/:id
 */
const getUnitById = async (req, res) => {
  try {
    const user = await loadUser(req, res);
    if (!user) return;

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
};

/**
 * Create unit entry (Digital Receipt)
 * POST /api/billing/units
 */
const createUnit = async (req, res) => {
  try {
    const user = await loadUser(req, res);
    if (!user) return;

    const {
      jobId: rawJobId, priceBookId: rawPriceBookId, priceBookItemId: rawPriceBookItemId, itemCode,
      quantity, workDate, location, performedBy, photos,
      notes, fieldConditions, photoWaived, photoWaivedReason,
      offlineId
    } = req.body;

    const jobId = sanitizeObjectId(rawJobId);
    const priceBookId = sanitizeObjectId(rawPriceBookId);
    const priceBookItemId = sanitizeObjectId(rawPriceBookItemId);
    const safeItemCode = sanitizeString(itemCode);
    const safeNotes = sanitizeString(notes);

    if (!jobId || !quantity || !workDate || !location || !performedBy) {
      return res.status(400).json({ error: 'Missing required fields: jobId, quantity, workDate, location, performedBy' });
    }

    const job = await Job.findOne({
      _id: jobId,
      companyId: user.companyId,
      isDeleted: { $ne: true }
    });
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (!photoWaived && (!photos || photos.length === 0)) {
      return res.status(400).json({ error: 'At least one photo is required for unit verification' });
    }

    const { rateItem, priceBookRef } = await findRateItem(
      priceBookId, priceBookItemId, safeItemCode, user.companyId, job.utilityId
    );

    if (!rateItem) {
      return res.status(400).json({ error: 'Rate item not found in price book' });
    }

    const unitEntryData = buildUnitEntryData({
      jobId, companyId: user.companyId, priceBookRef, rateItem, quantity, workDate,
      location, photos, photoWaived, photoWaivedReason, performedBy, user,
      notes: safeNotes, fieldConditions, offlineId
    });
    const unitEntry = await UnitEntry.create(unitEntryData); // NOSONAR

    // Auto-submit if required evidence is present
    const hasRequiredEvidence = (unitEntryData.photos && unitEntryData.photos.length > 0) || unitEntryData.photoWaived;
    const hasValidGPS = unitEntryData.location?.latitude && unitEntryData.location?.longitude && unitEntryData.location?.accuracy < 50;

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
};

/**
 * Batch create unit entries
 * POST /api/billing/units/batch
 */
const batchCreateUnits = async (req, res) => {
  try {
    const user = await loadUser(req, res);
    if (!user) return;

    const { entries } = req.body;
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'entries array is required and must not be empty' });
    }

    if (entries.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 entries per batch' });
    }

    const results = [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      try {
        const jobId = sanitizeObjectId(entry.jobId);
        const priceBookId = sanitizeObjectId(entry.priceBookId);
        const priceBookItemId = sanitizeObjectId(entry.priceBookItemId);
        const safeItemCode = sanitizeString(entry.itemCode);
        const safeNotes = sanitizeString(entry.notes);

        if (!jobId || !entry.quantity || !entry.workDate || !entry.location || !entry.performedBy) {
          results.push({ index: i, success: false, error: 'Missing required fields' });
          continue;
        }

        const job = await Job.findOne({
          _id: jobId,
          companyId: user.companyId,
          isDeleted: { $ne: true }
        });

        if (!job) {
          results.push({ index: i, success: false, error: 'Job not found' });
          continue;
        }

        if (!entry.photoWaived && (!entry.photos || entry.photos.length === 0)) {
          results.push({ index: i, success: false, error: 'At least one photo is required' });
          continue;
        }

        const { rateItem, priceBookRef } = await findRateItem(
          priceBookId, priceBookItemId, safeItemCode, user.companyId, job.utilityId
        );

        if (!rateItem) {
          results.push({ index: i, success: false, error: 'Rate item not found in price book' });
          continue;
        }

        const unitEntryData = buildUnitEntryData({
          jobId, companyId: user.companyId, priceBookRef, rateItem,
          quantity: entry.quantity, workDate: entry.workDate,
          location: entry.location, photos: entry.photos,
          photoWaived: entry.photoWaived, photoWaivedReason: entry.photoWaivedReason,
          performedBy: entry.performedBy, user,
          notes: safeNotes, fieldConditions: entry.fieldConditions,
          offlineId: entry.offlineId
        });

        const unitEntry = await UnitEntry.create(unitEntryData); // NOSONAR

        // Auto-submit if evidence is present
        const hasEvidence = (unitEntryData.photos && unitEntryData.photos.length > 0) || unitEntryData.photoWaived;
        const hasGPS = unitEntryData.location?.latitude && unitEntryData.location?.longitude && unitEntryData.location?.accuracy < 50;

        if (hasEvidence && hasGPS) {
          await unitEntry.submit(user._id);
        }

        results.push({
          index: i,
          success: true,
          _id: unitEntry._id,
          itemCode: unitEntry.itemCode,
          totalAmount: unitEntry.totalAmount,
          status: unitEntry.status
        });
      } catch (entryErr) {
        results.push({
          index: i,
          success: false,
          error: entryErr.name === 'ValidationError' ? entryErr.message : 'Failed to create entry'
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    res.status(successCount > 0 ? 201 : 400).json({
      total: entries.length,
      succeeded: successCount,
      failed: failureCount,
      results
    });
  } catch (err) {
    console.error('Error in batch create units:', err);
    res.status(500).json({ error: 'Failed to batch create unit entries' });
  }
};

/**
 * Submit unit for review
 * POST /api/billing/units/:id/submit
 */
const submitUnit = async (req, res) => {
  try {
    const user = await loadUser(req, res);
    if (!user) return;

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

    try {
      const job = await Job.findById(unit.jobId).select('assignedToGF companyId woNumber').lean();
      if (job) {
        await notificationService.notifyUnitSubmitted({ job, unitEntry: unit, submittedBy: user });
      }
    } catch (error_) {
      console.error('[Units:Submit] Notification error:', error_.message);
    }

    res.json(unit);
  } catch (err) {
    console.error('Error submitting unit:', err);
    res.status(500).json({ error: 'Failed to submit unit' });
  }
};

/**
 * Verify unit entry (GF/QA action)
 * POST /api/billing/units/:id/verify
 */
const verifyUnit = async (req, res) => {
  try {
    const user = await loadUser(req, res);
    if (!user) return;

    const unitId = sanitizeObjectId(req.params.id);
    if (!unitId) {
      return res.status(400).json({ error: 'Invalid unit ID' });
    }

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

    const { notes } = req.body || {};
    await unit.verify(user._id, notes);
    res.json(unit);
  } catch (err) {
    console.error('Error verifying unit:', err);
    res.status(500).json({ error: 'Failed to verify unit' });
  }
};

/**
 * Approve unit for billing (PM action)
 * POST /api/billing/units/:id/approve
 */
const approveUnit = async (req, res) => {
  try {
    const user = await loadUser(req, res);
    if (!user) return;

    const unitId = sanitizeObjectId(req.params.id);
    if (!unitId) {
      return res.status(400).json({ error: 'Invalid unit ID' });
    }

    const canApprove = ['pm', 'admin'].includes(user.role) || req.isAdmin;
    if (!canApprove) {
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

    if (unit.status !== 'submitted' && unit.status !== 'verified') {
      return res.status(400).json({ error: 'Only submitted or verified units can be approved' });
    }

    const { notes } = req.body || {};
    await unit.approve(user._id, notes);

    try {
      const job = await Job.findById(unit.jobId).select('assignedToGF companyId woNumber').lean();
      if (job) {
        await notificationService.notifyUnitApproved({ job, unitEntry: unit, approvedBy: user });
      }
    } catch (error_) {
      console.error('[Units:Approve] Notification error:', error_.message);
    }

    res.json(unit);
  } catch (err) {
    console.error('Error approving unit:', err);
    res.status(500).json({ error: 'Failed to approve unit' });
  }
};

/**
 * Dispute a unit entry
 * POST /api/billing/units/:id/dispute
 */
const disputeUnit = async (req, res) => {
  try {
    const user = await loadUser(req, res);
    if (!user) return;

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
};

/**
 * Resolve a dispute on a unit entry
 * POST /api/billing/units/:id/resolve-dispute
 */
const resolveDispute = async (req, res) => {
  try {
    const user = await loadUser(req, res);
    if (!user) return;

    const unitId = sanitizeObjectId(req.params.id);
    if (!unitId) {
      return res.status(400).json({ error: 'Invalid unit ID' });
    }

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

    const resolutionResult = applyDisputeResolution(unit, action, user, adjustedQuantity, adjustedReason);
    if (!resolutionResult.success) {
      return res.status(400).json({ error: resolutionResult.error });
    }

    unit.disputeResolution = resolution;
    unit.disputeResolvedAt = new Date();
    unit.disputeResolvedBy = user._id;
    unit.isDisputed = false;

    await unit.save();

    await sendDisputeResolutionNotification(unit, action, user, resolution);

    res.json({ message: `Dispute resolved: ${action}`, unit });
  } catch (err) {
    console.error('Error resolving dispute:', err);
    res.status(500).json({ error: 'Failed to resolve dispute' });
  }
};

/**
 * Soft delete unit entry
 * DELETE /api/billing/units/:id
 */
const deleteUnit = async (req, res) => {
  try {
    const user = await loadUser(req, res);
    if (!user) return;

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

    if (unit.status !== 'draft' && !req.isAdmin && !req.isSuperAdmin) {
      return res.status(400).json({ error: 'Can only delete draft units. Admins can delete any status.' });
    }

    const reason = req.body?.reason;
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
};

// ============================================================================
// CLAIM HANDLERS
// ============================================================================

/**
 * List claims for company
 * GET /api/billing/claims
 */
const listClaims = async (req, res) => {
  try {
    const user = await loadUser(req, res);
    if (!user) return;

    const { status, jobId, limit = 50 } = req.query;
    const query = { companyId: user.companyId };

    if (status) query.status = sanitizeString(status);
    const safeJobId = sanitizeObjectId(jobId);
    if (safeJobId) query.jobId = safeJobId;

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
};

/**
 * Get claims with outstanding balance
 * GET /api/billing/claims/unpaid
 */
const getUnpaidClaims = async (req, res) => {
  try {
    const user = await loadUser(req, res);
    if (!user) return;

    const claims = await Claim.getUnpaid(user.companyId);
    const totalOutstanding = claims.reduce((sum, c) => sum + c.balanceDue, 0);

    res.json({ count: claims.length, totalOutstanding, claims });
  } catch (err) {
    console.error('Error getting unpaid claims:', err);
    res.status(500).json({ error: 'Failed to get unpaid claims' });
  }
};

/**
 * Get past due claims
 * GET /api/billing/claims/past-due
 */
const getPastDueClaims = async (req, res) => {
  try {
    const user = await loadUser(req, res);
    if (!user) return;

    const claims = await Claim.getPastDue(user.companyId);
    res.json(claims);
  } catch (err) {
    console.error('Error getting past due claims:', err);
    res.status(500).json({ error: 'Failed to get past due claims' });
  }
};

/**
 * Get claim by ID
 * GET /api/billing/claims/:id
 */
const getClaimById = async (req, res) => {
  try {
    const user = await loadUser(req, res);
    if (!user) return;

    const claimId = sanitizeObjectId(req.params.id);
    if (!claimId) {
      return res.status(400).json({ error: 'Invalid claim ID' });
    }

    const claim = await Claim.findOne({ _id: claimId, companyId: user.companyId })
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
};

/**
 * Create claim from approved units (with validation and error recovery)
 * POST /api/billing/claims
 */
const createClaim = async (req, res) => {
  try {
    const user = await loadUser(req, res);
    if (!user) return;

    if (!['pm', 'admin'].includes(user.role) && !req.isAdmin) {
      return res.status(403).json({ error: 'Only PM or admin can create claims' });
    }

    const { unitIds, jobId, periodStart, periodEnd, retentionRate, taxRate, internalNotes, description, notes } = req.body;

    if (!unitIds || !Array.isArray(unitIds) || unitIds.length === 0) {
      return res.status(400).json({ error: 'unitIds array is required' });
    }

    const safeUnitIds = unitIds.map(id => sanitizeObjectId(id)).filter(Boolean);
    if (safeUnitIds.length === 0) {
      return res.status(400).json({ error: 'No valid unit IDs provided' });
    }

    // Fetch all units — validate ALL are approved status
    const units = await UnitEntry.find({
      _id: { $in: safeUnitIds },
      companyId: user.companyId,
      isDeleted: { $ne: true }
    });

    if (units.length === 0) {
      return res.status(400).json({ error: 'No valid units found' });
    }

    // Strict validation: every requested unit must be found, approved, and unattached
    const notFound = safeUnitIds.filter(id => !units.find(u => u._id.toString() === id.toString()));
    const notApproved = units.filter(u => u.status !== 'approved');
    const alreadyClaimed = units.filter(u => u.claimId);

    if (notFound.length > 0 || notApproved.length > 0 || alreadyClaimed.length > 0) {
      return res.status(400).json({
        error: 'Some units are not eligible for billing',
        details: {
          notFound: notFound.length,
          notApproved: notApproved.map(u => ({ _id: u._id, status: u.status })),
          alreadyClaimed: alreadyClaimed.map(u => ({ _id: u._id, claimId: u.claimId }))
        },
        found: units.length,
        requested: safeUnitIds.length
      });
    }

    const safeJobId = sanitizeObjectId(jobId);
    const job = safeJobId ? await Job.findById(safeJobId) : await Job.findById(units[0].jobId);

    const subtotal = units.reduce((sum, u) => sum + u.totalAmount, 0);
    const retentionAmt = retentionRate ? subtotal * retentionRate : 0;
    const taxAmt = taxRate ? subtotal * taxRate : 0;
    const adjustmentTotal = 0;
    const totalAmount = subtotal + adjustmentTotal + taxAmt;
    const amountDue = totalAmount - retentionAmt;

    // Build line items
    const lineItems = units.map((unit, idx) => ({
      unitEntryId: unit._id,
      lineNumber: idx + 1,
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
    }));

    const claim = new Claim({
      companyId: user.companyId,
      jobId: job?._id,
      jobIds: [...new Set(units.map(u => u.jobId))],
      utilityId: job?.utilityId,
      claimType: 'progress',
      periodStart: periodStart ? new Date(periodStart) : undefined,
      periodEnd: periodEnd ? new Date(periodEnd) : undefined,
      lineItems,
      subtotal,
      retentionRate: retentionRate || 0,
      retentionAmount: retentionAmt,
      taxRate: taxRate || 0,
      taxAmount: taxAmt,
      adjustmentTotal,
      totalAmount,
      amountDue,
      createdBy: user._id,
      description: description || notes || undefined,
      internalNotes: internalNotes || notes || undefined,
      changeLog: [{
        userId: user._id,
        action: 'created',
        details: `Created with ${units.length} units`
      }]
    });

    // Save claim FIRST — if this fails, units remain 'approved' (no orphans)
    await claim.save();

    // Only after successful claim save, mark units as invoiced
    const approvedUnitIds = units.map(u => u._id);
    await UnitEntry.updateMany(
      { _id: { $in: approvedUnitIds } },
      { $set: { status: 'invoiced', claimId: claim._id } }
    );

    try {
      await notificationService.notifyClaimCreated({ claim, createdBy: user });
    } catch (error_) {
      console.error('[Claims:Create] Notification error:', error_.message);
    }

    res.status(201).json(claim);
  } catch (err) {
    console.error('Error creating claim:', err);
    res.status(500).json({ error: 'Failed to create claim' });
  }
};

/**
 * Update a claim
 * PUT /api/billing/claims/:id
 */
const updateClaim = async (req, res) => {
  try {
    const user = await loadUser(req, res);
    if (!user) return;

    const claimId = sanitizeObjectId(req.params.id);
    if (!claimId) {
      return res.status(400).json({ error: 'Invalid claim ID' });
    }

    const claim = await Claim.findOne({ _id: claimId, companyId: user.companyId });

    if (!claim) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    const { notes: bodyNotes, dueDate, status, description } = req.body;

    if (!['draft', 'pending_review'].includes(claim.status) && !status) {
      return res.status(400).json({ error: 'Cannot update claim in current status' });
    }

    if (bodyNotes !== undefined) claim.notes = bodyNotes;
    if (description !== undefined) claim.description = description;
    if (dueDate) claim.dueDate = new Date(dueDate);
    if (status && ['draft', 'pending_review', 'submitted', 'approved'].includes(status)) {
      const previousStatus = claim.status;
      claim.status = status;
      claim.changeLog.push({
        userId: user._id,
        action: 'status_changed',
        details: `Status changed from ${previousStatus} to ${status}`,
        previousStatus,
        newStatus: status
      });

      if (status === 'submitted') {
        claim.submittedBy = user._id;
        claim.submittedAt = new Date();
      }
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
};

/**
 * Delete a claim
 * DELETE /api/billing/claims/:id
 */
const deleteClaim = async (req, res) => {
  try {
    const user = await loadUser(req, res);
    if (!user) return;

    const claimId = sanitizeObjectId(req.params.id);
    if (!claimId) {
      return res.status(400).json({ error: 'Invalid claim ID' });
    }

    const claim = await Claim.findOne({ _id: claimId, companyId: user.companyId });

    if (!claim) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    if (claim.status !== 'draft' && !req.isAdmin && !req.isSuperAdmin) {
      return res.status(400).json({ error: 'Only admins can delete submitted claims' });
    }

    // Restore units to approved status
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
};

/**
 * Approve claim for submission
 * POST /api/billing/claims/:id/approve
 */
const approveClaim = async (req, res) => {
  try {
    const user = await loadUser(req, res);
    if (!user) return;

    const claimId = sanitizeObjectId(req.params.id);
    if (!claimId) {
      return res.status(400).json({ error: 'Invalid claim ID' });
    }

    if (!req.isAdmin && user.role !== 'pm') {
      return res.status(403).json({ error: 'Only PM or admin can approve claims' });
    }

    const claim = await Claim.findOne({ _id: claimId, companyId: user.companyId });

    if (!claim) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    if (!['draft', 'pending_review'].includes(claim.status)) {
      return res.status(400).json({ error: 'Claim cannot be approved in current status' });
    }

    const { notes } = req.body || {};

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
};

/**
 * Mark claim as submitted to utility
 * POST /api/billing/claims/:id/submit
 */
const submitClaim = async (req, res) => {
  try {
    const user = await loadUser(req, res);
    if (!user) return;

    const claimId = sanitizeObjectId(req.params.id);
    if (!claimId) {
      return res.status(400).json({ error: 'Invalid claim ID' });
    }

    const claim = await Claim.findOne({ _id: claimId, companyId: user.companyId });

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
    claim.dueDate = dueDate ? new Date(dueDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
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
};

/**
 * Record payment received
 * POST /api/billing/claims/:id/payment
 */
const recordPayment = async (req, res) => {
  try {
    const user = await loadUser(req, res);
    if (!user) return;

    const claimId = sanitizeObjectId(req.params.id);
    if (!claimId) {
      return res.status(400).json({ error: 'Invalid claim ID' });
    }

    const claim = await Claim.findOne({ _id: claimId, companyId: user.companyId });

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

    if (claim.status === 'paid') {
      const unitIds = claim.lineItems.map(li => li.unitEntryId).filter(Boolean);
      if (unitIds.length > 0) {
        await UnitEntry.updateMany(
          { _id: { $in: unitIds } },
          { $set: { status: 'paid', paidAt: new Date(), paidBy: user._id } }
        );
      }
    }

    res.json(claim);
  } catch (err) {
    console.error('Error recording payment:', err);
    res.status(500).json({ error: 'Failed to record payment' });
  }
};

/**
 * Export claim in Oracle Payables format
 * GET /api/billing/claims/:id/export-oracle
 */
const exportOracle = async (req, res) => {
  try {
    const user = await loadUser(req, res);
    if (!user) return;

    const claimId = sanitizeObjectId(req.params.id);
    if (!claimId) {
      return res.status(400).json({ error: 'Invalid claim ID' });
    }

    const claim = await Claim.findOne({ _id: claimId, companyId: user.companyId });

    if (!claim) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    const oraclePayload = claim.toOraclePayload();

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
};

/**
 * Export claim line items as CSV
 * GET /api/billing/claims/:id/export-csv
 */
const exportCSV = async (req, res) => {
  try {
    const user = await loadUser(req, res);
    if (!user) return;

    const claimId = sanitizeObjectId(req.params.id);
    if (!claimId) {
      return res.status(400).json({ error: 'Invalid claim ID' });
    }

    const claim = await Claim.findOne({ _id: claimId, companyId: user.companyId });

    if (!claim) {
      return res.status(404).json({ error: 'Claim not found' });
    }

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
};

/**
 * Export claim in Oracle FBDI format
 * GET /api/billing/claims/:id/export-fbdi
 */
const exportFBDI = async (req, res) => {
  try {
    const user = await loadUser(req, res);
    if (!user) return;

    const claimId = sanitizeObjectId(req.params.id);
    if (!claimId) {
      return res.status(400).json({ error: 'Invalid claim ID' });
    }

    const claim = await Claim.findOne({ _id: claimId, companyId: user.companyId });

    if (!claim) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    const fbdi = claim.toOracleFBDI();

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
};

/**
 * Bulk export multiple claims in Oracle FBDI format
 * POST /api/billing/claims/bulk-export-fbdi
 */
const bulkExportFBDI = async (req, res) => {
  try {
    const user = await loadUser(req, res);
    if (!user) return;

    const { claimIds } = req.body;
    if (!claimIds || !Array.isArray(claimIds) || claimIds.length === 0) {
      return res.status(400).json({ error: 'claimIds array required' });
    }

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

    const allHeaders = [];
    const allLines = [];
    let headerColumns = null;
    let lineColumns = null;

    for (const claim of claims) {
      const fbdi = claim.toOracleFBDI();
      headerColumns = headerColumns || fbdi.headerColumns;
      lineColumns = lineColumns || fbdi.lineColumns;
      allHeaders.push(fbdi.header);
      allLines.push(...fbdi.lines);

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
};

// ============================================================================
// ADMIN HANDLERS
// ============================================================================

/**
 * Delete or repair unit entries with missing price book data
 * POST /api/billing/admin/cleanup-orphaned-units
 */
const cleanupOrphanedUnits = async (req, res) => {
  try {
    const user = await loadUser(req, res);
    if (!user) return;

    if (!req.isAdmin) {
      return res.status(403).json({ error: 'Only admins can run cleanup operations' });
    }

    const { action = 'preview' } = req.body;
    const validActions = ['preview', 'delete', 'repair'];
    if (!validActions.includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Use: preview, delete, or repair' });
    }

    const allUnits = await UnitEntry.find({ companyId: user.companyId, isDeleted: { $ne: true } });

    const orphanedUnits = allUnits.filter(u =>
      !u.itemCode ||
      !u.description ||
      u.unitPrice === undefined ||
      u.unitPrice === null ||
      u.totalAmount === undefined ||
      u.totalAmount === null
    );

    if (orphanedUnits.length === 0) {
      return res.json({
        success: true,
        message: 'No orphaned units found',
        found: 0,
        action,
        processed: 0
      });
    }

    if (action === 'preview') {
      const preview = orphanedUnits.map(u => ({
        _id: u._id,
        status: u.status,
        jobId: u.jobId,
        priceBookId: u.priceBookId,
        priceBookItemId: u.priceBookItemId,
        itemCode: u.itemCode || '(missing)',
        description: u.description || '(missing)',
        unitPrice: u.unitPrice ?? '(missing)',
        quantity: u.quantity,
        createdAt: u.createdAt
      }));

      return res.json({
        success: true,
        message: `Found ${orphanedUnits.length} orphaned units. Use action: 'delete' or 'repair' to fix them.`,
        found: orphanedUnits.length,
        action: 'preview',
        units: preview
      });
    }

    const results = [];
    for (const unit of orphanedUnits) {
      const result = await processOrphanedUnit(unit, action);
      results.push(result);
    }

    const processed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    const statusWord = action === 'delete' ? 'Deleted' : 'Processed';
    const failedSuffix = failed > 0 ? `, ${failed} failed` : '';

    res.json({
      success: true,
      message: `${statusWord} ${processed} units${failedSuffix}`,
      found: orphanedUnits.length,
      action,
      processed,
      failed,
      results
    });
  } catch (err) {
    console.error('Error cleaning up orphaned units:', err);
    res.status(500).json({ error: 'Failed to cleanup orphaned units' });
  }
};

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Unit entry handlers
  listUnits,
  getUnbilledUnits,
  getDisputedUnits,
  getUnitById,
  createUnit,
  batchCreateUnits,
  submitUnit,
  verifyUnit,
  approveUnit,
  disputeUnit,
  resolveDispute,
  deleteUnit,
  // Claim handlers
  listClaims,
  getUnpaidClaims,
  getPastDueClaims,
  getClaimById,
  createClaim,
  updateClaim,
  deleteClaim,
  approveClaim,
  submitClaim,
  recordPayment,
  exportOracle,
  exportCSV,
  exportFBDI,
  bulkExportFBDI,
  // Admin
  cleanupOrphanedUnits
};
