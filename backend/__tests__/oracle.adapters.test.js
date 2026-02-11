/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Oracle Adapters Unit Tests
 * 
 * Tests for Oracle Cloud integration adapters:
 * - UnifierAdapter
 * - EAMAdapter
 * - P6Adapter
 * - Claim model Oracle export methods
 */

const mongoose = require('mongoose');

// Import adapters
const UnifierAdapter = require('../services/oracle/UnifierAdapter');
const EAMAdapter = require('../services/oracle/EAMAdapter');
const P6Adapter = require('../services/oracle/P6Adapter');
const { oracleService } = require('../services/oracle');

// Import Claim model for FBDI tests
const Claim = require('../models/Claim');
const Company = require('../models/Company');

describe('Oracle Adapters', () => {
  describe('UnifierAdapter', () => {
    let adapter;
    
    beforeEach(() => {
      adapter = new UnifierAdapter();
    });
    
    it('should return false for isConfigured when env vars are missing', () => {
      expect(adapter.isConfigured()).toBe(false);
    });
    
    it('should return mock response when unconfigured', async () => {
      const result = await adapter.uploadDocument({
        projectNumber: 'PM-12345',
        folderPath: '/test',
        fileName: 'test.pdf',
        fileContent: 'base64content'
      });
      
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('mock', true);
      expect(result).toHaveProperty('documentId');
      expect(result.documentId).toMatch(/^MOCK-DOC-/);
    });
    
    it('should return mock BP record when unconfigured', async () => {
      const result = await adapter.createBPRecord({
        projectNumber: 'PM-12345',
        bpName: 'As-Built Submittal',
        recordData: { title: 'Test Record' }
      });
      
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('mock', true);
      expect(result).toHaveProperty('recordId');
      expect(result.recordId).toMatch(/^MOCK-REC-/);
    });
    
    it('should submit as-built package with mock responses', async () => {
      const result = await adapter.submitAsBuiltPackage({
        pmNumber: 'PM-12345',
        sections: [
          { sectionType: 'face_sheet', description: 'Face Sheet' }
        ],
        companyName: 'Test Company',
        submittedBy: 'Test User'
      });
      
      expect(result).toHaveProperty('projectNumber', 'PM-12345');
      expect(result).toHaveProperty('documents');
      expect(result).toHaveProperty('bpRecord');
    });
  });
  
  describe('EAMAdapter', () => {
    let adapter;
    
    beforeEach(() => {
      adapter = new EAMAdapter();
    });
    
    it('should return false for isConfigured when env vars are missing', () => {
      expect(adapter.isConfigured()).toBe(false);
    });
    
    it('should return mock work order response when unconfigured', async () => {
      const result = await adapter.completeWorkOrder({
        workOrderNumber: 'WO-12345',
        completionDate: '2026-02-11'
      });
      
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('mock', true);
      expect(result).toHaveProperty('workOrderNumber', 'WO-12345');
      expect(result).toHaveProperty('newStatus', 'COMPLETE');
    });
    
    it('should return mock asset response when unconfigured', async () => {
      const result = await adapter.updateAsset({
        assetNumber: 'POLE-12345',
        assetType: 'POLE',
        assetData: { poleClass: '45-5' }
      });
      
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('mock', true);
      expect(result).toHaveProperty('assetType', 'POLE');
    });
    
    it('should build correct asset payload for poles', () => {
      const payload = adapter.buildAssetPayload('POLE', {
        poleClass: '45-5',
        height: 45,
        material: 'WOOD',
        installationDate: '2026-02-11'
      });
      
      expect(payload).toHaveProperty('Attribute1', '45-5');
      expect(payload).toHaveProperty('Attribute2', 45);
      expect(payload).toHaveProperty('Attribute3', 'WOOD');
      expect(payload).toHaveProperty('AttributeCategory', 'DISTRIBUTION_ASSET');
    });
    
    it('should build correct asset payload for transformers', () => {
      const payload = adapter.buildAssetPayload('TRANSFORMER', {
        kva: 50,
        voltage: '12470',
        manufacturer: 'ABB'
      });
      
      expect(payload).toHaveProperty('Attribute1', 50);
      expect(payload).toHaveProperty('Attribute2', '12470');
      expect(payload).toHaveProperty('Attribute3', 'ABB');
    });
  });
  
  describe('P6Adapter', () => {
    let adapter;
    
    beforeEach(() => {
      adapter = new P6Adapter();
    });
    
    it('should return false for isConfigured when env vars are missing', () => {
      expect(adapter.isConfigured()).toBe(false);
    });
    
    it('should return mock project response when unconfigured', async () => {
      const result = await adapter.getProject('PRJ-12345');
      
      expect(result).toHaveProperty('mock', true);
      expect(result).toHaveProperty('Id', 'PRJ-12345');
      expect(result).toHaveProperty('Status', 'Active');
    });
    
    it('should return mock activities when unconfigured', async () => {
      const result = await adapter.getActivities('PRJ-12345');
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('mock', true);
    });
    
    it('should return mock progress update when unconfigured', async () => {
      const result = await adapter.updateActivityProgress({
        projectCode: 'PRJ-12345',
        activityCode: 'PRJ-12345-A100',
        percentComplete: 75
      });
      
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('mock', true);
      expect(result).toHaveProperty('percentComplete', 75);
    });
    
    it('should set status to Completed when percentComplete is 100', async () => {
      const result = await adapter.updateActivityProgress({
        projectCode: 'PRJ-12345',
        activityCode: 'PRJ-12345-A100',
        percentComplete: 100
      });
      
      expect(result.newStatus).toBe('Completed');
    });
  });
  
  describe('OracleIntegrationService', () => {
    it('should report status of all integrations', () => {
      const status = oracleService.getStatus();
      
      expect(status).toHaveProperty('unifier');
      expect(status).toHaveProperty('eam');
      expect(status).toHaveProperty('p6');
      expect(status).toHaveProperty('fbdi');
      
      expect(status.fbdi.configured).toBe(true);
    });
    
    it('should submit to all systems via submitToOracle', async () => {
      const result = await oracleService.submitToOracle({
        pmNumber: 'PM-12345',
        sections: []
      });
      
      expect(result).toHaveProperty('pmNumber', 'PM-12345');
      expect(result).toHaveProperty('systems');
      expect(result.systems).toHaveProperty('unifier');
      expect(result.systems).toHaveProperty('eam');
      expect(result.systems).toHaveProperty('p6');
    });
    
    it('should allow selective system submission', async () => {
      const result = await oracleService.submitToOracle(
        { pmNumber: 'PM-12345', sections: [] },
        { pushToUnifier: true, pushToEAM: false, pushToP6: false }
      );
      
      expect(result.systems).toHaveProperty('unifier');
      expect(result.systems).not.toHaveProperty('eam');
      expect(result.systems).not.toHaveProperty('p6');
    });
  });
  
  describe('Claim Model Oracle Export', () => {
    let testCompany;
    let testClaim;
    
    beforeAll(async () => {
      testCompany = await Company.create({
        name: 'Test Contractor LLC',
        subscription: { plan: 'professional' }
      });
    });
    
    beforeEach(async () => {
      testClaim = await Claim.create({
        companyId: testCompany._id,
        subtotal: 5000,
        totalAmount: 5000,
        amountDue: 5000,
        status: 'approved',
        lineItems: [
          {
            unitEntryId: new mongoose.Types.ObjectId(),
            lineNumber: 1,
            itemCode: 'POLE-45',
            description: 'Install 45ft pole',
            quantity: 1,
            unit: 'EA',
            unitPrice: 2500,
            totalAmount: 2500,
            hasGPS: true,
            gpsQuality: 'high',
            photoCount: 3
          },
          {
            unitEntryId: new mongoose.Types.ObjectId(),
            lineNumber: 2,
            itemCode: 'WIRE-100',
            description: 'Install 100ft primary wire',
            quantity: 100,
            unit: 'LF',
            unitPrice: 25,
            totalAmount: 2500,
            hasGPS: true,
            gpsQuality: 'medium',
            photoCount: 2
          }
        ],
        oracle: {
          vendorId: 'VND-123',
          businessUnit: 'Test BU',
          paymentTerms: 'Net 30'
        }
      });
    });
    
    describe('toOraclePayload', () => {
      it('should generate valid Oracle REST API payload', () => {
        const payload = testClaim.toOraclePayload();
        
        expect(payload).toHaveProperty('InvoiceNumber');
        expect(payload.InvoiceNumber).toMatch(/^CLM-/);
        expect(payload).toHaveProperty('InvoiceAmount', 5000);
        expect(payload).toHaveProperty('InvoiceCurrencyCode', 'USD');
        expect(payload).toHaveProperty('InvoiceType', 'Standard');
        expect(payload).toHaveProperty('InvoiceSource', 'FieldLedger');
      });
      
      it('should include all line items', () => {
        const payload = testClaim.toOraclePayload();
        
        expect(payload).toHaveProperty('invoiceLines');
        expect(payload.invoiceLines).toHaveLength(2);
        expect(payload.invoiceLines[0]).toHaveProperty('LineNumber', 1);
        expect(payload.invoiceLines[0]).toHaveProperty('ItemDescription');
        expect(payload.invoiceLines[0].ItemDescription).toContain('POLE-45');
      });
      
      it('should include custom DFF attributes', () => {
        const payload = testClaim.toOraclePayload();
        
        expect(payload).toHaveProperty('AttributeCategory', 'CONTRACTOR_INVOICE');
        expect(payload).toHaveProperty('Attribute3', testClaim.claimNumber);
      });
      
      it('should include line-level DFFs', () => {
        const payload = testClaim.toOraclePayload();
        
        expect(payload.invoiceLines[0]).toHaveProperty('LineAttributeCategory', 'UNIT_PRICE_ITEM');
        expect(payload.invoiceLines[0]).toHaveProperty('LineAttribute1', 'POLE-45');
      });
    });
    
    describe('toOracleFBDI', () => {
      it('should generate valid FBDI export structure', () => {
        const fbdi = testClaim.toOracleFBDI();
        
        expect(fbdi).toHaveProperty('header');
        expect(fbdi).toHaveProperty('lines');
        expect(fbdi).toHaveProperty('headerColumns');
        expect(fbdi).toHaveProperty('lineColumns');
        
        expect(Array.isArray(fbdi.header)).toBe(true);
        expect(Array.isArray(fbdi.lines)).toBe(true);
      });
      
      it('should have correct header columns', () => {
        const fbdi = testClaim.toOracleFBDI();
        
        expect(fbdi.headerColumns).toContain('INVOICE_NUM');
        expect(fbdi.headerColumns).toContain('VENDOR_NUM');
        expect(fbdi.headerColumns).toContain('INVOICE_AMOUNT');
        expect(fbdi.headerColumns).toContain('GL_DATE');
      });
      
      it('should have correct line columns', () => {
        const fbdi = testClaim.toOracleFBDI();
        
        expect(fbdi.lineColumns).toContain('LINE_NUMBER');
        expect(fbdi.lineColumns).toContain('AMOUNT');
        expect(fbdi.lineColumns).toContain('QUANTITY_INVOICED');
        expect(fbdi.lineColumns).toContain('PROJECT_ID');
      });
      
      it('should have one line row per line item', () => {
        const fbdi = testClaim.toOracleFBDI();
        
        expect(fbdi.lines).toHaveLength(2);
        expect(fbdi.lines[0][1]).toBe(1); // LINE_NUMBER
        expect(fbdi.lines[1][1]).toBe(2); // LINE_NUMBER
      });
      
      it('should include claim number in header', () => {
        const fbdi = testClaim.toOracleFBDI();
        
        expect(fbdi.header[0]).toBe(testClaim.claimNumber);
      });
    });
  });
});

