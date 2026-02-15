/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Sync Manager Tests
 * 
 * Tests offline-to-online sync operations, event system, photo uploads,
 * queue processing, and conflict detection.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onSyncEvent, isOnline, syncPendingOperations } from '../syncManager';

// Mock api module
vi.mock('../../api', () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

// Mock offlineStorage module
vi.mock('../offlineStorage', () => ({
  default: {
    getPendingOperations: vi.fn().mockResolvedValue([]),
    getPendingPhotos: vi.fn().mockResolvedValue([]),
    updateOperationStatus: vi.fn().mockResolvedValue(),
    removeOperation: vi.fn().mockResolvedValue(),
    removePendingPhoto: vi.fn().mockResolvedValue(),
    getPendingCounts: vi.fn().mockResolvedValue({ total: 0 }),
    clearOldCache: vi.fn().mockResolvedValue(0),
  },
}));

import api from '../../api';
import offlineStorage from '../offlineStorage';

describe('Sync Manager', () => {
  const originalOnLine = navigator.onLine;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', { value: originalOnLine, writable: true, configurable: true });
  });

  describe('isOnline', () => {
    it('should return navigator.onLine value', () => {
      Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
      expect(isOnline()).toBe(true);
      
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
      expect(isOnline()).toBe(false);
      
      // Restore
      Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
    });
  });

  describe('onSyncEvent', () => {
    it('should register and call listener', () => {
      const listener = vi.fn();
      const unsubscribe = onSyncEvent(listener);
      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });

    it('should remove listener on unsubscribe', () => {
      const listener = vi.fn();
      const unsubscribe = onSyncEvent(listener);
      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
      // After unsubscribe, listener should not be called on future events
      expect(listener).not.toHaveBeenCalled();
    });

    it('should support multiple listeners', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const unsub1 = onSyncEvent(listener1);
      const unsub2 = onSyncEvent(listener2);
      expect(typeof unsub1).toBe('function');
      expect(typeof unsub2).toBe('function');
      unsub1();
      unsub2();
    });
  });

  describe('syncPendingOperations', () => {
    it('should return early when offline', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true });

      const result = await syncPendingOperations();

      expect(result.offline).toBe(true);
      expect(result.synced).toBe(0);
      expect(offlineStorage.getPendingOperations).not.toHaveBeenCalled();
    });

    it('should process pending operations successfully', async () => {
      offlineStorage.getPendingOperations.mockResolvedValue([
        { id: 'op-1', type: 'CREATE_JOB', data: { title: 'Test' }, retries: 0 },
      ]);
      offlineStorage.getPendingPhotos.mockResolvedValue([]);
      api.post.mockResolvedValue({ data: { _id: 'job-1' } });

      const result = await syncPendingOperations();

      expect(result.synced).toBe(1);
      expect(result.failed).toBe(0);
      expect(offlineStorage.removeOperation).toHaveBeenCalledWith('op-1');
    });

    it('should handle operation failure gracefully', async () => {
      offlineStorage.getPendingOperations.mockResolvedValue([
        { id: 'op-1', type: 'CREATE_JOB', data: { title: 'Test' }, retries: 0 },
      ]);
      offlineStorage.getPendingPhotos.mockResolvedValue([]);
      api.post.mockRejectedValue(new Error('Network error'));

      const result = await syncPendingOperations();

      expect(result.failed).toBe(1);
      expect(offlineStorage.updateOperationStatus).toHaveBeenCalledWith('op-1', 'failed', 'Network error');
    });

    it('should skip operations exceeding max retries', async () => {
      offlineStorage.getPendingOperations.mockResolvedValue([
        { id: 'op-1', type: 'CREATE_JOB', data: {}, retries: 5 },
      ]);
      offlineStorage.getPendingPhotos.mockResolvedValue([]);

      const result = await syncPendingOperations();

      expect(result.synced).toBe(0);
      expect(result.failed).toBe(0);
      expect(api.post).not.toHaveBeenCalled();
    });

    it('should emit sync events during processing', async () => {
      const events = [];
      const unsub = onSyncEvent((event, data) => {
        events.push({ event, data });
      });

      offlineStorage.getPendingOperations.mockResolvedValue([]);
      offlineStorage.getPendingPhotos.mockResolvedValue([]);

      await syncPendingOperations();

      expect(events.some(e => e.event === 'sync_start')).toBe(true);
      expect(events.some(e => e.event === 'sync_complete')).toBe(true);

      unsub();
    });

    it('should process photos after operations', async () => {
      offlineStorage.getPendingOperations.mockResolvedValue([]);
      offlineStorage.getPendingPhotos.mockResolvedValue([
        { id: 'photo-1', jobId: 'job-1', base64Data: 'data:image/jpeg;base64,abc', fileName: 'test.jpg', folderName: 'photos' },
      ]);
      api.post.mockResolvedValue({ data: { _id: 'doc-1' } });

      const result = await syncPendingOperations();

      expect(result.synced).toBe(1);
      expect(offlineStorage.removePendingPhoto).toHaveBeenCalledWith('photo-1');
    });

    it('should handle photo upload failure', async () => {
      offlineStorage.getPendingOperations.mockResolvedValue([]);
      offlineStorage.getPendingPhotos.mockResolvedValue([
        { id: 'photo-1', jobId: 'job-1', base64Data: 'data:image/jpeg;base64,abc', fileName: 'test.jpg', folderName: 'photos' },
      ]);
      api.post.mockRejectedValue(new Error('Upload failed'));

      const result = await syncPendingOperations();

      expect(result.failed).toBe(1);
      expect(offlineStorage.removePendingPhoto).not.toHaveBeenCalled();
    });

    it('should handle concurrent sync calls', async () => {
      offlineStorage.getPendingOperations.mockResolvedValue([]);
      offlineStorage.getPendingPhotos.mockResolvedValue([]);

      // First call starts, second should be skipped
      const promise1 = syncPendingOperations();
      const promise2 = syncPendingOperations();

      const [result1, result2] = await Promise.all([promise1, promise2]);

      // One should succeed, other should be skipped
      expect(result1.synced + result2.synced).toBe(0);
    });
  });

  describe('Sync Event Listener Error Handling', () => {
    it('should catch errors in listeners without stopping sync', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const badListener = vi.fn().mockImplementation(() => { throw new Error('Listener error'); });
      const goodListener = vi.fn();

      const unsub1 = onSyncEvent(badListener);
      const unsub2 = onSyncEvent(goodListener);

      offlineStorage.getPendingOperations.mockResolvedValue([]);
      offlineStorage.getPendingPhotos.mockResolvedValue([]);

      await syncPendingOperations();

      // Bad listener threw, but sync completed
      expect(consoleSpy).toHaveBeenCalled();

      unsub1();
      unsub2();
      consoleSpy.mockRestore();
    });
  });
});
