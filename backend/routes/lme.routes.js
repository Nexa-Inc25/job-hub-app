/**
 * LME Routes - Daily Statement of Labor, Material, and Equipment
 * 
 * PG&E official contractor timesheet format API endpoints.
 */

const express = require('express');
const router = express.Router();
const LME = require('../models/LME');
const Job = require('../models/Job');
const User = require('../models/User');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { sanitizeObjectId, sanitizeString, sanitizeDate } = require('../utils/sanitize');

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
 * Generate PDF of LME in PG&E format
 */
router.get('/:id/pdf', authenticateUser, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const lmeId = sanitizeObjectId(req.params.id);
    if (!lmeId) return res.status(400).json({ error: 'Invalid LME ID' });

    const lme = await LME.findOne({ _id: lmeId, companyId: user?.companyId });

    if (!lme) return res.status(404).json({ error: 'LME not found' });

    // Generate PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // Letter size
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

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

    // Job info section
    const jobInfo = lme.jobInfo || {};
    page.drawText(`JOB LOCATION: ${jobInfo.address || 'N/A'}`, { x: leftMargin, y, size: 9, font });
    page.drawText(`DATE: ${lme.date?.toLocaleDateString() || 'N/A'}`, { x: 400, y, size: 9, font });
    y -= 12;
    page.drawText(`PM/NOTIF NO.: ${jobInfo.pmNumber || jobInfo.notificationNumber || 'N/A'}`, { x: leftMargin, y, size: 9, font });
    page.drawText(`START: ${lme.startTime || ''} - END: ${lme.endTime || ''}`, { x: 400, y, size: 9, font });
    y -= 12;
    page.drawText(`JOB NO.: ${jobInfo.woNumber || 'N/A'}`, { x: leftMargin, y, size: 9, font });
    y -= 12;
    page.drawText(`PO/CWA NO.: ${jobInfo.poNumber || jobInfo.cwaNumber || 'N/A'}`, { x: leftMargin, y, size: 9, font });
    page.drawText(`Sheet ${lme.sheetNumber} of ${lme.totalSheets}`, { x: 500, y, size: 9, font });
    y -= 15;

    // Description of work
    page.drawText('DESCRIPTION OF WORK:', { x: leftMargin, y, size: 9, font: boldFont });
    y -= 12;
    const workDesc = (lme.workDescription || 'N/A').substring(0, 100);
    page.drawText(workDesc, { x: leftMargin, y, size: 9, font });
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
      if (y < 200) break; // Prevent overflow
    }

    // Labor total
    y -= 5;
    page.drawText(`LABOR TOTAL: $${(lme.totals?.labor || 0).toFixed(2)}`, { x: 350, y, size: 9, font: boldFont });
    y -= 20;

    // Material section (if any)
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

    // Equipment section (if any)
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

    // Signature section
    y = 100;
    page.drawLine({ start: { x: leftMargin, y }, end: { x: 200, y }, thickness: 0.5 });
    page.drawText('Contractor Representative', { x: leftMargin, y: y - 12, size: 8, font });
    page.drawLine({ start: { x: 350, y }, end: { x: 550, y }, thickness: 0.5 });
    page.drawText('PG&E Representative', { x: 350, y: y - 12, size: 8, font });

    const pdfBytes = await pdfDoc.save();

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

