/**
 * useSync Hook Tests
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock queue manager before importing useSync
vi.mock('../../utils/queue.manager', () => {
  const mockQueue = [];
  return {
    default: {
      init: vi.fn().mockResolvedValue(undefined),
      enqueue: vi.fn().mockResolvedValue({ id: 'test-item-1', type: 'UNIT_ENTRY' }),
      peek: vi.fn().mockResolvedValue(null),
      getAll: vi.fn().mockResolvedValue(mockQueue),
      getCount: vi.fn().mockResolvedValue({
        total: 0,
        pending: 0,
        failed: 0,
        dead: 0,
        byType: { units: 0, photos: 0, operations: 0 },
      }),
      process: vi.fn().mockResolvedValue({ processed: 0, failed: 0 }),
      subscribe: vi.fn().mockReturnValue(() => {}),
      resetItem: vi.fn().mockResolvedValue({}),
    },
    QUEUE_TYPES: {
      UNIT_ENTRY: 'UNIT_ENTRY',
      PHOTO_UPLOAD: 'PHOTO_UPLOAD',
      OPERATION: 'OPERATION',
    },
    QUEUE_STATUS: {
      PENDING: 'pending',
      SYNCING: 'syncing',
      FAILED: 'failed',
      DEAD: 'dead',
      SYNCED: 'synced',
    },
  };
});

import { useSync } from '../useSync';
import queueManager from '../../utils/queue.manager';

describe('useSync Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock navigator.onLine
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial State', () => {
    it('should have correct initial state', async () => {
      const { result } = renderHook(() => useSync({ autoSync: false }));

      expect(result.current.isOnline).toBe(true);
      expect(result.current.isSyncing).toBe(false);
      expect(result.current.pendingCount).toBe(0);
      expect(result.current.failedCount).toBe(0);
      expect(result.current.totalPending).toBe(0);
      expect(result.current.hasPendingItems).toBe(false);
    });

    it('should initialize queue manager', async () => {
      renderHook(() => useSync({ autoSync: false }));

      expect(queueManager.init).toHaveBeenCalled();
    });
  });

  describe('Online/Offline Detection', () => {
    it('should detect online status', () => {
      const { result } = renderHook(() => useSync({ autoSync: false }));
      expect(result.current.isOnline).toBe(true);
    });

    it('should update when going offline', async () => {
      const { result } = renderHook(() => useSync({ autoSync: false }));

      await act(async () => {
        Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
        window.dispatchEvent(new Event('offline'));
        // Allow state update
        await new Promise(r => setTimeout(r, 10));
      });

      expect(result.current.isOnline).toBe(false);
    });

    it('should update when coming online', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
      
      const { result } = renderHook(() => useSync({ autoSync: false }));

      await act(async () => {
        Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
        window.dispatchEvent(new Event('online'));
        await new Promise(r => setTimeout(r, 10));
      });

      expect(result.current.isOnline).toBe(true);
    });
  });

  describe('Sync Function', () => {
    it('should call process on sync', async () => {
      const { result } = renderHook(() => useSync({ autoSync: false }));

      await act(async () => {
        await result.current.sync();
      });

      expect(queueManager.process).toHaveBeenCalled();
    });

    it('should not sync when offline', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
      
      const { result } = renderHook(() => useSync({ autoSync: false }));

      await act(async () => {
        const syncResult = await result.current.sync();
        expect(syncResult.offline).toBe(true);
      });

      expect(queueManager.process).not.toHaveBeenCalled();
    });

    it('should set syncing state during sync', async () => {
      let resolveProcess;
      queueManager.process.mockImplementation(() => new Promise((resolve) => {
        resolveProcess = resolve;
      }));

      const { result } = renderHook(() => useSync({ autoSync: false }));

      // Start sync
      act(() => {
        result.current.sync();
      });

      expect(result.current.isSyncing).toBe(true);

      // Complete sync
      await act(async () => {
        resolveProcess({ processed: 1, failed: 0 });
      });

      expect(result.current.isSyncing).toBe(false);
    });
  });

  describe('Enqueue', () => {
    it('should enqueue items', async () => {
      const { result } = renderHook(() => useSync({ autoSync: false }));

      await act(async () => {
        await result.current.enqueue('UNIT_ENTRY', { data: 'test' });
      });

      expect(queueManager.enqueue).toHaveBeenCalledWith(
        'UNIT_ENTRY',
        { data: 'test' },
        {}
      );
    });

    it('should enqueue with options', async () => {
      const { result } = renderHook(() => useSync({ autoSync: false }));

      await act(async () => {
        await result.current.enqueue('UNIT_ENTRY', { data: 'test' }, { priority: 2 });
      });

      expect(queueManager.enqueue).toHaveBeenCalledWith(
        'UNIT_ENTRY',
        { data: 'test' },
        { priority: 2 }
      );
    });
  });

  describe('Retry Failed', () => {
    it('should retry failed items', async () => {
      queueManager.getAll.mockResolvedValue([
        { id: '1', status: 'failed' },
        { id: '2', status: 'dead' },
      ]);
      // Mock sync to just return quickly
      queueManager.process.mockResolvedValue({ processed: 0, failed: 0 });

      const { result } = renderHook(() => useSync({ autoSync: false }));
      
      // Wait for initialization
      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      let count;
      await act(async () => {
        count = await result.current.retryFailed();
      });
      
      expect(count).toBe(2);
      expect(queueManager.resetItem).toHaveBeenCalledTimes(2);
    });
  });

  describe('Queue Access', () => {
    it('should return queue items', async () => {
      const mockItems = [
        { id: '1', type: 'UNIT_ENTRY' },
        { id: '2', type: 'PHOTO_UPLOAD' },
      ];
      queueManager.getAll.mockResolvedValue(mockItems);

      const { result } = renderHook(() => useSync({ autoSync: false }));

      // Wait for initialization
      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      let items;
      await act(async () => {
        items = await result.current.getQueue();
      });

      expect(items).toEqual(mockItems);
    });
  });

  describe('Callbacks', () => {
    it('should call onSyncComplete after sync', async () => {
      const onSyncComplete = vi.fn();
      queueManager.process.mockResolvedValue({ processed: 2, failed: 1 });

      const { result } = renderHook(() => useSync({ 
        autoSync: false,
        onSyncComplete,
      }));

      // Wait for initialization
      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      await act(async () => {
        await result.current.sync();
      });

      expect(onSyncComplete).toHaveBeenCalledWith({ processed: 2, failed: 1 });
    });
  });

  describe('QUEUE_TYPES Export', () => {
    it('should expose QUEUE_TYPES from the hook', async () => {
      const { result } = renderHook(() => useSync({ autoSync: false }));

      // Wait for initialization
      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      // QUEUE_TYPES is exported from the hook
      expect(result.current.QUEUE_TYPES).toBeDefined();
    });
  });
});

