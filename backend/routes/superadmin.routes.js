/**
 * FieldLedger - Super Admin Routes
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Platform owner routes for managing companies, users, and system config.
 * All routes require superAdmin authentication.
 */

const express = require('express');
const router = express.Router();
const Company = require('../models/Company');
const User = require('../models/User');
const Utility = require('../models/Utility');
const Job = require('../models/Job');
const AuditLog = require('../models/AuditLog');
const { sanitizeObjectId, escapeRegex } = require('../utils/sanitize');
const r2Storage = require('../utils/storage');
const { logAudit } = require('../middleware/auditLogger');
const log = require('../utils/logger');

// Get all companies
router.get('/companies', async (req, res) => {
  try {
    const companies = await Company.find({ isActive: true })
      .populate('utilities', 'name shortName')
      .populate('ownerId', 'name email')
      .sort({ createdAt: -1 });
    
    const companiesWithCounts = await Promise.all(companies.map(async (company) => {
      const userCount = await User.countDocuments({ companyId: company._id });
      return { ...company.toObject(), userCount };
    }));
    
    res.json(companiesWithCounts);
  } catch (err) {
    console.error('Error fetching companies:', err);
    res.status(500).json({ error: 'Failed to fetch companies' });
  }
});

// Create a new company
router.post('/companies', async (req, res) => {
  try {
    const { name, email, phone, address, city, state, zip, contractorLicense } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Company name is required' });
    }
    
    const safeName = escapeRegex(name);
    const existingCompany = await Company.findOne({ 
      name: { $regex: new RegExp(`^${safeName}$`, 'i') } 
    });
    if (existingCompany) {
      return res.status(400).json({ error: 'A company with this name already exists' });
    }
    
    const company = new Company({
      name, email, phone, address, city, state, zip, contractorLicense,
      subscription: { plan: 'starter', seats: 10, status: 'active' },
      settings: { timezone: 'America/Los_Angeles', defaultDivision: 'DA' },
      isActive: true
    });
    
    await company.save();
    console.log(`[SuperAdmin] Created company: ${company.name} (${company._id})`);
    res.status(201).json(company);
  } catch (err) {
    console.error('Error creating company:', err);
    res.status(500).json({ error: 'Failed to create company', details: err.message });
  }
});

// Get users for a specific company (?includeDeactivated=true to show all)
router.get('/companies/:companyId/users', async (req, res) => {
  try {
    const companyId = sanitizeObjectId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'Invalid company ID' });
    const query = { companyId };
    if (req.query.includeDeactivated !== 'true') {
      query.isActive = { $ne: false };
    }
    const users = await User.find(query)
      .select('-password')
      .sort({ isActive: -1, createdAt: -1 });
    res.json(users);
  } catch (err) {
    console.error('Error fetching company users:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Create a user for a company
router.post('/companies/:companyId/users', async (req, res) => {
  try {
    const { companyId } = req.params;
    const { email, password, name, role, phone } = req.body;
    
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }
    
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'A user with this email already exists' });
    }
    
    const userRole = role || 'crew';
    const user = new User({
      email: email.toLowerCase(),
      password,
      name,
      role: userRole,
      phone,
      companyId,
      userType: 'contractor',
      isAdmin: ['pm', 'admin'].includes(userRole),
      canApprove: ['gf', 'pm', 'admin'].includes(userRole),
      isSuperAdmin: false
    });
    
    await user.save();
    
    const userResponse = user.toObject();
    delete userResponse.password;
    
    console.log(`[SuperAdmin] Created user: ${user.email} (${userRole}) for company ${company.name}`);
    res.status(201).json(userResponse);
  } catch (err) {
    console.error('Error creating user:', err);
    res.status(500).json({ error: 'Failed to create user', details: err.message });
  }
});

// Update a user
router.put('/users/:userId', async (req, res) => {
  try {
    const { name, email, role, phone } = req.body;
    
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (name) user.name = name;
    if (email) user.email = email.toLowerCase();
    if (phone !== undefined) user.phone = phone;
    if (role) {
      user.role = role;
      user.isAdmin = ['pm', 'admin'].includes(role);
      user.canApprove = ['gf', 'pm', 'admin'].includes(role);
    }
    
    await user.save();
    
    const userResponse = user.toObject();
    delete userResponse.password;
    
    console.log(`[SuperAdmin] Updated user: ${user.email}`);
    res.json(userResponse);
  } catch (err) {
    console.error('Error updating user:', err);
    res.status(500).json({ error: 'Failed to update user', details: err.message });
  }
});

// Reset user password
router.post('/users/:userId/reset-password', async (req, res) => {
  try {
    const { newPassword } = req.body;
    
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    user.password = newPassword;
    await user.save();
    
    console.log(`[SuperAdmin] Reset password for user: ${user.email}`);
    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error('Error resetting password:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Update company details
router.put('/companies/:companyId', async (req, res) => {
  try {
    const { name, email, phone, address, city, state, zip, contractorLicense, folderTemplate } = req.body;
    
    const company = await Company.findById(req.params.companyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    if (name) company.name = name;
    if (email !== undefined) company.email = email;
    if (phone !== undefined) company.phone = phone;
    if (address !== undefined) company.address = address;
    if (city !== undefined) company.city = city;
    if (state !== undefined) company.state = state;
    if (zip !== undefined) company.zip = zip;
    if (contractorLicense !== undefined) company.contractorLicense = contractorLicense;
    if (folderTemplate !== undefined) company.folderTemplate = folderTemplate;
    
    await company.save();
    console.log(`[SuperAdmin] Updated company: ${company.name}`);
    res.json(company);
  } catch (err) {
    console.error('Error updating company:', err);
    res.status(500).json({ error: 'Failed to update company' });
  }
});

// Update company folder template
router.put('/companies/:companyId/folder-template', async (req, res) => {
  try {
    const { folderTemplate } = req.body;
    
    if (!folderTemplate || !Array.isArray(folderTemplate)) {
      return res.status(400).json({ error: 'folderTemplate must be an array' });
    }
    
    const company = await Company.findById(req.params.companyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    company.folderTemplate = folderTemplate;
    await company.save();
    
    console.log(`[SuperAdmin] Updated folder template for: ${company.name}`);
    res.json({ 
      message: `Folder template updated for ${company.name}`,
      folderTemplate: company.folderTemplate 
    });
  } catch (err) {
    console.error('Error updating folder template:', err);
    res.status(500).json({ error: 'Failed to update folder template' });
  }
});

// Delete/deactivate a company (soft delete)
router.delete('/companies/:companyId', async (req, res) => {
  try {
    const company = await Company.findById(req.params.companyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    company.isActive = false;
    await company.save();
    
    console.log(`[SuperAdmin] Deactivated company: ${company.name}`);
    res.json({ message: `Company "${company.name}" has been deactivated` });
  } catch (err) {
    console.error('Error deactivating company:', err);
    res.status(500).json({ error: 'Failed to deactivate company' });
  }
});

// Get all available utilities (for dropdowns)
router.get('/utilities', async (req, res) => {
  try {
    const utilities = await Utility.find({ isActive: true })
      .select('name shortName slug')
      .sort({ name: 1 });
    res.json(utilities);
  } catch (err) {
    console.error('Error fetching utilities:', err);
    res.status(500).json({ error: 'Failed to fetch utilities' });
  }
});

// ============================================================================
// CONTRACT TERMINATION — Company data purge (PG&E Exhibit DATA-1 §VII)
//
// Permanently deletes ALL data for a company: jobs (+ R2 files), users,
// audit logs, and the company record itself.
//
// Guards:
//   1. SuperAdmin only (enforced by route mount in routes/index.js)
//   2. Confirmation string must match company name exactly
//   3. Company must be deactivated first (isActive: false)
//   4. Full audit trail of the purge operation itself
// ============================================================================

router.post('/companies/:companyId/purge', async (req, res) => {
  const companyId = sanitizeObjectId(req.params.companyId);
  if (!companyId) {
    return res.status(400).json({ error: 'Invalid company ID' });
  }

  if (!req.isSuperAdmin) {
    return res.status(403).json({ error: 'SuperAdmin access required' });
  }

  const { confirmation } = req.body;

  const company = await Company.findById(companyId).lean();
  if (!company) {
    return res.status(404).json({ error: 'Company not found' });
  }

  if (company.isActive) {
    return res.status(400).json({
      error: 'Company must be deactivated before purge',
      code: 'COMPANY_STILL_ACTIVE',
      message: 'Set isActive to false first via PUT /api/superadmin/companies/:id'
    });
  }

  if (!confirmation || confirmation !== company.name) {
    return res.status(400).json({
      error: 'Confirmation required',
      code: 'CONFIRMATION_MISMATCH',
      message: `To permanently delete all data, send { "confirmation": "${company.name}" }`
    });
  }

  const results = { company: company.name, companyId: companyId.toString(), deletedAt: new Date().toISOString() };

  try {
    // 1. Delete R2 files for all jobs
    const jobs = await Job.find({ companyId }).select('_id').lean();
    const jobIds = jobs.map(j => j._id.toString());
    let r2FilesDeleted = 0;

    if (r2Storage.isR2Configured() && jobIds.length > 0) {
      for (const jobId of jobIds) {
        try {
          const files = await r2Storage.listFiles(`jobs/${jobId}/`);
          for (const file of files) {
            await r2Storage.deleteFile(file.Key);
            r2FilesDeleted++;
          }
        } catch (err) {
          log.error({ err, jobId }, '[Purge] R2 cleanup error for job');
        }
      }
    }
    results.r2FilesDeleted = r2FilesDeleted;

    // 2. Load models lazily to avoid circular dependency issues
    const modelNames = [
      'Tailboard', 'LME', 'Timesheet', 'UnitEntry', 'Claim',
      'FieldTicket', 'AsBuiltSubmission', 'FormTemplate', 'PriceBook',
      'Notification', 'Feedback', 'ProcedureDoc', 'SpecDocument', 'RoutingRule'
    ];

    for (const modelName of modelNames) {
      try {
        const Model = require(`../models/${modelName}`);
        const result = await Model.deleteMany({ companyId });
        results[modelName] = result.deletedCount;
      } catch {
        results[modelName] = 'model_not_found';
      }
    }

    // 3. Delete jobs
    const jobResult = await Job.deleteMany({ companyId });
    results.jobs = jobResult.deletedCount;

    // 4. Delete users
    const userResult = await User.deleteMany({ companyId });
    results.users = userResult.deletedCount;

    // 5. Log the purge to audit trail BEFORE deleting audit logs
    await logAudit(req, 'DATA_EXPORT', {
      resourceType: 'company',
      resourceId: companyId,
      resourceName: company.name,
      severity: 'critical',
      details: {
        action: 'CONTRACT_TERMINATION_PURGE',
        ...results
      }
    });

    // 6. Delete company audit logs
    const auditResult = await AuditLog.deleteMany({ companyId });
    results.auditLogs = auditResult.deletedCount;

    // 7. Delete the company record itself
    await Company.deleteOne({ _id: companyId });
    results.companyDeleted = true;

    log.warn({ results }, '[Purge] Company data purge completed');
    res.json({ message: 'Company data permanently deleted', results });
  } catch (err) {
    log.error({ err, companyId: companyId.toString() }, '[Purge] Company purge failed');
    res.status(500).json({ error: 'Purge failed — partial deletion may have occurred. Check server logs.', partialResults: results });
  }
});

module.exports = router;

