/**
 * FieldLedger - Spec Library Routes
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Manages utility construction standards and specifications.
 * Specs are organized by: DIVISION → SECTION → DOCUMENT NUMBER
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const SpecDocument = require('../models/SpecDocument');
const User = require('../models/User');
const r2Storage = require('../utils/storage');

// Configure multer for spec uploads
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const specUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => cb(null, `spec_${Date.now()}${path.extname(file.originalname)}`)
  }),
  limits: { fileSize: 50 * 1024 * 1024 },  // 50MB max
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx', '.xls', '.xlsx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext) || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and Office documents are allowed'), false);
    }
  }
});

// Get all specs (with filters)
router.get('/', async (req, res) => {
  try {
    const { utilityId, category, section, division, search } = req.query;
    const user = await User.findById(req.userId);
    
    const query = { isDeleted: { $ne: true } };
    
    if (utilityId) query.utilityId = utilityId;
    if (division) query.division = division;
    if (category) query.category = category;
    if (section) query.section = section;
    
    // Multi-tenant filtering
    if (user?.companyId && !user.isSuperAdmin) {
      query.$or = [
        { companyId: user.companyId },
        { companyId: { $exists: false } },
        { companyId: null }
      ];
    }
    
    let specs;
    if (search) {
      try {
        specs = await SpecDocument.find({
          ...query,
          $text: { $search: search }
        })
          .populate('utilityId', 'name shortName')
          .populate('createdBy', 'name email')
          .sort({ score: { $meta: 'textScore' } })
          .lean();
      } catch {
        specs = [];
      }
      
      if (specs.length === 0) {
        const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        specs = await SpecDocument.find({
          ...query,
          $or: [
            { name: searchRegex },
            { description: searchRegex },
            { documentNumber: searchRegex },
            { section: searchRegex },
            { category: searchRegex },
            { tags: searchRegex }
          ]
        })
          .populate('utilityId', 'name shortName')
          .populate('createdBy', 'name email')
          .sort({ division: 1, section: 1, documentNumber: 1, name: 1 })
          .lean();
      }
    } else {
      specs = await SpecDocument.find(query)
        .populate('utilityId', 'name shortName')
        .populate('createdBy', 'name email')
        .sort({ division: 1, section: 1, documentNumber: 1, name: 1 })
        .lean();
    }
    
    res.json(specs);
  } catch (err) {
    console.error('Get specs error:', err);
    res.status(500).json({ error: 'Failed to get specs' });
  }
});

// Get spec categories (for dropdowns) — must be before /:id
router.get('/meta/categories', (_req, res) => {
  res.json([
    { value: 'overhead', label: 'Overhead Construction' },
    { value: 'underground', label: 'Underground Construction' },
    { value: 'safety', label: 'Safety Standards' },
    { value: 'equipment', label: 'Equipment Specs' },
    { value: 'materials', label: 'Material Specifications' },
    { value: 'procedures', label: 'Work Procedures' },
    { value: 'forms', label: 'Required Forms' },
    { value: 'traffic_control', label: 'Traffic Control Plans' },
    { value: 'environmental', label: 'Environmental Requirements' },
    { value: 'other', label: 'Other' }
  ]);
});

// Get sections grouped by category (for tree navigation)
router.get('/meta/sections', async (req, res) => {
  try {
    const { category, utilityId } = req.query;
    const user = await User.findById(req.userId);
    
    const matchStage = { isDeleted: { $ne: true } };
    if (category) matchStage.category = category;
    if (utilityId) matchStage.utilityId = new mongoose.Types.ObjectId(utilityId);
    
    if (user?.companyId && !user.isSuperAdmin) {
      matchStage.$or = [
        { companyId: user.companyId },
        { companyId: { $exists: false } },
        { companyId: null }
      ];
    }
    
    const result = await SpecDocument.aggregate([
      { $match: matchStage },
      { 
        $group: {
          _id: { division: '$division', section: '$section' },
          count: { $sum: 1 },
          latestUpdate: { $max: '$updatedAt' }
        }
      },
      { $sort: { '_id.division': 1, '_id.section': 1 } }
    ]);
    
    // Group by division for tree structure
    const tree = {};
    for (const item of result) {
      const div = item._id.division || 'general';
      if (!tree[div]) tree[div] = [];
      tree[div].push({
        section: item._id.section,
        count: item.count,
        latestUpdate: item.latestUpdate
      });
    }
    
    res.json(tree);
  } catch (err) {
    console.error('Get sections error:', err);
    res.status(500).json({ error: 'Failed to get sections' });
  }
});

// Get single spec with version history
router.get('/:id', async (req, res) => {
  try {
    const spec = await SpecDocument.findById(req.params.id)
      .populate('utilityId', 'name shortName')
      .populate('createdBy', 'name email')
      .populate('versions.uploadedBy', 'name email')
      .populate('versions.supersededBy', 'name email');
    
    if (!spec || spec.isDeleted) {
      return res.status(404).json({ error: 'Spec not found' });
    }
    
    spec.viewCount += 1;
    spec.lastViewedAt = new Date();
    await spec.save();
    
    res.json(spec);
  } catch (err) {
    console.error('Get spec error:', err);
    res.status(500).json({ error: 'Failed to get spec' });
  }
});

// Create a new spec document
router.post('/', specUpload.single('file'), async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    
    if (!['qa', 'pm', 'admin'].includes(user?.role) && !user?.isSuperAdmin) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    const { 
      name, description, documentNumber, division, category, section, subcategory, 
      utilityId, effectiveDate, tags, versionNumber 
    } = req.body;
    
    const specSection = section || category || 'General';
    const specCategory = category || section || 'general';
    
    if (!name || !utilityId) {
      return res.status(400).json({ error: 'Name and utility are required' });
    }
    
    const specDivision = division || 'overhead';
    
    if (!req.file) {
      return res.status(400).json({ error: 'File is required' });
    }
    
    let r2Key = null;
    
    if (r2Storage.isR2Configured()) {
      const r2Result = await r2Storage.uploadFile(
        req.file.path,
        `specs/${utilityId}/${specDivision}/${specSection}/${Date.now()}_${req.file.originalname}`,
        req.file.mimetype || 'application/pdf'
      );
      r2Key = r2Result.key;
      fs.unlinkSync(req.file.path);
    } else {
      r2Key = req.file.path;
    }
    
    const version = versionNumber || '1.0';
    
    const spec = new SpecDocument({
      name, description, documentNumber,
      division: specDivision,
      category: specCategory,
      section: specSection,
      subcategory, utilityId,
      companyId: user.companyId || null,
      effectiveDate: effectiveDate ? new Date(effectiveDate) : null,
      tags: tags ? (typeof tags === 'string' ? tags.split(',').map(t => t.trim()) : tags) : [],
      currentVersion: version,
      r2Key,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      versions: [{
        versionNumber: version,
        r2Key,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        uploadedBy: req.userId,
        isActive: true,
        notes: 'Initial upload'
      }],
      createdBy: req.userId
    });
    
    await spec.save();
    console.log(`Spec created: ${name} (${specCategory}) by ${user.email}`);
    res.status(201).json(spec);
  } catch (err) {
    console.error('Create spec error:', err);
    res.status(500).json({ error: 'Failed to create spec' });
  }
});

// Upload new version of a spec
router.post('/:id/versions', specUpload.single('file'), async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    
    if (!['qa', 'pm', 'admin'].includes(user?.role) && !user?.isSuperAdmin) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'File is required' });
    }
    
    const { versionNumber, notes } = req.body;
    if (!versionNumber) {
      return res.status(400).json({ error: 'Version number is required' });
    }
    
    const spec = await SpecDocument.findById(req.params.id);
    if (!spec || spec.isDeleted) {
      return res.status(404).json({ error: 'Spec not found' });
    }
    
    let r2Key = null;
    
    if (r2Storage.isR2Configured()) {
      const r2Result = await r2Storage.uploadFile(
        req.file.path,
        `specs/${spec.utilityId}/${spec.category}/${Date.now()}_${req.file.originalname}`,
        req.file.mimetype || 'application/pdf'
      );
      r2Key = r2Result.key;
      fs.unlinkSync(req.file.path);
    } else {
      r2Key = req.file.path;
    }
    
    await spec.addVersion({
      versionNumber, r2Key,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      notes: notes || `Updated to version ${versionNumber}`
    }, req.userId);
    
    console.log(`Spec ${spec.name} updated to version ${versionNumber} by ${user.email}`);
    res.json({ message: 'New version uploaded', spec });
  } catch (err) {
    console.error('Upload spec version error:', err);
    res.status(500).json({ error: 'Failed to upload new version' });
  }
});

// Update spec metadata
router.put('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    
    if (!['qa', 'pm', 'admin'].includes(user?.role) && !user?.isSuperAdmin) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    const { name, description, documentNumber, division, category, section, subcategory, effectiveDate, expirationDate, tags } = req.body;
    
    const spec = await SpecDocument.findById(req.params.id);
    if (!spec || spec.isDeleted) {
      return res.status(404).json({ error: 'Spec not found' });
    }
    
    if (name) spec.name = name;
    if (description !== undefined) spec.description = description;
    if (documentNumber !== undefined) spec.documentNumber = documentNumber;
    if (division) spec.division = division;
    if (category) spec.category = category;
    if (section !== undefined) spec.section = section;
    if (subcategory !== undefined) spec.subcategory = subcategory;
    if (effectiveDate) spec.effectiveDate = new Date(effectiveDate);
    if (expirationDate) spec.expirationDate = new Date(expirationDate);
    if (tags) spec.tags = typeof tags === 'string' ? tags.split(',').map(t => t.trim()) : tags;
    
    spec.lastUpdatedBy = req.userId;
    await spec.save();
    
    res.json(spec);
  } catch (err) {
    console.error('Update spec error:', err);
    res.status(500).json({ error: 'Failed to update spec' });
  }
});

// Soft delete a spec
router.delete('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    
    if (!['qa', 'pm', 'admin'].includes(user?.role) && !user?.isSuperAdmin) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    const spec = await SpecDocument.findById(req.params.id);
    if (!spec) {
      return res.status(404).json({ error: 'Spec not found' });
    }
    
    spec.isDeleted = true;
    spec.deletedAt = new Date();
    spec.deletedBy = req.userId;
    await spec.save();
    
    console.log(`Spec ${spec.name} deleted by ${user.email}`);
    res.json({ message: 'Spec deleted' });
  } catch (err) {
    console.error('Delete spec error:', err);
    res.status(500).json({ error: 'Failed to delete spec' });
  }
});

// Download spec file
router.get('/:id/download', async (req, res) => {
  try {
    const { version } = req.query;
    
    const spec = await SpecDocument.findById(req.params.id);
    if (!spec || spec.isDeleted) {
      return res.status(404).json({ error: 'Spec not found' });
    }
    
    let r2Key = spec.r2Key;
    let fileName = spec.fileName;
    
    if (version) {
      const versionDoc = spec.versions.find(v => v.versionNumber === version);
      if (!versionDoc) {
        return res.status(404).json({ error: 'Version not found' });
      }
      r2Key = versionDoc.r2Key;
      fileName = versionDoc.fileName;
    }
    
    if (r2Storage.isR2Configured()) {
      const fileData = await r2Storage.getFileStream(r2Key);
      if (!fileData) {
        return res.status(404).json({ error: 'File not found in storage' });
      }
      
      res.setHeader('Content-Type', fileData.contentType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      if (fileData.contentLength) {
        res.setHeader('Content-Length', fileData.contentLength);
      }
      
      fileData.stream.pipe(res);
    } else {
      if (!fs.existsSync(r2Key)) {
        return res.status(404).json({ error: 'File not found' });
      }
      res.download(r2Key, fileName);
    }
  } catch (err) {
    console.error('Download spec error:', err);
    res.status(500).json({ error: 'Failed to download spec' });
  }
});

module.exports = router;

