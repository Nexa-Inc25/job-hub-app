/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Offline Storage Utility
 * 
 * Uses IndexedDB to store:
 * - Pending operations (uploads, form submissions) for sync when online
 * - Cached job data for offline viewing
 * - Captured photos pending upload
 */

const DB_NAME = 'fieldledger-offline';
const DB_VERSION = 1;

// Store names
const STORES = {
  PENDING_OPS: 'pendingOperations',
  CACHED_JOBS: 'cachedJobs',
  PENDING_PHOTOS: 'pendingPhotos',
  USER_DATA: 'userData',
  PENDING_UNITS: 'pendingUnitEntries',  // New store for offline unit entries
  CACHED_PRICEBOOKS: 'cachedPriceBooks', // Cached price book for offline rate lookup
};

let db = null;
let dbInitPromise = null;

/**
 * Initialize the IndexedDB database
 * Uses a cached promise to prevent duplicate opens from concurrent callers.
 */
export async function initOfflineDB() {
  if (db) return db;
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      dbInitPromise = null; // Allow retry on failure
      console.error('Failed to open IndexedDB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      db = request.result;
      // eslint-disable-next-line no-console -- one-time startup info
      console.log('IndexedDB initialized successfully');
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      // Pending operations store (uploads, form submissions, etc.)
      if (!database.objectStoreNames.contains(STORES.PENDING_OPS)) {
        const opsStore = database.createObjectStore(STORES.PENDING_OPS, { 
          keyPath: 'id', 
          autoIncrement: true 
        });
        opsStore.createIndex('type', 'type', { unique: false });
        opsStore.createIndex('jobId', 'jobId', { unique: false });
        opsStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // Cached jobs for offline viewing
      if (!database.objectStoreNames.contains(STORES.CACHED_JOBS)) {
        const jobsStore = database.createObjectStore(STORES.CACHED_JOBS, { 
          keyPath: '_id' 
        });
        jobsStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      // Pending photos (captured but not uploaded)
      if (!database.objectStoreNames.contains(STORES.PENDING_PHOTOS)) {
        const photosStore = database.createObjectStore(STORES.PENDING_PHOTOS, { 
          keyPath: 'id', 
          autoIncrement: true 
        });
        photosStore.createIndex('jobId', 'jobId', { unique: false });
        photosStore.createIndex('folderName', 'folderName', { unique: false });
      }

      // User data cache
      if (!database.objectStoreNames.contains(STORES.USER_DATA)) {
        database.createObjectStore(STORES.USER_DATA, { keyPath: 'key' });
      }

      // Pending unit entries (Digital Receipts waiting for sync)
      if (!database.objectStoreNames.contains(STORES.PENDING_UNITS)) {
        const unitsStore = database.createObjectStore(STORES.PENDING_UNITS, { 
          keyPath: 'offlineId'
        });
        unitsStore.createIndex('jobId', 'jobId', { unique: false });
        unitsStore.createIndex('status', 'syncStatus', { unique: false });
        unitsStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // Cached price books for offline rate lookup
      if (!database.objectStoreNames.contains(STORES.CACHED_PRICEBOOKS)) {
        const pbStore = database.createObjectStore(STORES.CACHED_PRICEBOOKS, { 
          keyPath: '_id' 
        });
        pbStore.createIndex('utilityId', 'utilityId', { unique: false });
        pbStore.createIndex('status', 'status', { unique: false });
      }
    };
  });

  return dbInitPromise;
}

/**
 * Get a transaction and store
 */
function getStore(storeName, mode = 'readonly') {
  if (!db) {
    throw new Error('Database not initialized. Call initOfflineDB first.');
  }
  const tx = db.transaction(storeName, mode);
  return tx.objectStore(storeName);
}

// ==================== PENDING OPERATIONS ====================

/**
 * Queue an operation to be synced when online
 */
export async function queueOperation(operation) {
  await initOfflineDB();
  
  const op = {
    ...operation,
    createdAt: new Date().toISOString(),
    status: 'pending',
    retries: 0
  };

  return new Promise((resolve, reject) => {
    const store = getStore(STORES.PENDING_OPS, 'readwrite');
    const request = store.add(op);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all pending operations
 */
export async function getPendingOperations() {
  await initOfflineDB();
  
  return new Promise((resolve, reject) => {
    const store = getStore(STORES.PENDING_OPS);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Remove a completed operation
 */
export async function removeOperation(id) {
  await initOfflineDB();
  
  return new Promise((resolve, reject) => {
    const store = getStore(STORES.PENDING_OPS, 'readwrite');
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Update operation status
 */
export async function updateOperationStatus(id, status, error = null) {
  await initOfflineDB();
  
  return new Promise((resolve, reject) => {
    const store = getStore(STORES.PENDING_OPS, 'readwrite');
    const getRequest = store.get(id);
    
    getRequest.onsuccess = () => {
      const op = getRequest.result;
      if (op) {
        op.status = status;
        op.lastAttempt = new Date().toISOString();
        if (error) op.lastError = error;
        if (status === 'failed') op.retries = (op.retries || 0) + 1;
        
        const putRequest = store.put(op);
        putRequest.onsuccess = () => resolve(op);
        putRequest.onerror = () => reject(putRequest.error);
      } else {
        resolve(null);
      }
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

// ==================== CACHED JOBS ====================

/**
 * Cache a job for offline viewing
 */
export async function cacheJob(job) {
  await initOfflineDB();
  
  const cachedJob = {
    ...job,
    _cachedAt: new Date().toISOString()
  };

  return new Promise((resolve, reject) => {
    const store = getStore(STORES.CACHED_JOBS, 'readwrite');
    const request = store.put(cachedJob);
    request.onsuccess = () => resolve(cachedJob);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get a cached job
 */
export async function getCachedJob(jobId) {
  await initOfflineDB();
  
  return new Promise((resolve, reject) => {
    const store = getStore(STORES.CACHED_JOBS);
    const request = store.get(jobId);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all cached jobs
 */
export async function getAllCachedJobs() {
  await initOfflineDB();
  
  return new Promise((resolve, reject) => {
    const store = getStore(STORES.CACHED_JOBS);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear old cached jobs (older than 7 days)
 */
export async function clearOldCache() {
  await initOfflineDB();
  
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  
  return new Promise((resolve, reject) => {
    const store = getStore(STORES.CACHED_JOBS, 'readwrite');
    const request = store.openCursor();
    let deleted = 0;
    
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        if (cursor.value._cachedAt < sevenDaysAgo) {
          cursor.delete();
          deleted++;
        }
        cursor.continue();
      } else {
        resolve(deleted);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

// ==================== PENDING PHOTOS ====================

/**
 * Save a photo for later upload
 */
export async function savePendingPhoto(photoData) {
  await initOfflineDB();
  
  const photo = {
    ...photoData,
    capturedAt: new Date().toISOString(),
    status: 'pending'
  };

  return new Promise((resolve, reject) => {
    const store = getStore(STORES.PENDING_PHOTOS, 'readwrite');
    const request = store.add(photo);
    request.onsuccess = () => resolve({ ...photo, id: request.result });
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get pending photos for a job
 */
export async function getPendingPhotos(jobId = null) {
  await initOfflineDB();
  
  return new Promise((resolve, reject) => {
    const store = getStore(STORES.PENDING_PHOTOS);
    
    if (jobId) {
      const index = store.index('jobId');
      const request = index.getAll(jobId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    } else {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    }
  });
}

/**
 * Remove a photo after successful upload
 */
export async function removePendingPhoto(id) {
  await initOfflineDB();
  
  return new Promise((resolve, reject) => {
    const store = getStore(STORES.PENDING_PHOTOS, 'readwrite');
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get count of all pending items
 */
export async function getPendingCounts() {
  await initOfflineDB();
  
  const [ops, photos] = await Promise.all([
    getPendingOperations(),
    getPendingPhotos()
  ]);

  return {
    operations: ops.length,
    photos: photos.length,
    total: ops.length + photos.length
  };
}

// ==================== USER DATA ====================

/**
 * Save user data for offline use
 */
export async function saveUserData(key, value) {
  await initOfflineDB();
  
  return new Promise((resolve, reject) => {
    const store = getStore(STORES.USER_DATA, 'readwrite');
    const request = store.put({ key, value, updatedAt: new Date().toISOString() });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get user data
 */
export async function getUserData(key) {
  await initOfflineDB();
  
  return new Promise((resolve, reject) => {
    const store = getStore(STORES.USER_DATA);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result?.value || null);
    request.onerror = () => reject(request.error);
  });
}

// ==================== PENDING UNIT ENTRIES ====================

/**
 * Save a unit entry for later sync (Digital Receipt)
 * @param {Object} unitData - Complete unit entry data with photos
 */
export async function savePendingUnit(unitData) {
  await initOfflineDB();
  
  // SECURITY NOTE: Math.random() for offline IDs is acceptable - not security-sensitive
  // These IDs are for local IndexedDB tracking only, not auth tokens or session IDs
  const offlineId = `offline_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`; // NOSONAR
  
  const unit = {
    ...unitData,
    offlineId,
    createdAt: new Date().toISOString(),
    syncStatus: 'pending',
    syncAttempts: 0,
    lastSyncError: null,
  };

  return new Promise((resolve, reject) => {
    const store = getStore(STORES.PENDING_UNITS, 'readwrite');
    const request = store.add(unit);
    request.onsuccess = () => resolve({ ...unit, offlineId });
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get pending unit entries for a job
 */
export async function getPendingUnits(jobId = null) {
  await initOfflineDB();
  
  return new Promise((resolve, reject) => {
    const store = getStore(STORES.PENDING_UNITS);
    
    if (jobId) {
      const index = store.index('jobId');
      const request = index.getAll(jobId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    } else {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    }
  });
}

/**
 * Update unit sync status
 */
export async function updateUnitSyncStatus(offlineId, syncStatus, error = null) {
  await initOfflineDB();
  
  return new Promise((resolve, reject) => {
    const store = getStore(STORES.PENDING_UNITS, 'readwrite');
    const request = store.get(offlineId);
    
    request.onsuccess = () => {
      const unit = request.result;
      if (unit) {
        unit.syncStatus = syncStatus;
        unit.lastSyncAttempt = new Date().toISOString();
        if (error) unit.lastSyncError = error;
        if (syncStatus === 'failed') unit.syncAttempts = (unit.syncAttempts || 0) + 1;
        
        const putRequest = store.put(unit);
        putRequest.onsuccess = () => resolve(unit);
        putRequest.onerror = () => reject(putRequest.error);
      } else {
        resolve(null);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Remove synced unit entry
 */
export async function removePendingUnit(offlineId) {
  await initOfflineDB();
  
  return new Promise((resolve, reject) => {
    const store = getStore(STORES.PENDING_UNITS, 'readwrite');
    const request = store.delete(offlineId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// ==================== CACHED PRICE BOOKS ====================

/**
 * Cache a price book for offline rate lookup
 */
export async function cachePriceBook(priceBook) {
  await initOfflineDB();
  
  const cached = {
    ...priceBook,
    _cachedAt: new Date().toISOString()
  };

  return new Promise((resolve, reject) => {
    const store = getStore(STORES.CACHED_PRICEBOOKS, 'readwrite');
    const request = store.put(cached);
    request.onsuccess = () => resolve(cached);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get cached price book for a utility
 */
export async function getCachedPriceBook(utilityId) {
  await initOfflineDB();
  
  return new Promise((resolve, reject) => {
    const store = getStore(STORES.CACHED_PRICEBOOKS);
    const index = store.index('utilityId');
    const request = index.getAll(utilityId);
    
    request.onsuccess = () => {
      const books = request.result || [];
      // Return active one, or most recently cached
      const active = books.find(b => b.status === 'active');
      resolve(active || books[0] || null);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all cached price books
 */
export async function getAllCachedPriceBooks() {
  await initOfflineDB();
  
  return new Promise((resolve, reject) => {
    const store = getStore(STORES.CACHED_PRICEBOOKS);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

// ==================== OPTIMISTIC SYNC HELPERS ====================

/**
 * Save data optimistically with immediate local persistence
 * Returns immediately - sync happens in background
 * @param {string} endpoint - API endpoint this will sync to
 * @param {Object} data - Data to save
 * @returns {Promise<Object>} Saved item with offlineId
 */
export async function saveOptimistically(endpoint, data) {
  await initOfflineDB();
  
  // SECURITY NOTE: Math.random() for offline IDs is acceptable - not security-sensitive
  const offlineId = `offline_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`; // NOSONAR
  
  const item = {
    type: 'sync',
    endpoint,
    method: 'POST',
    data: {
      ...data,
      offlineId,
    },
    offlineId,
    createdAt: new Date().toISOString(),
    status: 'pending',
    retries: 0,
  };

  return new Promise((resolve, reject) => {
    const store = getStore(STORES.PENDING_OPS, 'readwrite');
    const request = store.add(item);
    request.onsuccess = () => resolve({ id: request.result, offlineId, ...item });
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get pending sync items for a specific endpoint
 */
export async function getPendingSyncItems(endpoint) {
  await initOfflineDB();
  
  const ops = await getPendingOperations();
  return ops.filter(op => op.type === 'sync' && op.endpoint === endpoint && op.status !== 'synced');
}

/**
 * Mark item as synced and remove from pending
 */
export async function markSynced(id) {
  return removeOperation(id);
}

/**
 * Get sync statistics
 */
export async function getSyncStats() {
  await initOfflineDB();
  
  const [ops, photos, units] = await Promise.all([
    getPendingOperations(),
    getPendingPhotos(),
    getPendingUnits(),
  ]);

  const pendingSync = ops.filter(op => op.status === 'pending');
  const failedSync = ops.filter(op => op.status === 'failed');

  return {
    pendingOperations: pendingSync.length,
    failedOperations: failedSync.length,
    pendingPhotos: photos.length,
    pendingUnits: units.filter(u => u.syncStatus === 'pending').length,
    totalPending: pendingSync.length + photos.length + units.filter(u => u.syncStatus === 'pending').length,
    lastUpdate: new Date().toISOString(),
  };
}

const offlineStorageExports = {
  initOfflineDB,
  queueOperation,
  getPendingOperations,
  removeOperation,
  updateOperationStatus,
  cacheJob,
  getCachedJob,
  getAllCachedJobs,
  clearOldCache,
  savePendingPhoto,
  getPendingPhotos,
  removePendingPhoto,
  getPendingCounts,
  saveUserData,
  getUserData,
  // Unit entries
  savePendingUnit,
  getPendingUnits,
  updateUnitSyncStatus,
  removePendingUnit,
  // Price books
  cachePriceBook,
  getCachedPriceBook,
  getAllCachedPriceBooks,
  // Optimistic sync
  saveOptimistically,
  getPendingSyncItems,
  markSynced,
  getSyncStats,
};

export default offlineStorageExports;
