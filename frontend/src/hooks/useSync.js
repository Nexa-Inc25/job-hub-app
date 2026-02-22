/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * useSync Hook - Sync Queue Management
 * 
 * A React hook for managing the offline sync queue.
 * Implements the "Hybrid Sync Architecture":
 * 
 * 1. Primary (Foreground): Listens to window.onLine and aggressively
 *    flushes the queue when online.
 * 2. Secondary (Background): Registers Service Worker sync events
 *    for background processing on supported browsers.
 * 3. Polling Fallback: Checks every 30s as a backup mechanism.
 * 
 * @module hooks/useSync
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import queueManager, { QUEUE_STATUS, QUEUE_TYPES } from '../utils/queue.manager';

// Polling interval (30 seconds)
const POLL_INTERVAL_MS = 30 * 1000;

// Debounce delay for sync after coming online
const ONLINE_SYNC_DELAY_MS = 2000;

/**
 * useSync Hook
 */
export function useSync(options = {}) {
  const {
    autoSync = true,           // Automatically sync when online
    pollInterval = POLL_INTERVAL_MS,
    onSyncComplete,
    onSyncError,
    onItemSynced,
  } = options;

  // State
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [deadCount, setDeadCount] = useState(0);
  const [lastSyncResult, setLastSyncResult] = useState(null);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [currentItem, setCurrentItem] = useState(null);
  const [progress, setProgress] = useState({ processed: 0, failed: 0 });

  // Refs
  const abortControllerRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const syncTimeoutRef = useRef(null);
  const isSyncingRef = useRef(false);

  /**
   * Update counts from queue manager
   */
  const refreshCounts = useCallback(async () => {
    try {
      const counts = await queueManager.getCount();
      setPendingCount(counts.pending);
      setFailedCount(counts.failed);
      setDeadCount(counts.dead);
    } catch (err) {
      console.error('[useSync] Failed to refresh counts:', err);
    }
  }, []);

  /**
   * Trigger sync
   */
  const sync = useCallback(async () => {
    if (isSyncingRef.current) {
      console.warn('[useSync] Sync already in progress');
      return { skipped: true };
    }

    if (!navigator.onLine) {
      console.warn('[useSync] Offline - cannot sync');
      return { offline: true };
    }

    setIsSyncing(true);
    isSyncingRef.current = true;
    setProgress({ processed: 0, failed: 0 });
    setCurrentItem(null);
    
    // Create abort controller for cancellation
    abortControllerRef.current = new AbortController();

    try {
      const result = await queueManager.process({
        signal: abortControllerRef.current.signal,
        onProgress: ({ processed, failed, current, error }) => {
          setProgress({ processed, failed });
          setCurrentItem(current);
          
          if (!error && onItemSynced) {
            onItemSynced(current);
          }
        },
      });

      setLastSyncResult(result);
      setLastSyncTime(new Date());
      
      if (onSyncComplete) {
        onSyncComplete(result);
      }

      return result;
    } catch (err) {
      console.error('[useSync] Sync failed:', err);
      
      if (onSyncError) {
        onSyncError(err);
      }
      
      return { error: err.message };
    } finally {
      setIsSyncing(false);
      isSyncingRef.current = false;
      setCurrentItem(null);
      abortControllerRef.current = null;
      await refreshCounts();
    }
  }, [onSyncComplete, onSyncError, onItemSynced, refreshCounts]);

  /**
   * Cancel ongoing sync
   */
  const cancelSync = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      console.warn('[useSync] Sync cancelled');
    }
  }, []);

  /**
   * Add item to queue
   */
  const enqueue = useCallback(async (type, payload, options = {}) => {
    const item = await queueManager.enqueue(type, payload, options);
    await refreshCounts();
    
    if (autoSync && navigator.onLine && !isSyncingRef.current) {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      syncTimeoutRef.current = setTimeout(() => {
        sync();
      }, 500);
    }
    
    return item;
  }, [autoSync, refreshCounts, sync]);

  /**
   * Retry failed items
   */
  const retryFailed = useCallback(async () => {
    const items = await queueManager.getAll();
    const failedItems = items.filter(i => 
      i.status === QUEUE_STATUS.FAILED || i.status === QUEUE_STATUS.DEAD
    );
    
    for (const item of failedItems) {
      await queueManager.resetItem(item.id);
    }
    
    await refreshCounts();
    
    // Trigger sync
    if (navigator.onLine) {
      await sync();
    }
    
    return failedItems.length;
  }, [refreshCounts, sync]);

  /**
   * Get all queue items
   */
  const getQueue = useCallback(async () => {
    return await queueManager.getAll();
  }, []);

  /**
   * Register Service Worker background sync
   */
  const registerBackgroundSync = useCallback(async () => {
    if ('serviceWorker' in navigator && 'SyncManager' in globalThis) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.sync.register('sync-queue');
        console.warn('[useSync] Background sync registered');
        return true;
      } catch (err) {
        console.warn('[useSync] Background sync registration failed:', err);
        return false;
      }
    }
    return false;
  }, []);

  /**
   * Handle online event
   */
  const handleOnline = useCallback(() => {
    console.warn('[useSync] Connection restored');
    setIsOnline(true);
    
    if (autoSync) {
      // Delay sync slightly to ensure connection is stable
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      syncTimeoutRef.current = setTimeout(() => {
        sync();
      }, ONLINE_SYNC_DELAY_MS);
    }
  }, [autoSync, sync]);

  /**
   * Handle offline event
   */
  const handleOffline = useCallback(() => {
    console.warn('[useSync] Connection lost');
    setIsOnline(false);
    
    // Cancel any pending sync
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
  }, []);

  /**
   * Handle service worker messages (background sync triggers)
   */
  const handleServiceWorkerMessage = useCallback((event) => {
    const { type } = event.data || {};
    
    if (type === 'BACKGROUND_SYNC_TRIGGERED') {
      console.warn('[useSync] Background sync triggered by service worker');
      if (navigator.onLine && !isSyncingRef.current) {
        sync();
      }
    }
  }, [sync]);

  // Initialize and set up listeners
  useEffect(() => {
    // Initialize queue manager
    queueManager.init();
    
    // Initial count
    refreshCounts();

    // Online/offline listeners
    globalThis.addEventListener('online', handleOnline);
    globalThis.addEventListener('offline', handleOffline);

    // Service worker message listener (for background sync)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
    }

    // Queue manager event listener
    const unsubscribe = queueManager.subscribe((event, data) => {
      switch (event) {
        case 'enqueued':
        case 'dequeued':
        case 'failed':
        case 'dead':
        case 'reset':
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
      }
    });

    // Polling interval for backup sync
    if (autoSync) {
      pollIntervalRef.current = setInterval(async () => {
        if (navigator.onLine && !isSyncingRef.current) {
          const counts = await queueManager.getCount();
          if (counts.pending > 0) {
            console.warn('[useSync] Polling: found pending items, syncing...');
            sync();
          }
        }
      }, pollInterval);
    }

    // Try to register background sync
    registerBackgroundSync();

    // Initial sync if online and has pending items
    if (navigator.onLine && autoSync) {
      refreshCounts().then(async () => {
        const counts = await queueManager.getCount();
        if (counts.pending > 0) {
          sync();
        }
      });
    }

    return () => {
      globalThis.removeEventListener('online', handleOnline);
      globalThis.removeEventListener('offline', handleOffline);
      
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
      }
      
      unsubscribe();
      
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [autoSync, handleOnline, handleOffline, handleServiceWorkerMessage, pollInterval, refreshCounts, registerBackgroundSync, sync]);

  return {
    // Status
    isOnline,
    isSyncing,
    pendingCount,
    failedCount,
    deadCount,
    totalPending: pendingCount + failedCount,
    hasPendingItems: pendingCount > 0 || failedCount > 0,
    lastSyncResult,
    lastSyncTime,
    currentItem,
    progress,

    // Actions
    sync,
    cancelSync,
    enqueue,
    retryFailed,
    getQueue,
    refreshCounts,

    // Queue types for convenience
    QUEUE_TYPES,
  };
}

export default useSync;

