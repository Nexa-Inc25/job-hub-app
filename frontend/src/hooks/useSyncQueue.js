/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * useSyncQueue Hook - NIST-Compliant Sync Queue Bridge
 * 
 * Bridges the singleton QueueManager to React state.
 * Provides real-time UI updates for the Foreman's feedback loop.
 * 
 * NIST SP 800-53 Compliance:
 * - SI-7: Atomic transaction status
 * - AC-3: Session containment state
 * - SC-8: Checksum verification status
 * 
 * @module hooks/useSyncQueue
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import queueManager, { 
  QUEUE_STATUS, 
  QUEUE_TYPES,
  LOCK_REASONS,
} from '../utils/queue.manager';

// Polling interval for backup state refresh (30 seconds)
const POLL_INTERVAL_MS = 30 * 1000;

// Debounce delay for sync after enqueue
const SYNC_DEBOUNCE_MS = 500;

/**
 * useSyncQueue Hook
 * 
 * @param {Object} options - Configuration options
 * @param {boolean} options.autoSync - Auto-sync when online (default: true)
 * @param {number} options.pollInterval - Polling interval in ms
 * @param {Function} options.onSyncComplete - Callback after sync completes
 * @param {Function} options.onAuthRequired - Callback when auth expires
 * @param {Function} options.onError - Callback on validation errors
 */
export function useSyncQueue(options = {}) {
  const {
    autoSync = true,
    pollInterval = POLL_INTERVAL_MS,
    onSyncComplete,
    onAuthRequired,
    onError,
  } = options;

  // Core state
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [lockReason, setLockReason] = useState(null);
  
  // Count state
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [lockedCount, setLockedCount] = useState(0);
  const [deadCount, setDeadCount] = useState(0);
  
  // Result state
  const [lastSyncResult, setLastSyncResult] = useState(null);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [currentItem, setCurrentItem] = useState(null);
  
  // Health state
  const [isHealthy, setIsHealthy] = useState(true);
  const [hasErrors, setHasErrors] = useState(false);

  // Refs
  const abortControllerRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const syncTimeoutRef = useRef(null);

  /**
   * Refresh all counts from queue manager
   */
  const refreshCounts = useCallback(async () => {
    try {
      const health = await queueManager.getHealth();
      
      setPendingCount(health.counts.pending);
      setFailedCount(health.counts.failed);
      setErrorCount(health.counts.error);
      setLockedCount(health.counts.locked);
      setDeadCount(health.counts.dead);
      setIsLocked(health.isLocked);
      setLockReason(health.lockReason);
      setIsHealthy(health.healthy);
      setHasErrors(health.hasErrors || health.hasDead);
      
    } catch (err) {
      console.error('[useSyncQueue] Failed to refresh counts:', err);
    }
  }, []);

  /**
   * Trigger sync
   */
  const sync = useCallback(async () => {
    if (isSyncing) {
      console.log('[useSyncQueue] Sync already in progress');
      return { skipped: true };
    }

    if (!navigator.onLine) {
      console.log('[useSyncQueue] Offline - cannot sync');
      return { offline: true };
    }

    setIsSyncing(true);
    setCurrentItem(null);
    
    abortControllerRef.current = new AbortController();

    try {
      const result = await queueManager.process({
        signal: abortControllerRef.current.signal,
        onProgress: ({ processed, failed, locked, current }) => {
          setCurrentItem(current);
          // Refresh counts on each item
          refreshCounts();
        },
      });

      setLastSyncResult(result);
      setLastSyncTime(new Date());
      
      // Handle auth required
      if (result.authRequired && onAuthRequired) {
        onAuthRequired();
      }
      
      if (onSyncComplete) {
        onSyncComplete(result);
      }

      return result;
    } catch (err) {
      console.error('[useSyncQueue] Sync error:', err);
      
      if (onError) {
        onError(err);
      }
      
      return { error: err.message };
    } finally {
      setIsSyncing(false);
      setCurrentItem(null);
      abortControllerRef.current = null;
      await refreshCounts();
    }
  }, [isSyncing, onSyncComplete, onAuthRequired, onError, refreshCounts]);

  /**
   * Cancel ongoing sync
   */
  const cancelSync = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      console.log('[useSyncQueue] Sync cancelled');
    }
  }, []);

  /**
   * Enqueue item with auto-sync
   */
  const enqueue = useCallback(async (type, payload, options = {}) => {
    const item = await queueManager.enqueue(type, payload, options);
    await refreshCounts();
    
    // Auto-sync if online and not locked
    if (autoSync && navigator.onLine && !isSyncing && !isLocked) {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      syncTimeoutRef.current = setTimeout(() => {
        sync();
      }, SYNC_DEBOUNCE_MS);
    }
    
    return item;
  }, [autoSync, isSyncing, isLocked, refreshCounts, sync]);

  /**
   * Unlock queue after re-authentication
   */
  const unlock = useCallback(async () => {
    const unlocked = await queueManager.unlockQueue();
    await refreshCounts();
    
    if (unlocked && autoSync && navigator.onLine) {
      sync();
    }
    
    return unlocked;
  }, [autoSync, refreshCounts, sync]);

  /**
   * Retry failed items
   */
  const retryFailed = useCallback(async () => {
    const count = await queueManager.retryFailedItems();
    await refreshCounts();
    
    if (count > 0 && navigator.onLine && !isLocked) {
      await sync();
    }
    
    return count;
  }, [isLocked, refreshCounts, sync]);

  /**
   * Get all queue items
   */
  const getQueue = useCallback(async () => {
    return await queueManager.getAll();
  }, []);

  /**
   * Get error items
   */
  const getErrors = useCallback(async () => {
    return await queueManager.getErrorQueue();
  }, []);

  /**
   * Get dead letter items
   */
  const getDeadLetterQueue = useCallback(async () => {
    return await queueManager.getDeadLetterQueue();
  }, []);

  /**
   * Handle online event
   */
  const handleOnline = useCallback(() => {
    console.log('[useSyncQueue] Connection restored');
    setIsOnline(true);
    
    if (autoSync && !isLocked) {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      // Delay sync to ensure connection stability
      syncTimeoutRef.current = setTimeout(() => {
        sync();
      }, 2000);
    }
  }, [autoSync, isLocked, sync]);

  /**
   * Handle offline event
   */
  const handleOffline = useCallback(() => {
    console.log('[useSyncQueue] Connection lost');
    setIsOnline(false);
    
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
  }, []);

  /**
   * Handle auth required event
   */
  const handleAuthRequired = useCallback(() => {
    console.warn('[useSyncQueue] Auth required - queue locked');
    setIsLocked(true);
    setLockReason(LOCK_REASONS.AUTH_EXPIRED);
    
    if (onAuthRequired) {
      onAuthRequired();
    }
  }, [onAuthRequired]);

  // Initialize and set up listeners
  useEffect(() => {
    // Initialize queue manager
    queueManager.init();
    
    // Initial count refresh
    refreshCounts();

    // Online/offline listeners
    globalThis.addEventListener('online', handleOnline);
    globalThis.addEventListener('offline', handleOffline);
    globalThis.addEventListener('auth-required', handleAuthRequired);

    // Queue manager event listener
    const unsubscribe = queueManager.subscribe((event, data) => {
      switch (event) {
        case 'enqueued':
        case 'dequeued':
        case 'failed':
        case 'error':
        case 'dead':
        case 'reset':
        case 'failed_items_reset':
          refreshCounts();
          break;
          
        case 'processing_start':
          setIsSyncing(true);
          break;
          
        case 'processing_complete':
          setIsSyncing(false);
          setLastSyncResult(data);
          setLastSyncTime(new Date());
          break;
          
        case 'locked':
          setIsLocked(true);
          setLockReason(data.reason);
          break;
          
        case 'unlocked':
          setIsLocked(false);
          setLockReason(null);
          break;
          
        case 'syncing':
          setCurrentItem(data.item);
          break;
      }
    });

    // Polling interval for backup state refresh
    if (autoSync) {
      pollIntervalRef.current = setInterval(async () => {
        await refreshCounts();
        
        // Try to sync if conditions are met
        if (navigator.onLine && !isSyncing && !isLocked) {
          const health = await queueManager.getHealth();
          if (health.counts.pending > 0) {
            console.log('[useSyncQueue] Polling: found pending items, syncing...');
            sync();
          }
        }
      }, pollInterval);
    }

    // Initial sync if online and has pending items
    if (navigator.onLine && autoSync) {
      refreshCounts().then(async () => {
        const health = await queueManager.getHealth();
        if (health.counts.pending > 0 && !health.isLocked) {
          sync();
        }
      });
    }

    return () => {
      globalThis.removeEventListener('online', handleOnline);
      globalThis.removeEventListener('offline', handleOffline);
      globalThis.removeEventListener('auth-required', handleAuthRequired);
      unsubscribe();
      
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [
    autoSync, 
    handleOnline, 
    handleOffline, 
    handleAuthRequired,
    pollInterval, 
    refreshCounts, 
    sync, 
    isSyncing, 
    isLocked
  ]);

  return {
    // Core status
    isOnline,
    isSyncing,
    isLocked,
    lockReason,
    
    // Counts
    pendingCount,
    failedCount,
    errorCount,
    lockedCount,
    deadCount,
    totalPending: pendingCount + failedCount,
    
    // Health
    isHealthy,
    hasErrors,
    hasPendingItems: pendingCount > 0 || failedCount > 0,
    
    // Results
    lastSyncResult,
    lastSyncTime,
    currentItem,
    
    // Actions
    sync,
    cancelSync,
    enqueue,
    unlock,
    retryFailed,
    getQueue,
    getErrors,
    getDeadLetterQueue,
    refreshCounts,
    
    // Constants
    QUEUE_TYPES,
    QUEUE_STATUS,
    LOCK_REASONS,
  };
}

export default useSyncQueue;

// Re-export constants for convenience
export { QUEUE_TYPES, QUEUE_STATUS, LOCK_REASONS } from '../utils/queue.manager';

