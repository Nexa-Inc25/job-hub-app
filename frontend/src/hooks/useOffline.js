/**
 * useOffline Hook
 * 
 * React hook for managing offline state and sync operations.
 * Provides:
 * - Online/offline status
 * - Pending operation counts
 * - Sync triggers
 * - Offline data access
 */

import { useState, useEffect, useCallback } from 'react';
import offlineStorage from '../utils/offlineStorage';
import syncManager from '../utils/syncManager';

export function useOffline() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCounts, setPendingCounts] = useState({ operations: 0, photos: 0, total: 0 });
  const [lastSyncResult, setLastSyncResult] = useState(null);

  // Update pending counts
  const refreshPendingCounts = useCallback(async () => {
    try {
      const counts = await offlineStorage.getPendingCounts();
      setPendingCounts(counts);
    } catch (err) {
      console.error('Failed to get pending counts:', err);
    }
  }, []);

  // Manual sync trigger
  const triggerSync = useCallback(async () => {
    if (!isOnline) {
      return { error: 'Cannot sync while offline' };
    }
    setIsSyncing(true);
    try {
      const result = await syncManager.syncPendingOperations();
      setLastSyncResult(result);
      await refreshPendingCounts();
      return result;
    } finally {
      setIsSyncing(false);
    }
  }, [isOnline, refreshPendingCounts]);

  // Queue an operation for offline sync
  const queueOperation = useCallback(async (type, data, jobId = null) => {
    const op = await offlineStorage.queueOperation({ type, data, jobId });
    await refreshPendingCounts();
    return op;
  }, [refreshPendingCounts]);

  // Save a photo for later upload
  const savePhoto = useCallback(async (photoData) => {
    const photo = await offlineStorage.savePendingPhoto(photoData);
    await refreshPendingCounts();
    return photo;
  }, [refreshPendingCounts]);

  // Cache a job for offline viewing
  const cacheJob = useCallback(async (job) => {
    return await offlineStorage.cacheJob(job);
  }, []);

  // Get cached job
  const getCachedJob = useCallback(async (jobId) => {
    return await offlineStorage.getCachedJob(jobId);
  }, []);

  // Get all cached jobs
  const getCachedJobs = useCallback(async () => {
    return await offlineStorage.getAllCachedJobs();
  }, []);

  // Get pending photos for a job
  const getPendingPhotos = useCallback(async (jobId) => {
    return await offlineStorage.getPendingPhotos(jobId);
  }, []);

  useEffect(() => {
    // Initialize offline storage
    offlineStorage.initOfflineDB();
    
    // Initialize sync manager
    syncManager.initSyncManager();

    // Initial pending count
    refreshPendingCounts();

    // Online/offline listeners
    const handleOnline = () => {
      setIsOnline(true);
      refreshPendingCounts();
    };
    
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Sync event listener
    const unsubscribe = syncManager.onSyncEvent((event, data) => {
      if (event === 'sync_start') {
        setIsSyncing(true);
      } else if (event === 'sync_complete') {
        setIsSyncing(false);
        setLastSyncResult(data);
        refreshPendingCounts();
      } else if (event === 'operation_synced' || event === 'photo_synced') {
        refreshPendingCounts();
      }
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribe();
    };
  }, [refreshPendingCounts]);

  return {
    // Status
    isOnline,
    isSyncing,
    pendingCounts,
    lastSyncResult,
    hasPendingItems: pendingCounts.total > 0,
    
    // Actions
    triggerSync,
    queueOperation,
    savePhoto,
    cacheJob,
    getCachedJob,
    getCachedJobs,
    getPendingPhotos,
    refreshPendingCounts
  };
}

export default useOffline;

