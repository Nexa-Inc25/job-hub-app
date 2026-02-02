/**
 * FieldLedger - PriceBook Routes
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Endpoints for managing utility contract rate sheets (Schedule of Values).
 * Supports CRUD operations, CSV import, and rate lookups.
 * 
 * @swagger
 * tags:
 *   - name: PriceBook
 *     description: Contract rate management for unit-price billing
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const PriceBook = require('../models/PriceBook');
const User = require('../models/User');
const { sanitizeString, sanitizeObjectId } = require('../utils/sanitize');

// Multer setup for CSV upload
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || 
        file.originalname.endsWith('.csv') ||
        file.mimetype === 'application/vnd.ms-excel') {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  }
});

// Valid categories for price book items
const VALID_CATEGORIES = new Set(['civil', 'electrical', 'overhead', 'underground', 'traffic_control', 'vegetation', 'emergency', 'other']);

/**
 * Parse a single CSV row into a price book item
 * Returns { item, error } - item is null if invalid
 */
function parseCSVRow(row, rowIndex) {
  // Validate required fields
  if (!row.itemcode || !row.description || !row.category || !row.unit || !row.unitprice) {
    return { item: null, error: { row: rowIndex, message: 'Missing required field' } };
  }

  const unitPrice = Number.parseFloat(row.unitprice);
  if (Number.isNaN(unitPrice) || unitPrice < 0) {
    return { item: null, error: { row: rowIndex, field: 'unitprice', message: 'Invalid unit price' } };
  }

  const category = row.category.toLowerCase();
  if (!VALID_CATEGORIES.has(category)) {
    return { item: null, error: { row: rowIndex, field: 'category', message: `Invalid category. Must be one of: ${[...VALID_CATEGORIES].join(', ')}` } };
  }

  return {
    item: {
      itemCode: row.itemcode,
      description: row.description,
      shortDescription: row.shortdescription || null,
      category,
      subcategory: row.subcategory || null,
      unit: row.unit.toUpperCase(),
      unitPrice,
      laborRate: row.laborrate ? Number.parseFloat(row.laborrate) : null,
      materialRate: row.materialrate ? Number.parseFloat(row.materialrate) : null,
      oracleItemId: row.oracleitemid || null,
      oracleExpenseAccount: row.oracleexpenseaccount || null,
      sapMaterialNumber: row.sapmaterialnumber || null,
      isActive: true
    },
    error: null
  };
}

/**
 * Parse CSV content into items and errors
 */
/**
 * Apply allowed field updates to a price book
 */
/**
 * Convert a date field value to a Date object or null
 */
function parseDateField(value) {
  if (!value) return null;
  return new Date(value);
}

function applyPriceBookUpdates(priceBook, body) {
  const allowedFields = ['name', 'description', 'contractNumber', 'effectiveDate', 'expirationDate', 'items', 'internalNotes'];
  const dateFields = new Set(['effectiveDate', 'expirationDate']);
  
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      priceBook[field] = dateFields.has(field) 
        ? parseDateField(body[field])
        : body[field];
    }
  }
}

function parseCSVContent(csvContent) {
  const lines = csvContent.split('\n').filter(line => line.trim());
  
  if (lines.length < 2) {
    return { headers: null, items: [], errors: [], validationError: 'CSV must have header row and at least one data row' };
  }

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const requiredColumns = ['itemcode', 'description', 'category', 'unit', 'unitprice'];
  const missingColumns = requiredColumns.filter(col => !headers.includes(col));
  
  if (missingColumns.length > 0) {
    return { headers, items: [], errors: [], validationError: `Missing required columns: ${missingColumns.join(', ')}`, requiredColumns };
  }

  const items = [];
  const errors = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replaceAll(/(?:^")|(?:"$)/g, ''));
    
    if (values.length !== headers.length) {
      errors.push({ row: i + 1, message: 'Column count mismatch' });
      continue;
    }

    const row = {};
    headers.forEach((header, idx) => { row[header] = values[idx]; });

    const { item, error } = parseCSVRow(row, i + 1);
    if (item) items.push(item);
    if (error) errors.push(error);
  }

  return { headers, items, errors, validationError: null };
}

/**
 * @swagger
 * /api/pricebooks:
 *   get:
 *     summary: List price books for company
 *     tags: [PriceBook]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, active, superseded, archived]
 *       - in: query
 *         name: utilityId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of price books
 */
router.get('/', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      console.log('[PriceBook] User has no companyId:', req.userId);
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const { status, utilityId } = req.query;
    const query = { companyId: user.companyId };
    
    // Sanitize query parameters to prevent NoSQL injection
    const safeStatus = sanitizeString(status);
    const safeUtilityId = sanitizeObjectId(utilityId);
    
    if (safeStatus) query.status = safeStatus;
    if (safeUtilityId) query.utilityId = safeUtilityId;

    console.log('[PriceBook] List query:', { userId: req.userId, userCompanyId: user.companyId, role: user.role, query });

    const priceBooks = await PriceBook.find(query)
      .select('-items') // Exclude items for list view (can be large)
      .sort({ createdAt: -1 })
      .limit(50);

    console.log('[PriceBook] Found:', priceBooks.length, 'price books');
    res.json(priceBooks);
  } catch (err) {
    console.error('Error listing price books:', err);
    res.status(500).json({ error: 'Failed to list price books' });
  }
});

/**
 * @swagger
 * /api/pricebooks/active:
 *   get:
 *     summary: Get active price book for utility
 *     tags: [PriceBook]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: utilityId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Active price book with items
 *       404:
 *         description: No active price book found
 */
router.get('/active', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const { utilityId } = req.query;
    if (!utilityId || !mongoose.Types.ObjectId.isValid(utilityId)) {
      return res.status(400).json({ error: 'Valid utilityId is required' });
    }

    const priceBook = await PriceBook.getActive(user.companyId, utilityId);
    
    if (!priceBook) {
      return res.status(404).json({ error: 'No active price book found for this utility' });
    }

    res.json(priceBook);
  } catch (err) {
    console.error('Error getting active price book:', err);
    res.status(500).json({ error: 'Failed to get active price book' });
  }
});

/**
 * @swagger
 * /api/pricebooks/{id}:
 *   get:
 *     summary: Get price book by ID
 *     tags: [PriceBook]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Price book details with items
 */
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const priceBookId = sanitizeObjectId(req.params.id);
    if (!priceBookId) {
      return res.status(400).json({ error: 'Invalid price book ID' });
    }

    const priceBook = await PriceBook.findOne({
      _id: priceBookId,
      companyId: user.companyId
    });

    if (!priceBook) {
      return res.status(404).json({ error: 'Price book not found' });
    }

    res.json(priceBook);
  } catch (err) {
    console.error('Error getting price book:', err);
    res.status(500).json({ error: 'Failed to get price book' });
  }
});

/**
 * @swagger
 * /api/pricebooks/{id}/items:
 *   get:
 *     summary: Get items from price book with optional filtering
 *     tags: [PriceBook]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [civil, electrical, overhead, underground, traffic_control, vegetation, emergency, other]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by item code or description
 *     responses:
 *       200:
 *         description: List of rate items
 */
router.get('/:id/items', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const priceBookId = sanitizeObjectId(req.params.id);
    if (!priceBookId) {
      return res.status(400).json({ error: 'Invalid price book ID' });
    }

    const priceBook = await PriceBook.findOne({
      _id: priceBookId,
      companyId: user.companyId
    });

    if (!priceBook) {
      return res.status(404).json({ error: 'Price book not found' });
    }

    const { category, search } = req.query;
    let items = priceBook.items.filter(i => i.isActive);

    // Filter by category
    if (category) {
      items = items.filter(i => i.category === category);
    }

    // Search by code or description
    if (search) {
      const lowerSearch = search.toLowerCase();
      items = items.filter(i => 
        i.itemCode.toLowerCase().includes(lowerSearch) ||
        i.description.toLowerCase().includes(lowerSearch) ||
        i.shortDescription?.toLowerCase().includes(lowerSearch)
      );
    }

    res.json({
      priceBookId: priceBook._id,
      priceBookName: priceBook.name,
      itemCount: items.length,
      items
    });
  } catch (err) {
    console.error('Error getting price book items:', err);
    res.status(500).json({ error: 'Failed to get price book items' });
  }
});

/**
 * @swagger
 * /api/pricebooks:
 *   post:
 *     summary: Create new price book
 *     tags: [PriceBook]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - utilityId
 *               - effectiveDate
 *             properties:
 *               name:
 *                 type: string
 *               utilityId:
 *                 type: string
 *               effectiveDate:
 *                 type: string
 *                 format: date
 *               contractNumber:
 *                 type: string
 *               items:
 *                 type: array
 *     responses:
 *       201:
 *         description: Price book created
 */
router.post('/', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    // Only admin/PM can create price books
    if (!req.isAdmin && user.role !== 'pm') {
      return res.status(403).json({ error: 'Only admins and PMs can create price books' });
    }

    const { name, utilityId, effectiveDate, expirationDate, contractNumber, items } = req.body;

    if (!name || !utilityId || !effectiveDate) {
      return res.status(400).json({ error: 'name, utilityId, and effectiveDate are required' });
    }

    // Sanitize inputs to prevent NoSQL injection
    const safeName = sanitizeString(name);
    const safeUtilityId = sanitizeObjectId(utilityId);
    const safeContractNumber = sanitizeString(contractNumber);

    if (!safeUtilityId) {
      return res.status(400).json({ error: 'Invalid utilityId' });
    }

    // Validate and sanitize items array
    const safeItems = Array.isArray(items) ? items.map(item => ({
      itemCode: sanitizeString(item.itemCode),
      description: sanitizeString(item.description),
      shortDescription: sanitizeString(item.shortDescription),
      category: sanitizeString(item.category),
      subcategory: sanitizeString(item.subcategory),
      unit: sanitizeString(item.unit),
      unitPrice: typeof item.unitPrice === 'number' ? item.unitPrice : 0,
      laborComponent: typeof item.laborComponent === 'number' ? item.laborComponent : undefined,
      materialComponent: typeof item.materialComponent === 'number' ? item.materialComponent : undefined,
      equipmentComponent: typeof item.equipmentComponent === 'number' ? item.equipmentComponent : undefined,
      isActive: typeof item.isActive === 'boolean' ? item.isActive : true
    })).filter(item => item.itemCode && item.description) : [];

    const priceBook = await PriceBook.create({
      name: safeName,
      utilityId: safeUtilityId,
      companyId: user.companyId,
      effectiveDate: new Date(effectiveDate),
      expirationDate: expirationDate ? new Date(expirationDate) : null,
      contractNumber: safeContractNumber,
      items: safeItems,
      importSource: 'manual',
      importedBy: user._id,
      importedAt: new Date(),
      changeLog: [{
        userId: user._id,
        action: 'created',
        details: `Created by ${user.name}`
      }]
    });

    res.status(201).json(priceBook);
  } catch (err) {
    console.error('Error creating price book:', err);
    res.status(500).json({ error: 'Failed to create price book' });
  }
});

/**
 * @swagger
 * /api/pricebooks/{id}/import:
 *   post:
 *     summary: Import items from CSV file
 *     tags: [PriceBook]
 *     security:
 *       - bearerAuth: []
 *     consumes:
 *       - multipart/form-data
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: formData
 *         name: file
 *         type: file
 *         required: true
 *         description: CSV file with rate items
 *     responses:
 *       200:
 *         description: Items imported successfully
 */
router.post('/:id/import', upload.single('file'), async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    if (!req.isAdmin && user.role !== 'pm') {
      return res.status(403).json({ error: 'Only admins and PMs can import rate items' });
    }

    const priceBookId = sanitizeObjectId(req.params.id);
    if (!priceBookId) {
      return res.status(400).json({ error: 'Invalid price book ID' });
    }

    const priceBook = await PriceBook.findOne({
      _id: priceBookId,
      companyId: user.companyId
    });

    if (!priceBook) {
      return res.status(404).json({ error: 'Price book not found' });
    }

    if (priceBook.status !== 'draft') {
      return res.status(400).json({ error: 'Can only import to draft price books' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'CSV file is required' });
    }

    // Parse CSV using helper function
    const csvContent = req.file.buffer.toString('utf-8');
    const { headers, items, errors, validationError, requiredColumns } = parseCSVContent(csvContent);
    
    if (validationError) {
      return res.status(400).json({ 
        error: validationError,
        ...(requiredColumns && { requiredColumns, foundColumns: headers })
      });
    }

    // Add items to price book
    priceBook.items.push(...items);
    priceBook.importSource = 'csv_upload';
    priceBook.importedBy = user._id;
    priceBook.importedAt = new Date();
    priceBook.originalFileName = req.file.originalname;
    priceBook.importErrors = errors;
    priceBook.changeLog.push({
      userId: user._id,
      action: 'import',
      details: `Imported ${items.length} items from ${req.file.originalname}`
    });

    await priceBook.save();

    res.json({
      success: true,
      imported: items.length,
      errors: errors.length,
      errorDetails: errors,
      totalItems: priceBook.items.length
    });
  } catch (err) {
    console.error('Error importing CSV:', err);
    res.status(500).json({ error: 'Failed to import CSV' });
  }
});

/**
 * @swagger
 * /api/pricebooks/{id}:
 *   put:
 *     summary: Update price book
 *     tags: [PriceBook]
 *     security:
 *       - bearerAuth: []
 */
router.put('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    if (!req.isAdmin && user.role !== 'pm') {
      return res.status(403).json({ error: 'Only admins and PMs can update price books' });
    }

    const priceBookId = sanitizeObjectId(req.params.id);
    if (!priceBookId) {
      return res.status(400).json({ error: 'Invalid price book ID' });
    }

    const priceBook = await PriceBook.findOne({
      _id: priceBookId,
      companyId: user.companyId
    });

    if (!priceBook) {
      return res.status(404).json({ error: 'Price book not found' });
    }

    // Only allow editing draft price books
    if (priceBook.status !== 'draft') {
      return res.status(400).json({ error: 'Can only edit draft price books' });
    }

    // Apply updates using helper function
    applyPriceBookUpdates(priceBook, req.body);

    priceBook.changeLog.push({
      userId: user._id,
      action: 'updated',
      details: `Updated by ${user.name}`
    });

    await priceBook.save();
    res.json(priceBook);
  } catch (err) {
    console.error('Error updating price book:', err);
    res.status(500).json({ error: 'Failed to update price book' });
  }
});

/**
 * @swagger
 * /api/pricebooks/{id}/activate:
 *   post:
 *     summary: Activate a draft price book
 *     tags: [PriceBook]
 *     security:
 *       - bearerAuth: []
 */
router.post('/:id/activate', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    if (!req.isAdmin && user.role !== 'pm') {
      return res.status(403).json({ error: 'Only admins and PMs can activate price books' });
    }

    const priceBookId = sanitizeObjectId(req.params.id);
    if (!priceBookId) {
      return res.status(400).json({ error: 'Invalid price book ID' });
    }

    const priceBook = await PriceBook.findOne({
      _id: priceBookId,
      companyId: user.companyId
    });

    if (!priceBook) {
      return res.status(404).json({ error: 'Price book not found' });
    }

    if (priceBook.status !== 'draft') {
      return res.status(400).json({ error: 'Only draft price books can be activated' });
    }

    if (!priceBook.items || priceBook.items.length === 0) {
      return res.status(400).json({ error: 'Price book must have at least one rate item' });
    }

    // Supersede any existing active price book for same utility
    const existingActive = await PriceBook.findOne({
      companyId: user.companyId,
      utilityId: priceBook.utilityId,
      status: 'active',
      _id: { $ne: priceBook._id }
    });

    if (existingActive) {
      existingActive.status = 'superseded';
      existingActive.supersededBy = priceBook._id;
      await existingActive.save();

      priceBook.supersedes = existingActive._id;
    }

    priceBook.status = 'active';
    priceBook.activatedBy = user._id;
    priceBook.activatedAt = new Date();
    priceBook.changeLog.push({
      userId: user._id,
      action: 'activated',
      details: existingActive 
        ? `Activated and superseded ${existingActive.name}` 
        : 'Activated'
    });

    await priceBook.save();
    res.json(priceBook);
  } catch (err) {
    console.error('Error activating price book:', err);
    res.status(500).json({ error: 'Failed to activate price book' });
  }
});

/**
 * @swagger
 * /api/pricebooks/{id}:
 *   delete:
 *     summary: Delete draft price book
 *     tags: [PriceBook]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    if (!req.isAdmin && user.role !== 'pm') {
      return res.status(403).json({ error: 'Only admins and PMs can delete price books' });
    }

    const priceBookId = sanitizeObjectId(req.params.id);
    if (!priceBookId) {
      return res.status(400).json({ error: 'Invalid price book ID' });
    }

    const priceBook = await PriceBook.findOne({
      _id: priceBookId,
      companyId: user.companyId
    });

    if (!priceBook) {
      return res.status(404).json({ error: 'Price book not found' });
    }

    // Only allow deleting draft price books
    if (priceBook.status !== 'draft') {
      return res.status(400).json({ error: 'Can only delete draft price books. Archive active ones instead.' });
    }

    await PriceBook.deleteOne({ _id: priceBook._id });
    res.json({ success: true, message: 'Price book deleted' });
  } catch (err) {
    console.error('Error deleting price book:', err);
    res.status(500).json({ error: 'Failed to delete price book' });
  }
});

module.exports = router;

