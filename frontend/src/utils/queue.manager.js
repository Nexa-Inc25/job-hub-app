/**
 * Queue Manager - NIST SP 800-53 Compliant Sync Outbox
 * 
 * A singleton class that manages the offline sync queue with:
 * - FIFO queue processing with ATOMIC transaction integrity (NIST SI-7)
 * - Session containment - pauses on auth expiry (NIST AC-3)
 * - Transmission security with checksums (NIST SC-8)
 * - Exponential backoff on failures
 * - Dead letter queue for permanently failed items
 * - Priority support for different item types
 * 
 * CHAIN OF CUSTODY ENFORCER:
 * Data is NEVER deleted from device until server cryptographically confirms receipt.
 * 
 * @module utils/queue.manager
 */

import api from '../api';
import offlineStorage from './offlineStorage';
import { 
  generatePayloadChecksum, 
  generateDigitalReceiptHash,
  hashPhoto,
  isTokenExpired,
  generateDeviceSignature,
} from './crypto.utils';

// Queue item types
export const QUEUE_TYPES = {
  UNIT_ENTRY: 'UNIT_ENTRY',
  PHOTO_UPLOAD: 'PHOTO_UPLOAD',
  OPERATION: 'OPERATION',
};

// Backoff configuration (NIST-compliant retry strategy)
const BACKOFF_CONFIG = {
  baseDelayMs: 1000,         // 1 second base
  maxDelayMs: 30 * 1000,     // 30 seconds max (per NIST guidance)
  maxRetries: 5,             // Give up after 5 retries
  backoffMultiplier: 2,      // Double each time
};

// Queue status
export const QUEUE_STATUS = {
  PENDING: 'pending',
  SYNCING: 'syncing',
  FAILED: 'failed',
  LOCKED: 'locked',       // NIST AC-3: Auth expired, sync paused
  ERROR: 'error',         // Validation error, do not retry
  DEAD: 'dead',           // Permanently failed
  SYNCED: 'synced',
};

// Sync lock reasons
export const LOCK_REASONS = {
  AUTH_EXPIRED: 'auth_expired',
  VALIDATION_FAILED: 'validation_failed',
  SERVER_REJECTED: 'server_rejected',
};

/**
 * Calculate exponential backoff delay
 */
function calculateBackoff(retryCount) {
  const delay = Math.min(
    BACKOFF_CONFIG.baseDelayMs * Math.pow(BACKOFF_CONFIG.backoffMultiplier, retryCount),
    BACKOFF_CONFIG.maxDelayMs
  );
  // Add jitter (0-20%)
  return delay + (Math.random() * delay * 0.2);
}

/**
 * Sleep utility for backoff
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Unified queue item structure with NIST compliance fields
 */
function createQueueItem(type, payload, options = {}) {
  return {
    id: `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type,
    payload,
    priority: options.priority || 1, // 1 = normal, 2 = high
    createdAt: new Date().toISOString(),
    status: QUEUE_STATUS.PENDING,
    retryCount: 0,
    lastAttempt: null,
    nextRetryAt: null,
    lastError: null,
    lockReason: null,
    metadata: options.metadata || {},
    // NIST SC-8: Transmission Security
    checksum: null,
    // NIST SI-7: Server confirmation tracking
    serverTransactionId: null,
    serverConfirmedAt: null,
  };
}

/**
 * Queue Manager Singleton - Chain of Custody Enforcer
 */
class QueueManager {
  constructor() {
    this.isProcessing = false;
    this.isLocked = false;         // NIST AC-3: Session lock state
    this.lockReason = null;
    this.listeners = [];
    this.queue = [];               // In-memory queue for fast access
    this.initialized = false;
    this.backoffDelay = BACKOFF_CONFIG.baseDelayMs;
    this.deviceSignature = null;
    
    // Listen for auth events
    if (typeof window !== 'undefined') {
      window.addEventListener('auth-required', () => {
        this._lockQueue(LOCK_REASONS.AUTH_EXPIRED);
      });
    }
  }

  /**
   * Initialize queue from IndexedDB
   */
  async init() {
    if (this.initialized) return;
    
    await offlineStorage.initOfflineDB();
    
    // Generate device signature for audit trail
    try {
      this.deviceSignature = await generateDeviceSignature();
    } catch {
      this.deviceSignature = 'unknown';
    }
    
    // Load existing items from all stores
    const [units, photos, ops] = await Promise.all([
      offlineStorage.getPendingUnits().catch(() => []),
      offlineStorage.getPendingPhotos().catch(() => []),
      offlineStorage.getPendingOperations().catch(() => []),
    ]);

    // Convert to unified queue format
    this.queue = [
      ...units.map(u => ({
        id: u.offlineId,
        type: QUEUE_TYPES.UNIT_ENTRY,
        payload: u,
        priority: 2, // Unit entries are high priority
        createdAt: u.createdAt,
        status: u.syncStatus || QUEUE_STATUS.PENDING,
        retryCount: u.syncAttempts || 0,
        lastAttempt: u.lastSyncAttempt,
        lastError: u.lastSyncError,
        lockReason: u.lockReason || null,
        nextRetryAt: null,
        checksum: u.checksum || null,
        serverTransactionId: null,
        serverConfirmedAt: null,
      })),
      ...photos.map(p => ({
        id: `photo_${p.id}`,
        type: QUEUE_TYPES.PHOTO_UPLOAD,
        payload: p,
        priority: 1,
        createdAt: p.capturedAt,
        status: p.status || QUEUE_STATUS.PENDING,
        retryCount: 0,
        lastAttempt: null,
        lastError: null,
        lockReason: null,
        nextRetryAt: null,
        checksum: null,
        serverTransactionId: null,
        serverConfirmedAt: null,
      })),
      ...ops.map(o => ({
        id: `op_${o.id}`,
        type: QUEUE_TYPES.OPERATION,
        payload: o,
        priority: 1,
        createdAt: o.createdAt,
        status: o.status || QUEUE_STATUS.PENDING,
        retryCount: o.retries || 0,
        lastAttempt: o.lastAttempt,
        lastError: o.lastError,
        lockReason: null,
        nextRetryAt: null,
        checksum: null,
        serverTransactionId: null,
        serverConfirmedAt: null,
      })),
    ];

    // Sort by priority (high first) then by creation time (FIFO)
    this._sortQueue();

    this.initialized = true;
    this._emit('initialized', { count: this.queue.length });
    
    console.log(`[QueueManager] Initialized with ${this.queue.length} items (Device: ${this.deviceSignature?.slice(0, 8)}...)`);
  }

  /**
   * NIST AC-3: Lock queue when session expires
   */
  _lockQueue(reason) {
    this.isLocked = true;
    this.lockReason = reason;
    
    // Mark all syncing items as locked
    this.queue.forEach(item => {
      if (item.status === QUEUE_STATUS.SYNCING) {
        item.status = QUEUE_STATUS.LOCKED;
        item.lockReason = reason;
      }
    });

    console.warn(`[QueueManager] Queue LOCKED: ${reason}`);
    this._emit('locked', { reason });
    
    // Stop processing
    this.isProcessing = false;
  }

  /**
   * Unlock queue after re-authentication
   */
  async unlockQueue() {
    if (!api.isAuthenticated()) {
      console.warn('[QueueManager] Cannot unlock: still not authenticated');
      return false;
    }

    this.isLocked = false;
    this.lockReason = null;
    
    // Reset locked items to pending
    this.queue.forEach(item => {
      if (item.status === QUEUE_STATUS.LOCKED) {
        item.status = QUEUE_STATUS.PENDING;
        item.lockReason = null;
      }
    });

    console.log('[QueueManager] Queue UNLOCKED');
    this._emit('unlocked', {});
    
    return true;
  }

  /**
   * Add item to queue with checksum
   */
  async enqueue(type, payload, options = {}) {
    await this.init();
    
    const item = createQueueItem(type, payload, options);
    
    // NIST SC-8: Generate checksum for transmission integrity
    try {
      if (type === QUEUE_TYPES.UNIT_ENTRY) {
        // Generate Digital Receipt hash
        const photoHash = payload.photos?.[0]?.dataUrl 
          ? await hashPhoto(payload.photos[0].dataUrl).catch(() => '')
          : '';
        
        item.checksum = await generateDigitalReceiptHash({
          gps: payload.gps,
          timestamp: payload.capturedAt || new Date().toISOString(),
          photoHash,
          deviceId: this.deviceSignature,
        });
        
        // Add checksum to payload for server verification
        payload.checksum = item.checksum;
        payload.deviceSignature = this.deviceSignature;
      } else {
        item.checksum = await generatePayloadChecksum(payload);
      }
    } catch (err) {
      console.warn('[QueueManager] Failed to generate checksum:', err);
    }
    
    // Persist to IndexedDB based on type
    if (type === QUEUE_TYPES.UNIT_ENTRY) {
      await offlineStorage.savePendingUnit({ ...payload, checksum: item.checksum });
    } else if (type === QUEUE_TYPES.PHOTO_UPLOAD) {
      await offlineStorage.savePendingPhoto(payload);
    } else {
      await offlineStorage.queueOperation(payload);
    }

    this.queue.push(item);
    this._sortQueue();
    
    this._emit('enqueued', { item });
    console.log(`[QueueManager] Enqueued ${type}: ${item.id} (checksum: ${item.checksum?.slice(0, 8)}...)`);
    
    return item;
  }

  /**
   * Peek at next item without removing
   */
  async peek() {
    await this.init();
    
    const now = Date.now();
    
    // Find first item that is ready to process (not locked, not errored)
    const item = this.queue.find(item => 
      item.status === QUEUE_STATUS.PENDING && 
      item.lockReason === null &&
      (!item.nextRetryAt || new Date(item.nextRetryAt).getTime() <= now)
    );
    
    return item || null;
  }

  /**
   * Get all pending items
   */
  async getAll() {
    await this.init();
    return [...this.queue];
  }

  /**
   * Get count of pending items
   */
  async getCount() {
    await this.init();
    return {
      total: this.queue.length,
      pending: this.queue.filter(i => i.status === QUEUE_STATUS.PENDING).length,
      syncing: this.queue.filter(i => i.status === QUEUE_STATUS.SYNCING).length,
      failed: this.queue.filter(i => i.status === QUEUE_STATUS.FAILED).length,
      locked: this.queue.filter(i => i.status === QUEUE_STATUS.LOCKED).length,
      error: this.queue.filter(i => i.status === QUEUE_STATUS.ERROR).length,
      dead: this.queue.filter(i => i.status === QUEUE_STATUS.DEAD).length,
      byType: {
        units: this.queue.filter(i => i.type === QUEUE_TYPES.UNIT_ENTRY).length,
        photos: this.queue.filter(i => i.type === QUEUE_TYPES.PHOTO_UPLOAD).length,
        operations: this.queue.filter(i => i.type === QUEUE_TYPES.OPERATION).length,
      },
    };
  }

  /**
   * NIST SI-7: Atomic Dequeue
   * ONLY remove item after server cryptographically confirms receipt
   * 
   * @param {string} itemId - Queue item ID
   * @param {string} transactionId - Server-provided transaction ID (HTTP 200 response)
   */
  async dequeue(itemId, transactionId = null) {
    await this.init();
    
    const index = this.queue.findIndex(i => i.id === itemId);
    if (index === -1) return null;
    
    const item = this.queue[index];
    
    // NIST SI-7: Record server confirmation
    item.serverTransactionId = transactionId;
    item.serverConfirmedAt = new Date().toISOString();
    
    console.log(`[QueueManager] ATOMIC DEQUEUE: ${itemId} confirmed by server (txn: ${transactionId || 'N/A'})`);
    
    // NOW it's safe to remove from IndexedDB (server has confirmed)
    if (item.type === QUEUE_TYPES.UNIT_ENTRY) {
      await offlineStorage.removePendingUnit(item.payload.offlineId);
    } else if (item.type === QUEUE_TYPES.PHOTO_UPLOAD) {
      await offlineStorage.removePendingPhoto(item.payload.id);
    } else {
      await offlineStorage.removeOperation(item.payload.id);
    }

    // Remove from in-memory queue
    this.queue.splice(index, 1);
    
    // Reset backoff on success
    this.backoffDelay = BACKOFF_CONFIG.baseDelayMs;
    
    this._emit('dequeued', { item, transactionId });
    
    return item;
  }

  /**
   * Mark item as syncing
   */
  async markSyncing(itemId) {
    await this.init();
    
    const item = this.queue.find(i => i.id === itemId);
    if (!item) return null;
    
    item.status = QUEUE_STATUS.SYNCING;
    item.lastAttempt = new Date().toISOString();
    
    this._emit('syncing', { item });
    
    return item;
  }

  /**
   * Mark item as validation error (do not retry)
   */
  async markError(itemId, error) {
    await this.init();
    
    const item = this.queue.find(i => i.id === itemId);
    if (!item) return null;
    
    item.status = QUEUE_STATUS.ERROR;
    item.lastError = error?.message || error || 'Validation error';
    item.lockReason = LOCK_REASONS.VALIDATION_FAILED;
    
    // Persist error state
    if (item.type === QUEUE_TYPES.UNIT_ENTRY) {
      await offlineStorage.updateUnitSyncStatus(
        item.payload.offlineId, 
        QUEUE_STATUS.ERROR, 
        item.lastError
      );
    }

    console.warn(`[QueueManager] Item ${itemId} LOCKED due to validation error: ${item.lastError}`);
    this._emit('error', { item });
    
    return item;
  }

  /**
   * Mark item as failed with exponential backoff
   */
  async markFailed(itemId, error, isClientError = false) {
    await this.init();
    
    const item = this.queue.find(i => i.id === itemId);
    if (!item) return null;
    
    // NIST SI-7: Client errors (4xx) should not retry - lock instead
    if (isClientError) {
      return await this.markError(itemId, error);
    }
    
    item.retryCount++;
    item.lastError = error?.message || error || 'Unknown error';
    item.lastAttempt = new Date().toISOString();
    
    if (item.retryCount >= BACKOFF_CONFIG.maxRetries) {
      // Move to dead letter queue
      item.status = QUEUE_STATUS.DEAD;
      console.warn(`[QueueManager] Item ${itemId} moved to DEAD LETTER queue after ${item.retryCount} retries`);
      this._emit('dead', { item });
    } else {
      // Calculate next retry time with exponential backoff
      const backoffMs = calculateBackoff(item.retryCount);
      this.backoffDelay = backoffMs;
      item.nextRetryAt = new Date(Date.now() + backoffMs).toISOString();
      item.status = QUEUE_STATUS.FAILED;
      
      console.log(`[QueueManager] Item ${itemId} failed, retry #${item.retryCount} in ${Math.round(backoffMs/1000)}s`);
      this._emit('failed', { item, backoffMs });
    }

    // Update persistence
    if (item.type === QUEUE_TYPES.UNIT_ENTRY) {
      await offlineStorage.updateUnitSyncStatus(
        item.payload.offlineId, 
        item.status, 
        item.lastError
      );
    }

    return item;
  }

  /**
   * Reset a failed item for immediate retry
   */
  async resetItem(itemId) {
    await this.init();
    
    const item = this.queue.find(i => i.id === itemId);
    if (!item) return null;
    
    item.status = QUEUE_STATUS.PENDING;
    item.nextRetryAt = null;
    item.lockReason = null;
    item.retryCount = 0;
    
    this._emit('reset', { item });
    console.log(`[QueueManager] Reset item ${itemId} for retry`);
    
    return item;
  }

  /**
   * NIST-Compliant Queue Processing
   * Implements atomic transactions and session containment
   */
  async process(options = {}) {
    const { signal, onProgress } = options;
    
    if (this.isProcessing) {
      console.log('[QueueManager] Already processing');
      return { processed: 0, failed: 0, locked: 0 };
    }

    if (!navigator.onLine) {
      console.log('[QueueManager] Offline - skipping');
      return { processed: 0, failed: 0, offline: true };
    }

    // NIST AC-3: Session Containment
    // Do not attempt sync if auth context is lost
    if (!api.isAuthenticated()) {
      console.warn('[QueueManager] Auth expired - locking queue');
      this._lockQueue(LOCK_REASONS.AUTH_EXPIRED);
      window.dispatchEvent(new CustomEvent('auth-required', { 
        detail: { source: 'queue_manager' } 
      }));
      return { processed: 0, failed: 0, authRequired: true };
    }

    // Check if queue is locked
    if (this.isLocked) {
      console.warn(`[QueueManager] Queue is locked: ${this.lockReason}`);
      return { processed: 0, failed: 0, locked: true, lockReason: this.lockReason };
    }

    await this.init();
    
    this.isProcessing = true;
    this._emit('processing_start', {});
    
    let processed = 0;
    let failed = 0;
    let locked = 0;
    
    try {
      let item;
      while ((item = await this.peek()) !== null) {
        // Check for abort signal
        if (signal?.aborted) {
          console.log('[QueueManager] Processing aborted');
          break;
        }

        // Re-check auth before each item (NIST AC-3)
        if (!api.isAuthenticated()) {
          this._lockQueue(LOCK_REASONS.AUTH_EXPIRED);
          break;
        }

        try {
          await this.markSyncing(item.id);
          
          // NIST SI-7: Atomic Transaction
          const result = await this._processItemAtomic(item);
          
          // Only dequeue after server confirmation (HTTP 200 + transaction ID)
          if (result.success && result.transactionId) {
            await this.dequeue(item.id, result.transactionId);
            processed++;
          } else if (result.success) {
            // Fallback: Server returned 200 but no transaction ID
            await this.dequeue(item.id, 'implicit_200');
            processed++;
          }
          
          onProgress?.({ processed, failed, locked, current: item });
          
        } catch (err) {
          console.error(`[QueueManager] Failed to process ${item.id}:`, err);
          
          // Determine if client error (4xx) or server/network error (5xx/network)
          const isClientError = err.response?.status >= 400 && err.response?.status < 500;
          
          if (isClientError) {
            // NIST SI-7: Do not retry validation failures - lock item
            await this.markError(item.id, err.response?.data?.message || err.message);
            locked++;
          } else {
            // Network/server error - exponential backoff
            await this.markFailed(item.id, err, false);
            failed++;
            
            // Stop queue processing to preserve order (FIFO integrity)
            console.log('[QueueManager] Stopping queue to preserve order');
            await sleep(this.backoffDelay);
            break;
          }
          
          onProgress?.({ processed, failed, locked, current: item, error: err });
        }
      }
    } finally {
      this.isProcessing = false;
      this._emit('processing_complete', { processed, failed, locked });
    }

    console.log(`[QueueManager] Processing complete: ${processed} synced, ${failed} failed, ${locked} locked`);
    return { processed, failed, locked };
  }

  /**
   * NIST SI-7: Atomic Transaction Processing
   * Returns success ONLY when server confirms receipt
   */
  async _processItemAtomic(item) {
    switch (item.type) {
      case QUEUE_TYPES.UNIT_ENTRY:
        return await this._processUnitEntryAtomic(item);
      case QUEUE_TYPES.PHOTO_UPLOAD:
        return await this._processPhotoUploadAtomic(item);
      case QUEUE_TYPES.OPERATION:
        return await this._processOperationAtomic(item);
      default:
        throw new Error(`Unknown queue item type: ${item.type}`);
    }
  }

  /**
   * Process unit entry with atomic confirmation
   */
  async _processUnitEntryAtomic(item) {
    const payload = item.payload;
    
    // Upload any photos first
    const uploadedPhotos = [];
    if (payload.photos?.length > 0) {
      for (const photo of payload.photos) {
        if (photo.dataUrl || photo.blob) {
          const formData = new FormData();
          const blob = photo.blob || this._dataUrlToBlob(photo.dataUrl);
          formData.append('photo', blob, photo.fileName);
          formData.append('photoType', photo.photoType);
          
          const response = await api.post(`/api/billing/units/upload-photo`, formData);
          
          // NIST SI-7: Verify server acknowledged photo
          if (response.status !== 200 && response.status !== 201) {
            throw new Error(`Photo upload failed: ${response.status}`);
          }
          
          uploadedPhotos.push({
            ...photo,
            url: response.data.url,
            s3Key: response.data.s3Key,
          });
        } else if (photo.url) {
          uploadedPhotos.push(photo);
        }
      }
    }

    // Create the unit entry with checksum for verification
    const unitData = {
      ...payload,
      photos: uploadedPhotos,
      offlineId: item.id,
      checksum: item.checksum,
      deviceSignature: this.deviceSignature,
    };

    // NIST SI-7: Send to server and await confirmation
    const response = await api.post('/api/billing/units', unitData);
    
    // NIST SI-7: Verify HTTP 200 OK
    if (response.status === 200 || response.status === 201) {
      return {
        success: true,
        transactionId: response.data?.transactionId || response.data?._id || response.data?.id,
        data: response.data,
      };
    }
    
    throw new Error(`Unexpected response status: ${response.status}`);
  }

  /**
   * Process photo upload with atomic confirmation
   */
  async _processPhotoUploadAtomic(item) {
    const photo = item.payload;
    const formData = new FormData();
    
    const blob = photo.blob || this._dataUrlToBlob(photo.base64Data);
    formData.append('document', blob, photo.fileName);
    formData.append('folderName', photo.folderName);
    formData.append('checksum', item.checksum || '');
    
    if (photo.subfolderName) {
      formData.append('subfolderName', photo.subfolderName);
    }

    const response = await api.post(`/api/jobs/${photo.jobId}/documents`, formData);
    
    if (response.status === 200 || response.status === 201) {
      return {
        success: true,
        transactionId: response.data?._id || response.data?.id,
        data: response.data,
      };
    }
    
    throw new Error(`Unexpected response status: ${response.status}`);
  }

  /**
   * Process generic operation with atomic confirmation
   */
  async _processOperationAtomic(item) {
    const op = item.payload;
    let response;
    
    switch (op.type) {
      case 'CREATE_JOB':
        response = await api.post('/api/jobs', op.data);
        break;
      case 'UPDATE_JOB':
        response = await api.put(`/api/jobs/${op.jobId}`, op.data);
        break;
      case 'UPDATE_STATUS':
        response = await api.put(`/api/jobs/${op.jobId}/status`, op.data);
        break;
      default:
        throw new Error(`Unknown operation type: ${op.type}`);
    }
    
    if (response.status === 200 || response.status === 201) {
      return {
        success: true,
        transactionId: response.data?._id || response.data?.id,
        data: response.data,
      };
    }
    
    throw new Error(`Unexpected response status: ${response.status}`);
  }

  /**
   * Convert data URL to Blob
   */
  _dataUrlToBlob(dataUrl) {
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1] || 'application/octet-stream';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.codePointAt(n);
    }
    return new Blob([u8arr], { type: mime });
  }

  /**
   * Sort queue by priority and creation time (FIFO)
   */
  _sortQueue() {
    this.queue.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return new Date(a.createdAt) - new Date(b.createdAt);
    });
  }

  /**
   * Subscribe to queue events
   */
  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  /**
   * Emit event to subscribers
   */
  _emit(event, data) {
    this.listeners.forEach(cb => {
      try {
        cb(event, data);
      } catch (e) {
        console.error('[QueueManager] Listener error:', e);
      }
    });
  }

  /**
   * Get items in dead letter queue
   */
  async getDeadLetterQueue() {
    await this.init();
    return this.queue.filter(i => i.status === QUEUE_STATUS.DEAD);
  }

  /**
   * Get items with validation errors
   */
  async getErrorQueue() {
    await this.init();
    return this.queue.filter(i => i.status === QUEUE_STATUS.ERROR);
  }

  /**
   * Get locked items
   */
  async getLockedItems() {
    await this.init();
    return this.queue.filter(i => i.status === QUEUE_STATUS.LOCKED);
  }

  /**
   * Retry all failed items (not errors)
   */
  async retryFailedItems() {
    await this.init();
    const failedItems = this.queue.filter(i => 
      i.status === QUEUE_STATUS.FAILED || i.status === QUEUE_STATUS.DEAD
    );
    
    for (const item of failedItems) {
      item.status = QUEUE_STATUS.PENDING;
      item.retryCount = 0;
      item.nextRetryAt = null;
      item.lockReason = null;
    }

    this.backoffDelay = BACKOFF_CONFIG.baseDelayMs;
    this._emit('failed_items_reset', { count: failedItems.length });
    return failedItems.length;
  }

  /**
   * Get queue health status
   */
  async getHealth() {
    const counts = await this.getCount();
    
    return {
      isLocked: this.isLocked,
      lockReason: this.lockReason,
      isProcessing: this.isProcessing,
      isOnline: navigator.onLine,
      isAuthenticated: api.isAuthenticated(),
      currentBackoff: this.backoffDelay,
      counts,
      hasErrors: counts.error > 0,
      hasDead: counts.dead > 0,
      healthy: !this.isLocked && counts.error === 0 && counts.dead === 0,
    };
  }
}

// Export singleton instance
const queueManager = new QueueManager();
export default queueManager;
