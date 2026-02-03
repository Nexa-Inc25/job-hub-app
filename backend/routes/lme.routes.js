/**
 * LME Routes - Daily Statement of Labor, Material, and Equipment
 * 
 * PG&E official contractor timesheet format API endpoints.
 * 
 * KEY FEATURE: Uses the actual PG&E LME template from R2 storage
 * and fills it with data, producing an identical document to the
 * utility-provided form.
 */

const express = require('express');
const router = express.Router();
const LME = require('../models/LME');
const Job = require('../models/Job');
const User = require('../models/User');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { sanitizeObjectId, sanitizeString, sanitizeDate } = require('../utils/sanitize');
const r2Storage = require('../utils/storage');

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
 * POST /api/lme
 * Create or update an LME
 */
router.post('/', authenticateUser, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) return res.status(403).json({ error: 'Unauthorized' });

    const { jobId, lmeNumber, date, ...lmeData } = req.body;

    // Sanitize inputs to prevent NoSQL injection
    const safeJobId = sanitizeObjectId(jobId);
    const safeLmeNumber = sanitizeString(lmeNumber);
    const safeDate = sanitizeDate(date);
    
    if (!safeJobId) {
      return res.status(400).json({ error: 'Valid jobId is required' });
    }

    // Verify job belongs to company
    const job = await Job.findOne({ _id: safeJobId, companyId: user.companyId });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    // Upsert LME (update if same lmeNumber exists)
    const lme = await LME.findOneAndUpdate(
      { lmeNumber: safeLmeNumber, companyId: user.companyId },
      {
        $set: {
          ...lmeData,
          jobId: safeJobId,
          date: safeDate || new Date(),
          submittedBy: user._id,
          submittedAt: new Date(),
          status: 'submitted',
        },
        $setOnInsert: {
          lmeNumber: safeLmeNumber,
          companyId: user.companyId,
        },
      },
      { upsert: true, new: true }
    );

    // Save LME reference to Close Out Documents
    try {
      const aciFolder = job.folders?.find(f => f.name === 'ACI');
      if (aciFolder) {
        if (!aciFolder.subfolders) aciFolder.subfolders = [];
        let closeOutFolder = aciFolder.subfolders.find(sf => sf.name === 'Close Out Documents');
        if (!closeOutFolder) {
          closeOutFolder = { name: 'Close Out Documents', documents: [], subfolders: [] };
          aciFolder.subfolders.push(closeOutFolder);
        }
        if (!closeOutFolder.documents) closeOutFolder.documents = [];

        const dateStr = new Date(date).toISOString().split('T')[0];
        const lmeFilename = `${job.pmNumber || job.woNumber}_LME_${dateStr}.pdf`;

        // Remove old version if exists
        const existingIdx = closeOutFolder.documents.findIndex(d =>
          d.name?.includes('LME') && d.name?.includes(dateStr)
        );
        if (existingIdx !== -1) {
          closeOutFolder.documents.splice(existingIdx, 1);
        }

        // Add LME reference
        closeOutFolder.documents.push({
          name: lmeFilename,
          type: 'lme',
          lmeId: lme._id,
          date: new Date(date),
          totals: lmeData.totals,
          uploadDate: new Date(),
          isCompleted: true,
          exportUrls: {
            pdf: `/api/lme/${lme._id}/pdf`,
            oracle: `/api/lme/${lme._id}/export?format=oracle`,
            sap: `/api/lme/${lme._id}/export?format=sap`,
          }
        });

        await job.save();
        console.log(`LME saved to Close Out Documents: ${lmeFilename}`);
      }
    } catch (error_) {
      console.warn('Failed to save LME to Close Out folder:', error_.message);
    }

    res.json(lme);
  } catch (err) {
    console.error('Save LME error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/lme
 * List LMEs for a job or date range
 */
router.get('/', authenticateUser, async (req, res) => {
  try {
    const { jobId, startDate, endDate } = req.query;
    const user = await User.findById(req.userId);
    if (!user?.companyId) return res.status(403).json({ error: 'Unauthorized' });

    const query = { companyId: user.companyId };
    
    const safeJobId = sanitizeObjectId(jobId);
    if (safeJobId) query.jobId = safeJobId;
    if (startDate && endDate) {
      const safeStartDate = sanitizeDate(startDate);
      const safeEndDate = sanitizeDate(endDate);
      if (safeStartDate && safeEndDate) {
        query.date = { $gte: safeStartDate, $lte: safeEndDate };
      }
    }

    const lmes = await LME.find(query)
      .populate('jobId', 'woNumber pmNumber address')
      .sort({ date: -1 });

    res.json(lmes);
  } catch (err) {
    console.error('Get LMEs error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/lme/:id
 * Get single LME
 */
router.get('/:id', authenticateUser, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) return res.status(403).json({ error: 'Unauthorized' });

    const lmeId = sanitizeObjectId(req.params.id);
    if (!lmeId) return res.status(400).json({ error: 'Invalid LME ID' });

    const lme = await LME.findOne({ _id: lmeId, companyId: user.companyId })
      .populate('jobId');

    if (!lme) return res.status(404).json({ error: 'LME not found' });
    res.json(lme);
  } catch (err) {
    console.error('Get LME error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/lme/:id/pdf
 * Generate PDF of LME using the actual PG&E template
 * 
 * This fetches the official LME template from R2 storage and fills it
 * with the data, producing an identical document to what PG&E expects.
 */
router.get('/:id/pdf', authenticateUser, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const lmeId = sanitizeObjectId(req.params.id);
    if (!lmeId) return res.status(400).json({ error: 'Invalid LME ID' });

    const lme = await LME.findOne({ _id: lmeId, companyId: user?.companyId });
    if (!lme) return res.status(404).json({ error: 'LME not found' });

    // Try to load the official LME template from R2
    let pdfDoc;
    let usedTemplate = false;
    
    try {
      // Look for LME template in R2 (templates/master/LME*.pdf)
      const templates = await r2Storage.listFiles('templates/master/');
      const lmeTemplate = templates.find(t => 
        t.Key?.toLowerCase().includes('lme') && t.Key?.toLowerCase().endsWith('.pdf')
      );
      
      if (lmeTemplate && r2Storage.isR2Configured()) {
        console.log(`Loading LME template from R2: ${lmeTemplate.Key}`);
        const templateStream = await r2Storage.getFileStream(lmeTemplate.Key);
        
        if (templateStream?.stream) {
          // Convert stream to buffer
          const chunks = [];
          for await (const chunk of templateStream.stream) {
            chunks.push(chunk);
          }
          const templateBytes = Buffer.concat(chunks);
          
          // Load the template PDF
          pdfDoc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
          usedTemplate = true;
          console.log('Successfully loaded LME template from R2');
        }
      }
    } catch (templateError) {
      console.warn('Could not load LME template from R2:', templateError.message);
    }

    // If no template found, create from scratch (fallback)
    if (!pdfDoc) {
      console.log('No LME template found, generating from scratch');
      pdfDoc = await PDFDocument.create();
      pdfDoc.addPage([612, 792]); // Letter size
    }

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const pages = pdfDoc.getPages();
    const page = pages[0];
    const { height } = page.getSize();

    // Try to fill form fields if it's a fillable PDF
    let filledFormFields = false;
    try {
      const form = pdfDoc.getForm();
      const fields = form.getFields();
      
      if (fields.length > 0) {
        console.log(`Found ${fields.length} form fields in LME template`);
        
        // Map our data to common field names
        const fieldMappings = {
          // Header fields (try multiple common naming patterns)
          'lme_number': lme.lmeNumber,
          'lmeNumber': lme.lmeNumber,
          'LME_NO': lme.lmeNumber,
          'date': lme.date?.toLocaleDateString() || '',
          'DATE': lme.date?.toLocaleDateString() || '',
          'start_time': lme.startTime || '',
          'START_TIME': lme.startTime || '',
          'end_time': lme.endTime || '',
          'END_TIME': lme.endTime || '',
          'sheet': lme.sheetNumber || '1',
          'SHEET': lme.sheetNumber || '1',
          'of_sheets': lme.totalSheets || '1',
          'OF_SHEETS': lme.totalSheets || '1',
          
          // Job info
          'pm_number': lme.jobInfo?.pmNumber || '',
          'PM_NO': lme.jobInfo?.pmNumber || '',
          'wo_number': lme.jobInfo?.woNumber || '',
          'JOB_NO': lme.jobInfo?.woNumber || '',
          'po_number': lme.jobInfo?.poNumber || '',
          'PO_NO': lme.jobInfo?.poNumber || '',
          'address': lme.jobInfo?.address || '',
          'JOB_LOCATION': lme.jobInfo?.address || '',
          'field_auth': lme.jobInfo?.fieldAuthNumber || '',
          'cor_number': lme.jobInfo?.corNumber || '',
          
          // Work description
          'work_description': lme.workDescription || '',
          'DESCRIPTION': lme.workDescription || '',
          'subcontractor': lme.subcontractorName || '',
          'SUBCONTRACTOR': lme.subcontractorName || '',
          
          // Totals
          'labor_total': `$${(lme.totals?.labor || 0).toFixed(2)}`,
          'LABOR_TOTAL': `$${(lme.totals?.labor || 0).toFixed(2)}`,
          'material_total': `$${(lme.totals?.material || 0).toFixed(2)}`,
          'MATERIAL_TOTAL': `$${(lme.totals?.material || 0).toFixed(2)}`,
          'equipment_total': `$${(lme.totals?.equipment || 0).toFixed(2)}`,
          'EQUIPMENT_TOTAL': `$${(lme.totals?.equipment || 0).toFixed(2)}`,
          'grand_total': `$${(lme.totals?.grand || 0).toFixed(2)}`,
          'GRAND_TOTAL': `$${(lme.totals?.grand || 0).toFixed(2)}`,
          
          // Contractor info
          'contractor_name': 'ALVAH CONTRACTORS',
          'CONTRACTOR': 'ALVAH CONTRACTORS',
        };
        
        // Fill each field that matches our mappings
        for (const field of fields) {
          const fieldName = field.getName();
          const value = fieldMappings[fieldName] || fieldMappings[fieldName.toLowerCase()];
          
          if (value !== undefined) {
            try {
              const textField = form.getTextField(fieldName);
              textField.setText(String(value));
              filledFormFields = true;
            } catch {
              // Not a text field or couldn't fill
            }
          }
        }
        
        // Fill labor rows (try common patterns like CRAFT_1, NAME_1, etc.)
        for (let i = 0; i < (lme.labor || []).length && i < 10; i++) {
          const labor = lme.labor[i];
          const row = i + 1;
          
          const laborMappings = {
            [`CRAFT_${row}`]: labor.craft,
            [`NAME_${row}`]: labor.name,
            [`ST_${row}`]: labor.stHours,
            [`OT_${row}`]: labor.otHours,
            [`DT_${row}`]: labor.dtHours,
            [`RATE_${row}`]: labor.rate,
            [`AMOUNT_${row}`]: labor.totalAmount?.toFixed(2),
          };
          
          for (const [fieldName, value] of Object.entries(laborMappings)) {
            if (value !== undefined && value !== null) {
              try {
                const textField = form.getTextField(fieldName);
                textField.setText(String(value));
                filledFormFields = true;
              } catch {
                // Field doesn't exist
              }
            }
          }
        }
        
        // Flatten form fields so they appear as regular text
        form.flatten();
        console.log('Filled and flattened form fields');
      }
    } catch (formError) {
      console.log('Template is not a fillable PDF, using text overlay:', formError.message);
    }

    // If we couldn't fill form fields, overlay text directly
    if (!filledFormFields) {
      // Text overlay coordinates for standard PG&E LME layout
      // These are calibrated for the typical LME form layout
      const jobInfo = lme.jobInfo || {};
      
      // Only add text overlay if using template (not from scratch)
      if (usedTemplate) {
        // Header area - typically top right
        page.drawText(lme.lmeNumber || '', { x: 500, y: height - 60, size: 9, font });
        page.drawText(lme.date?.toLocaleDateString() || '', { x: 500, y: height - 75, size: 9, font });
        page.drawText(`${lme.startTime || ''} - ${lme.endTime || ''}`, { x: 500, y: height - 90, size: 9, font });
        
        // Job info area - typically left side
        page.drawText(jobInfo.pmNumber || '', { x: 120, y: height - 120, size: 9, font });
        page.drawText(jobInfo.woNumber || '', { x: 120, y: height - 135, size: 9, font });
        page.drawText(jobInfo.poNumber || '', { x: 120, y: height - 150, size: 9, font });
        page.drawText(jobInfo.address || '', { x: 120, y: height - 165, size: 9, font });
        
        // Work description
        const workDesc = (lme.workDescription || '').substring(0, 80);
        page.drawText(workDesc, { x: 60, y: height - 200, size: 8, font });
        
        // Labor entries - starting around y = height - 280
        let laborY = height - 280;
        for (const labor of (lme.labor || []).slice(0, 8)) {
          page.drawText(labor.craft || '', { x: 45, y: laborY, size: 8, font });
          page.drawText((labor.name || '').substring(0, 18), { x: 85, y: laborY, size: 8, font });
          page.drawText(String(labor.stHours || ''), { x: 220, y: laborY, size: 8, font });
          page.drawText(String(labor.otHours || ''), { x: 270, y: laborY, size: 8, font });
          page.drawText(String(labor.dtHours || ''), { x: 320, y: laborY, size: 8, font });
          page.drawText(`${(labor.rate || 0).toFixed(2)}`, { x: 370, y: laborY, size: 8, font });
          page.drawText(`${(labor.totalAmount || 0).toFixed(2)}`, { x: 450, y: laborY, size: 8, font });
          laborY -= 24; // 3 rows per labor entry in standard LME
        }
        
        // Totals - typically bottom of form
        page.drawText(`${(lme.totals?.labor || 0).toFixed(2)}`, { x: 480, y: 180, size: 9, font: boldFont });
        page.drawText(`${(lme.totals?.material || 0).toFixed(2)}`, { x: 480, y: 140, size: 9, font: boldFont });
        page.drawText(`${(lme.totals?.equipment || 0).toFixed(2)}`, { x: 480, y: 100, size: 9, font: boldFont });
        page.drawText(`${(lme.totals?.grand || 0).toFixed(2)}`, { x: 480, y: 60, size: 10, font: boldFont });
      } else {
        // Generate from scratch (original fallback code)
        let y = 760;
        const leftMargin = 40;

        // Header
        page.drawText('Pacific Gas and Electric Company', { x: 200, y, size: 12, font: boldFont });
        y -= 15;
        page.drawText('Daily Statement of Labor, Material, and Equipment', { x: 150, y, size: 14, font: boldFont });
        y -= 20;
        page.drawText('ALVAH CONTRACTORS', { x: 450, y: y + 15, size: 10, font: boldFont });
        page.drawText(`LME No. ${lme.lmeNumber}`, { x: 450, y, size: 10, font });

        y -= 20;
        page.drawLine({ start: { x: leftMargin, y }, end: { x: 572, y }, thickness: 1 });
        y -= 15;

        // Job info
        page.drawText(`JOB LOCATION: ${jobInfo.address || 'N/A'}`, { x: leftMargin, y, size: 9, font });
        page.drawText(`DATE: ${lme.date?.toLocaleDateString() || 'N/A'}`, { x: 400, y, size: 9, font });
        y -= 12;
        page.drawText(`PM/NOTIF NO.: ${jobInfo.pmNumber || jobInfo.notificationNumber || 'N/A'}`, { x: leftMargin, y, size: 9, font });
        page.drawText(`START: ${lme.startTime || ''} - END: ${lme.endTime || ''}`, { x: 400, y, size: 9, font });
        y -= 12;
        page.drawText(`JOB NO.: ${jobInfo.woNumber || 'N/A'}`, { x: leftMargin, y, size: 9, font });
        y -= 12;
        page.drawText(`PO/CWA NO.: ${jobInfo.poNumber || 'N/A'}`, { x: leftMargin, y, size: 9, font });
        page.drawText(`Sheet ${lme.sheetNumber} of ${lme.totalSheets}`, { x: 500, y, size: 9, font });
        y -= 15;

        // Work description
        page.drawText('DESCRIPTION OF WORK:', { x: leftMargin, y, size: 9, font: boldFont });
        y -= 12;
        page.drawText((lme.workDescription || 'N/A').substring(0, 100), { x: leftMargin, y, size: 9, font });
        y -= 20;

        // Labor section
        page.drawLine({ start: { x: leftMargin, y }, end: { x: 572, y }, thickness: 0.5 });
        y -= 12;
        page.drawText("CONTRACTOR'S LABOR", { x: leftMargin, y, size: 10, font: boldFont });
        y -= 15;

        // Labor table header
        page.drawText('CRAFT', { x: leftMargin, y, size: 8, font: boldFont });
        page.drawText('NAME', { x: 80, y, size: 8, font: boldFont });
        page.drawText('ST', { x: 220, y, size: 8, font: boldFont });
        page.drawText('OT', { x: 260, y, size: 8, font: boldFont });
        page.drawText('DT', { x: 300, y, size: 8, font: boldFont });
        page.drawText('RATE', { x: 340, y, size: 8, font: boldFont });
        page.drawText('AMOUNT', { x: 400, y, size: 8, font: boldFont });
        y -= 12;

        // Labor entries
        for (const labor of (lme.labor || [])) {
          page.drawText(labor.craft || '', { x: leftMargin, y, size: 8, font });
          page.drawText((labor.name || '').substring(0, 20), { x: 80, y, size: 8, font });
          page.drawText(String(labor.stHours || 0), { x: 220, y, size: 8, font });
          page.drawText(String(labor.otHours || 0), { x: 260, y, size: 8, font });
          page.drawText(String(labor.dtHours || 0), { x: 300, y, size: 8, font });
          page.drawText(`$${(labor.rate || 0).toFixed(2)}`, { x: 340, y, size: 8, font });
          page.drawText(`$${(labor.totalAmount || 0).toFixed(2)}`, { x: 400, y, size: 8, font });
          y -= 12;
          if (y < 200) break;
        }

        // Labor total
        y -= 5;
        page.drawText(`LABOR TOTAL: $${(lme.totals?.labor || 0).toFixed(2)}`, { x: 350, y, size: 9, font: boldFont });
        y -= 20;

        // Material section
        if (lme.materials?.length > 0) {
          page.drawText('MATERIAL', { x: leftMargin, y, size: 10, font: boldFont });
          y -= 15;
          for (const mat of lme.materials) {
            page.drawText(`${mat.description} - ${mat.quantity} ${mat.unit} @ $${mat.unitCost} = $${(mat.amount || 0).toFixed(2)}`, { x: leftMargin, y, size: 8, font });
            y -= 12;
          }
          page.drawText(`MATERIAL TOTAL: $${(lme.totals?.material || 0).toFixed(2)}`, { x: 350, y, size: 9, font: boldFont });
          y -= 20;
        }

        // Equipment section
        if (lme.equipment?.length > 0) {
          page.drawText('EQUIPMENT', { x: leftMargin, y, size: 10, font: boldFont });
          y -= 15;
          for (const eq of lme.equipment) {
            page.drawText(`${eq.type} #${eq.unitNumber || 'N/A'} - ${eq.hours} hrs @ $${eq.rate}/hr = $${(eq.amount || 0).toFixed(2)}`, { x: leftMargin, y, size: 8, font });
            y -= 12;
          }
          page.drawText(`EQUIPMENT TOTAL: $${(lme.totals?.equipment || 0).toFixed(2)}`, { x: 350, y, size: 9, font: boldFont });
          y -= 20;
        }

        // Grand total
        y -= 10;
        page.drawLine({ start: { x: leftMargin, y: y + 5 }, end: { x: 572, y: y + 5 }, thickness: 1 });
        page.drawText(`GRAND TOTAL: $${(lme.totals?.grand || 0).toFixed(2)}`, { x: 350, y: y - 10, size: 12, font: boldFont });

        // Signature lines
        y = 100;
        page.drawLine({ start: { x: leftMargin, y }, end: { x: 200, y }, thickness: 0.5 });
        page.drawText('Contractor Representative', { x: leftMargin, y: y - 12, size: 8, font });
        page.drawLine({ start: { x: 350, y }, end: { x: 550, y }, thickness: 0.5 });
        page.drawText('PG&E Representative', { x: 350, y: y - 12, size: 8, font });
      }
    }

    const pdfBytes = await pdfDoc.save();
    
    console.log(`Generated LME PDF: template=${usedTemplate}, formFields=${filledFormFields}`);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${lme.lmeNumber}.pdf"`);
    res.send(Buffer.from(pdfBytes));
  } catch (err) {
    console.error('Generate LME PDF error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/lme/:id/export
 * Export LME in Oracle or SAP format
 */
router.get('/:id/export', authenticateUser, async (req, res) => {
  try {
    const { format = 'oracle' } = req.query;
    const user = await User.findById(req.userId);
    const lmeId = sanitizeObjectId(req.params.id);
    if (!lmeId) return res.status(400).json({ error: 'Invalid LME ID' });

    const lme = await LME.findOne({ _id: lmeId, companyId: user?.companyId });

    if (!lme) return res.status(404).json({ error: 'LME not found' });

    // Track export
    lme.exports.push({
      format,
      exportedAt: new Date(),
      exportedBy: user._id,
    });
    await lme.save();

    if (format === 'sap') {
      res.json(lme.toSAPFormat());
    } else {
      res.json(lme.toOracleCATS());
    }
  } catch (err) {
    console.error('Export LME error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/lme/:id/approve
 * Approve an LME
 */
router.patch('/:id/approve', authenticateUser, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) return res.status(403).json({ error: 'Unauthorized' });

    const lmeId = sanitizeObjectId(req.params.id);
    if (!lmeId) return res.status(400).json({ error: 'Invalid LME ID' });

    const approverRoles = ['admin', 'owner', 'pm', 'gf'];
    if (!approverRoles.includes(user.role)) {
      return res.status(403).json({ error: 'Not authorized to approve LMEs' });
    }

    const lme = await LME.findOneAndUpdate(
      { _id: lmeId, companyId: user.companyId },
      {
        status: 'approved',
        approvedBy: user._id,
        approvedAt: new Date(),
      },
      { new: true }
    );

    if (!lme) return res.status(404).json({ error: 'LME not found' });
    res.json(lme);
  } catch (err) {
    console.error('Approve LME error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

