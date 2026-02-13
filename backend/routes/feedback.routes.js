/**
 * FieldLedger - Feedback Routes
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Pilot feedback system for field-reported issues.
 */

const express = require('express');
const router = express.Router();
const Feedback = require('../models/Feedback');
const User = require('../models/User');
const { sanitizeString, sanitizeInt } = require('../utils/sanitize');

// Submit feedback (any authenticated user)
router.post('/', async (req, res) => {
  try {
    const { type, priority, subject, description, currentPage, screenSize, jobId } = req.body;
    
    if (!subject || !description) {
      return res.status(400).json({ error: 'Subject and description are required' });
    }
    
    const user = await User.findById(req.userId).select('name email role companyId');
    
    const feedback = new Feedback({
      userId: req.userId,
      userName: user?.name || 'Unknown',
      userEmail: user?.email,
      userRole: user?.role,
      companyId: user?.companyId,
      type: type || 'bug',
      priority: priority || 'medium',
      subject,
      description,
      currentPage,
      userAgent: req.headers['user-agent'],
      screenSize,
      jobId: jobId || null,
      status: 'new'
    });
    
    await feedback.save();
    
    console.log(`[FEEDBACK] New ${type} from ${user?.email}: ${subject}`);
    
    res.status(201).json({ 
      success: true, 
      message: 'Thank you for your feedback! Our team will review it shortly.',
      feedbackId: feedback._id 
    });
  } catch (err) {
    console.error('Submit feedback error:', err);
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

// Get all feedback (Super Admin only)
router.get('/admin', async (req, res) => {
  try {
    if (!req.isSuperAdmin) {
      return res.status(403).json({ error: 'Super Admin access required' });
    }
    
    const { status, type, limit = 50 } = req.query;
    
    const query = {};
    if (status) query.status = sanitizeString(status);
    if (type) query.type = sanitizeString(type);
    
    const feedback = await Feedback.find(query)
      .sort({ createdAt: -1 })
      .limit(sanitizeInt(limit, 50, 200))
      .populate('jobId', 'pmNumber woNumber title');
    
    const counts = await Feedback.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    
    res.json({ 
      feedback,
      counts: counts.reduce((acc, c) => ({ ...acc, [c._id]: c.count }), {})
    });
  } catch (err) {
    console.error('Get feedback error:', err);
    res.status(500).json({ error: 'Failed to get feedback' });
  }
});

// Update feedback status (Super Admin only)
router.put('/admin/:id', async (req, res) => {
  try {
    if (!req.isSuperAdmin) {
      return res.status(403).json({ error: 'Super Admin access required' });
    }
    
    const { status, adminNotes } = req.body;
    
    const update = {};
    if (status) update.status = status;
    if (adminNotes !== undefined) update.adminNotes = adminNotes;
    if (status === 'resolved') update.resolvedAt = new Date();
    
    const feedback = await Feedback.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true }
    );
    
    if (!feedback) {
      return res.status(404).json({ error: 'Feedback not found' });
    }
    
    res.json(feedback);
  } catch (err) {
    console.error('Update feedback error:', err);
    res.status(500).json({ error: 'Failed to update feedback' });
  }
});

module.exports = router;

