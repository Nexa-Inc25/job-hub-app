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
const Utility = require('./models/Utility');
const Company = require('./models/Company');
const apiRoutes = require('./routes/api');
const r2Storage = require('./utils/storage');
const OpenAI = require('openai');
const sharp = require('sharp');
const heicConvert = require('heic-convert');
const aiDataCapture = require('./utils/aiDataCapture');
const documentAutoFill = require('./utils/documentAutoFill');

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

// CORS - whitelist allowed origins for security
const allowedOrigins = [
  'https://job-hub-app.vercel.app',
  'https://job-hub-app-git-main.vercel.app',
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:5173'
].filter(Boolean);

console.log('Allowed CORS origins:', allowedOrigins);

const io = socketIo(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  }
});

app.use((req, res, next) => {
  const origin = req.headers.origin;
  console.log('CORS middleware - Origin:', origin, 'Method:', req.method);
  
  // Only allow whitelisted origins when using credentials
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else if (!origin) {
    // Allow requests without origin (e.g., same-origin, curl, etc.)
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  // Requests from non-whitelisted origins get no CORS headers (blocked)
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
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
const { runMigration } = require('./utils/migration');

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('MongoDB connected successfully');
    // Run migration to set up default utility/company for existing data
    await runMigration();
  })
  .catch(err => console.error('MongoDB connection failed:', err));

// Authentication Middleware
const authenticateUser = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    req.isAdmin = decoded.isAdmin || false;
    req.userRole = decoded.role || null;  // crew, foreman, gf, pm, admin
    req.canApprove = decoded.canApprove || false;
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
// Roles: crew (default), foreman, gf (general foreman), pm (project manager), admin
app.post('/api/signup', async (req, res) => {
  try {
    // Check database connection first
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: 'Database unavailable. Please try again later.' });
    }
    
    const { email, password, name, role } = req.body;
    console.log('Signup attempt for:', email, 'role:', role || 'crew');
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }
    
    // Validate role
    const validRoles = ['crew', 'foreman', 'gf', 'pm', 'admin'];
    const userRole = validRoles.includes(role) ? role : 'crew';
    
    // Determine permissions based on role
    const isAdmin = ['gf', 'pm', 'admin'].includes(userRole);
    const canApprove = ['gf', 'pm', 'admin'].includes(userRole);
    
    const user = new User({ 
      email, 
      password, 
      name: name || email.split('@')[0],
      role: userRole,
      isAdmin,
      canApprove
    });
    await user.save();
    
    const token = jwt.sign({ 
      userId: user._id, 
      isAdmin: user.isAdmin || false,
      role: user.role,
      canApprove: user.canApprove || false
    }, process.env.JWT_SECRET, { expiresIn: '24h' });
    
    console.log('User created successfully:', user._id, 'role:', userRole);
    res.status(201).json({ 
      token, 
      userId: user._id, 
      isAdmin: user.isAdmin || false,
      role: user.role,
      canApprove: user.canApprove || false
    });
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
    const token = jwt.sign({ 
      userId: user._id, 
      isAdmin: user.isAdmin,
      role: user.role,
      canApprove: user.canApprove || false
    }, process.env.JWT_SECRET, { expiresIn: '24h' });
    res.json({ 
      token, 
      userId: user._id, 
      isAdmin: user.isAdmin, 
      role: user.role, 
      canApprove: user.canApprove || false,
      name: user.name 
    });
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

// Get signed URL for a file (authenticated endpoint - returns JSON with signed URL)
app.get('/api/files/signed/:key(*)', authenticateUser, async (req, res) => {
  try {
    const fileKey = req.params.key;
    
    if (r2Storage.isR2Configured()) {
      const signedUrl = await r2Storage.getSignedDownloadUrl(fileKey);
      if (signedUrl) {
        return res.json({ url: signedUrl });
      }
    }
    
    // Fallback to local file URL
    const localPath = path.join(__dirname, 'uploads', fileKey);
    if (fs.existsSync(localPath)) {
      return res.json({ url: `/uploads/${fileKey}` });
    }
    
    res.status(404).json({ error: 'File not found' });
  } catch (err) {
    console.error('Error getting signed URL:', err);
    res.status(500).json({ error: 'Failed to get signed URL' });
  }
});

// Get file from R2 - streams file directly (NO AUTH - for direct <img> loading)
// Security: Files are only accessible if you know the exact path
app.get('/api/files/:key(*)', async (req, res) => {
  try {
    const fileKey = req.params.key;
    console.log('File request - key:', fileKey);
    
    if (r2Storage.isR2Configured()) {
      console.log('R2 configured, streaming file...');
      const fileData = await r2Storage.getFileStream(fileKey);
      
      if (fileData && fileData.stream) {
        console.log('File found, streaming with content-type:', fileData.contentType);
        res.setHeader('Content-Type', fileData.contentType || 'application/octet-stream');
        if (fileData.contentLength) {
          res.setHeader('Content-Length', fileData.contentLength);
        }
        // Enable caching
        res.setHeader('Cache-Control', 'public, max-age=3600');
        // Allow embedding in iframes (for PDF viewer)
        res.setHeader('Content-Disposition', 'inline');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        // CORS headers for cross-origin requests
        res.setHeader('Access-Control-Allow-Origin', '*');
        fileData.stream.pipe(res);
        return;
      }
    }
    
    // Fallback to local file
    const localPath = path.join(__dirname, 'uploads', fileKey);
    console.log('Checking local path:', localPath, 'exists:', fs.existsSync(localPath));
    if (fs.existsSync(localPath)) {
      return res.sendFile(localPath);
    }
    
    console.log('File not found:', fileKey);
    res.status(404).json({ error: 'File not found', key: fileKey });
  } catch (err) {
    console.error('Error getting file:', err);
    res.status(500).json({ error: 'Failed to get file' });
  }
});

// Get list of available master templates
app.get('/api/admin/templates', authenticateUser, async (req, res) => {
  try {
    console.log('=== Listing Templates ===');
    console.log('R2 configured:', r2Storage.isR2Configured());
    
    // If R2 is configured, list templates from R2
    if (r2Storage.isR2Configured()) {
      console.log('Listing templates from R2...');
      const r2Files = await r2Storage.listFiles('templates/');
      console.log('R2 files found:', r2Files.length, r2Files.map(f => f.Key));
      const templates = r2Files.map(f => ({
        name: f.Key.replace('templates/', ''),
        url: r2Storage.getPublicUrl(f.Key),
        r2Key: f.Key,
        size: f.Size,
        lastModified: f.LastModified
      }));
      console.log('Returning templates:', templates.length);
      return res.json({ templates });
    }
    
    // Fallback to local filesystem
    console.log('R2 not configured, checking local filesystem...');
    const templatesDir = path.join(__dirname, 'templates', 'master');
    if (!fs.existsSync(templatesDir)) {
      console.log('Templates dir does not exist:', templatesDir);
      return res.json({ templates: [] });
    }
    
    const files = fs.readdirSync(templatesDir);
    console.log('Local files found:', files);
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

// PM assigns job to GF
app.put('/api/jobs/:id/assign-gf', authenticateUser, async (req, res) => {
  try {
    const { assignedToGF, notes } = req.body;
    
    // Only PM/Admin can assign to GF
    const user = await User.findById(req.userId);
    if (!user?.isAdmin && !['pm', 'admin'].includes(user?.role)) {
      return res.status(403).json({ error: 'Only PM or Admin can assign jobs to GF' });
    }
    
    const job = await Job.findById(req.params.id);
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
// All /api/jobs routes require authentication
// Role-based filtering:
//   - Admin/PM: See all jobs in their company
//   - GF: See jobs assigned to them for pre-field/review
//   - Foreman/Crew: See only jobs assigned to them
app.get('/api/jobs', authenticateUser, async (req, res) => {
  try {
    console.log('GET /api/jobs - userId:', req.userId, 'role:', req.userRole, 'isAdmin:', req.isAdmin);
    const { search, view } = req.query;
    
    // Build query based on user role
    let query = {};
    
    // Admin and PM see all jobs (in their company eventually)
    if (req.isAdmin || req.userRole === 'pm' || req.userRole === 'admin') {
      // For now, admins see all jobs they created OR are in their company
      // Once multi-tenant is fully implemented, filter by companyId
      query = {}; // See all jobs
    } 
    // GF sees jobs assigned to them for pre-field/review, plus jobs they need to assign crews to
    else if (req.userRole === 'gf') {
      query = {
        $or: [
          { assignedToGF: req.userId },  // Jobs assigned to this GF
          { userId: req.userId }          // Jobs they created (if any)
        ]
      };
    }
    // Foreman/Crew only sees jobs assigned to them
    else if (req.userRole === 'foreman' || req.userRole === 'crew') {
      query = {
        $or: [
          { assignedTo: req.userId },     // Jobs assigned to this foreman
          { userId: req.userId }           // Jobs they created (unlikely but safe)
        ]
      };
    }
    // Default fallback - see own jobs OR if legacy admin account
    else {
      // Legacy accounts without role but with isAdmin should still work
      if (req.isAdmin) {
        query = {}; // Admin sees all
      } else {
        query = { userId: req.userId };
      }
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
      .sort({ createdAt: -1 })
      .lean(); // Use lean() for faster read-only queries
    console.log('GET /api/jobs - returning', jobs.length, 'jobs for role:', req.userRole || 'unknown');
    res.json(jobs);
  } catch (err) {
    console.error('Error fetching jobs:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create Emergency Work Order (minimal info, high priority)
app.post('/api/jobs/emergency', authenticateUser, async (req, res) => {
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
            { name: 'Job Photos', documents: [], subfolders: [] }
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
    
    await job.save();
    
    console.log('Emergency WO created:', job._id, 'WO#:', woNumber);
    res.status(201).json(job);
  } catch (err) {
    console.error('Error creating emergency WO:', err);
    res.status(500).json({ error: 'Failed to create emergency work order', details: err.message });
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
                { name: 'Construction Sketches', documents: [] },
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
  const startTime = Date.now();
  console.log('Starting background asset extraction for job:', jobId);
  console.log('PDF path:', pdfPath);
  console.log('PDF exists:', fs.existsSync(pdfPath));
  
  try {
    const job = await Job.findById(jobId);
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
      maps: extractedAssets.maps?.length || 0
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
        const { path: localPath, ...assetWithoutPath } = asset;
        uploaded.push({ ...assetWithoutPath, url, r2Key });
      }
      return uploaded;
    }
    
    extractedAssets.photos = await uploadAssetsToR2(extractedAssets.photos, 'photos');
    extractedAssets.drawings = await uploadAssetsToR2(extractedAssets.drawings, 'drawings');
    extractedAssets.maps = await uploadAssetsToR2(extractedAssets.maps, 'maps');
    
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
    
    job.aiExtractionComplete = true;
    job.aiExtractionEnded = new Date();
    job.aiProcessingTimeMs = Date.now() - startTime;
    console.log(`AI extraction completed in ${(job.aiProcessingTimeMs / 1000).toFixed(1)}s`);
    
    job.aiExtractedAssets = [
      ...extractedAssets.photos.map(p => ({ type: 'photo', name: p.name, url: p.url, extractedAt: new Date() })),
      ...extractedAssets.drawings.map(d => ({ type: 'drawing', name: d.name, url: d.url, extractedAt: new Date() })),
      ...extractedAssets.maps.map(m => ({ type: 'map', name: m.name, url: m.url, extractedAt: new Date() }))
    ];
    
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
    
    await job.save();
    
    console.log('Background asset extraction complete for job:', jobId, {
      photos: extractedAssets.photos.length,
      drawings: extractedAssets.drawings.length,
      maps: extractedAssets.maps.length
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
    // Still try to clean up local file on error
    if (fs.existsSync(pdfPath)) {
      try {
        fs.unlinkSync(pdfPath);
      } catch (cleanupErr) {
        // Ignore cleanup errors
      }
    }
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

app.get('/api/jobs/:id', authenticateUser, async (req, res) => {
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

// Save edited PDF to job folder - saves as DRAFT pending approval
// Format: DRAFT_[PM#]_[DocumentName]_[timestamp].pdf
// Final approved format: [PM#]_[DocumentName].pdf
app.post('/api/jobs/:id/save-edited-pdf', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { pdfData, originalName, folderName, subfolderName } = req.body;
    
    // Allow job creator, assigned user, or admin to save edits
    const job = await Job.findOne({ 
      _id: id,
      $or: [
        { userId: req.userId },
        { assignedTo: req.userId }
      ]
    });
    if (!job && !req.isAdmin) {
      return res.status(404).json({ error: 'Job not found' });
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
    const user = await User.findById(req.userId);
    const canAutoApprove = user && (user.canApprove || user.isAdmin || ['gf', 'pm', 'admin'].includes(user.role));
    
    // Add timestamp to ensure cache busting when same doc is edited multiple times
    const timestamp = Date.now();
    
    // DRAFT filename for non-approvers, final filename for approvers
    const draftFilename = `DRAFT_${pmNumber}_${docName}_${timestamp}.pdf`;
    const finalFilename = `${pmNumber}_${docName}.pdf`;
    const newFilename = canAutoApprove ? finalFilename : draftFilename;
    
    const filePath = path.join(__dirname, 'uploads', newFilename);
    
    // Save the file
    fs.writeFileSync(filePath, pdfBuffer);
    
    let docUrl = `/uploads/${newFilename}`;
    let r2Key = null;
    
    // Upload to R2 if configured
    if (r2Storage.isR2Configured()) {
      try {
        const folderPath = subfolderName ? `${folderName}/${subfolderName}` : folderName;
        const result = await r2Storage.uploadJobFile(filePath, id, folderPath, newFilename);
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
    
    // Add to the appropriate folder in the job
    const folder = jobToUpdate.folders.find(f => f.name === folderName);
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
          url: docUrl,
          r2Key: r2Key,
          type: 'pdf',
          isTemplate: false,
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
          approvedDate: canAutoApprove ? new Date() : null
        });
      }
    }
    
    await jobToUpdate.save();
    
    const statusMsg = canAutoApprove ? 'approved' : 'pending approval';
    console.log(`Edited PDF saved (${statusMsg}):`, newFilename);
    res.json({ 
      message: `PDF saved successfully (${statusMsg})`, 
      filename: newFilename,
      url: docUrl,
      approvalStatus: canAutoApprove ? 'approved' : 'pending_approval',
      needsApproval: !canAutoApprove
    });
  } catch (err) {
    console.error('Error saving edited PDF:', err);
    res.status(500).json({ error: 'Failed to save PDF', details: err.message });
  }
});

// Approve a draft document (GF, PM, Admin only)
// Renames from DRAFT_xxx.pdf to final PG&E format
app.post('/api/jobs/:jobId/documents/:docId/approve', authenticateUser, async (req, res) => {
  try {
    const { jobId, docId } = req.params;
    
    // Check if user can approve
    const user = await User.findById(req.userId);
    const canApprove = user && (user.canApprove || user.isAdmin || ['gf', 'pm', 'admin'].includes(user.role));
    
    if (!canApprove) {
      return res.status(403).json({ error: 'You do not have permission to approve documents' });
    }
    
    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Find the document in any folder/subfolder
    let foundDoc = null;
    let foundFolder = null;
    let foundSubfolder = null;
    
    for (const folder of job.folders) {
      // Check folder documents
      const docInFolder = folder.documents.find(d => d._id.toString() === docId);
      if (docInFolder) {
        foundDoc = docInFolder;
        foundFolder = folder;
        break;
      }
      
      // Check subfolders
      for (const subfolder of folder.subfolders || []) {
        const docInSubfolder = subfolder.documents.find(d => d._id.toString() === docId);
        if (docInSubfolder) {
          foundDoc = docInSubfolder;
          foundFolder = folder;
          foundSubfolder = subfolder;
          break;
        }
        
        // Check nested subfolders
        for (const nestedSubfolder of subfolder.subfolders || []) {
          const docInNested = nestedSubfolder.documents.find(d => d._id.toString() === docId);
          if (docInNested) {
            foundDoc = docInNested;
            foundFolder = folder;
            foundSubfolder = nestedSubfolder;
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
app.post('/api/jobs/:jobId/documents/:docId/reject', authenticateUser, async (req, res) => {
  try {
    const { jobId, docId } = req.params;
    const { reason } = req.body;
    
    // Check if user can approve/reject
    const user = await User.findById(req.userId);
    const canApprove = user && (user.canApprove || user.isAdmin || ['gf', 'pm', 'admin'].includes(user.role));
    
    if (!canApprove) {
      return res.status(403).json({ error: 'You do not have permission to reject documents' });
    }
    
    const job = await Job.findById(jobId);
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
app.get('/api/admin/pending-approvals', authenticateUser, async (req, res) => {
  try {
    // Check if user can approve
    const user = await User.findById(req.userId);
    const canApprove = user && (user.canApprove || user.isAdmin || ['gf', 'pm', 'admin'].includes(user.role));
    
    if (!canApprove) {
      return res.status(403).json({ error: 'You do not have permission to view pending approvals' });
    }
    
    // Find all jobs with pending documents
    const jobs = await Job.find({}).select('pmNumber woNumber address folders').lean();
    
    const pendingDocs = [];
    for (const job of jobs) {
      for (const folder of job.folders || []) {
        // Check folder documents
        for (const doc of folder.documents || []) {
          if (doc.approvalStatus === 'pending_approval') {
            pendingDocs.push({
              jobId: job._id,
              pmNumber: job.pmNumber,
              woNumber: job.woNumber,
              address: job.address,
              folderName: folder.name,
              document: doc
            });
          }
        }
        
        // Check subfolders
        for (const subfolder of folder.subfolders || []) {
          for (const doc of subfolder.documents || []) {
            if (doc.approvalStatus === 'pending_approval') {
              pendingDocs.push({
                jobId: job._id,
                pmNumber: job.pmNumber,
                woNumber: job.woNumber,
                address: job.address,
                folderName: `${folder.name} > ${subfolder.name}`,
                document: doc
              });
            }
          }
        }
      }
    }
    
    console.log(`Found ${pendingDocs.length} documents pending approval`);
    res.json({ pendingDocuments: pendingDocs, count: pendingDocs.length });
  } catch (err) {
    console.error('Error fetching pending approvals:', err);
    res.status(500).json({ error: 'Failed to fetch pending approvals' });
  }
});

// ========================================
// UTILITY & COMPANY MANAGEMENT ENDPOINTS
// ========================================

// Get all utilities (public - for signup dropdown)
app.get('/api/utilities', async (req, res) => {
  try {
    const utilities = await Utility.find({ isActive: true })
      .select('name slug shortName region')
      .lean();
    res.json(utilities);
  } catch (err) {
    console.error('Error fetching utilities:', err);
    res.status(500).json({ error: 'Failed to fetch utilities' });
  }
});

// Get utility by slug
app.get('/api/utilities/:slug', async (req, res) => {
  try {
    const utility = await Utility.findOne({ slug: req.params.slug, isActive: true });
    if (!utility) {
      return res.status(404).json({ error: 'Utility not found' });
    }
    res.json(utility);
  } catch (err) {
    console.error('Error fetching utility:', err);
    res.status(500).json({ error: 'Failed to fetch utility' });
  }
});

// Create utility (admin only)
app.post('/api/admin/utilities', authenticateUser, async (req, res) => {
  try {
    if (!req.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const utility = new Utility(req.body);
    await utility.save();
    
    console.log('Created utility:', utility.name);
    res.status(201).json(utility);
  } catch (err) {
    console.error('Error creating utility:', err);
    res.status(500).json({ error: 'Failed to create utility', details: err.message });
  }
});

// Admin: Cleanup emergency test jobs
app.delete('/api/admin/cleanup-emergency-jobs', authenticateUser, async (req, res) => {
  try {
    if (!req.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const result = await Job.deleteMany({
      $or: [
        { isEmergency: true },
        { title: /emergency/i },
        { priority: 'emergency' }
      ]
    });
    
    console.log(`Admin cleanup: Deleted ${result.deletedCount} emergency jobs`);
    res.json({ message: `Deleted ${result.deletedCount} emergency jobs` });
  } catch (err) {
    console.error('Error cleaning up emergency jobs:', err);
    res.status(500).json({ error: 'Failed to cleanup jobs', details: err.message });
  }
});

// Get current user's company
app.get('/api/company', authenticateUser, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(404).json({ error: 'No company associated with this user' });
    }
    
    const company = await Company.findById(user.companyId)
      .populate('utilities', 'name slug shortName')
      .populate('defaultUtility', 'name slug shortName');
    
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    res.json(company);
  } catch (err) {
    console.error('Error fetching company:', err);
    res.status(500).json({ error: 'Failed to fetch company' });
  }
});

// Update company settings (company admin only)
app.put('/api/company', authenticateUser, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(404).json({ error: 'No company associated with this user' });
    }
    
    // Check if user is company admin or system admin
    if (!user.isAdmin && user.role !== 'pm' && user.role !== 'admin') {
      return res.status(403).json({ error: 'Only company admins can update company settings' });
    }
    
    const company = await Company.findById(user.companyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    // Update allowed fields
    const allowedFields = ['name', 'phone', 'address', 'city', 'state', 'zip', 'settings', 'defaultUtility'];
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        company[field] = req.body[field];
      }
    });
    
    await company.save();
    
    console.log('Updated company:', company.name);
    res.json(company);
  } catch (err) {
    console.error('Error updating company:', err);
    res.status(500).json({ error: 'Failed to update company', details: err.message });
  }
});

// Create new company (for new contractor signup)
app.post('/api/companies', async (req, res) => {
  try {
    const { companyName, utilitySlug } = req.body;
    
    if (!companyName) {
      return res.status(400).json({ error: 'Company name is required' });
    }
    
    // Find the utility (default to PG&E if not specified)
    const utility = await Utility.findOne({ slug: utilitySlug || 'pge' });
    
    const company = new Company({
      name: companyName,
      utilities: utility ? [utility._id] : [],
      defaultUtility: utility?._id,
      subscription: {
        plan: 'free',
        seats: 5,
        status: 'trialing'
      }
    });
    
    await company.save();
    
    console.log('Created company:', company.name);
    res.status(201).json(company);
  } catch (err) {
    console.error('Error creating company:', err);
    res.status(500).json({ error: 'Failed to create company', details: err.message });
  }
});

// Get company users (company admin only)
app.get('/api/company/users', authenticateUser, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(404).json({ error: 'No company associated with this user' });
    }
    
    // Check if user can view company users
    if (!user.isAdmin && !['gf', 'pm', 'admin'].includes(user.role)) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    const users = await User.find({ companyId: user.companyId })
      .select('-password')
      .sort({ createdAt: -1 });
    
    res.json(users);
  } catch (err) {
    console.error('Error fetching company users:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Invite user to company (company admin only)
app.post('/api/company/invite', authenticateUser, async (req, res) => {
  try {
    const { email, name, role } = req.body;
    
    const inviter = await User.findById(req.userId);
    if (!inviter?.companyId) {
      return res.status(404).json({ error: 'No company associated with this user' });
    }
    
    // Check if user can invite
    if (!inviter.isAdmin && !['gf', 'pm', 'admin'].includes(inviter.role)) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }
    
    // Generate temporary password (user will reset on first login)
    const tempPassword = Math.random().toString(36).slice(-8) + 'A1!';
    
    const validRoles = ['crew', 'foreman', 'gf', 'pm'];
    const userRole = validRoles.includes(role) ? role : 'crew';
    
    const newUser = new User({
      email,
      password: tempPassword,
      name: name || email.split('@')[0],
      role: userRole,
      companyId: inviter.companyId,
      isAdmin: ['gf', 'pm'].includes(userRole),
      canApprove: ['gf', 'pm'].includes(userRole)
    });
    
    await newUser.save();
    
    // TODO: Send invitation email with temp password
    
    console.log('Invited user:', email, 'to company:', inviter.companyId);
    res.status(201).json({ 
      message: 'User invited successfully',
      user: { email: newUser.email, name: newUser.name, role: newUser.role },
      tempPassword // Remove this in production - send via email instead
    });
  } catch (err) {
    console.error('Error inviting user:', err);
    res.status(500).json({ error: 'Failed to invite user', details: err.message });
  }
});

// Delete a job
// Admin/PM can delete any job, others can only delete their own
app.delete('/api/jobs/:id', authenticateUser, async (req, res) => {
  try {
    console.log('Deleting job by ID:', req.params.id);
    console.log('User ID from token:', req.userId, 'isAdmin:', req.isAdmin, 'role:', req.userRole);

    let job;
    
    // Admin and PM can delete any job
    if (req.isAdmin || req.userRole === 'pm' || req.userRole === 'admin') {
      job = await Job.findByIdAndDelete(req.params.id);
    } else {
      // Others can only delete their own jobs
      job = await Job.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    }
    
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
    

    // Allow file upload if user has access to this job
    let job;
    if (req.isAdmin || req.userRole === 'pm' || req.userRole === 'admin') {
      job = await Job.findById(id);
    } else {
      job = await Job.findOne({
        _id: id,
        $or: [
          { userId: req.userId },
          { assignedTo: req.userId },
          { assignedToGF: req.userId }
        ]
      });
    }
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found or you do not have access' });
    }
    
    // Find the folder
    const folder = job.folders.find(f => f.name === folderName);
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    
    // Determine where to add documents
    // Supports nested subfolders with path like "Pre-Field Documents/Job Photos"
    let targetDocuments;
    if (subfolder) {
      const subfolderParts = subfolder.split('/');
      let currentFolder = folder;
      
      for (const part of subfolderParts) {
        const subfolderObj = currentFolder.subfolders?.find(sf => sf.name === part);
        if (!subfolderObj) {
          return res.status(404).json({ error: `Subfolder not found: ${part}` });
        }
        currentFolder = subfolderObj;
      }
      targetDocuments = currentFolder.documents;
    } else {
      targetDocuments = folder.documents;
    }
    
    // Upload files to R2 and create document records
    const uploadedDocs = [];
    for (const file of req.files) {
      let docUrl = `/uploads/${path.basename(file.path)}`;
      let r2Key = null;
      
      if (r2Storage.isR2Configured()) {
        try {
          const folderPath = subfolder ? `${folderName}/${subfolder}` : folderName;
          const result = await r2Storage.uploadJobFile(file.path, id, folderPath, file.originalname);
          docUrl = r2Storage.getPublicUrl(result.key);
          r2Key = result.key;
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (uploadErr) {
          console.error('Failed to upload to R2:', uploadErr.message);
        }
      }
      
      uploadedDocs.push({
        name: file.originalname,
        url: docUrl,
        r2Key: r2Key,
        type: file.mimetype.includes('pdf') ? 'pdf' : file.mimetype.includes('image') ? 'image' : 'other',
        uploadDate: new Date(),
        uploadedBy: req.userId
      });
    }
    
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
    
    console.log('Photo upload request:', {
      jobId: id,
      userId: req.userId,
      userRole: req.userRole,
      isAdmin: req.isAdmin,
      filesCount: req.files?.length
    });
    
    // Allow photo upload if user is:
    // - Admin/PM (can access any job)
    // - Owner of the job (userId)
    // - Assigned to the job (assignedTo)
    // - GF assigned to the job (assignedToGF)
    let job;
    if (req.isAdmin || req.userRole === 'pm' || req.userRole === 'admin') {
      console.log('Admin/PM access - finding job by ID');
      job = await Job.findById(id);
    } else {
      console.log('Non-admin access - checking assignment');
      // First find the job to check assignment
      const checkJob = await Job.findById(id);
      if (checkJob) {
        console.log('Job assignment check:', {
          jobUserId: checkJob.userId?.toString(),
          assignedTo: checkJob.assignedTo?.toString(),
          assignedToGF: checkJob.assignedToGF?.toString(),
          requestingUser: req.userId
        });
      }
      
      job = await Job.findOne({
        _id: id,
        $or: [
          { userId: req.userId },
          { assignedTo: req.userId },
          { assignedToGF: req.userId }
        ]
      });
    }
    
    if (!job) {
      console.log('Photo upload denied - job not found or no access');
      return res.status(404).json({ error: 'Job not found or you do not have access' });
    }
    
    console.log('Photo upload authorized for job:', job.pmNumber);
    
    // Find ACI > Photos folder
    const aciFolder = job.folders.find(f => f.name === 'ACI');
    if (!aciFolder) {
      return res.status(404).json({ error: 'ACI folder not found' });
    }
    
    const photosFolder = aciFolder.subfolders.find(sf => sf.name === 'Photos');
    if (!photosFolder) {
      return res.status(404).json({ error: 'Photos folder not found' });
    }
    
    // Generate proper filenames and upload to R2
    const baseTimestamp = Date.now();
    const uploadedPhotos = [];
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      let ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      const uniqueTimestamp = `${baseTimestamp}_${i.toString().padStart(3, '0')}`;
      const division = job.division || 'DA';
      const pmNumber = job.pmNumber || 'NOPM';
      const notification = job.notificationNumber || 'NONOTIF';
      const matCode = job.matCode || '2AA';
      
      let fileToUpload = file.path;
      let tempConvertedFile = null;
      
      // Convert HEIC/HEIF to JPG (browsers can't display HEIC)
      if (ext === '.heic' || ext === '.heif') {
        console.log('Converting HEIC/HEIF to JPG:', file.originalname);
        try {
          tempConvertedFile = file.path + '.jpg';
          const inputBuffer = fs.readFileSync(file.path);
          const outputBuffer = await heicConvert({
            buffer: inputBuffer,
            format: 'JPEG',
            quality: 0.9
          });
          fs.writeFileSync(tempConvertedFile, Buffer.from(outputBuffer));
          fileToUpload = tempConvertedFile;
          ext = '.jpg';
          console.log('HEIC converted successfully to JPG');
        } catch (convertErr) {
          console.error('Failed to convert HEIC:', convertErr.message);
          // Continue with original file
        }
      }
      
      const newFilename = `${division}_${pmNumber}_${notification}_${matCode}_Photo_${uniqueTimestamp}${ext}`;
      
      let docUrl = `/uploads/${newFilename}`;
      let r2Key = null;
      
      // Upload to R2 if configured
      console.log('Manual photo upload - R2 configured:', r2Storage.isR2Configured());
      if (r2Storage.isR2Configured()) {
        try {
          console.log('Uploading photo to R2:', fileToUpload, '->', `jobs/${id}/photos/${newFilename}`);
          const result = await r2Storage.uploadJobFile(fileToUpload, id, 'photos', newFilename);
          docUrl = r2Storage.getPublicUrl(result.key);
          r2Key = result.key;
          console.log('Photo uploaded to R2 successfully:', r2Key, '-> URL:', docUrl);
          // Clean up local files
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
          if (tempConvertedFile && fs.existsSync(tempConvertedFile)) {
            fs.unlinkSync(tempConvertedFile);
          }
        } catch (uploadErr) {
          console.error('Failed to upload photo to R2:', uploadErr.message);
          // Fallback to local
          const newPath = path.join(__dirname, 'uploads', newFilename);
          fs.renameSync(fileToUpload, newPath);
        }
      } else {
        console.log('R2 not configured, saving locally');
        const newPath = path.join(__dirname, 'uploads', newFilename);
        fs.renameSync(fileToUpload, newPath);
      }
      
      uploadedPhotos.push({
        name: newFilename,
        url: docUrl,
        r2Key: r2Key,
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

// Update job status - Full workflow:
// new → assigned_to_gf → pre_fielding → scheduled → in_progress → 
// pending_gf_review → pending_pm_approval → ready_to_submit → submitted → billed → invoiced
app.put('/api/jobs/:id/status', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      status, 
      bidAmount, 
      bidNotes, 
      estimatedHours,
      crewSize, 
      crewScheduledDate,
      preFieldNotes,
      siteConditions,
      submissionNotes,
      reviewNotes
    } = req.body;
    
    // Get current user's role
    const user = await User.findById(req.userId);
    const userRole = user?.role || 'crew';
    const isAdmin = user?.isAdmin || ['pm', 'admin'].includes(userRole);
    const isGF = ['gf', 'pm', 'admin'].includes(userRole);
    
    // Allow job creator, assigned GF, assigned crew, or admin to update
    const job = await Job.findOne({
      _id: id,
      $or: [
        { userId: req.userId },
        { assignedToGF: req.userId },
        { assignedTo: req.userId },
        ...(isAdmin ? [{ _id: id }] : [])  // Admins can update any job
      ]
    });
    if (!job) {
      return res.status(404).json({ error: 'Job not found or not authorized' });
    }
    
    const oldStatus = job.status;
    
    // Update fields based on what was provided
    if (status) job.status = status;
    if (bidAmount !== undefined) job.bidAmount = bidAmount;
    if (bidNotes !== undefined) job.bidNotes = bidNotes;
    if (estimatedHours !== undefined) job.estimatedHours = estimatedHours;
    if (crewSize !== undefined) job.crewSize = crewSize;
    if (crewScheduledDate !== undefined) job.crewScheduledDate = crewScheduledDate;
    if (preFieldNotes !== undefined) job.preFieldNotes = preFieldNotes;
    if (siteConditions !== undefined) job.siteConditions = siteConditions;
    
    // Handle status-specific updates
    switch (status) {
      case 'assigned_to_gf':
        // PM assigned job to GF
        if (!job.assignedToGFDate) {
          job.assignedToGFDate = new Date();
          job.assignedToGFBy = req.userId;
        }
        break;
        
      case 'pre_fielding':
        // GF started pre-fielding
        if (!job.preFieldDate) {
          job.preFieldDate = new Date();
        }
        break;
        
      case 'scheduled':
        // GF scheduled the job
        break;
        
      case 'in_progress':
        // Crew started work
        break;
        
      case 'pending_gf_review':
        // Crew submitted work for GF review
        job.crewSubmittedDate = new Date();
        job.crewSubmittedBy = req.userId;
        if (submissionNotes) job.crewSubmissionNotes = submissionNotes;
        break;
        
      case 'pending_pm_approval':
        // GF approved, moving to PM review
        job.gfReviewDate = new Date();
        job.gfReviewedBy = req.userId;
        job.gfReviewStatus = 'approved';
        if (reviewNotes) job.gfReviewNotes = reviewNotes;
        break;
        
      case 'ready_to_submit':
        // PM approved, ready for utility submission
        job.pmApprovalDate = new Date();
        job.pmApprovedBy = req.userId;
        job.pmApprovalStatus = 'approved';
        if (reviewNotes) job.pmApprovalNotes = reviewNotes;
        job.completedDate = new Date();
        job.completedBy = req.userId;
        break;
        
      case 'submitted':
        // Submitted to utility
        job.utilitySubmittedDate = new Date();
        job.utilityVisible = true;
        job.utilityStatus = 'submitted';
        break;
        
      case 'billed':
        job.billedDate = new Date();
        break;
        
      case 'invoiced':
        job.invoicedDate = new Date();
        break;
        
      // Legacy status mappings - map to new status AND execute transition logic
      case 'pending':
        job.status = 'new';
        break;
        
      case 'pre-field':
        job.status = 'pre_fielding';
        // Execute same logic as 'pre_fielding' case
        if (!job.preFieldDate) {
          job.preFieldDate = new Date();
        }
        break;
        
      case 'completed':
        job.status = 'ready_to_submit';
        job.completedDate = new Date();
        job.completedBy = req.userId;
        // Execute same logic as 'ready_to_submit' case
        job.pmApprovalDate = new Date();
        job.pmApprovedBy = req.userId;
        job.pmApprovalStatus = 'approved';
        break;
        
      case 'in-progress':
        // Legacy hyphenated version
        job.status = 'in_progress';
        break;
    }
    
    await job.save();
    
    console.log(`Job ${job.pmNumber || job._id} status: ${oldStatus} → ${job.status}`);
    
    // === AI DATA CAPTURE ===
    // Capture workflow transitions for AI training (non-blocking)
    (async () => {
      try {
        // Initialize training data if not exists
        await aiDataCapture.initializeTrainingData(job._id, req.userId);
        
        // Capture crew data when scheduled
        if (status === 'scheduled' && (crewSize || estimatedHours)) {
          await aiDataCapture.captureCrewData(job._id, {
            crewSize,
            estimatedHours,
            foremanId: job.assignedTo
          }, req.userId);
        }
        
        // Capture site conditions when pre-fielding
        if (status === 'pre_fielding' && (siteConditions || preFieldNotes)) {
          await aiDataCapture.captureSiteConditions(job._id, {
            siteConditions: siteConditions || preFieldNotes
          }, req.userId);
        }
        
        // Capture outcome when completed
        if (['ready_to_submit', 'completed'].includes(status)) {
          await aiDataCapture.captureJobOutcome(job._id, {
            firstTimeSuccess: !job.gfReviewStatus || job.gfReviewStatus === 'approved',
            revisionsRequired: job.gfReviewStatus === 'revision_requested' ? 1 : 0
          }, req.userId);
        }
      } catch (aiErr) {
        console.error('[AI Data] Error capturing workflow data:', aiErr);
      }
    })();
    
    res.json({ message: 'Job status updated', job, previousStatus: oldStatus });
  } catch (err) {
    console.error('Status update error:', err);
    res.status(500).json({ error: 'Status update failed', details: err.message });
  }
});

// GF/PM Review endpoint - approve or reject crew submission
app.post('/api/jobs/:id/review', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { action, notes } = req.body;  // action: 'approve', 'reject', 'request_revision'
    
    const user = await User.findById(req.userId);
    const userRole = user?.role || 'crew';
    const canReview = user?.canApprove || ['gf', 'pm', 'admin'].includes(userRole);
    
    if (!canReview) {
      return res.status(403).json({ error: 'You do not have permission to review jobs' });
    }
    
    const job = await Job.findById(id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const isGF = ['gf'].includes(userRole) || job.assignedToGF?.toString() === req.userId;
    const isPM = ['pm', 'admin'].includes(userRole) || job.userId?.toString() === req.userId;
    
    // Determine which review stage we're in
    if (job.status === 'pending_gf_review' && (isGF || isPM)) {
      // GF reviewing crew submission
      job.gfReviewDate = new Date();
      job.gfReviewedBy = req.userId;
      job.gfReviewNotes = notes;
      
      if (action === 'approve') {
        job.gfReviewStatus = 'approved';
        job.status = 'pending_pm_approval';
      } else if (action === 'reject') {
        job.gfReviewStatus = 'rejected';
        job.status = 'in_progress';  // Send back to crew
      } else if (action === 'request_revision') {
        job.gfReviewStatus = 'revision_requested';
        job.status = 'in_progress';
      }
    } else if (job.status === 'pending_pm_approval' && isPM) {
      // PM final approval
      job.pmApprovalDate = new Date();
      job.pmApprovedBy = req.userId;
      job.pmApprovalNotes = notes;
      
      if (action === 'approve') {
        job.pmApprovalStatus = 'approved';
        job.status = 'ready_to_submit';
        job.completedDate = new Date();
        job.completedBy = req.userId;
      } else if (action === 'reject') {
        job.pmApprovalStatus = 'rejected';
        job.status = 'pending_gf_review';  // Send back to GF
      } else if (action === 'request_revision') {
        job.pmApprovalStatus = 'revision_requested';
        job.status = 'pending_gf_review';
      }
    } else {
      return res.status(400).json({ 
        error: 'Job is not in a reviewable state or you are not the appropriate reviewer',
        currentStatus: job.status,
        yourRole: userRole
      });
    }
    
    await job.save();
    
    console.log(`Job ${job.pmNumber || job._id} reviewed: ${action} by ${user.email}`);
    res.json({ message: `Job ${action}d successfully`, job });
  } catch (err) {
    console.error('Review error:', err);
    res.status(500).json({ error: 'Review failed', details: err.message });
  }
});

// === JOB NOTES/CHAT ENDPOINTS ===

// Get notes for a job
app.get('/api/jobs/:id/notes', authenticateUser, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id).select('notes');
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
app.post('/api/jobs/:id/notes', authenticateUser, async (req, res) => {
  try {
    const { message, noteType, dependencyId } = req.body;
    
    if (!message || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const job = await Job.findById(req.params.id);
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
    io.emit(`job-note-${job._id}`, newNote);
    
    res.status(201).json(newNote);
  } catch (err) {
    console.error('Add note error:', err);
    res.status(500).json({ error: 'Failed to add note' });
  }
});

// === JOB DEPENDENCIES MANAGEMENT ===

// Get dependencies for a job
app.get('/api/jobs/:id/dependencies', authenticateUser, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id).select('dependencies');
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
app.post('/api/jobs/:id/dependencies', authenticateUser, async (req, res) => {
  try {
    const { type, description, scheduledDate, ticketNumber, notes } = req.body;
    
    if (!type) {
      return res.status(400).json({ error: 'Dependency type is required' });
    }
    
    const job = await Job.findById(req.params.id);
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
app.put('/api/jobs/:id/dependencies/:depId', authenticateUser, async (req, res) => {
  try {
    const { type, description, status, scheduledDate, completedDate, ticketNumber, notes } = req.body;
    
    const job = await Job.findById(req.params.id);
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
app.delete('/api/jobs/:id/dependencies/:depId', authenticateUser, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
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

// === AI TRAINING DATA ENDPOINTS ===

// Capture pre-field checklist decisions for AI training
app.post('/api/jobs/:id/prefield-checklist', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { decisions } = req.body;  // { usa_dig: { checked: true, notes: "..." }, ... }
    
    // Capture for AI training
    await aiDataCapture.capturePreFieldDecisions(id, decisions, req.userId);
    
    res.json({ message: 'Pre-field checklist captured for AI training' });
  } catch (err) {
    console.error('Capture prefield error:', err);
    res.status(500).json({ error: 'Failed to capture pre-field data' });
  }
});

// Get AI suggestions for a job based on similar past jobs
app.get('/api/jobs/:id/ai-suggestions', authenticateUser, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const suggestions = await aiDataCapture.getAISuggestions({
      city: job.city,
      orderType: job.orderType,
      division: job.division,
      matCode: job.matCode,
      address: job.address
    });
    
    res.json(suggestions);
  } catch (err) {
    console.error('Get AI suggestions error:', err);
    res.status(500).json({ error: 'Failed to get AI suggestions' });
  }
});

// === ADMIN SETUP ENDPOINTS ===

// Setup Alvah company (one-time use)
app.post('/api/admin/setup-alvah', authenticateUser, async (req, res) => {
  try {
    // Only allow admins
    if (!req.isAdmin && req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const results = { created: [], skipped: [], errors: [] };

    // Find or create PG&E utility
    let pgeUtility = await Utility.findOne({ slug: 'pge' });
    if (!pgeUtility) {
      pgeUtility = await Utility.create({
        name: 'Pacific Gas & Electric',
        slug: 'pge',
        region: 'California',
        isActive: true
      });
      results.created.push('PG&E Utility');
    }

    // Company info
    const COMPANY_INFO = {
      name: 'Alvah',
      email: 'info@alvah.com',
      state: 'CA',
    };

    // Users to create
    const USERS = [
      { email: 'leek@alvah.com', name: 'Lee Kizer', password: 'Alvah2025!', role: 'gf', isAdmin: false, canApprove: true },
      { email: 'mattf@alvah.com', name: 'Matt Ferrier', password: 'Alvah2025!', role: 'foreman', isAdmin: false, canApprove: false },
      { email: 'stephens@alvah.com', name: 'Stephen Shay', password: 'Alvah2025!', role: 'foreman', isAdmin: false, canApprove: false },
      { email: 'joeb@alvah.com', name: 'Joe Bodner', password: 'Alvah2025!', role: 'foreman', isAdmin: false, canApprove: false },
    ];

    // Check if company exists
    let company = await Company.findOne({ name: COMPANY_INFO.name });
    
    if (company) {
      results.skipped.push(`Company "${COMPANY_INFO.name}" already exists`);
    } else {
      company = new Company({
        ...COMPANY_INFO,
        utilities: [pgeUtility._id],
        defaultUtility: pgeUtility._id,
        subscription: { plan: 'starter', seats: 10, status: 'active' },
        settings: { timezone: 'America/Los_Angeles', defaultDivision: 'DA' },
        isActive: true
      });
      await company.save();
      results.created.push(`Company "${company.name}"`);
    }

    // Create users
    for (const userData of USERS) {
      const existingUser = await User.findOne({ email: userData.email });
      
      if (existingUser) {
        if (!existingUser.companyId) {
          existingUser.companyId = company._id;
          await existingUser.save();
          results.skipped.push(`${userData.email} - updated companyId`);
        } else {
          results.skipped.push(`${userData.email} - already exists`);
        }
        continue;
      }
      
      const user = new User({
        email: userData.email,
        name: userData.name,
        password: userData.password,
        role: userData.role,
        isAdmin: userData.isAdmin,
        canApprove: userData.canApprove,
        companyId: company._id,
        userType: 'contractor'
      });
      
      await user.save();
      results.created.push(`${userData.role.toUpperCase()} - ${userData.email} (${userData.name})`);
    }

    res.json({
      success: true,
      message: 'Alvah setup complete',
      companyId: company._id,
      results
    });

  } catch (err) {
    console.error('Setup Alvah error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update user to admin
app.post('/api/admin/make-admin/:email', authenticateUser, async (req, res) => {
  try {
    if (!req.isAdmin && req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { email } = req.params;
    const user = await User.findOne({ email: decodeURIComponent(email) });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.isAdmin = true;
    user.role = 'admin';
    user.canApprove = true;
    await user.save();

    res.json({
      success: true,
      message: `${user.name} (${user.email}) is now an admin`,
      user: { id: user._id, name: user.name, email: user.email, role: user.role, isAdmin: user.isAdmin }
    });
  } catch (err) {
    console.error('Make admin error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Capture form field data for AI training
app.post('/api/jobs/:id/capture-form', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { formType, fields, completionTimeSeconds } = req.body;
    
    await aiDataCapture.captureFormCompletion(id, formType, fields, completionTimeSeconds, req.userId);
    
    res.json({ message: 'Form data captured for AI training' });
  } catch (err) {
    console.error('Capture form error:', err);
    res.status(500).json({ error: 'Failed to capture form data' });
  }
});

// === DOCUMENT AUTO-FILL ENDPOINTS ===

// Get auto-fill values for a document type
app.get('/api/jobs/:id/autofill/:documentType', authenticateUser, async (req, res) => {
  try {
    const { id, documentType } = req.params;
    
    const autoFillResult = await documentAutoFill.generateAutoFill(
      documentType.toUpperCase(),
      id,
      req.userId
    );
    
    if (autoFillResult.error) {
      return res.status(400).json({ error: autoFillResult.error });
    }
    
    res.json(autoFillResult);
  } catch (err) {
    console.error('Auto-fill error:', err);
    res.status(500).json({ error: 'Failed to generate auto-fill' });
  }
});

// Get available document types for auto-fill
app.get('/api/autofill/document-types', authenticateUser, async (req, res) => {
  try {
    const types = documentAutoFill.getDocumentTypes();
    res.json(types);
  } catch (err) {
    console.error('Get document types error:', err);
    res.status(500).json({ error: 'Failed to get document types' });
  }
});

// Get full job details including dependencies, notes, schedule info
app.get('/api/jobs/:id/full-details', authenticateUser, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id)
      // Core assignments
      .populate('assignedTo', 'name email role')
      .populate('assignedToGF', 'name email role')
      .populate('userId', 'name email role')
      // Who did what - audit trail
      .populate('assignedBy', 'name email role')
      .populate('assignedToGFBy', 'name email role')
      .populate('crewSubmittedBy', 'name email role')
      .populate('gfReviewedBy', 'name email role')
      .populate('pmApprovedBy', 'name email role')
      .populate('completedBy', 'name email role')
      // Notes
      .populate('notes.userId', 'name email role');
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json(job);
  } catch (err) {
    console.error('Get full details error:', err);
    res.status(500).json({ error: 'Failed to get job details' });
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