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
const path = require('path');
const fs = require('fs').promises;
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

        // Add LME reference with proper url field for frontend compatibility
        closeOutFolder.documents.push({
          name: lmeFilename,
          type: 'lme',
          lmeId: lme._id,
          url: `/api/lme/${lme._id}/pdf`,  // Primary URL for viewing
          path: `/api/lme/${lme._id}/pdf`, // Fallback path
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

    // Try to load the official LME template from R2 or local templates folder
    let pdfDoc;
    let usedTemplate = false;
    let templateBytes = null;
    
    // First, try R2 storage
    try {
      if (r2Storage.isR2Configured()) {
        const templates = await r2Storage.listFiles('templates/master/');
        const lmeTemplate = templates.find(t => 
          t.Key?.toLowerCase().includes('lme') && t.Key?.toLowerCase().endsWith('.pdf')
        );
        
        if (lmeTemplate) {
          console.log(`Loading LME template from R2: ${lmeTemplate.Key}`);
          const templateStream = await r2Storage.getFileStream(lmeTemplate.Key);
          
          if (templateStream?.stream) {
            const chunks = [];
            for await (const chunk of templateStream.stream) {
              chunks.push(chunk);
            }
            templateBytes = Buffer.concat(chunks);
            console.log('Successfully loaded LME template from R2');
          }
        }
      }
    } catch (r2Error) {
      console.warn('Could not load LME template from R2:', r2Error.message);
    }
    
    // If R2 failed, try local templates folder
    if (!templateBytes) {
      // Try multiple possible paths (handles both local dev and Railway deployment)
      const possiblePaths = [
        path.join(__dirname, '../templates/master/blank LME.pdf'),           // Standard relative
        path.join(process.cwd(), 'templates/master/blank LME.pdf'),          // From cwd
        path.join(process.cwd(), 'backend/templates/master/blank LME.pdf'),  // From repo root
        '/app/backend/templates/master/blank LME.pdf',                        // Railway absolute
      ];
      
      for (const templatePath of possiblePaths) {
        try {
          templateBytes = await fs.readFile(templatePath);
          console.log('Loaded LME template from:', templatePath);
          break;
        } catch {
          // Try next path
        }
      }
      
      if (!templateBytes) {
        console.warn('Could not load local LME template from any path:', possiblePaths);
      }
    }
    
    // Load the template PDF
    if (templateBytes) {
      try {
        pdfDoc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
        usedTemplate = true;
        console.log('Successfully loaded LME template');
      } catch (loadError) {
        console.warn('Failed to parse LME template PDF:', loadError.message);
      }
    }

    // If no template found, create from scratch (fallback)
    if (!pdfDoc) {
      console.log('No LME template found, generating from scratch');
      pdfDoc = await PDFDocument.create();
      pdfDoc.addPage([612, 792]); // Letter size
    }

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    let pages = pdfDoc.getPages();
    
    // Handle empty or malformed PDFs - add a page if none exist
    if (pages.length === 0) {
      console.warn('Template PDF has no pages, adding a blank page');
      pdfDoc.addPage([612, 792]); // Letter size
      pages = pdfDoc.getPages();
      usedTemplate = false; // Treat as fallback since template was invalid
    }
    
    const page = pages[0];
    const { height } = page.getSize();

    // Try to fill form fields if it's a fillable PDF
    let filledFormFields = false;
    try {
      const form = pdfDoc.getForm();
      const fields = form.getFields();
      
      if (fields.length > 0) {
        console.log(`Found ${fields.length} form fields in LME template`);
        
        // Map our data to actual PG&E LME template field names
        // Field names discovered from GET /api/lme/template/fields endpoint
        const jobInfo = lme.jobInfo || {};
        const fieldMappings = {
          // === HEADER FIELDS ===
          'LME No': lme.lmeNumber || '',
          'DATE': lme.date?.toLocaleDateString() || '',
          'START TIME': lme.startTime || '',
          'END': lme.endTime || '',
          'FIRST': lme.sheetNumber || '1',    // Sheet number
          'LAST': lme.totalSheets || '1',     // Total sheets
          
          // === JOB INFO FIELDS ===
          'Job Location': `${jobInfo.address || ''} ${jobInfo.city || ''}`.trim(),
          'PM#': jobInfo.pmNumber || jobInfo.notificationNumber || '',
          'Job#': jobInfo.woNumber || '',
          'POCWA': jobInfo.poNumber || '',
          'FIELD AUTH FORM NO 1': jobInfo.fieldAuthNumber || '',
          'COR NO': jobInfo.corNumber || '',
          
          // === SUBCONTRACTOR ===
          'IF SUBCONTRACTOR USED ENTER NAMES HERE 1': lme.subcontractorName || '',
          'IF SUBCONTRACTOR USED ENTER NAMES HERE 2': lme.subcontractorName2 || '',
          
          // === WELFARE & SUBSISTENCE ===
          'WELFARE AND MISSED MEALS': String(lme.missedMeals || ''),
          'SUBSISTENCE': String(lme.subsistanceCount || ''),
          
          // === LABOR TOTALS ===
          'HRSDYSTOTAL STRAIGHT TIME': String(lme.totals?.stHours || ''),
          'TOTAL STRAIGHT TIME': (lme.totals?.straightTime || 0).toFixed(2),
          'HRSDYSTOTAL OVERTIME PREMIUM TIME': String(lme.totals?.otHours || ''),
          'TOTAL OVERTIME PREMIUM TIME': (lme.totals?.overtime || 0).toFixed(2),
          'HRSDYSTOTAL DOUBLE TIME': String(lme.totals?.dtHours || ''),
          'TOTAL DOUBLE TIME': (lme.totals?.doubleTime || 0).toFixed(2),
          'TOTAL LABOR': (lme.totals?.labor || 0).toFixed(2),
          
          // === PAYROLL/INSURANCE (percentages applied to labor) ===
          'PAYROLL TAXES ON TOTAL LABOR OF': (lme.totals?.payrollTaxes || 0).toFixed(2),
          'COMP INS ON TOTAL LABOR OF': (lme.totals?.compIns || 0).toFixed(2),
          'PL AND PD ON TOTAL LABOR': (lme.totals?.plPd || 0).toFixed(2),
          
          // === GRAND TOTALS (bottom right) ===
          'AMOUNTTOTAL INVOICES  RENTAL EQUIPMENT': (lme.totals?.rentalEquipment || 0).toFixed(2),
          'AMOUNTTOTAL OWNED EQUIPMENT': (lme.totals?.ownedEquipment || 0).toFixed(2),
          'TOTAL INVOICES': (lme.totals?.material || 0).toFixed(2),
          'TOTAL LABOR_2': (lme.totals?.labor || 0).toFixed(2),
          'TOTAL EQUIPMENT': (lme.totals?.equipment || 0).toFixed(2),
          'FEE ON Materials': (lme.totals?.materialFee || 0).toFixed(2),
          'SUB FEE ON': (lme.totals?.subFee || 0).toFixed(2),
          'TOTAL LABOR PR TAXES ETC': (lme.totals?.laborWithTaxes || 0).toFixed(2),
          'GRAND TOTAL': (lme.totals?.grand || 0).toFixed(2),
        };
        
        // === LABOR ROWS (9 workers max) ===
        // Each worker has: CRAFTRowN, NAMERowN, and 3 sub-rows for ST/OT/DT
        // Hours rows: HRSDYSRow1-27 (3 rows per worker × 9 workers)
        // Rates: RATEST, RATEOTPT, RATEDT (first worker), then RATEST_2, etc.
        // Amounts: ST1-ST9, OT1-OT9, DT1-DT9
        for (let i = 0; i < (lme.labor || []).length && i < 9; i++) {
          const labor = lme.labor[i];
          const workerNum = i + 1;
          
          // CRAFT and NAME columns (Row1 through Row9)
          fieldMappings[`CRAFTRow${workerNum}`] = labor.craft || '';
          fieldMappings[`NAMERow${workerNum}`] = labor.name || '';
          
          // Each worker has 3 HRSDYSRow entries (for ST, OT, DT lines)
          const stRow = (i * 3) + 1;  // 1, 4, 7, 10, 13, 16, 19, 22, 25
          const otRow = (i * 3) + 2;  // 2, 5, 8, 11, 14, 17, 20, 23, 26
          const dtRow = (i * 3) + 3;  // 3, 6, 9, 12, 15, 18, 21, 24, 27
          
          fieldMappings[`HRSDYSRow${stRow}`] = labor.stHours ? String(labor.stHours) : '';
          fieldMappings[`HRSDYSRow${otRow}`] = labor.otHours ? String(labor.otHours) : '';
          fieldMappings[`HRSDYSRow${dtRow}`] = labor.dtHours ? String(labor.dtHours) : '';
          
          // Rate fields - first worker has no suffix, then _2, _3, etc.
          const rateSuffix = i === 0 ? '' : `_${i + 1}`;
          fieldMappings[`RATEST${rateSuffix}`] = labor.rate ? labor.rate.toFixed(2) : '';
          fieldMappings[`RATEOTPT${rateSuffix}`] = labor.otRate ? labor.otRate.toFixed(2) : (labor.rate ? (labor.rate * 1.5).toFixed(2) : '');
          fieldMappings[`RATEDT${rateSuffix}`] = labor.dtRate ? labor.dtRate.toFixed(2) : (labor.rate ? (labor.rate * 2).toFixed(2) : '');
          
          // Amount fields: ST1-ST9, OT1-OT9, DT1-DT9
          fieldMappings[`ST${workerNum}`] = labor.stAmount ? labor.stAmount.toFixed(2) : '';
          fieldMappings[`OT${workerNum}`] = labor.otAmount ? labor.otAmount.toFixed(2) : '';
          fieldMappings[`DT${workerNum}`] = labor.dtAmount ? labor.dtAmount.toFixed(2) : '';
        }
        
        // === MATERIAL/INVOICE ROWS (11 rows max) ===
        // Fields: DESCRIPTION, QTY, RATE, AMOUNT (first row)
        // Then: DESCRIPTION_2, QTY_2, RATE_2, AMOUNT_2 ... through _11
        for (let i = 0; i < (lme.materials || []).length && i < 11; i++) {
          const mat = lme.materials[i];
          const suffix = i === 0 ? '' : `_${i + 1}`;
          
          fieldMappings[`DESCRIPTION${suffix}`] = mat.description || '';
          fieldMappings[`QTY${suffix}`] = mat.quantity ? String(mat.quantity) : '';
          fieldMappings[`RATE${suffix}`] = mat.rate ? mat.rate.toFixed(2) : (mat.unitCost ? mat.unitCost.toFixed(2) : '');
          fieldMappings[`AMOUNT${suffix}`] = mat.amount ? mat.amount.toFixed(2) : '';
        }
        
        // === EQUIPMENT ROWS (11 rows max) ===
        // Fields: EQUIPMENT DESCRIPTION, HRS, RATE_12, AMOUNT_12 (first row)
        // Then: EQUIPMENT DESCRIPTION_2, HRS_2, RATE_13, AMOUNT_13 ... etc
        for (let i = 0; i < (lme.equipment || []).length && i < 11; i++) {
          const eq = lme.equipment[i];
          const descSuffix = i === 0 ? '' : `_${i + 1}`;
          const hrsSuffix = i === 0 ? '' : `_${i + 1}`;
          // Rate and Amount for equipment start at _12 and increment
          const rateIdx = 12 + i;
          
          fieldMappings[`EQUIPMENT DESCRIPTION${descSuffix}`] = eq.type || eq.description || '';
          fieldMappings[`HRS${hrsSuffix}`] = eq.hours ? String(eq.hours) : '';
          fieldMappings[`RATE_${rateIdx}`] = eq.rate ? eq.rate.toFixed(2) : '';
          fieldMappings[`AMOUNT_${rateIdx}`] = eq.amount ? eq.amount.toFixed(2) : '';
        }
        
        // Fill each field that matches our mappings
        const filledFields = [];
        const unmatchedFields = [];
        
        for (const field of fields) {
          const fieldName = field.getName();
          const value = fieldMappings[fieldName];
          
          if (value !== undefined && value !== '') {
            try {
              const textField = form.getTextField(fieldName);
              textField.setText(String(value));
              filledFormFields = true;
              filledFields.push(fieldName);
            } catch {
              // Not a text field or couldn't fill
            }
          } else {
            unmatchedFields.push(fieldName);
          }
        }
        
        // Log filled and unmatched fields for debugging
        console.log('Filled fields:', filledFields.join(', '));
        console.log('Sample unmatched fields (first 30):', unmatchedFields.slice(0, 30).join(', '));
        
        // Flatten form fields so they appear as regular text
        form.flatten();
        console.log('Filled and flattened form fields');
      }
    } catch (formError) {
      console.log('Template is not a fillable PDF, using text overlay:', formError.message);
    }

    // If we couldn't fill form fields, overlay text directly
    if (!filledFormFields) {
      // Text overlay coordinates calibrated for PG&E LME template
      // Template is LANDSCAPE format (width > height)
      // Coordinates measured from bottom-left origin
      const jobInfo = lme.jobInfo || {};
      const { width } = page.getSize();
      
      console.log(`LME PDF dimensions: ${width}x${height} (${width > height ? 'landscape' : 'portrait'})`);
      
      // Only add text overlay if using template (not from scratch)
      if (usedTemplate) {
        // === RIGHT SIDE HEADER ===
        // LME No. - top right after "LME No." label
        page.drawText(lme.lmeNumber || '', { x: width - 85, y: height - 38, size: 9, font });
        
        // DATE field - right side (after "DATE" label)
        page.drawText(lme.date?.toLocaleDateString() || '', { x: width - 155, y: height - 58, size: 8, font });
        
        // START TIME and END TIME - below DATE
        page.drawText(lme.startTime || '', { x: width - 155, y: height - 70, size: 8, font });
        page.drawText(lme.endTime || '', { x: width - 85, y: height - 70, size: 8, font });
        
        // === LEFT SIDE JOB INFO ===
        // Template is landscape, scale positions relative to width
        // Left section is roughly 55% of width
        const leftSectionWidth = width * 0.55;
        const leftDataX = 70; // After "JOB LOCATION" label
        
        // Debug: Log what data we have
        console.log('LME jobInfo:', JSON.stringify(jobInfo));
        console.log('LME labor[0]:', JSON.stringify((lme.labor || [])[0]));
        
        // JOB LOCATION - first data row (after header rows)
        // Use address only, not work description (that goes elsewhere)
        page.drawText((jobInfo.address || '').substring(0, 45), { x: leftDataX, y: height - 52, size: 7, font });
        
        // DESCRIPTION OF WORK - this is in the vertical box in the middle
        // For now, we'll skip rotating text and just note it needs the fillable PDF
        // The work description would be: lme.workDescription
        
        // PM/NOTIF NO.
        page.drawText(jobInfo.pmNumber || jobInfo.notificationNumber || '', { x: leftDataX, y: height - 62, size: 7, font });
        
        // JOB NO.
        page.drawText(jobInfo.woNumber || '', { x: leftDataX, y: height - 72, size: 7, font });
        
        // PO/CWA NO.
        page.drawText(jobInfo.poNumber || '', { x: leftDataX, y: height - 82, size: 7, font });
        
        // FIELD AUTH. FORM NO. and COR NO.
        page.drawText(jobInfo.fieldAuthNumber || '', { x: leftDataX + 40, y: height - 92, size: 7, font });
        page.drawText(jobInfo.corNumber || '', { x: leftDataX + 140, y: height - 92, size: 7, font });
        
        // SHEET ___ OF ___
        page.drawText(String(lme.sheetNumber || '1'), { x: 38, y: height - 102, size: 7, font });
        page.drawText(String(lme.totalSheets || '1'), { x: 58, y: height - 102, size: 7, font });
        
        // === CONTRACTOR'S LABOR TABLE ===
        // The table takes up the left ~55% of the page
        // Each worker has 3 sub-rows: ST, OT/PT, DT
        const laborTableWidth = width * 0.48; // Labor table section width
        const laborStartY = height - 130; // First ST row 
        const subRowHeight = 11; // Pixels between ST/OT/DT rows
        const workerBlockHeight = subRowHeight * 3; // 33px per worker
        
        // Column X positions as percentages of labor table width
        // CRAFT | NAME | HRS/DYS | ST/PT | RATE | AMOUNT
        const craftX = laborTableWidth * 0.02;      // ~2% from left
        const nameX = laborTableWidth * 0.10;       // ~10% from left  
        const hrsDysX = laborTableWidth * 0.42;     // ~42% from left
        const stptX = laborTableWidth * 0.52;       // ~52% - ST/PT column
        const rateX = laborTableWidth * 0.62;       // ~62% - RATE column
        const amountX = laborTableWidth * 0.75;     // ~75% - AMOUNT column
        
        console.log(`Labor table: width=${laborTableWidth.toFixed(0)}, craftX=${craftX.toFixed(0)}, nameX=${nameX.toFixed(0)}, stptX=${stptX.toFixed(0)}`);
        
        for (let i = 0; i < (lme.labor || []).length && i < 10; i++) {
          const labor = lme.labor[i];
          const stRowY = laborStartY - (i * workerBlockHeight);
          
          // CRAFT - only on ST row
          page.drawText((labor.craft || '').substring(0, 5), { x: craftX, y: stRowY, size: 6, font });
          
          // NAME - only on ST row
          page.drawText((labor.name || '').substring(0, 16), { x: nameX, y: stRowY, size: 6, font });
          
          // HRS/DYS (if provided)
          if (labor.hrsDays) {
            page.drawText(String(labor.hrsDays), { x: hrsDysX, y: stRowY, size: 6, font });
          }
          
          // ST hours
          if (labor.stHours) {
            page.drawText(String(labor.stHours), { x: stptX, y: stRowY, size: 6, font });
          }
          
          // RATE - on ST row
          if (labor.rate) {
            page.drawText(labor.rate.toFixed(2), { x: rateX, y: stRowY, size: 6, font });
          }
          
          // AMOUNT - on ST row (straight time amount or total)
          const stAmount = labor.stAmount || labor.totalAmount || 0;
          if (stAmount) {
            page.drawText(stAmount.toFixed(2), { x: amountX, y: stRowY, size: 6, font });
          }
          
          // OT/PT hours - second row
          if (labor.otHours) {
            page.drawText(String(labor.otHours), { x: stptX, y: stRowY - subRowHeight, size: 6, font });
          }
          
          // DT hours - third row
          if (labor.dtHours) {
            page.drawText(String(labor.dtHours), { x: stptX, y: stRowY - (subRowHeight * 2), size: 6, font });
          }
        }
        
        // === TOTALS SECTION (bottom left) ===
        // These are at fixed Y positions near bottom of form
        const totalsAmountX = amountX;
        // Positions from bottom of page
        page.drawText((lme.totals?.straightTime || 0).toFixed(2), { x: totalsAmountX, y: 95, size: 6, font });
        page.drawText((lme.totals?.overtime || 0).toFixed(2), { x: totalsAmountX, y: 85, size: 6, font });
        page.drawText((lme.totals?.doubleTime || 0).toFixed(2), { x: totalsAmountX, y: 75, size: 6, font });
        page.drawText((lme.totals?.labor || 0).toFixed(2), { x: totalsAmountX, y: 55, size: 7, font: boldFont });
        
        // === RIGHT SIDE - relative to width ===
        // MISC INVOICES section starts around x = width * 0.55
        const rightSectionX = width * 0.55;
        const rightAmountX = width - 35;
        const rightRateX = width - 65;
        const rightQtyX = width - 95;
        const rightDescX = rightSectionX;
        
        // MISCELLANEOUS INVOICES & RENTAL EQUIPMENT table
        // First row starts around height - 116
        const miscStartY = height - 116;
        const miscRowH = 10;
        const materialsToShow = (lme.materials || []).filter(mat => {
          const desc = (mat.description || '').toLowerCase();
          // Filter out entries that look like job addresses or work descriptions
          return desc && !desc.includes('rochelle') && !desc.includes('san jose') && 
                 !desc.includes('pge') && !desc.includes('pg&e') && mat.quantity;
        });
        console.log('LME materials (filtered):', JSON.stringify(materialsToShow));
        
        for (let i = 0; i < materialsToShow.length && i < 8; i++) {
          const mat = materialsToShow[i];
          const y = miscStartY - (i * miscRowH);
          page.drawText((mat.description || '').substring(0, 22), { x: rightDescX, y, size: 5, font });
          page.drawText(String(mat.quantity || ''), { x: rightQtyX, y, size: 5, font });
          if (mat.rate) page.drawText(mat.rate.toFixed(2), { x: rightRateX, y, size: 5, font });
          if (mat.amount) page.drawText(mat.amount.toFixed(2), { x: rightAmountX, y, size: 5, font });
        }
        
        // TOTAL INVOICES & RENTAL EQUIPMENT
        page.drawText((lme.totals?.invoices || lme.totals?.material || 0).toFixed(2), { 
          x: rightAmountX, y: height - 210, size: 6, font 
        });
        
        // CONTRACTOR OWNED EQUIPMENT table
        // Starts around y = height - 238
        const eqStartY = height - 238;
        const eqRowH = 10;
        for (let i = 0; i < (lme.equipment || []).length && i < 5; i++) {
          const eq = lme.equipment[i];
          const y = eqStartY - (i * eqRowH);
          page.drawText((eq.type || eq.description || '').substring(0, 18), { x: rightDescX, y, size: 5, font });
          if (eq.hours) page.drawText(String(eq.hours), { x: rightQtyX, y, size: 5, font });
          if (eq.rate) page.drawText(eq.rate.toFixed(2), { x: rightRateX, y, size: 5, font });
          if (eq.amount) page.drawText(eq.amount.toFixed(2), { x: rightAmountX, y, size: 5, font });
        }
        
        // Right side TOTALS column
        page.drawText((lme.totals?.ownedEquipment || lme.totals?.equipment || 0).toFixed(2), { 
          x: rightAmountX, y: height - 300, size: 6, font 
        });
        page.drawText((lme.totals?.material || 0).toFixed(2), { x: rightAmountX, y: height - 320, size: 6, font });
        page.drawText((lme.totals?.labor || 0).toFixed(2), { x: rightAmountX, y: height - 340, size: 6, font });
        page.drawText((lme.totals?.equipment || 0).toFixed(2), { x: rightAmountX, y: height - 360, size: 6, font });
        
        // GRAND TOTAL - at bottom right
        page.drawText((lme.totals?.grand || 0).toFixed(2), { 
          x: rightAmountX, y: 32, size: 8, font: boldFont 
        });
        
        // === SUBCONTRACTOR NAME ===
        if (lme.subcontractorName) {
          page.drawText(lme.subcontractorName.substring(0, 30), { x: rightSectionX, y: height - 92, size: 6, font });
        }
        
        // === SUBSISTENCE Count ===
        if (lme.subsistanceCount) {
          page.drawText(String(lme.subsistanceCount), { x: width - 165, y: height - 82, size: 7, font });
        }
        
        // === MISSED MEALS in HOURS ===
        if (lme.missedMeals) {
          page.drawText(String(lme.missedMeals), { x: width - 200, y: height - 82, size: 7, font });
        }
        
        console.log('Applied text overlay to PG&E LME template');
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

/**
 * GET /api/lme/template/fields
 * Utility endpoint to list all form fields in the LME template
 * Helps with mapping field names for auto-fill
 */
router.get('/template/fields', authenticateUser, async (req, res) => {
  try {
    let templateBytes = null;
    let templateSource = null;
    
    // Try R2 first
    try {
      if (r2Storage.isR2Configured()) {
        const templates = await r2Storage.listFiles('templates/master/');
        const lmeTemplate = templates.find(t => 
          t.Key?.toLowerCase().includes('lme') && t.Key?.toLowerCase().endsWith('.pdf')
        );
        
        if (lmeTemplate) {
          const templateStream = await r2Storage.getFileStream(lmeTemplate.Key);
          if (templateStream?.stream) {
            const chunks = [];
            for await (const chunk of templateStream.stream) {
              chunks.push(chunk);
            }
            templateBytes = Buffer.concat(chunks);
            templateSource = `R2: ${lmeTemplate.Key}`;
          }
        }
      }
    } catch (r2Error) {
      console.warn('R2 template lookup failed:', r2Error.message);
    }
    
    // Try local file if R2 failed
    if (!templateBytes) {
      const possiblePaths = [
        path.join(__dirname, '../templates/master/blank LME.pdf'),
        path.join(process.cwd(), 'templates/master/blank LME.pdf'),
        path.join(process.cwd(), 'backend/templates/master/blank LME.pdf'),
        '/app/backend/templates/master/blank LME.pdf',
      ];
      
      for (const templatePath of possiblePaths) {
        try {
          templateBytes = await fs.readFile(templatePath);
          templateSource = `Local: ${templatePath}`;
          break;
        } catch {
          // Try next path
        }
      }
      
      if (!templateBytes) {
        return res.json({ 
          error: 'No LME template found',
          searchedLocations: possiblePaths
        });
      }
    }
    
    const pdfDoc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
    
    // Get form fields
    const form = pdfDoc.getForm();
    const fields = form.getFields();
    
    // Get page info
    const pages = pdfDoc.getPages();
    const pageInfo = pages.map((p, i) => ({
      page: i + 1,
      width: p.getSize().width,
      height: p.getSize().height
    }));
    
    const fieldInfo = fields.map(field => ({
      name: field.getName(),
      type: field.constructor.name,
      isReadOnly: field.isReadOnly?.() || false,
    }));
    
    res.json({
      templateSource,
      totalPages: pages.length,
      pageInfo,
      totalFields: fields.length,
      fields: fieldInfo,
      isFillable: fields.length > 0,
      message: fields.length > 0 
        ? 'Use these field names in the fieldMappings object to auto-fill the template'
        : 'This template is NOT fillable. You need to use Adobe Pro "Prepare Form" to add form fields, or text overlay will be used.'
    });
  } catch (err) {
    console.error('Get template fields error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

