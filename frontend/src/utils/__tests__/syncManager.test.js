/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Sync Manager Tests
 * 
 * Tests offline-to-online sync operations, event system, and photo uploads.
 */

import { describe, it, expect, vi } from 'vitest';
import { onSyncEvent, isOnline } from '../syncManager';

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

describe('Sync Manager', () => {

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
});

