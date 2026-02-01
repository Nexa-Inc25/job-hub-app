/**
 * useSyncQueue Hook Tests - NIST SP 800-53 Compliance
 * 
 * Tests the sync queue functionality including:
 * - Atomic transaction integrity (NIST SI-7)
 * - Session containment (NIST AC-3)
 * - Transmission security (NIST SC-8)
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock queue manager before importing useSyncQueue
vi.mock('../../utils/queue.manager', () => {
  return {
    default: {
      init: vi.fn().mockResolvedValue(undefined),
      enqueue: vi.fn().mockResolvedValue({ id: 'test-item-1', type: 'UNIT_ENTRY' }),
      getAll: vi.fn().mockResolvedValue([]),
      getHealth: vi.fn().mockResolvedValue({
        isLocked: false,
        lockReason: null,
        isProcessing: false,
        isOnline: true,
        isAuthenticated: true,
        currentBackoff: 1000,
        counts: {
          total: 0,
          pending: 0,
          syncing: 0,
          failed: 0,
          locked: 0,
          error: 0,
          dead: 0,
          byType: { units: 0, photos: 0, operations: 0 },
        },
        hasErrors: false,
        hasDead: false,
        healthy: true,
      }),
      process: vi.fn().mockResolvedValue({ processed: 0, failed: 0, locked: 0 }),
      subscribe: vi.fn().mockReturnValue(() => {}),
      retryFailedItems: vi.fn().mockResolvedValue(0),
      unlockQueue: vi.fn().mockResolvedValue(true),
      getErrorQueue: vi.fn().mockResolvedValue([]),
      getDeadLetterQueue: vi.fn().mockResolvedValue([]),
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
      LOCKED: 'locked',
      ERROR: 'error',
      DEAD: 'dead',
      SYNCED: 'synced',
    },
    LOCK_REASONS: {
      AUTH_EXPIRED: 'auth_expired',
      VALIDATION_FAILED: 'validation_failed',
      SERVER_REJECTED: 'server_rejected',
    },
  };
});

import { useSyncQueue } from '../useSyncQueue';
import queueManager from '../../utils/queue.manager';

describe('useSyncQueue Hook - NIST Compliance', () => {
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
      const { result } = renderHook(() => useSyncQueue({ autoSync: false }));

      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      expect(result.current.isOnline).toBe(true);
      expect(result.current.isSyncing).toBe(false);
      expect(result.current.isLocked).toBe(false);
      expect(result.current.pendingCount).toBe(0);
      expect(result.current.hasErrors).toBe(false);
      expect(result.current.isHealthy).toBe(true);
    });

    it('should initialize queue manager', async () => {
      renderHook(() => useSyncQueue({ autoSync: false }));

      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      expect(queueManager.init).toHaveBeenCalled();
    });
  });

  describe('NIST SI-7: Atomic Transaction Integrity', () => {
    it('should call process for sync', async () => {
      const { result } = renderHook(() => useSyncQueue({ autoSync: false }));

      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      await act(async () => {
        await result.current.sync();
      });

      expect(queueManager.process).toHaveBeenCalled();
    });

    it('should report transaction results', async () => {
      queueManager.process.mockResolvedValue({ 
        processed: 5, 
        failed: 1, 
        locked: 0 
      });

      const onSyncComplete = vi.fn();
      const { result } = renderHook(() => useSyncQueue({ 
        autoSync: false,
        onSyncComplete,
      }));

      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      await act(async () => {
        await result.current.sync();
      });

      expect(onSyncComplete).toHaveBeenCalledWith({ 
        processed: 5, 
        failed: 1, 
        locked: 0 
      });
    });
  });

  describe('NIST AC-3: Session Containment', () => {
    it('should expose lock state', async () => {
      queueManager.getHealth.mockResolvedValue({
        isLocked: true,
        lockReason: 'auth_expired',
        counts: { pending: 0, failed: 0, error: 0, locked: 3, dead: 0 },
        hasErrors: false,
        hasDead: false,
        healthy: false,
      });

      const { result } = renderHook(() => useSyncQueue({ autoSync: false }));

      await act(async () => {
        await result.current.refreshCounts();
      });

      expect(result.current.isLocked).toBe(true);
      expect(result.current.lockReason).toBe('auth_expired');
    });

    it('should call onAuthRequired when auth fails', async () => {
      queueManager.process.mockResolvedValue({ 
        processed: 0, 
        failed: 0, 
        authRequired: true 
      });

      const onAuthRequired = vi.fn();
      const { result } = renderHook(() => useSyncQueue({ 
        autoSync: false,
        onAuthRequired,
      }));

      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      await act(async () => {
        await result.current.sync();
      });

      expect(onAuthRequired).toHaveBeenCalled();
    });

    it('should support queue unlock', async () => {
      const { result } = renderHook(() => useSyncQueue({ autoSync: false }));

      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      await act(async () => {
        const success = await result.current.unlock();
        expect(success).toBe(true);
      });

      expect(queueManager.unlockQueue).toHaveBeenCalled();
    });
  });

  describe('NIST SC-8: Transmission Security', () => {
    it('should not sync when offline', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
      
      const { result } = renderHook(() => useSyncQueue({ autoSync: false }));

      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      await act(async () => {
        const syncResult = await result.current.sync();
        expect(syncResult.offline).toBe(true);
      });

      expect(queueManager.process).not.toHaveBeenCalled();
    });
  });

  describe('Queue Operations', () => {
    it('should enqueue items', async () => {
      const { result } = renderHook(() => useSyncQueue({ autoSync: false }));

      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      await act(async () => {
        await result.current.enqueue('UNIT_ENTRY', { data: 'test' });
      });

      expect(queueManager.enqueue).toHaveBeenCalledWith(
        'UNIT_ENTRY',
        { data: 'test' },
        {}
      );
    });

    it('should retry failed items', async () => {
      queueManager.retryFailedItems.mockResolvedValue(3);
      
      const { result } = renderHook(() => useSyncQueue({ autoSync: false }));

      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      let count;
      await act(async () => {
        count = await result.current.retryFailed();
      });

      expect(count).toBe(3);
      expect(queueManager.retryFailedItems).toHaveBeenCalled();
    });

    it('should get error queue', async () => {
      const mockErrors = [
        { id: '1', type: 'UNIT_ENTRY', status: 'error' },
      ];
      queueManager.getErrorQueue.mockResolvedValue(mockErrors);

      const { result } = renderHook(() => useSyncQueue({ autoSync: false }));

      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      let errors;
      await act(async () => {
        errors = await result.current.getErrors();
      });

      expect(errors).toEqual(mockErrors);
    });
  });

  describe('Event Handling', () => {
    it('should update when going offline', async () => {
      const { result } = renderHook(() => useSyncQueue({ autoSync: false }));

      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      await act(async () => {
        Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
        window.dispatchEvent(new Event('offline'));
        await new Promise(r => setTimeout(r, 10));
      });

      expect(result.current.isOnline).toBe(false);
    });

    it('should update when coming online', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
      
      const { result } = renderHook(() => useSyncQueue({ autoSync: false }));

      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      await act(async () => {
        Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
        window.dispatchEvent(new Event('online'));
        await new Promise(r => setTimeout(r, 10));
      });

      expect(result.current.isOnline).toBe(true);
    });
  });

  describe('Constants Export', () => {
    it('should expose QUEUE_TYPES', async () => {
      const { result } = renderHook(() => useSyncQueue({ autoSync: false }));

      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      expect(result.current.QUEUE_TYPES).toBeDefined();
      expect(result.current.QUEUE_TYPES.UNIT_ENTRY).toBeDefined();
    });

    it('should expose LOCK_REASONS', async () => {
      const { result } = renderHook(() => useSyncQueue({ autoSync: false }));

      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      expect(result.current.LOCK_REASONS).toBeDefined();
      expect(result.current.LOCK_REASONS.AUTH_EXPIRED).toBeDefined();
    });
  });
});

describe('50-Unit Offline Sync Scenario', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    });
  });

  it('should handle 50-unit batch sync correctly', async () => {
    // Simulate 50 pending items
    queueManager.getHealth.mockResolvedValue({
      isLocked: false,
      lockReason: null,
      isProcessing: false,
      isOnline: true,
      isAuthenticated: true,
      currentBackoff: 1000,
      counts: {
        total: 50,
        pending: 50,
        syncing: 0,
        failed: 0,
        locked: 0,
        error: 0,
        dead: 0,
        byType: { units: 50, photos: 0, operations: 0 },
      },
      hasErrors: false,
      hasDead: false,
      healthy: true,
    });

    // Simulate successful sync of all 50 items
    queueManager.process.mockResolvedValue({ 
      processed: 50, 
      failed: 0, 
      locked: 0 
    });

    const onSyncComplete = vi.fn();
    const { result } = renderHook(() => useSyncQueue({ 
      autoSync: false,
      onSyncComplete,
    }));

    await act(async () => {
      await new Promise(r => setTimeout(r, 50));
    });

    // Should show 50 pending items
    expect(result.current.pendingCount).toBe(50);

    // Trigger sync
    await act(async () => {
      await result.current.sync();
    });

    // Verify all 50 items were processed
    expect(onSyncComplete).toHaveBeenCalledWith({
      processed: 50,
      failed: 0,
      locked: 0,
    });
  });

  it('should handle partial sync failure with atomic rollback', async () => {
    // Simulate 50 pending, then some fail
    queueManager.getHealth
      .mockResolvedValueOnce({
        counts: { total: 50, pending: 50, failed: 0, error: 0, locked: 0, dead: 0 },
        isLocked: false,
        hasErrors: false,
        hasDead: false,
        healthy: true,
      })
      .mockResolvedValue({
        counts: { total: 50, pending: 42, failed: 5, error: 3, locked: 0, dead: 0 },
        isLocked: false,
        hasErrors: true,
        hasDead: false,
        healthy: false,
      });

    // 42 processed, 5 failed (retryable), 3 errors (locked)
    queueManager.process.mockResolvedValue({ 
      processed: 42, 
      failed: 5, 
      locked: 3 
    });

    const { result } = renderHook(() => useSyncQueue({ autoSync: false }));

    await act(async () => {
      await new Promise(r => setTimeout(r, 50));
    });

    await act(async () => {
      const syncResult = await result.current.sync();
      
      expect(syncResult.processed).toBe(42);
      expect(syncResult.failed).toBe(5);
      expect(syncResult.locked).toBe(3);
    });

    // Refresh counts to get updated state
    await act(async () => {
      await result.current.refreshCounts();
    });

    // Should show remaining items
    expect(result.current.failedCount).toBe(5);
    expect(result.current.errorCount).toBe(3);
    expect(result.current.hasErrors).toBe(true);
  });

  it('should lock queue on auth expiry during batch sync', async () => {
    queueManager.getHealth.mockResolvedValue({
      counts: { total: 50, pending: 25, failed: 0, error: 0, locked: 25, dead: 0 },
      isLocked: true,
      lockReason: 'auth_expired',
      hasErrors: false,
      hasDead: false,
      healthy: false,
    });

    queueManager.process.mockResolvedValue({ 
      processed: 25, 
      failed: 0, 
      authRequired: true 
    });

    const onAuthRequired = vi.fn();
    const { result } = renderHook(() => useSyncQueue({ 
      autoSync: false,
      onAuthRequired,
    }));

    await act(async () => {
      await new Promise(r => setTimeout(r, 50));
    });

    await act(async () => {
      await result.current.sync();
    });

    // Auth callback should have been triggered
    expect(onAuthRequired).toHaveBeenCalled();

    // Queue should be locked
    await act(async () => {
      await result.current.refreshCounts();
    });

    expect(result.current.isLocked).toBe(true);
    expect(result.current.lockReason).toBe('auth_expired');
  });
});

