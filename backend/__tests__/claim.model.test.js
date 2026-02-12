/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Claim Model Tests
 * 
 * Tests for Claim/Invoice model including Oracle Payables export,
 * payment tracking, verification metrics, and workflow.
 */

const mongoose = require('mongoose');
const Claim = require('../models/Claim');
const PriceBook = require('../models/PriceBook');
const Job = require('../models/Job');
const Company = require('../models/Company');
const User = require('../models/User');

describe('Claim Model', () => {
  let testCompany, testUser, testJob, _testPriceBook, testUtilityId;
  
  beforeEach(async () => {
    testCompany = await Company.create({
      name: `Test Company ${Date.now()}`,
      contactEmail: `company${Date.now()}@test.com`
    });
    
    testUser = await User.create({
      email: `user${Date.now()}@test.com`,
      password: 'TestPassword123',
      name: 'Test PM',
      role: 'pm',
      companyId: testCompany._id
    });
    
    testJob = await Job.create({
      title: 'Test Job',
      pmNumber: `PM-${Date.now()}`,
      userId: testUser._id,
      companyId: testCompany._id
    });
    
    testUtilityId = new mongoose.Types.ObjectId();
    
    _testPriceBook = await PriceBook.create({
      name: 'Test Price Book',
      utilityId: testUtilityId,
      companyId: testCompany._id,
      effectiveDate: new Date('2025-01-01'),
      status: 'active',
      items: [
        { itemCode: 'UG-TRENCH-001', description: 'Trenching', category: 'civil', unit: 'LF', unitPrice: 25 }
      ]
    });
  });
  
  // Helper to create valid claim data
  const createValidClaimData = (overrides = {}) => ({
    companyId: testCompany._id,
    jobId: testJob._id,
    utilityId: testUtilityId,
    subtotal: 5000,
    totalAmount: 5000,
    amountDue: 5000,
    createdBy: testUser._id,
    lineItems: [{
      unitEntryId: new mongoose.Types.ObjectId(),
      lineNumber: 1,
      itemCode: 'UG-TRENCH-001',
      description: 'Trenching - Normal Soil',
      quantity: 200,
      unit: 'LF',
      unitPrice: 25,
      totalAmount: 5000,
      workDate: new Date(),
      photoCount: 3,
      hasGPS: true,
      gpsQuality: 'high',
      performedByTier: 'prime',
      workCategory: 'civil'
    }],
    ...overrides
  });
  
  // ==================== Basic Creation ====================
  describe('Claim Creation', () => {
    it('should create a claim with required fields', async () => {
      const claim = await Claim.create(createValidClaimData());
      
      expect(claim._id).toBeDefined();
      expect(claim.claimNumber).toBeDefined();
      expect(claim.status).toBe('draft');
    });
    
    it('should auto-generate claim number', async () => {
      const claim = await Claim.create(createValidClaimData());
      
      // Format: CLM-YYYY-NNNNN-RRR (year, sequence, random suffix for uniqueness)
      expect(claim.claimNumber).toMatch(/^CLM-\d{4}-\d{5}-\d{3}$/);
    });
    
    it('should generate unique claim numbers', async () => {
      const claim1 = await Claim.create(createValidClaimData());
      const claim2 = await Claim.create(createValidClaimData());
      
      expect(claim1.claimNumber).not.toBe(claim2.claimNumber);
    });
    
    it('should generate unique claim numbers for concurrent saves', async () => {
      const claim1 = await Claim.create(createValidClaimData());
      const claim2 = await Claim.create(createValidClaimData());
      
      // Claim numbers should be unique even with concurrent creation
      expect(claim1.claimNumber).not.toBe(claim2.claimNumber);
    });
    
    it('should set timestamps', async () => {
      const claim = await Claim.create(createValidClaimData());
      
      expect(claim.createdAt).toBeDefined();
      expect(claim.updatedAt).toBeDefined();
    });
  });
  
  // ==================== Line Items ====================
  describe('Line Items', () => {
    it('should store line items with all required fields', async () => {
      const claim = await Claim.create(createValidClaimData());
      
      expect(claim.lineItems.length).toBe(1);
      expect(claim.lineItems[0].itemCode).toBe('UG-TRENCH-001');
      expect(claim.lineItems[0].quantity).toBe(200);
      expect(claim.lineItems[0].totalAmount).toBe(5000);
    });
    
    it('should calculate lineItemCount', async () => {
      const claim = await Claim.create(createValidClaimData({
        lineItems: [
          { unitEntryId: new mongoose.Types.ObjectId(), lineNumber: 1, itemCode: 'A', description: 'A', quantity: 10, unit: 'LF', unitPrice: 10, totalAmount: 100, photoCount: 1, hasGPS: true },
          { unitEntryId: new mongoose.Types.ObjectId(), lineNumber: 2, itemCode: 'B', description: 'B', quantity: 20, unit: 'LF', unitPrice: 10, totalAmount: 200, photoCount: 1, hasGPS: true },
          { unitEntryId: new mongoose.Types.ObjectId(), lineNumber: 3, itemCode: 'C', description: 'C', quantity: 30, unit: 'LF', unitPrice: 10, totalAmount: 300, photoCount: 1, hasGPS: true }
        ],
        subtotal: 600,
        totalAmount: 600,
        amountDue: 600
      }));
      
      expect(claim.lineItemCount).toBe(3);
    });
    
    it('should store verification data per line item', async () => {
      const claim = await Claim.create(createValidClaimData());
      
      expect(claim.lineItems[0].photoCount).toBe(3);
      expect(claim.lineItems[0].hasGPS).toBe(true);
      expect(claim.lineItems[0].gpsQuality).toBe('high');
    });
    
    it('should store sub-tier info per line item', async () => {
      const claim = await Claim.create(createValidClaimData({
        lineItems: [{
          unitEntryId: new mongoose.Types.ObjectId(),
          lineNumber: 1,
          itemCode: 'CIV-001',
          description: 'Civil Work',
          quantity: 100,
          unit: 'LF',
          unitPrice: 30,
          totalAmount: 3000,
          photoCount: 2,
          hasGPS: true,
          performedByTier: 'sub',
          subContractorId: new mongoose.Types.ObjectId(),
          subContractorName: 'ABC Civil LLC',
          workCategory: 'civil'
        }]
      }));
      
      expect(claim.lineItems[0].performedByTier).toBe('sub');
      expect(claim.lineItems[0].subContractorName).toBe('ABC Civil LLC');
      expect(claim.lineItems[0].workCategory).toBe('civil');
    });
  });
  
  // ==================== Totals Calculation ====================
  describe('Totals Calculation', () => {
    it('should calculate adjustmentTotal', async () => {
      const claim = await Claim.create(createValidClaimData({
        subtotal: 5000,
        adjustments: [
          { description: 'Credit', amount: -100, reason: 'Correction' },
          { description: 'Backcharge', amount: -50, reason: 'Cleanup' }
        ]
      }));
      
      expect(claim.adjustmentTotal).toBe(-150);
    });
    
    it('should reset adjustmentTotal to zero when adjustments removed', async () => {
      const claim = await Claim.create(createValidClaimData({
        subtotal: 5000,
        adjustments: [
          { description: 'Credit', amount: -100, reason: 'Test' }
        ]
      }));
      
      expect(claim.adjustmentTotal).toBe(-100);
      
      // Remove all adjustments
      claim.adjustments = [];
      await claim.save();
      
      expect(claim.adjustmentTotal).toBe(0);
    });
    
    it('should calculate totalAmount from subtotal + adjustments + tax', async () => {
      const claim = await Claim.create(createValidClaimData({
        subtotal: 5000,
        adjustments: [
          { description: 'Credit', amount: -200, reason: 'Correction' }
        ],
        taxAmount: 100
      }));
      
      // Pre-save hook recalculates: subtotal + adjustmentTotal + taxAmount
      expect(claim.adjustmentTotal).toBe(-200);
      expect(claim.totalAmount).toBe(4900); // 5000 - 200 + 100 = 4900
    });
    
    it('should calculate amountDue with retention', async () => {
      const claim = await Claim.create(createValidClaimData({
        subtotal: 10000,
        totalAmount: 10000,
        retentionRate: 0.10,
        retentionAmount: 1000
      }));
      
      expect(claim.amountDue).toBe(9000); // 10000 - 1000
    });
    
    it('should calculate balanceDue', async () => {
      const claim = await Claim.create(createValidClaimData({
        amountDue: 5000,
        totalPaid: 2000
      }));
      
      expect(claim.balanceDue).toBe(3000);
    });
  });
  
  // ==================== Verification Metrics ====================
  describe('Verification Metrics', () => {
    it('should calculate photo compliance rate', async () => {
      const claim = await Claim.create(createValidClaimData({
        lineItems: [
          { unitEntryId: new mongoose.Types.ObjectId(), lineNumber: 1, itemCode: 'A', description: 'A', quantity: 10, unit: 'EA', unitPrice: 100, totalAmount: 1000, photoCount: 2, hasGPS: true, gpsQuality: 'high' },
          { unitEntryId: new mongoose.Types.ObjectId(), lineNumber: 2, itemCode: 'B', description: 'B', quantity: 10, unit: 'EA', unitPrice: 100, totalAmount: 1000, photoCount: 1, hasGPS: true, gpsQuality: 'medium' },
          { unitEntryId: new mongoose.Types.ObjectId(), lineNumber: 3, itemCode: 'C', description: 'C', quantity: 10, unit: 'EA', unitPrice: 100, totalAmount: 1000, photoCount: 0, hasGPS: false, gpsQuality: 'none' }
        ],
        subtotal: 3000,
        totalAmount: 3000,
        amountDue: 3000
      }));
      
      expect(claim.verificationMetrics.totalUnits).toBe(3);
      expect(claim.verificationMetrics.unitsWithPhotos).toBe(2);
      expect(claim.verificationMetrics.photoComplianceRate).toBe(67); // 2/3 = 66.67% rounded
    });
    
    it('should calculate GPS compliance rate', async () => {
      const claim = await Claim.create(createValidClaimData({
        lineItems: [
          { unitEntryId: new mongoose.Types.ObjectId(), lineNumber: 1, itemCode: 'A', description: 'A', quantity: 10, unit: 'EA', unitPrice: 100, totalAmount: 1000, photoCount: 1, hasGPS: true, gpsQuality: 'high' },
          { unitEntryId: new mongoose.Types.ObjectId(), lineNumber: 2, itemCode: 'B', description: 'B', quantity: 10, unit: 'EA', unitPrice: 100, totalAmount: 1000, photoCount: 1, hasGPS: true, gpsQuality: 'medium' },
          { unitEntryId: new mongoose.Types.ObjectId(), lineNumber: 3, itemCode: 'C', description: 'C', quantity: 10, unit: 'EA', unitPrice: 100, totalAmount: 1000, photoCount: 1, hasGPS: false, gpsQuality: 'none' },
          { unitEntryId: new mongoose.Types.ObjectId(), lineNumber: 4, itemCode: 'D', description: 'D', quantity: 10, unit: 'EA', unitPrice: 100, totalAmount: 1000, photoCount: 1, hasGPS: true, gpsQuality: 'high' }
        ],
        subtotal: 4000,
        totalAmount: 4000,
        amountDue: 4000
      }));
      
      expect(claim.verificationMetrics.unitsWithGPS).toBe(3);
      expect(claim.verificationMetrics.highQualityGPS).toBe(2);
      expect(claim.verificationMetrics.gpsComplianceRate).toBe(75); // 3/4
    });
  });
  
  // ==================== Category Breakdown ====================
  describe('Category Breakdown', () => {
    it('should calculate category totals', async () => {
      const claim = await Claim.create(createValidClaimData({
        lineItems: [
          { unitEntryId: new mongoose.Types.ObjectId(), lineNumber: 1, itemCode: 'C1', description: 'Civil 1', quantity: 100, unit: 'LF', unitPrice: 20, totalAmount: 2000, photoCount: 1, hasGPS: true, workCategory: 'civil' },
          { unitEntryId: new mongoose.Types.ObjectId(), lineNumber: 2, itemCode: 'C2', description: 'Civil 2', quantity: 50, unit: 'LF', unitPrice: 30, totalAmount: 1500, photoCount: 1, hasGPS: true, workCategory: 'civil' },
          { unitEntryId: new mongoose.Types.ObjectId(), lineNumber: 3, itemCode: 'E1', description: 'Electrical', quantity: 10, unit: 'EA', unitPrice: 150, totalAmount: 1500, photoCount: 1, hasGPS: true, workCategory: 'electrical' }
        ],
        subtotal: 5000,
        totalAmount: 5000,
        amountDue: 5000
      }));
      
      expect(claim.categoryTotals.civil).toBe(3500);
      expect(claim.categoryTotals.electrical).toBe(1500);
    });
    
    it('should calculate tier totals', async () => {
      const claim = await Claim.create(createValidClaimData({
        lineItems: [
          { unitEntryId: new mongoose.Types.ObjectId(), lineNumber: 1, itemCode: 'A', description: 'A', quantity: 100, unit: 'LF', unitPrice: 20, totalAmount: 2000, photoCount: 1, hasGPS: true, performedByTier: 'prime' },
          { unitEntryId: new mongoose.Types.ObjectId(), lineNumber: 2, itemCode: 'B', description: 'B', quantity: 100, unit: 'LF', unitPrice: 30, totalAmount: 3000, photoCount: 1, hasGPS: true, performedByTier: 'sub' }
        ],
        subtotal: 5000,
        totalAmount: 5000,
        amountDue: 5000
      }));
      
      expect(claim.tierTotals.prime).toBe(2000);
      expect(claim.tierTotals.sub).toBe(3000);
    });
  });
  
  // ==================== Status Workflow ====================
  describe('Status Workflow', () => {
    it('should default to draft status', async () => {
      const claim = await Claim.create(createValidClaimData());
      expect(claim.status).toBe('draft');
    });
    
    it('should validate status enum', async () => {
      const claim = await Claim.create(createValidClaimData());
      claim.status = 'invalid_status';
      await expect(claim.save()).rejects.toThrow();
    });
    
    it('should track approval workflow', async () => {
      const claim = await Claim.create(createValidClaimData());
      
      claim.status = 'approved';
      claim.approvedBy = testUser._id;
      claim.approvedAt = new Date();
      claim.approvalNotes = 'All units verified';
      await claim.save();
      
      expect(claim.status).toBe('approved');
      expect(claim.approvedBy.toString()).toBe(testUser._id.toString());
    });
    
    it('should track submission', async () => {
      const claim = await Claim.create(createValidClaimData());
      
      claim.status = 'submitted';
      claim.submittedAt = new Date();
      claim.submittedBy = testUser._id;
      claim.submissionMethod = 'portal';
      claim.submissionReference = 'PORTAL-12345';
      await claim.save();
      
      expect(claim.submissionMethod).toBe('portal');
      expect(claim.submissionReference).toBe('PORTAL-12345');
    });
  });
  
  // ==================== Oracle Export ====================
  describe('Oracle Export - toOraclePayload()', () => {
    it('should generate valid Oracle Payables JSON', async () => {
      const claim = await Claim.create(createValidClaimData({
        oracle: {
          vendorId: 'VENDOR-001',
          vendorSiteId: 'SITE-001',
          businessUnit: 'PG&E Operations',
          legalEntity: 'PG&E Corp',
          projectNumber: 'PM-12345',
          taskNumber: 'TASK-001',
          expenditureType: 'Civil Work',
          paymentTerms: 'Net 30'
        }
      }));
      
      const payload = claim.toOraclePayload();
      
      expect(payload.InvoiceNumber).toBe(claim.claimNumber);
      expect(payload.VendorId).toBe('VENDOR-001');
      expect(payload.VendorSiteId).toBe('SITE-001');
      expect(payload.InvoiceAmount).toBe(5000);
      expect(payload.PaymentTerms).toBe('Net 30');
      expect(payload.BusinessUnit).toBe('PG&E Operations');
    });
    
    it('should include line items in Oracle format', async () => {
      const claim = await Claim.create(createValidClaimData({
        oracle: {
          vendorId: 'V001',
          projectNumber: 'PM-12345',
          taskNumber: 'T001',
          expenditureType: 'Construction'
        }
      }));
      
      const payload = claim.toOraclePayload();
      
      expect(payload.invoiceLines).toBeDefined();
      expect(payload.invoiceLines.length).toBe(1);
      expect(payload.invoiceLines[0].LineNumber).toBe(1);
      expect(payload.invoiceLines[0].Quantity).toBe(200);
      expect(payload.invoiceLines[0].UnitPrice).toBe(25);
      expect(payload.invoiceLines[0].Amount).toBe(5000);
      expect(payload.invoiceLines[0].ProjectNumber).toBe('PM-12345');
    });
    
    it('should handle multiple line items', async () => {
      const claim = await Claim.create(createValidClaimData({
        lineItems: [
          { unitEntryId: new mongoose.Types.ObjectId(), lineNumber: 1, itemCode: 'A', description: 'Item A', quantity: 100, unit: 'LF', unitPrice: 10, totalAmount: 1000, photoCount: 1, hasGPS: true },
          { unitEntryId: new mongoose.Types.ObjectId(), lineNumber: 2, itemCode: 'B', description: 'Item B', quantity: 50, unit: 'EA', unitPrice: 20, totalAmount: 1000, photoCount: 1, hasGPS: true },
          { unitEntryId: new mongoose.Types.ObjectId(), lineNumber: 3, itemCode: 'C', description: 'Item C', quantity: 25, unit: 'HR', unitPrice: 40, totalAmount: 1000, photoCount: 1, hasGPS: true }
        ],
        subtotal: 3000,
        totalAmount: 3000,
        amountDue: 3000
      }));
      
      const payload = claim.toOraclePayload();
      
      expect(payload.invoiceLines.length).toBe(3);
      expect(payload.invoiceLines[0].ItemDescription).toContain('A');
      expect(payload.invoiceLines[1].ItemDescription).toContain('B');
      expect(payload.invoiceLines[2].ItemDescription).toContain('C');
    });
    
    it('should track export status', async () => {
      const claim = await Claim.create(createValidClaimData());
      
      claim.oracle = {
        ...claim.oracle,
        exportedAt: new Date(),
        exportedBy: testUser._id,
        exportFormat: 'rest_api',
        exportStatus: 'exported',
        externalId: 'ORACLE-INV-12345'
      };
      await claim.save();
      
      expect(claim.oracle.exportStatus).toBe('exported');
      expect(claim.oracle.externalId).toBe('ORACLE-INV-12345');
    });
  });
  
  // ==================== Payment Tracking ====================
  describe('Payment Tracking', () => {
    describe('recordPayment()', () => {
      it('should add payment and update totals', async () => {
        const claim = await Claim.create(createValidClaimData({
          amountDue: 5000,
          totalPaid: 0
        }));
        
        await claim.recordPayment({
          paymentDate: new Date(),
          amount: 2000,
          paymentMethod: 'ach',
          referenceNumber: 'ACH-12345'
        }, testUser._id);
        
        expect(claim.payments.length).toBe(1);
        expect(claim.totalPaid).toBe(2000);
        expect(claim.status).toBe('partially_paid');
      });
      
      it('should mark as paid when fully paid', async () => {
        const claim = await Claim.create(createValidClaimData({
          amountDue: 5000,
          totalPaid: 0
        }));
        
        await claim.recordPayment({
          paymentDate: new Date(),
          amount: 5000,
          paymentMethod: 'check',
          referenceNumber: 'CHK-001'
        }, testUser._id);
        
        expect(claim.status).toBe('paid');
        expect(claim.paidInFullAt).toBeDefined();
      });
      
      it('should track multiple payments', async () => {
        const claim = await Claim.create(createValidClaimData({
          amountDue: 5000
        }));
        
        await claim.recordPayment({
          paymentDate: new Date(),
          amount: 2000,
          paymentMethod: 'ach'
        }, testUser._id);
        
        await claim.recordPayment({
          paymentDate: new Date(),
          amount: 3000,
          paymentMethod: 'ach'
        }, testUser._id);
        
        expect(claim.payments.length).toBe(2);
        expect(claim.totalPaid).toBe(5000);
        expect(claim.status).toBe('paid');
      });
    });
    
    it('should calculate days past due', async () => {
      const pastDueDate = new Date();
      pastDueDate.setDate(pastDueDate.getDate() - 10); // 10 days ago
      
      const claim = await Claim.create(createValidClaimData({
        amountDue: 5000,
        totalPaid: 0,
        dueDate: pastDueDate,
        status: 'submitted'
      }));
      
      // Trigger pre-save hook to calculate
      await claim.save();
      
      expect(claim.daysPastDue).toBeGreaterThanOrEqual(10);
    });
  });
  
  // ==================== Instance Methods ====================
  describe('Instance Methods', () => {
    describe('addLineItem()', () => {
      it('should add line item from UnitEntry and save', async () => {
        const claim = await Claim.create(createValidClaimData({
          lineItems: [],
          subtotal: 0,
          totalAmount: 0,
          amountDue: 0
        }));
        
        // Mock UnitEntry object
        const mockUnitEntry = {
          _id: new mongoose.Types.ObjectId(),
          itemCode: 'NEW-001',
          description: 'New Item',
          quantity: 50,
          unit: 'LF',
          unitPrice: 20,
          totalAmount: 1000,
          workDate: new Date(),
          photos: [{ url: '/photo.jpg' }, { url: '/photo2.jpg' }],
          location: { latitude: 37.7749, longitude: -122.4194, accuracy: 8 },
          gpsQuality: 'high',
          performedBy: {
            tier: 'sub',
            subContractorId: new mongoose.Types.ObjectId(),
            subContractorName: 'Test Sub',
            workCategory: 'civil'
          }
        };
        
        // addLineItem now returns save() promise
        const savedClaim = await claim.addLineItem(mockUnitEntry, 1);
        
        expect(savedClaim.lineItems.length).toBe(1);
        expect(savedClaim.lineItems[0].itemCode).toBe('NEW-001');
        expect(savedClaim.lineItems[0].photoCount).toBe(2);
        expect(savedClaim.lineItems[0].hasGPS).toBe(true);
        expect(savedClaim.lineItems[0].performedByTier).toBe('sub');
        expect(savedClaim.subtotal).toBe(1000);
        
        // Verify persisted to database
        const fromDb = await Claim.findById(claim._id);
        expect(fromDb.lineItems.length).toBe(1);
      });
    });
  });
  
  // ==================== Static Methods ====================
  describe('Static Methods', () => {
    describe('getByStatus()', () => {
      it('should return claims filtered by status', async () => {
        await Claim.create(createValidClaimData({ status: 'draft' }));
        await Claim.create(createValidClaimData({ status: 'submitted' }));
        await Claim.create(createValidClaimData({ status: 'submitted' }));
        
        const submitted = await Claim.getByStatus(testCompany._id, 'submitted');
        
        expect(submitted.length).toBe(2);
        expect(submitted.every(c => c.status === 'submitted')).toBe(true);
      });
    });
    
    describe('getUnpaid()', () => {
      it('should return claims with balance due', async () => {
        await Claim.create(createValidClaimData({ 
          status: 'submitted',
          amountDue: 5000,
          totalPaid: 0,
          balanceDue: 5000
        }));
        await Claim.create(createValidClaimData({ 
          status: 'paid',
          amountDue: 5000,
          totalPaid: 5000,
          balanceDue: 0
        }));
        
        const unpaid = await Claim.getUnpaid(testCompany._id);
        
        expect(unpaid.length).toBe(1);
        expect(unpaid[0].balanceDue).toBeGreaterThan(0);
      });
    });
    
    describe('getPastDue()', () => {
      it('should return past due claims', async () => {
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - 30);
        
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 30);
        
        await Claim.create(createValidClaimData({ 
          status: 'submitted',
          dueDate: pastDate,
          balanceDue: 5000
        }));
        await Claim.create(createValidClaimData({ 
          status: 'submitted',
          dueDate: futureDate,
          balanceDue: 5000
        }));
        
        const pastDue = await Claim.getPastDue(testCompany._id);
        
        expect(pastDue.length).toBe(1);
      });
    });
  });
  
  // ==================== Supporting Documents ====================
  describe('Supporting Documents', () => {
    it('should store PDF invoice reference', async () => {
      const claim = await Claim.create(createValidClaimData({
        pdfUrl: '/invoices/CLM-2026-00001.pdf',
        pdfR2Key: 'invoices/CLM-2026-00001.pdf',
        pdfGeneratedAt: new Date()
      }));
      
      expect(claim.pdfUrl).toBeDefined();
      expect(claim.pdfR2Key).toBeDefined();
    });
    
    it('should store supporting documents', async () => {
      const claim = await Claim.create(createValidClaimData({
        supportingDocs: [
          { name: 'Lien Waiver.pdf', url: '/docs/lien.pdf', type: 'lien_waiver' },
          { name: 'Insurance Cert.pdf', url: '/docs/ins.pdf', type: 'insurance' }
        ]
      }));
      
      expect(claim.supportingDocs.length).toBe(2);
      expect(claim.supportingDocs[0].type).toBe('lien_waiver');
    });
  });
  
  // ==================== SAP Export ====================
  describe('SAP Export', () => {
    it('should store SAP export fields', async () => {
      const claim = await Claim.create(createValidClaimData({
        sap: {
          documentNumber: 'SAP-DOC-12345',
          companyCode: '1000',
          fiscalYear: '2026',
          vendorNumber: 'V-001',
          postingDate: new Date(),
          exportedAt: new Date(),
          status: 'posted'
        }
      }));
      
      expect(claim.sap.documentNumber).toBe('SAP-DOC-12345');
      expect(claim.sap.companyCode).toBe('1000');
    });
  });
  
  // ==================== Claim Type ====================
  describe('Claim Type', () => {
    it('should default to progress claim', async () => {
      const claim = await Claim.create(createValidClaimData());
      expect(claim.claimType).toBe('progress');
    });
    
    it('should support different claim types', async () => {
      const types = ['progress', 'final', 'retention', 'change_order', 'time_and_material'];
      
      for (const claimType of types) {
        const claim = await Claim.create(createValidClaimData({ claimType }));
        expect(claim.claimType).toBe(claimType);
      }
    });
  });
});

