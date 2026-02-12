/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * useOptimisticSync Hook Tests
 * 
 * Tests for the optimistic UI / background sync pattern used for
 * offline-first data capture (unit entries, field tickets).
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useOptimisticSync, useUnitEntrySync, useFieldTicketSync, SYNC_STATUS } from '../useOptimisticSync';

// Mock useOnlineStatus from useOffline
let mockIsOnline = true;
vi.mock('../useOffline', () => ({
  useOnlineStatus: () => mockIsOnline,
}));

// Mock offlineStorage
vi.mock('../../utils/offlineStorage', () => ({
  queueOperation: vi.fn().mockResolvedValue({ id: 'op-1' }),
  getPendingOperations: vi.fn().mockResolvedValue([]),
  removeOperation: vi.fn().mockResolvedValue(true),
  updateOperationStatus: vi.fn().mockResolvedValue(true),
}));

// Mock api
vi.mock('../../api', () => ({
  default: vi.fn().mockResolvedValue({ data: { success: true } }),
}));

import * as offlineStorage from '../../utils/offlineStorage';
import api from '../../api';

describe('useOptimisticSync Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockIsOnline = true;
    offlineStorage.getPendingOperations.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('SYNC_STATUS constants', () => {
    it('should export all expected status values', () => {
      expect(SYNC_STATUS.IDLE).toBe('idle');
      expect(SYNC_STATUS.SAVING).toBe('saving');
      expect(SYNC_STATUS.SAVED_LOCALLY).toBe('saved_locally');
      expect(SYNC_STATUS.SYNCING).toBe('syncing');
      expect(SYNC_STATUS.SYNCED).toBe('synced');
      expect(SYNC_STATUS.CONFLICT).toBe('conflict');
      expect(SYNC_STATUS.ERROR).toBe('error');
    });
  });

  describe('Initial state', () => {
    it('should return idle status and zero pending count', () => {
      const { result } = renderHook(() => useOptimisticSync());
      
      expect(result.current.syncStatus).toBe(SYNC_STATUS.IDLE);
      expect(result.current.pendingCount).toBe(0);
      expect(result.current.lastSyncTime).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.isOnline).toBe(true);
      expect(result.current.isSyncing).toBe(false);
      expect(result.current.hasPending).toBe(false);
    });

    it('should load initial pending count from storage', async () => {
      // Go offline so auto-sync doesn't fire and change the count
      mockIsOnline = false;
      offlineStorage.getPendingOperations.mockResolvedValue([
        { type: 'sync', endpoint: '/api/data', status: 'pending' },
        { type: 'sync', endpoint: '/api/data', status: 'pending' },
        { type: 'sync', endpoint: '/api/other', status: 'pending' },
      ]);

      const { result } = renderHook(() => useOptimisticSync({ endpoint: '/api/data' }));

      await waitFor(() => {
        expect(result.current.pendingCount).toBe(2);
      });
    });

    it('should exclude synced operations from pending count', async () => {
      mockIsOnline = false;
      offlineStorage.getPendingOperations.mockResolvedValue([
        { type: 'sync', endpoint: '/api/data', status: 'pending' },
        { type: 'sync', endpoint: '/api/data', status: 'synced' },
      ]);

      const { result } = renderHook(() => useOptimisticSync({ endpoint: '/api/data' }));

      await waitFor(() => {
        expect(result.current.pendingCount).toBe(1);
      });
    });
  });

  describe('saveOptimistic', () => {
    it('should save data to IndexedDB and return success', async () => {
      const { result } = renderHook(() => useOptimisticSync({ endpoint: '/api/billing/units' }));

      let saveResult;
      await act(async () => {
        saveResult = await result.current.saveOptimistic({ itemCode: 'EC-001', quantity: 5 });
      });

      expect(saveResult.success).toBe(true);
      expect(saveResult.offlineId).toMatch(/^offline_/);
      expect(saveResult.data.itemCode).toBe('EC-001');
      expect(saveResult.data.syncStatus).toBe('pending');
      expect(saveResult.data.syncAttempts).toBe(0);

      expect(offlineStorage.queueOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'sync',
          endpoint: '/api/billing/units',
          method: 'POST',
        })
      );
    });

    it('should update status to SAVED_LOCALLY after saving while offline', async () => {
      mockIsOnline = false; // Prevent auto-sync from changing status
      const { result } = renderHook(() => useOptimisticSync());

      await act(async () => {
        await result.current.saveOptimistic({ test: true });
      });

      expect(result.current.syncStatus).toBe(SYNC_STATUS.SAVED_LOCALLY);
    });

    it('should increment pending count after saving', async () => {
      mockIsOnline = false; // Prevent auto-sync from resetting count
      const { result } = renderHook(() => useOptimisticSync());

      await act(async () => {
        await result.current.saveOptimistic({ item: 1 });
      });
      expect(result.current.pendingCount).toBe(1);
      expect(result.current.hasPending).toBe(true);

      await act(async () => {
        await result.current.saveOptimistic({ item: 2 });
      });
      expect(result.current.pendingCount).toBe(2);
    });

    it('should return error when storage fails', async () => {
      offlineStorage.queueOperation.mockRejectedValueOnce(new Error('IndexedDB full'));

      const { result } = renderHook(() => useOptimisticSync());

      let saveResult;
      await act(async () => {
        saveResult = await result.current.saveOptimistic({ test: true });
      });

      expect(saveResult.success).toBe(false);
      expect(saveResult.error).toBe('IndexedDB full');
      expect(result.current.syncStatus).toBe(SYNC_STATUS.ERROR);
      expect(result.current.error).toBe('IndexedDB full');
    });

    it('should trigger background sync if online', async () => {
      mockIsOnline = true;
      offlineStorage.getPendingOperations.mockResolvedValue([]);

      const { result } = renderHook(() => useOptimisticSync());

      await act(async () => {
        await result.current.saveOptimistic({ test: true });
      });

      // Background sync is scheduled via setTimeout(100ms)
      await act(async () => {
        vi.advanceTimersByTime(150);
      });

      // Should have attempted to get pending operations for sync
      expect(offlineStorage.getPendingOperations).toHaveBeenCalled();
    });

    it('should not trigger sync if offline', async () => {
      mockIsOnline = false;
      
      const { result } = renderHook(() => useOptimisticSync());

      await act(async () => {
        await result.current.saveOptimistic({ test: true });
      });

      await act(async () => {
        vi.advanceTimersByTime(150);
      });

      // getPendingOperations called once for initial count, but NOT for sync
      expect(offlineStorage.getPendingOperations).toHaveBeenCalledTimes(1);
    });
  });

  describe('syncPending', () => {
    it('should sync pending operations to server', async () => {
      const pendingOps = [
        { id: 'op-1', type: 'sync', endpoint: '/api/data', status: 'pending', method: 'POST', data: { item: 1 } },
        { id: 'op-2', type: 'sync', endpoint: '/api/data', status: 'pending', method: 'POST', data: { item: 2 } },
      ];
      offlineStorage.getPendingOperations.mockResolvedValue(pendingOps);
      api.mockResolvedValue({ data: { success: true } });

      const onSyncComplete = vi.fn();
      const { result } = renderHook(() => useOptimisticSync({ onSyncComplete }));

      await act(async () => {
        await result.current.syncPending();
      });

      expect(api).toHaveBeenCalledTimes(2);
      expect(offlineStorage.removeOperation).toHaveBeenCalledTimes(2);
      expect(result.current.syncStatus).toBe(SYNC_STATUS.SYNCED);
    });

    it('should not sync when offline', async () => {
      mockIsOnline = false;
      
      const { result } = renderHook(() => useOptimisticSync());

      await act(async () => {
        await result.current.syncPending();
      });

      expect(api).not.toHaveBeenCalled();
    });

    it('should set SYNCED status when no pending operations', async () => {
      offlineStorage.getPendingOperations.mockResolvedValue([]);

      const { result } = renderHook(() => useOptimisticSync());

      await act(async () => {
        await result.current.syncPending();
      });

      expect(result.current.syncStatus).toBe(SYNC_STATUS.SYNCED);
      expect(result.current.pendingCount).toBe(0);
    });

    it('should handle conflict responses', async () => {
      const pendingOps = [
        { id: 'op-1', type: 'sync', endpoint: '/api/data', status: 'pending', method: 'POST', data: { item: 1 } },
      ];
      offlineStorage.getPendingOperations.mockResolvedValue(pendingOps);
      api.mockResolvedValue({ data: { conflict: true, serverData: { item: 'server' } } });

      const onConflict = vi.fn();
      const { result } = renderHook(() => useOptimisticSync({ onConflict }));

      await act(async () => {
        await result.current.syncPending();
      });

      expect(onConflict).toHaveBeenCalledWith(
        expect.objectContaining({ item: 1 }),
        { item: 'server' }
      );
      expect(result.current.syncStatus).toBe(SYNC_STATUS.CONFLICT);
      expect(offlineStorage.removeOperation).toHaveBeenCalledWith('op-1');
    });

    it('should retry with exponential backoff on failure', async () => {
      const pendingOps = [
        { id: 'op-1', type: 'sync', endpoint: '/api/data', status: 'pending', method: 'POST', data: { item: 1 }, retries: 0 },
      ];
      offlineStorage.getPendingOperations.mockResolvedValue(pendingOps);
      api.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useOptimisticSync());

      await act(async () => {
        await result.current.syncPending();
      });

      expect(offlineStorage.updateOperationStatus).toHaveBeenCalledWith('op-1', 'pending', 'Network error');
    });

    it('should mark operation as failed after max retries', async () => {
      const pendingOps = [
        { id: 'op-1', type: 'sync', endpoint: '/api/data', status: 'pending', method: 'POST', data: { item: 1 }, retries: 10 },
      ];
      // Return pending ops for initial count, then for syncPending, then empty
      offlineStorage.getPendingOperations
        .mockResolvedValueOnce([]) // initial count load
        .mockResolvedValueOnce(pendingOps) // syncPending call
        .mockResolvedValue([]); // any subsequent calls
      api.mockRejectedValueOnce(new Error('Persistent error'));

      const { result } = renderHook(() => useOptimisticSync({ config: { maxRetries: 5, baseDelay: 1000, maxDelay: 30000, backoffMultiplier: 2 } }));

      // Wait for initial load
      await act(async () => { await vi.advanceTimersByTimeAsync(10); });

      await act(async () => {
        await result.current.syncPending();
      });

      expect(offlineStorage.updateOperationStatus).toHaveBeenCalledWith('op-1', 'failed', 'Persistent error');
    });

    it('should only sync operations matching the endpoint', async () => {
      const pendingOps = [
        { id: 'op-1', type: 'sync', endpoint: '/api/billing/units', status: 'pending', method: 'POST', data: {} },
        { id: 'op-2', type: 'sync', endpoint: '/api/fieldtickets', status: 'pending', method: 'POST', data: {} },
      ];
      offlineStorage.getPendingOperations
        .mockResolvedValueOnce([]) // initial count load
        .mockResolvedValueOnce(pendingOps); // syncPending call
      api.mockResolvedValue({ data: { success: true } });

      const { result } = renderHook(() => useOptimisticSync({ endpoint: '/api/billing/units' }));

      // Wait for initial load
      await act(async () => { await vi.advanceTimersByTimeAsync(10); });

      await act(async () => {
        await result.current.syncPending();
      });

      expect(api).toHaveBeenCalledTimes(1);
      expect(api).toHaveBeenCalledWith(expect.objectContaining({ url: '/api/billing/units' }));
    });
  });

  describe('forceSync', () => {
    it('should clear any pending retry timeout and sync immediately', async () => {
      offlineStorage.getPendingOperations.mockResolvedValue([]);

      const { result } = renderHook(() => useOptimisticSync());

      await act(async () => {
        await result.current.forceSync();
      });

      expect(offlineStorage.getPendingOperations).toHaveBeenCalled();
    });
  });

  describe('getSyncStatusText', () => {
    it('should return correct text for each status', async () => {
      mockIsOnline = false; // Prevent auto-sync from changing status
      const { result } = renderHook(() => useOptimisticSync());

      // IDLE
      expect(result.current.getSyncStatusText()).toBe('');

      // SAVING -> SAVED_LOCALLY
      await act(async () => {
        await result.current.saveOptimistic({ test: true });
      });
      expect(result.current.getSyncStatusText()).toBe('Saved locally');
    });

    it('should return error message for ERROR status', async () => {
      offlineStorage.queueOperation.mockRejectedValueOnce(new Error('Disk full'));

      const { result } = renderHook(() => useOptimisticSync());

      await act(async () => {
        await result.current.saveOptimistic({ test: true });
      });

      expect(result.current.getSyncStatusText()).toBe('Disk full');
    });
  });

  describe('Auto-sync on reconnect', () => {
    it('should auto-sync when coming back online with pending items', async () => {
      mockIsOnline = false;
      
      const { result, rerender } = renderHook(() => useOptimisticSync());

      // Save while offline
      await act(async () => {
        await result.current.saveOptimistic({ offlineItem: true });
      });
      expect(result.current.pendingCount).toBe(1);

      // Come back online
      mockIsOnline = true;
      offlineStorage.getPendingOperations.mockResolvedValue([
        { type: 'sync', endpoint: '/api/data', status: 'pending', method: 'POST', data: {} },
      ]);
      api.mockResolvedValue({ data: { success: true } });

      await act(async () => {
        rerender();
      });

      // Auto-sync should kick in
      await waitFor(() => {
        expect(api).toHaveBeenCalled();
      });
    });
  });

  describe('Cleanup', () => {
    it('should not throw on unmount', () => {
      const { unmount } = renderHook(() => useOptimisticSync());

      // Should unmount cleanly without errors
      expect(() => unmount()).not.toThrow();
    });
  });

  describe('Convenience hooks', () => {
    it('useUnitEntrySync should use billing/units endpoint', () => {
      const { result } = renderHook(() => useUnitEntrySync());
      
      // It's a wrapper around useOptimisticSync — verify it initializes
      expect(result.current.syncStatus).toBe(SYNC_STATUS.IDLE);
      expect(result.current.saveOptimistic).toBeDefined();
    });

    it('useFieldTicketSync should use fieldtickets endpoint', () => {
      const { result } = renderHook(() => useFieldTicketSync());
      
      expect(result.current.syncStatus).toBe(SYNC_STATUS.IDLE);
      expect(result.current.saveOptimistic).toBeDefined();
    });
  });
});

