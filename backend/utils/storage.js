/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const fs = require('node:fs');
const path = require('node:path');
const { r2Breaker } = require('./circuitBreaker');

const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'fieldledger-uploads';
// Cloudflare Worker URL for direct file serving (bypasses Railway for faster loads)
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || null; // e.g., 'https://founder-30a.workers.dev'

// Check if R2 is configured - define this first
function isR2Configured() {
  return !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY);
}

// Get direct public URL for a file (uses Cloudflare Worker if configured)
function getPublicUrl(r2Key) {
  if (R2_PUBLIC_URL) {
    return `${R2_PUBLIC_URL}/${r2Key}`;
  }
  // Fallback to Railway proxy
  return `/api/files/${r2Key}`;
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
  });
  console.log('R2 S3Client initialized successfully');
} else {
  console.log('R2 not configured - using local storage fallback');
}

// Upload a file to R2 (protected by circuit breaker)
async function uploadFile(localFilePath, r2Key, contentType = 'application/octet-stream') {
  if (!isR2Configured()) {
    console.log('R2 not configured, using local storage');
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
    
    // Return the public URL (if bucket is public) or the key for signed URLs
    const url = `https://${BUCKET_NAME}.${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${r2Key}`;
    console.log(`Uploaded to R2: ${r2Key}`);
    
    return { url, key: r2Key, local: false };
  });
}

// Upload a buffer directly to R2
async function uploadBuffer(buffer, r2Key, contentType = 'application/octet-stream') {
  if (!isR2Configured()) {
    console.log('R2 not configured, cannot upload buffer');
    return null;
  }

  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: r2Key,
      Body: buffer,
      ContentType: contentType,
    });

    await s3Client.send(command);
    console.log(`Uploaded buffer to R2: ${r2Key}`);
    
    return { key: r2Key };
  } catch (error) {
    console.error('R2 buffer upload error:', error);
    throw error;
  }
}

// Get a signed URL for private file access
async function getSignedDownloadUrl(r2Key, expiresIn = 3600) {
  if (!isR2Configured()) {
    return null;
  }

  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: r2Key,
    });

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });
    return signedUrl;
  } catch (error) {
    console.error('R2 signed URL error:', error);
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
      console.warn('R2 circuit breaker open, cannot fetch file');
      return null;
    }
    console.error('R2 get file error:', error);
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
    console.log(`Deleted from R2: ${r2Key}`);
    return true;
  } catch (error) {
    console.error('R2 delete error:', error);
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
    console.error('R2 list error:', error);
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
  
  console.log(`Copied R2 file: ${sourceKey} -> ${destKey}`);
  return { sourceKey, destKey };
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
  BUCKET_NAME,
  R2_PUBLIC_URL,
};
