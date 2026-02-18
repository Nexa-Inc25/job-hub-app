/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Jobs Controller
 * 
 * Handles job CRUD operations and workflow management.
 *
 * SECURITY — Ghost Ship Audit Fix #2: Fail-Closed Tenant Isolation
 *
 * Every handler enforces:
 *   1. Explicit companyId requirement (no companyId + no superAdmin = 403)
 *   2. All queries inject companyId filter (superAdmins excluded)
 *   3. No isAdmin bypass — company admins are scoped to their company
 *   4. No undefined === undefined — both sides must be truthy AND equal
 * 
 * @module controllers/jobs
 */

const Job = require('../models/Job');
const { logJob } = require('../middleware/auditLogger');
const { sanitizeString, sanitizeObjectId, sanitizeInt, sanitizePmNumber } = require('../utils/sanitize');
const log = require('../utils/logger');

// ---------------------------------------------------------------------------
// Fail-Closed Guard — used by every handler
// ---------------------------------------------------------------------------

/**
 * Enforce company context. Returns the companyId string or sends 403.
 * SuperAdmins bypass — they get null (meaning "no company filter").
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {string|null|false} companyId string, null for superAdmin, false if denied (response already sent)
 */
function requireCompanyContext(req, res) {
  if (req.isSuperAdmin) return null; // superAdmin: no company filter

  const companyId = req.companyId?.toString();
  if (!companyId) {
    log.error({ userId: req.userId, requestId: req.requestId }, 'Access Denied: Missing Company Context');
    res.status(403).json({ error: 'Unauthorized: Company context required.', code: 'NO_COMPANY' });
    return false;
  }
  return companyId;
}

/**
 * Build a company-scoped query for a single job by ID.
 * SuperAdmins get { _id: id }. Everyone else gets { _id: id, companyId }.
 */
function scopedJobQuery(id, companyId) {
  const query = { _id: id };
  if (companyId !== null) {
    query.companyId = companyId;
  }
  return query;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * List all jobs accessible to the user
 * GET /api/jobs
 */
const listJobs = async (req, res) => {
  try {
    const companyId = requireCompanyContext(req, res);
    if (companyId === false) return;

    const { status, assignedTo, limit = 100, skip = 0 } = req.query;
    const safeStatus = sanitizeString(status);
    const safeAssignedTo = sanitizeObjectId(assignedTo);
    const safeLimit = sanitizeInt(limit, 100, 500);
    const safeSkip = sanitizeInt(skip, 0, 100000);
    
    const query = {};

    // SuperAdmins see all; everyone else is scoped to their company
    if (companyId !== null) {
      query.$or = [
        { assignedTo: req.userId },
        { companyId }
      ];
    }

    if (safeStatus && safeStatus !== 'all') {
      query.status = safeStatus;
    }
    if (safeAssignedTo) {
      query.assignedTo = safeAssignedTo;
    }
    
    const jobs = await Job.find(query)
      .sort({ updatedAt: -1 })
      .limit(safeLimit)
      .skip(safeSkip)
      .populate('assignedTo', 'name email')
      .lean();
    
    res.json(jobs);
  } catch (error) {
    log.error({ err: error, requestId: req.requestId }, 'List jobs error');
    res.status(500).json({ error: 'Failed to list jobs' });
  }
};

/**
 * Get single job by ID
 * GET /api/jobs/:id
 */
const getJob = async (req, res) => {
  try {
    const companyId = requireCompanyContext(req, res);
    if (companyId === false) return;

    const { id } = req.params;
    
    const job = await Job.findOne(scopedJobQuery(id, companyId))
      .populate('assignedTo', 'name email role')
      .lean();
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json(job);
  } catch (error) {
    log.error({ err: error, requestId: req.requestId }, 'Get job error');
    res.status(500).json({ error: 'Failed to get job' });
  }
};

/**
 * Create new job
 * POST /api/jobs
 */
const createJob = async (req, res) => {
  try {
    const companyId = requireCompanyContext(req, res);
    if (companyId === false) return;
    // SuperAdmins must provide a companyId in the body to create jobs
    if (companyId === null && !req.body.companyId) {
      return res.status(400).json({ error: 'companyId is required for superAdmin job creation' });
    }

    const {
      title, pmNumber, woNumber, address, description, client,
      assignedTo, scheduledDate
    } = req.body;
    
    const safeTitle = sanitizeString(title);
    const safePmNumber = sanitizePmNumber(pmNumber);
    const safeWoNumber = sanitizePmNumber(woNumber);
    const safeAssignedTo = sanitizeObjectId(assignedTo);
    
    if (!safeTitle && !safePmNumber) {
      return res.status(400).json({ error: 'Title or PM Number is required' });
    }
    
    // Duplicate PM check scoped to company
    if (safePmNumber) {
      const dupQuery = { pmNumber: safePmNumber };
      if (companyId !== null) dupQuery.companyId = companyId;
      const existing = await Job.findOne(dupQuery);
      if (existing) {
        return res.status(400).json({ error: 'PM Number already exists' });
      }
    }
    
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
      companyId: companyId || sanitizeObjectId(req.body.companyId)
    });
    
    await logJob.create(req, job);
    res.status(201).json(job);
  } catch (error) {
    log.error({ err: error, requestId: req.requestId }, 'Create job error');
    res.status(500).json({ error: 'Failed to create job' });
  }
};

/**
 * Update job
 * PUT /api/jobs/:id
 */
const updateJob = async (req, res) => {
  try {
    const companyId = requireCompanyContext(req, res);
    if (companyId === false) return;

    const { id } = req.params;
    const updates = req.body;
    
    // Prevent updating protected fields
    delete updates._id;
    delete updates.createdBy;
    delete updates.createdAt;
    delete updates.companyId; // Cannot reassign tenant ownership
    
    const job = await Job.findOne(scopedJobQuery(id, companyId));
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const oldStatus = job.status;
    Object.assign(job, updates);
    job.updatedAt = new Date();
    await job.save();
    
    if (updates.status && updates.status !== oldStatus) {
      await logJob.statusChange(req, job, oldStatus, updates.status);
    } else {
      await logJob.update(req, job, updates);
    }
    
    res.json(job);
  } catch (error) {
    log.error({ err: error, requestId: req.requestId }, 'Update job error');
    res.status(500).json({ error: 'Failed to update job' });
  }
};

/**
 * Delete job
 * DELETE /api/jobs/:id
 */
const deleteJob = async (req, res) => {
  try {
    const companyId = requireCompanyContext(req, res);
    if (companyId === false) return;

    // Only company admins or superAdmins can delete
    if (!req.isAdmin && !req.isSuperAdmin) {
      return res.status(403).json({ error: 'Only admins can delete jobs' });
    }

    const { id } = req.params;
    const job = await Job.findOne(scopedJobQuery(id, companyId));
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    await job.deleteOne();
    await logJob.delete(req, id, job.pmNumber);
    res.json({ message: 'Job deleted successfully' });
  } catch (error) {
    log.error({ err: error, requestId: req.requestId }, 'Delete job error');
    res.status(500).json({ error: 'Failed to delete job' });
  }
};

/**
 * Update job status
 * PATCH /api/jobs/:id/status
 */
const updateStatus = async (req, res) => {
  try {
    const companyId = requireCompanyContext(req, res);
    if (companyId === false) return;

    const { id } = req.params;
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }
    
    const job = await Job.findOne(scopedJobQuery(id, companyId));
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
    log.error({ err: error, requestId: req.requestId }, 'Update status error');
    res.status(500).json({ error: 'Failed to update status' });
  }
};

/**
 * Assign job to user
 * PATCH /api/jobs/:id/assign
 */
const assignJob = async (req, res) => {
  try {
    const companyId = requireCompanyContext(req, res);
    if (companyId === false) return;

    const { id } = req.params;
    const { userId, userName } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    const job = await Job.findOne(scopedJobQuery(id, companyId));
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    job.assignedTo = userId;
    job.updatedAt = new Date();
    await job.save();
    
    await logJob.assign(req, job, userId, userName);
    res.json(job);
  } catch (error) {
    log.error({ err: error, requestId: req.requestId }, 'Assign job error');
    res.status(500).json({ error: 'Failed to assign job' });
  }
};

/**
 * Cancel or reschedule job
 * POST /api/jobs/:id/cancel
 */
const cancelJob = async (req, res) => {
  try {
    const companyId = requireCompanyContext(req, res);
    if (companyId === false) return;

    const { id } = req.params;
    const { reason, cancelType = 'canceled' } = req.body;
    
    if (typeof reason !== 'string' || !reason.trim()) {
      return res.status(400).json({ error: 'Cancellation reason is required' });
    }
    const validTypes = ['canceled', 'rescheduled'];
    if (!validTypes.includes(cancelType)) {
      return res.status(400).json({ error: 'Invalid cancel type. Must be "canceled" or "rescheduled"' });
    }
    
    const safeReason = sanitizeString(reason);
    const job = await Job.findOne(scopedJobQuery(id, companyId));
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const cancelableStatuses = ['scheduled', 'in_progress', 'assigned_to_gf'];
    if (!cancelableStatuses.includes(job.status)) {
      return res.status(400).json({ 
        error: `Cannot cancel job with status "${job.status}". Job must be scheduled or in progress.` 
      });
    }
    
    job.cancelHistory = job.cancelHistory || [];
    job.cancelHistory.push({
      type: cancelType,
      reason: safeReason,
      previousStatus: job.status,
      previousScheduledDate: job.crewScheduledDate,
      canceledAt: new Date(),
      canceledBy: req.userId
    });
    
    job.cancelReason = safeReason;
    job.canceledAt = new Date();
    job.canceledBy = req.userId;
    job.cancelType = cancelType;
    
    const oldStatus = job.status;
    job.status = 'pre_fielding';
    job.crewScheduledDate = null;
    job.crewScheduledEndDate = null;
    job.updatedAt = new Date();
    
    await job.save();
    
    await logJob.statusChange(req, job, oldStatus, 'pre_fielding', 
      `${cancelType === 'rescheduled' ? 'Rescheduled' : 'Canceled'}: ${safeReason}`);
    
    res.json({
      success: true,
      message: `Job ${cancelType === 'rescheduled' ? 'rescheduled' : 'canceled'} successfully`,
      job
    });
  } catch (error) {
    log.error({ err: error, requestId: req.requestId }, 'Cancel job error');
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
