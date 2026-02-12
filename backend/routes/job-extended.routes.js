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
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const Job = require('../models/Job');
const User = require('../models/User');
const Company = require('../models/Company');
const r2Storage = require('../utils/storage');
const { getIO } = require('../utils/socketAdapter');
const OpenAI = require('openai');
const APIUsage = require('../models/APIUsage');

// Reuse uploads directory
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 50 * 1024 * 1024 }
});

// Get notes for a job
router.get('/:id/notes', async (req, res) => {
  try {
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // ============================================
    const user = await User.findById(req.userId).select('companyId');
    const query = { _id: req.params.id };
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
    const query = { _id: req.params.id };
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
    
    const query = { _id: req.params.id };
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
    
    const query = { _id: id };
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
    
    if (decision === 'accepted') {
      // Infraction is valid - assign to GF for correction
      audit.status = 'correction_assigned';
      
      if (assignToGF) {
        audit.correctionAssignedTo = assignToGF;
        audit.correctionAssignedDate = new Date();
        audit.correctionNotes = correctionNotes || '';
        job.assignedToGF = assignToGF;
      }
    } else if (decision === 'disputed') {
      // Disputing the infraction with utility
      audit.status = 'disputed';
      audit.disputeReason = disputeReason || '';
      
      // Check if there are any other active failed audits
      const activeAudits = job.auditHistory.filter(a => 
        a.result === 'fail' && !['resolved', 'closed', 'disputed'].includes(a.status)
      );
      
      // If all failed audits are disputed/resolved, job can proceed
      if (activeAudits.length === 0) {
        job.hasFailedAudit = false;
      }
    }
    
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
    
    const query = { _id: id };
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
    
    const query = { _id: id };
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
    
    audit.status = 'resolved';
    audit.resolvedDate = new Date();
    audit.resolvedBy = req.userId;
    audit.resolutionNotes = resolutionNotes || 'Correction approved';
    
    // Check remaining active failed audits
    const activeAudits = job.auditHistory.filter(a => 
      a.result === 'fail' && !['resolved', 'closed', 'disputed'].includes(a.status)
    );
    job.hasFailedAudit = activeAudits.length > 0;
    
    // If all audits resolved, job can be resubmitted to utility
    if (!job.hasFailedAudit) {
      job.status = 'ready_to_submit';
    }
    
    await job.save();
    
    console.log(`Audit ${auditId} resolved by ${user.email}`);
    res.json({ message: 'Audit resolved - correction approved', audit, job });
  } catch (err) {
    console.error('Resolve audit error:', err);
    res.status(500).json({ error: 'Failed to resolve audit' });
  }
});

// ==================== QA AUDIT PDF EXTRACTION ====================
// Upload and extract failed audit PDF from utility (e.g., PG&E)
// Finds the original job by PM number and creates the audit record
router.post('/qa/extract-audit', upload.single('pdf'), async (req, res) => {
  const startTime = Date.now();
  const APIUsage = require('./models/APIUsage');
  let pdfPath = null;
  
  try {
    const user = await User.findById(req.userId);
    
    // Only QA can upload failed audits
    if (!['qa', 'admin'].includes(user?.role) && !user?.isSuperAdmin) {
      if (req.file) try { fs.unlinkSync(req.file.path); } catch { /* Ignore cleanup errors */ }
      return res.status(403).json({ error: 'QA access required' });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file provided' });
    }
    
    pdfPath = req.file.path;
    
    // STEP 1: Parse PDF text
    let text = '';
    try {
      const pdfParse = require('pdf-parse');
      const pdfBuffer = fs.readFileSync(pdfPath);
      const pdfData = await pdfParse(pdfBuffer, { max: 3 }); // First 3 pages
      text = pdfData.text.substring(0, 8000);
    } catch (parseErr) {
      console.warn('PDF parsing failed:', parseErr.message);
      text = req.file.originalname || '';
    }
    
    // STEP 2: AI extraction with audit-specific prompt
    if (!process.env.OPENAI_API_KEY) {
      try { fs.unlinkSync(pdfPath); } catch { /* Ignore cleanup errors */ }
      return res.status(500).json({ error: 'AI extraction not configured' });
    }
    
    const openai = new OpenAI({ 
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 60000
    });
    
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
        {
          role: 'user',
          content: text
        }
      ],
      temperature: 0,
      max_tokens: 800
    });
    
    // Log API usage
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
    
    // Parse the AI response
    let extracted = {};
    try {
      const content = response.choices[0]?.message?.content || '{}';
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      extracted = JSON.parse(cleanContent);
    } catch (parseErr) {
      console.error('Failed to parse AI response:', parseErr);
      // Try basic regex extraction for PM number
      const pmMatch = text.match(/(?:PM|PM#|PM Number|Order)[:\s#]*(\d{7,8})/i);
      extracted = { pmNumber: pmMatch ? pmMatch[1] : '' };
    }
    
    console.log('Extracted audit data:', extracted);
    
    // STEP 3: Find the job by PM number
    if (!extracted.pmNumber) {
      // Don't delete PDF - let user try again or enter manually
      return res.json({
        success: false,
        error: 'Could not extract PM number from document',
        extracted,
        requiresManualEntry: true
      });
    }
    
    const jobQuery = { 
      pmNumber: extracted.pmNumber,
      isDeleted: { $ne: true }
    };
    if (user?.companyId) {
      jobQuery.companyId = user.companyId;
    }
    
    let job = await Job.findOne(jobQuery);
    let isNewAuditJob = false;
    
    // If job not found, create a new "audit work order"
    if (!job) {
      console.log(`No existing job found for PM ${extracted.pmNumber}, creating audit work order`);
      
      job = new Job({
        pmNumber: extracted.pmNumber,
        woNumber: extracted.woNumber || null,
        address: extracted.address || 'Address pending from audit',
        city: extracted.city || '',
        status: 'submitted', // These are already submitted jobs that got audited
        companyId: user?.companyId,
        utilityId: user?.utilityId,
        userId: req.userId, // Track who created the job (matches Job schema)
        createdFromAudit: true, // Flag to indicate this was created from an audit
        notes: [{
          message: `Created from utility audit - PM ${extracted.pmNumber} was audited but original work order was not found in system.`,
          userId: req.userId,
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
      
      // Save new job first so it has an _id for file uploads
      await job.save();
      isNewAuditJob = true;
    }
    
    // STEP 4: Upload the PDF to "QA Go Back" folder
    let pdfUrl = `/uploads/${path.basename(pdfPath)}`;
    let r2Key = null;
    
    // Ensure QA Go Back folder exists on the job
    let qaFolder = job.folders.find(f => f.name === 'QA Go Back');
    if (!qaFolder) {
      job.folders.push({
        name: 'QA Go Back',
        documents: [],
        subfolders: []
      });
      qaFolder = job.folders[job.folders.length - 1];
    }
    
    // Upload to R2 if configured
    const auditFileName = `Audit_${extracted.auditNumber || Date.now()}_${extracted.pmNumber}.pdf`;
    if (r2Storage.isR2Configured()) {
      try {
        const result = await r2Storage.uploadJobFile(pdfPath, job._id.toString(), 'QA_Go_Back', auditFileName);
        pdfUrl = r2Storage.getPublicUrl(result.key);
        r2Key = result.key;
      } catch (uploadErr) {
        console.error('Failed to upload audit PDF to R2:', uploadErr.message);
      }
    }
    
    // Clean up local file (always, regardless of R2 configuration)
    try {
      if (fs.existsSync(pdfPath)) {
        fs.unlinkSync(pdfPath);
      }
    } catch (cleanupErr) {
      console.error('Failed to clean up audit PDF temp file:', cleanupErr.message);
    }
    
    // Add document to QA Go Back folder
    console.log(`Adding audit PDF to job ${job._id} (PM: ${job.pmNumber}), folder: QA Go Back`);
    qaFolder.documents.push({
      name: auditFileName,
      url: pdfUrl,
      r2Key: r2Key,
      type: 'pdf',
      uploadDate: new Date(),
      uploadedBy: req.userId
    });
    
    // Mark folders as modified for Mongoose to detect nested array changes
    job.markModified('folders');
    
    // STEP 5: Create the audit record
    const audit = {
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
    
    if (!job.auditHistory) job.auditHistory = [];
    job.auditHistory.push(audit);
    job.hasFailedAudit = true;
    job.failedAuditCount = (job.failedAuditCount || 0) + 1;
    
    // Mark audit history as modified
    job.markModified('auditHistory');
    
    await job.save();
    console.log(`Saved audit to job ${job._id}, folders count: ${job.folders.length}, QA Go Back docs: ${qaFolder.documents.length}`);
    
    const logMessage = isNewAuditJob 
      ? `Created new audit work order for PM ${job.pmNumber}: ${extracted.infractionType}`
      : `Failed audit extracted and recorded for job ${job.pmNumber}: ${extracted.infractionType}`;
    console.log(logMessage);
    
    res.json({
      success: true,
      message: isNewAuditJob 
        ? 'Audit work order created - original job was not in system'
        : 'Audit extracted and recorded successfully',
      isNewAuditJob,
      extracted,
      job: {
        _id: job._id,
        pmNumber: job.pmNumber,
        woNumber: job.woNumber,
        address: job.address,
        city: job.city,
        createdFromAudit: job.createdFromAudit
      },
      audit: job.auditHistory[job.auditHistory.length - 1],
      pdfUrl
    });
    
  } catch (err) {
    console.error('Audit extraction error:', err);
    // Clean up file on error
    if (pdfPath && fs.existsSync(pdfPath)) {
      try { fs.unlinkSync(pdfPath); } catch { /* Ignore cleanup errors */ }
    }
    res.status(500).json({ error: 'Failed to extract audit', details: err.message });
  }
});

// Get audit history for a job
router.get('/:id/audits', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    
    const query = { _id: req.params.id };
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
    const query = { _id: req.params.id };
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
    const query = { _id: req.params.id };
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
    const query = { _id: req.params.id };
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
    const query = { _id: req.params.id };
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
