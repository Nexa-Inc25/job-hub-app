/**
 * Timesheet Routes
 * 
 * API endpoints for crew timesheet management.
 */

const express = require('express');
const router = express.Router();
const Timesheet = require('../models/Timesheet');
const Job = require('../models/Job');
const User = require('../models/User');

// Auth middleware
const authenticateUser = async (req, res, next) => {
  const jwt = require('jsonwebtoken');
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-dev-secret');
    req.userId = decoded.userId;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

/**
 * GET /api/timesheets
 * Query timesheets by job and/or date
 */
router.get('/', authenticateUser, async (req, res) => {
  try {
    const { jobId, date, startDate, endDate } = req.query;
    const user = await User.findById(req.userId);
    if (!user?.companyId) return res.status(403).json({ error: 'Unauthorized' });

    const query = { companyId: user.companyId };
    
    if (jobId) query.jobId = jobId;
    
    if (date) {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      const endD = new Date(d);
      endD.setHours(23, 59, 59, 999);
      query.date = { $gte: d, $lte: endD };
    } else if (startDate && endDate) {
      query.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    const timesheets = await Timesheet.find(query)
      .populate('jobId', 'woNumber jobNumber address')
      .sort({ date: -1 });

    // If querying for specific job+date, return single or null
    if (jobId && date) {
      return res.json(timesheets[0] || null);
    }

    res.json(timesheets);
  } catch (err) {
    console.error('Get timesheets error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/timesheets
 * Create or update a timesheet
 */
router.post('/', authenticateUser, async (req, res) => {
  try {
    const { jobId, date, crewMembers, totalHours, notes } = req.body;
    const user = await User.findById(req.userId);
    if (!user?.companyId) return res.status(403).json({ error: 'Unauthorized' });

    // Verify job belongs to company
    const job = await Job.findOne({ _id: jobId, companyId: user.companyId });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    // Normalize date to start of day
    const timesheetDate = new Date(date);
    timesheetDate.setHours(0, 0, 0, 0);

    // Upsert timesheet
    const timesheet = await Timesheet.findOneAndUpdate(
      { jobId, date: timesheetDate, companyId: user.companyId },
      {
        $set: {
          crewMembers,
          totalHours,
          notes,
          submittedBy: user._id,
          submittedAt: new Date(),
          status: 'submitted',
        },
        $setOnInsert: {
          jobId,
          date: timesheetDate,
          companyId: user.companyId,
        },
      },
      { upsert: true, new: true }
    );

    res.json(timesheet);
  } catch (err) {
    console.error('Save timesheet error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/timesheets/:id/approve
 * Approve a timesheet
 */
router.patch('/:id/approve', authenticateUser, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) return res.status(403).json({ error: 'Unauthorized' });

    // Check if user has approval rights (GF or PM roles)
    const approverRoles = ['admin', 'owner', 'pm', 'general_foreman', 'gf'];
    if (!approverRoles.includes(user.role)) {
      return res.status(403).json({ error: 'Not authorized to approve timesheets' });
    }

    const timesheet = await Timesheet.findOneAndUpdate(
      { _id: req.params.id, companyId: user.companyId },
      {
        status: 'approved',
        approvedBy: user._id,
        approvedAt: new Date(),
      },
      { new: true }
    );

    if (!timesheet) return res.status(404).json({ error: 'Timesheet not found' });
    res.json(timesheet);
  } catch (err) {
    console.error('Approve timesheet error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/timesheets/:id/reject
 * Reject a timesheet
 */
router.patch('/:id/reject', authenticateUser, async (req, res) => {
  try {
    const { reason } = req.body;
    const user = await User.findById(req.userId);
    if (!user?.companyId) return res.status(403).json({ error: 'Unauthorized' });

    const timesheet = await Timesheet.findOneAndUpdate(
      { _id: req.params.id, companyId: user.companyId },
      {
        status: 'rejected',
        notes: reason || 'Rejected - please revise',
      },
      { new: true }
    );

    if (!timesheet) return res.status(404).json({ error: 'Timesheet not found' });
    res.json(timesheet);
  } catch (err) {
    console.error('Reject timesheet error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/timesheets/:id/export
 * Export timesheet in Oracle or SAP format
 */
router.get('/:id/export', authenticateUser, async (req, res) => {
  try {
    const { format = 'oracle' } = req.query;
    const user = await User.findById(req.userId);
    if (!user?.companyId) return res.status(403).json({ error: 'Unauthorized' });

    const timesheet = await Timesheet.findOne({
      _id: req.params.id,
      companyId: user.companyId,
    }).populate('jobId');

    if (!timesheet) return res.status(404).json({ error: 'Timesheet not found' });

    const { formatTimesheetForOracle, formatTimesheetForSAP } = require('../utils/jobPackageExport');
    
    const exportData = format === 'sap'
      ? formatTimesheetForSAP(timesheet, timesheet.jobId)
      : formatTimesheetForOracle(timesheet, timesheet.jobId);

    res.json(exportData);
  } catch (err) {
    console.error('Export timesheet error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

