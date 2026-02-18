/**
 * FieldLedger - Job Core Routes
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Core job CRUD: list, create (with AI extraction), get, search,
 * emergency WO, assignments (GF/foreman), calendar, my-assignments,
 * add templates, save edited PDF, doc approve/reject, pending approvals.
 *
 * Mounted at /api/jobs (and /api for calendar/assignments/ai paths)
 * with auth middleware.
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Job = require('../models/Job');
const User = require('../models/User');
const Company = require('../models/Company');
const r2Storage = require('../utils/storage');
const { logJob } = require('../middleware/auditLogger');
const OpenAI = require('openai');
const { requireAICredits, refundAICredits } = require('../middleware/subscriptionGate');

// Lazy-load PDF utilities (heavy optional deps)
let pdfImageExtractorModule = null;
function getPdfImageExtractor() {
  if (!pdfImageExtractorModule) {
    try {
      pdfImageExtractorModule = require('../utils/pdfImageExtractor');
    } catch (err) {
      console.warn('pdfImageExtractor not available:', err.message);
    }
  }
  return pdfImageExtractorModule;
}

// Reuse uploads directory
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 100 * 1024 * 1024 }
});

router.post('/:id/add-templates', async (req, res) => {
  try {
    const { id } = req.params;
    const job = await Job.findById(id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Get templates from R2 or local storage
    let templateFiles = [];
    if (r2Storage.isR2Configured()) {
      const r2Templates = await r2Storage.listFiles('templates/');
      templateFiles = r2Templates.map(f => ({
        name: f.Key.replace('templates/', ''),
        url: r2Storage.getPublicUrl(f.Key),
        r2Key: f.Key
      })).filter(f => f.name);
    } else {
      const masterTemplatesDir = path.join(__dirname, 'templates', 'master');
      if (fs.existsSync(masterTemplatesDir)) {
        const files = fs.readdirSync(masterTemplatesDir);
        templateFiles = files.map(filename => ({
          name: filename,
          url: `/templates/master/${encodeURIComponent(filename)}`,
          r2Key: null
        }));
      }
    }

    if (templateFiles.length === 0) {
      return res.json({ message: 'No templates available to add', templatesAdded: 0 });
    }

    // Find or create General Forms folder
    let aciFolder = job.folders.find(f => f.name === 'ACI');
    if (!aciFolder) {
      aciFolder = { name: 'ACI', documents: [], subfolders: [] };
      job.folders.push(aciFolder);
    }
    if (!aciFolder.subfolders) aciFolder.subfolders = [];

    let generalFormsFolder = aciFolder.subfolders.find(sf => sf.name === 'General Forms');
    if (!generalFormsFolder) {
      generalFormsFolder = { name: 'General Forms', documents: [] };
      aciFolder.subfolders.push(generalFormsFolder);
    }
    if (!generalFormsFolder.documents) generalFormsFolder.documents = [];

    // Only add templates that aren't already in the folder
    const existingNames = generalFormsFolder.documents.map(d => d.name);
    const newTemplates = templateFiles.filter(t => !existingNames.includes(t.name));

    for (const template of newTemplates) {
      generalFormsFolder.documents.push({
        name: template.name,
        url: template.url,
        r2Key: template.r2Key,
        type: 'template',
        isTemplate: true,
        uploadDate: new Date()
      });
    }

    job.markModified('folders');
    await job.save();

    res.json({ 
      message: `Added ${newTemplates.length} templates to General Forms`,
      templatesAdded: newTemplates.length,
      templates: newTemplates.map(t => t.name)
    });
  } catch (err) {
    console.error('Error adding templates to job:', err);
    res.status(500).json({ error: 'Failed to add templates' });
  }
});

// ==================== JOB ASSIGNMENT ENDPOINTS ====================

// PM assigns job to GF
router.put('/:id/assign-gf', async (req, res) => {
  try {
    const { assignedToGF, notes } = req.body;
    
    // Only PM/Admin can assign to GF
    const user = await User.findById(req.userId);
    if (!user?.isAdmin && !['pm', 'admin'].includes(user?.role)) {
      return res.status(403).json({ error: 'Only PM or Admin can assign jobs to GF' });
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
    
    job.assignedToGF = assignedToGF;
    job.assignedToGFBy = req.userId;
    job.assignedToGFDate = new Date();
    if (notes) job.assignmentNotes = notes;
    
    // Update status
    if (['new', 'pending'].includes(job.status)) {
      job.status = 'assigned_to_gf';
    }
    
    await job.save();
    await job.populate('assignedToGF', 'name email');
    
    console.log(`Job ${job.pmNumber || job._id} assigned to GF ${assignedToGF}`);
    res.json({ message: 'Job assigned to GF', job });
  } catch (err) {
    console.error('Error assigning to GF:', err);
    res.status(500).json({ error: 'Failed to assign to GF', details: err.message });
  }
});

// GF assigns crew to job (existing endpoint, updated for new workflow)
// Allow Admin, PM, or GF to assign crews
router.put('/:id/assign', async (req, res) => {
  try {
    // Sanitize user input before logging to prevent log injection
    const safeJobId = String(req.params.id || '').slice(0, 50).replace(/[\n\r\t]/g, '');
    console.log('Assignment request:', safeJobId, 'userId:', req.userId);
    console.log('User:', req.userId, 'isAdmin:', req.isAdmin, 'role:', req.userRole);
    
    // Check permissions - Admin, PM, or GF can assign
    if (!req.isAdmin && !['admin', 'pm', 'gf'].includes(req.userRole)) {
      return res.status(403).json({ error: 'Only Admin, PM, or GF can assign crews' });
    }
    
    const { assignedTo, crewScheduledDate, crewScheduledEndDate, assignmentNotes } = req.body;
    
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
      console.log('Job not found or not in user company:', safeJobId);
      return res.status(404).json({ error: 'Job not found' });
    }
    
    job.assignedTo = assignedTo || null;
    job.assignedBy = req.userId;
    job.assignedDate = new Date();
    job.crewScheduledDate = crewScheduledDate ? new Date(crewScheduledDate) : null;
    job.crewScheduledEndDate = crewScheduledEndDate ? new Date(crewScheduledEndDate) : null;
    job.assignmentNotes = assignmentNotes || '';
    
    // Update status based on current state
    if (assignedTo) {
      if (['new', 'pending', 'assigned_to_gf', 'pre_fielding'].includes(job.status)) {
        job.status = 'scheduled';
      } else if (job.status === 'pre-field') {
        // Legacy status
        job.status = 'scheduled';
      }
    }
    
    await job.save();
    
    // Populate assigned user info for response
    await job.populate('assignedTo', 'name email');
    await job.populate('assignedBy', 'name email');
    
    console.log(`Job ${job.pmNumber || job._id} assigned to crew ${assignedTo} for ${crewScheduledDate}`);
    res.json(job);
  } catch (err) {
    console.error('Error assigning job:', err.message);
    console.error('Stack:', err.stack);
    res.status(500).json({ error: 'Failed to assign job', details: err.message });
  }
});

// Get calendar data for a foreman (jobs assigned to them)
router.get('/calendar', async (req, res) => {
  try {
    const { month, year, userId, viewAll } = req.query;
    
    // ============================================
    // MULTI-TENANT SECURITY: Get user's company
    // ============================================
    const currentUser = await User.findById(req.userId).select('companyId');
    const userCompanyId = currentUser?.companyId;
    
    // Build date range for the month (month is 1-indexed from frontend, JS Date uses 0-indexed)
    const targetMonth = parseInt(month || (new Date().getMonth() + 1));
    const targetYear = parseInt(year || new Date().getFullYear());
    const startDate = new Date(targetYear, targetMonth - 1, 1); // First day of month
    const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59); // Last day of month
    
    console.log('Calendar request:', { month: targetMonth, year: targetYear, viewAll, userId, isAdmin: req.isAdmin, companyId: userCompanyId });
    console.log('Date range:', startDate.toISOString(), 'to', endDate.toISOString());
    
    // Build query - ALWAYS filter by company first
    const query = {
      crewScheduledDate: { $gte: startDate, $lte: endDate }
    };
    
    // ============================================
    // CRITICAL: Always filter by user's company
    // Users can ONLY see their own company's jobs
    // ============================================
    if (userCompanyId) {
      query.companyId = userCompanyId;
    } else {
      // No company = only see jobs they created or are assigned to
      query.$or = [{ userId: req.userId }, { assignedTo: req.userId }];
    }
    
    // Additional filtering within the company
    // If admin requesting viewAll, show all assigned jobs in their company
    // If admin requesting specific user's calendar, use that userId
    // Otherwise, show jobs assigned to the current user
    if (req.isAdmin && viewAll === 'true') {
      // Admin wants to see all scheduled jobs in THEIR COMPANY - just filter by date
      query.assignedTo = { $ne: null }; // Only show jobs that are assigned
    } else if (req.isAdmin && userId) {
      query.assignedTo = userId;
    } else {
      query.assignedTo = req.userId;
    }
    
    console.log('Calendar query:', JSON.stringify(query));
    
    // Find jobs within the date range
    const jobs = await Job.find(query)
      .populate('assignedTo', 'name email')
      .select('pmNumber woNumber title address client crewScheduledDate crewScheduledEndDate dueDate status priority assignmentNotes assignedTo')
      .sort({ crewScheduledDate: 1 });
    
    console.log('Calendar jobs found:', jobs.length, jobs.map(j => ({ id: j._id, pm: j.pmNumber, date: j.crewScheduledDate })));
    
    res.json(jobs);
  } catch (err) {
    console.error('Error fetching calendar:', err);
    res.status(500).json({ error: 'Failed to fetch calendar data' });
  }
});

// Get all assigned jobs for current user (for foreman dashboard)
router.get('/my-assignments', async (req, res) => {
  try {
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // ============================================
    const user = await User.findById(req.userId).select('companyId');
    
    // Build query - assigned to this user AND in their company
    const query = { assignedTo: req.userId };
    if (user?.companyId) {
      query.companyId = user.companyId;
    }
    
    const jobs = await Job.find(query)
      .select('pmNumber woNumber title address client crewScheduledDate crewScheduledEndDate dueDate status priority assignmentNotes createdAt companyId')
      .sort({ crewScheduledDate: 1 });
    
    res.json(jobs);
  } catch (err) {
    console.error('Error fetching assignments:', err);
    res.status(500).json({ error: 'Failed to fetch assignments' });
  }
});

/**
 * @swagger
 * /api/jobs:
 *   get:
 *     summary: List work orders
 *     description: |
 *       Returns work orders accessible to the authenticated user.
 *       Results are filtered by company (multi-tenant) and user role:
 *       - **Admin/PM**: All jobs in their company
 *       - **GF**: Jobs assigned to them
 *       - **Foreman/Crew**: Only jobs directly assigned to them
 *     tags: [Jobs]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by PM#, WO#, title, address, or client
 *       - in: query
 *         name: includeArchived
 *         schema:
 *           type: boolean
 *         description: Include archived jobs (admin only)
 *     responses:
 *       200:
 *         description: List of jobs
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Job'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/', async (req, res) => {
  try {
    // Reduced logging for high-frequency endpoint
    const { search, includeArchived, includeDeleted } = req.query;
    
    // Get user's company for multi-tenant filtering
    const user = await User.findById(req.userId).select('companyId');
    const userCompanyId = user?.companyId;
    
    // Build query based on user role
    let query = {};
    
    // By default, exclude deleted and archived jobs
    // Only admins can request to see deleted/archived
    if (!includeDeleted || !req.isAdmin) {
      query.isDeleted = { $ne: true };
    }
    if (!includeArchived) {
      query.isArchived = { $ne: true };
    }
    
    // ============================================
    // MULTI-TENANT SECURITY: Filter by companyId
    // ============================================
    // Every user MUST only see jobs from their own company
    // Super Admins see their own company's jobs (FieldLedger) - they use Owner Dashboard for analytics
    if (userCompanyId) {
      query.companyId = userCompanyId;
    } else {
      // User has no company - only see jobs they personally created
      query.userId = req.userId;
      console.log('User has no company - showing only their own jobs');
    }
    
    // Additional role-based filtering WITHIN the company
    // Admin and PM see all jobs in their company (they assign jobs to GFs)
    if (req.isAdmin || req.userRole === 'pm' || req.userRole === 'admin') {
      // companyId filter already applied above - they see all company jobs
      // PM/Admin is responsible for assigning jobs to GFs
    } 
    // GF ONLY sees jobs assigned specifically to them
    // Each GF has their own separate workload - no cross-contamination
    // PM assigns jobs to GFs, so unassigned jobs are PM's responsibility
    else if (req.userRole === 'gf') {
      query = {
        ...query,  // Keep companyId and isDeleted/isArchived filters
        $or: [
          { assignedToGF: req.userId },   // Jobs assigned to THIS GF only
          { userId: req.userId }           // Jobs they created (if any)
        ]
      };
      console.log('GF query - only showing jobs assigned to this GF:', req.userId);
    }
    // Foreman ONLY sees jobs assigned to them by their GF
    else if (req.userRole === 'foreman') {
      query = {
        ...query,  // Keep companyId filter
        $or: [
          { assignedTo: req.userId },     // Jobs assigned to this foreman by GF
          { userId: req.userId }           // Jobs they created (unlikely but safe)
        ]
      };
      console.log('Foreman query - only showing jobs assigned to this foreman:', req.userId);
    }
    // Crew members only see jobs they're actively working on
    else if (req.userRole === 'crew') {
      query = {
        ...query,
        assignedTo: req.userId  // Only jobs directly assigned to them
      };
      console.log('Crew query - only showing jobs assigned to this crew member:', req.userId);
    }

    // Add search filter if provided
    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(escapedSearch, 'i');
      query = {
        ...query,
        $and: [
          query.$or ? { $or: query.$or } : {},
          {
            $or: [
              { title: searchRegex },
              { pmNumber: searchRegex },
              { woNumber: searchRegex },
              { notificationNumber: searchRegex },
              { address: searchRegex },
              { city: searchRegex },
              { client: searchRegex },
              { description: searchRegex }
            ]
          }
        ].filter(q => Object.keys(q).length > 0)
      };
      // Clean up the query structure
      if (query.$and && query.$and.length > 0) {
        delete query.$or;
      }
    }

    // Only fetch fields needed for dashboard listing - exclude large nested folders/documents
    const jobs = await Job.find(query)
      .select('-folders') // Exclude folders array which contains all documents
      .populate('userId', 'name email _id')
      .populate('assignedTo', 'name email _id')
      .populate('assignedToGF', 'name email _id')
      .sort({ createdAt: -1 })
      .lean(); // Use lean() for faster read-only queries
    res.json(jobs);
  } catch (err) {
    console.error('Error fetching jobs:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create Emergency Work Order (minimal info, high priority)
router.post('/emergency', async (req, res) => {
  try {
    const { woNumber, pmNumber, address, description } = req.body;
    
    if (!woNumber) {
      return res.status(400).json({ error: 'WO Number is required for emergency work orders' });
    }
    
    // Get user's company and default utility
    const user = await User.findById(req.userId);
    
    // Create emergency job with minimal required fields
    const job = new Job({
      title: `EMERGENCY - ${woNumber}`,
      description: description || 'Emergency Work Order',
      woNumber,
      pmNumber: pmNumber || '',
      address: address || '',
      priority: 'emergency',
      isEmergency: true,
      status: 'pending',
      userId: req.userId,
      companyId: user?.companyId,
      utilityId: user?.companyId ? (await Company.findById(user.companyId))?.defaultUtility : undefined,
      folders: [
        {
          name: 'ACI',
          documents: [],
          subfolders: [
            { name: 'Pre-Field Documents', documents: [], subfolders: [] },
            { name: 'Field As Built', documents: [], subfolders: [] },
            { name: 'Job Photos', documents: [], subfolders: [] },
            { name: 'GF Audit', documents: [], subfolders: [] }
          ]
        },
        {
          name: 'UTCS',  // Flagging/Traffic Control company
          documents: [],
          subfolders: [
            { name: 'Dispatch Docs', documents: [] },
            { name: 'No Parks', documents: [] },
            { name: 'Photos', documents: [] },
            { name: 'Time Sheets', documents: [] },
            { 
              name: 'TCP',
              documents: [],
              subfolders: [
                { name: 'TCP Maps', documents: [] }
              ]
            }
          ]
        }
      ]
    });
    
    await job.save();
    
    console.log('Emergency WO created:', job._id, 'WO#:', woNumber);
    res.status(201).json(job);
  } catch (err) {
    console.error('Error creating emergency WO:', err);
    res.status(500).json({ error: 'Failed to create emergency work order', details: err.message });
  }
});

// ==================== AI METADATA EXTRACTION ====================
// Extract job metadata from PDF before creating a job (for form auto-fill)
router.post('/ai/extract', upload.single('pdf'), requireAICredits(3), async (req, res) => {
  const startTime = Date.now();
  const APIUsage = require('./models/APIUsage');
  let pdfPath = null;
  
  // Get user's company for tracking
  let userCompanyId = null;
  try {
    const user = await User.findById(req.userId).select('companyId');
    userCompanyId = user?.companyId;
  } catch {
    // Silently ignore - userCompanyId will remain null for anonymous/failed lookups
  }
  
  // Quick regex extraction function - used as fallback
  const quickExtract = (text) => {
    const patterns = {
      pmNumber: /(?:PM|PM#|PM Number|Project)[:\s#]*(\d{7,8})/i,
      woNumber: /(?:WO|WO#|Work Order)[:\s#]*([A-Z0-9-]+)/i,
      notificationNumber: /(?:Notification|Notif|NOTIF)[:\s#]*(\d+)/i,
      matCode: /(?:MAT|MAT Code|MAT Codes|Mat\.?\s*Code)[:\s#]*([A-Z0-9-]+)/i,
      address: /(\d+\s+[A-Za-z0-9\s]+(?:St|Street|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Rd|Road|Way|Lane|Ln|Ct|Court)\.?)/i,
      city: /(?:City)[:\s]*([A-Za-z\s]+?)(?:,|\s+CA|\s+California|\n)/i,
      client: /(PG&E|Pacific Gas|SCE|Southern California Edison|SDG&E)/i,
    };
    const result = {};
    for (const [key, pattern] of Object.entries(patterns)) {
      const match = text.match(pattern);
      result[key] = match ? match[1].trim() : '';
    }
    return result;
  };
  
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No PDF file provided' });
    }
    
    pdfPath = req.file.path;
    
    // MEMORY PROTECTION: Check file size (max 5MB to prevent crashes)
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    if (req.file.size > MAX_FILE_SIZE) {
      // Still try regex extraction from filename
      const structured = {
        pmNumber: '', woNumber: '', notificationNumber: '', matCode: '',
        address: '', city: '', client: '', projectName: '', orderType: '',
        jobScope: null
      };
      try { fs.unlinkSync(pdfPath); } catch { /* Ignore cleanup errors */ }
      return res.json({ 
        success: true, 
        structured, 
        warning: 'File too large for AI extraction. Please enter details manually.' 
      });
    }
    
    if (!process.env.OPENAI_API_KEY) {
      try { fs.unlinkSync(pdfPath); } catch { /* Ignore cleanup errors */ }
      return res.json({ success: false, error: 'AI extraction not configured' });
    }
    
    // STEP 1: Parse PDF with memory-safe approach
    let text = '';
    let quickResults = {};
    
    try {
    const pdfParse = require('pdf-parse');
      // Read file in chunks to prevent memory spikes
      const stats = fs.statSync(pdfPath);
      if (stats.size > 2 * 1024 * 1024) {
        // For files > 2MB, just use filename
        text = req.file.originalname || '';
      } else {
    const pdfBuffer = fs.readFileSync(pdfPath);
        const parsePromise = pdfParse(pdfBuffer, { max: 1 }); // Only first page
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('PDF parse timeout')), 15000) // 15 sec timeout
        );
        const pdfData = await Promise.race([parsePromise, timeoutPromise]);
        text = pdfData.text.substring(0, 3000); // Reduced to 3000 chars
      }
      quickResults = quickExtract(text);
    } catch (parseErr) {
      console.warn('PDF parsing failed:', parseErr.message);
      text = req.file.originalname || '';
      quickResults = quickExtract(text);
    }
    
    // Check if quick extraction found any results
    const hasQuickResults = Object.values(quickResults).some(v => v);
    
    // STEP 3: AI enhancement (with shorter timeout)
    // If quick extraction found PM number, we can use faster settings
    const openai = new OpenAI({ 
      apiKey: process.env.OPENAI_API_KEY,
      timeout: hasQuickResults ? 30000 : 60000 // Shorter timeout if we have fallback
    });
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Extract utility work order fields from PG&E job package Face Sheet. Return ONLY valid JSON.

Required fields:
- pmNumber, woNumber, notificationNumber, matCode, address, city, client, projectName, orderType

Key identifiers to look for:
- notificationNumber: The notification number (often labeled "Notification", "Notif #", or similar, usually 9-10 digits)
- matCode: The MAT code (unit pricing code for billable work, often labeled "MAT", "MAT Code", "MAT Codes")

Job Scope (extract from Face Sheet "Scope" or "Description" sections):
- jobScope.summary: 1-2 sentence work description (e.g., "Install new transformer and 150ft underground primary")
- jobScope.workType: Type of work (e.g., "New Service", "Service Upgrade", "Pole Replacement", "Underground Conversion")
- jobScope.equipment: Array of equipment (e.g., ["Transformer 25kVA", "Pole 45ft Class 3", "Conductor 1/0 AL"])
- jobScope.footage: Total footage if mentioned (e.g., "150 ft UG, 75 ft OH")
- jobScope.voltage: Voltage level (e.g., "12kV", "21kV Primary", "120/240V Secondary")
- jobScope.phases: Number of phases (e.g., "1-phase", "3-phase")
- jobScope.specialNotes: Special conditions or notes

Look for sections labeled: "Scope of Work", "Job Description", "Work Description", "Material List", "Construction Details".
Use empty string for missing fields. Return ONLY valid JSON, no markdown.`
        },
        {
          role: 'user',
          content: text.substring(0, 4000) // More text for scope extraction
        }
      ],
      temperature: 0,
      max_tokens: 600 // Increased for job scope details
    });
    
    // Log successful API call
    const usage = response.usage || {};
    await APIUsage.logOpenAIUsage({
      operation: 'metadata-extraction',
      model: 'gpt-4o-mini',
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      success: true,
      responseTimeMs: Date.now() - startTime,
      userId: req.userId,
      companyId: userCompanyId,
      metadata: { textLength: text.length }
    });
    
    // Parse the AI response
    let aiResults = {};
    try {
      const content = response.choices[0]?.message?.content || '{}';
      console.log('AI extraction raw response:', content.substring(0, 500));
      // Remove markdown code blocks if present
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      aiResults = JSON.parse(cleanContent);
      
      // Log job scope extraction result
      if (aiResults.jobScope) {
        console.log('Job scope extracted:', JSON.stringify(aiResults.jobScope, null, 2));
      } else {
        console.log('No job scope found in AI response');
      }
    } catch (parseErr) {
      console.warn('Failed to parse AI response:', parseErr.message);
      console.warn('Raw content was:', response.choices[0]?.message?.content?.substring(0, 200));
    }
    
    // Merge: AI results take priority, fall back to quick regex results
    const structured = {
      pmNumber: aiResults.pmNumber || quickResults.pmNumber || '',
      woNumber: aiResults.woNumber || quickResults.woNumber || '',
      notificationNumber: aiResults.notificationNumber || quickResults.notificationNumber || '',
      matCode: aiResults.matCode || quickResults.matCode || '',
      address: aiResults.address || quickResults.address || '',
      city: aiResults.city || quickResults.city || '',
      client: aiResults.client || quickResults.client || '',
      projectName: aiResults.projectName || '',
      orderType: aiResults.orderType || '',
      jobScope: aiResults.jobScope || null
    };
    
    console.log('Structured extraction result:', {
      pmNumber: structured.pmNumber,
      hasJobScope: !!structured.jobScope,
      jobScopeSummary: structured.jobScope?.summary?.substring(0, 50)
    });
    
    // Clean up the uploaded file
    try {
      fs.unlinkSync(pdfPath);
    } catch {
      // Ignore cleanup errors - file may already be deleted
    }
    
    res.json({ success: true, structured });
  } catch (err) {
    await refundAICredits(req);
    console.warn('AI extraction failed:', err.message);
    
    // Clean up uploaded file
    if (pdfPath) {
      try { fs.unlinkSync(pdfPath); } catch { /* Ignore cleanup errors */ }
    }
    
    // Return empty results - let user fill manually
    const emptyResults = {
      pmNumber: '', woNumber: '', notificationNumber: '', matCode: '',
      address: '', city: '', client: '', projectName: '', orderType: '',
      jobScope: null
    };
    
    res.json({ 
      success: true, 
      structured: emptyResults, 
      warning: 'AI extraction failed - please enter details manually' 
    });
  }
});

// Conditional AI credit gate: only charge when a PDF is uploaded (AI extraction will run)
const conditionalAICredits = (req, res, next) => {
  if (req.file && process.env.OPENAI_API_KEY) {
    return requireAICredits(3)(req, res, next);
  }
  next();
};

router.post('/', upload.single('pdf'), conditionalAICredits, async (req, res) => {
  try {
    const { title, description, priority, dueDate, woNumber, address, client, pmNumber, notificationNumber, city, projectName, orderType, division, matCode, sapId, sapFuncLocation, jobScope, preFieldLabels, ecTag, crewMaterials } = req.body;
    const resolvedTitle = title || pmNumber || woNumber || 'Untitled Work Order';
    
    // Parse JSON fields if they're strings (from form data)
    const parseJsonField = (field, name) => {
      if (!field) return null;
      try {
        return typeof field === 'string' ? JSON.parse(field) : field;
      } catch (e) {
        console.warn(`Failed to parse ${name}:`, e.message);
        return null;
      }
    };
    
    const parsedJobScope = parseJsonField(jobScope, 'jobScope');
    const parsedPreFieldLabels = parseJsonField(preFieldLabels, 'preFieldLabels');
    const parsedEcTag = parseJsonField(ecTag, 'ecTag');
    const parsedCrewMaterials = parseJsonField(crewMaterials, 'crewMaterials');
    
    // Log what we received for debugging
    console.log('[Job Create] Received fields:', {
      pmNumber, notificationNumber, woNumber, sapId, sapFuncLocation,
      hasJobScope: !!parsedJobScope,
      hasCrewMaterials: !!parsedCrewMaterials,
      crewMaterialsCount: Array.isArray(parsedCrewMaterials) ? parsedCrewMaterials.length : 0
    });
    
    const resolvedDescription = description || [address, city, client].filter(Boolean).join(' | ') || '';
    
    // Get user's company for multi-tenant job creation and folder template
    const user = await User.findById(req.userId).select('companyId');
    const company = user?.companyId ? await Company.findById(user.companyId).select('folderTemplate name') : null;
    
    // Helper function to build folders with proper document arrays
    const buildFoldersFromTemplate = (template) => {
      if (!template || template.length === 0) return null;
      
      const buildSubfolders = (subs) => {
        if (!subs || subs.length === 0) return [];
        return subs.map(sf => ({
          name: sf.name,
          documents: [],
          subfolders: buildSubfolders(sf.subfolders)
        }));
      };
      
      return template.map(folder => ({
        name: folder.name,
        documents: [],
        subfolders: buildSubfolders(folder.subfolders)
      }));
    };
    
    // Use company's custom folder template if available, otherwise use Alvah default
    let jobFolders;
    if (company?.folderTemplate && company.folderTemplate.length > 0) {
      console.log(`Using custom folder template for company: ${company.name}`);
      jobFolders = buildFoldersFromTemplate(company.folderTemplate);
    } else {
      // Default folder structure (Alvah's structure)
      jobFolders = [
        {
          name: 'ACI',
          documents: [],
          subfolders: [
            { name: 'Close Out Documents', documents: [] },
            { name: 'Field As Built', documents: [] },
            { name: 'Field Reports', documents: [] },
            { name: 'Photos', documents: [] },
            { 
              name: 'Pre-Field Documents', 
              documents: [],
              subfolders: [
                { name: 'Job Photos', documents: [] },
                { name: 'Construction Sketches', documents: [] },
                { name: 'Circuit Maps', documents: [] }
              ]
            },
            { name: 'General Forms', documents: [] },
            { name: 'GF Audit', documents: [] }
          ]
        },
        {
          name: 'UCS',  // Civil company
          documents: [],
          subfolders: [
            { name: 'Dispatch Docs', documents: [] },
            { name: 'Civil Plans', documents: [] },
            { name: 'Photos', documents: [] },
            { name: 'Time Sheets', documents: [] }
          ]
        },
        {
          name: 'UTCS',  // Flagging/Traffic Control company
          documents: [],
          subfolders: [
            { name: 'Dispatch Docs', documents: [] },
            { name: 'No Parks', documents: [] },
            { name: 'Photos', documents: [] },
            { name: 'Time Sheets', documents: [] },
            { 
              name: 'TCP',
              documents: [],
              subfolders: [
                { name: 'TCP Maps', documents: [] }
              ]
            }
          ]
        }
      ];
    }
    
    const job = new Job({
      title: resolvedTitle,
      description: resolvedDescription,
      priority: priority || 'medium',
      dueDate,
      woNumber,
      address,
      city,
      client,
      pmNumber,
      notificationNumber,
      projectName,
      orderType,
      division: division || 'DA',
      matCode,
      sapId,                      // SAP Equipment ID from PG&E
      sapFuncLocation,            // SAP Functional Location from PG&E
      jobScope: parsedJobScope,  // Scope extracted from PG&E Face Sheet
      preFieldLabels: parsedPreFieldLabels,  // Pre-field crew labels
      ecTag: parsedEcTag,  // EC Tag and program info
      crewMaterials: parsedCrewMaterials,  // PG&E Crew Materials with M-Codes
      crewMaterialsExtractedAt: parsedCrewMaterials ? new Date() : undefined,
      userId: req.userId,
      companyId: user?.companyId,  // MULTI-TENANT: Assign job to user's company
      status: 'pending',
      folders: jobFolders
    });
    
    // If a PDF was uploaded, add it to the Field As Built folder (the job package)
    // NOTE: Don't delete local file here - background extraction needs it
    if (req.file?.path) {
      const aciFolder = job.folders.find(f => f.name === 'ACI');
      if (aciFolder) {
        const fieldAsBuiltFolder = aciFolder.subfolders.find(sf => sf.name === 'Field As Built');
        if (fieldAsBuiltFolder) {
          let docUrl = `/uploads/${path.basename(req.file.path)}`;
          let r2Key = null;
          
          // Upload to R2 if configured (but keep local copy for background extraction)
          if (r2Storage.isR2Configured()) {
            try {
              const result = await r2Storage.uploadJobFile(
                req.file.path,
                job._id.toString(),
                'job-package',
                req.file.originalname || 'Job_Package.pdf'
              );
              docUrl = r2Storage.getPublicUrl(result.key);
              r2Key = result.key;
              // DON'T delete local file here - background extraction needs it
              // It will be cleaned up after extraction completes
            } catch (uploadErr) {
              console.error('Failed to upload job package to R2:', uploadErr.message);
            }
          }
          
          fieldAsBuiltFolder.documents.push({
            name: req.file.originalname || 'Job Package.pdf',
            path: req.file.path,
            url: docUrl,
            r2Key: r2Key,
            type: 'pdf',
            uploadDate: new Date(),
            uploadedBy: req.userId
          });
        }
      }
    }
    
    // Load master templates from R2 and organize them into folders
    try {
      let templateFiles = [];
      
      // Get templates from R2 if configured
      if (r2Storage.isR2Configured()) {
        const r2Templates = await r2Storage.listFiles('templates/');
        templateFiles = r2Templates.map(f => ({
          name: f.Key.replace('templates/', ''),
          url: r2Storage.getPublicUrl(f.Key),
          r2Key: f.Key
        })).filter(f => f.name); // Filter out empty names
        console.log('Found', templateFiles.length, 'templates in R2');
      } else {
        // Fallback to local filesystem
        const masterTemplatesDir = path.join(__dirname, 'templates', 'master');
        if (fs.existsSync(masterTemplatesDir)) {
          const files = fs.readdirSync(masterTemplatesDir);
          templateFiles = files.map(filename => ({
            name: filename,
            url: `/templates/master/${encodeURIComponent(filename)}`,
            r2Key: null
          }));
        }
      }
      
      if (templateFiles.length > 0) {
        // Separate CWC from other templates
        const cwcTemplate = templateFiles.find(f => f.name.toLowerCase().includes('cwc'));
        const generalForms = templateFiles.filter(f => !f.name.toLowerCase().includes('cwc'));
        
        const aciFolder = job.folders.find(f => f.name === 'ACI');
        if (aciFolder) {
          // Add CWC to Pre-Field Documents only
          const preFieldFolder = aciFolder.subfolders.find(sf => sf.name === 'Pre-Field Documents');
          if (preFieldFolder && cwcTemplate) {
            preFieldFolder.documents = [{
              name: cwcTemplate.name,
              url: cwcTemplate.url,
              r2Key: cwcTemplate.r2Key,
              type: 'template',
              isTemplate: true,
              uploadDate: new Date()
            }];
          }
          
          // Add all other templates to General Forms
          const generalFormsFolder = aciFolder.subfolders.find(sf => sf.name === 'General Forms');
          if (generalFormsFolder && generalForms.length > 0) {
            generalFormsFolder.documents = generalForms.map(t => ({
              name: t.name,
              url: t.url,
              r2Key: t.r2Key,
              type: 'template',
              isTemplate: true,
              uploadDate: new Date()
            }));
          }
        }
        
        console.log('Added templates:', cwcTemplate ? 'CWC to Pre-Field,' : '', generalForms.length, 'to General Forms');
      } else {
        console.log('No templates found in R2 or local storage');
      }
    } catch (templateErr) {
      console.error('Error adding templates to job:', templateErr);
    }
    
    await job.save();
    console.log('Job created with folder structure:', job._id);
    
    // Audit log: Job created — awaited for NERC CIP compliance
    await logJob.create(req, job);
    
    // Send response immediately - don't wait for asset extraction
    res.status(201).json(job);
    
    // Trigger AI asset extraction in the background if a PDF was uploaded.
    // Credits were already reserved upfront by the conditionalAICredits middleware.
    // Pass companyId + cost to the background function for refund on failure.
    if (req.file?.path && process.env.OPENAI_API_KEY) {
      const creditCost = req.aiCreditsReserved || 0;
      const companyId = req.aiCreditsCompanyId || req.companyId;
      extractAssetsInBackground(job._id, req.file.path, companyId, creditCost).catch(err => {
        console.error('Background asset extraction error:', err.message);
      });
    }
  } catch (err) {
    console.error('Error creating job:', err);
    console.error('Error stack:', err.stack);
    // If it's a Mongoose validation error, provide more details
    if (err.name === 'ValidationError') {
      const validationErrors = Object.keys(err.errors).map(key => ({
        field: key,
        message: err.errors[key].message
      }));
      console.error('Validation errors:', validationErrors);
      return res.status(400).json({ error: 'Validation failed', details: validationErrors });
    }
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Background function to extract assets from job package PDF
// companyId + creditCost are passed so credits can be refunded on failure
async function extractAssetsInBackground(jobId, pdfPath, companyId = null, creditCost = 0) {
  const startTime = Date.now();
  console.log('Starting background asset extraction for job:', jobId);
  console.log('PDF path:', pdfPath);
  console.log('PDF exists:', fs.existsSync(pdfPath));
  
  try {
    let job = await Job.findById(jobId);
    if (!job) {
      console.log('Job not found for asset extraction:', jobId);
      return;
    }
    
    // Check if extraction is available
    const extractor = getPdfImageExtractor();
    console.log('Extraction available:', extractor.isExtractionAvailable());
    
    if (!extractor.isExtractionAvailable()) {
      console.error('PDF extraction not available - canvas libraries may not be loaded');
      // Mark extraction as complete (failed) so clients don't hang
      // Don't set aiExtractionStarted since extraction never actually started
      job.aiExtractionComplete = true;
      job.aiExtractionEnded = new Date();
      job.aiProcessingTimeMs = 0;
      await job.save();
      return;
    }
    
    // Track extraction start time
    job.aiExtractionStarted = new Date();
    await job.save(); // Save so clients can see extraction started
    
    // Use the extractAllAssets helper function (lazy loaded)
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const uploadsDir = path.join(__dirname, 'uploads');
    
    const extractedAssets = await extractor.extractAllAssets(pdfPath, jobId, uploadsDir, openai);
    console.log('Extracted assets:', {
      photos: extractedAssets.photos?.length || 0,
      drawings: extractedAssets.drawings?.length || 0,
      maps: extractedAssets.maps?.length || 0,
      tcpMaps: extractedAssets.tcpMaps?.length || 0
    });
    
    // Upload extracted assets to R2 and update URLs
    async function uploadAssetsToR2(assets, folder) {
      const uploaded = [];
      for (const asset of assets) {
        let url = `/uploads/job_${jobId}/${folder}/${asset.name}`;
        let r2Key = null;
        if (r2Storage.isR2Configured() && asset.path && fs.existsSync(asset.path)) {
          try {
            const result = await r2Storage.uploadJobFile(asset.path, jobId, folder, asset.name);
            url = r2Storage.getPublicUrl(result.key);
            r2Key = result.key;
            fs.unlinkSync(asset.path);
          } catch (err) {
            console.error(`Failed to upload ${asset.name}:`, err.message);
          }
        }
        // Don't include stale local path when using R2
        const { path: _localPath, ...assetWithoutPath } = asset;
        uploaded.push({ ...assetWithoutPath, url, r2Key });
      }
      return uploaded;
    }
    
    extractedAssets.photos = await uploadAssetsToR2(extractedAssets.photos || [], 'photos');
    extractedAssets.drawings = await uploadAssetsToR2(extractedAssets.drawings || [], 'drawings');
    extractedAssets.maps = await uploadAssetsToR2(extractedAssets.maps || [], 'maps');
    extractedAssets.tcpMaps = await uploadAssetsToR2(extractedAssets.tcpMaps || [], 'tcp_maps');
    
    // Update job with extracted assets
    const aciFolder = job.folders.find(f => f.name === 'ACI');
    if (aciFolder) {
      const preFieldFolder = aciFolder.subfolders.find(sf => sf.name === 'Pre-Field Documents');
      if (preFieldFolder) {
        // Ensure nested subfolders exist
        if (!preFieldFolder.subfolders) preFieldFolder.subfolders = [];
        
        // Find or create Job Photos subfolder
        let jobPhotosFolder = preFieldFolder.subfolders.find(sf => sf.name === 'Job Photos');
        if (!jobPhotosFolder) {
          jobPhotosFolder = { name: 'Job Photos', documents: [], subfolders: [] };
          preFieldFolder.subfolders.push(jobPhotosFolder);
        }
        
        // Find or create Construction Sketches subfolder
        let drawingsFolder = preFieldFolder.subfolders.find(sf => sf.name === 'Construction Sketches');
        if (!drawingsFolder) {
          drawingsFolder = { name: 'Construction Sketches', documents: [], subfolders: [] };
          preFieldFolder.subfolders.push(drawingsFolder);
        }
        
        // Find or create Circuit Maps subfolder
        let mapsFolder = preFieldFolder.subfolders.find(sf => sf.name === 'Circuit Maps');
        if (!mapsFolder) {
          mapsFolder = { name: 'Circuit Maps', documents: [], subfolders: [] };
          preFieldFolder.subfolders.push(mapsFolder);
        }
        
        // Add extracted photos
        extractedAssets.photos.forEach(photo => {
          const doc = {
            name: photo.name,
            url: photo.url,
            type: 'image',
            extractedFrom: path.basename(pdfPath),
            uploadDate: new Date()
          };
          if (photo.r2Key) doc.r2Key = photo.r2Key;
          if (photo.path) doc.path = photo.path;
          jobPhotosFolder.documents.push(doc);
        });
        
        // Add extracted drawings
        extractedAssets.drawings.forEach(drawing => {
          const doc = {
            name: drawing.name,
            url: drawing.url,
            type: 'drawing',
            pageNumber: drawing.pageNumber,
            extractedFrom: path.basename(pdfPath),
            uploadDate: new Date()
          };
          if (drawing.r2Key) doc.r2Key = drawing.r2Key;
          if (drawing.path) doc.path = drawing.path;
          drawingsFolder.documents.push(doc);
        });
        
        // Add extracted maps
        extractedAssets.maps.forEach(map => {
          const doc = {
            name: map.name,
            url: map.url,
            type: 'map',
            pageNumber: map.pageNumber,
            extractedFrom: path.basename(pdfPath),
            uploadDate: new Date()
          };
          if (map.r2Key) doc.r2Key = map.r2Key;
          if (map.path) doc.path = map.path;
          mapsFolder.documents.push(doc);
        });
      }
    }
    
    // Add TCP Maps to UTCS folder structure
    if (extractedAssets.tcpMaps && extractedAssets.tcpMaps.length > 0) {
      const utcsFolder = job.folders.find(f => f.name === 'UTCS');
      if (utcsFolder) {
        // Find or create TCP subfolder
        let tcpFolder = utcsFolder.subfolders.find(sf => sf.name === 'TCP');
        if (!tcpFolder) {
          tcpFolder = { name: 'TCP', documents: [], subfolders: [{ name: 'TCP Maps', documents: [] }] };
          utcsFolder.subfolders.push(tcpFolder);
        }
        
        // Ensure TCP Maps subfolder exists
        if (!tcpFolder.subfolders) tcpFolder.subfolders = [];
        let tcpMapsFolder = tcpFolder.subfolders.find(sf => sf.name === 'TCP Maps');
        if (!tcpMapsFolder) {
          tcpMapsFolder = { name: 'TCP Maps', documents: [] };
          tcpFolder.subfolders.push(tcpMapsFolder);
        }
        
        // Add extracted TCP maps
        extractedAssets.tcpMaps.forEach(tcpMap => {
          const doc = {
            name: tcpMap.name,
            url: tcpMap.url,
            type: 'map',
            category: 'TCP_MAP',
            pageNumber: tcpMap.pageNumber,
            extractedFrom: path.basename(pdfPath),
            uploadDate: new Date()
          };
          if (tcpMap.r2Key) doc.r2Key = tcpMap.r2Key;
          tcpMapsFolder.documents.push(doc);
        });
        
        console.log(`Added ${extractedAssets.tcpMaps.length} TCP maps to UTCS/TCP/TCP Maps`);
      }
    }
    
    job.aiExtractionComplete = true;
    job.aiExtractionEnded = new Date();
    job.aiProcessingTimeMs = Date.now() - startTime;
    console.log(`AI extraction completed in ${(job.aiProcessingTimeMs / 1000).toFixed(1)}s`);
    
    job.aiExtractedAssets = [
      ...extractedAssets.photos.map(p => ({ type: 'photo', name: p.name, url: p.url, extractedAt: new Date() })),
      ...extractedAssets.drawings.map(d => ({ type: 'drawing', name: d.name, url: d.url, extractedAt: new Date() })),
      ...extractedAssets.maps.map(m => ({ type: 'map', name: m.name, url: m.url, extractedAt: new Date() })),
      ...(extractedAssets.tcpMaps || []).map(t => ({ type: 'tcp_map', name: t.name, url: t.url, extractedAt: new Date() }))
    ];
    
    // Store construction sketches for quick access in job details header
    const pdfBasename = path.basename(pdfPath);
    if (extractedAssets.drawings && extractedAssets.drawings.length > 0) {
      job.constructionSketches = extractedAssets.drawings.map(drawing => ({
        pageNumber: drawing.pageNumber,
        url: drawing.url,
        r2Key: drawing.r2Key || null,
        name: drawing.name,
        extractedFrom: pdfBasename,
        extractedAt: new Date()
      }));
      console.log(`Stored ${job.constructionSketches.length} construction sketches for quick access`);
    }
    
    // Remove extracted photo pages from the job package PDF (clean as-built)
    const photoPageNumbers = extractedAssets.photos
      .map(p => p.pageNumber)
      .filter(pn => typeof pn === 'number');
    
    if (photoPageNumbers.length > 0 && fs.existsSync(pdfPath)) {
      try {
        console.log(`Removing ${photoPageNumbers.length} photo pages from job package: pages ${photoPageNumbers.join(', ')}`);
        const { PDFDocument } = require('pdf-lib');
        const originalPdfBytes = fs.readFileSync(pdfPath);
        const originalPdf = await PDFDocument.load(originalPdfBytes);
        const totalPages = originalPdf.getPageCount();
        
        // Create a set of pages to remove (1-indexed in our data, 0-indexed in pdf-lib)
        const pagesToRemove = new Set(photoPageNumbers);
        
        // Create new PDF with only non-photo pages
        const cleanedPdf = await PDFDocument.create();
        for (let i = 0; i < totalPages; i++) {
          const pageNum = i + 1; // Convert to 1-indexed
          if (!pagesToRemove.has(pageNum)) {
            const [copiedPage] = await cleanedPdf.copyPages(originalPdf, [i]);
            cleanedPdf.addPage(copiedPage);
          }
        }
        
        const cleanedPagesCount = cleanedPdf.getPageCount();
        console.log(`Cleaned PDF: ${cleanedPagesCount} pages (removed ${totalPages - cleanedPagesCount} photo pages)`);
        
        // Only save if we have pages remaining
        if (cleanedPagesCount > 0) {
          const cleanedPdfBytes = await cleanedPdf.save();
          const cleanedPdfPath = pdfPath.replace('.pdf', '_cleaned.pdf');
          fs.writeFileSync(cleanedPdfPath, cleanedPdfBytes);
          
          // Update the Field As Built document with the cleaned PDF
          const aciForClean = job.folders.find(f => f.name === 'ACI');
          const fieldAsBuiltFolder = aciForClean?.subfolders?.find(sf => sf.name === 'Field As Built');
          
          if (fieldAsBuiltFolder && fieldAsBuiltFolder.documents.length > 0) {
            // Find the original job package document
            const originalDoc = fieldAsBuiltFolder.documents.find(d => 
              d.path === pdfPath || d.name.toLowerCase().includes('job package')
            ) || fieldAsBuiltFolder.documents[0];
            
            if (originalDoc) {
              // Upload cleaned PDF to R2 if configured
              if (r2Storage.isR2Configured()) {
                try {
                  const cleanedName = originalDoc.name.replace('.pdf', '_cleaned.pdf');
                  const result = await r2Storage.uploadJobFile(cleanedPdfPath, jobId, 'as_built', cleanedName);
                  const cleanedUrl = r2Storage.getPublicUrl(result.key);
                  
                  // Update the document reference
                  originalDoc.url = cleanedUrl;
                  originalDoc.r2Key = result.key;
                  originalDoc.name = cleanedName;
                  originalDoc.photoPagesRemoved = photoPageNumbers.length;
                  originalDoc.cleanedAt = new Date();
                  
                  console.log(`Updated job package with cleaned PDF: ${cleanedName}`);
                  
                  // Clean up local files
                  fs.unlinkSync(cleanedPdfPath);
                } catch (r2Err) {
                  console.error('Failed to upload cleaned PDF to R2:', r2Err.message);
                }
              } else {
                // Local storage - replace the file
                fs.renameSync(cleanedPdfPath, pdfPath);
                originalDoc.photoPagesRemoved = photoPageNumbers.length;
                originalDoc.cleanedAt = new Date();
              }
            }
          }
        }
      } catch (cleanErr) {
        console.error('Error creating cleaned PDF (non-fatal):', cleanErr.message);
        // Don't fail the whole extraction if cleaning fails
      }
    }
    
    // Log folder structure before saving
    const aciCheck = job.folders.find(f => f.name === 'ACI');
    const preFieldCheck = aciCheck?.subfolders?.find(sf => sf.name === 'Pre-Field Documents');
    const jobPhotosCheck = preFieldCheck?.subfolders?.find(sf => sf.name === 'Job Photos');
    console.log('Folder structure before save:', {
      hasACI: !!aciCheck,
      hasPreField: !!preFieldCheck,
      hasJobPhotos: !!jobPhotosCheck,
      jobPhotosDocCount: jobPhotosCheck?.documents?.length || 0,
      firstPhotoUrl: jobPhotosCheck?.documents?.[0]?.url
    });
    
    // Mark folders as modified and save with retry for version conflicts
    job.markModified('folders');
    job.markModified('aiExtractedAssets');
    
    let retries = 3;
    while (retries > 0) {
      try {
    await job.save();
        break; // Success - exit loop
      } catch (saveErr) {
        if (saveErr.name === 'VersionError' && retries > 1) {
          retries--; // Decrement retries counter after check
          console.log(`Version conflict in background extraction for job ${jobId}, ${retries} retries left...`);
          // Refresh job document and try again
          const refreshedJob = await Job.findById(jobId);
          if (refreshedJob) {
            refreshedJob.aiExtractionComplete = true;
            refreshedJob.aiExtractionEnded = new Date();
            refreshedJob.aiProcessingTimeMs = Date.now() - startTime;
            refreshedJob.aiExtractedAssets = job.aiExtractedAssets;
            refreshedJob.markModified('aiExtractedAssets');
            job = refreshedJob; // Update reference for next iteration
          }
          // Continue to next iteration
        } else if (saveErr.name === 'VersionError') {
          // Last retry - use atomic update as fallback
          console.log('Final retry failed, using atomic update for extraction metadata');
          await Job.findByIdAndUpdate(jobId, {
            $set: {
              aiExtractionComplete: true,
              aiExtractionEnded: new Date(),
              aiProcessingTimeMs: Date.now() - startTime,
              aiExtractedAssets: job.aiExtractedAssets
            }
          });
          break;
        } else {
          throw saveErr; // Non-version error, rethrow
        }
      }
    }
    
    console.log('Background asset extraction complete for job:', jobId, {
      photos: extractedAssets.photos.length,
      drawings: extractedAssets.drawings.length,
      maps: extractedAssets.maps.length,
      tcpMaps: extractedAssets.tcpMaps?.length || 0
    });
    
    // Clean up local PDF file after extraction is complete
    if (fs.existsSync(pdfPath)) {
      try {
        fs.unlinkSync(pdfPath);
        console.log('Cleaned up local PDF:', pdfPath);
      } catch (cleanupErr) {
        console.warn('Failed to cleanup local PDF:', cleanupErr.message);
      }
    }
    
  } catch (err) {
    console.error('Background asset extraction failed:', err);
    
    // Refund AI credits — background extraction failed
    if (companyId && creditCost > 0) {
      try {
        await Company.findOneAndUpdate(
          { _id: companyId },
          { $inc: { 'subscription.aiCreditsUsed': -creditCost } }
        );
        console.log(`Refunded ${creditCost} AI credits to company ${companyId} after bg extraction failure`);
      } catch (refundErr) {
        console.error('CRITICAL: AI credit refund failed for background extraction:', refundErr.message);
      }
    }
    
    // Mark extraction as complete (with failure) so clients don't hang
    try {
      await Job.findByIdAndUpdate(jobId, {
        aiExtractionComplete: true,
        aiExtractionEnded: new Date(),
        aiProcessingTimeMs: Date.now() - startTime
      });
      console.log('Marked job extraction as complete (failed) for:', jobId);
    } catch (updateErr) {
      console.error('Failed to update job after extraction error:', updateErr.message);
    }
    
    // Still try to clean up local file on error
    if (fs.existsSync(pdfPath)) {
      try {
        fs.unlinkSync(pdfPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

// Search jobs by PM number - MUST be before /api/jobs/:id to prevent route shadowing
router.get('/search/:pmNumber', async (req, res) => {
  try {
    const { pmNumber } = req.params;
    
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // ============================================
    const user = await User.findById(req.userId).select('companyId');
    
    const query = {
      $or: [
        { pmNumber: { $regex: pmNumber, $options: 'i' } },
        { woNumber: { $regex: pmNumber, $options: 'i' } },
        { notificationNumber: { $regex: pmNumber, $options: 'i' } }
      ]
    };
    
    // CRITICAL: Only search within user's company
    if (user?.companyId) {
      query.companyId = user.companyId;
    } else {
      query.userId = req.userId; // No company = only own jobs
    }
    
    const jobs = await Job.find(query);
    res.json(jobs);
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    // Sanitize user input before logging to prevent log injection
    const safeJobId = String(req.params.id || '').slice(0, 50).replace(/[\n\r\t]/g, '');
    console.log('Getting job by ID:', safeJobId);
    console.log('User ID from token:', req.userId, 'isAdmin:', req.isAdmin);

    // ============================================
    // MULTI-TENANT SECURITY: Get user's company
    // ============================================
    const currentUser = await User.findById(req.userId).select('companyId');
    const userCompanyId = currentUser?.companyId;
    
    // CRITICAL: Reject access if user has no company assignment
    // This prevents admins without a company from accessing any job
    if (!userCompanyId) {
      console.log('Access denied: User has no company assignment');
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Build query - ALWAYS filter by company
    const query = { _id: req.params.id, companyId: userCompanyId };
    
    // Non-admins also need ownership/assignment check within their company
    if (!req.isAdmin) {
      query.$or = [
        { userId: req.userId },
        { assignedTo: req.userId }
      ];
    }
    // Admins can view any job BUT only within their own company

    const job = await Job.findOne(query)
      .populate('assignedTo', 'name email')
      .populate('assignedBy', 'name email');
    console.log('Job found:', !!job, 'Query companyId:', userCompanyId);

    if (!job) {
      console.log('Job not found for user or not in their company');
      return res.status(404).json({ error: 'Job not found' });
    }

    console.log('Returning job data');
    res.json(job);
  } catch (err) {
    console.error('Error getting job by ID:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Save edited PDF to job folder - saves as DRAFT pending approval
// Format: DRAFT_[PM#]_[DocumentName]_[timestamp].pdf
// Final approved format: [PM#]_[DocumentName].pdf
router.post('/:id/save-edited-pdf', async (req, res) => {
  try {
    const { id } = req.params;
    const { pdfData, originalName, folderName, subfolderName } = req.body;
    
    console.log('Save edited PDF request:', { id, originalName, folderName, subfolderName, pdfDataLength: pdfData?.length });
    
    // Validate request body
    if (!pdfData) {
      return res.status(400).json({ error: 'No PDF data provided' });
    }
    if (!originalName) {
      return res.status(400).json({ error: 'No original filename provided' });
    }
    
    // Allow job creator, assigned user, GF, or admin to save edits
    const user = await User.findById(req.userId);
    const isAdminOrManager = user && (user.isAdmin || ['gf', 'pm', 'admin'].includes(user.role));
    
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // ============================================
    const query = { 
      _id: id,
      $or: [
        { userId: req.userId },
        { assignedTo: req.userId },
        { assignedToGF: req.userId }
      ]
    };
    
    // CRITICAL: Always add company filter
    if (user?.companyId) {
      query.companyId = user.companyId;
    }
    
    let job = await Job.findOne(query);
    
    // If not found by assignment, admins/managers can still access (but only in their company)
    if (!job && isAdminOrManager) {
      const adminQuery = { _id: id };
      if (user?.companyId) {
        adminQuery.companyId = user.companyId;
      }
      job = await Job.findOne(adminQuery);
    }
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found or not authorized' });
    }
    
    const jobToUpdate = job || await Job.findById(id);
    if (!jobToUpdate) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Decode base64 PDF data
    const pdfBuffer = Buffer.from(pdfData, 'base64');
    
    // Generate proper filename
    const pmNumber = jobToUpdate.pmNumber || 'NOPM';
    
    // Clean up original name - keep it readable but remove .pdf extension
    let docName = originalName
      .replace(/\.pdf$/i, '')
      .replace(/[^a-zA-Z0-9\s\-_]/g, '') // Remove special chars except spaces, dashes, underscores
      .trim()
      .replace(/\s+/g, '_'); // Replace spaces with underscores
    
    // If docName is empty or too generic, use a default
    if (!docName || docName.length < 3) {
      docName = 'FilledForm';
    }
    
    // Check if user can approve (GF, PM, Admin) - their saves are auto-approved
    // (user already fetched above)
    const canAutoApprove = user && (user.canApprove || user.isAdmin || ['gf', 'pm', 'admin'].includes(user.role));
    
    // Add timestamp to ensure cache busting when same doc is edited multiple times
    const timestamp = Date.now();
    
    // DRAFT filename for non-approvers, final filename for approvers
    const draftFilename = `DRAFT_${pmNumber}_${docName}_${timestamp}.pdf`;
    const finalFilename = `${pmNumber}_${docName}.pdf`;
    const newFilename = canAutoApprove ? finalFilename : draftFilename;
    
    let uploadsLocalDir = path.join(__dirname, 'uploads');
    
    // Ensure uploads directory exists (fallback to /tmp in containers)
    try {
      if (!fs.existsSync(uploadsLocalDir)) {
        fs.mkdirSync(uploadsLocalDir, { recursive: true });
      }
    } catch (err) {
      console.warn('Could not create uploads dir, using /tmp:', err.message);
      uploadsLocalDir = '/tmp/uploads';
      if (!fs.existsSync(uploadsLocalDir)) {
        fs.mkdirSync(uploadsLocalDir, { recursive: true });
      }
    }
    
    const filePath = path.join(uploadsLocalDir, newFilename);
    
    // Save the file
    fs.writeFileSync(filePath, pdfBuffer);
    
    let docUrl = `/uploads/${newFilename}`;
    let r2Key = null;
    
    // Upload to R2 if configured - always to Close Out Documents folder
    if (r2Storage.isR2Configured()) {
      try {
        // All edited documents go to ACI/Close Out Documents for submission
        const closeOutFolderPath = 'ACI/Close Out Documents';
        const result = await r2Storage.uploadJobFile(filePath, id, closeOutFolderPath, newFilename);
        docUrl = r2Storage.getPublicUrl(result.key);
        r2Key = result.key;
        // Clean up local file
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (uploadErr) {
        console.error('Failed to upload edited PDF to R2:', uploadErr.message);
      }
    }
    
    // Always save edited documents to ACI > Close Out Documents for submission
    // This ensures all completed/filled forms are collected in one place for closeout
    const aciFolder = jobToUpdate.folders.find(f => f.name === 'ACI');
    if (aciFolder) {
      // Ensure subfolders array exists
      if (!aciFolder.subfolders) {
        aciFolder.subfolders = [];
      }
      
      // Find or create the Close Out Documents subfolder
      let closeOutFolder = aciFolder.subfolders.find(sf => sf.name === 'Close Out Documents');
      if (!closeOutFolder) {
        closeOutFolder = { name: 'Close Out Documents', documents: [], subfolders: [] };
        aciFolder.subfolders.push(closeOutFolder);
      }
      
      // Ensure documents array exists
      if (!closeOutFolder.documents) {
        closeOutFolder.documents = [];
      }
      
      // =========================================================================
      // REPLACE OLD FILLED VERSION: If same document (by base name) exists in 
      // Close Out folder, remove the OLD FILLED copy and replace with new one.
      // 
      // IMPORTANT: We NEVER delete the original blank template from its source
      // folder (Pre-Field Documents, General Forms, etc.). That stays available
      // for future use. We only manage filled copies here in Close Out.
      // =========================================================================
      const baseDocPattern = `${pmNumber}_${docName}`;
      const existingDocIndex = closeOutFolder.documents.findIndex(doc => {
        // Never match templates - only match previously filled copies
        if (doc.isTemplate) return false;
        
        // Match by finalName field (canonical name without DRAFT prefix or timestamp)
        if (doc.finalName === finalFilename) return true;
        // Also match by base pattern in the name (for legacy docs)
        const docBaseName = doc.name?.replace(/^DRAFT_/, '').replace(/_\d{13}\.pdf$/, '.pdf');
        return docBaseName === finalFilename || doc.name?.startsWith(baseDocPattern);
      });
      
      if (existingDocIndex !== -1) {
        const oldDoc = closeOutFolder.documents[existingDocIndex];
        console.log(`Replacing existing FILLED document in Close Out: ${oldDoc.name} -> ${newFilename}`);
        
        // Delete old FILLED file from R2 storage if it exists
        // (This is the previously filled version, NOT the original template)
        if (oldDoc.r2Key && r2Storage.isR2Configured()) {
          try {
            await r2Storage.deleteFile(oldDoc.r2Key);
            console.log(`Deleted old filled R2 file: ${oldDoc.r2Key}`);
          } catch (delErr) {
            console.warn(`Failed to delete old R2 file ${oldDoc.r2Key}:`, delErr.message);
          }
        }
        
        // Remove old filled document from array
        closeOutFolder.documents.splice(existingDocIndex, 1);
      }
      
      // NOTE: The original blank template remains in its source folder
      // (e.g., Pre-Field Documents, General Forms) and is NOT affected.
      // This ensures a blank form is always available for future jobs.
      
      // Add the new/updated FILLED document (copy, not template)
      const existingVersion = existingDocIndex !== -1 ? closeOutFolder.documents[existingDocIndex] : null;
      closeOutFolder.documents.push({
        name: newFilename,
        url: docUrl,
        r2Key: r2Key,
        type: 'filled_pdf', // Distinguish from 'template' type
        isTemplate: false,  // This is a FILLED copy, not the original blank
        isFilled: true,     // Explicit flag that this is a completed form
        isCompleted: canAutoApprove,
        completedDate: canAutoApprove ? new Date() : null,
        completedBy: canAutoApprove ? req.userId : null,
        uploadDate: new Date(),
        uploadedBy: req.userId,
        // Approval workflow fields
        approvalStatus: canAutoApprove ? 'approved' : 'pending_approval',
        draftName: canAutoApprove ? null : draftFilename,
        finalName: finalFilename,
        approvedBy: canAutoApprove ? req.userId : null,
        approvedDate: canAutoApprove ? new Date() : null,
        // Track source location (where the blank template lives)
        sourceFolder: folderName,
        sourceSubfolder: subfolderName || null,
        sourceTemplateName: originalName, // Original blank template name
        // Version tracking for re-edits
        version: existingVersion ? (existingVersion.version || 1) + 1 : 1,
        previousVersion: existingVersion?.name || null
      });
    }
    
    await jobToUpdate.save();
    
    const statusMsg = canAutoApprove ? 'approved' : 'pending approval';
    console.log(`Edited PDF saved to Close Out Documents (${statusMsg}):`, newFilename);
    res.json({ 
      message: `PDF saved to Close Out Documents (${statusMsg})`, 
      filename: newFilename,
      url: docUrl,
      folder: 'ACI/Close Out Documents',
      approvalStatus: canAutoApprove ? 'approved' : 'pending_approval',
      needsApproval: !canAutoApprove
    });
  } catch (err) {
    console.error('Error saving edited PDF:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to save PDF', details: err.message });
  }
});

// Approve a draft document (GF, PM, Admin only)
// Renames from DRAFT_xxx.pdf to final PG&E format
router.post('/:jobId/documents/:docId/approve', async (req, res) => {
  try {
    const { jobId, docId } = req.params;
    
    // Check if user can approve
    const user = await User.findById(req.userId);
    const canApprove = user && (user.canApprove || user.isAdmin || ['gf', 'pm', 'admin'].includes(user.role));
    
    if (!canApprove) {
      return res.status(403).json({ error: 'You do not have permission to approve documents' });
    }
    
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // ============================================
    const query = { _id: jobId };
    if (user?.companyId) {
      query.companyId = user.companyId;
    }
    
    const job = await Job.findOne(query);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Find the document in any folder/subfolder
    let foundDoc = null;
    let _foundFolder = null;
    let _foundSubfolder = null;
    
    for (const folder of job.folders) {
      // Check folder documents
      const docInFolder = folder.documents.find(d => d._id.toString() === docId);
      if (docInFolder) {
        foundDoc = docInFolder;
        _foundFolder = folder;
        break;
      }
      
      // Check subfolders
      for (const subfolder of folder.subfolders || []) {
        const docInSubfolder = subfolder.documents.find(d => d._id.toString() === docId);
        if (docInSubfolder) {
          foundDoc = docInSubfolder;
          _foundFolder = folder;
          _foundSubfolder = subfolder;
          break;
        }
        
        // Check nested subfolders
        for (const nestedSubfolder of subfolder.subfolders || []) {
          const docInNested = nestedSubfolder.documents.find(d => d._id.toString() === docId);
          if (docInNested) {
            foundDoc = docInNested;
            _foundFolder = folder;
            _foundSubfolder = nestedSubfolder;
            break;
          }
        }
        if (foundDoc) break;
      }
      if (foundDoc) break;
    }
    
    if (!foundDoc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    if (foundDoc.approvalStatus === 'approved') {
      return res.status(400).json({ error: 'Document is already approved' });
    }
    
    // Rename file in R2 from DRAFT to final name
    const finalName = foundDoc.finalName || foundDoc.name.replace(/^DRAFT_/, '').replace(/_\d{13}\.pdf$/, '.pdf');
    
    if (r2Storage.isR2Configured() && foundDoc.r2Key) {
      try {
        // Get the old file
        const oldKey = foundDoc.r2Key;
        const newKey = oldKey.replace(foundDoc.name, finalName);
        
        // Copy to new key and delete old
        await r2Storage.copyFile(oldKey, newKey);
        await r2Storage.deleteFile(oldKey);
        
        foundDoc.r2Key = newKey;
        foundDoc.url = r2Storage.getPublicUrl(newKey);
      } catch (renameErr) {
        console.error('Failed to rename file in R2:', renameErr.message);
        // Continue anyway - update the database even if rename fails
      }
    }
    
    // Update document status
    foundDoc.name = finalName;
    foundDoc.approvalStatus = 'approved';
    foundDoc.approvedBy = req.userId;
    foundDoc.approvedDate = new Date();
    foundDoc.isCompleted = true;
    foundDoc.completedDate = new Date();
    foundDoc.completedBy = req.userId;
    
    await job.save();
    
    console.log(`Document approved: ${finalName} by user ${req.userId}`);
    res.json({ 
      message: 'Document approved successfully',
      document: {
        id: foundDoc._id,
        name: finalName,
        url: foundDoc.url,
        approvalStatus: 'approved'
      }
    });
  } catch (err) {
    console.error('Error approving document:', err);
    res.status(500).json({ error: 'Failed to approve document', details: err.message });
  }
});

// Reject a draft document (GF, PM, Admin only)
router.post('/:jobId/documents/:docId/reject', async (req, res) => {
  try {
    const { jobId, docId } = req.params;
    const { reason } = req.body;
    
    // Check if user can approve/reject
    const user = await User.findById(req.userId);
    const canApprove = user && (user.canApprove || user.isAdmin || ['gf', 'pm', 'admin'].includes(user.role));
    
    if (!canApprove) {
      return res.status(403).json({ error: 'You do not have permission to reject documents' });
    }
    
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // ============================================
    const query = { _id: jobId };
    if (user?.companyId) {
      query.companyId = user.companyId;
    }
    
    const job = await Job.findOne(query);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Find the document (same logic as approve)
    let foundDoc = null;
    for (const folder of job.folders) {
      const docInFolder = folder.documents.find(d => d._id.toString() === docId);
      if (docInFolder) { foundDoc = docInFolder; break; }
      
      for (const subfolder of folder.subfolders || []) {
        const docInSubfolder = subfolder.documents.find(d => d._id.toString() === docId);
        if (docInSubfolder) { foundDoc = docInSubfolder; break; }
      }
      if (foundDoc) break;
    }
    
    if (!foundDoc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // Update document status
    foundDoc.approvalStatus = 'rejected';
    foundDoc.rejectionReason = reason || 'No reason provided';
    
    await job.save();
    
    console.log(`Document rejected: ${foundDoc.name} by user ${req.userId}`);
    res.json({ 
      message: 'Document rejected',
      document: {
        id: foundDoc._id,
        name: foundDoc.name,
        approvalStatus: 'rejected',
        rejectionReason: foundDoc.rejectionReason
      }
    });
  } catch (err) {
    console.error('Error rejecting document:', err);
    res.status(500).json({ error: 'Failed to reject document', details: err.message });
  }
});

// Get all documents pending approval (Admin dashboard)

module.exports = router;
