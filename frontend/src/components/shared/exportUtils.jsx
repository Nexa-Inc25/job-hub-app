/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
// src/components/shared/exportUtils.js
// Shared utilities for file export functionality

// Default API base URL - must point to Railway backend for file serving
const DEFAULT_API_BASE = import.meta.env.VITE_API_URL || 'https://api.fieldledger.io';

/**
 * Get photo URL from photo object (R2 or local storage)
 */
export const getPhotoUrl = (photo, apiBase = '') => {
  if (!photo) return '';
  if (photo.url?.startsWith('http')) return photo.url;
  if (photo.r2Key) {
    const base = apiBase || DEFAULT_API_BASE;
    return `${base}/api/files/${photo.r2Key}`;
  }
  return photo.url || '';
};

/**
 * Get document URL from document object (R2 or local storage)
 */
export const getDocumentUrl = (doc, apiBase = '') => {
  if (!doc) return '';
  if (doc.url?.startsWith('http')) return doc.url;
  if (doc.r2Key) {
    const base = apiBase || DEFAULT_API_BASE;
    return `${base}/api/files/${doc.r2Key}`;
  }
  if (doc.path) {
    const base = apiBase || DEFAULT_API_BASE;
    return `${base}${doc.path.startsWith('/') ? '' : '/'}${doc.path}`;
  }
  return doc.url || '';
};

/**
 * Download a blob as a file
 */
export const downloadBlob = (blob, filename) => {
  const downloadUrl = globalThis.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  globalThis.URL.revokeObjectURL(downloadUrl);
};

/**
 * Open mailto with subject and body
 */
export const openMailto = (subject, body) => {
  const encodedSubject = encodeURIComponent(subject);
  const encodedBody = encodeURIComponent(body);
  globalThis.location.href = `mailto:?subject=${encodedSubject}&body=${encodedBody}`;
};

/**
 * Try to share file using Web Share API, returns true if successful
 */
export const tryWebShare = async (blob, filename, title, text) => {
  if (!navigator.canShare?.({ files: [new File([blob], filename, { type: blob.type })] })) {
    return false;
  }
  try {
    const file = new File([blob], filename, { type: blob.type });
    await navigator.share({ title, text, files: [file] });
    return true;
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.warn('Web Share failed, falling back to download:', error.message);
    }
    return false;
  }
};

/**
 * Fetch and export folder contents as ZIP to email
 * @param {Object} options - Export options
 * @param {string} options.exportUrl - API URL to fetch ZIP from
 * @param {Object} options.job - Job object for filename/email content
 * @param {string} options.folderName - Name of folder being exported
 * @returns {Promise<{success: boolean, message: string, shared: boolean}>}
 */
export const exportFolderToEmail = async ({ exportUrl, job, folderName = 'GF Audit' }) => {
  const token = localStorage.getItem('token');
  
  // Fetch the ZIP file
  const response = await fetch(exportUrl, {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Export failed');
  }
  
  // Get the ZIP file as blob with explicit MIME type
  const arrayBuffer = await response.arrayBuffer();
  const blob = new Blob([arrayBuffer], { type: 'application/zip' });
  
  // Generate filename and email content
  const jobIdentifier = job.pmNumber || job.woNumber || 'Job';
  const filename = `${jobIdentifier}_${folderName.replaceAll(/\s+/g, '_')}_${Date.now()}.zip`;
  const emailSubject = `${folderName} Photos - ${jobIdentifier} - ${job.address || ''}`;
  const emailBody = `Hi,\n\nPlease find attached the ${folderName} photos for:\n\nJob: ${jobIdentifier}\nAddress: ${job.address || 'N/A'}, ${job.city || ''}\n\nPlease let me know if you have any questions.\n\nBest regards`;
  
  // Try Web Share API first
  const shared = await tryWebShare(blob, filename, emailSubject, emailBody);
  if (shared) {
    return { success: true, message: 'Photos shared successfully', shared: true };
  }
  
  // Fallback: Download ZIP and open mailto
  downloadBlob(blob, filename);
  openMailto(emailSubject, emailBody + `\n\nPlease attach the downloaded file: ${filename}`);
  
  return { success: true, message: 'ZIP downloaded - attach to email', shared: false };
};

