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
const mongoose = require('mongoose');
const User = require('../models/User');
const Job = require('../models/Job');
const r2Storage = require('../utils/storage');
const { authenticateUser } = require('../middleware/auth');
const log = require('../utils/logger');

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
const onboardingRoutes = require('./onboarding.routes');

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
// R2 key sanitization (path traversal hardening)
// ---------------------------------------------------------------------------

/**
 * Sanitize an R2 key to prevent path traversal and injection.
 *
 * Uses path.normalize to resolve `.` and `..` segments, then verifies the
 * result doesn't escape the expected prefix structure. Null-bytes, double
 * slashes, and backslashes are stripped.
 *
 * Valid keys look like: `jobs/abc123/photos/img.jpg`, `templates/form.pdf`
 * Invalid keys: `../etc/passwd`, `jobs/../../secret`, empty, or < 3 chars.
 *
 * @param {string} rawKey - Untrusted key from request params
 * @returns {string|null} Sanitized key, or null if invalid
 */
function sanitizeR2Key(rawKey) {
  if (!rawKey || typeof rawKey !== 'string') return null;

  // Strip null bytes (bypass technique)
  let key = rawKey.replace(/\0/g, '');

  // Normalize: resolve `.` and `..` segments, collapse separators
  key = path.normalize(key);

  // path.normalize on Unix leaves leading `/` and converts backslashes.
  // Strip leading slashes/backslashes so the key is always relative.
  key = key.replace(/^[/\\]+/, '');

  // Collapse any remaining double slashes
  key = key.replace(/\/\//g, '/');

  // After normalization, if the key still contains `..` it's an escape attempt
  if (key.includes('..')) return null;

  // Must have a valid prefix (first segment) from our known set
  const validPrefixes = ['jobs', 'templates', 'asbuilt', 'fieldtickets', 'uploads', 'smartforms'];
  const prefix = key.split('/')[0];
  if (!validPrefixes.includes(prefix)) return null;

  // Minimum length sanity check (prefix + / + something)
  if (key.length < 3) return null;

  return key;
}

// ---------------------------------------------------------------------------
// File ownership verification (AuthZ - company-scoped)
// ---------------------------------------------------------------------------

/**
 * Verify that the requesting user's company owns the file referenced by the R2 key.
 *
 * Key structure conventions:
 *   jobs/{jobId}/...          → Job.companyId must match req.companyId
 *   templates/...             → Master templates, any authenticated user OK
 *   asbuilt/{submissionId}/.. → AsBuiltSubmission.companyId must match
 *   fieldtickets/...          → Allow if authenticated (tickets have their own AuthZ)
 *   uploads/...               → Legacy local files, allow if authenticated
 *
 * SuperAdmins bypass all ownership checks.
 *
 * @param {string} fileKey - R2 object key
 * @param {import('express').Request} req - Express request (must have userId, companyId, isSuperAdmin)
 * @returns {Promise<{authorized: boolean, reason?: string}>}
 */
async function verifyFileOwnership(fileKey, req) {
  // SuperAdmins can access any file
  if (req.isSuperAdmin) {
    return { authorized: true };
  }

  // Must have a companyId to access company-scoped files
  if (!req.companyId) {
    return { authorized: false, reason: 'User has no company association' };
  }

  // ---- Parse key to determine ownership scope ----
  const segments = fileKey.split('/');
  const keyPrefix = segments[0];

  switch (keyPrefix) {
    case 'jobs': {
      // Key format: jobs/{jobId}/folderPath/filename
      const jobId = segments[1];
      if (!jobId || !mongoose.Types.ObjectId.isValid(jobId)) {
        return { authorized: false, reason: 'Invalid job ID in file key' };
      }

      const job = await Job.findById(jobId).select('companyId').lean();
      if (!job) {
        return { authorized: false, reason: 'Job not found for file' };
      }

      const jobCompanyId = job.companyId?.toString();
      const userCompanyId = req.companyId?.toString();

      if (!jobCompanyId || !userCompanyId || jobCompanyId !== userCompanyId) {
        return { authorized: false, reason: 'File belongs to a different company' };
      }

      return { authorized: true };
    }

    case 'templates': {
      // Master templates are accessible to any authenticated user
      return { authorized: true };
    }

    case 'asbuilt': {
      // Key format: asbuilt/{submissionId}/sectionType.pdf
      // Allow if user is authenticated with a company — the submission routes
      // already enforce per-submission AuthZ. Doing a full DB lookup here for
      // every image load would be an N+1 on the wizard page. The key contains
      // a submissionId (ObjectId), not a guessable pattern.
      const submissionId = segments[1];
      if (!submissionId || !mongoose.Types.ObjectId.isValid(submissionId)) {
        return { authorized: false, reason: 'Invalid submission ID in file key' };
      }

      // Lazy-load to avoid circular dependency at module level
      let AsBuiltSubmission;
      try { AsBuiltSubmission = require('../models/AsBuiltSubmission'); } catch { /* model may not exist yet */ }

      if (AsBuiltSubmission) {
        const submission = await AsBuiltSubmission.findById(submissionId).select('companyId').lean();
        if (submission) {
          const subCompanyId = submission.companyId?.toString();
          const userCompanyId = req.companyId?.toString();
          if (!subCompanyId || !userCompanyId || subCompanyId !== userCompanyId) {
            return { authorized: false, reason: 'As-built submission belongs to a different company' };
          }
        }
        // If submission not found, it may have been created with a placeholder key
        // during the wizard flow before the submission is persisted. Allow access
        // since the user is authenticated with a valid company.
      }

      return { authorized: true };
    }

    case 'fieldtickets':
    case 'uploads':
    case 'smartforms': {
      // These prefixes are used for various file types.
      // The user is authenticated and has a companyId — fine.
      // Per-resource AuthZ is enforced by the feature routes themselves.
      return { authorized: true };
    }

    default: {
      // Unknown key prefix — deny by default (fail-closed)
      return { authorized: false, reason: `Unknown file key prefix: ${keyPrefix}` };
    }
  }
}

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

  // ---- Get signed URL for a file (AuthZ: company-scoped ownership check) ----
  // SECURITY: This is the ONLY file access endpoint. The old unauthenticated
  // streaming route has been permanently removed (Ghost Ship Audit Fix #1).
  // All file access requires: (1) valid JWT, (2) company ownership verification.
  app.get('/api/files/signed/*key', authenticateUser, async (req, res) => {
    try {
      const fileKey = Array.isArray(req.params.key) ? req.params.key.join('/') : req.params.key;
      const safeKey = sanitizeR2Key(fileKey);

      if (!safeKey) {
        return res.status(400).json({ error: 'Invalid file key', code: 'INVALID_KEY' });
      }

      // ---- AuthZ: Verify company ownership based on R2 key structure ----
      const authzResult = await verifyFileOwnership(safeKey, req);
      if (!authzResult.authorized) {
        log.warn({
          requestId: req.requestId,
          userId: req.userId,
          companyId: req.companyId,
          fileKey: safeKey,
          reason: authzResult.reason
        }, 'File access denied');
        return res.status(403).json({
          error: 'Access denied',
          code: 'FILE_ACCESS_DENIED',
          message: authzResult.reason
        });
      }

      // ---- Generate signed URL (15-minute expiry) ----
      const SIGNED_URL_TTL_SECONDS = 900; // 15 minutes
      const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString();

      if (r2Storage.isR2Configured()) {
        log.info({ requestId: req.requestId, fileKey: safeKey }, 'Generating R2 signed URL');
        const signedUrl = await r2Storage.getSignedDownloadUrl(safeKey, SIGNED_URL_TTL_SECONDS);
        if (signedUrl) {
          log.info({ requestId: req.requestId, fileKey: safeKey, urlHost: new URL(signedUrl).host }, 'R2 signed URL served');
          return res.json({ url: signedUrl, expiresAt, ttlSeconds: SIGNED_URL_TTL_SECONDS });
        }
      }

      // Local file fallback (development without R2)
      const uploadsDir = path.join(__dirname, '..', 'uploads');
      const localPath = path.join(uploadsDir, safeKey);
      // Ensure resolved path is within uploads directory (prevent traversal)
      if (!path.resolve(localPath).startsWith(path.resolve(uploadsDir))) {
        return res.status(403).json({ error: 'Invalid file path', code: 'PATH_TRAVERSAL' });
      }
      if (fs.existsSync(localPath)) {
        return res.json({ url: `/uploads/${safeKey}`, expiresAt: null, ttlSeconds: null, local: true });
      }

      res.status(404).json({ error: 'File not found' });
    } catch (err) {
      log.error({ err, requestId: req.requestId }, 'Signed URL generation failed');
      res.status(500).json({ error: 'Failed to get signed URL' });
    }
  });

  // ---- Authenticated file streaming (local dev fallback only) ----
  // When R2 is NOT configured, the signed URL endpoint returns /uploads/... paths.
  // This route serves those local files with authentication.
  // In production with R2, signed URLs go direct to R2 — this route is never hit.
  app.get('/api/files/local/*key', authenticateUser, async (req, res) => {
    try {
      const fileKey = Array.isArray(req.params.key) ? req.params.key.join('/') : req.params.key;
      const safeKey = sanitizeR2Key(fileKey);
      if (!safeKey) {
        return res.status(400).json({ error: 'Invalid file key', code: 'INVALID_KEY' });
      }

      // AuthZ check
      const authzResult = await verifyFileOwnership(safeKey, req);
      if (!authzResult.authorized) {
        return res.status(403).json({ error: 'Access denied', code: 'FILE_ACCESS_DENIED' });
      }

      const uploadsDir = path.join(__dirname, '..', 'uploads');
      const localPath = path.join(uploadsDir, safeKey);

      // Path traversal prevention
      if (!path.resolve(localPath).startsWith(path.resolve(uploadsDir))) {
        return res.status(403).json({ error: 'Invalid file path', code: 'PATH_TRAVERSAL' });
      }

      if (fs.existsSync(localPath)) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'private, max-age=300');
        return res.sendFile(path.resolve(localPath));
      }

      res.status(404).json({ error: 'File not found' });
    } catch (err) {
      log.error({ err, requestId: req.requestId }, 'Local file streaming failed');
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

  // ---- Authenticated API routes (Ghost Ship Fix: no unauthenticated DB writes) ----
  app.use('/api', authenticateUser, apiRoutes);
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
  app.use('/api/onboarding', authenticateUser, onboardingRoutes);

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
