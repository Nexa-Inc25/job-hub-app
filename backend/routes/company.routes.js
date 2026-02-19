/**
 * FieldLedger - Company Management Routes
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Routes for company self-management (profile, settings, user invitations).
 * Used by company admins to manage their own organization.
 */

const express = require('express');
const router = express.Router();
const crypto = require('node:crypto');
const Company = require('../models/Company');
const User = require('../models/User');
const { sendInvitation } = require('../services/email.service');
const { sanitizeEmail } = require('../utils/sanitize');

// Get current user's company
router.get('/', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(404).json({ error: 'No company associated with this user' });
    }
    
    const company = await Company.findById(user.companyId)
      .populate('utilities', 'name slug shortName')
      .populate('defaultUtility', 'name slug shortName');
    
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    res.json(company);
  } catch (err) {
    console.error('Error fetching company:', err);
    res.status(500).json({ error: 'Failed to fetch company' });
  }
});

// Update company settings (company admin only)
router.put('/', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(404).json({ error: 'No company associated with this user' });
    }
    
    if (!user.isAdmin && user.role !== 'pm' && user.role !== 'admin') {
      return res.status(403).json({ error: 'Only company admins can update company settings' });
    }
    
    const company = await Company.findById(user.companyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    const allowedFields = ['name', 'phone', 'address', 'city', 'state', 'zip', 'settings', 'defaultUtility'];
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        company[field] = req.body[field];
      }
    });
    
    await company.save();
    console.log('Updated company:', company.name);
    res.json(company);
  } catch (err) {
    console.error('Error updating company:', err);
    res.status(500).json({ error: 'Failed to update company', details: err.message });
  }
});

// Get company users (company admin only)
router.get('/users', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(404).json({ error: 'No company associated with this user' });
    }
    
    if (!user.isAdmin && !['gf', 'pm', 'admin'].includes(user.role)) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    const users = await User.find({ companyId: user.companyId })
      .select('-password')
      .sort({ createdAt: -1 });
    
    res.json(users);
  } catch (err) {
    console.error('Error fetching company users:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Invite user to company (company admin only)
router.post('/invite', async (req, res) => {
  try {
    const { email, name, role } = req.body;
    
    const inviter = await User.findById(req.userId);
    if (!inviter?.companyId) {
      return res.status(404).json({ error: 'No company associated with this user' });
    }
    
    if (!inviter.isAdmin && !['gf', 'pm', 'admin'].includes(inviter.role)) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    const safeEmail = sanitizeEmail(email);
    if (!safeEmail) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    const existingUser = await User.findOne({ email: safeEmail });
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }
    
    const tempPassword = crypto.randomBytes(6).toString('base64url') + 'Ax1!';
    
    const validRoles = ['crew', 'foreman', 'gf', 'qa', 'pm'];
    const userRole = validRoles.includes(role) ? role : 'crew';
    
    const newUser = new User({
      email,
      password: tempPassword,
      name: name || email.split('@')[0],
      role: userRole,
      companyId: inviter.companyId,
      isAdmin: ['gf', 'pm'].includes(userRole),
      canApprove: ['gf', 'pm'].includes(userRole)
    });
    
    await newUser.save();
    
    const company = await Company.findById(inviter.companyId);
    const companyName = company?.name || 'Your Company';
    
    try {
      await sendInvitation({
        email,
        name: newUser.name,
        tempPassword,
        inviterName: inviter.name,
        companyName,
        role: userRole
      });
      console.log('Invitation email sent to:', email);
    } catch (error_) {
      console.error('Failed to send invitation email:', error_);
    }
    
    console.log('Invited user:', email, 'to company:', inviter.companyId);
    res.status(201).json({ 
      message: 'User invited successfully. Temporary password sent via email.',
      user: { email: newUser.email, name: newUser.name, role: newUser.role }
    });
  } catch (err) {
    console.error('Error inviting user:', err);
    res.status(500).json({ error: 'Failed to invite user', details: err.message });
  }
});

// ============================================================================
// SECURITY SETTINGS — company admin manages MFA policy, IP whitelist, review cadence
// ============================================================================

router.get('/security-settings', async (req, res) => {
  try {
    const company = await Company.findById(req.companyId)
      .select('securitySettings name')
      .lean();
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    res.json(company.securitySettings || {});
  } catch (err) {
    console.error('Error fetching security settings:', err);
    res.status(500).json({ error: 'Failed to fetch security settings' });
  }
});

router.put('/security-settings', async (req, res) => {
  try {
    if (!req.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const company = await Company.findById(req.companyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const {
      mfaRequired, mfaRequiredForRoles,
      passwordMinLength, passwordRequireSpecial, passwordExpiryDays,
      sessionTimeoutMinutes, maxConcurrentSessions,
      ipWhitelist, allowedDomains,
      securityAlertEmails, alertOnCriticalEvents,
      dataRetentionYears, autoDeleteAfterRetention
    } = req.body;

    if (!company.securitySettings) company.securitySettings = {};
    const ss = company.securitySettings;

    if (typeof mfaRequired === 'boolean') ss.mfaRequired = mfaRequired;
    if (Array.isArray(mfaRequiredForRoles)) ss.mfaRequiredForRoles = mfaRequiredForRoles;
    if (typeof passwordMinLength === 'number' && passwordMinLength >= 8) ss.passwordMinLength = passwordMinLength;
    if (typeof passwordRequireSpecial === 'boolean') ss.passwordRequireSpecial = passwordRequireSpecial;
    if (typeof passwordExpiryDays === 'number') ss.passwordExpiryDays = passwordExpiryDays;
    if (typeof sessionTimeoutMinutes === 'number') ss.sessionTimeoutMinutes = sessionTimeoutMinutes;
    if (typeof maxConcurrentSessions === 'number') ss.maxConcurrentSessions = maxConcurrentSessions;
    if (Array.isArray(ipWhitelist)) ss.ipWhitelist = ipWhitelist;
    if (Array.isArray(allowedDomains)) ss.allowedDomains = allowedDomains;
    if (Array.isArray(securityAlertEmails)) ss.securityAlertEmails = securityAlertEmails;
    if (typeof alertOnCriticalEvents === 'boolean') ss.alertOnCriticalEvents = alertOnCriticalEvents;
    if (typeof dataRetentionYears === 'number' && dataRetentionYears >= 1) ss.dataRetentionYears = dataRetentionYears;
    if (typeof autoDeleteAfterRetention === 'boolean') ss.autoDeleteAfterRetention = autoDeleteAfterRetention;

    company.markModified('securitySettings');
    await company.save();

    const { clearCompanySecurityCache } = require('../middleware/auth');
    clearCompanySecurityCache(req.companyId);

    res.json({ message: 'Security settings updated', securitySettings: company.securitySettings });
  } catch (err) {
    console.error('Error updating security settings:', err);
    res.status(500).json({ error: 'Failed to update security settings' });
  }
});

router.post('/security-review', async (req, res) => {
  try {
    if (!req.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const company = await Company.findById(req.companyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    if (!company.securitySettings) company.securitySettings = {};
    company.securitySettings.lastSecurityReview = new Date();
    company.securitySettings.nextSecurityReview = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    company.securitySettings.securityReviewNotes = req.body.notes || '';
    company.markModified('securitySettings');
    await company.save();

    res.json({
      message: 'Security review recorded',
      lastReview: company.securitySettings.lastSecurityReview,
      nextReview: company.securitySettings.nextSecurityReview
    });
  } catch (err) {
    console.error('Error recording security review:', err);
    res.status(500).json({ error: 'Failed to record security review' });
  }
});

module.exports = router;

