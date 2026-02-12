/**
 * FieldLedger - Job Lifecycle Routes
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Job lifecycle: delete (soft), archive, restore, status transitions, review.
 * Mounted at /api/jobs with auth middleware.
 */

const express = require('express');
const router = express.Router();
const Job = require('../models/Job');
const User = require('../models/User');
const aiDataCapture = require('../utils/aiDataCapture');

// Jobs are never truly deleted - they're marked as deleted and hidden from UI
// R2 files and AI training data remain intact
router.delete('/:id', async (req, res) => {
  try {
    // Sanitize user input before logging to prevent log injection
    const safeJobId = String(req.params.id || '').slice(0, 50).replace(/[\n\r\t]/g, '');
    console.log('Soft-deleting job by ID:', safeJobId);
    console.log('User ID from token:', req.userId, 'isAdmin:', req.isAdmin, 'role:', req.userRole);
    
    const { reason } = req.body || {};

    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // ============================================
    const currentUser = await User.findById(req.userId).select('companyId');
    const userCompanyId = currentUser?.companyId;

    const query = { _id: req.params.id };
    
    // CRITICAL: Always filter by company
    if (userCompanyId) {
      query.companyId = userCompanyId;
    }
    
    // Admin and PM can delete any job IN THEIR COMPANY
    // Others can only delete their own jobs
    if (!req.isAdmin && req.userRole !== 'pm' && req.userRole !== 'admin') {
      query.userId = req.userId;
    }
    
    const job = await Job.findOne(query);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Soft delete - mark as deleted but preserve all data
    job.isDeleted = true;
    job.deletedAt = new Date();
    job.deletedBy = req.userId;
    job.deleteReason = reason || 'User deleted from dashboard';
    
    await job.save();

    console.log('Job soft-deleted:', job._id, 'PM:', job.pmNumber);
    res.json({ 
      message: 'Work order removed from dashboard', 
      jobId: job._id,
      note: 'Data preserved for compliance and AI training'
    });
  } catch (err) {
    console.error('Error soft-deleting job:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// ARCHIVE JOB - Move completed/billed jobs to archive for long-term storage
// Keeps data for AI training and utility compliance (7+ year retention)
router.post('/:id/archive', async (req, res) => {
  try {
    const { reason } = req.body;
    
    // Only admin/PM can archive jobs
    if (!req.isAdmin && req.userRole !== 'pm' && req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Only PM or Admin can archive jobs' });
    }
    
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // ============================================
    const currentUser = await User.findById(req.userId).select('companyId');
    const query = { _id: req.params.id };
    if (currentUser?.companyId) {
      query.companyId = currentUser.companyId;
    }
    
    const job = await Job.findOne(query);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Set archive fields
    job.isArchived = true;
    job.archivedAt = new Date();
    job.archivedBy = req.userId;
    job.archiveReason = reason || 'Manual archive';
    
    // Set retention policy - default 7 years for utility compliance
    const retentionYears = 7;
    job.retentionExpiresAt = new Date(Date.now() + retentionYears * 365 * 24 * 60 * 60 * 1000);
    job.retentionPolicy = 'utility_7_year';
    
    await job.save();
    
    console.log('Job archived:', job._id, 'PM:', job.pmNumber, 'Retention until:', job.retentionExpiresAt);
    res.json({ 
      message: 'Work order archived successfully',
      jobId: job._id,
      retentionExpiresAt: job.retentionExpiresAt,
      note: 'Job preserved for compliance. Can be retrieved from archive.'
    });
  } catch (err) {
    console.error('Error archiving job:', err);
    res.status(500).json({ error: 'Failed to archive job', details: err.message });
  }
});

// RESTORE JOB - Bring back a deleted or archived job
router.post('/:id/restore', async (req, res) => {
  try {
    // Only admin can restore jobs
    if (!req.isAdmin && req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Only Admin can restore jobs' });
    }
    
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // ============================================
    const currentUser = await User.findById(req.userId).select('companyId');
    const query = { _id: req.params.id };
    if (currentUser?.companyId) {
      query.companyId = currentUser.companyId;
    }
    
    const job = await Job.findOne(query);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Clear delete/archive flags
    job.isDeleted = false;
    job.deletedAt = null;
    job.deletedBy = null;
    job.deleteReason = null;
    job.isArchived = false;
    job.archivedAt = null;
    job.archivedBy = null;
    job.archiveReason = null;
    
    await job.save();
    
    console.log('Job restored:', job._id, 'PM:', job.pmNumber);
    res.json({ 
      message: 'Work order restored successfully',
      jobId: job._id
    });
  } catch (err) {
    console.error('Error restoring job:', err);
    res.status(500).json({ error: 'Failed to restore job', details: err.message });
  }
});

// GET ARCHIVED JOBS - List all archived jobs for admin review
router.get('/archived', async (req, res) => {
  try {
    // Only admin/PM can view archived jobs
    if (!req.isAdmin && req.userRole !== 'pm' && req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Only PM or Admin can view archived jobs' });
    }
    
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // ============================================
    const currentUser = await User.findById(req.userId).select('companyId');
    
    // CRITICAL: If user has no company, return empty result (fail-safe)
    if (!currentUser?.companyId) {
      return res.json({ jobs: [], total: 0, page: 1, totalPages: 0 });
    }
    
    const { search, page = 1, limit = 50 } = req.query;
    
    const query = { isArchived: true, companyId: currentUser.companyId };
    
    if (search) {
      const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$and = [
        { $or: [
          { pmNumber: searchRegex },
          { woNumber: searchRegex },
          { address: searchRegex },
          { city: searchRegex }
        ]}
      ];
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [jobs, total] = await Promise.all([
      Job.find(query)
        .select('pmNumber woNumber address city status archivedAt archivedBy archiveReason retentionExpiresAt')
        .populate('archivedBy', 'name')
        .sort({ archivedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Job.countDocuments(query)
    ]);
    
    res.json({
      jobs,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (err) {
    console.error('Error fetching archived jobs:', err);
    res.status(500).json({ error: 'Failed to fetch archived jobs', details: err.message });
  }
});

// GET DELETED JOBS - List soft-deleted jobs (admin only)
router.get('/deleted', async (req, res) => {
  try {
    // Only admin can view deleted jobs
    if (!req.isAdmin && req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Only Admin can view deleted jobs' });
    }
    
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // ============================================
    const currentUser = await User.findById(req.userId).select('companyId');
    
    // CRITICAL: If user has no company, return empty result (fail-safe)
    if (!currentUser?.companyId) {
      return res.json({ jobs: [], total: 0, page: 1, totalPages: 0 });
    }
    
    const { search, page = 1, limit = 50 } = req.query;
    
    const query = { isDeleted: true, companyId: currentUser.companyId };
    
    if (search) {
      const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$and = [
        { $or: [
          { pmNumber: searchRegex },
          { woNumber: searchRegex },
          { address: searchRegex }
        ]}
      ];
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [jobs, total] = await Promise.all([
      Job.find(query)
        .select('pmNumber woNumber address city status deletedAt deletedBy deleteReason')
        .populate('deletedBy', 'name')
        .sort({ deletedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Job.countDocuments(query)
    ]);
    
    res.json({
      jobs,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (err) {
    console.error('Error fetching deleted jobs:', err);
    res.status(500).json({ error: 'Failed to fetch deleted jobs', details: err.message });
  }
});

// Serve uploaded files statically
// Static uploads middleware handled in server.js

router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      status, 
      bidAmount, 
      bidNotes, 
      estimatedHours,
      crewSize, 
      crewScheduledDate,
      preFieldNotes,
      siteConditions,
      submissionNotes
    } = req.body;
    
    // Get current user's role
    const user = await User.findById(req.userId);
    const userRole = user?.role || 'crew';
    const isAdmin = user?.isAdmin || ['pm', 'admin'].includes(userRole);
    
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // ============================================
    // Allow job creator, assigned GF, assigned crew, or admin to update
    // But ALWAYS filter by company first
    const query = {
      _id: id,
      $or: [
        { userId: req.userId },
        { assignedToGF: req.userId },
        { assignedTo: req.userId },
        ...(isAdmin ? [{ _id: id }] : [])  // Admins can update any job IN THEIR COMPANY
      ]
    };
    
    // CRITICAL: Always add company filter
    if (user?.companyId) {
      query.companyId = user.companyId;
    }
    
    const job = await Job.findOne(query);
    if (!job) {
      return res.status(404).json({ error: 'Job not found or not authorized' });
    }
    
    const oldStatus = job.status;
    
    // Update fields based on what was provided
    if (status) job.status = status;
    if (bidAmount !== undefined) job.bidAmount = bidAmount;
    if (bidNotes !== undefined) job.bidNotes = bidNotes;
    if (estimatedHours !== undefined) job.estimatedHours = estimatedHours;
    if (crewSize !== undefined) job.crewSize = crewSize;
    if (crewScheduledDate !== undefined) job.crewScheduledDate = crewScheduledDate;
    if (preFieldNotes !== undefined) job.preFieldNotes = preFieldNotes;
    if (siteConditions !== undefined) job.siteConditions = siteConditions;
    
    // Handle status-specific updates
    switch (status) {
      case 'assigned_to_gf':
        // PM assigned job to GF
        if (!job.assignedToGFDate) {
          job.assignedToGFDate = new Date();
          job.assignedToGFBy = req.userId;
        }
        break;
        
      case 'pre_fielding':
        // GF started pre-fielding
        if (!job.preFieldDate) {
          job.preFieldDate = new Date();
        }
        break;
        
      case 'scheduled':
        // GF scheduled the job
        break;
      
      case 'stuck':
        // Job has issues blocking progress
        job.stuckDate = new Date();
        job.stuckBy = req.userId;
        if (req.body.stuckReason) {
          job.stuckReason = req.body.stuckReason;
        }
        break;
        
      case 'in_progress':
        // Crew started work - SAFETY GATE CHECK
        // Job cannot start until Tailboard is signed and GPS-verified
        if (!job.safetyGateCleared) {
          // Check for a valid Tailboard signed today at job site
          const Tailboard = require('./models/Tailboard');
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          
          const validTailboard = await Tailboard.findOne({
            jobId: job._id,
            createdAt: { $gte: todayStart },
            status: { $in: ['completed', 'signed'] },
            'foremanSignature.signatureData': { $exists: true, $ne: null }
          });
          
          if (!validTailboard) {
            return res.status(400).json({
              error: 'Safety Gate: Tailboard/JHA required',
              code: 'SAFETY_GATE_TAILBOARD_REQUIRED',
              message: 'A signed Tailboard/JHA is required before starting work. Please complete the daily safety briefing first.'
            });
          }
          
          // Verify tailboard was signed near job site (geofence check)
          if (validTailboard.location && job.address) {
            // Get job coordinates (if available) or skip GPS check
            if (job.preFieldLabels?.gpsCoordinates?.latitude && job.preFieldLabels?.gpsCoordinates?.longitude) {
              const jobLat = job.preFieldLabels.gpsCoordinates.latitude;
              const jobLng = job.preFieldLabels.gpsCoordinates.longitude;
              const tbLat = validTailboard.location.latitude;
              const tbLng = validTailboard.location.longitude;
              
              // Calculate distance using Haversine formula
              const R = 6371000; // Earth's radius in meters
              const dLat = (tbLat - jobLat) * Math.PI / 180;
              const dLng = (tbLng - jobLng) * Math.PI / 180;
              const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                        Math.cos(jobLat * Math.PI / 180) * Math.cos(tbLat * Math.PI / 180) *
                        Math.sin(dLng/2) * Math.sin(dLng/2);
              const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
              const distance = R * c;
              
              const GEOFENCE_RADIUS = 500; // 500 meters
              if (distance > GEOFENCE_RADIUS) {
                return res.status(400).json({
                  error: 'Safety Gate: Tailboard location mismatch',
                  code: 'SAFETY_GATE_GEOFENCE_FAILED',
                  message: `Tailboard was signed ${Math.round(distance)}m from job site. Must be within ${GEOFENCE_RADIUS}m.`,
                  distance: Math.round(distance),
                  maxDistance: GEOFENCE_RADIUS
                });
              }
              
              // Update safety gate location info
              job.safetyGateLocation = {
                latitude: tbLat,
                longitude: tbLng,
                accuracy: validTailboard.location.accuracy,
                distanceFromJob: Math.round(distance)
              };
            }
          }
          
          // Safety gate cleared!
          job.safetyGateCleared = true;
          job.safetyGateClearedAt = new Date();
          job.safetyGateClearedBy = req.userId;
          job.safetyGateTailboardId = validTailboard._id;
        }
        break;
        
      case 'pending_gf_review':
        // Crew submitted work for GF review
        job.crewSubmittedDate = new Date();
        job.crewSubmittedBy = req.userId;
        if (submissionNotes) job.crewSubmissionNotes = submissionNotes;
        break;
        
      case 'pending_qa_review':
        // Status transition only - review fields are set by /review endpoint
        // Do NOT set gfReviewDate, gfReviewedBy, gfReviewStatus here
        break;
        
      case 'pending_pm_approval':
        // Status transition only - review fields are set by /review endpoint
        // Do NOT set qaReviewDate, qaReviewedBy, qaReviewStatus here
        break;
        
      case 'ready_to_submit':
        // Status transition only - review/approval fields are set by /review endpoint
        // Only set completion metadata if not already set (fallback for legacy flows)
        if (!job.completedDate) {
          job.completedDate = new Date();
          job.completedBy = req.userId;
        }
        break;
        
      case 'submitted':
        // Submitted to utility
        job.utilitySubmittedDate = new Date();
        job.utilityVisible = true;
        job.utilityStatus = 'submitted';
        break;
        
      case 'go_back':
        // Utility issued a go-back - mark as failed audit for tracking
        job.hasFailedAudit = true;
        break;
        
      case 'billed':
        job.billedDate = new Date();
        break;
        
      case 'invoiced':
        job.invoicedDate = new Date();
        break;
        
      // Legacy status mappings - map to new status AND execute transition logic
      case 'pending':
        job.status = 'new';
        break;
        
      case 'pre-field':
        job.status = 'pre_fielding';
        // Execute same logic as 'pre_fielding' case
        if (!job.preFieldDate) {
          job.preFieldDate = new Date();
        }
        break;
        
      case 'completed':
        job.status = 'ready_to_submit';
        job.completedDate = new Date();
        job.completedBy = req.userId;
        // Execute same logic as 'ready_to_submit' case
        job.pmApprovalDate = new Date();
        job.pmApprovedBy = req.userId;
        job.pmApprovalStatus = 'approved';
        break;
        
      case 'in-progress':
        // Legacy hyphenated version
        job.status = 'in_progress';
        break;
    }
    
    await job.save();
    
    console.log(`Job ${job.pmNumber || job._id} status: ${oldStatus} → ${job.status}`);
    
    // === AI DATA CAPTURE ===
    // Capture workflow transitions for AI training (non-blocking)
    (async () => {
      try {
        // Initialize training data if not exists
        await aiDataCapture.initializeTrainingData(job._id, req.userId);
        
        // Capture crew data when scheduled
        if (status === 'scheduled' && (crewSize || estimatedHours)) {
          await aiDataCapture.captureCrewData(job._id, {
            crewSize,
            estimatedHours,
            foremanId: job.assignedTo
          }, req.userId);
        }
        
        // Capture site conditions when pre-fielding
        if (status === 'pre_fielding' && (siteConditions || preFieldNotes)) {
          await aiDataCapture.captureSiteConditions(job._id, {
            siteConditions: siteConditions || preFieldNotes
          }, req.userId);
        }
        
        // Capture outcome when completed
        if (['ready_to_submit', 'completed'].includes(status)) {
          await aiDataCapture.captureJobOutcome(job._id, {
            firstTimeSuccess: !job.gfReviewStatus || job.gfReviewStatus === 'approved',
            revisionsRequired: job.gfReviewStatus === 'revision_requested' ? 1 : 0
          }, req.userId);
        }
      } catch (aiErr) {
        console.error('[AI Data] Error capturing workflow data:', aiErr);
      }
    })();
    
    res.json({ message: 'Job status updated', job, previousStatus: oldStatus });
  } catch (err) {
    console.error('Status update error:', err);
    res.status(500).json({ error: 'Status update failed', details: err.message });
  }
});

// GF/PM Review endpoint - approve or reject crew submission
router.post('/:id/review', async (req, res) => {
  try {
    const { id } = req.params;
    const { action, notes } = req.body;  // action: 'approve', 'reject', 'request_revision'
    
    const user = await User.findById(req.userId);
    const userRole = user?.role || 'crew';
    const canReview = user?.canApprove || ['gf', 'pm', 'admin'].includes(userRole);
    
    if (!canReview) {
      return res.status(403).json({ error: 'You do not have permission to review jobs' });
    }
    
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // ============================================
    const query = { _id: id };
    if (user?.companyId) {
      query.companyId = user.companyId;
    }
    
    const job = await Job.findOne(query);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const isGF = ['gf'].includes(userRole) || job.assignedToGF?.toString() === req.userId;
    const isQA = ['qa', 'admin'].includes(userRole);  // Admin can perform QA reviews
    const isPM = ['pm', 'admin'].includes(userRole) || job.userId?.toString() === req.userId;
    
    // Determine which review stage we're in
    // Note: PM cannot bypass GF stage - must go through proper hierarchy: GF → QA → PM
    if (job.status === 'pending_gf_review' && isGF) {
      // GF reviewing crew submission (PM cannot review at this stage)
      job.gfReviewDate = new Date();
      job.gfReviewedBy = req.userId;
      job.gfReviewNotes = notes;
      
      if (action === 'approve') {
        job.gfReviewStatus = 'approved';
        job.status = 'pending_qa_review';  // Now goes to QA first
      } else if (action === 'reject') {
        job.gfReviewStatus = 'rejected';
        job.status = 'in_progress';  // Send back to crew
      } else if (action === 'request_revision') {
        job.gfReviewStatus = 'revision_requested';
        job.status = 'in_progress';
      }
    } else if (job.status === 'pending_qa_review' && isQA) {
      // QA reviewing after GF approval - PM cannot bypass QA stage
      job.qaReviewDate = new Date();
      job.qaReviewedBy = req.userId;
      job.qaReviewNotes = notes;
      
      // Handle specs referenced during review
      if (req.body.specsReferenced) {
        job.qaSpecsReferenced = req.body.specsReferenced;
      }
      
      if (action === 'approve') {
        job.qaReviewStatus = 'approved';
        job.status = 'pending_pm_approval';  // Now goes to PM
      } else if (action === 'reject') {
        job.qaReviewStatus = 'rejected';
        job.status = 'pending_gf_review';  // Send back to GF for corrections
      } else if (action === 'request_revision') {
        job.qaReviewStatus = 'revision_requested';
        job.status = 'pending_gf_review';
      }
    } else if (job.status === 'pending_pm_approval' && isPM) {
      // PM final approval
      job.pmApprovalDate = new Date();
      job.pmApprovedBy = req.userId;
      job.pmApprovalNotes = notes;
      
      if (action === 'approve') {
        job.pmApprovalStatus = 'approved';
        job.status = 'ready_to_submit';
        job.completedDate = new Date();
        job.completedBy = req.userId;
      } else if (action === 'reject') {
        job.pmApprovalStatus = 'rejected';
        job.status = 'pending_qa_review';  // Send back to QA
      } else if (action === 'request_revision') {
        job.pmApprovalStatus = 'revision_requested';
        job.status = 'pending_qa_review';
      }
    } else {
      return res.status(400).json({ 
        error: 'Job is not in a reviewable state or you are not the appropriate reviewer',
        currentStatus: job.status,
        yourRole: userRole
      });
    }
    
    await job.save();
    
    console.log(`Job ${job.pmNumber || job._id} reviewed: ${action} by ${user.email}`);
    res.json({ message: `Job ${action}d successfully`, job });
  } catch (err) {
    console.error('Review error:', err);
    res.status(500).json({ error: 'Review failed', details: err.message });
  }
});

module.exports = router;
