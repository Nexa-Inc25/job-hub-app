/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * OracleExportService Integration Tests
 * 
 * Verifies:
 * - Attribute1 field contains the correct SHA-256 Digital Receipt hash
 * - Hash integrity is maintained through transformation
 * - NIST compliance requirements are met
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OracleExportService } from '../OracleExportService';
import { generateDigitalReceiptHash, sha256 } from '../../utils/crypto.utils';

// Mock API
vi.mock('../../api', () => ({
  default: {
    post: vi.fn().mockResolvedValue({ 
      data: { oracleReference: 'ORA-12345' } 
    }),
  },
}));

describe('OracleExportService', () => {
  let service;
  let mockClaim;
  let mockUnits;

  beforeEach(async () => {
    service = new OracleExportService();

    // Create mock claim
    mockClaim = {
      _id: 'claim_001',
      claimNumber: 'CLM-2026-001',
      description: 'Test Claim',
      contractorId: 'contractor_123',
      contractorName: 'ABC Contractors',
      oracleVendorId: 'VENDOR-123',
      totalAmount: 5000,
      subtotal: 5000,
      claimDate: new Date('2026-01-31'),
      createdAt: new Date('2026-01-31'),
    };

    // Create mock units with Digital Receipt data
    const timestamp1 = '2026-01-31T10:00:00Z';
    const timestamp2 = '2026-01-31T11:00:00Z';

    // Generate actual hashes for test verification
    const hash1 = await generateDigitalReceiptHash({
      gps: { lat: 34.052234, lng: -118.243685, accuracy: 5 },
      timestamp: timestamp1,
      photoHash: 'photo_hash_001',
      deviceId: 'device_001',
    });

    const hash2 = await generateDigitalReceiptHash({
      gps: { lat: 34.052300, lng: -118.243700, accuracy: 8 },
      timestamp: timestamp2,
      photoHash: 'photo_hash_002',
      deviceId: 'device_001',
    });

    mockUnits = [
      {
        _id: 'unit_001',
        itemCode: 'TRENCH-50',
        priceBookItemCode: 'TRENCH-50',
        itemDescription: '50ft Underground Trench',
        quantity: 50,
        unitPrice: 25.00,
        totalAmount: 1250.00,
        workDate: timestamp1,
        capturedAt: timestamp1,
        checksum: hash1,  // The Digital Receipt hash
        deviceSignature: 'device_001',
        location: {
          latitude: 34.052234,
          longitude: -118.243685,
          accuracy: 5,
          capturedAt: timestamp1,
        },
        photos: [{ url: 'https://example.com/photo1.jpg', photoType: 'after' }],
        performedBy: {
          tier: 'prime',
          workCategory: 'electrical',
        },
      },
      {
        _id: 'unit_002',
        itemCode: 'POLE-SET',
        priceBookItemCode: 'POLE-SET',
        itemDescription: 'Utility Pole Installation',
        quantity: 1,
        unitPrice: 3750.00,
        totalAmount: 3750.00,
        workDate: timestamp2,
        capturedAt: timestamp2,
        checksum: hash2,
        deviceSignature: 'device_001',
        location: {
          latitude: 34.052300,
          longitude: -118.243700,
          accuracy: 8,
          capturedAt: timestamp2,
        },
        photos: [{ url: 'https://example.com/photo2.jpg', photoType: 'after' }],
        performedBy: {
          tier: 'sub',
          subContractorName: 'XYZ Civil',
          workCategory: 'civil',
        },
      },
    ];
  });

  describe('NIST SI-7: Digital Receipt Hash Verification', () => {
    it('should map checksum to Attribute1 correctly', async () => {
      const payload = await service.transformClaim(mockClaim, mockUnits);

      // CRITICAL TEST: Verify Attribute1 contains the Digital Receipt hash
      expect(payload.invoiceLines[0].Attribute1).toBe(mockUnits[0].checksum);
      expect(payload.invoiceLines[1].Attribute1).toBe(mockUnits[1].checksum);
    });

    it('should preserve SHA-256 hash format in Attribute1', async () => {
      const payload = await service.transformClaim(mockClaim, mockUnits);

      // SHA-256 produces 64 character hex string
      expect(payload.invoiceLines[0].Attribute1).toHaveLength(64);
      expect(payload.invoiceLines[0].Attribute1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should match original hash exactly after transformation', async () => {
      const originalHash = mockUnits[0].checksum;
      const payload = await service.transformClaim(mockClaim, mockUnits);
      const transformedHash = payload.invoiceLines[0].Attribute1;

      // Byte-for-byte comparison
      expect(transformedHash).toStrictEqual(originalHash);
    });

    it('should handle units with null checksum', async () => {
      const unitsWithoutHash = [
        { ...mockUnits[0], checksum: null },
      ];

      const payload = await service.transformClaim(mockClaim, unitsWithoutHash);

      expect(payload.invoiceLines[0].Attribute1).toBeNull();
    });

    it('should include hash verification status in Attribute6', async () => {
      const payload = await service.transformClaim(mockClaim, mockUnits);

      // Attribute6 should indicate verification status
      expect(payload.invoiceLines[0].Attribute6).toBeDefined();
      expect(['VERIFIED', 'UNVERIFIED']).toContain(payload.invoiceLines[0].Attribute6);
    });
  });

  describe('NIST AU-3: Audit Trail Generation', () => {
    it('should include claim checksum in HeaderAttribute3', async () => {
      const payload = await service.transformClaim(mockClaim, mockUnits);

      // Header should have a checksum for the entire claim
      expect(payload.HeaderAttribute3).toBeDefined();
      expect(payload.HeaderAttribute3).toHaveLength(64);
    });

    it('should include export timestamp in HeaderAttribute4', async () => {
      const beforeExport = new Date().toISOString();
      const payload = await service.transformClaim(mockClaim, mockUnits);
      const afterExport = new Date().toISOString();

      expect(payload.HeaderAttribute4).toBeDefined();
      expect(payload.HeaderAttribute4 >= beforeExport).toBe(true);
      expect(payload.HeaderAttribute4 <= afterExport).toBe(true);
    });

    it('should generate complete audit report', async () => {
      const exportResult = { success: true, oracleReference: 'ORA-12345' };
      const report = await service.generateAuditReport(mockClaim, mockUnits, exportResult);

      expect(report.reportType).toBe('ORACLE_EXPORT_AUDIT');
      expect(report.digitalReceipts).toHaveLength(2);
      expect(report.digitalReceipts[0].attribute1).toBe(mockUnits[0].checksum);
      expect(report.compliance.hashesPresent).toBe(2);
    });
  });

  describe('GPS Attribute Mapping', () => {
    it('should format GPS coordinates in Attribute2', async () => {
      const payload = await service.transformClaim(mockClaim, mockUnits);

      // Attribute2 should contain GPS data
      expect(payload.invoiceLines[0].Attribute2).toContain('34.052234');
      expect(payload.invoiceLines[0].Attribute2).toContain('-118.243685');
      expect(payload.invoiceLines[0].Attribute2).toContain('ACC:5m');
    });

    it('should include work date in Attribute3', async () => {
      const payload = await service.transformClaim(mockClaim, mockUnits);

      expect(payload.invoiceLines[0].Attribute3).toBe('2026-01-31');
    });

    it('should include tier in Attribute4', async () => {
      const payload = await service.transformClaim(mockClaim, mockUnits);

      expect(payload.invoiceLines[0].Attribute4).toBe('prime');
      expect(payload.invoiceLines[1].Attribute4).toBe('sub');
    });

    it('should include subcontractor name in Attribute5', async () => {
      const payload = await service.transformClaim(mockClaim, mockUnits);

      expect(payload.invoiceLines[0].Attribute5).toBeNull();
      expect(payload.invoiceLines[1].Attribute5).toBe('XYZ Civil');
    });
  });

  describe('Validation', () => {
    it('should pass validation for complete units', () => {
      const validation = service.validateForExport(mockClaim, mockUnits);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(validation.summary.linesWithHash).toBe(2);
    });

    it('should fail validation for missing quantity', () => {
      const invalidUnits = [{ ...mockUnits[0], quantity: 0 }];
      const validation = service.validateForExport(mockClaim, invalidUnits);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('quantity'))).toBe(true);
    });

    it('should warn for missing GPS', () => {
      const unitsNoGPS = [{ ...mockUnits[0], location: null }];
      const validation = service.validateForExport(mockClaim, unitsNoGPS);

      expect(validation.valid).toBe(true);  // Warning, not error
      expect(validation.warnings.some(w => w.includes('GPS'))).toBe(true);
    });

    it('should warn for missing hash', () => {
      const unitsNoHash = [{ ...mockUnits[0], checksum: null }];
      const validation = service.validateForExport(mockClaim, unitsNoHash);

      expect(validation.warnings.some(w => w.includes('Digital Receipt hash'))).toBe(true);
    });

    it('should warn for poor GPS accuracy', () => {
      const unitsPoorGPS = [{
        ...mockUnits[0],
        location: { ...mockUnits[0].location, accuracy: 75 },
      }];
      const validation = service.validateForExport(mockClaim, unitsPoorGPS);

      expect(validation.warnings.some(w => w.includes('exceeds 50m'))).toBe(true);
    });
  });

  describe('Invoice Structure', () => {
    it('should generate valid Oracle invoice structure', async () => {
      const payload = await service.transformClaim(mockClaim, mockUnits);

      // Required fields
      expect(payload.InvoiceNumber).toBe('CLM-2026-001');
      expect(payload.InvoiceType).toBe('Standard');
      expect(payload.Source).toBe('FIELDLEDGER_APP');
      expect(payload.InvoiceAmount).toBe(5000);
      expect(payload.Supplier).toBe('ABC Contractors');
      expect(payload.SupplierNumber).toBe('VENDOR-123');
    });

    it('should calculate line amounts correctly', async () => {
      const payload = await service.transformClaim(mockClaim, mockUnits);

      expect(payload.invoiceLines[0].LineAmount).toBe(1250);
      expect(payload.invoiceLines[0].Quantity).toBe(50);
      expect(payload.invoiceLines[0].UnitPrice).toBe(25);
    });

    it('should format description correctly', async () => {
      const payload = await service.transformClaim(mockClaim, mockUnits);

      expect(payload.invoiceLines[0].Description).toBe('TRENCH-50 - 50ft Underground Trench');
    });

    it('should generate holds for validation issues', async () => {
      const unitsWithIssues = [
        { ...mockUnits[0], location: null, photos: [], checksum: null },
      ];

      const payload = await service.transformClaim(mockClaim, unitsWithIssues);

      expect(payload.holds.length).toBeGreaterThan(0);
      expect(payload.holds.some(h => h.HoldName === 'GPS_VERIFICATION_REQUIRED')).toBe(true);
      expect(payload.holds.some(h => h.HoldName === 'PHOTO_VERIFICATION_REQUIRED')).toBe(true);
      expect(payload.holds.some(h => h.HoldName === 'DIGITAL_RECEIPT_INCOMPLETE')).toBe(true);
    });
  });

  describe('Hash Integrity End-to-End', () => {
    it('should maintain hash integrity through full export flow', async () => {
      // Simulate the full flow: Field capture → Queue → Export
      
      // 1. Generate hash as it would be in the field
      const fieldData = {
        gps: { lat: 34.052234, lng: -118.243685, accuracy: 5 },
        timestamp: '2026-01-31T10:00:00Z',
        photoHash: 'photo_hash_001',
        deviceId: 'device_001',
      };
      const fieldHash = await generateDigitalReceiptHash(fieldData);

      // 2. Create unit with that hash
      const unit = {
        ...mockUnits[0],
        checksum: fieldHash,
      };

      // 3. Transform for Oracle
      const payload = await service.transformClaim(mockClaim, [unit]);

      // 4. Verify hash made it to Attribute1 unchanged
      expect(payload.invoiceLines[0].Attribute1).toBe(fieldHash);

      // 5. Verify hash is still valid SHA-256
      expect(payload.invoiceLines[0].Attribute1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce consistent hashes for same input', async () => {
      const input = {
        gps: { lat: 34.0, lng: -118.0, accuracy: 5 },
        timestamp: '2026-01-31T10:00:00Z',
        photoHash: 'test',
        deviceId: 'device',
      };

      const hash1 = await generateDigitalReceiptHash(input);
      const hash2 = await generateDigitalReceiptHash(input);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different GPS coordinates', async () => {
      const input1 = {
        gps: { lat: 34.0, lng: -118.0, accuracy: 5 },
        timestamp: '2026-01-31T10:00:00Z',
        photoHash: 'test',
        deviceId: 'device',
      };

      const input2 = {
        ...input1,
        gps: { lat: 34.001, lng: -118.001, accuracy: 5 },  // Different location
      };

      const hash1 = await generateDigitalReceiptHash(input1);
      const hash2 = await generateDigitalReceiptHash(input2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Dry Run Export', () => {
    it('should return payload without API call on dry run', async () => {
      const result = await service.exportClaim(mockClaim, mockUnits, { dryRun: true });

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.payload).toBeDefined();
      expect(result.payload.invoiceLines[0].Attribute1).toBe(mockUnits[0].checksum);
    });
  });

  describe('Event Emission', () => {
    it('should emit events during export', async () => {
      const events = [];
      const unsubscribe = service.subscribe((event, data) => {
        events.push({ event, data });
      });

      await service.exportClaim(mockClaim, mockUnits, { dryRun: true });

      unsubscribe();

      expect(events.some(e => e.event === 'export_start')).toBe(true);
      expect(events.some(e => e.event === 'transforming')).toBe(true);
      expect(events.some(e => e.event === 'export_complete')).toBe(true);
    });
  });
});

