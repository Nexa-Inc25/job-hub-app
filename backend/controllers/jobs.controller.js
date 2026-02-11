/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Jobs Controller
 * 
 * Handles job CRUD operations and workflow management.
 * Extracted from server.js for modularity and testability.
 * 
 * @module controllers/jobs
 */

const Job = require('../models/Job');
const { logJob } = require('../middleware/auditLogger');
const { sanitizeString, sanitizeObjectId, sanitizeInt, sanitizePmNumber } = require('../utils/sanitize');

/**
 * List all jobs accessible to the user
 * GET /api/jobs
 */
const listJobs = async (req, res) => {
  try {
    const { status, assignedTo, limit = 100, skip = 0 } = req.query;
    
    // Sanitize inputs to prevent NoSQL injection
    const safeStatus = sanitizeString(status);
    const safeAssignedTo = sanitizeObjectId(assignedTo);
    const safeLimit = sanitizeInt(limit, 100, 500);
    const safeSkip = sanitizeInt(skip, 0, 100000);
    
    // Build query based on user role
    const query = {};
    
    // Filter by status if provided
    if (safeStatus && safeStatus !== 'all') {
      query.status = safeStatus;
    }
    
    // Filter by assigned user if provided
    if (safeAssignedTo) {
      query.assignedTo = safeAssignedTo;
    }
    
    // Non-admins can only see jobs assigned to them or in their company
    if (!req.isAdmin && !req.isSuperAdmin) {
      query.$or = [
        { assignedTo: req.userId },
        { companyId: req.companyId }
      ];
    }
    
    const jobs = await Job.find(query)
      .sort({ updatedAt: -1 })
      .limit(safeLimit)
      .skip(safeSkip)
      .populate('assignedTo', 'name email')
      .lean();
    
    res.json(jobs);
    
  } catch (error) {
    console.error('List jobs error:', error);
    res.status(500).json({ error: 'Failed to list jobs' });
  }
};

/**
 * Get single job by ID
 * GET /api/jobs/:id
 */
const getJob = async (req, res) => {
  try {
    const { id } = req.params;
    
    const job = await Job.findById(id)
      .populate('assignedTo', 'name email role')
      .lean();
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Check access permissions for non-admins
    if (!req.isAdmin && !req.isSuperAdmin) {
      // Handle both populated and non-populated cases
      const assignedToId = job.assignedTo?._id?.toString() || job.assignedTo?.toString();
      const jobCompanyId = job.companyId?.toString();
      
      const hasAccess = 
        assignedToId === req.userId ||
        jobCompanyId === req.companyId;
      
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    
    res.json(job);
    
  } catch (error) {
    console.error('Get job error:', error);
    res.status(500).json({ error: 'Failed to get job' });
  }
};

/**
 * Create new job
 * POST /api/jobs
 */
const createJob = async (req, res) => {
  try {
    const {
      title,
      pmNumber,
      woNumber,
      address,
      description,
      client,
      assignedTo,
      scheduledDate
    } = req.body;
    
    // Sanitize inputs
    const safeTitle = sanitizeString(title);
    const safePmNumber = sanitizePmNumber(pmNumber);
    const safeWoNumber = sanitizePmNumber(woNumber);
    const safeAssignedTo = sanitizeObjectId(assignedTo);
    
    if (!safeTitle && !safePmNumber) {
      return res.status(400).json({ error: 'Title or PM Number is required' });
    }
    
    // Check for duplicate PM number
    if (safePmNumber) {
      const existing = await Job.findOne({ pmNumber: safePmNumber });
      if (existing) {
        return res.status(400).json({ error: 'PM Number already exists' });
      }
    }
    
    // Sanitize date input
    const safeScheduledDate = scheduledDate ? new Date(scheduledDate) : undefined;
    
    const job = await Job.create({
      title: safeTitle || safePmNumber,
      pmNumber: safePmNumber,
      woNumber: safeWoNumber,
      address: sanitizeString(address),
      description: sanitizeString(description),
      client: sanitizeString(client),
      assignedTo: safeAssignedTo,
      scheduledDate: safeScheduledDate,
      status: 'new',
      companyId: req.companyId
    });
    
    await logJob.create(req, job);
    
    res.status(201).json(job);
    
  } catch (error) {
    console.error('Create job error:', error);
    res.status(500).json({ error: 'Failed to create job' });
  }
};

/**
 * Update job
 * PUT /api/jobs/:id
 */
const updateJob = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // Prevent updating certain fields directly
    delete updates._id;
    delete updates.createdBy;
    delete updates.createdAt;
    
    const job = await Job.findById(id);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Track status change for audit
    const oldStatus = job.status;
    
    // Apply updates
    Object.assign(job, updates);
    job.updatedAt = new Date();
    
    await job.save();
    
    // Log status change if applicable
    if (updates.status && updates.status !== oldStatus) {
      await logJob.statusChange(req, job, oldStatus, updates.status);
    } else {
      await logJob.update(req, job, updates);
    }
    
    res.json(job);
    
  } catch (error) {
    console.error('Update job error:', error);
    res.status(500).json({ error: 'Failed to update job' });
  }
};

/**
 * Delete job
 * DELETE /api/jobs/:id
 */
const deleteJob = async (req, res) => {
  try {
    const { id } = req.params;
    
    const job = await Job.findById(id);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Only admins can delete jobs
    if (!req.isAdmin && !req.isSuperAdmin) {
      return res.status(403).json({ error: 'Only admins can delete jobs' });
    }
    
    await job.deleteOne();
    
    await logJob.delete(req, id, job.pmNumber);
    
    res.json({ message: 'Job deleted successfully' });
    
  } catch (error) {
    console.error('Delete job error:', error);
    res.status(500).json({ error: 'Failed to delete job' });
  }
};

/**
 * Update job status
 * PATCH /api/jobs/:id/status
 */
const updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }
    
    const job = await Job.findById(id);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const oldStatus = job.status;
    job.status = status;
    job.updatedAt = new Date();
    
    await job.save();
    
    await logJob.statusChange(req, job, oldStatus, status);
    
    res.json(job);
    
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
};

/**
 * Assign job to user
 * PATCH /api/jobs/:id/assign
 */
const assignJob = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, userName } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    const job = await Job.findById(id);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    job.assignedTo = userId;
    job.updatedAt = new Date();
    
    await job.save();
    
    await logJob.assign(req, job, userId, userName);
    
    res.json(job);
    
  } catch (error) {
    console.error('Assign job error:', error);
    res.status(500).json({ error: 'Failed to assign job' });
  }
};

/**
 * Cancel or reschedule job
 * POST /api/jobs/:id/cancel
 * 
 * Moves job back to pre_fielding status with reason tracking.
 * Used when a scheduled job needs to be unscheduled.
 */
const cancelJob = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, cancelType = 'canceled' } = req.body;
    
    // Validate inputs - explicit type check to handle non-string values properly
    if (typeof reason !== 'string' || !reason.trim()) {
      return res.status(400).json({ error: 'Cancellation reason is required' });
    }
    
    const validTypes = ['canceled', 'rescheduled'];
    if (!validTypes.includes(cancelType)) {
      return res.status(400).json({ error: 'Invalid cancel type. Must be "canceled" or "rescheduled"' });
    }
    
    const safeReason = sanitizeString(reason);
    
    const job = await Job.findById(id);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Only allow canceling jobs that are scheduled or in_progress
    const cancelableStatuses = ['scheduled', 'in_progress', 'assigned_to_gf'];
    if (!cancelableStatuses.includes(job.status)) {
      return res.status(400).json({ 
        error: `Cannot cancel job with status "${job.status}". Job must be scheduled or in progress.` 
      });
    }
    
    // Store the previous state in history
    job.cancelHistory = job.cancelHistory || [];
    job.cancelHistory.push({
      type: cancelType,
      reason: safeReason,
      previousStatus: job.status,
      previousScheduledDate: job.crewScheduledDate,
      canceledAt: new Date(),
      canceledBy: req.userId
    });
    
    // Update current cancel fields
    job.cancelReason = safeReason;
    job.canceledAt = new Date();
    job.canceledBy = req.userId;
    job.cancelType = cancelType;
    
    // Move to pre_fielding (unscheduled) - GF needs to reschedule
    const oldStatus = job.status;
    job.status = 'pre_fielding';
    
    // Clear scheduling fields
    job.crewScheduledDate = null;
    job.crewScheduledEndDate = null;
    
    job.updatedAt = new Date();
    
    await job.save();
    
    // Log the action
    await logJob.statusChange(req, job, oldStatus, 'pre_fielding', 
      `${cancelType === 'rescheduled' ? 'Rescheduled' : 'Canceled'}: ${safeReason}`);
    
    res.json({
      success: true,
      message: `Job ${cancelType === 'rescheduled' ? 'rescheduled' : 'canceled'} successfully`,
      job
    });
    
  } catch (error) {
    console.error('Cancel job error:', error);
    res.status(500).json({ error: 'Failed to cancel job' });
  }
};

module.exports = {
  listJobs,
  getJob,
  createJob,
  updateJob,
  deleteJob,
  updateStatus,
  assignJob,
  cancelJob
};

