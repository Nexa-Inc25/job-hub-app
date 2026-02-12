/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * useOffline Hook Tests
 * 
 * Tests for offline state management and sync operations.
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useOffline } from '../useOffline';

// Mock the offlineStorage module
vi.mock('../../utils/offlineStorage', () => ({
  default: {
    initOfflineDB: vi.fn().mockResolvedValue(true),
    getPendingCounts: vi.fn().mockResolvedValue({ operations: 0, photos: 0, total: 0 }),
    queueOperation: vi.fn().mockResolvedValue({ id: 'op-1', type: 'unit', createdAt: new Date().toISOString() }),
    savePendingPhoto: vi.fn().mockResolvedValue({ id: 'photo-1', jobId: 'job-1' }),
    cacheJob: vi.fn().mockResolvedValue(true),
    getCachedJob: vi.fn().mockResolvedValue({ _id: 'job-1', title: 'Cached Job' }),
    getAllCachedJobs: vi.fn().mockResolvedValue([{ _id: 'job-1' }, { _id: 'job-2' }]),
    getPendingPhotos: vi.fn().mockResolvedValue([])
  }
}));

// Mock the syncManager module
vi.mock('../../utils/syncManager', () => ({
  default: {
    initSyncManager: vi.fn(),
    syncPendingOperations: vi.fn().mockResolvedValue({ success: true, synced: 5 }),
    onSyncEvent: vi.fn().mockReturnValue(() => {})
  }
}));

// Import mocks after mocking
import offlineStorage from '../../utils/offlineStorage';
import syncManager from '../../utils/syncManager';

describe('useOffline Hook', () => {
  // Store original navigator.onLine
  const originalOnLine = navigator.onLine;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset navigator.onLine to true
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true
    });
  });

  afterEach(() => {
    // Restore navigator.onLine
    Object.defineProperty(navigator, 'onLine', {
      value: originalOnLine,
      writable: true,
      configurable: true
    });
  });

  describe('Initial State', () => {
    it('should initialize with online status based on navigator.onLine', async () => {
      const { result } = renderHook(() => useOffline());

      await waitFor(() => {
        expect(result.current.isOnline).toBe(true);
      });
    });

    it('should initialize with isSyncing as false', async () => {
      const { result } = renderHook(() => useOffline());

      await waitFor(() => {
        expect(result.current.isSyncing).toBe(false);
      });
    });

    it('should initialize pending counts', async () => {
      const { result } = renderHook(() => useOffline());

      await waitFor(() => {
        expect(result.current.pendingCounts).toEqual({ operations: 0, photos: 0, total: 0 });
      });
    });

    it('should call initOfflineDB on mount', async () => {
      renderHook(() => useOffline());

      await waitFor(() => {
        expect(offlineStorage.initOfflineDB).toHaveBeenCalled();
      });
    });

    it('should call initSyncManager on mount', async () => {
      renderHook(() => useOffline());

      await waitFor(() => {
        expect(syncManager.initSyncManager).toHaveBeenCalled();
      });
    });
  });

  describe('Online/Offline Detection', () => {
    it('should update isOnline when going offline', async () => {
      const { result } = renderHook(() => useOffline());

      await waitFor(() => {
        expect(result.current.isOnline).toBe(true);
      });

      // Simulate going offline
      await act(async () => {
        Object.defineProperty(navigator, 'onLine', { value: false });
        globalThis.dispatchEvent(new Event('offline'));
      });

      expect(result.current.isOnline).toBe(false);
    });

    it('should update isOnline when coming online', async () => {
      // Start offline
      Object.defineProperty(navigator, 'onLine', { value: false });
      
      const { result } = renderHook(() => useOffline());

      await waitFor(() => {
        expect(result.current.isOnline).toBe(false);
      });

      // Simulate coming online
      await act(async () => {
        Object.defineProperty(navigator, 'onLine', { value: true });
        globalThis.dispatchEvent(new Event('online'));
      });

      expect(result.current.isOnline).toBe(true);
    });

    it('should refresh pending counts when coming online', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false });
      
      renderHook(() => useOffline());

      await waitFor(() => {
        expect(offlineStorage.getPendingCounts).toHaveBeenCalled();
      });

      const initialCallCount = offlineStorage.getPendingCounts.mock.calls.length;

      // Come online
      await act(async () => {
        Object.defineProperty(navigator, 'onLine', { value: true });
        globalThis.dispatchEvent(new Event('online'));
      });

      // Should have called getPendingCounts again
      expect(offlineStorage.getPendingCounts.mock.calls.length).toBeGreaterThan(initialCallCount);
    });
  });

  describe('Sync Operations', () => {
    it('should trigger sync when online', async () => {
      const { result } = renderHook(() => useOffline());

      await waitFor(() => {
        expect(result.current.isOnline).toBe(true);
      });

      await act(async () => {
        await result.current.triggerSync();
      });

      expect(syncManager.syncPendingOperations).toHaveBeenCalled();
    });

    it('should not trigger sync when offline', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false });
      
      const { result } = renderHook(() => useOffline());

      await waitFor(() => {
        expect(result.current.isOnline).toBe(false);
      });

      const syncResult = await act(async () => {
        return await result.current.triggerSync();
      });

      expect(syncResult).toEqual({ error: 'Cannot sync while offline' });
      expect(syncManager.syncPendingOperations).not.toHaveBeenCalled();
    });

    it('should set isSyncing during sync', async () => {
      // Make sync take some time
      syncManager.syncPendingOperations.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ success: true }), 100))
      );

      const { result } = renderHook(() => useOffline());

      await waitFor(() => {
        expect(result.current.isOnline).toBe(true);
      });

      // Start sync
      let syncPromise;
      await act(async () => {
        syncPromise = result.current.triggerSync();
      });

      expect(result.current.isSyncing).toBe(true);

      // Wait for sync to complete
      await act(async () => {
        await syncPromise;
      });

      expect(result.current.isSyncing).toBe(false);
    });

    it('should update lastSyncResult after sync', async () => {
      const mockResult = { success: true, synced: 10, failed: 0 };
      syncManager.syncPendingOperations.mockResolvedValue(mockResult);

      const { result } = renderHook(() => useOffline());

      await waitFor(() => {
        expect(result.current.isOnline).toBe(true);
      });

      await act(async () => {
        await result.current.triggerSync();
      });

      expect(result.current.lastSyncResult).toEqual(mockResult);
    });
  });

  describe('Queue Operations', () => {
    it('should queue an operation', async () => {
      const { result } = renderHook(() => useOffline());

      await waitFor(() => {
        expect(offlineStorage.initOfflineDB).toHaveBeenCalled();
      });

      await act(async () => {
        await result.current.queueOperation('unit_entry', { quantity: 5 }, 'job-123');
      });

      expect(offlineStorage.queueOperation).toHaveBeenCalledWith({
        type: 'unit_entry',
        data: { quantity: 5 },
        jobId: 'job-123'
      });
    });

    it('should refresh counts after queuing', async () => {
      const { result } = renderHook(() => useOffline());

      await waitFor(() => {
        expect(offlineStorage.getPendingCounts).toHaveBeenCalled();
      });

      const initialCount = offlineStorage.getPendingCounts.mock.calls.length;

      await act(async () => {
        await result.current.queueOperation('unit_entry', {}, null);
      });

      expect(offlineStorage.getPendingCounts.mock.calls.length).toBeGreaterThan(initialCount);
    });
  });

  describe('Photo Operations', () => {
    it('should save a pending photo', async () => {
      const { result } = renderHook(() => useOffline());

      await waitFor(() => {
        expect(offlineStorage.initOfflineDB).toHaveBeenCalled();
      });

      const photoData = { jobId: 'job-1', blob: 'base64data', name: 'photo.jpg' };

      await act(async () => {
        await result.current.savePhoto(photoData);
      });

      expect(offlineStorage.savePendingPhoto).toHaveBeenCalledWith(photoData);
    });

    it('should get pending photos for a job', async () => {
      offlineStorage.getPendingPhotos.mockResolvedValue([
        { id: 'p1', jobId: 'job-1' },
        { id: 'p2', jobId: 'job-1' }
      ]);

      const { result } = renderHook(() => useOffline());

      await waitFor(() => {
        expect(offlineStorage.initOfflineDB).toHaveBeenCalled();
      });

      let photos;
      await act(async () => {
        photos = await result.current.getPendingPhotos('job-1');
      });

      expect(photos).toHaveLength(2);
      expect(offlineStorage.getPendingPhotos).toHaveBeenCalledWith('job-1');
    });
  });

  describe('Job Caching', () => {
    it('should cache a job', async () => {
      const { result } = renderHook(() => useOffline());

      await waitFor(() => {
        expect(offlineStorage.initOfflineDB).toHaveBeenCalled();
      });

      const job = { _id: 'job-1', title: 'Test Job', status: 'in_progress' };

      await act(async () => {
        await result.current.cacheJob(job);
      });

      expect(offlineStorage.cacheJob).toHaveBeenCalledWith(job);
    });

    it('should get a cached job', async () => {
      const mockJob = { _id: 'job-1', title: 'Cached Job' };
      offlineStorage.getCachedJob.mockResolvedValue(mockJob);

      const { result } = renderHook(() => useOffline());

      await waitFor(() => {
        expect(offlineStorage.initOfflineDB).toHaveBeenCalled();
      });

      let job;
      await act(async () => {
        job = await result.current.getCachedJob('job-1');
      });

      expect(job).toEqual(mockJob);
      expect(offlineStorage.getCachedJob).toHaveBeenCalledWith('job-1');
    });

    it('should get all cached jobs', async () => {
      const mockJobs = [{ _id: 'job-1' }, { _id: 'job-2' }];
      offlineStorage.getAllCachedJobs.mockResolvedValue(mockJobs);

      const { result } = renderHook(() => useOffline());

      await waitFor(() => {
        expect(offlineStorage.initOfflineDB).toHaveBeenCalled();
      });

      let jobs;
      await act(async () => {
        jobs = await result.current.getCachedJobs();
      });

      expect(jobs).toHaveLength(2);
    });
  });

  describe('Pending Items Flag', () => {
    it('should return hasPendingItems as false when no pending items', async () => {
      offlineStorage.getPendingCounts.mockResolvedValue({ operations: 0, photos: 0, total: 0 });

      const { result } = renderHook(() => useOffline());

      await waitFor(() => {
        expect(result.current.hasPendingItems).toBe(false);
      });
    });

    it('should return hasPendingItems as true when pending operations exist', async () => {
      offlineStorage.getPendingCounts.mockResolvedValue({ operations: 3, photos: 0, total: 3 });

      const { result } = renderHook(() => useOffline());

      await waitFor(() => {
        expect(result.current.hasPendingItems).toBe(true);
      });
    });

    it('should return hasPendingItems as true when pending photos exist', async () => {
      offlineStorage.getPendingCounts.mockResolvedValue({ operations: 0, photos: 2, total: 2 });

      const { result } = renderHook(() => useOffline());

      await waitFor(() => {
        expect(result.current.hasPendingItems).toBe(true);
      });
    });
  });

  describe('Sync Event Handling', () => {
    it('should subscribe to sync events', async () => {
      renderHook(() => useOffline());

      await waitFor(() => {
        expect(syncManager.onSyncEvent).toHaveBeenCalled();
      });
    });

    it('should unsubscribe from sync events on unmount', async () => {
      const unsubscribe = vi.fn();
      syncManager.onSyncEvent.mockReturnValue(unsubscribe);

      const { unmount } = renderHook(() => useOffline());

      await waitFor(() => {
        expect(syncManager.onSyncEvent).toHaveBeenCalled();
      });

      unmount();

      expect(unsubscribe).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle getPendingCounts errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      offlineStorage.getPendingCounts.mockRejectedValueOnce(new Error('DB error'));

      renderHook(() => useOffline());

      // Should not throw, just log
      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to get pending counts:', expect.any(Error));
      });

      consoleSpy.mockRestore();
    });
  });
});

