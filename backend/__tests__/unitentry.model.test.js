/**
 * UnitEntry Model Tests
 * 
 * Tests for UnitEntry model - the "Digital Receipt" for unit-price billing.
 * Tests GPS/photo verification, sub-tier tracking, workflow methods,
 * and dispute handling.
 */

const mongoose = require('mongoose');
const UnitEntry = require('../models/UnitEntry');
const PriceBook = require('../models/PriceBook');
const Job = require('../models/Job');
const Company = require('../models/Company');
const User = require('../models/User');

describe('UnitEntry Model', () => {
  let testCompany, testUser, testJob, testPriceBook, testUtilityId;
  
  beforeEach(async () => {
    testCompany = await Company.create({
      name: `Test Company ${Date.now()}`,
      contactEmail: `company${Date.now()}@test.com`
    });
    
    testUser = await User.create({
      email: `user${Date.now()}@test.com`,
      password: 'TestPassword123',
      name: 'Test Foreman',
      role: 'foreman',
      companyId: testCompany._id
    });
    
    testJob = await Job.create({
      title: 'Test Job',
      pmNumber: `PM-${Date.now()}`,
      userId: testUser._id,
      companyId: testCompany._id
    });
    
    testUtilityId = new mongoose.Types.ObjectId();
    
    testPriceBook = await PriceBook.create({
      name: 'Test Price Book',
      utilityId: testUtilityId,
      companyId: testCompany._id,
      effectiveDate: new Date('2025-01-01'),
      status: 'active',
      items: [
        { itemCode: 'UG-TRENCH-001', description: 'Trenching Normal', category: 'civil', unit: 'LF', unitPrice: 25 }
      ]
    });
  });
  
  // Helper to create valid unit entry data
  const createValidUnitData = (overrides = {}) => ({
    jobId: testJob._id,
    companyId: testCompany._id,
    priceBookId: testPriceBook._id,
    priceBookItemId: testPriceBook.items[0]._id,
    itemCode: 'UG-TRENCH-001',
    description: 'Trenching Normal',
    category: 'civil',
    quantity: 50,
    unit: 'LF',
    unitPrice: 25,
    totalAmount: 1250,
    workDate: new Date(),
    enteredBy: testUser._id,
    location: {
      latitude: 37.7749,
      longitude: -122.4194,
      accuracy: 10,
      capturedAt: new Date()
    },
    performedBy: {
      tier: 'prime',
      workCategory: 'civil',
      foremanId: testUser._id,
      foremanName: 'Test Foreman'
    },
    photos: [{
      url: '/uploads/photo1.jpg',
      fileName: 'photo1.jpg',
      capturedAt: new Date(),
      gpsCoordinates: {
        latitude: 37.7749,
        longitude: -122.4194,
        accuracy: 10
      }
    }],
    ...overrides
  });
  
  // ==================== Basic Creation ====================
  describe('UnitEntry Creation', () => {
    it('should create a unit entry with required fields', async () => {
      const unit = await UnitEntry.create(createValidUnitData());
      
      expect(unit._id).toBeDefined();
      expect(unit.itemCode).toBe('UG-TRENCH-001');
      expect(unit.quantity).toBe(50);
      expect(unit.status).toBe('draft');
    });
    
    it('should fail without required fields', async () => {
      await expect(UnitEntry.create({
        jobId: testJob._id
        // Missing other required fields
      })).rejects.toThrow();
    });
    
    it('should set timestamps', async () => {
      const unit = await UnitEntry.create(createValidUnitData());
      
      expect(unit.createdAt).toBeDefined();
      expect(unit.updatedAt).toBeDefined();
      expect(unit.enteredAt).toBeDefined();
    });
    
    it('should calculate totalAmount from quantity and unitPrice', async () => {
      const unit = await UnitEntry.create(createValidUnitData({
        quantity: 100,
        unitPrice: 15.50,
        totalAmount: 0 // Will be recalculated
      }));
      
      expect(unit.totalAmount).toBe(1550);
    });
  });
  
  // ==================== GPS Verification (Digital Receipt) ====================
  describe('GPS Verification', () => {
    it('should require location', async () => {
      await expect(UnitEntry.create(createValidUnitData({
        location: undefined
      }))).rejects.toThrow();
    });
    
    it('should calculate GPS quality as high for accuracy < 10m', async () => {
      const unit = await UnitEntry.create(createValidUnitData({
        location: {
          latitude: 37.7749,
          longitude: -122.4194,
          accuracy: 5, // High accuracy
          capturedAt: new Date()
        }
      }));
      
      expect(unit.gpsQuality).toBe('high');
    });
    
    it('should calculate GPS quality as medium for accuracy 10-50m', async () => {
      const unit = await UnitEntry.create(createValidUnitData({
        location: {
          latitude: 37.7749,
          longitude: -122.4194,
          accuracy: 30, // Medium accuracy
          capturedAt: new Date()
        }
      }));
      
      expect(unit.gpsQuality).toBe('medium');
    });
    
    it('should calculate GPS quality as low for accuracy > 50m', async () => {
      const unit = await UnitEntry.create(createValidUnitData({
        location: {
          latitude: 37.7749,
          longitude: -122.4194,
          accuracy: 100, // Low accuracy
          capturedAt: new Date()
        }
      }));
      
      expect(unit.gpsQuality).toBe('low');
    });
    
    it('should have hasValidGPS virtual', async () => {
      const highAccuracy = await UnitEntry.create(createValidUnitData({
        location: { latitude: 37.7749, longitude: -122.4194, accuracy: 10, capturedAt: new Date() }
      }));
      
      const lowAccuracy = await UnitEntry.create(createValidUnitData({
        location: { latitude: 37.7749, longitude: -122.4194, accuracy: 100, capturedAt: new Date() }
      }));
      
      expect(highAccuracy.hasValidGPS).toBe(true);
      expect(lowAccuracy.hasValidGPS).toBe(false);
    });
  });
  
  // ==================== Photo Verification ====================
  describe('Photo Verification', () => {
    it('should require at least one photo', async () => {
      await expect(UnitEntry.create(createValidUnitData({
        photos: [] // No photos
      }))).rejects.toThrow();
    });
    
    it('should allow photo waiver with reason', async () => {
      const unit = await UnitEntry.create(createValidUnitData({
        photos: [],
        photoWaived: true,
        photoWaivedReason: 'Underground work - no visible surface',
        photoWaivedBy: testUser._id
      }));
      
      expect(unit.photoWaived).toBe(true);
      expect(unit.photos.length).toBe(0);
    });
    
    it('should store photo GPS coordinates', async () => {
      const unit = await UnitEntry.create(createValidUnitData({
        photos: [{
          url: '/uploads/photo.jpg',
          fileName: 'photo.jpg',
          capturedAt: new Date(),
          photoType: 'after',
          gpsCoordinates: {
            latitude: 37.7749,
            longitude: -122.4194,
            accuracy: 5
          }
        }]
      }));
      
      expect(unit.photos[0].gpsCoordinates.latitude).toBe(37.7749);
      expect(unit.photos[0].gpsCoordinates.accuracy).toBe(5);
    });
    
    it('should validate photoType enum', async () => {
      const unit = await UnitEntry.create(createValidUnitData({
        photos: [{
          url: '/uploads/photo.jpg',
          fileName: 'photo.jpg',
          capturedAt: new Date(),
          photoType: 'before'
        }]
      }));
      
      expect(unit.photos[0].photoType).toBe('before');
    });
    
    it('should support multiple photos', async () => {
      const unit = await UnitEntry.create(createValidUnitData({
        photos: [
          { url: '/photo1.jpg', fileName: 'photo1.jpg', capturedAt: new Date(), photoType: 'before' },
          { url: '/photo2.jpg', fileName: 'photo2.jpg', capturedAt: new Date(), photoType: 'during' },
          { url: '/photo3.jpg', fileName: 'photo3.jpg', capturedAt: new Date(), photoType: 'after' }
        ]
      }));
      
      expect(unit.photos.length).toBe(3);
    });
  });
  
  // ==================== Sub-Tier Tracking ====================
  describe('Sub-Tier Contractor Tracking', () => {
    it('should require performedBy field', async () => {
      await expect(UnitEntry.create(createValidUnitData({
        performedBy: undefined
      }))).rejects.toThrow();
    });
    
    it('should track prime contractor work', async () => {
      const unit = await UnitEntry.create(createValidUnitData({
        performedBy: {
          tier: 'prime',
          workCategory: 'electrical',
          foremanId: testUser._id,
          foremanName: 'John Smith'
        }
      }));
      
      expect(unit.performedBy.tier).toBe('prime');
      expect(unit.performedBy.foremanName).toBe('John Smith');
    });
    
    it('should track subcontractor work', async () => {
      const subContractorId = new mongoose.Types.ObjectId();
      
      const unit = await UnitEntry.create(createValidUnitData({
        performedBy: {
          tier: 'sub',
          workCategory: 'civil',
          subContractorId,
          subContractorName: 'ABC Civil Contractors',
          subContractorLicense: 'CA-123456'
        }
      }));
      
      expect(unit.performedBy.tier).toBe('sub');
      expect(unit.performedBy.subContractorName).toBe('ABC Civil Contractors');
      expect(unit.performedBy.subContractorLicense).toBe('CA-123456');
    });
    
    it('should track sub-of-sub work', async () => {
      const primeId = new mongoose.Types.ObjectId();
      const subId = new mongoose.Types.ObjectId();
      
      const unit = await UnitEntry.create(createValidUnitData({
        performedBy: {
          tier: 'sub_of_sub',
          workCategory: 'civil',
          subContractorId: subId,
          subContractorName: 'XYZ Trenching LLC',
          subContractorLicense: 'CA-789012',
          primeContractorId: primeId,
          primeContractorName: 'Big GC Inc.'
        }
      }));
      
      expect(unit.performedBy.tier).toBe('sub_of_sub');
      expect(unit.performedBy.primeContractorName).toBe('Big GC Inc.');
    });
    
    it('should validate tier enum', async () => {
      await expect(UnitEntry.create(createValidUnitData({
        performedBy: {
          tier: 'invalid_tier',
          workCategory: 'civil'
        }
      }))).rejects.toThrow();
    });
    
    it('should validate workCategory enum', async () => {
      await expect(UnitEntry.create(createValidUnitData({
        performedBy: {
          tier: 'prime',
          workCategory: 'invalid_category'
        }
      }))).rejects.toThrow();
    });
  });
  
  // ==================== Status Workflow ====================
  describe('Status Workflow', () => {
    it('should default to draft status', async () => {
      const unit = await UnitEntry.create(createValidUnitData());
      expect(unit.status).toBe('draft');
    });
    
    it('should validate status enum', async () => {
      const unit = await UnitEntry.create(createValidUnitData());
      unit.status = 'invalid_status';
      await expect(unit.save()).rejects.toThrow();
    });
    
    it('should allow all valid status values', async () => {
      const statuses = ['draft', 'submitted', 'verified', 'disputed', 'approved', 'invoiced', 'paid'];
      
      for (const status of statuses) {
        const unit = await UnitEntry.create(createValidUnitData({ status }));
        expect(unit.status).toBe(status);
      }
    });
  });
  
  // ==================== Instance Methods ====================
  describe('Instance Methods', () => {
    describe('submit()', () => {
      it('should update status to submitted', async () => {
        const unit = await UnitEntry.create(createValidUnitData());
        
        await unit.submit(testUser._id);
        
        expect(unit.status).toBe('submitted');
        expect(unit.submittedAt).toBeDefined();
        expect(unit.submittedBy.toString()).toBe(testUser._id.toString());
      });
    });
    
    describe('verify()', () => {
      it('should update status to verified with notes', async () => {
        const unit = await UnitEntry.create(createValidUnitData({ status: 'submitted' }));
        const verifier = await User.create({
          email: `verifier${Date.now()}@test.com`,
          password: 'TestPassword123',
          name: 'QA Verifier',
          role: 'qa',
          companyId: testCompany._id
        });
        
        await unit.verify(verifier._id, 'Verified against spec 123');
        
        expect(unit.status).toBe('verified');
        expect(unit.verifiedAt).toBeDefined();
        expect(unit.verifiedBy.toString()).toBe(verifier._id.toString());
        expect(unit.verificationNotes).toBe('Verified against spec 123');
      });
    });
    
    describe('approve()', () => {
      it('should update status to approved', async () => {
        const unit = await UnitEntry.create(createValidUnitData({ status: 'verified' }));
        
        await unit.approve(testUser._id, 'Approved for billing');
        
        expect(unit.status).toBe('approved');
        expect(unit.approvedAt).toBeDefined();
        expect(unit.approvalNotes).toBe('Approved for billing');
      });
    });
    
    describe('dispute()', () => {
      it('should update status to disputed with reason', async () => {
        const unit = await UnitEntry.create(createValidUnitData({ status: 'submitted' }));
        
        await unit.dispute(testUser._id, 'Quantity appears incorrect', 'quantity');
        
        expect(unit.status).toBe('disputed');
        expect(unit.isDisputed).toBe(true);
        expect(unit.disputedAt).toBeDefined();
        expect(unit.disputeReason).toBe('Quantity appears incorrect');
        expect(unit.disputeCategory).toBe('quantity');
      });
      
      it('should validate dispute category enum', async () => {
        const unit = await UnitEntry.create(createValidUnitData());
        
        unit.disputeCategory = 'invalid_category';
        await expect(unit.save()).rejects.toThrow();
      });
    });
  });
  
  // ==================== Static Methods ====================
  describe('Static Methods', () => {
    describe('getByJob()', () => {
      it('should return all units for a job', async () => {
        await UnitEntry.create(createValidUnitData());
        await UnitEntry.create(createValidUnitData({ quantity: 100 }));
        
        const units = await UnitEntry.getByJob(testJob._id);
        
        expect(units.length).toBe(2);
      });
      
      it('should exclude deleted units by default', async () => {
        await UnitEntry.create(createValidUnitData());
        await UnitEntry.create(createValidUnitData({ 
          quantity: 100,
          isDeleted: true,
          deletedAt: new Date()
        }));
        
        const units = await UnitEntry.getByJob(testJob._id);
        
        expect(units.length).toBe(1);
      });
      
      it('should include deleted units when requested', async () => {
        await UnitEntry.create(createValidUnitData());
        await UnitEntry.create(createValidUnitData({ 
          quantity: 100,
          isDeleted: true,
          deletedAt: new Date()
        }));
        
        const units = await UnitEntry.getByJob(testJob._id, true);
        
        expect(units.length).toBe(2);
      });
    });
    
    describe('getUnbilledByCompany()', () => {
      it('should return approved units without claim', async () => {
        await UnitEntry.create(createValidUnitData({ status: 'approved' }));
        await UnitEntry.create(createValidUnitData({ status: 'draft' })); // Should not be returned
        await UnitEntry.create(createValidUnitData({ 
          status: 'approved',
          claimId: new mongoose.Types.ObjectId() // Already on claim
        }));
        
        const unbilled = await UnitEntry.getUnbilledByCompany(testCompany._id);
        
        expect(unbilled.length).toBe(1);
        expect(unbilled[0].status).toBe('approved');
        expect(unbilled[0].claimId).toBeUndefined();
      });
    });
    
    describe('getDisputed()', () => {
      it('should return unresolved disputed units', async () => {
        await UnitEntry.create(createValidUnitData({ 
          status: 'disputed',
          isDisputed: true,
          disputedAt: new Date()
        }));
        await UnitEntry.create(createValidUnitData({ 
          status: 'disputed',
          isDisputed: true,
          disputedAt: new Date(),
          disputeResolvedAt: new Date() // Resolved - should not be returned
        }));
        
        const disputed = await UnitEntry.getDisputed(testCompany._id);
        
        expect(disputed.length).toBe(1);
      });
    });
  });
  
  // ==================== Offline Sync ====================
  describe('Offline Sync', () => {
    it('should store offline ID', async () => {
      const offlineId = 'offline-uuid-12345';
      
      const unit = await UnitEntry.create(createValidUnitData({ offlineId }));
      
      expect(unit.offlineId).toBe(offlineId);
    });
    
    it('should track sync status', async () => {
      const unit = await UnitEntry.create(createValidUnitData({
        syncStatus: 'pending'
      }));
      
      expect(unit.syncStatus).toBe('pending');
      
      unit.syncStatus = 'synced';
      unit.syncedAt = new Date();
      await unit.save();
      
      const updated = await UnitEntry.findById(unit._id);
      expect(updated.syncStatus).toBe('synced');
    });
  });
  
  // ==================== Rate Locking ====================
  describe('Rate Locking', () => {
    it('should preserve unitPrice from time of entry', async () => {
      const unit = await UnitEntry.create(createValidUnitData({
        quantity: 100,
        unitPrice: 25.00 // Locked rate
      }));
      
      // Even if price book changes, unit keeps original rate
      expect(unit.unitPrice).toBe(25.00);
      expect(unit.totalAmount).toBe(2500);
    });
    
    it('should track adjustments if quantity changes', async () => {
      const unit = await UnitEntry.create(createValidUnitData({
        quantity: 100,
        unitPrice: 25.00,
        totalAmount: 2500
      }));
      
      unit.adjustments.push({
        adjustedBy: testUser._id,
        originalQuantity: 100,
        newQuantity: 110,
        originalTotal: 2500,
        newTotal: 2750,
        reason: 'Measured actual footage'
      });
      unit.quantity = 110;
      unit.totalAmount = 2750;
      await unit.save();
      
      expect(unit.adjustments.length).toBe(1);
      expect(unit.adjustments[0].originalQuantity).toBe(100);
      expect(unit.adjustments[0].newQuantity).toBe(110);
    });
  });
  
  // ==================== Soft Delete ====================
  describe('Soft Delete', () => {
    it('should support soft delete', async () => {
      const unit = await UnitEntry.create(createValidUnitData());
      
      unit.isDeleted = true;
      unit.deletedAt = new Date();
      unit.deletedBy = testUser._id;
      unit.deleteReason = 'Duplicate entry';
      await unit.save();
      
      const deleted = await UnitEntry.findById(unit._id);
      expect(deleted.isDeleted).toBe(true);
      expect(deleted.deleteReason).toBe('Duplicate entry');
    });
  });
});

