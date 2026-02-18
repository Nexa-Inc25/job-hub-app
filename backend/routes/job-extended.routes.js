/**
 * FieldLedger - Job Extended Routes (Notes, Audits, Dependencies)
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Extended job operations: notes/chat, field audits, QA audit extraction,
 * and dependency management. Mounted at /api/jobs with auth middleware.
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('node:path');
const fs = require('node:fs');
const Job = require('../models/Job');
const User = require('../models/User');
const r2Storage = require('../utils/storage');
const { getIO } = require('../utils/socketAdapter');
const OpenAI = require('openai');
const APIUsage = require('../models/APIUsage');
const { sanitizeObjectId } = require('../utils/sanitize');
const { requireAICredits, refundAICredits } = require('../middleware/subscriptionGate');
const log = require('../utils/logger');
const { logAudit } = require('../middleware/auditLogger');

// Reuse uploads directory
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 50 * 1024 * 1024 }
});

// Helper: apply QA audit review decision to reduce route handler complexity
function applyAuditDecision(audit, job, { decision, assignToGF, correctionNotes, disputeReason }) {
  if (decision === 'accepted') {
    audit.status = 'correction_assigned';
    if (assignToGF) {
      audit.correctionAssignedTo = assignToGF;
      audit.correctionAssignedDate = new Date();
      audit.correctionNotes = correctionNotes || '';
      job.assignedToGF = assignToGF;
    }
  } else if (decision === 'disputed') {
    audit.status = 'disputed';
    audit.disputeReason = disputeReason || '';
    const activeAudits = job.auditHistory.filter(a =>
      a.result === 'fail' && !['resolved', 'closed', 'disputed'].includes(a.status)
    );
    if (activeAudits.length === 0) {
      job.hasFailedAudit = false;
    }
  }
}

// Get notes for a job
router.get('/:id/notes', async (req, res) => {
  try {
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // ============================================
    const user = await User.findById(req.userId).select('companyId');
    const jobId = sanitizeObjectId(req.params.id);
    if (!jobId) return res.status(400).json({ error: 'Invalid job ID' });
    const query = { _id: jobId };
    if (user?.companyId) {
      query.companyId = user.companyId;
    }
    
    const job = await Job.findOne(query).select('notes companyId');
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json(job.notes || []);
  } catch (err) {
    console.error('Get notes error:', err);
    res.status(500).json({ error: 'Failed to get notes' });
  }
});

// Add a note to a job
router.post('/:id/notes', async (req, res) => {
  try {
    const { message, noteType, dependencyId } = req.body;
    
    if (!message || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // ============================================
    const jobId = sanitizeObjectId(req.params.id);
    if (!jobId) return res.status(400).json({ error: 'Invalid job ID' });
    const query = { _id: jobId };
    if (user?.companyId) {
      query.companyId = user.companyId;
    }
    
    const job = await Job.findOne(query);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const newNote = {
      message: message.trim(),
      userId: req.userId,
      userName: user.name || user.email,
      userRole: user.role || 'crew',
      noteType: noteType || null,
      dependencyId: dependencyId || null,
      createdAt: new Date()
    };
    
    job.notes.push(newNote);
    await job.save();
    
    // Emit via socket for real-time updates
    const io = getIO();
    if (io) io.emit(`job-note-${job._id}`, newNote);
    
    res.status(201).json(newNote);
  } catch (err) {
    console.error('Add note error:', err);
    res.status(500).json({ error: 'Failed to add note' });
  }
});

// === QA DASHBOARD ROUTES moved to routes/qa.routes.js ===

// Record a utility field audit result (pass or fail)
// Utility sends failed audits directly to QA - QA records them here
router.post('/:id/audit', async (req, res) => {
  try {
    const { 
      result,  // 'pass' or 'fail'
      auditNumber,
      auditDate,
      inspectorName,
      inspectorId,
      infractionType,
      infractionDescription,
      specReference
    } = req.body;
    
    if (!result || !['pass', 'fail'].includes(result)) {
      return res.status(400).json({ error: 'Audit result (pass/fail) is required' });
    }
    
    if (result === 'fail' && !infractionDescription) {
      return res.status(400).json({ error: 'Infraction description is required for failed audits' });
    }
    
    const user = await User.findById(req.userId);
    
    // QA receives failed audits directly from utility - they record them
    // Admin can also record for flexibility
    if (!['qa', 'admin'].includes(user?.role) && !user?.isSuperAdmin) {
      return res.status(403).json({ error: 'QA access required - failed audits go directly to QA' });
    }
    
    const jobId = sanitizeObjectId(req.params.id);
    if (!jobId) return res.status(400).json({ error: 'Invalid job ID' });
    const query = { _id: jobId };
    if (user?.companyId && !user.isSuperAdmin) {
      query.companyId = user.companyId;
    }
    
    const job = await Job.findOne(query);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const audit = {
      auditNumber: auditNumber || null,
      auditDate: auditDate ? new Date(auditDate) : new Date(),
      receivedDate: new Date(),
      inspectorName: inspectorName || null,
      inspectorId: inspectorId || null,
      result,
      status: result === 'pass' ? 'closed' : 'pending_qa'
    };
    
    // For failed audits, include infraction details
    if (result === 'fail') {
      audit.infractionType = infractionType || 'other';
      audit.infractionDescription = infractionDescription;
      audit.specReference = specReference || null;
    }
    
    if (!job.auditHistory) job.auditHistory = [];
    job.auditHistory.push(audit);
    
    if (result === 'fail') {
      job.hasFailedAudit = true;
      job.failedAuditCount = (job.failedAuditCount || 0) + 1;
    } else {
      job.passedAuditDate = new Date();
    }
    
    await job.save();
    
    console.log(`Audit recorded for job ${job.pmNumber || job._id}: ${result.toUpperCase()}`);
    res.status(201).json({ 
      message: `Audit recorded: ${result.toUpperCase()}`, 
      audit: job.auditHistory[job.auditHistory.length - 1],
      job 
    });
  } catch (err) {
    console.error('Record audit error:', err);
    res.status(500).json({ error: 'Failed to record audit' });
  }
});

// QA reviews a failed audit (accept infraction or dispute it)
// This is QA's responsibility - PM is not involved in go-back workflow
router.put('/:id/audit/:auditId/review', async (req, res) => {
  try {
    const { id, auditId } = req.params;
    const { decision, qaNotes, disputeReason, specsReferenced, assignToGF, correctionNotes } = req.body;
    
    if (!decision || !['accepted', 'disputed'].includes(decision)) {
      return res.status(400).json({ error: 'Valid decision required (accepted or disputed)' });
    }
    
    const user = await User.findById(req.userId);
    
    // QA handles all failed audit reviews - PM not involved
    if (!['qa', 'admin'].includes(user?.role) && !user?.isSuperAdmin) {
      return res.status(403).json({ error: 'QA access required' });
    }
    
    const jobId = sanitizeObjectId(id);
    if (!jobId) return res.status(400).json({ error: 'Invalid job ID' });
    const query = { _id: jobId };
    if (user?.companyId && !user.isSuperAdmin) {
      query.companyId = user.companyId;
    }
    
    const job = await Job.findOne(query);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const audit = job.auditHistory.id(auditId);
    if (!audit) {
      return res.status(404).json({ error: 'Audit not found' });
    }
    
    // Update audit with QA review
    audit.qaReviewedDate = new Date();
    audit.qaReviewedBy = req.userId;
    audit.qaDecision = decision;
    audit.qaNotes = qaNotes || '';
    
    if (specsReferenced && specsReferenced.length > 0) {
      audit.specsReferenced = specsReferenced;
    }
    
    applyAuditDecision(audit, job, { decision, assignToGF, correctionNotes, disputeReason });
    
    await job.save();
    
    console.log(`Audit ${auditId} reviewed: ${decision} by ${user.email}`);
    res.json({ message: `Audit ${decision}`, audit, job });
  } catch (err) {
    console.error('Review audit error:', err);
    res.status(500).json({ error: 'Failed to review audit' });
  }
});

// Submit correction with photo proof (GF/Crew uploads photos showing fix)
router.post('/:id/audit/:auditId/correction', upload.array('photos', 10), async (req, res) => {
  try {
    const { id, auditId } = req.params;
    const { correctionDescription } = req.body;
    
    const user = await User.findById(req.userId);
    
    // GF, Foreman, PM, Admin can submit corrections
    if (!['gf', 'foreman', 'pm', 'admin', 'qa'].includes(user?.role) && !user?.isSuperAdmin) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    const jobId = sanitizeObjectId(id);
    if (!jobId) return res.status(400).json({ error: 'Invalid job ID' });
    const query = { _id: jobId };
    if (user?.companyId && !user.isSuperAdmin) {
      query.companyId = user.companyId;
    }
    
    const job = await Job.findOne(query);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const audit = job.auditHistory.id(auditId);
    if (!audit) {
      return res.status(404).json({ error: 'Audit not found' });
    }
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Correction photos are required as proof' });
    }
    
    // Upload photos to R2
    const correctionPhotos = [];
    for (const file of req.files) {
      const photoData = {
        name: file.originalname,
        uploadDate: new Date(),
        uploadedBy: req.userId
      };
      
      if (r2Storage.isR2Configured()) {
        const r2Result = await r2Storage.uploadJobFile(
          file.path,
          id,
          'correction_photos',
          file.originalname
        );
        photoData.r2Key = r2Result.key;
        photoData.url = r2Storage.getPublicUrl(r2Result.key);
        // Clean up local file
        fs.unlinkSync(file.path);
      } else {
        photoData.url = `/uploads/${path.basename(file.path)}`;
      }
      
      correctionPhotos.push(photoData);
    }
    
    // Update audit with correction
    audit.correctionPhotos = [...(audit.correctionPhotos || []), ...correctionPhotos];
    audit.correctionDescription = correctionDescription || '';
    audit.correctionCompletedDate = new Date();
    audit.correctionCompletedBy = req.userId;
    audit.status = 'correction_submitted';
    
    await job.save();
    
    console.log(`Correction submitted for audit ${auditId} with ${correctionPhotos.length} photos`);
    res.json({ 
      message: 'Correction submitted with photo proof', 
      photos: correctionPhotos,
      audit 
    });
  } catch (err) {
    console.error('Submit correction error:', err);
    res.status(500).json({ error: 'Failed to submit correction' });
  }
});

// QA approves correction and resolves the failed audit
// QA owns the entire go-back workflow - PM not involved
router.put('/:id/audit/:auditId/resolve', async (req, res) => {
  try {
    const { id, auditId } = req.params;
    const { resolutionNotes } = req.body;
    
    const user = await User.findById(req.userId);
    
    // Only QA can approve corrections and resolve audits
    if (!['qa', 'admin'].includes(user?.role) && !user?.isSuperAdmin) {
      return res.status(403).json({ error: 'QA access required' });
    }
    
    const jobId = sanitizeObjectId(id);
    if (!jobId) return res.status(400).json({ error: 'Invalid job ID' });
    const query = { _id: jobId };
    if (user?.companyId && !user.isSuperAdmin) {
      query.companyId = user.companyId;
    }
    
    // Atomic update: resolve the specific audit entry via positional arrayFilter
    const resolvedAt = new Date();
    const notes = resolutionNotes || 'Correction approved';

    const updatedJob = await Job.findOneAndUpdate(
      { ...query, 'auditHistory._id': auditId },
      {
        $set: {
          'auditHistory.$[target].status': 'resolved',
          'auditHistory.$[target].resolvedDate': resolvedAt,
          'auditHistory.$[target].resolvedBy': req.userId,
          'auditHistory.$[target].resolutionNotes': notes
        }
      },
      {
        arrayFilters: [{ 'target._id': auditId }],
        new: true
      }
    );

    if (!updatedJob) {
      return res.status(404).json({ error: 'Job or audit not found' });
    }

    // Check if all failed audits are now resolved
    const activeAudits = updatedJob.auditHistory.filter(a =>
      a.result === 'fail' && !['resolved', 'closed', 'disputed'].includes(a.status)
    );
    const allClear = activeAudits.length === 0;

    // Atomic status update if all audits resolved
    if (allClear) {
      await Job.findOneAndUpdate(
        { _id: jobId },
        { $set: { hasFailedAudit: false, status: 'ready_to_submit' } }
      );
    } else {
      await Job.findOneAndUpdate(
        { _id: jobId },
        { $set: { hasFailedAudit: true } }
      );
    }

    await logAudit(req, 'STATUS_CHANGED', {
      resourceType: 'job', resourceId: jobId,
      resourceName: `Job ${updatedJob.pmNumber || updatedJob.woNumber}`,
      details: {
        auditId, action: 'resolved',
        newJobStatus: allClear ? 'ready_to_submit' : updatedJob.status,
        allAuditsResolved: allClear,
        resolvedBy: req.userId
      },
      severity: 'info'
    });

    log.info({ jobId, auditId, resolvedBy: user.email, allClear }, 'Audit resolved');
    const resolvedAudit = updatedJob.auditHistory.id(auditId);
    res.json({ message: 'Audit resolved - correction approved', audit: resolvedAudit, job: updatedJob });
  } catch (err) {
    log.error({ err }, 'Resolve audit error');
    res.status(500).json({ error: 'Failed to resolve audit' });
  }
});

// ==================== QA AUDIT PDF EXTRACTION ====================
// Helper: Parse PDF text from file path
async function parsePdfText(pdfPath, fallbackName) {
  try {
    const pdfParse = require('pdf-parse');
    const pdfBuffer = fs.readFileSync(pdfPath);
    const pdfData = await pdfParse(pdfBuffer, { max: 3 });
    return pdfData.text.substring(0, 8000);
  } catch (error_) {
    console.warn('PDF parsing failed:', error_.message);
    return fallbackName || '';
  }
}

// Helper: Parse and clean AI JSON response with regex fallback
function parseAiResponse(response, sourceText) {
  try {
    const content = response.choices[0]?.message?.content || '{}';
    const cleanContent = content.replaceAll(/```json\n?/g, '').replaceAll(/```\n?/g, '').trim();
    return JSON.parse(cleanContent);
  } catch (error_) {
    console.error('Failed to parse AI response:', error_);
    const pmMatch = /(?:PM|PM#|PM Number|Order)[:\s#]*(\d{7,8})/i.exec(sourceText);
    return { pmNumber: pmMatch ? pmMatch[1] : '' };
  }
}

// Helper: Find existing job or create a new audit work order
async function findOrCreateAuditJob(extracted, user, userId) {
  const jobQuery = {
    pmNumber: extracted.pmNumber,
    isDeleted: { $ne: true }
  };
  if (user?.companyId) {
    jobQuery.companyId = user.companyId;
  }

  const existingJob = await Job.findOne(jobQuery);
  if (existingJob) return { job: existingJob, isNewAuditJob: false };

  console.log(`No existing job found for PM ${extracted.pmNumber}, creating audit work order`);
  const job = new Job({
    pmNumber: extracted.pmNumber,
    woNumber: extracted.woNumber || null,
    address: extracted.address || 'Address pending from audit',
    city: extracted.city || '',
    status: 'submitted',
    companyId: user?.companyId,
    utilityId: user?.utilityId,
    userId,
    createdFromAudit: true,
    notes: [{
      message: `Created from utility audit - PM ${extracted.pmNumber} was audited but original work order was not found in system.`,
      userId,
      userName: user?.name || 'QA System',
      userRole: user?.role || 'qa',
      noteType: 'update'
    }],
    folders: [
      { name: 'ACI', documents: [], subfolders: [] },
      { name: 'Job Package', documents: [], subfolders: [] },
      { name: 'QA Go Back', documents: [], subfolders: [] }
    ]
  });
  await job.save();
  return { job, isNewAuditJob: true };
}

// Helper: Attach audit PDF to job's QA Go Back folder
async function attachAuditPdfToJob(job, pdfPath, extracted, userId) {
  let qaFolder = job.folders.find(f => f.name === 'QA Go Back');
  if (!qaFolder) {
    job.folders.push({ name: 'QA Go Back', documents: [], subfolders: [] });
    qaFolder = job.folders[job.folders.length - 1];
  }

  let pdfUrl = `/uploads/${path.basename(pdfPath)}`;
  let r2Key = null;
  const auditFileName = `Audit_${extracted.auditNumber || Date.now()}_${extracted.pmNumber}.pdf`;

  if (r2Storage.isR2Configured()) {
    try {
      const result = await r2Storage.uploadJobFile(pdfPath, job._id.toString(), 'QA_Go_Back', auditFileName);
      pdfUrl = r2Storage.getPublicUrl(result.key);
      r2Key = result.key;
    } catch (error_) {
      console.error('Failed to upload audit PDF to R2:', error_.message);
    }
  }

  cleanupTempFile(pdfPath);

  qaFolder.documents.push({
    name: auditFileName, url: pdfUrl, r2Key,
    type: 'pdf', uploadDate: new Date(), uploadedBy: userId
  });
  job.markModified('folders');
  return pdfUrl;
}

// Helper: Build audit record from extracted data
function buildAuditRecord(extracted) {
  return {
    auditNumber: extracted.auditNumber || null,
    auditDate: extracted.auditDate ? new Date(extracted.auditDate) : new Date(),
    receivedDate: new Date(),
    inspectorName: extracted.inspectorName || null,
    inspectorId: extracted.inspectorId || null,
    result: extracted.result || 'fail',
    status: 'pending_qa',
    infractionType: extracted.infractionType || 'other',
    infractionDescription: extracted.infractionDescription || '',
    specReference: extracted.specReference || null
  };
}

// Helper: Safely remove a temporary file
function cleanupTempFile(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch { /* Ignore cleanup errors */ }
}

// Upload and extract failed audit PDF from utility (e.g., PG&E)
// Finds the original job by PM number and creates the audit record
router.post('/qa/extract-audit', upload.single('pdf'), requireAICredits(2), async (req, res) => {
  const startTime = Date.now();
  let pdfPath = null;
  
  try {
    const user = await User.findById(req.userId);
    
    if (!['qa', 'admin'].includes(user?.role) && !user?.isSuperAdmin) {
      cleanupTempFile(req.file?.path);
      return res.status(403).json({ error: 'QA access required' });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file provided' });
    }
    
    pdfPath = req.file.path;
    const text = await parsePdfText(pdfPath, req.file.originalname);
    
    if (!process.env.OPENAI_API_KEY) {
      cleanupTempFile(pdfPath);
      return res.status(500).json({ error: 'AI extraction not configured' });
    }
    
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 60000 });
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are extracting data from a PG&E (or utility) QA audit / go-back document.
          
Extract and return ONLY valid JSON with these fields:
- pmNumber: The PM Order number (7-8 digits, e.g., "35611981")
- woNumber: Work Order number if different from PM
- auditNumber: Audit or inspection number/reference
- auditDate: Date of inspection (YYYY-MM-DD format)
- inspectorName: Name of the utility inspector
- inspectorId: Inspector ID/badge number if present
- result: "pass" or "fail" (if this is a go-back/failed audit, it's "fail")
- infractionType: One of: workmanship, materials, safety, incomplete, as_built, photos, clearances, grounding, other
- infractionDescription: Detailed description of the issue/infraction
- specReference: Spec or standard reference cited (e.g., "TD-2305M-001")
- address: Job site address
- city: City

Use empty string "" for any missing fields. Return ONLY valid JSON, no markdown or explanation.`
        },
        { role: 'user', content: text }
      ],
      temperature: 0,
      max_tokens: 800
    });
    
    const usage = response.usage || {};
    await APIUsage.logOpenAIUsage({
      operation: 'audit-extraction',
      model: 'gpt-4o-mini',
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      success: true,
      responseTimeMs: Date.now() - startTime,
      userId: req.userId,
      companyId: user?.companyId,
      metadata: { textLength: text.length }
    });
    
    const extracted = parseAiResponse(response, text);
    console.log('Extracted audit data:', extracted);
    
    if (!extracted.pmNumber) {
      return res.json({
        success: false,
        error: 'Could not extract PM number from document',
        extracted,
        requiresManualEntry: true
      });
    }
    
    const { job, isNewAuditJob } = await findOrCreateAuditJob(extracted, user, req.userId);
    const pdfUrl = await attachAuditPdfToJob(job, pdfPath, extracted, req.userId);
    pdfPath = null; // Already cleaned up inside attachAuditPdfToJob
    
    const audit = buildAuditRecord(extracted);
    if (!job.auditHistory) job.auditHistory = [];
    job.auditHistory.push(audit);
    job.hasFailedAudit = true;
    job.failedAuditCount = (job.failedAuditCount || 0) + 1;
    job.markModified('auditHistory');
    
    await job.save();
    
    const action = isNewAuditJob ? 'Created new audit work order' : 'Failed audit extracted and recorded';
    console.log(`${action} for PM ${job.pmNumber}: ${extracted.infractionType}`);
    
    res.json({
      success: true,
      message: isNewAuditJob 
        ? 'Audit work order created - original job was not in system'
        : 'Audit extracted and recorded successfully',
      isNewAuditJob,
      extracted,
      job: {
        _id: job._id, pmNumber: job.pmNumber, woNumber: job.woNumber,
        address: job.address, city: job.city, createdFromAudit: job.createdFromAudit
      },
      audit: job.auditHistory[job.auditHistory.length - 1],
      pdfUrl
    });
    
  } catch (err) {
    await refundAICredits(req);
    console.error('Audit extraction error:', err.message);
    cleanupTempFile(pdfPath);
    res.status(500).json({ error: 'Failed to extract audit', details: err.message });
  }
});

// Get audit history for a job
router.get('/:id/audits', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    
    const jobId = sanitizeObjectId(req.params.id);
    if (!jobId) return res.status(400).json({ error: 'Invalid job ID' });
    const query = { _id: jobId };
    if (user?.companyId && !user.isSuperAdmin) {
      query.companyId = user.companyId;
    }
    
    const job = await Job.findOne(query)
      .populate('auditHistory.qaReviewedBy', 'name email')
      .populate('auditHistory.resolvedBy', 'name email')
      .populate('auditHistory.correctionAssignedTo', 'name email')
      .populate('auditHistory.correctionCompletedBy', 'name email')
      .select('auditHistory hasFailedAudit failedAuditCount passedAuditDate pmNumber woNumber');
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json({
      auditHistory: job.auditHistory || [],
      hasFailedAudit: job.hasFailedAudit,
      failedAuditCount: job.failedAuditCount,
      passedAuditDate: job.passedAuditDate,
      jobInfo: { pmNumber: job.pmNumber, woNumber: job.woNumber }
    });
  } catch (err) {
    console.error('Get audits error:', err);
    res.status(500).json({ error: 'Failed to get audit history' });
  }
});

// === SPEC LIBRARY ROUTES moved to routes/specs.routes.js ===

// === JOB DEPENDENCIES MANAGEMENT ===

// Get dependencies for a job
router.get('/:id/dependencies', async (req, res) => {
  try {
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // ============================================
    const user = await User.findById(req.userId).select('companyId');
    const jobId = sanitizeObjectId(req.params.id);
    if (!jobId) return res.status(400).json({ error: 'Invalid job ID' });
    const query = { _id: jobId };
    if (user?.companyId) {
      query.companyId = user.companyId;
    }
    
    const job = await Job.findOne(query).select('dependencies companyId');
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json(job.dependencies || []);
  } catch (err) {
    console.error('Get dependencies error:', err);
    res.status(500).json({ error: 'Failed to get dependencies' });
  }
});

// Add a dependency to a job
router.post('/:id/dependencies', async (req, res) => {
  try {
    const { type, description, scheduledDate, ticketNumber, notes } = req.body;
    
    if (!type) {
      return res.status(400).json({ error: 'Dependency type is required' });
    }
    
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // ============================================
    const user = await User.findById(req.userId).select('companyId');
    const jobId = sanitizeObjectId(req.params.id);
    if (!jobId) return res.status(400).json({ error: 'Invalid job ID' });
    const query = { _id: jobId };
    if (user?.companyId) {
      query.companyId = user.companyId;
    }
    
    const job = await Job.findOne(query);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const newDep = {
      type,
      description: description || '',
      status: 'required',
      scheduledDate: scheduledDate || null,
      ticketNumber: ticketNumber || '',
      notes: notes || ''
    };
    
    job.dependencies.push(newDep);
    await job.save();
    
    // Return the newly created dependency with its ID
    const createdDep = job.dependencies[job.dependencies.length - 1];
    res.status(201).json(createdDep);
  } catch (err) {
    console.error('Add dependency error:', err);
    res.status(500).json({ error: 'Failed to add dependency' });
  }
});

// Update a dependency
router.put('/:id/dependencies/:depId', async (req, res) => {
  try {
    const { type, description, status, scheduledDate, completedDate, ticketNumber, notes } = req.body;
    
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // ============================================
    const user = await User.findById(req.userId).select('companyId');
    const jobId = sanitizeObjectId(req.params.id);
    if (!jobId) return res.status(400).json({ error: 'Invalid job ID' });
    const query = { _id: jobId };
    if (user?.companyId) {
      query.companyId = user.companyId;
    }
    
    const job = await Job.findOne(query);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const dep = job.dependencies.id(req.params.depId);
    if (!dep) {
      return res.status(404).json({ error: 'Dependency not found' });
    }
    
    // Update fields
    if (type !== undefined) dep.type = type;
    if (description !== undefined) dep.description = description;
    if (status !== undefined) dep.status = status;
    if (scheduledDate !== undefined) dep.scheduledDate = scheduledDate;
    if (completedDate !== undefined) dep.completedDate = completedDate;
    if (ticketNumber !== undefined) dep.ticketNumber = ticketNumber;
    if (notes !== undefined) dep.notes = notes;
    
    await job.save();
    res.json(dep);
  } catch (err) {
    console.error('Update dependency error:', err);
    res.status(500).json({ error: 'Failed to update dependency' });
  }
});

// Delete a dependency
router.delete('/:id/dependencies/:depId', async (req, res) => {
  try {
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // ============================================
    const user = await User.findById(req.userId).select('companyId');
    const jobId = sanitizeObjectId(req.params.id);
    if (!jobId) return res.status(400).json({ error: 'Invalid job ID' });
    const query = { _id: jobId };
    if (user?.companyId) {
      query.companyId = user.companyId;
    }
    
    const job = await Job.findOne(query);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const dep = job.dependencies.id(req.params.depId);
    if (!dep) {
      return res.status(404).json({ error: 'Dependency not found' });
    }
    
    dep.deleteOne();
    await job.save();
    res.json({ message: 'Dependency deleted' });
  } catch (err) {
    console.error('Delete dependency error:', err);
    res.status(500).json({ error: 'Failed to delete dependency' });
  }
});


module.exports = router;
