/**
 * FieldLedger - Field Ticket Routes (T&M / Change Order)
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Endpoints for Time & Material / Change Order management:
 * - CRUD for field tickets
 * - Inspector signature capture
 * - "At Risk" dashboard aggregations
 * 
 * @swagger
 * tags:
 *   - name: FieldTickets
 *     description: Time & Material / Change Order management
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const FieldTicket = require('../models/FieldTicket');
const Job = require('../models/Job');
const User = require('../models/User');
const { sanitizeString, sanitizeObjectId, sanitizeInt, sanitizeDate } = require('../utils/sanitize');
const notificationService = require('../services/notification.service');

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Validate and sanitize labor entries
 */
function sanitizeLaborEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.map(entry => ({
    workerId: sanitizeObjectId(entry.workerId),
    workerName: sanitizeString(entry.workerName),
    role: ['foreman', 'journeyman', 'apprentice', 'laborer', 'operator', 'other'].includes(entry.role) 
      ? entry.role : 'journeyman',
    regularHours: typeof entry.regularHours === 'number' ? entry.regularHours : 0,
    overtimeHours: typeof entry.overtimeHours === 'number' ? entry.overtimeHours : 0,
    doubleTimeHours: typeof entry.doubleTimeHours === 'number' ? entry.doubleTimeHours : 0,
    regularRate: typeof entry.regularRate === 'number' ? entry.regularRate : 0,
    overtimeRate: typeof entry.overtimeRate === 'number' ? entry.overtimeRate : undefined,
    doubleTimeRate: typeof entry.doubleTimeRate === 'number' ? entry.doubleTimeRate : undefined,
    totalAmount: typeof entry.totalAmount === 'number' ? entry.totalAmount : 0,
    notes: sanitizeString(entry.notes)
  })).filter(e => e.workerName && e.regularRate);
}

/**
 * Validate and sanitize equipment entries
 */
function sanitizeEquipmentEntries(entries) {
  if (!Array.isArray(entries)) return [];
  const validTypes = new Set([
    'bucket_truck', 'digger_derrick', 'crane', 'excavator', 'backhoe',
    'trencher', 'dump_truck', 'flatbed', 'trailer', 'generator',
    'compressor', 'pump', 'welder', 'tensioner', 'puller', 'other'
  ]);
  return entries.map(entry => ({
    equipmentId: sanitizeString(entry.equipmentId),
    equipmentType: validTypes.has(entry.equipmentType) ? entry.equipmentType : 'other',
    description: sanitizeString(entry.description),
    hours: typeof entry.hours === 'number' ? entry.hours : 0,
    hourlyRate: typeof entry.hourlyRate === 'number' ? entry.hourlyRate : 0,
    standbyHours: typeof entry.standbyHours === 'number' ? entry.standbyHours : 0,
    standbyRate: typeof entry.standbyRate === 'number' ? entry.standbyRate : undefined,
    totalAmount: typeof entry.totalAmount === 'number' ? entry.totalAmount : 0,
    notes: sanitizeString(entry.notes)
  })).filter(e => e.description && e.hourlyRate);
}

/**
 * Validate and sanitize material entries
 */
function sanitizeMaterialEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.map(entry => ({
    materialCode: sanitizeString(entry.materialCode),
    description: sanitizeString(entry.description),
    quantity: typeof entry.quantity === 'number' ? entry.quantity : 0,
    unit: sanitizeString(entry.unit) || 'EA',
    unitCost: typeof entry.unitCost === 'number' ? entry.unitCost : 0,
    markup: typeof entry.markup === 'number' ? entry.markup : 0,
    totalAmount: typeof entry.totalAmount === 'number' ? entry.totalAmount : 0,
    source: ['stock', 'purchased', 'utility_provided', 'rental'].includes(entry.source) 
      ? entry.source : 'stock',
    purchaseOrderNumber: sanitizeString(entry.purchaseOrderNumber),
    notes: sanitizeString(entry.notes)
  })).filter(e => e.description && e.quantity);
}

/**
 * Sanitize location object
 */
function sanitizeLocation(location) {
  if (!location || typeof location !== 'object') return null;
  return {
    latitude: typeof location.latitude === 'number' ? location.latitude : undefined,
    longitude: typeof location.longitude === 'number' ? location.longitude : undefined,
    accuracy: typeof location.accuracy === 'number' ? location.accuracy : undefined,
    altitude: typeof location.altitude === 'number' ? location.altitude : undefined,
    capturedAt: location.capturedAt ? new Date(location.capturedAt) : new Date()
  };
}

/**
 * Sanitize photos array
 */
function sanitizePhotos(photos) {
  if (!Array.isArray(photos)) return [];
  const validTypes = new Set(['condition', 'obstruction', 'work_in_progress', 'completed', 'damage', 'other']);
  return photos.map(photo => {
    if (!photo || typeof photo !== 'object') return null;
    return {
      url: sanitizeString(photo.url),
      r2Key: sanitizeString(photo.r2Key),
      fileName: sanitizeString(photo.fileName),
      mimeType: sanitizeString(photo.mimeType) || 'image/jpeg',
      gpsCoordinates: photo.gpsCoordinates ? sanitizeLocation(photo.gpsCoordinates) : undefined,
      capturedAt: photo.capturedAt ? new Date(photo.capturedAt) : new Date(),
      photoType: validTypes.has(photo.photoType) ? photo.photoType : 'work_in_progress',
      description: sanitizeString(photo.description)
    };
  }).filter(Boolean);
}

// ============================================================================
// FIELD TICKET CRUD
// ============================================================================

/**
 * @swagger
 * /api/fieldtickets:
 *   get:
 *     summary: List field tickets for company
 *     tags: [FieldTickets]
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
 *           enum: [draft, pending_signature, signed, approved, disputed, billed, paid, voided]
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
 *         description: List of field tickets
 */
router.get('/', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const { jobId, status, startDate, endDate, limit = 100 } = req.query;
    
    const query = { 
      companyId: user.companyId,
      isDeleted: { $ne: true }
    };

    const safeJobId = sanitizeObjectId(jobId);
    if (safeJobId) query.jobId = safeJobId;
    
    const safeStatus = sanitizeString(status);
    if (safeStatus) query.status = safeStatus;
    
    const safeStartDate = sanitizeDate(startDate);
    const safeEndDate = sanitizeDate(endDate);
    if (safeStartDate || safeEndDate) {
      query.workDate = {};
      if (safeStartDate) query.workDate.$gte = safeStartDate;
      if (safeEndDate) query.workDate.$lte = safeEndDate;
    }

    // Role-based filtering: foreman sees own tickets, GF/PM/Admin see all
    if (user.role === 'foreman') {
      query.createdBy = user._id;
    }

    const tickets = await FieldTicket.find(query)
      .populate('jobId', 'woNumber pmNumber address')
      .populate('createdBy', 'name email')
      .populate('approvedBy', 'name')
      .sort({ workDate: -1, createdAt: -1 })
      .limit(sanitizeInt(limit, 100, 500));

    res.json(tickets);
  } catch (err) {
    console.error('Error listing field tickets:', err);
    res.status(500).json({ error: 'Failed to list field tickets' });
  }
});

/**
 * @swagger
 * /api/fieldtickets/at-risk:
 *   get:
 *     summary: Get "At Risk" field tickets (unapproved T&M)
 *     description: Returns tickets in draft or pending_signature status with total dollar value
 *     tags: [FieldTickets]
 *     security:
 *       - bearerAuth: []
 */
router.get('/at-risk', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const [tickets, totals] = await Promise.all([
      FieldTicket.getAtRisk(user.companyId),
      FieldTicket.getAtRiskTotal(user.companyId)
    ]);

    // Group by status for dashboard
    const byStatus = {
      draft: tickets.filter(t => t.status === 'draft'),
      pending_signature: tickets.filter(t => t.status === 'pending_signature')
    };

    res.json({
      totalAtRisk: totals.totalAtRisk,
      ticketCount: totals.count,
      byStatus,
      tickets
    });
  } catch (err) {
    console.error('Error getting at-risk tickets:', err);
    res.status(500).json({ error: 'Failed to get at-risk tickets' });
  }
});

/**
 * @swagger
 * /api/fieldtickets/approved:
 *   get:
 *     summary: Get approved tickets ready for billing
 *     tags: [FieldTickets]
 *     security:
 *       - bearerAuth: []
 */
router.get('/approved', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const tickets = await FieldTicket.getApprovedForBilling(user.companyId);
    const totalAmount = tickets.reduce((sum, t) => sum + t.totalAmount, 0);

    res.json({
      count: tickets.length,
      totalAmount,
      tickets
    });
  } catch (err) {
    console.error('Error getting approved tickets:', err);
    res.status(500).json({ error: 'Failed to get approved tickets' });
  }
});

/**
 * @swagger
 * /api/fieldtickets/{id}:
 *   get:
 *     summary: Get field ticket by ID
 *     tags: [FieldTickets]
 *     security:
 *       - bearerAuth: []
 */
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const ticketId = sanitizeObjectId(req.params.id);
    if (!ticketId) {
      return res.status(400).json({ error: 'Invalid ticket ID' });
    }

    const ticket = await FieldTicket.findOne({
      _id: ticketId,
      companyId: user.companyId,
      isDeleted: { $ne: true }
    })
      .populate('jobId', 'woNumber pmNumber address city client')
      .populate('createdBy', 'name email')
      .populate('approvedBy', 'name');

    if (!ticket) {
      return res.status(404).json({ error: 'Field ticket not found' });
    }

    res.json(ticket);
  } catch (err) {
    console.error('Error getting field ticket:', err);
    res.status(500).json({ error: 'Failed to get field ticket' });
  }
});

/**
 * @swagger
 * /api/fieldtickets:
 *   post:
 *     summary: Create a new field ticket
 *     tags: [FieldTickets]
 *     security:
 *       - bearerAuth: []
 */
router.post('/', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const {
      jobId: rawJobId,
      changeReason,
      changeDescription,
      workDate,
      workStartTime,
      workEndTime,
      location,
      locationDescription,
      laborEntries,
      equipmentEntries,
      materialEntries,
      photos,
      markupRate,
      internalNotes,
      offlineId
    } = req.body;

    // Validate required fields
    const jobId = sanitizeObjectId(rawJobId);
    if (!jobId || !changeReason || !changeDescription || !workDate || !location) {
      return res.status(400).json({ 
        error: 'Missing required fields: jobId, changeReason, changeDescription, workDate, location' 
      });
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

    // Validate change reason
    const validReasons = [
      'scope_change', 'unforeseen_condition', 'utility_request', 'safety_requirement',
      'permit_requirement', 'design_error', 'weather_damage', 'third_party_damage', 'other'
    ];
    if (!validReasons.includes(changeReason)) {
      return res.status(400).json({ error: 'Invalid change reason' });
    }

    // Create the field ticket
    const ticket = new FieldTicket({
      jobId,
      companyId: user.companyId,
      changeReason,
      changeDescription: sanitizeString(changeDescription),
      workDate: new Date(workDate),
      workStartTime: sanitizeString(workStartTime),
      workEndTime: sanitizeString(workEndTime),
      location: sanitizeLocation(location),
      locationDescription: sanitizeString(locationDescription),
      laborEntries: sanitizeLaborEntries(laborEntries),
      equipmentEntries: sanitizeEquipmentEntries(equipmentEntries),
      materialEntries: sanitizeMaterialEntries(materialEntries),
      photos: sanitizePhotos(photos),
      markupRate: typeof markupRate === 'number' ? markupRate : 0,
      internalNotes: sanitizeString(internalNotes),
      createdBy: user._id,
      foremanId: user._id,
      foremanName: user.name,
      offlineId: sanitizeString(offlineId),
      syncStatus: offlineId ? 'pending' : 'synced',
      syncedAt: offlineId ? undefined : new Date()
    });

    await ticket.save();

    res.status(201).json(ticket);
  } catch (err) {
    console.error('Error creating field ticket:', err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to create field ticket' });
  }
});

/**
 * @swagger
 * /api/fieldtickets/{id}:
 *   put:
 *     summary: Update a field ticket
 *     tags: [FieldTickets]
 *     security:
 *       - bearerAuth: []
 */
router.put('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const ticketId = sanitizeObjectId(req.params.id);
    if (!ticketId) {
      return res.status(400).json({ error: 'Invalid ticket ID' });
    }

    const ticket = await FieldTicket.findOne({
      _id: ticketId,
      companyId: user.companyId,
      isDeleted: { $ne: true }
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Field ticket not found' });
    }

    // Only allow updates on draft/pending_signature tickets
    if (!['draft', 'pending_signature'].includes(ticket.status)) {
      return res.status(400).json({ error: 'Cannot update ticket in current status' });
    }

    const {
      changeDescription,
      workStartTime,
      workEndTime,
      locationDescription,
      laborEntries,
      equipmentEntries,
      materialEntries,
      photos,
      markupRate,
      internalNotes
    } = req.body;

    // Update allowed fields
    if (changeDescription) ticket.changeDescription = sanitizeString(changeDescription);
    if (workStartTime !== undefined) ticket.workStartTime = sanitizeString(workStartTime);
    if (workEndTime !== undefined) ticket.workEndTime = sanitizeString(workEndTime);
    if (locationDescription !== undefined) ticket.locationDescription = sanitizeString(locationDescription);
    if (laborEntries) ticket.laborEntries = sanitizeLaborEntries(laborEntries);
    if (equipmentEntries) ticket.equipmentEntries = sanitizeEquipmentEntries(equipmentEntries);
    if (materialEntries) ticket.materialEntries = sanitizeMaterialEntries(materialEntries);
    if (photos) ticket.photos = sanitizePhotos(photos);
    if (typeof markupRate === 'number') ticket.markupRate = markupRate;
    if (internalNotes !== undefined) ticket.internalNotes = sanitizeString(internalNotes);

    await ticket.save();
    res.json(ticket);
  } catch (err) {
    console.error('Error updating field ticket:', err);
    res.status(500).json({ error: 'Failed to update field ticket' });
  }
});

/**
 * @swagger
 * /api/fieldtickets/{id}:
 *   delete:
 *     summary: Soft delete a field ticket
 *     tags: [FieldTickets]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const ticketId = sanitizeObjectId(req.params.id);
    if (!ticketId) {
      return res.status(400).json({ error: 'Invalid ticket ID' });
    }

    const ticket = await FieldTicket.findOne({
      _id: ticketId,
      companyId: user.companyId,
      isDeleted: { $ne: true }
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Field ticket not found' });
    }

    // Only allow deletion of draft tickets (or admin can delete any)
    if (ticket.status !== 'draft' && !req.isAdmin) {
      return res.status(400).json({ error: 'Can only delete draft tickets' });
    }

    const { reason } = req.body;
    ticket.isDeleted = true;
    ticket.deletedAt = new Date();
    ticket.deletedBy = user._id;
    ticket.deleteReason = sanitizeString(reason) || 'Deleted by user';
    await ticket.save();

    res.json({ success: true, message: 'Field ticket deleted' });
  } catch (err) {
    console.error('Error deleting field ticket:', err);
    res.status(500).json({ error: 'Failed to delete field ticket' });
  }
});

// ============================================================================
// WORKFLOW ACTIONS
// ============================================================================

/**
 * @swagger
 * /api/fieldtickets/{id}/submit:
 *   post:
 *     summary: Submit ticket for inspector signature
 *     tags: [FieldTickets]
 *     security:
 *       - bearerAuth: []
 */
router.post('/:id/submit', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const ticketId = sanitizeObjectId(req.params.id);
    if (!ticketId) {
      return res.status(400).json({ error: 'Invalid ticket ID' });
    }

    const ticket = await FieldTicket.findOne({
      _id: ticketId,
      companyId: user.companyId,
      isDeleted: { $ne: true }
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Field ticket not found' });
    }

    if (ticket.status !== 'draft') {
      return res.status(400).json({ error: 'Only draft tickets can be submitted' });
    }

    await ticket.submitForSignature(user._id);
    res.json(ticket);
  } catch (err) {
    console.error('Error submitting field ticket:', err);
    res.status(500).json({ error: err.message || 'Failed to submit field ticket' });
  }
});

/**
 * @swagger
 * /api/fieldtickets/{id}/sign:
 *   post:
 *     summary: Add inspector signature to ticket
 *     tags: [FieldTickets]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - signatureData
 *               - signerName
 *             properties:
 *               signatureData:
 *                 type: string
 *                 description: Base64 encoded signature image
 *               signerName:
 *                 type: string
 *               signerTitle:
 *                 type: string
 *               signerCompany:
 *                 type: string
 *               signerEmployeeId:
 *                 type: string
 *               signatureLocation:
 *                 type: object
 *                 properties:
 *                   latitude:
 *                     type: number
 *                   longitude:
 *                     type: number
 */
router.post('/:id/sign', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const ticketId = sanitizeObjectId(req.params.id);
    if (!ticketId) {
      return res.status(400).json({ error: 'Invalid ticket ID' });
    }

    const ticket = await FieldTicket.findOne({
      _id: ticketId,
      companyId: user.companyId,
      isDeleted: { $ne: true }
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Field ticket not found' });
    }

    if (ticket.status !== 'pending_signature') {
      return res.status(400).json({ error: 'Ticket is not awaiting signature' });
    }

    const {
      signatureData,
      signerName,
      signerTitle,
      signerCompany,
      signerEmployeeId,
      signatureLocation
    } = req.body;

    if (!signatureData || !signerName) {
      return res.status(400).json({ error: 'Signature data and signer name are required' });
    }

    const signature = {
      signatureData: sanitizeString(signatureData),
      signedAt: new Date(),
      signerName: sanitizeString(signerName),
      signerTitle: sanitizeString(signerTitle),
      signerCompany: sanitizeString(signerCompany),
      signerEmployeeId: sanitizeString(signerEmployeeId),
      signatureLocation: signatureLocation ? sanitizeLocation(signatureLocation) : undefined,
      deviceInfo: req.headers['user-agent']
    };

    await ticket.addSignature(signature);

    // Notify PM that a ticket has been signed
    try {
      const job = await Job.findById(ticket.jobId).select('userId companyId woNumber').lean();
      if (job) {
        await notificationService.createNotification({
          userId: job.userId,
          companyId: job.companyId,
          type: 'field_ticket_signed',
          title: 'Field Ticket Signed',
          message: `Field ticket ${ticket.ticketNumber} for WO ${job.woNumber} has been signed by ${signerName}`,
          link: `/billing/field-tickets/${ticket._id}`
        });
      }
    } catch (error_) {
      console.error('[FieldTicket:Sign] Notification error:', error_.message);
    }

    res.json(ticket);
  } catch (err) {
    console.error('Error signing field ticket:', err);
    res.status(500).json({ error: 'Failed to sign field ticket' });
  }
});

/**
 * @swagger
 * /api/fieldtickets/{id}/approve:
 *   post:
 *     summary: Approve field ticket for billing
 *     tags: [FieldTickets]
 *     security:
 *       - bearerAuth: []
 */
router.post('/:id/approve', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    // Only PM/GF/Admin can approve
    if (!['pm', 'gf', 'admin'].includes(user.role) && !req.isAdmin) {
      return res.status(403).json({ error: 'Not authorized to approve field tickets' });
    }

    const ticketId = sanitizeObjectId(req.params.id);
    if (!ticketId) {
      return res.status(400).json({ error: 'Invalid ticket ID' });
    }

    const ticket = await FieldTicket.findOne({
      _id: ticketId,
      companyId: user.companyId,
      isDeleted: { $ne: true }
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Field ticket not found' });
    }

    if (ticket.status !== 'signed') {
      return res.status(400).json({ error: 'Only signed tickets can be approved' });
    }

    const { notes } = req.body;
    await ticket.approve(user._id, sanitizeString(notes));

    res.json(ticket);
  } catch (err) {
    console.error('Error approving field ticket:', err);
    res.status(500).json({ error: err.message || 'Failed to approve field ticket' });
  }
});

/**
 * @swagger
 * /api/fieldtickets/{id}/dispute:
 *   post:
 *     summary: Dispute a field ticket
 *     tags: [FieldTickets]
 *     security:
 *       - bearerAuth: []
 */
router.post('/:id/dispute', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const ticketId = sanitizeObjectId(req.params.id);
    if (!ticketId) {
      return res.status(400).json({ error: 'Invalid ticket ID' });
    }

    const ticket = await FieldTicket.findOne({
      _id: ticketId,
      companyId: user.companyId,
      isDeleted: { $ne: true }
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Field ticket not found' });
    }

    const { reason } = req.body;
    if (!reason) {
      return res.status(400).json({ error: 'Dispute reason is required' });
    }

    await ticket.dispute(user._id, sanitizeString(reason));
    res.json(ticket);
  } catch (err) {
    console.error('Error disputing field ticket:', err);
    res.status(500).json({ error: 'Failed to dispute field ticket' });
  }
});

/**
 * @swagger
 * /api/fieldtickets/{id}/photos:
 *   post:
 *     summary: Add photos to a field ticket
 *     tags: [FieldTickets]
 *     security:
 *       - bearerAuth: []
 */
router.post('/:id/photos', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const ticketId = sanitizeObjectId(req.params.id);
    if (!ticketId) {
      return res.status(400).json({ error: 'Invalid ticket ID' });
    }

    const ticket = await FieldTicket.findOne({
      _id: ticketId,
      companyId: user.companyId,
      isDeleted: { $ne: true }
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Field ticket not found' });
    }

    // Only allow adding photos to draft/pending_signature tickets
    if (!['draft', 'pending_signature'].includes(ticket.status)) {
      return res.status(400).json({ error: 'Cannot add photos to ticket in current status' });
    }

    const { photos } = req.body;
    if (!photos || !Array.isArray(photos)) {
      return res.status(400).json({ error: 'Photos array required' });
    }

    const sanitizedPhotos = sanitizePhotos(photos);
    ticket.photos.push(...sanitizedPhotos);
    await ticket.save();

    res.json(ticket);
  } catch (err) {
    console.error('Error adding photos to field ticket:', err);
    res.status(500).json({ error: 'Failed to add photos' });
  }
});

module.exports = router;

