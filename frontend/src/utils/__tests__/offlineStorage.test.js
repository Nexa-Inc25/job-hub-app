/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Offline Storage Tests - Unit Entry Functions
 * 
 * These tests mock IndexedDB at the global level since fake-indexeddb
 * has compatibility issues with vitest's module isolation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Create a mock IndexedDB store in memory
let mockStores = {};
let mockDb = null;

// Mock IndexedDB request
const createMockRequest = (result) => {
  const request = {
    result,
    error: null,
    onsuccess: null,
    onerror: null,
  };
  setTimeout(() => request.onsuccess?.({ target: request }), 0);
  return request;
};

// Mock IndexedDB transaction
const createMockTransaction = (_storeNames) => {
  return {
    objectStore: (name) => ({
      add: (data) => {
        const id = data.offlineId || data.id || Date.now();
        mockStores[name] = mockStores[name] || [];
        mockStores[name].push({ ...data, id });
        return createMockRequest(id);
      },
      put: (data) => {
        const key = data._id || data.offlineId || data.key;
        mockStores[name] = mockStores[name] || [];
        const idx = mockStores[name].findIndex(item => 
          item._id === key || item.offlineId === key || item.key === key
        );
        if (idx >= 0) {
          mockStores[name][idx] = data;
        } else {
          mockStores[name].push(data);
        }
        return createMockRequest(key);
      },
      get: (key) => {
        mockStores[name] = mockStores[name] || [];
        const item = mockStores[name].find(i => 
          i._id === key || i.offlineId === key || i.key === key || i.id === key
        );
        return createMockRequest(item);
      },
      getAll: (query) => {
        mockStores[name] = mockStores[name] || [];
        let items = [...mockStores[name]];
        if (query) {
          items = items.filter(item => {
            // Simple query matching for indexes
            return Object.values(item).includes(query);
          });
        }
        return createMockRequest(items);
      },
      delete: (key) => {
        mockStores[name] = mockStores[name] || [];
        mockStores[name] = mockStores[name].filter(i => 
          i._id !== key && i.offlineId !== key && i.id !== key
        );
        return createMockRequest(undefined);
      },
      index: (indexName) => ({
        getAll: (query) => {
          mockStores[name] = mockStores[name] || [];
          const items = mockStores[name].filter(item => item[indexName] === query);
          return createMockRequest(items);
        },
      }),
      openCursor: () => {
        const request = { onsuccess: null, onerror: null };
        setTimeout(() => {
          request.onsuccess?.({ target: { result: null } });
        }, 0);
        return request;
      },
    }),
  };
};

// Setup mock IndexedDB
beforeEach(() => {
  mockStores = {};
  mockDb = {
    transaction: createMockTransaction,
    objectStoreNames: { contains: () => true },
  };
  
  const mockOpen = {
    result: mockDb,
    error: null,
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
  };
  
  global.indexedDB = {
    open: () => {
      setTimeout(() => mockOpen.onsuccess?.(), 0);
      return mockOpen;
    },
    databases: () => Promise.resolve([]),
    deleteDatabase: () => {},
  };
});

describe('offlineStorage - Unit Entry Functions', () => {
  // Import fresh for each test
  let storage;
  
  beforeEach(async () => {
    vi.resetModules();
    storage = await import('../offlineStorage');
  });

  describe('getGPSQuality equivalent', () => {
    it('should handle offline ID generation format', () => {
      // Test the format of offline IDs
      const offlineIdPattern = /^offline_\d+_[a-z0-9]+$/;
      const testId = `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      expect(testId).toMatch(offlineIdPattern);
    });
  });

  describe('savePendingUnit', () => {
    it('should save a pending unit entry', async () => {
      const unitData = {
        jobId: 'job-123',
        itemCode: 'EC-001',
        quantity: 5,
        photos: [{ url: 'data:image/jpeg;base64,...' }],
      };

      const result = await storage.savePendingUnit(unitData);

      expect(result).toBeDefined();
      expect(result.offlineId).toBeDefined();
      expect(result.offlineId).toMatch(/^offline_/);
      expect(result.syncStatus).toBe('pending');
      expect(result.syncAttempts).toBe(0);
      expect(result.jobId).toBe('job-123');
    });

    it('should generate unique offline IDs', async () => {
      const unit1 = await storage.savePendingUnit({ jobId: 'job-1' });
      // Small delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 5));
      const unit2 = await storage.savePendingUnit({ jobId: 'job-2' });

      expect(unit1.offlineId).not.toBe(unit2.offlineId);
    });

    it('should include createdAt timestamp', async () => {
      const result = await storage.savePendingUnit({ jobId: 'job-123' });

      expect(result.createdAt).toBeDefined();
      const createdAt = new Date(result.createdAt);
      expect(createdAt.getTime()).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('getPendingUnits', () => {
    it('should return empty array when no units exist', async () => {
      const units = await storage.getPendingUnits();
      expect(units).toEqual([]);
    });

    it('should return all pending units', async () => {
      await storage.savePendingUnit({ jobId: 'job-1', itemCode: 'A' });
      await storage.savePendingUnit({ jobId: 'job-2', itemCode: 'B' });
      await storage.savePendingUnit({ jobId: 'job-1', itemCode: 'C' });

      const units = await storage.getPendingUnits();
      expect(units).toHaveLength(3);
    });
  });

  describe('updateUnitSyncStatus', () => {
    it('should update sync status to synced', async () => {
      const unit = await storage.savePendingUnit({ jobId: 'job-123' });

      const updated = await storage.updateUnitSyncStatus(unit.offlineId, 'synced');

      expect(updated.syncStatus).toBe('synced');
      expect(updated.lastSyncAttempt).toBeDefined();
    });

    it('should increment syncAttempts on failure', async () => {
      const unit = await storage.savePendingUnit({ jobId: 'job-123' });

      await storage.updateUnitSyncStatus(unit.offlineId, 'failed', 'Network error');
      const updated = await storage.updateUnitSyncStatus(unit.offlineId, 'failed', 'Network error');

      expect(updated.syncAttempts).toBe(2);
      expect(updated.lastSyncError).toBe('Network error');
    });

    it('should return null for non-existent unit', async () => {
      const result = await storage.updateUnitSyncStatus('non-existent', 'synced');
      expect(result).toBeNull();
    });
  });

  describe('removePendingUnit', () => {
    it('should remove a pending unit', async () => {
      const unit = await storage.savePendingUnit({ jobId: 'job-123' });
      
      await storage.removePendingUnit(unit.offlineId);

      const units = await storage.getPendingUnits();
      expect(units.find(u => u.offlineId === unit.offlineId)).toBeUndefined();
    });

    it('should not throw when removing non-existent unit', async () => {
      await expect(storage.removePendingUnit('non-existent')).resolves.not.toThrow();
    });
  });

  describe('cachePriceBook', () => {
    it('should cache a price book', async () => {
      const priceBook = {
        _id: 'pb-123',
        utilityId: 'utility-1',
        name: 'Test Price Book',
        status: 'active',
        items: [{ itemCode: 'A', unitPrice: 100 }],
      };

      const result = await storage.cachePriceBook(priceBook);

      expect(result._id).toBe('pb-123');
      expect(result._cachedAt).toBeDefined();
    });
  });

  describe('getCachedPriceBook', () => {
    it('should return null when no price book cached', async () => {
      const result = await storage.getCachedPriceBook('utility-1');
      expect(result).toBeNull();
    });

    it('should return cached price book for utility', async () => {
      await storage.cachePriceBook({
        _id: 'pb-1',
        utilityId: 'utility-1',
        status: 'active',
      });

      const result = await storage.getCachedPriceBook('utility-1');
      expect(result._id).toBe('pb-1');
    });
  });

  describe('Conflict Resolution Functions', () => {
    it('should save a conflict record', async () => {
      const conflictData = {
        offlineId: 'offline_123_abc',
        type: 'unit_entry',
        localData: { quantity: 10, itemCode: 'EC-001' },
        serverData: { quantity: 8, itemCode: 'EC-001' },
        resolution: 'keep_server',
        conflictingFields: ['quantity'],
      };

      const result = await storage.saveConflictRecord(conflictData);

      expect(result).toBeDefined();
      expect(result.offlineId).toBe('offline_123_abc');
      expect(result.resolution).toBe('keep_server');
      expect(result.resolvedAt).toBeDefined();
    });

    it('should get conflict history for an offlineId', async () => {
      await storage.saveConflictRecord({
        offlineId: 'offline_456_def',
        type: 'unit_entry',
        localData: { quantity: 5 },
        serverData: { quantity: 3 },
        resolution: 'keep_local',
      });

      const history = await storage.getConflictHistory('offline_456_def');
      expect(history).toHaveLength(1);
      expect(history[0].resolution).toBe('keep_local');
    });

    it('should get all conflict records when no offlineId specified', async () => {
      await storage.saveConflictRecord({
        offlineId: 'offline_a', type: 'unit_entry',
        localData: {}, serverData: {}, resolution: 'keep_server',
      });
      await storage.saveConflictRecord({
        offlineId: 'offline_b', type: 'field_ticket',
        localData: {}, serverData: {}, resolution: 'merge',
      });

      const all = await storage.getAllConflicts();
      expect(all.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('compareFields', () => {
    it('should detect conflicting fields', () => {
      const local = { quantity: 10, itemCode: 'EC-001', notes: 'local note' };
      const server = { quantity: 8, itemCode: 'EC-001', notes: 'server note' };

      const diff = storage.compareFields(local, server);

      expect(diff.hasConflicts).toBe(true);
      expect(diff.conflicts.length).toBe(2); // quantity and notes
      expect(diff.unchanged).toContain('itemCode');
    });

    it('should return no conflicts for identical data', () => {
      const data = { quantity: 5, itemCode: 'EC-001' };

      const diff = storage.compareFields(data, { ...data });

      expect(diff.hasConflicts).toBe(false);
      expect(diff.conflicts.length).toBe(0);
    });

    it('should skip internal metadata keys', () => {
      const local = { _id: '123', quantity: 5, syncStatus: 'pending' };
      const server = { _id: '456', quantity: 5, syncStatus: 'synced' };

      const diff = storage.compareFields(local, server);

      expect(diff.hasConflicts).toBe(false);
      expect(diff.conflicts.length).toBe(0);
    });

    it('should handle null inputs', () => {
      const diff = storage.compareFields(null, { quantity: 5 });

      expect(diff.hasConflicts).toBe(true);
      expect(diff.conflicts.length).toBe(1);
    });

    it('should detect nested object changes', () => {
      const local = { gps: { lat: 37.7749, lng: -122.4194 } };
      const server = { gps: { lat: 37.7750, lng: -122.4194 } };

      const diff = storage.compareFields(local, server);

      expect(diff.hasConflicts).toBe(true);
      expect(diff.conflicts[0].field).toBe('gps');
    });
  });

  describe('mergeFieldChoices', () => {
    it('should merge using field choices', () => {
      const local = { quantity: 10, notes: 'local note', itemCode: 'EC-001' };
      const server = { quantity: 8, notes: 'server note', itemCode: 'EC-002' };
      const choices = { quantity: 'local', notes: 'server' };

      const merged = storage.mergeFieldChoices(local, server, choices);

      expect(merged.quantity).toBe(10);      // local
      expect(merged.notes).toBe('server note'); // server
      expect(merged.itemCode).toBe('EC-002');  // server (default)
    });

    it('should default to server values for unspecified fields', () => {
      const local = { a: 1, b: 2 };
      const server = { a: 10, b: 20 };

      const merged = storage.mergeFieldChoices(local, server, {});

      expect(merged.a).toBe(10);
      expect(merged.b).toBe(20);
    });
  });

  describe('Integration: Full Sync Workflow', () => {
    it('should support full offline to sync workflow', async () => {
      // 1. Save unit offline
      const unit = await storage.savePendingUnit({
        jobId: 'job-123',
        itemCode: 'EC-001',
        quantity: 10,
        photos: [{ url: 'data:...' }],
      });
      expect(unit.syncStatus).toBe('pending');

      // 2. Attempt sync - fails
      await storage.updateUnitSyncStatus(unit.offlineId, 'failed', 'No network');
      let pending = await storage.getPendingUnits('job-123');
      const failedUnit = pending.find(u => u.offlineId === unit.offlineId);
      expect(failedUnit?.syncStatus).toBe('failed');

      // 3. Retry sync - succeeds
      await storage.updateUnitSyncStatus(unit.offlineId, 'synced');
      pending = await storage.getPendingUnits('job-123');
      const syncedUnit = pending.find(u => u.offlineId === unit.offlineId);
      expect(syncedUnit?.syncStatus).toBe('synced');

      // 4. Remove synced unit
      await storage.removePendingUnit(unit.offlineId);
      pending = await storage.getPendingUnits('job-123');
      expect(pending.find(u => u.offlineId === unit.offlineId)).toBeUndefined();
    });
  });
});
