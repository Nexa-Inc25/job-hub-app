/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const fs = require('node:fs');
const path = require('node:path');
const { r2Breaker } = require('./circuitBreaker');
const log = require('./logger');

const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'fieldledger-uploads';

// Check if R2 is configured - define this first
function isR2Configured() {
  return !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY);
}

/**
 * @deprecated REMOVED — Ghost Ship Audit Fix #1.
 * Do NOT store URLs in MongoDB. Store the raw r2Key only.
 * The frontend resolves keys to signed URLs via GET /api/files/signed/{key}.
 *
 * This function now returns the raw key unchanged so existing callers
 * that haven't been migrated yet don't crash, but the value stored in
 * the DB will be the bare key, not a URL.
 */
function getPublicUrl(r2Key) {
  return r2Key;
}

// Only initialize S3 client if R2 is configured (prevents crash on undefined env vars)
let s3Client = null;
if (isR2Configured()) {
  s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
    // CRITICAL: Cloudflare R2 requires path-style URLs.
    // Without this, the SDK generates virtual-hosted-style signed URLs
    // (e.g. https://BUCKET.ACCOUNT.r2.cloudflarestorage.com/KEY) which
    // resolve to a non-existent host and return 503.
    // Path-style: https://ACCOUNT.r2.cloudflarestorage.com/BUCKET/KEY ← correct
    forcePathStyle: true,
  });
  log.info({ bucket: BUCKET_NAME, endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` }, 'R2 S3Client initialized (path-style)');
} else {
  log.info('R2 not configured - using local storage fallback');
}

// Upload a file to R2 (protected by circuit breaker)
async function uploadFile(localFilePath, r2Key, contentType = 'application/octet-stream') {
  if (!isR2Configured()) {
    log.info('R2 not configured, using local storage');
    return { url: localFilePath, key: r2Key, local: true };
  }

  return r2Breaker.execute(async () => {
    const fileBuffer = fs.readFileSync(localFilePath);
    
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: r2Key,
      Body: fileBuffer,
      ContentType: contentType,
    });

    await s3Client.send(command);
    log.info({ r2Key }, 'Uploaded to R2');
    
    // Zero Public URL: return only the key. Frontend resolves via signed URLs.
    return { key: r2Key, local: false };
  });
}

// Upload a buffer directly to R2 (protected by circuit breaker)
async function uploadBuffer(buffer, r2Key, contentType = 'application/octet-stream') {
  if (!isR2Configured()) {
    log.info('R2 not configured, cannot upload buffer');
    return null;
  }

  return r2Breaker.execute(async () => {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: r2Key,
      Body: buffer,
      ContentType: contentType,
    });

    await s3Client.send(command);
    log.info({ r2Key }, 'Uploaded buffer to R2');
    
    return { key: r2Key };
  });
}

// Get a signed URL for private file access
async function getSignedDownloadUrl(r2Key, expiresIn = 3600) {
  if (!isR2Configured()) {
    log.warn({ r2Key }, 'getSignedDownloadUrl called but R2 not configured');
    return null;
  }

  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: r2Key,
    });

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });

    // Debug: log the signed URL structure (redact signature for security)
    const urlObj = new URL(signedUrl);
    log.info({
      r2Key,
      expiresIn,
      host: urlObj.host,
      pathname: urlObj.pathname,
      hasSignature: urlObj.searchParams.has('X-Amz-Signature'),
      hasCredential: urlObj.searchParams.has('X-Amz-Credential'),
      expires: urlObj.searchParams.get('X-Amz-Expires'),
    }, 'R2 signed URL generated');

    // Sanity check: URL must use path-style (bucket in path, not subdomain)
    // If the bucket name appears as a subdomain, forcePathStyle is not working
    if (urlObj.host.startsWith(`${BUCKET_NAME}.`)) {
      log.error({
        r2Key,
        host: urlObj.host,
        bucket: BUCKET_NAME,
      }, 'CRITICAL: Signed URL uses virtual-hosted style — forcePathStyle not active. R2 will return 503.');
    }

    return signedUrl;
  } catch (error) {
    log.error({ err: error, r2Key, bucket: BUCKET_NAME }, 'R2 signed URL generation failed');
    throw error;
  }
}

// Get file stream directly from R2 (for proxying through backend, protected by circuit breaker)
async function getFileStream(r2Key) {
  if (!isR2Configured()) {
    return null;
  }

  return r2Breaker.execute(async () => {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: r2Key,
    });

    const response = await s3Client.send(command);
    return {
      stream: response.Body,
      contentType: response.ContentType,
      contentLength: response.ContentLength,
    };
  }).catch(error => {
    if (error.name === 'NoSuchKey') {
      return null;
    }
    if (error.code === 'CIRCUIT_OPEN') {
      log.warn('R2 circuit breaker open, cannot fetch file');
      return null;
    }
    log.error({ err: error }, 'R2 get file error');
    throw error;
  });
}

// Delete a file from R2
async function deleteFile(r2Key) {
  if (!isR2Configured()) {
    return false;
  }

  try {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: r2Key,
    });

    await s3Client.send(command);
    log.info({ r2Key }, 'Deleted from R2');
    return true;
  } catch (error) {
    log.error({ err: error }, 'R2 delete error');
    throw error;
  }
}

// List files in a prefix (folder)
async function listFiles(prefix) {
  if (!isR2Configured()) {
    return [];
  }

  try {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: prefix,
    });

    const response = await s3Client.send(command);
    return response.Contents || [];
  } catch (error) {
    log.error({ err: error }, 'R2 list error');
    throw error;
  }
}

// Upload template file
async function uploadTemplate(localFilePath, templateName) {
  const r2Key = `templates/${templateName}`;
  const contentType = 'application/pdf';
  return uploadFile(localFilePath, r2Key, contentType);
}

// Sanitize filename for R2 key (remove/replace URL-unsafe characters)
function sanitizeFileName(fileName) {
  // Replace # with - (common in PM numbers like PM#12345)
  // Replace other URL-unsafe characters with underscores
  return fileName
    .replaceAll('#', '-')  // # breaks URLs (treated as fragment)
    .replaceAll(/[?%&=+<>]/g, '_')  // Other URL-unsafe chars
    .replaceAll(/\s+/g, '_');  // Spaces to underscores
}

// Upload job file (PDF, photo, drawing, etc.)
async function uploadJobFile(localFilePath, jobId, folderPath, fileName) {
  const sanitizedFileName = sanitizeFileName(fileName);
  const r2Key = `jobs/${jobId}/${folderPath}/${sanitizedFileName}`;
  
  // Determine content type
  const ext = path.extname(fileName).toLowerCase();
  const contentTypes = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
  };
  const contentType = contentTypes[ext] || 'application/octet-stream';
  
  return uploadFile(localFilePath, r2Key, contentType);
}

// Upload extracted image (photo, drawing, map)
async function uploadExtractedImage(buffer, jobId, category, fileName) {
  const sanitizedFileName = sanitizeFileName(fileName);
  const r2Key = `jobs/${jobId}/extracted/${category}/${sanitizedFileName}`;
  return uploadBuffer(buffer, r2Key, 'image/jpeg');
}

// Copy a file from one R2 key to another (for renaming)
async function copyFile(sourceKey, destKey) {
  if (!isR2Configured()) {
    throw new Error('R2 storage not configured');
  }
  
  // Get the source file
  const getCommand = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: sourceKey
  });
  
  const sourceObject = await s3Client.send(getCommand);
  
  // Upload to new key
  const putCommand = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: destKey,
    Body: sourceObject.Body,
    ContentType: sourceObject.ContentType
  });
  
  await s3Client.send(putCommand);
  
  log.info({ sourceKey, destKey }, 'Copied R2 file');
  return { sourceKey, destKey };
}

/**
 * Lightweight R2 connectivity check for deep health endpoint.
 * Lists 0 objects — minimal cost, proves auth + network path work.
 * @returns {{ ok: boolean, latencyMs: number, error?: string }}
 */
async function pingStorage() {
  if (!isR2Configured() || !s3Client) {
    return { ok: false, latencyMs: 0, error: 'not_configured' };
  }

  const start = Date.now();
  try {
    await s3Client.send(new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      MaxKeys: 1,
      Prefix: '__health__' // non-existent prefix — returns immediately
    }));
    return { ok: true, latencyMs: Date.now() - start };
  } catch (error) {
    return { ok: false, latencyMs: Date.now() - start, error: error.message };
  }
}

module.exports = {
  isR2Configured,
  uploadFile,
  uploadBuffer,
  getSignedDownloadUrl,
  getFileStream,
  deleteFile,
  copyFile,
  listFiles,
  uploadTemplate,
  uploadJobFile,
  uploadExtractedImage,
  getPublicUrl,
  pingStorage,
  BUCKET_NAME,
};
