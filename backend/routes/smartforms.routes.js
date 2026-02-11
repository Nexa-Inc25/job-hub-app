/**
 * SmartForms Routes - PDF Template Field Mapping & Fill System
 * 
 * Allows administrators to:
 * 1. Upload utility PDF templates
 * 2. Draw fields on the PDF to define fillable areas
 * 3. Map fields to FieldLedger data paths
 * 4. Batch fill PDFs with job data
 * 
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 */

const express = require('express');
const router = express.Router();
const FormTemplate = require('../models/FormTemplate');
const Job = require('../models/Job');
const Company = require('../models/Company');
const User = require('../models/User');
const LME = require('../models/LME');
const UnitEntry = require('../models/UnitEntry');
const { PDFDocument, StandardFonts, rgb, degrees } = require('pdf-lib');
const r2Storage = require('../utils/storage');
const { sanitizeObjectId, sanitizeString } = require('../utils/sanitize');
const multer = require('multer');

// Multer for PDF uploads (memory storage, 20MB limit)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Parse hex color to RGB values (0-1 range)
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return { r: 0, g: 0, b: 0 };
  return {
    r: Number.parseInt(result[1], 16) / 255,
    g: Number.parseInt(result[2], 16) / 255,
    b: Number.parseInt(result[3], 16) / 255,
  };
}

/**
 * Resolve a data path against a data object
 * Supports dot notation and array indexing:
 * - "job.address" -> data.job.address
 * - "lme.labor[0].name" -> data.lme.labor[0].name
 */
function resolveDataPath(obj, path) {
  if (!path || !obj) return '';
  
  // Parse path into segments, handling both dot notation and array brackets
  // e.g., "lme.labor[0].name" -> ["lme", "labor", "0", "name"]
  const segments = path.split(/[.[\]]/).filter(s => s !== '');
  
  let current = obj;
  for (const segment of segments) {
    if (current === null || current === undefined) return '';
    
    // Try to parse as number for array access
    const index = Number.parseInt(segment, 10);
    if (!Number.isNaN(index) && Array.isArray(current)) {
      current = current[index];
    } else {
      current = current[segment];
    }
  }
  
  // Handle object values by converting to string representation
  if (current !== null && typeof current === 'object' && !(current instanceof Date)) {
    // For nested objects without further path, return empty
    return '';
  }
  
  return current ?? '';
}

/**
 * Build unit summary from UnitEntry records for a job
 */
async function buildUnitSummary(jobId, companyId) {
  const units = await UnitEntry.find({ 
    jobId, 
    companyId, 
    isDeleted: { $ne: true } 
  }).lean();
  
  if (!units.length) {
    return { totalCount: 0, totalAmount: 0, categories: '', itemCodes: '' };
  }
  
  const categories = [...new Set(units.map(u => u.category).filter(Boolean))];
  const itemCodes = [...new Set(units.map(u => u.itemCode).filter(Boolean))];
  const totalAmount = units.reduce((sum, u) => sum + (u.totalAmount || 0), 0);
  
  return {
    totalCount: units.length,
    totalAmount: Math.round(totalAmount * 100) / 100,
    categories: categories.join(', '),
    itemCodes: itemCodes.join(', '),
  };
}

/**
 * Build crew summary from LME labor entries
 */
function buildCrewSummary(lme) {
  if (!lme?.labor?.length) {
    return {
      headcount: 0,
      totalSTHours: 0,
      totalOTHours: 0,
      totalDTHours: 0,
      stHeadcount: 0,
      otHeadcount: 0,
    };
  }
  
  const labor = lme.labor;
  const totalSTHours = labor.reduce((sum, l) => sum + (Number(l.stHours) || 0), 0);
  const totalOTHours = labor.reduce((sum, l) => sum + (Number(l.otHours) || 0), 0);
  const totalDTHours = labor.reduce((sum, l) => sum + (Number(l.dtHours) || 0), 0);
  
  // Headcount = workers with any hours
  const stHeadcount = labor.filter(l => Number(l.stHours) > 0).length;
  const otHeadcount = labor.filter(l => Number(l.otHours) > 0 || Number(l.dtHours) > 0).length;
  
  return {
    headcount: labor.length,
    totalSTHours,
    totalOTHours,
    totalDTHours,
    stHeadcount,
    otHeadcount,
  };
}

/**
 * Build data context for template filling
 * @param {Object} params - Parameters
 * @param {string} params.jobId - Job ID
 * @param {string} params.companyId - Company ID
 * @param {Object} params.user - User object
 * @param {Object} params.customData - Custom data to merge
 * @returns {Promise<Object>} Data context for template filling
 */
async function buildDataContext({ jobId, companyId, user, customData = {} }) {
  let dataContext = { ...customData };
  
  if (jobId) {
    const job = await Job.findOne({ 
      _id: sanitizeObjectId(jobId), 
      companyId 
    }).populate('userId', 'name email')
      .populate('assignedTo', 'name email')
      .populate('assignedToGF', 'name email');
    
    if (job) {
      dataContext.job = job.toObject();
      
      // Fetch the most recent LME for this job
      const lme = await LME.findOne({ jobId: job._id, companyId })
        .sort({ date: -1 })
        .lean();
      if (lme) {
        dataContext.lme = lme;
        dataContext.crew = buildCrewSummary(lme);
      }
      
      // Build unit summary for this job
      dataContext.units = await buildUnitSummary(job._id, companyId);
    }
  }
  
  // Get company info
  const company = await Company.findById(companyId);
  if (company) {
    dataContext.company = company.toObject();
  }
  
  // Add current date/time
  const now = new Date();
  dataContext.today = now;
  dataContext.now = now;
  dataContext.currentYear = now.getFullYear();
  dataContext.currentMonth = now.toLocaleString('en-US', { month: 'long' });
  dataContext.user = { name: user.name, email: user.email, role: user.role };
  
  return dataContext;
}

/**
 * Resolve field value from data context or default
 */
function resolveFieldValue(field, dataContext, dataMappings, debug) {
  const mapping = dataMappings.get(field.name);
  
  if (mapping) {
    const value = resolveDataPath(dataContext, mapping);
    if (debug) console.log(`[SmartForms] Field "${field.name}" mapped to "${mapping}" => "${value}"`);
    return value;
  }
  
  if (field.defaultValue) {
    if (debug) console.log(`[SmartForms] Field "${field.name}" using default => "${field.defaultValue}"`);
    return field.defaultValue;
  }
  
  return '';
}

/**
 * Format field value based on field type
 */
function formatFieldValue(value, field) {
  if (!value) return '';
  
  if (field.type === 'date') {
    return formatDate(value, field.dateFormat);
  }
  
  if (field.type === 'checkbox') {
    const strValue = String(value).toLowerCase();
    const isTruthy = strValue === 'true' || strValue === '1' || strValue === 'yes';
    return isTruthy ? '✓' : '';
  }
  
  return value;
}

/**
 * Draw field text on PDF page, handling page rotation
 * 
 * IMPORTANT: Field bounds are stored in "visual" coordinates from the template editor.
 * The template editor uses react-pdf which shows pages in their rotated orientation.
 * 
 * pdf-lib's drawText() uses the internal MediaBox coordinate system (unrotated).
 * For rotated pages, we need to:
 * 1. Transform visual coordinates to internal coordinates
 * 2. Rotate the text itself so it appears upright in the final document
 * 
 * Coordinate transformations for rotation:
 * - 0°: No change (visual = internal)
 * - 90° CW: The page is rotated 90° clockwise
 *   - Visual width = internal height, visual height = internal width
 *   - Visual (x, y) → Internal (y, width - x)
 * - 180°: Upside down
 *   - Visual (x, y) → Internal (width - x, height - y)
 * - 270° CW (90° CCW): The page is rotated 270° clockwise
 *   - Visual (x, y) → Internal (height - y, x)
 */
function drawFieldOnPage(page, field, value, font, debug, pageDimension) {
  const color = hexToRgb(field.fontColor || '#000000');
  const fontSize = field.fontSize || 10;
  const padding = 2;
  
  // Get page rotation (0, 90, 180, 270)
  const rotation = pageDimension?.rotation || page.getRotation().angle;
  
  // Field bounds are in visual (post-rotation) coordinates from the template editor
  const visualX = field.bounds.x + padding;
  const visualY = field.bounds.y + padding;
  
  // Get the internal (unrotated) page dimensions from MediaBox
  const mediaBox = page.getMediaBox();
  const internalWidth = mediaBox.width;
  const internalHeight = mediaBox.height;
  
  // Transform visual coordinates to internal PDF coordinates based on rotation
  let pdfX, pdfY;
  
  if (rotation === 90) {
    // 90° CW: The page was rotated clockwise
    // Visual X-axis corresponds to internal Y-axis
    // Visual Y-axis corresponds to internal X-axis (inverted)
    pdfX = visualY;
    pdfY = internalHeight - visualX - fontSize; // Adjust for text baseline
  } else if (rotation === 180) {
    // 180°: Everything is flipped
    pdfX = internalWidth - visualX;
    pdfY = internalHeight - visualY;
  } else if (rotation === 270) {
    // 270° CW (90° CCW): The page was rotated counter-clockwise
    pdfX = internalWidth - visualY;
    pdfY = visualX;
  } else {
    // No rotation (0°): Visual = Internal
    pdfX = visualX;
    pdfY = visualY;
  }
  
  if (debug) {
    console.log(`[SmartForms] Field "${field.name}" rotation=${rotation}°`);
    console.log(`  MediaBox: ${internalWidth} x ${internalHeight}`);
    console.log(`  Visual(${field.bounds.x}, ${field.bounds.y}) -> Internal(${pdfX}, ${pdfY})`);
  }
  
  // Draw text - the page rotation is applied automatically by the PDF renderer
  // We need to counter-rotate the text so it appears upright
  const drawOptions = {
    x: pdfX,
    y: pdfY,
    size: fontSize,
    font,
    color: rgb(color.r, color.g, color.b),
  };
  
  // For rotated pages, we need to rotate the text to counter the page rotation
  // This makes the text appear horizontal in the final rendered document
  if (rotation !== 0) {
    drawOptions.rotate = degrees(rotation); // Counter-rotate (positive angle)
  }
  
  page.drawText(String(value), drawOptions);
}

/**
 * Fill fields on PDF pages with data context
 * @param {Object} params - Parameters
 * @param {Object} params.template - Template with fields and dataMappings
 * @param {Object} params.dataContext - Data context for resolving values
 * @param {Array} params.pages - PDF pages array
 * @param {Object} params.font - Embedded font
 * @param {boolean} params.debug - Enable debug logging
 */
function fillPdfFields({ template, dataContext, pages, font, debug = false }) {
  // Get stored page dimensions with rotation info
  const pageDimensions = template.sourceFile?.pageDimensions || [];
  
  for (const field of template.fields) {
    const pageIndex = field.page - 1;
    if (pageIndex < 0 || pageIndex >= pages.length) continue;
    
    const rawValue = resolveFieldValue(field, dataContext, template.dataMappings, debug);
    const value = formatFieldValue(rawValue, field);
    
    if (!value) continue;
    
    // Pass page dimension with rotation info
    const pageDim = pageDimensions[pageIndex];
    drawFieldOnPage(pages[pageIndex], field, value, font, debug, pageDim);
  }
}

/**
 * Format a date value according to format string
 */
function formatDate(value, format = 'MM/DD/YYYY') {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  
  return format
    .replace('MM', month)
    .replace('DD', day)
    .replace('YYYY', String(year))
    .replace('YY', String(year).slice(-2));
}

/**
 * Load PDF bytes from R2 storage
 */
async function loadPdfFromR2(r2Key) {
  if (!r2Storage.isR2Configured()) {
    throw new Error('R2 storage is not configured');
  }
  
  const fileStream = await r2Storage.getFileStream(r2Key);
  if (!fileStream?.stream) {
    throw new Error('Template PDF not found in storage');
  }
  
  const chunks = [];
  for await (const chunk of fileStream.stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// ============================================================================
// TEMPLATE CRUD ROUTES
// ============================================================================

/**
 * GET /api/smartforms/templates
 * List all templates for the user's company
 */
router.get('/templates', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }
    const companyId = user.companyId;
    
    const { status, category } = req.query;
    const query = { companyId };
    
    if (status) query.status = sanitizeString(status);
    if (category) query.category = sanitizeString(category);
    
    const templates = await FormTemplate.find(query)
      .select('name description category status version fieldCount fillCount createdAt')
      .sort({ name: 1 });
    
    res.json(templates);
  } catch (error) {
    console.error('Error listing templates:', error);
    res.status(500).json({ error: 'Failed to list templates' });
  }
});

/**
 * GET /api/smartforms/templates/:id
 * Get a single template with all fields
 */
router.get('/templates/:id', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }
    const templateId = sanitizeObjectId(req.params.id);
    const companyId = user.companyId;
    
    const template = await FormTemplate.findOne({ 
      _id: templateId, 
      companyId 
    });
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    res.json(template);
  } catch (error) {
    console.error('Error getting template:', error);
    res.status(500).json({ error: 'Failed to get template' });
  }
});

/**
 * POST /api/smartforms/templates
 * Create a new template by uploading a PDF
 */
router.post('/templates', upload.single('pdf'), async (req, res) => {
  try {
    console.log('[SmartForms] POST /templates - Starting upload...');
    
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      console.log('[SmartForms] User has no companyId:', req.userId);
      return res.status(400).json({ error: 'User not associated with a company' });
    }
    const companyId = user.companyId;
    const userId = user._id;
    console.log('[SmartForms] User found:', { userId: userId.toString(), companyId: companyId.toString() });
    
    if (!req.file) {
      console.log('[SmartForms] No file uploaded');
      return res.status(400).json({ error: 'PDF file required' });
    }
    console.log('[SmartForms] File received:', { name: req.file.originalname, size: req.file.size });
    
    const { name, description, category } = req.body;
    
    if (!name) {
      console.log('[SmartForms] No template name provided');
      return res.status(400).json({ error: 'Template name required' });
    }
    console.log('[SmartForms] Template metadata:', { name, description, category });
    
    // Load the PDF to get page dimensions and rotation
    console.log('[SmartForms] Loading PDF...');
    const pdfDoc = await PDFDocument.load(req.file.buffer);
    const pages = pdfDoc.getPages();
    const pageDimensions = pages.map((page, index) => {
      const rotation = page.getRotation().angle;
      return {
        page: index + 1,
        width: page.getWidth(),
        height: page.getHeight(),
        rotation, // Store page rotation for correct text placement
      };
    });
    console.log('[SmartForms] PDF loaded:', { pageCount: pages.length, pageDimensions });
    
    // Upload to R2
    const timestamp = Date.now();
    const safeName = name.replaceAll(/[^a-zA-Z0-9]/g, '_');
    const r2Key = `smartforms/templates/${companyId}/${safeName}_${timestamp}.pdf`;
    console.log('[SmartForms] Uploading to R2:', r2Key);
    
    await r2Storage.uploadBuffer(req.file.buffer, r2Key, 'application/pdf');
    console.log('[SmartForms] R2 upload complete');
    
    // Create the template record
    console.log('[SmartForms] Creating template record...');
    const template = new FormTemplate({
      companyId,
      name: sanitizeString(name),
      description: sanitizeString(description || ''),
      category: sanitizeString(category || 'other'),
      sourceFile: {
        r2Key,
        originalName: req.file.originalname,
        pageCount: pages.length,
        pageDimensions,
      },
      fields: [],
      status: 'draft',
      createdBy: userId,
      updatedBy: userId,
    });
    
    await template.save();
    console.log('[SmartForms] Template saved:', template._id.toString());
    
    res.status(201).json(template);
  } catch (error) {
    console.error('[SmartForms] Error creating template:', error.message);
    console.error('[SmartForms] Stack:', error.stack);
    res.status(500).json({ error: 'Failed to create template', details: error.message });
  }
});

/**
 * PUT /api/smartforms/templates/:id
 * Update template metadata
 */
router.put('/templates/:id', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }
    const templateId = sanitizeObjectId(req.params.id);
    const companyId = user.companyId;
    const userId = user._id;
    
    const template = await FormTemplate.findOne({ 
      _id: templateId, 
      companyId 
    });
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    const { name, description, category, status } = req.body;
    
    if (name) template.name = sanitizeString(name);
    if (description !== undefined) template.description = sanitizeString(description);
    if (category) template.category = sanitizeString(category);
    if (status) template.status = sanitizeString(status);
    
    template.updatedBy = userId;
    await template.save();
    
    res.json(template);
  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

/**
 * DELETE /api/smartforms/templates/:id
 * Delete a template
 */
router.delete('/templates/:id', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }
    const templateId = sanitizeObjectId(req.params.id);
    const companyId = user.companyId;
    
    const template = await FormTemplate.findOne({ 
      _id: templateId, 
      companyId 
    });
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    // Delete from R2
    if (template.sourceFile?.r2Key) {
      try {
        await r2Storage.deleteFile(template.sourceFile.r2Key);
      } catch (r2Error) {
        console.warn('Failed to delete template from R2:', r2Error);
      }
    }
    
    await template.deleteOne();
    
    res.json({ message: 'Template deleted' });
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// ============================================================================
// FIELD MANAGEMENT ROUTES
// ============================================================================

/**
 * PUT /api/smartforms/templates/:id/fields
 * Update all fields for a template (replace)
 */
router.put('/templates/:id/fields', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }
    const templateId = sanitizeObjectId(req.params.id);
    const companyId = user.companyId;
    const userId = user._id;
    
    const template = await FormTemplate.findOne({ 
      _id: templateId, 
      companyId 
    });
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    const { fields } = req.body;
    
    if (!Array.isArray(fields)) {
      return res.status(400).json({ error: 'Fields must be an array' });
    }
    
    template.fields = fields;
    template.updatedBy = userId;
    await template.save();
    
    res.json(template);
  } catch (error) {
    console.error('Error updating fields:', error);
    res.status(500).json({ error: 'Failed to update fields' });
  }
});

/**
 * PUT /api/smartforms/templates/:id/mappings
 * Update data mappings for a template
 */
router.put('/templates/:id/mappings', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }
    const templateId = sanitizeObjectId(req.params.id);
    const companyId = user.companyId;
    const userId = user._id;
    
    const template = await FormTemplate.findOne({ 
      _id: templateId, 
      companyId 
    });
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    const { mappings } = req.body;
    
    if (typeof mappings !== 'object') {
      return res.status(400).json({ error: 'Mappings must be an object' });
    }
    
    template.dataMappings = new Map(Object.entries(mappings));
    template.updatedBy = userId;
    await template.save();
    
    res.json(template);
  } catch (error) {
    console.error('Error updating mappings:', error);
    res.status(500).json({ error: 'Failed to update mappings' });
  }
});

// ============================================================================
// PDF FILL ROUTES
// ============================================================================

/**
 * GET /api/smartforms/templates/:id/pdf
 * Get the source PDF for rendering in the editor
 */
router.get('/templates/:id/pdf', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }
    const templateId = sanitizeObjectId(req.params.id);
    const companyId = user.companyId;
    
    const template = await FormTemplate.findOne({ 
      _id: templateId, 
      companyId 
    });
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    const pdfBytes = await loadPdfFromR2(template.sourceFile.r2Key);
    
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${template.name}.pdf"`,
    });
    res.send(pdfBytes);
  } catch (error) {
    console.error('Error getting template PDF:', error);
    res.status(500).json({ error: 'Failed to get template PDF' });
  }
});

/**
 * POST /api/smartforms/templates/:id/fill
 * Fill a template with job data and return the filled PDF
 */
router.post('/templates/:id/fill', async (req, res) => {
  // Memory guard: reject if heap is above 400MB to prevent OOM crashes
  const memBefore = process.memoryUsage();
  const heapUsedMB = Math.round(memBefore.heapUsed / 1024 / 1024);
  if (heapUsedMB > 400) {
    console.warn(`[SmartForms] Memory pressure: ${heapUsedMB}MB heap used, rejecting fill request`);
    return res.status(503).json({ error: 'Server busy, please try again in a moment' });
  }

  let pdfDoc = null;
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }
    const templateId = sanitizeObjectId(req.params.id);
    const companyId = user.companyId;
    
    const template = await FormTemplate.findOne({ 
      _id: templateId, 
      companyId,
      status: 'active'
    });
    
    if (!template) {
      return res.status(404).json({ error: 'Active template not found' });
    }
    
    const { jobId, customData } = req.body;
    
    // Build the data context
    const dataContext = await buildDataContext({ jobId, companyId, user, customData });
    
    // Debug: Log available data paths
    console.log('[SmartForms] Data context keys:', Object.keys(dataContext));
    if (dataContext.job) {
      console.log('[SmartForms] Job pmNumber:', dataContext.job.pmNumber);
    }
    if (dataContext.lme) {
      console.log('[SmartForms] LME labor count:', dataContext.lme.labor?.length);
    }
    
    // Load and fill the PDF
    let pdfBytes = await loadPdfFromR2(template.sourceFile.r2Key);
    pdfDoc = await PDFDocument.load(pdfBytes);
    pdfBytes = null; // Release source buffer immediately
    
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();
    
    // Fill each field
    console.log(`[SmartForms] Filling ${template.fields.length} fields...`);
    fillPdfFields({ template, dataContext, pages, font, debug: true });
    
    // Save the filled PDF and release the document
    const filledPdfBytes = await pdfDoc.save();
    pdfDoc = null; // Release pdf-lib document (largest in-memory object)
    
    // Record the fill
    await template.recordFill();
    
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${template.name}_filled.pdf"`,
    });
    res.send(Buffer.from(filledPdfBytes));
  } catch (error) {
    console.error('Error filling template:', error);
    res.status(500).json({ error: 'Failed to fill template' });
  } finally {
    // Ensure PDF document is released even on error
    pdfDoc = null;
    
    // Hint to GC if memory is elevated after PDF processing
    const memAfter = process.memoryUsage();
    const heapAfterMB = Math.round(memAfter.heapUsed / 1024 / 1024);
    if (heapAfterMB > 200 && global.gc) {
      global.gc();
      console.log(`[SmartForms] GC triggered after fill (${heapAfterMB}MB heap)`);
    }
  }
});

/**
 * POST /api/smartforms/templates/:id/batch-fill
 * Batch fill a template with multiple jobs
 */
router.post('/templates/:id/batch-fill', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }
    const templateId = sanitizeObjectId(req.params.id);
    const companyId = user.companyId;
    
    const template = await FormTemplate.findOne({ 
      _id: templateId, 
      companyId,
      status: 'active'
    });
    
    if (!template) {
      return res.status(404).json({ error: 'Active template not found' });
    }
    
    const { jobIds } = req.body;
    
    if (!Array.isArray(jobIds) || jobIds.length === 0) {
      return res.status(400).json({ error: 'Job IDs array required' });
    }
    
    if (jobIds.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 jobs per batch' });
    }
    
    // Load template PDF once
    const templateBytes = await loadPdfFromR2(template.sourceFile.r2Key);
    
    // Process each job
    const results = [];
    
    for (const jobId of jobIds) {
      try {
        // Build data context for this job
        const dataContext = await buildDataContext({ jobId, companyId, user });
        
        if (!dataContext.job) {
          results.push({ jobId, success: false, error: 'Job not found' });
          continue;
        }
        
        // Load fresh PDF for each job
        const pdfDoc = await PDFDocument.load(templateBytes);
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const pages = pdfDoc.getPages();
        
        // Fill fields using helper
        fillPdfFields({ template, dataContext, pages, font });
        
        // Save filled PDF to R2
        const filledPdfBytes = await pdfDoc.save();
        const jobNumber = dataContext.job.pmNumber || dataContext.job.woNumber || jobId;
        const filledR2Key = `smartforms/filled/${companyId}/${template.name}_${jobNumber}_${Date.now()}.pdf`;
        
        await r2Storage.uploadBuffer(Buffer.from(filledPdfBytes), filledR2Key, 'application/pdf');
        
        // Generate signed URL
        const signedUrl = await r2Storage.getSignedUrl(filledR2Key, 3600); // 1 hour
        
        results.push({
          jobId,
          jobNumber,
          success: true,
          r2Key: filledR2Key,
          downloadUrl: signedUrl,
        });
      } catch (jobError) {
        console.error(`Error processing job ${jobId}:`, jobError);
        results.push({ jobId, success: false, error: jobError.message });
      }
    }
    
    // Record fills
    const successCount = results.filter(r => r.success).length;
    if (successCount > 0) {
      template.fillCount += successCount;
      template.lastFilledAt = new Date();
      await template.save();
    }
    
    res.json({
      templateId,
      templateName: template.name,
      totalJobs: jobIds.length,
      successCount,
      failureCount: jobIds.length - successCount,
      results,
    });
  } catch (error) {
    console.error('Error batch filling template:', error);
    res.status(500).json({ error: 'Failed to batch fill template' });
  }
});

/**
 * GET /api/smartforms/templates/:id/debug
 * Debug endpoint to inspect template state
 */
router.get('/templates/:id/debug', async (req, res) => {
  try {
    const userId = req.userId;
    const user = await User.findById(userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    
    const template = await FormTemplate.findOne({
      _id: sanitizeObjectId(req.params.id),
      companyId: user.companyId,
    });
    
    if (!template) return res.status(404).json({ error: 'Template not found' });
    
    // Convert Map to object for inspection
    const mappingsObj = {};
    if (template.dataMappings) {
      for (const [key, value] of template.dataMappings.entries()) {
        mappingsObj[key] = value;
      }
    }
    
    res.json({
      templateId: template._id,
      name: template.name,
      status: template.status,
      fieldCount: template.fields?.length || 0,
      fields: template.fields?.map(f => ({
        id: f.id,
        name: f.name,
        type: f.type,
        page: f.page,
        bounds: f.bounds,
        hasMapping: !!mappingsObj[f.name],
        mappedTo: mappingsObj[f.name] || null,
      })),
      mappings: mappingsObj,
      pageDimensions: template.sourceFile?.pageDimensions,
    });
  } catch (error) {
    console.error('Error getting template debug info:', error);
    res.status(500).json({ error: 'Failed to get template debug info' });
  }
});

/**
 * GET /api/smartforms/data-paths
 * Get available data paths for mapping
 */
router.get('/data-paths', async (req, res) => {
  // Return available data paths that can be mapped to fields
  const dataPaths = [
    // === JOB FIELDS ===
    { path: 'job.pmNumber', label: 'PM Number', category: 'Job' },
    { path: 'job.woNumber', label: 'Work Order Number', category: 'Job' },
    { path: 'job.notificationNumber', label: 'Notification Number', category: 'Job' },
    { path: 'job.matCode', label: 'MAT Code', category: 'Job' },
    { path: 'job.title', label: 'Job Title', category: 'Job' },
    { path: 'job.description', label: 'Description of Work', category: 'Job' },
    { path: 'job.address', label: 'Job Address', category: 'Job' },
    { path: 'job.city', label: 'City', category: 'Job' },
    { path: 'job.state', label: 'State', category: 'Job' },
    { path: 'job.zip', label: 'ZIP Code', category: 'Job' },
    { path: 'job.status', label: 'Job Status', category: 'Job' },
    { path: 'job.startDate', label: 'Job Start Date', category: 'Job' },
    { path: 'job.dueDate', label: 'Due Date', category: 'Job' },
    { path: 'job.completedDate', label: 'Completed Date', category: 'Job' },
    { path: 'job.division', label: 'Division', category: 'Job' },
    { path: 'job.circuit', label: 'Circuit', category: 'Job' },
    { path: 'job.poNumber', label: 'PO Number', category: 'Job' },
    { path: 'job.cwaNumber', label: 'CWA Number', category: 'Job' },
    { path: 'job.fieldAuthNumber', label: 'Field Authorization #', category: 'Job' },
    { path: 'job.corNumber', label: 'COR Number', category: 'Job' },
    { path: 'job.lat', label: 'Latitude', category: 'Job' },
    { path: 'job.lng', label: 'Longitude', category: 'Job' },
    
    // === CREW & ASSIGNMENT ===
    { path: 'job.assignedToGF.name', label: 'Assigned GF Name', category: 'Crew' },
    { path: 'job.assignedTo.name', label: 'Assigned Foreman Name', category: 'Crew' },
    { path: 'job.crewScheduledDate', label: 'Crew Scheduled Date', category: 'Crew' },
    { path: 'job.crewScheduledEndDate', label: 'Crew End Date', category: 'Crew' },
    { path: 'job.crewSize', label: 'Crew Size', category: 'Crew' },
    { path: 'job.estimatedHours', label: 'Estimated Hours', category: 'Crew' },
    { path: 'job.assignmentNotes', label: 'Assignment Notes', category: 'Crew' },
    
    // === LME WORK DETAILS ===
    { path: 'lme.date', label: 'LME Date', category: 'LME' },
    { path: 'lme.lmeNumber', label: 'LME Number', category: 'LME' },
    { path: 'lme.startTime', label: 'Start Time', category: 'LME' },
    { path: 'lme.endTime', label: 'End Time', category: 'LME' },
    { path: 'lme.workDescription', label: 'Work Description', category: 'LME' },
    { path: 'lme.subcontractorName', label: 'Subcontractor Name(s)', category: 'LME' },
    { path: 'lme.sheetNumber', label: 'Sheet Number', category: 'LME' },
    { path: 'lme.totalSheets', label: 'Total Sheets', category: 'LME' },
    
    // === LME LABOR (Crew Members) ===
    { path: 'lme.labor[0].name', label: 'Worker 1 Name', category: 'Labor' },
    { path: 'lme.labor[0].craft', label: 'Worker 1 Craft', category: 'Labor' },
    { path: 'lme.labor[0].stHours', label: 'Worker 1 ST Hours', category: 'Labor' },
    { path: 'lme.labor[0].otHours', label: 'Worker 1 OT Hours', category: 'Labor' },
    { path: 'lme.labor[0].dtHours', label: 'Worker 1 DT Hours', category: 'Labor' },
    { path: 'lme.labor[0].rate', label: 'Worker 1 Rate', category: 'Labor' },
    { path: 'lme.labor[0].missedMeals', label: 'Worker 1 Missed Meals', category: 'Labor' },
    { path: 'lme.labor[0].subsistence', label: 'Worker 1 Per Diem/Sub', category: 'Labor' },
    { path: 'lme.labor[0].totalAmount', label: 'Worker 1 Total', category: 'Labor' },
    
    { path: 'lme.labor[1].name', label: 'Worker 2 Name', category: 'Labor' },
    { path: 'lme.labor[1].craft', label: 'Worker 2 Craft', category: 'Labor' },
    { path: 'lme.labor[1].stHours', label: 'Worker 2 ST Hours', category: 'Labor' },
    { path: 'lme.labor[1].otHours', label: 'Worker 2 OT Hours', category: 'Labor' },
    { path: 'lme.labor[1].dtHours', label: 'Worker 2 DT Hours', category: 'Labor' },
    { path: 'lme.labor[1].rate', label: 'Worker 2 Rate', category: 'Labor' },
    { path: 'lme.labor[1].missedMeals', label: 'Worker 2 Missed Meals', category: 'Labor' },
    { path: 'lme.labor[1].subsistence', label: 'Worker 2 Per Diem/Sub', category: 'Labor' },
    { path: 'lme.labor[1].totalAmount', label: 'Worker 2 Total', category: 'Labor' },
    
    { path: 'lme.labor[2].name', label: 'Worker 3 Name', category: 'Labor' },
    { path: 'lme.labor[2].craft', label: 'Worker 3 Craft', category: 'Labor' },
    { path: 'lme.labor[2].stHours', label: 'Worker 3 ST Hours', category: 'Labor' },
    { path: 'lme.labor[2].otHours', label: 'Worker 3 OT Hours', category: 'Labor' },
    { path: 'lme.labor[2].dtHours', label: 'Worker 3 DT Hours', category: 'Labor' },
    { path: 'lme.labor[2].rate', label: 'Worker 3 Rate', category: 'Labor' },
    { path: 'lme.labor[2].missedMeals', label: 'Worker 3 Missed Meals', category: 'Labor' },
    { path: 'lme.labor[2].subsistence', label: 'Worker 3 Per Diem/Sub', category: 'Labor' },
    { path: 'lme.labor[2].totalAmount', label: 'Worker 3 Total', category: 'Labor' },
    
    { path: 'lme.labor[3].name', label: 'Worker 4 Name', category: 'Labor' },
    { path: 'lme.labor[3].craft', label: 'Worker 4 Craft', category: 'Labor' },
    { path: 'lme.labor[3].stHours', label: 'Worker 4 ST Hours', category: 'Labor' },
    { path: 'lme.labor[3].otHours', label: 'Worker 4 OT Hours', category: 'Labor' },
    { path: 'lme.labor[3].dtHours', label: 'Worker 4 DT Hours', category: 'Labor' },
    { path: 'lme.labor[3].rate', label: 'Worker 4 Rate', category: 'Labor' },
    { path: 'lme.labor[3].missedMeals', label: 'Worker 4 Missed Meals', category: 'Labor' },
    { path: 'lme.labor[3].subsistence', label: 'Worker 4 Per Diem/Sub', category: 'Labor' },
    { path: 'lme.labor[3].totalAmount', label: 'Worker 4 Total', category: 'Labor' },
    
    { path: 'lme.labor[4].name', label: 'Worker 5 Name', category: 'Labor' },
    { path: 'lme.labor[4].craft', label: 'Worker 5 Craft', category: 'Labor' },
    { path: 'lme.labor[4].stHours', label: 'Worker 5 ST Hours', category: 'Labor' },
    { path: 'lme.labor[4].otHours', label: 'Worker 5 OT Hours', category: 'Labor' },
    { path: 'lme.labor[4].dtHours', label: 'Worker 5 DT Hours', category: 'Labor' },
    { path: 'lme.labor[4].rate', label: 'Worker 5 Rate', category: 'Labor' },
    { path: 'lme.labor[4].missedMeals', label: 'Worker 5 Missed Meals', category: 'Labor' },
    { path: 'lme.labor[4].subsistence', label: 'Worker 5 Per Diem/Sub', category: 'Labor' },
    { path: 'lme.labor[4].totalAmount', label: 'Worker 5 Total', category: 'Labor' },
    
    { path: 'lme.labor[5].name', label: 'Worker 6 Name', category: 'Labor' },
    { path: 'lme.labor[5].craft', label: 'Worker 6 Craft', category: 'Labor' },
    { path: 'lme.labor[5].stHours', label: 'Worker 6 ST Hours', category: 'Labor' },
    { path: 'lme.labor[5].otHours', label: 'Worker 6 OT Hours', category: 'Labor' },
    { path: 'lme.labor[5].dtHours', label: 'Worker 6 DT Hours', category: 'Labor' },
    { path: 'lme.labor[5].rate', label: 'Worker 6 Rate', category: 'Labor' },
    { path: 'lme.labor[5].missedMeals', label: 'Worker 6 Missed Meals', category: 'Labor' },
    { path: 'lme.labor[5].subsistence', label: 'Worker 6 Per Diem/Sub', category: 'Labor' },
    { path: 'lme.labor[5].totalAmount', label: 'Worker 6 Total', category: 'Labor' },
    
    // === LME EQUIPMENT ===
    { path: 'lme.equipment[0].type', label: 'Equipment 1 Type', category: 'Equipment' },
    { path: 'lme.equipment[0].unitNumber', label: 'Equipment 1 Unit #', category: 'Equipment' },
    { path: 'lme.equipment[0].hours', label: 'Equipment 1 Hours', category: 'Equipment' },
    { path: 'lme.equipment[0].rate', label: 'Equipment 1 Rate', category: 'Equipment' },
    { path: 'lme.equipment[0].amount', label: 'Equipment 1 Amount', category: 'Equipment' },
    
    { path: 'lme.equipment[1].type', label: 'Equipment 2 Type', category: 'Equipment' },
    { path: 'lme.equipment[1].unitNumber', label: 'Equipment 2 Unit #', category: 'Equipment' },
    { path: 'lme.equipment[1].hours', label: 'Equipment 2 Hours', category: 'Equipment' },
    { path: 'lme.equipment[1].rate', label: 'Equipment 2 Rate', category: 'Equipment' },
    { path: 'lme.equipment[1].amount', label: 'Equipment 2 Amount', category: 'Equipment' },
    
    { path: 'lme.equipment[2].type', label: 'Equipment 3 Type', category: 'Equipment' },
    { path: 'lme.equipment[2].unitNumber', label: 'Equipment 3 Unit #', category: 'Equipment' },
    { path: 'lme.equipment[2].hours', label: 'Equipment 3 Hours', category: 'Equipment' },
    { path: 'lme.equipment[2].rate', label: 'Equipment 3 Rate', category: 'Equipment' },
    { path: 'lme.equipment[2].amount', label: 'Equipment 3 Amount', category: 'Equipment' },
    
    { path: 'lme.equipment[3].type', label: 'Equipment 4 Type', category: 'Equipment' },
    { path: 'lme.equipment[3].unitNumber', label: 'Equipment 4 Unit #', category: 'Equipment' },
    { path: 'lme.equipment[3].hours', label: 'Equipment 4 Hours', category: 'Equipment' },
    { path: 'lme.equipment[3].rate', label: 'Equipment 4 Rate', category: 'Equipment' },
    { path: 'lme.equipment[3].amount', label: 'Equipment 4 Amount', category: 'Equipment' },
    
    // === LME MATERIALS ===
    { path: 'lme.materials[0].description', label: 'Material 1 Description', category: 'Materials' },
    { path: 'lme.materials[0].quantity', label: 'Material 1 Qty', category: 'Materials' },
    { path: 'lme.materials[0].unit', label: 'Material 1 Unit', category: 'Materials' },
    { path: 'lme.materials[0].unitCost', label: 'Material 1 Unit Cost', category: 'Materials' },
    { path: 'lme.materials[0].amount', label: 'Material 1 Amount', category: 'Materials' },
    
    { path: 'lme.materials[1].description', label: 'Material 2 Description', category: 'Materials' },
    { path: 'lme.materials[1].quantity', label: 'Material 2 Qty', category: 'Materials' },
    { path: 'lme.materials[1].unit', label: 'Material 2 Unit', category: 'Materials' },
    { path: 'lme.materials[1].unitCost', label: 'Material 2 Unit Cost', category: 'Materials' },
    { path: 'lme.materials[1].amount', label: 'Material 2 Amount', category: 'Materials' },
    
    // === LME TOTALS ===
    { path: 'lme.totals.labor', label: 'Total Labor Amount', category: 'Totals' },
    { path: 'lme.totals.material', label: 'Total Material Amount', category: 'Totals' },
    { path: 'lme.totals.equipment', label: 'Total Equipment Amount', category: 'Totals' },
    { path: 'lme.totals.grand', label: 'Grand Total', category: 'Totals' },
    { path: 'lme.missedMeals', label: 'Total Missed Meals', category: 'Totals' },
    { path: 'lme.subsistanceCount', label: 'Total Per Diem/Subsistence', category: 'Totals' },
    
    // === PG&E UNIT PRICE / PROJECT COMPLETION (Exhibit B) ===
    { path: 'job.division', label: 'Division Code', category: 'Exhibit B' },
    { path: 'job.ecTag.tagType', label: 'Tag Type (A/B/C/D/E)', category: 'Exhibit B' },
    { path: 'job.preFieldLabels.roadAccess', label: 'Accessibility', category: 'Exhibit B' },
    { path: 'job.preFieldLabels.constructionType', label: 'Construction Type (OH/UG)', category: 'Exhibit B' },
    { path: 'job.preFieldLabels.craneRequired', label: 'Crane Required', category: 'Exhibit B' },
    { path: 'job.preFieldLabels.craneType', label: 'Crane Type', category: 'Exhibit B' },
    { path: 'job.ecTag.programType', label: 'Program Type', category: 'Exhibit B' },
    { path: 'job.ecTag.programCode', label: 'Program Code', category: 'Exhibit B' },
    { path: 'job.preFieldLabels.specialEquipment', label: 'Special Equipment List', category: 'Exhibit B' },
    { path: 'job.preFieldLabels.poleWork', label: 'Pole Work Type', category: 'Exhibit B' },
    { path: 'job.preFieldLabels.accessNotes', label: 'Access Notes', category: 'Exhibit B' },
    
    // === PROJECT COMPLETION FORM FIELDS ===
    { path: 'job.poNumber', label: 'PO Number', category: 'Project Completion' },
    { path: 'job.completedDate', label: 'Completed Date', category: 'Project Completion' },
    { path: 'job.completedBy.name', label: 'Completed By Name', category: 'Project Completion' },
    { path: 'job.status', label: 'Job Status', category: 'Project Completion' },
    { path: 'job.jobScope.summary', label: 'Scope Summary', category: 'Project Completion' },
    { path: 'job.jobScope.workType', label: 'Work Type', category: 'Project Completion' },
    { path: 'job.jobScope.footage', label: 'Footage/Length', category: 'Project Completion' },
    { path: 'job.jobScope.voltage', label: 'Voltage', category: 'Project Completion' },
    { path: 'job.jobScope.phases', label: 'Phases', category: 'Project Completion' },
    { path: 'job.jobScope.specialNotes', label: 'Special Notes', category: 'Project Completion' },
    
    // === SIGNATURE FIELDS ===
    { path: 'job.assignedToGF.name', label: 'GF Name (Contractor Rep)', category: 'Signatures' },
    { path: 'user.name', label: 'Current User Name', category: 'Signatures' },
    { path: 'company.name', label: 'Contractor Company Name', category: 'Signatures' },
    
    // === UNIT SUMMARY (Aggregated from UnitEntry) ===
    { path: 'units.totalCount', label: 'Total Unit Count', category: 'Units' },
    { path: 'units.totalAmount', label: 'Total Unit Amount', category: 'Units' },
    { path: 'units.categories', label: 'Unit Categories (comma-sep)', category: 'Units' },
    { path: 'units.itemCodes', label: 'Unit Item Codes (comma-sep)', category: 'Units' },
    
    // === CREW SUMMARY (calculated) ===
    { path: 'crew.headcount', label: 'Crew Headcount', category: 'Crew Summary' },
    { path: 'crew.totalSTHours', label: 'Total ST Hours (all crew)', category: 'Crew Summary' },
    { path: 'crew.totalOTHours', label: 'Total OT Hours (all crew)', category: 'Crew Summary' },
    { path: 'crew.totalDTHours', label: 'Total DT Hours (all crew)', category: 'Crew Summary' },
    { path: 'crew.stHeadcount', label: 'ST Crew Headcount', category: 'Crew Summary' },
    { path: 'crew.otHeadcount', label: 'OT/PT Crew Headcount', category: 'Crew Summary' },
    
    // === COMPANY FIELDS ===
    { path: 'company.name', label: 'Company Name', category: 'Company' },
    { path: 'company.contractorLicense', label: 'Contractor License', category: 'Company' },
    { path: 'company.phone', label: 'Company Phone', category: 'Company' },
    { path: 'company.email', label: 'Company Email', category: 'Company' },
    { path: 'company.address', label: 'Company Address', category: 'Company' },
    
    // === USER FIELDS ===
    { path: 'user.name', label: 'Current User Name', category: 'User' },
    { path: 'user.email', label: 'Current User Email', category: 'User' },
    { path: 'user.role', label: 'Current User Role', category: 'User' },
    
    // === DATE/TIME FIELDS ===
    { path: 'today', label: 'Today\'s Date', category: 'Date/Time' },
    { path: 'now', label: 'Current Date & Time', category: 'Date/Time' },
    { path: 'currentYear', label: 'Current Year', category: 'Date/Time' },
    { path: 'currentMonth', label: 'Current Month', category: 'Date/Time' },
  ];
  
  res.json(dataPaths);
});

module.exports = router;


