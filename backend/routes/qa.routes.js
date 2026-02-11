/**
 * FieldLedger - QA Dashboard Routes
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Routes for QA review workflow: pending reviews, failed audits, stats.
 * Access restricted to QA and Admin roles.
 */

const express = require('express');
const router = express.Router();
const Job = require('../models/Job');
const User = require('../models/User');

// Get jobs pending QA review
router.get('/pending-review', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    
    if (!['qa', 'admin'].includes(user?.role) && !user?.isSuperAdmin) {
      return res.status(403).json({ error: 'QA access required' });
    }
    
    const query = { 
      status: 'pending_qa_review',
      isDeleted: { $ne: true }
    };
    
    if (user?.companyId && !user.isSuperAdmin) {
      query.companyId = user.companyId;
    }
    
    const jobs = await Job.find(query)
      .populate('userId', 'name email')
      .populate('assignedToGF', 'name email')
      .populate('assignedTo', 'name email')
      .sort({ crewSubmittedDate: -1 })
      .lean();
    
    res.json(jobs);
  } catch (err) {
    console.error('QA pending review error:', err);
    res.status(500).json({ error: 'Failed to get pending QA jobs' });
  }
});

// Get jobs with failed audits
router.get('/failed-audits', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    
    if (!['qa', 'admin'].includes(user?.role) && !user?.isSuperAdmin) {
      return res.status(403).json({ error: 'QA access required' });
    }
    
    const query = { 
      hasFailedAudit: true,
      isDeleted: { $ne: true }
    };
    
    if (user?.companyId && !user.isSuperAdmin) {
      query.companyId = user.companyId;
    }
    
    const jobs = await Job.find(query)
      .populate('userId', 'name email')
      .populate('assignedToGF', 'name email')
      .populate('auditHistory.correctionAssignedTo', 'name email')
      .sort({ 'auditHistory.receivedDate': -1 })
      .lean();
    
    res.json(jobs);
  } catch (err) {
    console.error('QA failed audits error:', err);
    res.status(500).json({ error: 'Failed to get failed audit jobs' });
  }
});

// Get QA dashboard stats
router.get('/stats', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    
    if (!['qa', 'admin'].includes(user?.role) && !user?.isSuperAdmin) {
      return res.status(403).json({ error: 'QA access required' });
    }
    
    const baseQuery = { isDeleted: { $ne: true } };
    if (user?.companyId && !user.isSuperAdmin) {
      baseQuery.companyId = user.companyId;
    }
    
    const [pendingReview, failedAudits, resolvedThisMonth, avgReviewTime] = await Promise.all([
      Job.countDocuments({ ...baseQuery, status: 'pending_qa_review' }),
      Job.countDocuments({ ...baseQuery, hasFailedAudit: true }),
      Job.countDocuments({ 
        ...baseQuery, 
        qaReviewDate: { 
          $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) 
        }
      }),
      Job.aggregate([
        { $match: { ...baseQuery, qaReviewDate: { $exists: true }, gfReviewDate: { $exists: true } } },
        { $project: { 
          reviewTime: { $subtract: ['$qaReviewDate', '$gfReviewDate'] } 
        }},
        { $group: { _id: null, avg: { $avg: '$reviewTime' } } }
      ])
    ]);
    
    res.json({
      pendingReview,
      failedAudits,
      resolvedThisMonth,
      avgReviewTimeHours: avgReviewTime[0]?.avg ? Math.round(avgReviewTime[0].avg / (1000 * 60 * 60)) : null
    });
  } catch (err) {
    console.error('QA stats error:', err);
    res.status(500).json({ error: 'Failed to get QA stats' });
  }
});

module.exports = router;

