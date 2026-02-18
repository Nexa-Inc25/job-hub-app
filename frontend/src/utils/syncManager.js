/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Sync Manager
 * 
 * Handles syncing offline operations when connectivity is restored.
 * Processes queued operations and photo uploads.
 */

import api from '../api';
import offlineStorage from './offlineStorage';

let isSyncing = false;
let syncListeners = [];
const verboseClientLogs = (import.meta.env.VITE_VERBOSE_CLIENT_LOGS || '').toLowerCase() === 'true';
const logSync = (...args) => {
  if (verboseClientLogs) {
    console.warn(...args);
  }
};

/**
 * Register a listener for sync events
 */
export function onSyncEvent(callback) {
  syncListeners.push(callback);
  return () => {
    syncListeners = syncListeners.filter(cb => cb !== callback);
  };
}

/**
 * Emit a sync event to all listeners
 */
function emitSyncEvent(event, data) {
  syncListeners.forEach(cb => {
    try {
      cb(event, data);
    } catch (e) {
      console.error('Sync listener error:', e);
    }
  });
}

/**
 * Check if we're online
 */
export function isOnline() {
  return navigator.onLine;
}

/**
 * Process a single operation
 */
async function processOperation(op) {
  const { type, data, jobId } = op;

  switch (type) {
    case 'CREATE_JOB':
      return await api.post('/api/jobs', data);

    case 'UPDATE_JOB':
      return await api.put(`/api/jobs/${jobId}`, data);

    case 'UPDATE_STATUS':
      return await api.put(`/api/jobs/${jobId}/status`, data);

    case 'UPLOAD_DOCUMENT': {
      const formData = new FormData();
      // Convert base64 back to blob for upload
      const blob = base64ToBlob(data.base64, data.mimeType);
      formData.append('document', blob, data.fileName);
      formData.append('folderName', data.folderName);
      if (data.subfolderName) formData.append('subfolderName', data.subfolderName);
      return await api.post(`/api/jobs/${jobId}/documents`, formData);
    }

    case 'SUBMIT_FEEDBACK':
      return await api.post('/api/feedback', data);

    default:
      throw new Error(`Unknown operation type: ${type}`);
  }
}

/**
 * Convert base64 string to Blob
 */
function base64ToBlob(base64, mimeType = 'application/octet-stream') {
  const byteCharacters = atob(base64.split(',')[1] || base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.codePointAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

/**
 * Upload a pending photo
 */
async function uploadPendingPhoto(photo) {
  const formData = new FormData();
  
  // Convert base64 to blob
  const blob = base64ToBlob(photo.base64Data, photo.mimeType || 'image/jpeg');
  formData.append('document', blob, photo.fileName);
  formData.append('folderName', photo.folderName);
  if (photo.subfolderName) {
    formData.append('subfolderName', photo.subfolderName);
  }

  return await api.post(`/api/jobs/${photo.jobId}/documents`, formData);
}

/**
 * Sync all pending operations
 */
export async function syncPendingOperations() {
  if (isSyncing) {
    logSync('Sync already in progress...');
    return { synced: 0, failed: 0 };
  }

  if (!isOnline()) {
    logSync('Offline - skipping sync');
    return { synced: 0, failed: 0, offline: true };
  }

  isSyncing = true;
  emitSyncEvent('sync_start', {});

  let synced = 0;
  let failed = 0;

  try {
    // Sync pending operations
    const operations = await offlineStorage.getPendingOperations();
    logSync(`Syncing ${operations.length} pending operations...`);

    for (const op of operations) {
      // Skip operations that have failed too many times
      if (op.retries >= 3) {
        logSync(`Skipping operation ${op.id} after ${op.retries} retries`);
        continue;
      }

      try {
        await offlineStorage.updateOperationStatus(op.id, 'syncing');
        emitSyncEvent('operation_syncing', { id: op.id, type: op.type });

        await processOperation(op);
        
        await offlineStorage.removeOperation(op.id);
        synced++;
        emitSyncEvent('operation_synced', { id: op.id, type: op.type });
      } catch (err) {
        console.error(`Failed to sync operation ${op.id}:`, err);
        await offlineStorage.updateOperationStatus(op.id, 'failed', err.message);
        failed++;
        emitSyncEvent('operation_failed', { id: op.id, type: op.type, error: err.message });
      }
    }

    // Sync pending photos
    const photos = await offlineStorage.getPendingPhotos();
    logSync(`Syncing ${photos.length} pending photos...`);

    for (const photo of photos) {
      try {
        emitSyncEvent('photo_syncing', { id: photo.id, jobId: photo.jobId });

        await uploadPendingPhoto(photo);
        
        await offlineStorage.removePendingPhoto(photo.id);
        synced++;
        emitSyncEvent('photo_synced', { id: photo.id, jobId: photo.jobId });
      } catch (err) {
        console.error(`Failed to sync photo ${photo.id}:`, err);
        failed++;
        emitSyncEvent('photo_failed', { id: photo.id, error: err.message });
      }
    }

    logSync(`Sync complete: ${synced} synced, ${failed} failed`);
    emitSyncEvent('sync_complete', { synced, failed });

    return { synced, failed };
  } finally {
    isSyncing = false;
  }
}

/**
 * Initialize sync manager - set up online/offline listeners (idempotent)
 */
let syncManagerInitialized = false;
export function initSyncManager() {
  if (syncManagerInitialized) return;
  syncManagerInitialized = true;

  // Sync when coming back online
  globalThis.addEventListener('online', () => {
    logSync('Connection restored - starting sync...');
    emitSyncEvent('online', {});
    // Delay slightly to ensure connection is stable
    setTimeout(() => syncPendingOperations(), 2000);
  });

  globalThis.addEventListener('offline', () => {
    logSync('Connection lost - entering offline mode');
    emitSyncEvent('offline', {});
  });

  // Initial sync if online
  if (isOnline()) {
    offlineStorage.getPendingCounts().then(counts => {
      if (counts.total > 0) {
        logSync(`Found ${counts.total} pending items - syncing...`);
        syncPendingOperations();
      }
    });
  }

  // Periodic sync check (every 5 minutes)
  setInterval(() => {
    if (isOnline()) {
      offlineStorage.getPendingCounts().then(counts => {
        if (counts.total > 0) {
          syncPendingOperations();
        }
      });
    }
  }, 5 * 60 * 1000);

  // Clean old cache periodically
  offlineStorage.clearOldCache().then(deleted => {
    if (deleted > 0) {
      logSync(`Cleared ${deleted} old cached items`);
    }
  });
}

const syncManagerExports = {
  isOnline,
  syncPendingOperations,
  initSyncManager,
  onSyncEvent
};

export default syncManagerExports;
