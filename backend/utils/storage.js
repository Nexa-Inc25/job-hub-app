const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const fs = require('fs');
const path = require('path');

const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'job-hub-uploads';

// Check if R2 is configured - define this first
function isR2Configured() {
  return !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY);
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

// Upload a file to R2
async function uploadFile(localFilePath, r2Key, contentType = 'application/octet-stream') {
  if (!isR2Configured()) {
    console.log('R2 not configured, using local storage');
    return { url: localFilePath, key: r2Key, local: true };
  }

  try {
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
  } catch (error) {
    console.error('R2 upload error:', error);
    throw error;
  }
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

// Upload job file (PDF, photo, drawing, etc.)
async function uploadJobFile(localFilePath, jobId, folderPath, fileName) {
  const r2Key = `jobs/${jobId}/${folderPath}/${fileName}`;
  
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
  const r2Key = `jobs/${jobId}/extracted/${category}/${fileName}`;
  return uploadBuffer(buffer, r2Key, 'image/jpeg');
}

module.exports = {
  isR2Configured,
  uploadFile,
  uploadBuffer,
  getSignedDownloadUrl,
  deleteFile,
  listFiles,
  uploadTemplate,
  uploadJobFile,
  uploadExtractedImage,
  BUCKET_NAME,
};
