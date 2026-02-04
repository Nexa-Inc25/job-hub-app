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
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
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
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255,
  };
}

/**
 * Resolve a data path against a data object
 * e.g., "job.address" -> data.job.address
 */
function resolveDataPath(obj, path) {
  if (!path || !obj) return '';
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return '';
    current = current[part];
  }
  return current ?? '';
}

/**
 * Format a date value according to format string
 */
function formatDate(value, format = 'MM/DD/YYYY') {
  if (!value) return '';
  const date = new Date(value);
  if (isNaN(date.getTime())) return String(value);
  
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
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }
    const companyId = user.companyId;
    const userId = user._id;
    
    if (!req.file) {
      return res.status(400).json({ error: 'PDF file required' });
    }
    
    const { name, description, category } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Template name required' });
    }
    
    // Load the PDF to get page dimensions
    const pdfDoc = await PDFDocument.load(req.file.buffer);
    const pages = pdfDoc.getPages();
    const pageDimensions = pages.map((page, index) => ({
      page: index + 1,
      width: page.getWidth(),
      height: page.getHeight(),
    }));
    
    // Upload to R2
    const timestamp = Date.now();
    const safeName = name.replace(/[^a-zA-Z0-9]/g, '_');
    const r2Key = `smartforms/templates/${companyId}/${safeName}_${timestamp}.pdf`;
    
    await r2Storage.uploadFile(r2Key, req.file.buffer, 'application/pdf');
    
    // Create the template record
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
    
    res.status(201).json(template);
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).json({ error: 'Failed to create template' });
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
    let dataContext = { ...customData };
    
    if (jobId) {
      const job = await Job.findOne({ 
        _id: sanitizeObjectId(jobId), 
        companyId 
      }).populate('createdBy', 'name email');
      
      if (job) {
        dataContext.job = job.toObject();
      }
    }
    
    // Get company info
    const company = await Company.findById(companyId);
    if (company) {
      dataContext.company = company.toObject();
    }
    
    // Add current date/time
    dataContext.today = new Date();
    dataContext.user = { name: user.name, email: user.email };
    
    // Load and fill the PDF
    const pdfBytes = await loadPdfFromR2(template.sourceFile.r2Key);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();
    
    // Fill each field
    for (const field of template.fields) {
      const pageIndex = field.page - 1;
      if (pageIndex < 0 || pageIndex >= pages.length) continue;
      
      const page = pages[pageIndex];
      const mapping = template.dataMappings.get(field.name);
      
      let value = '';
      if (mapping) {
        value = resolveDataPath(dataContext, mapping);
      } else if (field.defaultValue) {
        value = field.defaultValue;
      }
      
      // Format dates
      if (field.type === 'date' && value) {
        value = formatDate(value, field.dateFormat);
      }
      
      // Handle checkboxes
      if (field.type === 'checkbox') {
        if (value === true || value === 'true' || value === '1' || value === 'yes') {
          value = '✓';
        } else {
          value = '';
        }
      }
      
      if (!value) continue;
      
      // Draw the text
      const color = hexToRgb(field.fontColor || '#000000');
      const fontSize = field.fontSize || 10;
      
      page.drawText(String(value), {
        x: field.bounds.x,
        y: field.bounds.y,
        size: fontSize,
        font,
        color: rgb(color.r, color.g, color.b),
      });
    }
    
    // Save the filled PDF
    const filledPdfBytes = await pdfDoc.save();
    
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
    
    // Get company info once
    const company = await Company.findById(companyId);
    
    // Load template PDF once
    const templateBytes = await loadPdfFromR2(template.sourceFile.r2Key);
    
    // Process each job
    const results = [];
    
    for (const jobId of jobIds) {
      try {
        const job = await Job.findOne({ 
          _id: sanitizeObjectId(jobId), 
          companyId 
        }).populate('createdBy', 'name email');
        
        if (!job) {
          results.push({ jobId, success: false, error: 'Job not found' });
          continue;
        }
        
        // Build data context
        const dataContext = {
          job: job.toObject(),
          company: company?.toObject(),
          today: new Date(),
          user: { name: user.name, email: user.email },
        };
        
        // Load fresh PDF for each job
        const pdfDoc = await PDFDocument.load(templateBytes);
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const pages = pdfDoc.getPages();
        
        // Fill fields
        for (const field of template.fields) {
          const pageIndex = field.page - 1;
          if (pageIndex < 0 || pageIndex >= pages.length) continue;
          
          const page = pages[pageIndex];
          const mapping = template.dataMappings.get(field.name);
          
          let value = '';
          if (mapping) {
            value = resolveDataPath(dataContext, mapping);
          } else if (field.defaultValue) {
            value = field.defaultValue;
          }
          
          if (field.type === 'date' && value) {
            value = formatDate(value, field.dateFormat);
          }
          
          if (field.type === 'checkbox') {
            value = (value === true || value === 'true' || value === '1' || value === 'yes') ? '✓' : '';
          }
          
          if (!value) continue;
          
          const color = hexToRgb(field.fontColor || '#000000');
          page.drawText(String(value), {
            x: field.bounds.x,
            y: field.bounds.y,
            size: field.fontSize || 10,
            font,
            color: rgb(color.r, color.g, color.b),
          });
        }
        
        // Save filled PDF to R2
        const filledPdfBytes = await pdfDoc.save();
        const jobNumber = job.pm || job.wo || job._id.toString();
        const filledR2Key = `smartforms/filled/${companyId}/${template.name}_${jobNumber}_${Date.now()}.pdf`;
        
        await r2Storage.uploadFile(filledR2Key, Buffer.from(filledPdfBytes), 'application/pdf');
        
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
 * GET /api/smartforms/data-paths
 * Get available data paths for mapping
 */
router.get('/data-paths', async (req, res) => {
  // Return available data paths that can be mapped to fields
  const dataPaths = [
    // Job fields
    { path: 'job.pm', label: 'PM Number', category: 'Job' },
    { path: 'job.wo', label: 'Work Order', category: 'Job' },
    { path: 'job.title', label: 'Job Title', category: 'Job' },
    { path: 'job.description', label: 'Job Description', category: 'Job' },
    { path: 'job.address', label: 'Address', category: 'Job' },
    { path: 'job.city', label: 'City', category: 'Job' },
    { path: 'job.state', label: 'State', category: 'Job' },
    { path: 'job.zip', label: 'ZIP Code', category: 'Job' },
    { path: 'job.status', label: 'Job Status', category: 'Job' },
    { path: 'job.startDate', label: 'Start Date', category: 'Job' },
    { path: 'job.dueDate', label: 'Due Date', category: 'Job' },
    { path: 'job.completedDate', label: 'Completed Date', category: 'Job' },
    { path: 'job.division', label: 'Division', category: 'Job' },
    { path: 'job.circuit', label: 'Circuit', category: 'Job' },
    { path: 'job.lat', label: 'Latitude', category: 'Job' },
    { path: 'job.lng', label: 'Longitude', category: 'Job' },
    
    // Company fields
    { path: 'company.name', label: 'Company Name', category: 'Company' },
    { path: 'company.contractorLicense', label: 'Contractor License', category: 'Company' },
    { path: 'company.phone', label: 'Company Phone', category: 'Company' },
    { path: 'company.email', label: 'Company Email', category: 'Company' },
    { path: 'company.address', label: 'Company Address', category: 'Company' },
    
    // User fields
    { path: 'user.name', label: 'Current User Name', category: 'User' },
    { path: 'user.email', label: 'Current User Email', category: 'User' },
    
    // Date fields
    { path: 'today', label: 'Today\'s Date', category: 'System' },
  ];
  
  res.json(dataPaths);
});

module.exports = router;


