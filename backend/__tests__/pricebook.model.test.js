/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * PriceBook Model Tests
 * 
 * Tests for PriceBook model including rate items,
 * category filtering, version management, and Oracle mapping.
 */

const mongoose = require('mongoose');
const PriceBook = require('../models/PriceBook');
const Company = require('../models/Company');
const User = require('../models/User');

describe('PriceBook Model', () => {
  let testCompany, testUser, testUtilityId;
  
  beforeEach(async () => {
    testCompany = await Company.create({
      name: `Test Company ${Date.now()}`,
      contactEmail: `company${Date.now()}@test.com`
    });
    
    testUser = await User.create({
      email: `user${Date.now()}@test.com`,
      password: 'TestPassword123',
      name: 'Test User',
      companyId: testCompany._id
    });
    
    // Mock utility ID (Utility model may not be needed for these tests)
    testUtilityId = new mongoose.Types.ObjectId();
  });
  
  // ==================== Basic Creation ====================
  describe('PriceBook Creation', () => {
    it('should create a price book with required fields', async () => {
      const priceBook = await PriceBook.create({
        name: 'PG&E MSA 2026 Rates',
        utilityId: testUtilityId,
        companyId: testCompany._id,
        effectiveDate: new Date('2026-01-01')
      });
      
      expect(priceBook._id).toBeDefined();
      expect(priceBook.name).toBe('PG&E MSA 2026 Rates');
      expect(priceBook.status).toBe('draft');
      expect(priceBook.version).toBe(1);
    });
    
    it('should fail without required fields', async () => {
      await expect(PriceBook.create({
        name: 'Missing Fields'
        // Missing utilityId, companyId, effectiveDate
      })).rejects.toThrow();
    });
    
    it('should set timestamps on creation', async () => {
      const priceBook = await PriceBook.create({
        name: 'Timestamp Test',
        utilityId: testUtilityId,
        companyId: testCompany._id,
        effectiveDate: new Date()
      });
      
      expect(priceBook.createdAt).toBeDefined();
      expect(priceBook.updatedAt).toBeDefined();
    });
  });
  
  // ==================== Rate Items ====================
  describe('Rate Items', () => {
    it('should add rate items to price book', async () => {
      const priceBook = await PriceBook.create({
        name: 'Rate Items Test',
        utilityId: testUtilityId,
        companyId: testCompany._id,
        effectiveDate: new Date(),
        items: [
          {
            itemCode: 'UG-TRENCH-001',
            description: 'Trenching - Normal Soil (0-24")',
            category: 'civil',
            unit: 'LF',
            unitPrice: 25.00
          },
          {
            itemCode: 'OH-POLE-SET-001',
            description: 'Set Wood Pole - Class 4',
            category: 'electrical',
            unit: 'EA',
            unitPrice: 1500.00
          }
        ]
      });
      
      expect(priceBook.items.length).toBe(2);
      expect(priceBook.items[0].itemCode).toBe('UG-TRENCH-001');
      expect(priceBook.items[0].unitPrice).toBe(25.00);
    });
    
    it('should require itemCode for rate items', async () => {
      await expect(PriceBook.create({
        name: 'Missing Item Code',
        utilityId: testUtilityId,
        companyId: testCompany._id,
        effectiveDate: new Date(),
        items: [
          {
            // Missing itemCode
            description: 'Test Item',
            category: 'civil',
            unit: 'LF',
            unitPrice: 10.00
          }
        ]
      })).rejects.toThrow();
    });
    
    it('should validate category enum values', async () => {
      await expect(PriceBook.create({
        name: 'Invalid Category',
        utilityId: testUtilityId,
        companyId: testCompany._id,
        effectiveDate: new Date(),
        items: [
          {
            itemCode: 'TEST-001',
            description: 'Test Item',
            category: 'invalid_category', // Invalid enum
            unit: 'LF',
            unitPrice: 10.00
          }
        ]
      })).rejects.toThrow();
    });
    
    it('should accept all valid category types', async () => {
      const categories = ['civil', 'electrical', 'overhead', 'underground', 
                          'traffic_control', 'vegetation', 'emergency', 'other'];
      
      const items = categories.map((cat, idx) => ({
        itemCode: `TEST-${idx}`,
        description: `Test ${cat}`,
        category: cat,
        unit: 'EA',
        unitPrice: 100.00
      }));
      
      const priceBook = await PriceBook.create({
        name: 'All Categories',
        utilityId: testUtilityId,
        companyId: testCompany._id,
        effectiveDate: new Date(),
        items
      });
      
      expect(priceBook.items.length).toBe(8);
    });
    
    it('should store Oracle mapping fields', async () => {
      const priceBook = await PriceBook.create({
        name: 'Oracle Mapping Test',
        utilityId: testUtilityId,
        companyId: testCompany._id,
        effectiveDate: new Date(),
        items: [
          {
            itemCode: 'UG-TRENCH-001',
            description: 'Trenching',
            category: 'civil',
            unit: 'LF',
            unitPrice: 25.00,
            oracleItemId: 'ORACLE-ITEM-12345',
            oracleExpenseAccount: '5100-1234',
            sapMaterialNumber: 'SAP-MAT-001'
          }
        ]
      });
      
      expect(priceBook.items[0].oracleItemId).toBe('ORACLE-ITEM-12345');
      expect(priceBook.items[0].oracleExpenseAccount).toBe('5100-1234');
      expect(priceBook.items[0].sapMaterialNumber).toBe('SAP-MAT-001');
    });
    
    it('should set default flags correctly', async () => {
      const priceBook = await PriceBook.create({
        name: 'Default Flags Test',
        utilityId: testUtilityId,
        companyId: testCompany._id,
        effectiveDate: new Date(),
        items: [
          {
            itemCode: 'TEST-001',
            description: 'Test Item',
            category: 'civil',
            unit: 'LF',
            unitPrice: 10.00
          }
        ]
      });
      
      expect(priceBook.items[0].laborIncluded).toBe(true);
      expect(priceBook.items[0].materialIncluded).toBe(false);
      expect(priceBook.items[0].requiresPhoto).toBe(true);
      expect(priceBook.items[0].requiresGPS).toBe(true);
      expect(priceBook.items[0].isActive).toBe(true);
    });
  });
  
  // ==================== Category Breakdown (Pre-save Hook) ====================
  describe('Category Breakdown Calculation', () => {
    it('should calculate itemCount on save', async () => {
      const priceBook = await PriceBook.create({
        name: 'Item Count Test',
        utilityId: testUtilityId,
        companyId: testCompany._id,
        effectiveDate: new Date(),
        items: [
          { itemCode: 'A', description: 'A', category: 'civil', unit: 'LF', unitPrice: 10 },
          { itemCode: 'B', description: 'B', category: 'civil', unit: 'LF', unitPrice: 20 },
          { itemCode: 'C', description: 'C', category: 'electrical', unit: 'EA', unitPrice: 30 }
        ]
      });
      
      expect(priceBook.itemCount).toBe(3);
    });
    
    it('should reset itemCount to zero when items removed', async () => {
      const priceBook = await PriceBook.create({
        name: 'Item Count Reset Test',
        utilityId: testUtilityId,
        companyId: testCompany._id,
        effectiveDate: new Date(),
        items: [
          { itemCode: 'A', description: 'A', category: 'civil', unit: 'LF', unitPrice: 10 }
        ]
      });
      
      expect(priceBook.itemCount).toBe(1);
      
      // Remove all items
      priceBook.items = [];
      await priceBook.save();
      
      expect(priceBook.itemCount).toBe(0);
    });
    
    it('should calculate categoryBreakdown on save', async () => {
      const priceBook = await PriceBook.create({
        name: 'Category Breakdown Test',
        utilityId: testUtilityId,
        companyId: testCompany._id,
        effectiveDate: new Date(),
        items: [
          { itemCode: 'C1', description: 'Civil 1', category: 'civil', unit: 'LF', unitPrice: 10 },
          { itemCode: 'C2', description: 'Civil 2', category: 'civil', unit: 'LF', unitPrice: 20 },
          { itemCode: 'E1', description: 'Electrical 1', category: 'electrical', unit: 'EA', unitPrice: 30 },
          { itemCode: 'T1', description: 'Traffic 1', category: 'traffic_control', unit: 'HR', unitPrice: 40 }
        ]
      });
      
      expect(priceBook.categoryBreakdown.civil).toBe(2);
      expect(priceBook.categoryBreakdown.electrical).toBe(1);
      expect(priceBook.categoryBreakdown.traffic_control).toBe(1);
      expect(priceBook.categoryBreakdown.overhead).toBe(0);
    });
    
    it('should reset categoryBreakdown to zeros when items removed', async () => {
      const priceBook = await PriceBook.create({
        name: 'Category Reset Test',
        utilityId: testUtilityId,
        companyId: testCompany._id,
        effectiveDate: new Date(),
        items: [
          { itemCode: 'C1', description: 'Civil', category: 'civil', unit: 'LF', unitPrice: 10 },
          { itemCode: 'E1', description: 'Electrical', category: 'electrical', unit: 'EA', unitPrice: 20 }
        ]
      });
      
      expect(priceBook.categoryBreakdown.civil).toBe(1);
      expect(priceBook.categoryBreakdown.electrical).toBe(1);
      
      // Remove all items
      priceBook.items = [];
      await priceBook.save();
      
      // All categories should be zero
      expect(priceBook.categoryBreakdown.civil).toBe(0);
      expect(priceBook.categoryBreakdown.electrical).toBe(0);
      expect(priceBook.categoryBreakdown.overhead).toBe(0);
    });
  });
  
  // ==================== Status Workflow ====================
  describe('Status Workflow', () => {
    it('should default to draft status', async () => {
      const priceBook = await PriceBook.create({
        name: 'Status Test',
        utilityId: testUtilityId,
        companyId: testCompany._id,
        effectiveDate: new Date()
      });
      
      expect(priceBook.status).toBe('draft');
    });
    
    it('should allow valid status transitions', async () => {
      const priceBook = await PriceBook.create({
        name: 'Status Transition',
        utilityId: testUtilityId,
        companyId: testCompany._id,
        effectiveDate: new Date()
      });
      
      priceBook.status = 'active';
      priceBook.activatedAt = new Date();
      priceBook.activatedBy = testUser._id;
      await priceBook.save();
      
      expect(priceBook.status).toBe('active');
      expect(priceBook.activatedAt).toBeDefined();
    });
    
    it('should validate status enum', async () => {
      const priceBook = await PriceBook.create({
        name: 'Invalid Status',
        utilityId: testUtilityId,
        companyId: testCompany._id,
        effectiveDate: new Date()
      });
      
      priceBook.status = 'invalid_status';
      await expect(priceBook.save()).rejects.toThrow();
    });
  });
  
  // ==================== Static Methods ====================
  describe('Static Methods', () => {
    describe('getActive', () => {
      it('should return active price book for company/utility', async () => {
        // Create an active price book
        await PriceBook.create({
          name: 'Active Price Book',
          utilityId: testUtilityId,
          companyId: testCompany._id,
          effectiveDate: new Date('2025-01-01'),
          status: 'active'
        });
        
        // Create a draft price book (should not be returned)
        await PriceBook.create({
          name: 'Draft Price Book',
          utilityId: testUtilityId,
          companyId: testCompany._id,
          effectiveDate: new Date('2025-01-01'),
          status: 'draft'
        });
        
        const active = await PriceBook.getActive(testCompany._id, testUtilityId);
        
        expect(active).toBeDefined();
        expect(active.name).toBe('Active Price Book');
        expect(active.status).toBe('active');
      });
      
      it('should return null if no active price book', async () => {
        const active = await PriceBook.getActive(testCompany._id, testUtilityId);
        expect(active).toBeNull();
      });
      
      it('should respect effective date', async () => {
        // Create active but future effective date
        await PriceBook.create({
          name: 'Future Price Book',
          utilityId: testUtilityId,
          companyId: testCompany._id,
          effectiveDate: new Date('2030-01-01'), // Future date
          status: 'active'
        });
        
        const active = await PriceBook.getActive(testCompany._id, testUtilityId);
        expect(active).toBeNull(); // Should not find future dated price book
      });
    });
    
    describe('findItemByCode', () => {
      it('should find item by code in active price book', async () => {
        await PriceBook.create({
          name: 'Find Item Test',
          utilityId: testUtilityId,
          companyId: testCompany._id,
          effectiveDate: new Date('2025-01-01'),
          status: 'active',
          items: [
            { itemCode: 'FIND-001', description: 'Find Me', category: 'civil', unit: 'LF', unitPrice: 50 }
          ]
        });
        
        const item = await PriceBook.findItemByCode(testCompany._id, testUtilityId, 'FIND-001');
        
        expect(item).toBeDefined();
        expect(item.itemCode).toBe('FIND-001');
        expect(item.unitPrice).toBe(50);
      });
      
      it('should return null for non-existent item code', async () => {
        await PriceBook.create({
          name: 'Find Item Test',
          utilityId: testUtilityId,
          companyId: testCompany._id,
          effectiveDate: new Date('2025-01-01'),
          status: 'active',
          items: [
            { itemCode: 'EXISTS', description: 'Exists', category: 'civil', unit: 'LF', unitPrice: 50 }
          ]
        });
        
        const item = await PriceBook.findItemByCode(testCompany._id, testUtilityId, 'DOES-NOT-EXIST');
        expect(item).toBeUndefined();
      });
    });
  });
  
  // ==================== Instance Methods ====================
  describe('Instance Methods', () => {
    describe('getItemsByCategory', () => {
      it('should return items filtered by category', async () => {
        const priceBook = await PriceBook.create({
          name: 'Category Filter Test',
          utilityId: testUtilityId,
          companyId: testCompany._id,
          effectiveDate: new Date(),
          items: [
            { itemCode: 'C1', description: 'Civil 1', category: 'civil', unit: 'LF', unitPrice: 10 },
            { itemCode: 'C2', description: 'Civil 2', category: 'civil', unit: 'LF', unitPrice: 20 },
            { itemCode: 'E1', description: 'Electrical', category: 'electrical', unit: 'EA', unitPrice: 30 }
          ]
        });
        
        const civilItems = priceBook.getItemsByCategory('civil');
        
        expect(civilItems.length).toBe(2);
        expect(civilItems.every(i => i.category === 'civil')).toBe(true);
      });
      
      it('should exclude inactive items', async () => {
        const priceBook = await PriceBook.create({
          name: 'Active Filter Test',
          utilityId: testUtilityId,
          companyId: testCompany._id,
          effectiveDate: new Date(),
          items: [
            { itemCode: 'A1', description: 'Active', category: 'civil', unit: 'LF', unitPrice: 10, isActive: true },
            { itemCode: 'I1', description: 'Inactive', category: 'civil', unit: 'LF', unitPrice: 20, isActive: false }
          ]
        });
        
        const activeItems = priceBook.getItemsByCategory('civil');
        
        expect(activeItems.length).toBe(1);
        expect(activeItems[0].itemCode).toBe('A1');
      });
    });
    
    describe('searchItems', () => {
      it('should search items by code', async () => {
        const priceBook = await PriceBook.create({
          name: 'Search Test',
          utilityId: testUtilityId,
          companyId: testCompany._id,
          effectiveDate: new Date(),
          items: [
            { itemCode: 'UG-TRENCH-001', description: 'Trenching Normal', category: 'civil', unit: 'LF', unitPrice: 25 },
            { itemCode: 'UG-TRENCH-002', description: 'Trenching Rocky', category: 'civil', unit: 'LF', unitPrice: 45 },
            { itemCode: 'OH-POLE-001', description: 'Pole Set', category: 'electrical', unit: 'EA', unitPrice: 1500 }
          ]
        });
        
        const results = priceBook.searchItems('TRENCH');
        
        expect(results.length).toBe(2);
        expect(results.every(i => i.itemCode.includes('TRENCH'))).toBe(true);
      });
      
      it('should search items by description', async () => {
        const priceBook = await PriceBook.create({
          name: 'Search Description Test',
          utilityId: testUtilityId,
          companyId: testCompany._id,
          effectiveDate: new Date(),
          items: [
            { itemCode: 'A', description: 'Trenching in normal soil', category: 'civil', unit: 'LF', unitPrice: 25 },
            { itemCode: 'B', description: 'Pole installation', category: 'electrical', unit: 'EA', unitPrice: 1500 }
          ]
        });
        
        const results = priceBook.searchItems('trench');
        
        expect(results.length).toBe(1);
        expect(results[0].itemCode).toBe('A');
      });
      
      it('should be case-insensitive', async () => {
        const priceBook = await PriceBook.create({
          name: 'Case Test',
          utilityId: testUtilityId,
          companyId: testCompany._id,
          effectiveDate: new Date(),
          items: [
            { itemCode: 'UG-TRENCH-001', description: 'Trenching', category: 'civil', unit: 'LF', unitPrice: 25 }
          ]
        });
        
        const upper = priceBook.searchItems('UG-TRENCH');
        const lower = priceBook.searchItems('ug-trench');
        const mixed = priceBook.searchItems('Ug-Trench');
        
        expect(upper.length).toBe(1);
        expect(lower.length).toBe(1);
        expect(mixed.length).toBe(1);
      });
    });
  });
  
  // ==================== Version Management ====================
  describe('Version Management', () => {
    it('should track supersession', async () => {
      const v1 = await PriceBook.create({
        name: 'V1 Rates',
        utilityId: testUtilityId,
        companyId: testCompany._id,
        effectiveDate: new Date('2025-01-01'),
        version: 1,
        status: 'active'
      });
      
      const v2 = await PriceBook.create({
        name: 'V2 Rates',
        utilityId: testUtilityId,
        companyId: testCompany._id,
        effectiveDate: new Date('2026-01-01'),
        version: 2,
        status: 'active',
        supersedes: v1._id
      });
      
      // Update v1 to superseded
      v1.status = 'superseded';
      v1.supersededBy = v2._id;
      await v1.save();
      
      const updated = await PriceBook.findById(v1._id);
      expect(updated.status).toBe('superseded');
      expect(updated.supersededBy.toString()).toBe(v2._id.toString());
    });
  });
  
  // ==================== Import Tracking ====================
  describe('Import Tracking', () => {
    it('should track import metadata', async () => {
      const priceBook = await PriceBook.create({
        name: 'Import Test',
        utilityId: testUtilityId,
        companyId: testCompany._id,
        effectiveDate: new Date(),
        importSource: 'csv_upload',
        importedBy: testUser._id,
        importedAt: new Date(),
        originalFileName: 'pge_rates_2026.csv'
      });
      
      expect(priceBook.importSource).toBe('csv_upload');
      expect(priceBook.originalFileName).toBe('pge_rates_2026.csv');
    });
    
    it('should track import errors', async () => {
      const priceBook = await PriceBook.create({
        name: 'Import Error Test',
        utilityId: testUtilityId,
        companyId: testCompany._id,
        effectiveDate: new Date(),
        importErrors: [
          { row: 5, field: 'unitPrice', message: 'Invalid number format' },
          { row: 12, field: 'category', message: 'Unknown category: plumbing' }
        ]
      });
      
      expect(priceBook.importErrors.length).toBe(2);
      expect(priceBook.importErrors[0].row).toBe(5);
    });
  });
});

