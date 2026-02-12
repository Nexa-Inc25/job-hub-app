/**
 * FieldLedger - Job Misc Routes
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Miscellaneous job endpoints: AI training data capture, pre-field checklists,
 * AI suggestions, document auto-fill, form capture, full details, CSV export.
 * Also includes admin setup/bootstrap endpoints.
 * Mounted at /api/jobs (and /api for autofill/admin paths) with auth middleware.
 */

const express = require('express');
const router = express.Router();
const Job = require('../models/Job');
const User = require('../models/User');
const Company = require('../models/Company');
const Utility = require('../models/Utility');
const aiDataCapture = require('../utils/aiDataCapture');
const documentAutoFill = require('../utils/documentAutoFill');

// Capture pre-field checklist decisions for AI training
router.post('/:id/prefield-checklist', async (req, res) => {
  try {
    const { id } = req.params;
    const { decisions } = req.body;  // { usa_dig: { checked: true, notes: "..." }, ... }
    
    // ============================================
    // MULTI-TENANT SECURITY: Verify job is in user's company
    // ============================================
    const user = await User.findById(req.userId).select('companyId');
    const query = { _id: id };
    if (user?.companyId) {
      query.companyId = user.companyId;
    }
    
    const job = await Job.findOne(query);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Capture for AI training
    await aiDataCapture.capturePreFieldDecisions(id, decisions, req.userId);
    
    res.json({ message: 'Pre-field checklist captured for AI training' });
  } catch (err) {
    console.error('Capture prefield error:', err);
    res.status(500).json({ error: 'Failed to capture pre-field data' });
  }
});

// Get AI suggestions for a job based on similar past jobs
router.get('/:id/ai-suggestions', async (req, res) => {
  try {
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // ============================================
    const user = await User.findById(req.userId).select('companyId');
    const query = { _id: req.params.id };
    if (user?.companyId) {
      query.companyId = user.companyId;
    }
    
    const job = await Job.findOne(query);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const suggestions = await aiDataCapture.getAISuggestions({
      city: job.city,
      orderType: job.orderType,
      division: job.division,
      matCode: job.matCode,
      address: job.address
    });
    
    res.json(suggestions);
  } catch (err) {
    console.error('Get AI suggestions error:', err);
    res.status(500).json({ error: 'Failed to get AI suggestions' });
  }
});

// === ADMIN SETUP ENDPOINTS ===

// Setup Alvah company (one-time use)
router.post('/admin/setup-alvah', async (req, res) => {
  try {
    // Only allow admins
    if (!req.isAdmin && req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const results = { created: [], skipped: [], errors: [] };

    // Find or create PG&E utility
    let pgeUtility = await Utility.findOne({ slug: 'pge' });
    if (!pgeUtility) {
      pgeUtility = await Utility.create({
        name: 'Pacific Gas & Electric',
        slug: 'pge',
        region: 'California',
        isActive: true
      });
      results.created.push('PG&E Utility');
    }

    // Company info
    const COMPANY_INFO = {
      name: 'Alvah',
      email: 'info@alvah.com',
      state: 'CA',
    };

    // Users to create
    const USERS = [
      { email: 'leek@alvah.com', name: 'Lee Kizer', password: 'Alvah2025!', role: 'gf', isAdmin: false, canApprove: true },
      { email: 'mattf@alvah.com', name: 'Matt Ferrier', password: 'Alvah2025!', role: 'foreman', isAdmin: false, canApprove: false },
      { email: 'stephens@alvah.com', name: 'Stephen Shay', password: 'Alvah2025!', role: 'foreman', isAdmin: false, canApprove: false },
      { email: 'joeb@alvah.com', name: 'Joe Bodner', password: 'Alvah2025!', role: 'foreman', isAdmin: false, canApprove: false },
    ];

    // Check if company exists
    let company = await Company.findOne({ name: COMPANY_INFO.name });
    
    if (company) {
      results.skipped.push(`Company "${COMPANY_INFO.name}" already exists`);
    } else {
      company = new Company({
        ...COMPANY_INFO,
        utilities: [pgeUtility._id],
        defaultUtility: pgeUtility._id,
        subscription: { plan: 'starter', seats: 10, status: 'active' },
        settings: { timezone: 'America/Los_Angeles', defaultDivision: 'DA' },
        isActive: true
      });
      await company.save();
      results.created.push(`Company "${company.name}"`);
    }

    // Create users
    for (const userData of USERS) {
      const existingUser = await User.findOne({ email: userData.email });
      
      if (existingUser) {
        if (!existingUser.companyId) {
          existingUser.companyId = company._id;
          await existingUser.save();
          results.skipped.push(`${userData.email} - updated companyId`);
        } else {
          results.skipped.push(`${userData.email} - already exists`);
        }
        continue;
      }
      
      const user = new User({
        email: userData.email,
        name: userData.name,
        password: userData.password,
        role: userData.role,
        isAdmin: userData.isAdmin,
        canApprove: userData.canApprove,
        companyId: company._id,
        userType: 'contractor'
      });
      
      await user.save();
      results.created.push(`${userData.role.toUpperCase()} - ${userData.email} (${userData.name})`);
    }

    res.json({
      success: true,
      message: 'Alvah setup complete',
      companyId: company._id,
      results
    });

  } catch (err) {
    console.error('Setup Alvah error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update user to admin
router.post('/admin/make-admin/:email', async (req, res) => {
  try {
    if (!req.isAdmin && req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { email } = req.params;
    const user = await User.findOne({ email: decodeURIComponent(email) });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.isAdmin = true;
    user.role = 'admin';
    user.canApprove = true;
    await user.save();

    res.json({
      success: true,
      message: `${user.name} (${user.email}) is now an admin`,
      user: { id: user._id, name: user.name, email: user.email, role: user.role, isAdmin: user.isAdmin }
    });
  } catch (err) {
    console.error('Make admin error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Capture form field data for AI training
router.post('/:id/capture-form', async (req, res) => {
  try {
    const { id } = req.params;
    const { formType, fields, completionTimeSeconds } = req.body;
    
    // ============================================
    // MULTI-TENANT SECURITY: Verify job is in user's company
    // ============================================
    const user = await User.findById(req.userId).select('companyId');
    const query = { _id: id };
    if (user?.companyId) {
      query.companyId = user.companyId;
    }
    
    const job = await Job.findOne(query);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    await aiDataCapture.captureFormCompletion(id, formType, fields, completionTimeSeconds, req.userId);
    
    res.json({ message: 'Form data captured for AI training' });
  } catch (err) {
    console.error('Capture form error:', err);
    res.status(500).json({ error: 'Failed to capture form data' });
  }
});

// === DOCUMENT AUTO-FILL ENDPOINTS ===

// Get auto-fill values for a document type
router.get('/:id/autofill/:documentType', async (req, res) => {
  try {
    const { id, documentType } = req.params;
    
    const autoFillResult = await documentAutoFill.generateAutoFill(
      documentType.toUpperCase(),
      id,
      req.userId
    );
    
    if (autoFillResult.error) {
      return res.status(400).json({ error: autoFillResult.error });
    }
    
    res.json(autoFillResult);
  } catch (err) {
    console.error('Auto-fill error:', err);
    res.status(500).json({ error: 'Failed to generate auto-fill' });
  }
});

// Get available document types for auto-fill
router.get('/autofill/document-types', async (req, res) => {
  try {
    const types = documentAutoFill.getDocumentTypes();
    res.json(types);
  } catch (err) {
    console.error('Get document types error:', err);
    res.status(500).json({ error: 'Failed to get document types' });
  }
});

// Get full job details including dependencies, notes, schedule info
router.get('/:id/full-details', async (req, res) => {
  try {
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // ============================================
    const user = await User.findById(req.userId).select('companyId');
    const query = { _id: req.params.id };
    if (user?.companyId) {
      query.companyId = user.companyId;
    }
    
    const job = await Job.findOne(query)
      // Core assignments
      .populate('assignedTo', 'name email role')
      .populate('assignedToGF', 'name email role')
      .populate('userId', 'name email role')
      // Who did what - audit trail
      .populate('assignedBy', 'name email role')
      .populate('assignedToGFBy', 'name email role')
      .populate('crewSubmittedBy', 'name email role')
      .populate('gfReviewedBy', 'name email role')
      .populate('pmApprovedBy', 'name email role')
      .populate('completedBy', 'name email role')
      // Notes
      .populate('notes.userId', 'name email role');
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json(job);
  } catch (err) {
    console.error('Get full details error:', err);
    res.status(500).json({ error: 'Failed to get job details' });
  }
});

// Note: API routes for /api/ai/* are mounted earlier via apiRoutes
// This line is kept for any additional routes in apiRoutes that need auth

// === FEEDBACK ROUTES moved to routes/feedback.routes.js ===

// ==================== CSV EXPORT FOR JOBS ====================
// Essential for contractors to share data outside the system
// Uses standard authenticateUser middleware for security

router.get('/export/csv', async (req, res) => {
  try {
    // Get user's company (req.userId set by authenticateUser middleware)
    const user = await User.findById(req.userId).select('companyId isSuperAdmin');
    
    // Handle deleted/missing user
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    // Build query based on permissions
    const query = { isDeleted: { $ne: true } };
    if (!user.isSuperAdmin && user.companyId) {
      query.companyId = user.companyId;
    }
    
    // Optional filters
    const { status, startDate, endDate } = req.query;
    if (status) query.status = status;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    
    const jobs = await Job.find(query)
      .select('pmNumber woNumber notificationNumber title address city client status priority dueDate crewScheduledDate createdAt completedDate assignedTo')
      .populate('assignedTo', 'name email')
      .sort({ createdAt: -1 })
      .lean();
    
    // RFC 4180 compliant CSV escaping
    // Fields containing commas, quotes, or newlines must be quoted
    // Quotes within fields must be escaped by doubling them
    const escapeCSVField = (field) => {
      if (field === null || field === undefined) return '';
      const str = String(field);
      // Check if field needs quoting (contains comma, quote, or newline)
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        // Escape quotes by doubling them, then wrap in quotes
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };
    
    // Build CSV
    const headers = [
      'PM Number',
      'WO Number',
      'Notification #',
      'Title',
      'Address',
      'City',
      'Client',
      'Status',
      'Priority',
      'Due Date',
      'Scheduled Date',
      'Created Date',
      'Completed Date',
      'Assigned To'
    ];
    
    // Format date to ISO format (YYYY-MM-DD) to avoid locale-specific commas
    const formatDate = (date) => {
      if (!date) return '';
      const d = new Date(date);
      return d.toISOString().split('T')[0]; // Returns YYYY-MM-DD format
    };
    
    const rows = jobs.map(job => [
      escapeCSVField(job.pmNumber),
      escapeCSVField(job.woNumber),
      escapeCSVField(job.notificationNumber),
      escapeCSVField(job.title),
      escapeCSVField(job.address),
      escapeCSVField(job.city),
      escapeCSVField(job.client),
      escapeCSVField(job.status),
      escapeCSVField(job.priority),
      escapeCSVField(formatDate(job.dueDate)),
      escapeCSVField(formatDate(job.crewScheduledDate)),
      escapeCSVField(formatDate(job.createdAt)),
      escapeCSVField(formatDate(job.completedDate)),
      escapeCSVField(job.assignedTo ? (job.assignedTo.name || job.assignedTo.email) : '')
    ]);
    
    const csv = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');
    
    // Set headers for CSV download
    const filename = `jobs_export_${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    res.send(csv);
  } catch (err) {
    console.error('Export jobs CSV error:', err);
    res.status(500).json({ error: 'Failed to export jobs' });
  }
});


module.exports = router;
