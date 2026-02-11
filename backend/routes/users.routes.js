/**
 * FieldLedger - User Management Routes
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Routes for user listing and profile access.
 * Multi-tenant: always filtered by company.
 */

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const authController = require('../controllers/auth.controller');

// Get current user profile
router.get('/me', authController.getProfile);

// Get all users (for assignment dropdown) - Admin, PM, or GF
router.get('/', async (req, res) => {
  try {
    if (!req.isAdmin && !['admin', 'pm', 'gf'].includes(req.userRole)) {
      return res.status(403).json({ error: 'Only Admin, PM, or GF can view users' });
    }
    
    const currentUser = await User.findById(req.userId).select('companyId');
    
    if (!currentUser?.companyId) {
      return res.json([]);
    }
    
    const users = await User.find(
      { companyId: currentUser.companyId },
      'name email role isAdmin companyId'
    ).sort({ name: 1 });
    
    res.json(users);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get foremen only (for assignment)
router.get('/foremen', async (req, res) => {
  try {
    const currentUser = await User.findById(req.userId).select('companyId');
    
    if (!currentUser?.companyId) {
      return res.json([]);
    }
    
    const query = { 
      companyId: currentUser.companyId,
      $or: [{ role: 'foreman' }, { role: 'admin' }, { isAdmin: true }] 
    };
    
    const foremen = await User.find(query, 'name email role companyId').sort({ name: 1 });
    res.json(foremen);
  } catch (err) {
    console.error('Error fetching foremen:', err);
    res.status(500).json({ error: 'Failed to fetch foremen' });
  }
});

module.exports = router;

