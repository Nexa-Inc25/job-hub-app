require('dotenv').config();

console.log('=== Server starting ===');
console.log('Node version:', process.version);
console.log('Memory usage:', Math.round(process.memoryUsage().heapUsed / 1024 / 1024), 'MB');

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
const Job = require('./models/Job');
const apiRoutes = require('./routes/api');
const r2Storage = require('./utils/storage');
const OpenAI = require('openai');

console.log('All modules loaded, memory:', Math.round(process.memoryUsage().heapUsed / 1024 / 1024), 'MB');

// Lazy load heavy PDF modules only when needed
let pdfImageExtractor = null;
let pdfUtils = null;
function getPdfImageExtractor() {
  if (!pdfImageExtractor) {
    pdfImageExtractor = require('./utils/pdfImageExtractor');
  }
  return pdfImageExtractor;
}
function getPdfUtils() {
  if (!pdfUtils) {
    pdfUtils = require('./utils/pdfUtils');
  }
  return pdfUtils;
}

// Log R2 configuration status
console.log('R2 Storage configured:', r2Storage.isR2Configured());

const app = express();
const server = http.createServer(app);

// Production CORS - allow frontend URL from env or localhost for dev
const allowedOrigins = [
  'http://localhost:3000',
  process.env.FRONTEND_URL
].filter(Boolean);

console.log('Allowed CORS origins:', allowedOrigins);

const io = socketIo(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  }
});

// Simple CORS - allow all origins for now (can restrict later)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  console.log('CORS middleware - Origin:', origin, 'Method:', req.method);
  
  // Allow the requesting origin
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS preflight request');
    return res.status(204).end();
  }
  
  next();
});

// Health check endpoint for Railway
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    r2: r2Storage.isR2Configured() ? 'configured' : 'not configured'
  });
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('Created uploads directory:', uploadsDir);
}

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected successfully'))
  .catch(err => console.error('MongoDB connection failed:', err));

// Authentication Middleware
const authenticateUser = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    req.isAdmin = decoded.isAdmin || false;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Admin-only middleware
const requireAdmin = (req, res, next) => {
  console.log('requireAdmin check - userId:', req.userId, 'isAdmin:', req.isAdmin);
  if (!req.isAdmin) {
    console.log('Admin access denied for user:', req.userId);
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Signup Endpoint
app.post('/api/signup', async (req, res) => {
  try {
    // Check database connection first
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: 'Database unavailable. Please try again later.' });
    }
    
    const { email, password, name } = req.body;
    console.log('Signup attempt for:', email);
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }
    const user = new User({ email, password, name: name || email.split('@')[0] });
    await user.save();
    const token = jwt.sign({ userId: user._id, isAdmin: user.isAdmin || false }, process.env.JWT_SECRET, { expiresIn: '24h' });
    console.log('User created successfully:', user._id);
    res.status(201).json({ token, userId: user._id, isAdmin: user.isAdmin || false });
  } catch (err) {
    console.error('Signup error:', err.message);
    res.status(500).json({ error: 'Server error during signup', details: err.message });
  }
});

// Login Endpoint
app.post('/api/login', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: 'Database unavailable. Please try again later.' });
    }

    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ userId: user._id, isAdmin: user.isAdmin }, process.env.JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, userId: user._id, isAdmin: user.isAdmin, role: user.role, name: user.name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Admin: Upload master template forms (PG&E forms, etc.) - MUST be before /api/jobs middleware
app.post('/api/admin/templates', authenticateUser, requireAdmin, upload.array('templates', 20), async (req, res) => {
  try {
    console.log('=== Template Upload Request ===');
    console.log('User:', req.userId, 'isAdmin:', req.isAdmin);
    console.log('R2 configured:', r2Storage.isR2Configured());
    console.log('Files received:', req.files?.length || 0);
    console.log('File names:', req.files?.map(f => f.originalname));
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    
    const uploaded = [];
    
    // Upload to R2 if configured, otherwise local
    if (r2Storage.isR2Configured()) {
      console.log('Uploading to R2...');
      for (const file of req.files) {
        try {
          console.log(`Uploading ${file.originalname} to R2...`);
          const result = await r2Storage.uploadTemplate(file.path, file.originalname);
          console.log(`Upload result for ${file.originalname}:`, result);
          uploaded.push({
            name: file.originalname,
            url: result.key,
            r2Key: result.key
          });
          // Clean up local temp file
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (uploadErr) {
          console.error(`Error uploading ${file.originalname}:`, uploadErr);
          throw uploadErr;
        }
      }
    } else {
      console.log('R2 not configured, using local storage...');
      const templatesDir = path.join(__dirname, 'templates', 'master');
      if (!fs.existsSync(templatesDir)) {
        fs.mkdirSync(templatesDir, { recursive: true });
      }
      
      for (const file of req.files) {
        const destPath = path.join(templatesDir, file.originalname);
        fs.renameSync(file.path, destPath);
        uploaded.push({
          name: file.originalname,
          path: destPath,
          url: `/templates/master/${encodeURIComponent(file.originalname)}`
        });
      }
    }
    
    console.log('Templates uploaded successfully:', uploaded.map(u => u.name));
    res.json({ message: 'Templates uploaded successfully', templates: uploaded });
  } catch (err) {
    console.error('Template upload error:', err.message);
    console.error('Stack:', err.stack);
    res.status(500).json({ error: 'Template upload failed: ' + err.message });
  }
});

// Get signed URL for R2 file access
app.get('/api/files/:key(*)', authenticateUser, async (req, res) => {
  try {
    const fileKey = req.params.key;
    
    if (r2Storage.isR2Configured()) {
      const signedUrl = await r2Storage.getSignedDownloadUrl(fileKey);
      if (signedUrl) {
        return res.json({ url: signedUrl });
      }
    }
    
    // Fallback to local file
    const localPath = path.join(__dirname, 'uploads', fileKey);
    if (fs.existsSync(localPath)) {
      return res.sendFile(localPath);
    }
    
    res.status(404).json({ error: 'File not found' });
  } catch (err) {
    console.error('Error getting file:', err);
    res.status(500).json({ error: 'Failed to get file' });
  }
});

// Get list of available master templates
app.get('/api/admin/templates', authenticateUser, async (req, res) => {
  try {
    const templatesDir = path.join(__dirname, 'templates', 'master');
    if (!fs.existsSync(templatesDir)) {
      return res.json({ templates: [] });
    }
    
    const files = fs.readdirSync(templatesDir);
    const templates = files.map(f => ({
      name: f,
      url: `/templates/master/${encodeURIComponent(f)}`
    }));
    
    res.json({ templates });
  } catch (err) {
    console.error('Error listing templates:', err);
    res.status(500).json({ error: 'Failed to list templates' });
  }
});

// Mount API routes (for /api/ai/* endpoints) - must be before /api/jobs middleware
app.use('/api', authenticateUser, apiRoutes);

// ==================== USER MANAGEMENT ENDPOINTS ====================

// Get all users (for assignment dropdown) - Admin only
app.get('/api/users', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const users = await User.find({}, 'name email role isAdmin').sort({ name: 1 });
    res.json(users);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get foremen only (for assignment)
app.get('/api/users/foremen', authenticateUser, async (req, res) => {
  try {
    const foremen = await User.find(
      { $or: [{ role: 'foreman' }, { role: 'admin' }, { isAdmin: true }] },
      'name email role'
    ).sort({ name: 1 });
    res.json(foremen);
  } catch (err) {
    console.error('Error fetching foremen:', err);
    res.status(500).json({ error: 'Failed to fetch foremen' });
  }
});

// ==================== JOB ASSIGNMENT ENDPOINTS ====================

// Assign a job to a foreman (Admin/GF only)
app.put('/api/jobs/:id/assign', authenticateUser, requireAdmin, async (req, res) => {
  try {
    console.log('Assignment request:', req.params.id, req.body);
    console.log('User:', req.userId, 'isAdmin:', req.isAdmin);
    
    const { assignedTo, crewScheduledDate, crewScheduledEndDate, assignmentNotes } = req.body;
    
    const job = await Job.findById(req.params.id);
    if (!job) {
      console.log('Job not found:', req.params.id);
      return res.status(404).json({ error: 'Job not found' });
    }
    
    job.assignedTo = assignedTo || null;
    job.assignedBy = req.userId;
    job.assignedDate = new Date();
    job.crewScheduledDate = crewScheduledDate ? new Date(crewScheduledDate) : null;
    job.crewScheduledEndDate = crewScheduledEndDate ? new Date(crewScheduledEndDate) : null;
    job.assignmentNotes = assignmentNotes || '';
    
    // Update status to pre-field if being assigned
    if (assignedTo && job.status === 'pending') {
      job.status = 'pre-field';
    }
    
    await job.save();
    
    // Populate assigned user info for response
    await job.populate('assignedTo', 'name email');
    await job.populate('assignedBy', 'name email');
    
    console.log(`Job ${job.pmNumber || job._id} assigned to user ${assignedTo} for ${crewScheduledDate}`);
    res.json(job);
  } catch (err) {
    console.error('Error assigning job:', err.message);
    console.error('Stack:', err.stack);
    res.status(500).json({ error: 'Failed to assign job', details: err.message });
  }
});

// Get calendar data for a foreman (jobs assigned to them)
app.get('/api/calendar', authenticateUser, async (req, res) => {
  try {
    const { month, year, userId, viewAll } = req.query;
    
    // Build date range for the month (month is 1-indexed from frontend, JS Date uses 0-indexed)
    const targetMonth = parseInt(month || (new Date().getMonth() + 1));
    const targetYear = parseInt(year || new Date().getFullYear());
    const startDate = new Date(targetYear, targetMonth - 1, 1); // First day of month
    const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59); // Last day of month
    
    console.log('Calendar request:', { month: targetMonth, year: targetYear, viewAll, userId, isAdmin: req.isAdmin });
    console.log('Date range:', startDate.toISOString(), 'to', endDate.toISOString());
    
    // Build query
    let query = {
      crewScheduledDate: { $gte: startDate, $lte: endDate }
    };
    
    // If admin requesting viewAll, show all assigned jobs
    // If admin requesting specific user's calendar, use that userId
    // Otherwise, show jobs assigned to the current user
    if (req.isAdmin && viewAll === 'true') {
      // Admin wants to see all scheduled jobs - just filter by date
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
app.get('/api/my-assignments', authenticateUser, async (req, res) => {
  try {
    const jobs = await Job.find({ assignedTo: req.userId })
      .select('pmNumber woNumber title address client crewScheduledDate crewScheduledEndDate dueDate status priority assignmentNotes createdAt')
      .sort({ crewScheduledDate: 1 });
    
    res.json(jobs);
  } catch (err) {
    console.error('Error fetching assignments:', err);
    res.status(500).json({ error: 'Failed to fetch assignments' });
  }
});

// Protect jobs route - this applies to all /api/jobs/* routes defined below
app.use('/api/jobs', authenticateUser);

// Existing routes (protected now)
app.get('/api/jobs', async (req, res) => {
  try {
    const { search } = req.query;
    // Always filter by authenticated user for data isolation
    let query = { userId: req.userId };

    if (search) {
      // Escape regex special characters to treat search as literal string
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(escapedSearch, 'i');
      query = {
        userId: req.userId,
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
      };
    }

    const jobs = await Job.find(query).sort({ createdAt: -1 });
    res.json(jobs);
  } catch (err) {
    console.error('Error fetching jobs:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/jobs', authenticateUser, upload.single('pdf'), async (req, res) => {
  try {
    const { title, description, priority, dueDate, woNumber, address, client, pmNumber, notificationNumber, city, projectName, orderType, division, matCode } = req.body;
    const resolvedTitle = title || pmNumber || woNumber || 'Untitled Work Order';
    const resolvedDescription = description || [address, city, client].filter(Boolean).join(' | ') || '';
    
    // Create proper folder structure: WO# -> ACI/UTC -> subfolders
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
      userId: req.userId,
      status: 'pending',
      folders: [
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
                { name: 'Construction Drawings', documents: [] },
                { name: 'Circuit Maps', documents: [] }
              ]
            },
            { name: 'General Forms', documents: [] }
          ]
        },
        {
          name: 'UTC',
          documents: [],
          subfolders: [
            { name: 'Dispatch Documents', documents: [] },
            { name: 'Pre-Field Docs', documents: [] }
          ]
        }
      ]
    });
    
    // If a PDF was uploaded, add it to the Field As Built folder (the job package)
    if (req.file?.path) {
      const aciFolder = job.folders.find(f => f.name === 'ACI');
      if (aciFolder) {
        const fieldAsBuiltFolder = aciFolder.subfolders.find(sf => sf.name === 'Field As Built');
        if (fieldAsBuiltFolder) {
          fieldAsBuiltFolder.documents.push({
            name: req.file.originalname || 'Job Package.pdf',
            path: req.file.path,
            url: `/uploads/${path.basename(req.file.path)}`,
            type: 'pdf',
            uploadDate: new Date(),
            uploadedBy: req.userId
          });
        }
      }
    }
    
    // Load master templates and organize them into folders
    try {
      const masterTemplatesDir = path.join(__dirname, 'templates', 'master');
      if (fs.existsSync(masterTemplatesDir)) {
        const templateFiles = fs.readdirSync(masterTemplatesDir);
        
        // Separate CWC from other templates
        const cwcTemplate = templateFiles.find(f => f.toLowerCase().includes('cwc'));
        const generalForms = templateFiles.filter(f => !f.toLowerCase().includes('cwc'));
        
        const aciFolder = job.folders.find(f => f.name === 'ACI');
        if (aciFolder) {
          // Add CWC to Pre-Field Documents only
          const preFieldFolder = aciFolder.subfolders.find(sf => sf.name === 'Pre-Field Documents');
          if (preFieldFolder && cwcTemplate) {
            preFieldFolder.documents = [{
              name: cwcTemplate,
              path: path.join(masterTemplatesDir, cwcTemplate),
              url: `/templates/master/${encodeURIComponent(cwcTemplate)}`,
              type: 'template',
              isTemplate: true,
              uploadDate: new Date()
            }];
          }
          
          // Add all other templates to General Forms
          const generalFormsFolder = aciFolder.subfolders.find(sf => sf.name === 'General Forms');
          if (generalFormsFolder && generalForms.length > 0) {
            generalFormsFolder.documents = generalForms.map(filename => ({
              name: filename,
              path: path.join(masterTemplatesDir, filename),
              url: `/templates/master/${encodeURIComponent(filename)}`,
              type: 'template',
              isTemplate: true,
              uploadDate: new Date()
            }));
          }
        }
        
        console.log('Added CWC to Pre-Field Documents,', generalForms.length, 'templates to General Forms');
      }
    } catch (templateErr) {
      console.error('Error adding templates to job:', templateErr);
    }
    
    await job.save();
    console.log('Job created with folder structure:', job._id);
    
    // Send response immediately - don't wait for asset extraction
    res.status(201).json(job);
    
    // Trigger AI asset extraction in the background if a PDF was uploaded
    if (req.file?.path && process.env.OPENAI_API_KEY) {
      extractAssetsInBackground(job._id, req.file.path).catch(err => {
        console.error('Background asset extraction error:', err.message);
      });
    }
  } catch (err) {
    console.error('Error creating job:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Background function to extract assets from job package PDF
async function extractAssetsInBackground(jobId, pdfPath) {
  console.log('Starting background asset extraction for job:', jobId);
  
  try {
    const job = await Job.findById(jobId);
    if (!job) {
      console.log('Job not found for asset extraction:', jobId);
      return;
    }
    
    // Use the extractAllAssets helper function (lazy loaded)
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const uploadsDir = path.join(__dirname, 'uploads');
    
    const extractedAssets = await getPdfImageExtractor().extractAllAssets(pdfPath, jobId, uploadsDir, openai);
    
    // Add URLs to extracted assets
    extractedAssets.photos = extractedAssets.photos.map(p => ({
      ...p,
      url: `/uploads/job_${jobId}/photos/${p.name}`
    }));
    extractedAssets.drawings = extractedAssets.drawings.map(d => ({
      ...d,
      url: `/uploads/job_${jobId}/drawings/${d.name}`
    }));
    extractedAssets.maps = extractedAssets.maps.map(m => ({
      ...m,
      url: `/uploads/job_${jobId}/maps/${m.name}`
    }));
    
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
        
        // Find or create Construction Drawings subfolder
        let drawingsFolder = preFieldFolder.subfolders.find(sf => sf.name === 'Construction Drawings');
        if (!drawingsFolder) {
          drawingsFolder = { name: 'Construction Drawings', documents: [], subfolders: [] };
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
          jobPhotosFolder.documents.push({
            name: photo.name,
            path: photo.path,
            url: photo.url,
            type: 'image',
            extractedFrom: path.basename(pdfPath),
            uploadDate: new Date()
          });
        });
        
        // Add extracted drawings
        extractedAssets.drawings.forEach(drawing => {
          drawingsFolder.documents.push({
            name: drawing.name,
            path: drawing.path,
            url: drawing.url,
            type: 'drawing',
            pageNumber: drawing.pageNumber,
            extractedFrom: path.basename(pdfPath),
            uploadDate: new Date()
          });
        });
        
        // Add extracted maps
        extractedAssets.maps.forEach(map => {
          mapsFolder.documents.push({
            name: map.name,
            path: map.path,
            url: map.url,
            type: 'map',
            pageNumber: map.pageNumber,
            extractedFrom: path.basename(pdfPath),
            uploadDate: new Date()
          });
        });
      }
    }
    
    job.aiExtractionComplete = true;
    job.aiExtractedAssets = [
      ...extractedAssets.photos.map(p => ({ type: 'photo', name: p.name, url: p.url, extractedAt: new Date() })),
      ...extractedAssets.drawings.map(d => ({ type: 'drawing', name: d.name, url: d.url, extractedAt: new Date() })),
      ...extractedAssets.maps.map(m => ({ type: 'map', name: m.name, url: m.url, extractedAt: new Date() }))
    ];
    
    await job.save();
    
    console.log('Background asset extraction complete for job:', jobId, {
      photos: extractedAssets.photos.length,
      drawings: extractedAssets.drawings.length,
      maps: extractedAssets.maps.length
    });
    
  } catch (err) {
    console.error('Background asset extraction failed:', err);
  }
}

// Search jobs by PM number - MUST be before /api/jobs/:id to prevent route shadowing
app.get('/api/jobs/search/:pmNumber', authenticateUser, async (req, res) => {
  try {
    const { pmNumber } = req.params;
    const jobs = await Job.find({
      userId: req.userId,
      $or: [
        { pmNumber: { $regex: pmNumber, $options: 'i' } },
        { woNumber: { $regex: pmNumber, $options: 'i' } },
        { notificationNumber: { $regex: pmNumber, $options: 'i' } }
      ]
    });
    res.json(jobs);
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

app.get('/api/jobs/:id', async (req, res) => {
  try {
    console.log('Getting job by ID:', req.params.id);
    console.log('User ID from token:', req.userId, 'isAdmin:', req.isAdmin);

    // Build query - admins can view any job, regular users can only view their own
    // or jobs assigned to them
    let query;
    if (req.isAdmin) {
      // Admin can view any job
      query = { _id: req.params.id };
    } else {
      // Regular users can view jobs they created OR jobs assigned to them
      query = { 
        _id: req.params.id,
        $or: [
          { userId: req.userId },
          { assignedTo: req.userId }
        ]
      };
    }

    const job = await Job.findOne(query)
      .populate('assignedTo', 'name email')
      .populate('assignedBy', 'name email');
    console.log('Job found:', !!job);

    if (!job) {
      console.log('Job not found for user');
      return res.status(404).json({ error: 'Job not found' });
    }

    console.log('Returning job data');
    res.json(job);
  } catch (err) {
    console.error('Error getting job by ID:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Save edited PDF to job folder with proper naming convention
// Format: [PM#]_[DocumentName].pdf
app.post('/api/jobs/:id/save-edited-pdf', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { pdfData, originalName, folderName, subfolderName } = req.body;
    
    const job = await Job.findOne({ _id: id, userId: req.userId });
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Decode base64 PDF data
    const pdfBuffer = Buffer.from(pdfData, 'base64');
    
    // Generate proper filename: [PM#]_[DocumentName].pdf
    const pmNumber = job.pmNumber || 'NOPM';
    
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
    
    const newFilename = `${pmNumber}_${docName}.pdf`;
    const filePath = path.join(__dirname, 'uploads', newFilename);
    
    // Save the file
    fs.writeFileSync(filePath, pdfBuffer);
    
    // Add to the appropriate folder in the job
    const folder = job.folders.find(f => f.name === folderName);
    if (folder) {
      let targetDocuments;
      if (subfolderName) {
        const subfolder = folder.subfolders.find(sf => sf.name === subfolderName);
        if (subfolder) {
          targetDocuments = subfolder.documents;
        }
      } else {
        targetDocuments = folder.documents;
      }
      
      if (targetDocuments) {
        targetDocuments.push({
          name: newFilename,
          path: filePath,
          url: `/uploads/${newFilename}`,
          type: 'pdf',
          isTemplate: false,
          isCompleted: true,
          completedDate: new Date(),
          completedBy: req.userId,
          uploadDate: new Date(),
          uploadedBy: req.userId
        });
      }
    }
    
    await job.save();
    
    console.log('Edited PDF saved:', newFilename);
    res.json({ 
      message: 'PDF saved successfully', 
      filename: newFilename,
      url: `/uploads/${newFilename}`
    });
  } catch (err) {
    console.error('Error saving edited PDF:', err);
    res.status(500).json({ error: 'Failed to save PDF', details: err.message });
  }
});

// Delete a job
app.delete('/api/jobs/:id', authenticateUser, async (req, res) => {
  try {
    console.log('Deleting job by ID:', req.params.id);
    console.log('User ID from token:', req.userId);

    const job = await Job.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    console.log('Job deleted:', job._id);
    res.json({ message: 'Work order deleted successfully', jobId: job._id });
  } catch (err) {
    console.error('Error deleting job:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/templates', express.static(path.join(__dirname, 'templates')));

// Upload file to a specific folder in a job
app.post('/api/jobs/:id/folders/:folderName/upload', authenticateUser, upload.array('files', 10), async (req, res) => {
  try {
    const { id, folderName } = req.params;
    const { subfolder } = req.body; // Optional subfolder name
    
    const job = await Job.findOne({ _id: id, userId: req.userId });
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Find the folder
    const folder = job.folders.find(f => f.name === folderName);
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    
    // Determine where to add documents
    let targetDocuments;
    if (subfolder) {
      const subfolderObj = folder.subfolders.find(sf => sf.name === subfolder);
      if (!subfolderObj) {
        return res.status(404).json({ error: 'Subfolder not found' });
      }
      targetDocuments = subfolderObj.documents;
    } else {
      targetDocuments = folder.documents;
    }
    
    // Add uploaded files
    const uploadedDocs = req.files.map(file => ({
      name: file.originalname,
      path: file.path,
      url: `/uploads/${path.basename(file.path)}`,
      type: file.mimetype.includes('pdf') ? 'pdf' : file.mimetype.includes('image') ? 'image' : 'other',
      uploadDate: new Date(),
      uploadedBy: req.userId
    }));
    
    targetDocuments.push(...uploadedDocs);
    await job.save();
    
    res.json({ message: 'Files uploaded successfully', documents: uploadedDocs });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed', details: err.message });
  }
});

// Upload photos specifically (for foreman job completion photos)
// Photos are named: DA_PM#_Notification#_MAT_Photo_timestamp.ext
app.post('/api/jobs/:id/photos', authenticateUser, upload.array('photos', 20), async (req, res) => {
  try {
    const { id } = req.params;
    
    const job = await Job.findOne({ _id: id, userId: req.userId });
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Find ACI > Photos folder
    const aciFolder = job.folders.find(f => f.name === 'ACI');
    if (!aciFolder) {
      return res.status(404).json({ error: 'ACI folder not found' });
    }
    
    const photosFolder = aciFolder.subfolders.find(sf => sf.name === 'Photos');
    if (!photosFolder) {
      return res.status(404).json({ error: 'Photos folder not found' });
    }
    
    // Generate proper filenames and rename files
    // Use base timestamp + index to ensure unique filenames even in batch uploads
    const baseTimestamp = Date.now();
    const uploadedPhotos = [];
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const ext = path.extname(file.originalname) || '.jpg';
      const uniqueTimestamp = `${baseTimestamp}_${i.toString().padStart(3, '0')}`; // e.g., 1234567890_000, 1234567890_001
      const division = job.division || 'DA';
      const pmNumber = job.pmNumber || 'NOPM';
      const notification = job.notificationNumber || 'NONOTIF';
      const matCode = job.matCode || '2AA';
      
      const newFilename = `${division}_${pmNumber}_${notification}_${matCode}_Photo_${uniqueTimestamp}${ext}`;
      const newPath = path.join(__dirname, 'uploads', newFilename);
      
      // Rename the file
      fs.renameSync(file.path, newPath);
      
      uploadedPhotos.push({
        name: newFilename,
        path: newPath,
        url: `/uploads/${newFilename}`,
        type: 'image',
        uploadDate: new Date(),
        uploadedBy: req.userId
      });
    }
    
    photosFolder.documents.push(...uploadedPhotos);
    await job.save();
    
    console.log('Photos uploaded:', uploadedPhotos.map(p => p.name));
    res.json({ message: 'Photos uploaded successfully', photos: uploadedPhotos });
  } catch (err) {
    console.error('Photo upload error:', err);
    res.status(500).json({ error: 'Photo upload failed', details: err.message });
  }
});

// Helper function to recursively find and remove a document from nested folders
function findAndRemoveDocument(folders, docId) {
  for (const folder of folders) {
    // Check folder documents
    const folderDocIndex = folder.documents?.findIndex(doc => doc._id?.toString() === docId);
    if (folderDocIndex !== undefined && folderDocIndex !== -1) {
      const removedDoc = folder.documents[folderDocIndex];
      folder.documents.splice(folderDocIndex, 1);
      return removedDoc;
    }
    
    // Recursively check subfolders
    if (folder.subfolders && folder.subfolders.length > 0) {
      const result = findAndRemoveDocument(folder.subfolders, docId);
      if (result) return result;
    }
  }
  return null;
}

// Delete a document from a job folder
app.delete('/api/jobs/:id/documents/:docId', authenticateUser, async (req, res) => {
  try {
    const { id, docId } = req.params;
    
    const job = await Job.findOne({ _id: id, userId: req.userId });
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Find and remove the document (searches all nested levels)
    const removedDoc = findAndRemoveDocument(job.folders, docId);
    
    if (!removedDoc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // Try to delete the actual file from disk (if it's in uploads folder)
    if (removedDoc && removedDoc.url && removedDoc.url.startsWith('/uploads/')) {
      const filename = removedDoc.url.replace('/uploads/', '');
      const filePath = path.join(__dirname, 'uploads', filename);
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log('File deleted from disk:', filePath);
        }
      } catch (fileErr) {
        console.warn('Could not delete file from disk:', fileErr.message);
        // Don't fail the request if file deletion fails
      }
    }
    
    await job.save();
    
    console.log('Document removed from job:', docId);
    res.json({ message: 'Document deleted successfully', documentId: docId });
  } catch (err) {
    console.error('Error deleting document:', err);
    res.status(500).json({ error: 'Failed to delete document', details: err.message });
  }
});

// Admin: Create a new folder in a job's file structure
app.post('/api/jobs/:id/folders', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { folderName, parentFolder, isSubfolder } = req.body;
    
    // Check if user is admin
    const user = await User.findById(req.userId);
    if (!user || !user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required to create folders' });
    }
    
    if (!folderName || folderName.trim().length === 0) {
      return res.status(400).json({ error: 'Folder name is required' });
    }
    
    // Admins can access any job
    const job = await Job.findById(id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const cleanFolderName = folderName.trim();
    
    if (isSubfolder && parentFolder) {
      // Create subfolder under an existing parent folder
      const parent = job.folders.find(f => f.name === parentFolder);
      if (!parent) {
        return res.status(404).json({ error: 'Parent folder not found' });
      }
      
      // Check if subfolder already exists
      if (parent.subfolders.some(sf => sf.name === cleanFolderName)) {
        return res.status(400).json({ error: 'Subfolder already exists' });
      }
      
      parent.subfolders.push({
        name: cleanFolderName,
        documents: []
      });
    } else {
      // Create top-level folder
      if (job.folders.some(f => f.name === cleanFolderName)) {
        return res.status(400).json({ error: 'Folder already exists' });
      }
      
      job.folders.push({
        name: cleanFolderName,
        documents: [],
        subfolders: []
      });
    }
    
    await job.save();
    
    console.log('Folder created:', cleanFolderName, isSubfolder ? `under ${parentFolder}` : '(top-level)');
    res.json({ message: 'Folder created successfully', job });
  } catch (err) {
    console.error('Error creating folder:', err);
    res.status(500).json({ error: 'Failed to create folder', details: err.message });
  }
});

// Admin: Delete a folder from a job's file structure
app.delete('/api/jobs/:id/folders/:folderName', authenticateUser, async (req, res) => {
  try {
    const { id, folderName } = req.params;
    const { parentFolder } = req.body;
    
    // Check if user is admin
    const user = await User.findById(req.userId);
    if (!user || !user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required to delete folders' });
    }
    
    // Admins can access any job
    const job = await Job.findById(id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    if (parentFolder) {
      // Delete subfolder
      const parent = job.folders.find(f => f.name === parentFolder);
      if (!parent) {
        return res.status(404).json({ error: 'Parent folder not found' });
      }
      
      const subfolderIndex = parent.subfolders.findIndex(sf => sf.name === folderName);
      if (subfolderIndex === -1) {
        return res.status(404).json({ error: 'Subfolder not found' });
      }
      
      parent.subfolders.splice(subfolderIndex, 1);
    } else {
      // Delete top-level folder
      const folderIndex = job.folders.findIndex(f => f.name === folderName);
      if (folderIndex === -1) {
        return res.status(404).json({ error: 'Folder not found' });
      }
      
      job.folders.splice(folderIndex, 1);
    }
    
    await job.save();
    
    console.log('Folder deleted:', folderName);
    res.json({ message: 'Folder deleted successfully', job });
  } catch (err) {
    console.error('Error deleting folder:', err);
    res.status(500).json({ error: 'Failed to delete folder', details: err.message });
  }
});

// Admin: Get current user info (including admin status)
app.get('/api/user/me', authenticateUser, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    console.error('Error getting user:', err);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// Helper function to recursively find a document in nested folders
function findDocumentRecursive(folders, docId) {
  for (const folder of folders) {
    // Check folder documents
    for (const doc of folder.documents || []) {
      if (doc._id?.toString() === docId) {
        return doc;
      }
    }
    
    // Recursively check subfolders
    if (folder.subfolders && folder.subfolders.length > 0) {
      const result = findDocumentRecursive(folder.subfolders, docId);
      if (result) return result;
    }
  }
  return null;
}

// Update document (mark as completed, save edited PDF)
app.put('/api/jobs/:id/documents/:docId', authenticateUser, async (req, res) => {
  try {
    const { id, docId } = req.params;
    const { isCompleted, pdfData } = req.body;
    
    const job = await Job.findOne({ _id: id, userId: req.userId });
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Find the document in any folder/subfolder (searches all nested levels)
    const foundDoc = findDocumentRecursive(job.folders, docId);
    
    if (!foundDoc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // Update document
    if (isCompleted !== undefined) {
      foundDoc.isCompleted = isCompleted;
      foundDoc.completedDate = isCompleted ? new Date() : null;
      foundDoc.completedBy = isCompleted ? req.userId : null;
    }
    
    // If PDF data is provided, save the edited PDF
    if (pdfData) {
      const pdfBuffer = Buffer.from(pdfData, 'base64');
      // Use timestamp + docId + random suffix to prevent filename collisions
      const randomSuffix = Math.random().toString(36).substr(2, 6);
      const filename = `edited_${docId}_${Date.now()}_${randomSuffix}.pdf`;
      const newPath = path.join(__dirname, 'uploads', filename);
      fs.writeFileSync(newPath, pdfBuffer);
      foundDoc.path = newPath;
      foundDoc.url = `/uploads/${filename}`;
    }
    
    await job.save();
    res.json({ message: 'Document updated', document: foundDoc });
  } catch (err) {
    console.error('Document update error:', err);
    res.status(500).json({ error: 'Update failed', details: err.message });
  }
});

// Update job status (for workflow: pending -> pre-field -> in-progress -> completed -> billed -> invoiced)
app.put('/api/jobs/:id/status', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, bidAmount, bidNotes, crewSize, crewScheduledDate } = req.body;
    
    const job = await Job.findOne({ _id: id, userId: req.userId });
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    if (status) job.status = status;
    if (bidAmount !== undefined) job.bidAmount = bidAmount;
    if (bidNotes !== undefined) job.bidNotes = bidNotes;
    if (crewSize !== undefined) job.crewSize = crewSize;
    if (crewScheduledDate !== undefined) job.crewScheduledDate = crewScheduledDate;
    
    if (status === 'completed') {
      job.completedDate = new Date();
      job.completedBy = req.userId;
    } else if (status === 'billed') {
      job.billedDate = new Date();
    } else if (status === 'invoiced') {
      job.invoicedDate = new Date();
    }
    
    await job.save();
    res.json({ message: 'Job status updated', job });
  } catch (err) {
    console.error('Status update error:', err);
    res.status(500).json({ error: 'Status update failed', details: err.message });
  }
});

// Note: API routes for /api/ai/* are mounted earlier via apiRoutes
// This line is kept for any additional routes in apiRoutes that need auth

// Socket.io setup
io.on('connection', (socket) => {
  console.log('New client connected');
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Express error:', err);
  res.status(500).send('Server Error');
});

// Global error handlers to prevent crashes
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Listening on 0.0.0.0:${PORT}`);
});