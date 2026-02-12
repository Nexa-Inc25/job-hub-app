/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Files Controller
 * 
 * Handles file access, streaming, and signed URL generation.
 * Supports both R2 cloud storage and local filesystem fallback.
 */

const path = require('node:path');
const fs = require('node:fs');
const r2Storage = require('../utils/storage');
const { sanitizePath } = require('../utils/sanitize');

/**
 * Get signed URL for authenticated file download
 * 
 * @route GET /api/files/signed/:key
 */
const getSignedUrl = async (req, res) => {
  try {
    // Express 5 wildcard params may be arrays — normalize to slash-joined string
    const fileKey = Array.isArray(req.params.key) ? req.params.key.join('/') : req.params.key;
    
    // Sanitize file key to prevent path traversal
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    const safePath = sanitizePath(fileKey, uploadsDir);
    
    if (r2Storage.isR2Configured()) {
      // For R2, sanitize but allow the original key structure
      const safeKey = fileKey.replaceAll('..', '').replaceAll('//', '/');
      const signedUrl = await r2Storage.getSignedDownloadUrl(safeKey);
      if (signedUrl) {
        return res.json({ url: signedUrl });
      }
    }
    
    // Fallback to local file URL - use sanitized path
    if (safePath && fs.existsSync(safePath)) {
      return res.json({ url: `/uploads/${fileKey.replaceAll('..', '')}` });
    }
    
    res.status(404).json({ error: 'File not found' });
  } catch (err) {
    console.error('Error getting signed URL:', err);
    res.status(500).json({ error: 'Failed to get signed URL' });
  }
};

/**
 * Stream file directly (public access for img/embed loading)
 * Security: Files are only accessible if you know the exact path
 * 
 * @route GET /api/files/:key
 */
const streamFile = async (req, res) => {
  try {
    // Express 5 wildcard params may be arrays — normalize to slash-joined string
    const fileKey = Array.isArray(req.params.key) ? req.params.key.join('/') : req.params.key;
    
    // Sanitize file key to prevent path traversal
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    const safePath = sanitizePath(fileKey, uploadsDir);
    
    if (r2Storage.isR2Configured()) {
      // For R2, sanitize but allow the original key structure
      const safeKey = fileKey.replaceAll('..', '').replaceAll('//', '/');
      const fileData = await r2Storage.getFileStream(safeKey);
      
      if (fileData?.stream) {
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
    
    // Fallback to local file - use sanitized path
    if (safePath && fs.existsSync(safePath)) {
      return res.sendFile(safePath);
    }
    
    // Try direct path in uploads folder for legacy files
    if (fileKey.startsWith('uploads/')) {
      const filename = fileKey.replace('uploads/', '');
      const legacyPath = path.join(uploadsDir, filename);
      if (fs.existsSync(legacyPath)) {
        return res.sendFile(legacyPath);
      }
    }
    
    res.status(404).json({ error: 'File not found', key: fileKey });
  } catch (err) {
    console.error('Error streaming file:', err);
    res.status(500).json({ error: 'Failed to get file' });
  }
};

/**
 * Get content type from file extension
 */
const getContentType = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  const types = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.heic': 'image/heic',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  };
  return types[ext] || 'application/octet-stream';
};

/**
 * Check if file type is allowed
 */
const isAllowedFileType = (mimetype) => {
  const allowedTypes = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];
  return allowedTypes.includes(mimetype);
};

/**
 * Sanitize filename to prevent path traversal
 */
const sanitizeFilename = (filename) => {
  return filename.replaceAll(/[^a-zA-Z0-9._-]/g, '_');
};

module.exports = {
  getSignedUrl,
  streamFile,
  getContentType,
  isAllowedFileType,
  sanitizeFilename
};

