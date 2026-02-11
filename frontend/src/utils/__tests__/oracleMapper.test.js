/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Oracle Mapper Utility Tests
 * 
 * Tests Oracle Payables API mapping, CSV export, audit trail, and validation.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { exportToCSV, generateAuditTrail, validateForExport } from '../oracleMapper';

// Mock crypto.subtle for checksum generation
beforeAll(() => {
  if (!globalThis.crypto?.subtle?.digest) {
    const { webcrypto } = require('node:crypto');
    Object.defineProperty(globalThis, 'crypto', {
      value: webcrypto,
      writable: true,
    });
  }
});

describe('Oracle Mapper', () => {
  const mockClaim = {
    _id: '65abc123def456',
    claimNumber: 'CLM-2026-001',
    claimDate: '2026-02-10',
    contractorName: 'Alvah Utility',
    contractorId: 'VENDOR-001',
    businessUnit: 'PGE_BU',
    legalEntity: 'PGE_LE',
    description: 'February Billing',
    createdBy: 'user123',
  };

  const mockUnits = [
    {
      _id: 'unit1',
      itemCode: 'OH-001',
      itemDescription: 'Set Pole 40ft Class 3',
      quantity: 2,
      unitPrice: 1500,
      totalAmount: 3000,
      location: { latitude: 37.7749, longitude: -122.4194, accuracy: 10 },
      workDate: '2026-02-08',
      photos: [{ hash: 'photo1hash' }],
      checksum: 'checksum123',
      performedBy: { tier: 'prime' },
    },
    {
      _id: 'unit2',
      itemCode: 'OH-002',
      itemDescription: 'Install Transformer',
      quantity: 1,
      unitPrice: 3500,
      totalAmount: 3500,
      location: { latitude: 37.775, longitude: -122.42, accuracy: 15 },
      workDate: '2026-02-09',
      photos: [{ hash: 'photo2hash' }],
      checksum: 'checksum456',
      performedBy: { tier: 'sub', subContractorName: 'SubCo' },
    },
  ];

  describe('exportToCSV', () => {
    it('should generate valid CSV with headers', () => {
      const csv = exportToCSV(mockClaim, mockUnits);
      const lines = csv.split('\n');
      expect(lines[0]).toContain('Claim Number');
      expect(lines[0]).toContain('Item Code');
      expect(lines[0]).toContain('GPS Latitude');
      expect(lines).toHaveLength(3); // header + 2 lines
    });

    it('should include claim number in each line', () => {
      const csv = exportToCSV(mockClaim, mockUnits);
      const lines = csv.split('\n');
      expect(lines[1]).toContain('CLM-2026-001');
      expect(lines[2]).toContain('CLM-2026-001');
    });

    it('should format amounts with 2 decimal places', () => {
      const csv = exportToCSV(mockClaim, mockUnits);
      expect(csv).toContain('3000.00');
      expect(csv).toContain('3500.00');
    });

    it('should handle missing optional fields', () => {
      const sparseUnits = [{
        quantity: 1,
        unitPrice: 100,
        totalAmount: 100,
      }];
      const csv = exportToCSV(mockClaim, sparseUnits);
      expect(csv.split('\n')).toHaveLength(2);
    });

    it('should escape quotes in descriptions', () => {
      const units = [{
        ...mockUnits[0],
        itemDescription: 'Set Pole 40ft "Class 3"',
      }];
      const csv = exportToCSV(mockClaim, units);
      expect(csv).toContain('""Class 3""');
    });
  });

  describe('generateAuditTrail', () => {
    it('should include claim and unit summary', () => {
      const trail = generateAuditTrail(mockClaim, mockUnits);
      expect(trail.claimNumber).toBe('CLM-2026-001');
      expect(trail.summary.totalUnits).toBe(2);
      expect(trail.summary.totalAmount).toBe(6500);
    });

    it('should categorize by tier', () => {
      const trail = generateAuditTrail(mockClaim, mockUnits);
      expect(trail.summary.byTier.prime).toBe(1);
      expect(trail.summary.byTier.sub).toBe(1);
    });

    it('should include compliance data', () => {
      const trail = generateAuditTrail(mockClaim, mockUnits);
      expect(trail.compliance.gpsVerified).toBe(2);
      expect(trail.compliance.photoVerified).toBe(2);
    });

    it('should include digital receipts', () => {
      const trail = generateAuditTrail(mockClaim, mockUnits);
      expect(trail.digitalReceipts).toHaveLength(2);
      expect(trail.digitalReceipts[0].itemCode).toBe('OH-001');
      expect(trail.digitalReceipts[0].gps.lat).toBe(37.7749);
    });

    it('should include timestamp', () => {
      const trail = generateAuditTrail(mockClaim, mockUnits);
      expect(trail.generatedAt).toBeDefined();
    });
  });

  describe('validateForExport', () => {
    it('should pass for valid claim with units', () => {
      const result = validateForExport(mockClaim, mockUnits);
      expect(result.valid).toBe(true);
      expect(result.canExport).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail if no claim number', () => {
      const result = validateForExport({}, mockUnits);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Claim number or ID is required');
    });

    it('should fail if no units', () => {
      const result = validateForExport(mockClaim, []);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one unit entry is required');
    });

    it('should fail for invalid quantity', () => {
      const badUnits = [{ ...mockUnits[0], quantity: 0 }];
      const result = validateForExport(mockClaim, badUnits);
      expect(result.valid).toBe(false);
    });

    it('should warn for missing GPS', () => {
      const noGPS = [{ ...mockUnits[0], location: {} }];
      const result = validateForExport(mockClaim, noGPS);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.requiresReview).toBe(true);
    });

    it('should warn for low GPS accuracy', () => {
      const lowAccuracy = [{
        ...mockUnits[0],
        location: { latitude: 37.77, longitude: -122.42, accuracy: 100 },
      }];
      const result = validateForExport(mockClaim, lowAccuracy);
      expect(result.warnings).toEqual(
        expect.arrayContaining([expect.stringContaining('GPS accuracy')])
      );
    });

    it('should warn for missing photos', () => {
      const noPhotos = [{ ...mockUnits[0], photos: [] }];
      const result = validateForExport(mockClaim, noPhotos);
      expect(result.warnings).toEqual(
        expect.arrayContaining([expect.stringContaining('photo evidence')])
      );
    });

    it('should not warn if photo is waived', () => {
      const waived = [{ ...mockUnits[0], photos: [], photoWaived: true }];
      const result = validateForExport(mockClaim, waived);
      const photoWarnings = result.warnings.filter(w => w.includes('photo'));
      expect(photoWarnings).toHaveLength(0);
    });
  });
});

