/**
 * Files Controller
 * 
 * Handles file access, streaming, and signed URL generation.
 * Supports both R2 cloud storage and local filesystem fallback.
 */

const path = require('path');
const fs = require('fs');
const r2Storage = require('../utils/storage');

/**
 * Get signed URL for authenticated file download
 * 
 * @route GET /api/files/signed/:key
 */
const getSignedUrl = async (req, res) => {
  try {
    const fileKey = req.params.key;
    
    if (r2Storage.isR2Configured()) {
      const signedUrl = await r2Storage.getSignedDownloadUrl(fileKey);
      if (signedUrl) {
        return res.json({ url: signedUrl });
      }
    }
    
    // Fallback to local file URL
    const localPath = path.join(__dirname, '..', 'uploads', fileKey);
    if (fs.existsSync(localPath)) {
      return res.json({ url: `/uploads/${fileKey}` });
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
    const fileKey = req.params.key;
    
    if (r2Storage.isR2Configured()) {
      const fileData = await r2Storage.getFileStream(fileKey);
      
      if (fileData && fileData.stream) {
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
    const localPath = path.join(__dirname, '..', 'uploads', fileKey);
    if (fs.existsSync(localPath)) {
      return res.sendFile(localPath);
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
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
};

module.exports = {
  getSignedUrl,
  streamFile,
  getContentType,
  isAllowedFileType,
  sanitizeFilename
};

