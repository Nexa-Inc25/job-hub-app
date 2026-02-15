/** Copyright (c) 2024-2026 FieldLedger. All Rights Reserved. */
/**
 * Route Loader
 *
 * Auto-discovers and mounts every route module under /api.
 * Extracted from server.js to keep that file focused on
 * app setup, middleware chain, and server startup.
 *
 * @module routes/index
 */

const multer = require('multer');
const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const Job = require('../models/Job');
const r2Storage = require('../utils/storage');
const { authenticateUser } = require('../middleware/auth');

// ---------------------------------------------------------------------------
// Route modules
// ---------------------------------------------------------------------------
const apiRoutes = require('./api');
const proceduresRoutes = require('./procedures.routes');
const asbuiltAssistantRoutes = require('./asbuilt-assistant.routes');
const tailboardRoutes = require('./tailboard.routes');
const priceBookRoutes = require('./pricebook.routes');
const billingRoutes = require('./billing.routes');
const asbuiltRoutes = require('./asbuilt.routes');
const oracleRoutes = require('./oracle.routes');
const timesheetRoutes = require('./timesheet.routes');
const lmeRoutes = require('./lme.routes');
const smartformsRoutes = require('./smartforms.routes');
const demoRoutes = require('./demo.routes');
const notificationRoutes = require('./notification.routes');
const stripeRoutes = require('./stripe.routes');
const fieldTicketRoutes = require('./fieldticket.routes');
const voiceRoutes = require('./voice.routes');
const biddingRoutes = require('./bidding.routes');
const weatherRoutes = require('./weather.routes');
const superadminRoutes = require('./superadmin.routes');
const specsRoutes = require('./specs.routes');
const companyRoutes = require('./company.routes');
const usersRoutes = require('./users.routes');
const qaRoutes = require('./qa.routes');
const feedbackRoutes = require('./feedback.routes');
const utilitiesRoutes = require('./utilities.routes');
const adminPlatformRoutes = require('./admin-platform.routes');
const jobExtendedRoutes = require('./job-extended.routes');
const jobLifecycleRoutes = require('./job-lifecycle.routes');
const jobMiscRoutes = require('./job-misc.routes');
const jobDocumentsRoutes = require('./job-documents.routes');
const jobCoreRoutes = require('./job-core.routes');

// ---------------------------------------------------------------------------
// Inline helpers (previously embedded in server.js)
// ---------------------------------------------------------------------------

/**
 * Admin-only middleware (company admin)
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const requireAdmin = (req, res, next) => {
  if (!req.isAdmin && !req.user?.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// ---------------------------------------------------------------------------
// Inline route handlers extracted from server.js
// ---------------------------------------------------------------------------

/**
 * Build a multer instance for template uploads.
 * Re-uses the same uploads directory created in server.js.
 * @param {string} uploadsDir - Absolute path to uploads directory
 * @returns {multer.Multer}
 */
function buildUploader(uploadsDir) {
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, Date.now() + '-' + safeName);
    }
  });

  const fileFilter = (_req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'image/heic', 'image/heif',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    cb(allowedTypes.includes(file.mimetype) ? null : new Error(`File type ${file.mimetype} not allowed`), allowedTypes.includes(file.mimetype));
  };

  return multer({ storage, fileFilter, limits: { fileSize: 50 * 1024 * 1024 } });
}

/**
 * Register the inline admin-template routes that were previously in server.js.
 * @param {import('express').Express} app
 * @param {string} uploadsDir
 */
function registerInlineRoutes(app, uploadsDir) {
  const upload = buildUploader(uploadsDir);

  // ---- Admin: Upload master template forms ----
  app.post('/api/admin/templates', authenticateUser, requireAdmin, upload.array('templates', 20), async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }

      const uploaded = [];

      if (r2Storage.isR2Configured()) {
        for (const file of req.files) {
          const result = await r2Storage.uploadTemplate(file.path, file.originalname);
          uploaded.push({ name: file.originalname, url: result.key, r2Key: result.key });
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        }
      } else {
        let templatesDir = path.join(__dirname, '..', 'templates', 'master');
        try {
          if (!fs.existsSync(templatesDir)) fs.mkdirSync(templatesDir, { recursive: true });
      } catch (_err) {
        templatesDir = '/tmp/templates/master';
          if (!fs.existsSync(templatesDir)) fs.mkdirSync(templatesDir, { recursive: true });
        }

        for (const file of req.files) {
          const destPath = path.join(templatesDir, file.originalname);
          fs.renameSync(file.path, destPath);
          uploaded.push({ name: file.originalname, path: destPath, url: `/templates/master/${encodeURIComponent(file.originalname)}` });
        }
      }

      res.json({ message: 'Templates uploaded successfully', templates: uploaded });
    } catch (err) {
      console.error('Template upload error:', err.message);
      res.status(500).json({ error: 'Template upload failed: ' + err.message });
    }
  });

  // ---- Get signed URL for a file ----
  app.get('/api/files/signed/*key', authenticateUser, async (req, res) => {
    try {
      const fileKey = Array.isArray(req.params.key) ? req.params.key.join('/') : req.params.key;

      if (r2Storage.isR2Configured()) {
        const signedUrl = await r2Storage.getSignedDownloadUrl(fileKey);
        if (signedUrl) return res.json({ url: signedUrl });
      }

      const localPath = path.join(__dirname, '..', 'uploads', fileKey);
      if (fs.existsSync(localPath)) return res.json({ url: `/uploads/${fileKey}` });

      res.status(404).json({ error: 'File not found' });
    } catch (err) {
      console.error('Error getting signed URL:', err);
      res.status(500).json({ error: 'Failed to get signed URL' });
    }
  });

  // ---- Stream file from R2 (no auth - for direct <img> loading) ----
  app.get('/api/files/*key', async (req, res) => {
    try {
      const fileKey = Array.isArray(req.params.key) ? req.params.key.join('/') : req.params.key;

      if (r2Storage.isR2Configured()) {
        const fileData = await r2Storage.getFileStream(fileKey);
        if (fileData && fileData.stream) {
          res.setHeader('Content-Type', fileData.contentType || 'application/octet-stream');
          if (fileData.contentLength) res.setHeader('Content-Length', fileData.contentLength);
          res.setHeader('Cache-Control', 'public, max-age=3600');
          res.setHeader('Content-Disposition', 'inline');
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.setHeader('Access-Control-Allow-Origin', '*');
          fileData.stream.pipe(res);
          return;
        }
      }

      const localPath = path.join(__dirname, '..', 'uploads', fileKey);
      if (fs.existsSync(localPath)) return res.sendFile(localPath);

      res.status(404).json({ error: 'File not found', key: fileKey });
    } catch (err) {
      console.error('Error getting file:', err);
      res.status(500).json({ error: 'Failed to get file' });
    }
  });

  // ---- List available master templates ----
  app.get('/api/admin/templates', authenticateUser, async (req, res) => {
    try {
      if (r2Storage.isR2Configured()) {
        const r2Files = await r2Storage.listFiles('templates/');
        const templates = r2Files.map(f => ({
          name: f.Key.replace('templates/', ''),
          url: r2Storage.getPublicUrl(f.Key),
          r2Key: f.Key,
          size: f.Size,
          lastModified: f.LastModified
        }));
        return res.json({ templates });
      }

      const templatesDir = path.join(__dirname, '..', 'templates', 'master');
      if (!fs.existsSync(templatesDir)) return res.json({ templates: [] });

      const files = fs.readdirSync(templatesDir);
      res.json({ templates: files.map(f => ({ name: f, url: `/templates/master/${encodeURIComponent(f)}` })) });
    } catch (err) {
      console.error('Error listing templates:', err);
      res.status(500).json({ error: 'Failed to list templates' });
    }
  });

  // ---- Pending approvals ----
  app.get('/api/admin/pending-approvals', authenticateUser, async (req, res) => {
    try {
      const user = await User.findById(req.userId);
      const canApprove = user && (user.canApprove || user.isAdmin || ['gf', 'pm', 'admin'].includes(user.role));

      if (!canApprove) {
        return res.status(403).json({ error: 'You do not have permission to view pending approvals' });
      }

      const jobs = await Job.find({ companyId: user.companyId, isDeleted: { $ne: true } }).select('pmNumber woNumber address folders').lean();

      const pendingDocs = [];
      for (const job of jobs) {
        for (const folder of job.folders || []) {
          for (const doc of folder.documents || []) {
            if (doc.approvalStatus === 'pending_approval') {
              pendingDocs.push({ jobId: job._id, pmNumber: job.pmNumber, woNumber: job.woNumber, address: job.address, folderName: folder.name, document: doc });
            }
          }
          for (const subfolder of folder.subfolders || []) {
            for (const doc of subfolder.documents || []) {
              if (doc.approvalStatus === 'pending_approval') {
                pendingDocs.push({ jobId: job._id, pmNumber: job.pmNumber, woNumber: job.woNumber, address: job.address, folderName: `${folder.name} > ${subfolder.name}`, document: doc });
              }
            }
          }
        }
      }

      res.json({ pendingDocuments: pendingDocs, count: pendingDocs.length });
    } catch (err) {
      console.error('Error fetching pending approvals:', err);
      res.status(500).json({ error: 'Failed to fetch pending approvals' });
    }
  });
}

// ---------------------------------------------------------------------------
// Main export — call once from server.js after body-parsers are mounted
// ---------------------------------------------------------------------------

/**
 * Register all API routes on the Express app.
 *
 * @param {import('express').Express} app - Express application instance
 * @param {Object} opts
 * @param {string} opts.uploadsDir - Absolute path to the uploads directory
 */
function registerRoutes(app, { uploadsDir } = {}) {
  // Inline handlers that must be registered before modular routes
  // (template upload, file serving, pending approvals)
  if (uploadsDir) {
    registerInlineRoutes(app, uploadsDir);
  }

  // ---- Public / self-authenticating routes ----
  app.use('/api', apiRoutes);
  app.use('/api/demo', demoRoutes);
  app.use('/api/oracle', authenticateUser, oracleRoutes);
  app.use('/api/stripe', stripeRoutes);
  app.use('/api/utilities', utilitiesRoutes);

  // ---- Authenticated routes ----
  app.use('/api/billing', authenticateUser, billingRoutes);
  app.use('/api/pricebooks', authenticateUser, priceBookRoutes);
  app.use('/api/fieldtickets', authenticateUser, fieldTicketRoutes);
  app.use('/api/voice', authenticateUser, voiceRoutes);
  app.use('/api/bidding', authenticateUser, biddingRoutes);
  app.use('/api/weather', authenticateUser, weatherRoutes);
  app.use('/api/asbuilt', authenticateUser, asbuiltRoutes);
  app.use('/api/asbuilt-assistant', authenticateUser, asbuiltAssistantRoutes);
  app.use('/api/tailboard', authenticateUser, tailboardRoutes);
  app.use('/api/notifications', authenticateUser, notificationRoutes);
  app.use('/api/smartforms', authenticateUser, smartformsRoutes);
  app.use('/api/procedures', authenticateUser, proceduresRoutes);
  app.use('/api/specs', authenticateUser, specsRoutes);
  app.use('/api/company', authenticateUser, companyRoutes);
  app.use('/api/users', authenticateUser, usersRoutes);
  app.use('/api/qa', authenticateUser, qaRoutes);
  app.use('/api/feedback', authenticateUser, feedbackRoutes);
  app.use('/api/superadmin', authenticateUser, superadminRoutes);
  app.use('/api/admin', authenticateUser, adminPlatformRoutes);

  // ---- Job routes (multiple routers share /api/jobs prefix) ----
  app.use('/api/jobs', authenticateUser, jobCoreRoutes);
  app.use('/api/jobs', authenticateUser, jobDocumentsRoutes);
  app.use('/api/jobs', authenticateUser, jobLifecycleRoutes);
  app.use('/api/jobs', authenticateUser, jobExtendedRoutes);
  app.use('/api/jobs', authenticateUser, jobMiscRoutes);

  // ---- Self-authenticating route modules ----
  app.use('/api/timesheet', timesheetRoutes);
  app.use('/api/lme', lmeRoutes);
}

module.exports = { registerRoutes };
