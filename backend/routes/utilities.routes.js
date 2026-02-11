/**
 * FieldLedger - Utilities Routes
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Public utility listing (for signup dropdown) + admin utility management.
 */

const express = require('express');
const router = express.Router();
const Utility = require('../models/Utility');

// Get all utilities (public - for signup dropdown)
router.get('/', async (req, res) => {
  try {
    const utilities = await Utility.find({ isActive: true })
      .select('name slug shortName region')
      .lean();
    res.json(utilities);
  } catch (err) {
    console.error('Error fetching utilities:', err);
    res.status(500).json({ error: 'Failed to fetch utilities' });
  }
});

// Get utility by slug
router.get('/:slug', async (req, res) => {
  try {
    const utility = await Utility.findOne({ slug: req.params.slug, isActive: true });
    if (!utility) {
      return res.status(404).json({ error: 'Utility not found' });
    }
    res.json(utility);
  } catch (err) {
    console.error('Error fetching utility:', err);
    res.status(500).json({ error: 'Failed to fetch utility' });
  }
});

// Create utility (admin only - auth checked inline since public routes above don't need auth)
router.post('/', async (req, res) => {
  try {
    if (!req.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const utility = new Utility(req.body);
    await utility.save();
    
    console.log('Created utility:', utility.name);
    res.status(201).json(utility);
  } catch (err) {
    console.error('Error creating utility:', err);
    res.status(500).json({ error: 'Failed to create utility', details: err.message });
  }
});

module.exports = router;

