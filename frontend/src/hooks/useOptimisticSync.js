/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * useOptimisticSync Hook
 * 
 * Optimistic UI pattern for seamless offline-first data capture.
 * Data saves instantly to IndexedDB and syncs silently in the background.
 * The user never needs to "manage" network state.
 * 
 * Features:
 * - Immediate local save with optimistic UI
 * - Silent background sync when online
 * - Automatic retry with exponential backoff
 * - Conflict resolution (server wins with notification)
 * - Sync status events for UI indicators
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useOnlineStatus } from './useOffline';
import * as offlineStorage from '../utils/offlineStorage';
import api from '../api';

// Sync status constants
export const SYNC_STATUS = {
  IDLE: 'idle',
  SAVING: 'saving',
  SAVED_LOCALLY: 'saved_locally',
  SYNCING: 'syncing',
  SYNCED: 'synced',
  CONFLICT: 'conflict',
  ERROR: 'error',
};

// Default retry configuration
const DEFAULT_CONFIG = {
  maxRetries: 5,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
};

/**
 * Generate a unique offline ID
 */
function generateOfflineId() {
  return `offline_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Calculate retry delay with exponential backoff
 */
function getRetryDelay(attempt, config = DEFAULT_CONFIG) {
  const delay = Math.min(
    config.baseDelay * Math.pow(config.backoffMultiplier, attempt),
    config.maxDelay
  );
  // Add jitter (±20%) to prevent thundering herd
  const jitter = delay * 0.2 * (Math.random() - 0.5) * 2;
  return Math.round(delay + jitter);
}

/**
 * useOptimisticSync Hook
 * 
 * @param {Object} options - Configuration options
 * @param {string} options.endpoint - API endpoint for syncing
 * @param {string} options.storeName - IndexedDB store name
 * @param {Function} options.onConflict - Callback for conflicts
 * @param {Function} options.onSyncComplete - Callback when sync completes
 */
export function useOptimisticSync(options = {}) {
  const {
    endpoint = '/api/data',
    onConflict = null,
    onSyncComplete = null,
    config = DEFAULT_CONFIG,
  } = options;

  const isOnline = useOnlineStatus();
  const [syncStatus, setSyncStatus] = useState(SYNC_STATUS.IDLE);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [error, setError] = useState(null);
  
  const syncInProgressRef = useRef(false);
  const retryTimeoutRef = useRef(null);

  /**
   * Save data optimistically (immediate local save)
   * Returns immediately with the saved item
   */
  const saveOptimistic = useCallback(async (data) => {
    const offlineId = generateOfflineId();
    
    setSyncStatus(SYNC_STATUS.SAVING);
    setError(null);

    try {
      // Save to IndexedDB immediately
      const localItem = {
        ...data,
        offlineId,
        createdAt: new Date().toISOString(),
        syncStatus: 'pending',
        syncAttempts: 0,
      };

      await offlineStorage.queueOperation({
        type: 'sync',
        endpoint,
        method: 'POST',
        data: localItem,
        offlineId,
      });

      setSyncStatus(SYNC_STATUS.SAVED_LOCALLY);
      setPendingCount(prev => prev + 1);

      // Trigger background sync if online
      if (isOnline && !syncInProgressRef.current) {
        setTimeout(() => syncPending(), 100);
      }

      return { success: true, offlineId, data: localItem };
    } catch (err) {
      console.error('[OptimisticSync] Save error:', err);
      setSyncStatus(SYNC_STATUS.ERROR);
      setError(err.message);
      return { success: false, error: err.message };
    }
  }, [endpoint, isOnline]);

  /**
   * Sync pending items to server
   */
  const syncPending = useCallback(async () => {
    if (!isOnline || syncInProgressRef.current) {
      return;
    }

    syncInProgressRef.current = true;
    setSyncStatus(SYNC_STATUS.SYNCING);

    try {
      const pendingOps = await offlineStorage.getPendingOperations();
      const syncOps = pendingOps.filter(op => 
        op.type === 'sync' && 
        op.endpoint === endpoint &&
        op.status !== 'synced'
      );

      if (syncOps.length === 0) {
        setSyncStatus(SYNC_STATUS.SYNCED);
        setPendingCount(0);
        syncInProgressRef.current = false;
        return;
      }

      let syncedCount = 0;
      let failedCount = 0;

      for (const op of syncOps) {
        try {
          // Attempt to sync
          const response = await api({
            method: op.method || 'POST',
            url: op.endpoint,
            data: op.data,
          });

          // Check for conflicts
          if (response.data?.conflict) {
            if (onConflict) {
              await onConflict(op.data, response.data.serverData);
            }
            // Server wins - remove local version
            await offlineStorage.removeOperation(op.id);
            setSyncStatus(SYNC_STATUS.CONFLICT);
          } else {
            // Success - remove from pending
            await offlineStorage.removeOperation(op.id);
            syncedCount++;
          }
        } catch (err) {
          console.error('[OptimisticSync] Sync failed for item:', op.offlineId, err);
          
          // Update retry count
          const newRetries = (op.retries || 0) + 1;
          
          if (newRetries >= config.maxRetries) {
            // Max retries exceeded - mark as failed
            await offlineStorage.updateOperationStatus(op.id, 'failed', err.message);
            failedCount++;
          } else {
            // Schedule retry
            await offlineStorage.updateOperationStatus(op.id, 'pending', err.message);
            const delay = getRetryDelay(newRetries, config);
            
            if (retryTimeoutRef.current) {
              clearTimeout(retryTimeoutRef.current);
            }
            retryTimeoutRef.current = setTimeout(() => syncPending(), delay);
          }
        }
      }

      // Update state
      const remaining = syncOps.length - syncedCount;
      setPendingCount(remaining);
      
      if (remaining === 0) {
        setSyncStatus(SYNC_STATUS.SYNCED);
        setLastSyncTime(new Date());
        if (onSyncComplete) {
          onSyncComplete({ synced: syncedCount, failed: failedCount });
        }
      } else if (failedCount > 0) {
        setSyncStatus(SYNC_STATUS.ERROR);
        setError(`${failedCount} items failed to sync`);
      }
    } catch (err) {
      console.error('[OptimisticSync] Sync error:', err);
      setSyncStatus(SYNC_STATUS.ERROR);
      setError(err.message);
    } finally {
      syncInProgressRef.current = false;
    }
  }, [isOnline, endpoint, config, onConflict, onSyncComplete]);

  /**
   * Force sync (user-initiated)
   */
  const forceSync = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }
    return syncPending();
  }, [syncPending]);

  /**
   * Get sync status text for UI
   */
  const getSyncStatusText = useCallback(() => {
    switch (syncStatus) {
      case SYNC_STATUS.SAVING:
        return 'Saving...';
      case SYNC_STATUS.SAVED_LOCALLY:
        return 'Saved locally';
      case SYNC_STATUS.SYNCING:
        return 'Syncing...';
      case SYNC_STATUS.SYNCED:
        return 'Synced';
      case SYNC_STATUS.CONFLICT:
        return 'Conflict resolved';
      case SYNC_STATUS.ERROR:
        return error || 'Sync error';
      default:
        return '';
    }
  }, [syncStatus, error]);

  // Auto-sync when coming online
  useEffect(() => {
    if (isOnline && pendingCount > 0 && !syncInProgressRef.current) {
      syncPending();
    }
  }, [isOnline, pendingCount, syncPending]);

  // Initial pending count
  useEffect(() => {
    const loadPendingCount = async () => {
      try {
        const ops = await offlineStorage.getPendingOperations();
        const count = ops.filter(op => 
          op.type === 'sync' && 
          op.endpoint === endpoint &&
          op.status !== 'synced'
        ).length;
        setPendingCount(count);
      } catch (err) {
        console.error('[OptimisticSync] Error loading pending count:', err);
      }
    };
    loadPendingCount();
  }, [endpoint]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  return {
    saveOptimistic,
    syncPending,
    forceSync,
    syncStatus,
    pendingCount,
    lastSyncTime,
    error,
    isOnline,
    isSyncing: syncStatus === SYNC_STATUS.SYNCING,
    hasPending: pendingCount > 0,
    getSyncStatusText,
  };
}

/**
 * Simplified hook for unit entries
 */
export function useUnitEntrySync(options = {}) {
  return useOptimisticSync({
    endpoint: '/api/billing/units',
    storeName: 'pendingUnitEntries',
    ...options,
  });
}

/**
 * Simplified hook for field tickets
 */
export function useFieldTicketSync(options = {}) {
  return useOptimisticSync({
    endpoint: '/api/fieldtickets',
    storeName: 'pendingFieldTickets',
    ...options,
  });
}

export default useOptimisticSync;

