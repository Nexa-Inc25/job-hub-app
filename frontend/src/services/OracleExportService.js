/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Oracle Export Service
 * 
 * Handles JSON transformation and batching for Oracle Payables REST API.
 * Maintains Chain of Custody by passing Digital Receipt Hash to Attribute1.
 * 
 * NIST SP 800-53 Compliance:
 * - SI-7: Hash verification for data integrity
 * - SC-8: Secure transmission with checksum validation
 * - AU-3: Audit trail generation
 * 
 * @module services/OracleExportService
 */

import api from '../api';
import { 
  generatePayloadChecksum, 
  sha256,
} from '../utils/crypto.utils';

// Oracle API configuration
const ORACLE_CONFIG = {
  // REST API version
  apiVersion: '11.13.18.05',
  // Endpoints
  endpoints: {
    invoices: '/fscmRestApi/resources/11.13.18.05/invoices',
    suppliers: '/fscmRestApi/resources/11.13.18.05/suppliers',
    validations: '/fscmRestApi/resources/11.13.18.05/erpintegrations',
  },
  // Batch configuration
  batch: {
    maxLinesPerInvoice: 999,  // Oracle limit
    maxInvoicesPerBatch: 50,  // API rate limit consideration
    retryAttempts: 3,
    retryDelayMs: 2000,
  },
  // Field mappings
  source: 'FIELDLEDGER_APP',
  invoiceType: 'Standard',
};

/**
 * Export status tracking
 */
export const EXPORT_STATUS = {
  PENDING: 'pending',
  VALIDATING: 'validating',
  EXPORTING: 'exporting',
  SUCCESS: 'success',
  PARTIAL: 'partial',
  FAILED: 'failed',
};

/**
 * Oracle Export Service Class
 */
class OracleExportService {
  constructor() {
    this.listeners = [];
    this.exportQueue = [];
    this.isExporting = false;
  }

  /**
   * Subscribe to export events
   */
  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  /**
   * Emit event to subscribers
   */
  _emit(event, data) {
    this.listeners.forEach(cb => {
      try {
        cb(event, data);
      } catch (e) {
        console.error('[OracleExport] Listener error:', e);
      }
    });
  }

  /**
   * Transform a single claim to Oracle Payables format
   * 
   * CRITICAL: The Digital Receipt Hash is mapped to Attribute1 for audit trail
   * 
   * @param {Object} claim - The claim object
   * @param {Array} units - Array of UnitEntry objects
   * @param {Object} config - Additional configuration
   * @returns {Object} Oracle-formatted invoice payload
   */
  async transformClaim(claim, units, config = {}) {
    const {
      supplierSiteId,
      businessUnit,
      legalEntity,
      paymentTerms = 'NET30',
      currencyCode = 'USD',
    } = config;

    // Validate inputs
    if (!claim || !units?.length) {
      throw new Error('Claim and units are required');
    }

    // Transform line items with hash verification
    const invoiceLines = await Promise.all(units.map(async (unit, index) => {
      // Verify Digital Receipt Hash integrity
      const hashVerified = unit.checksum ? await this._verifyUnitHash(unit) : false;

      return {
        LineNumber: index + 1,
        LineType: 'Item',
        LineAmount: unit.totalAmount || (unit.quantity * unit.unitPrice),
        Description: this._formatDescription(unit),
        Quantity: unit.quantity,
        UnitPrice: unit.unitPrice,
        UnitOfMeasure: unit.unitOfMeasure || 'EA',
        
        // CRITICAL: Digital Receipt Hash for Audit Trail (NIST SI-7)
        Attribute1: unit.checksum || unit.digitalReceiptHash || null,
        
        // Additional audit attributes
        Attribute2: this._formatGPSAttribute(unit.location),
        Attribute3: unit.workDate ? new Date(unit.workDate).toISOString().split('T')[0] : null,
        Attribute4: unit.performedBy?.tier || 'prime',
        Attribute5: unit.performedBy?.subContractorName || null,
        
        // Hash verification status (for internal tracking)
        Attribute6: hashVerified ? 'VERIFIED' : 'UNVERIFIED',
        
        // Project costing
        ProjectNumber: unit.projectNumber || claim.projectNumber,
        TaskNumber: unit.taskNumber || claim.taskNumber,
        ExpenditureType: unit.expenditureType || 'Labor',
        ExpenditureOrganization: unit.expenditureOrg,
        
        // Distribution (if provided)
        DistributionCombination: unit.glAccountCode,
      };
    }));

    // Calculate totals
    const subtotal = invoiceLines.reduce((sum, line) => sum + line.LineAmount, 0);
    const taxAmount = claim.taxAmount || 0;
    const retentionAmount = claim.retentionAmount || 0;
    const invoiceAmount = subtotal + taxAmount - retentionAmount;

    // Generate claim-level checksum for payload integrity
    const payloadChecksum = await generatePayloadChecksum({
      claimId: claim._id,
      unitCount: units.length,
      subtotal,
      timestamp: new Date().toISOString(),
    });

    // Build Oracle payload
    const oraclePayload = {
      // Header identification
      InvoiceNumber: claim.claimNumber || `CLM-${claim._id}`,
      InvoiceType: ORACLE_CONFIG.invoiceType,
      Source: ORACLE_CONFIG.source,
      
      // Dates
      InvoiceDate: this._formatDate(claim.claimDate || new Date()),
      InvoiceReceivedDate: this._formatDate(new Date()),
      
      // Amounts
      InvoiceAmount: invoiceAmount,
      InvoiceCurrencyCode: currencyCode,
      PaymentCurrencyCode: currencyCode,
      
      // Supplier
      Supplier: claim.contractorName,
      SupplierNumber: claim.oracleVendorId || claim.contractorId,
      SupplierSite: supplierSiteId,
      
      // Business context
      BusinessUnit: businessUnit || claim.businessUnit,
      LegalEntity: legalEntity || claim.legalEntity,
      
      // Payment terms
      PaymentTerms: paymentTerms,
      
      // Description
      Description: `Unit Price Claim: ${claim.description || claim.claimNumber}`,
      
      // References
      SupplierInvoiceNumber: claim.contractorInvoiceNumber,
      PONumber: claim.purchaseOrderNumber,
      
      // CRITICAL: Header-level audit trail (NIST AU-3)
      HeaderAttribute1: claim._id?.toString(),
      HeaderAttribute2: claim.jobId?.toString(),
      HeaderAttribute3: payloadChecksum,  // Claim checksum for verification
      HeaderAttribute4: new Date().toISOString(),  // Export timestamp
      HeaderAttribute5: ORACLE_CONFIG.apiVersion,  // API version
      
      // Invoice lines
      invoiceLines,
      
      // Holds for validation issues
      holds: this._generateHolds(units),
    };

    return oraclePayload;
  }

  /**
   * Verify unit hash integrity
   */
  async _verifyUnitHash(unit) {
    try {
      // Reconstruct hash from unit data
      const reconstructed = await sha256(JSON.stringify({
        lat: unit.location?.latitude || 0,
        lng: unit.location?.longitude || 0,
        accuracy: unit.location?.accuracy || 0,
        timestamp: unit.capturedAt,
        deviceId: unit.deviceSignature || '',
      }));
      
      // Compare with stored hash
      return reconstructed === unit.checksum;
    } catch {
      return false;
    }
  }

  /**
   * Format description with item details
   */
  _formatDescription(unit) {
    const parts = [
      unit.itemCode || unit.priceBookItemCode,
      unit.itemDescription || unit.description,
    ].filter(Boolean);
    
    return parts.join(' - ').slice(0, 240);
  }

  /**
   * Format GPS for attribute
   */
  _formatGPSAttribute(location) {
    if (!location?.latitude || !location?.longitude) return null;
    return `${location.latitude.toFixed(6)},${location.longitude.toFixed(6)};ACC:${location.accuracy?.toFixed(0) || '?'}m`;
  }

  /**
   * Format date for Oracle
   */
  _formatDate(date) {
    if (!date) return null;
    return new Date(date).toISOString().split('T')[0];
  }

  /**
   * Generate holds for validation issues
   */
  _generateHolds(units) {
    const holds = [];
    
    const gpsIssues = units.filter(u => 
      !u.location?.latitude || u.location?.accuracy > 50
    ).length;
    
    const photoIssues = units.filter(u => 
      (!u.photos || u.photos.length === 0) && !u.photoWaived
    ).length;
    
    const hashMissing = units.filter(u => !u.checksum).length;

    if (gpsIssues > 0) {
      holds.push({
        HoldName: 'GPS_VERIFICATION_REQUIRED',
        HoldReason: `${gpsIssues} of ${units.length} units have GPS accuracy issues`,
        ReleaseName: null,
      });
    }

    if (photoIssues > 0) {
      holds.push({
        HoldName: 'PHOTO_VERIFICATION_REQUIRED',
        HoldReason: `${photoIssues} of ${units.length} units missing photo evidence`,
        ReleaseName: null,
      });
    }

    if (hashMissing > 0) {
      holds.push({
        HoldName: 'DIGITAL_RECEIPT_INCOMPLETE',
        HoldReason: `${hashMissing} of ${units.length} units missing Digital Receipt hash`,
        ReleaseName: null,
      });
    }

    return holds;
  }

  /**
   * Validate claim before export
   */
  validateForExport(claim, units) {
    const errors = [];
    const warnings = [];

    // Required fields
    if (!claim?._id && !claim?.claimNumber) {
      errors.push('Claim identifier is required');
    }

    if (!units || units.length === 0) {
      errors.push('At least one unit entry is required');
    }

    // Check line limit
    if (units?.length > ORACLE_CONFIG.batch.maxLinesPerInvoice) {
      errors.push(`Exceeds maximum ${ORACLE_CONFIG.batch.maxLinesPerInvoice} lines per invoice`);
    }

    // Validate each unit
    units?.forEach((unit, index) => {
      const line = index + 1;

      if (!unit.quantity || unit.quantity <= 0) {
        errors.push(`Line ${line}: Invalid quantity`);
      }

      if (unit.unitPrice === undefined || unit.unitPrice === null) {
        errors.push(`Line ${line}: Missing unit price`);
      }

      // Warnings (not blocking)
      if (!unit.location?.latitude) {
        warnings.push(`Line ${line}: Missing GPS coordinates`);
      } else if (unit.location.accuracy > 50) {
        warnings.push(`Line ${line}: GPS accuracy ${unit.location.accuracy.toFixed(0)}m exceeds 50m threshold`);
      }

      if ((!unit.photos || unit.photos.length === 0) && !unit.photoWaived) {
        warnings.push(`Line ${line}: Missing photo evidence`);
      }

      if (!unit.checksum) {
        warnings.push(`Line ${line}: Missing Digital Receipt hash (Attribute1 will be null)`);
      }
    });

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      canExport: errors.length === 0,
      requiresReview: warnings.length > 0,
      summary: {
        totalLines: units?.length || 0,
        linesWithHash: units?.filter(u => u.checksum).length || 0,
        linesWithGPS: units?.filter(u => u.location?.latitude).length || 0,
        linesWithPhoto: units?.filter(u => u.photos?.length > 0 || u.photoWaived).length || 0,
      },
    };
  }

  /**
   * Export a single claim to Oracle
   */
  async exportClaim(claim, units, config = {}) {
    const { dryRun = false, oracleEndpoint } = config;

    this._emit('export_start', { claimId: claim._id, unitCount: units.length });

    try {
      // Validate
      const validation = this.validateForExport(claim, units);
      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }

      // Transform
      this._emit('transforming', { claimId: claim._id });
      // NOSONAR: transformClaim is async - uses await internally for hash verification
      const payload = await this.transformClaim(claim, units, config); // NOSONAR

      if (dryRun) {
        // Dry run - just return the payload
        this._emit('export_complete', { 
          claimId: claim._id, 
          status: 'dry_run',
          payload,
        });
        return { success: true, dryRun: true, payload };
      }

      // Submit to Oracle (or backend proxy)
      this._emit('submitting', { claimId: claim._id });
      
      const endpoint = oracleEndpoint || '/api/billing/claims/export-oracle';
      const response = await api.post(endpoint, {
        claimId: claim._id,
        payload,
      });

      this._emit('export_complete', { 
        claimId: claim._id, 
        status: 'success',
        oracleReference: response.data?.oracleReference,
      });

      return { 
        success: true, 
        oracleReference: response.data?.oracleReference,
        payload,
      };

    } catch (error) {
      this._emit('export_failed', { 
        claimId: claim._id, 
        error: error.message,
      });
      
      return { 
        success: false, 
        error: error.message,
      };
    }
  }

  /**
   * Batch export multiple claims
   */
  async exportBatch(claims, unitsMap, config = {}) {
    const results = {
      total: claims.length,
      successful: 0,
      failed: 0,
      results: [],
    };

    this._emit('batch_start', { count: claims.length });

    for (let i = 0; i < claims.length; i++) {
      const claim = claims[i];
      const units = unitsMap[claim._id] || claim.lineItems || [];

      // Rate limiting
      if (i > 0) {
        await this._sleep(500);
      }

      const result = await this.exportClaim(claim, units, config);
      results.results.push({
        claimId: claim._id,
        claimNumber: claim.claimNumber,
        ...result,
      });

      if (result.success) {
        results.successful++;
      } else {
        results.failed++;
      }

      this._emit('batch_progress', {
        current: i + 1,
        total: claims.length,
        claimId: claim._id,
        success: result.success,
      });
    }

    this._emit('batch_complete', results);
    return results;
  }

  /**
   * Generate audit report for exported claim
   */
  async generateAuditReport(claim, units, exportResult) {
    const report = {
      reportType: 'ORACLE_EXPORT_AUDIT',
      generatedAt: new Date().toISOString(),
      
      claim: {
        id: claim._id,
        number: claim.claimNumber,
        totalAmount: claim.totalAmount || claim.subtotal,
      },
      
      export: {
        status: exportResult.success ? 'SUCCESS' : 'FAILED',
        oracleReference: exportResult.oracleReference,
        error: exportResult.error,
        timestamp: new Date().toISOString(),
      },
      
      digitalReceipts: units.map(unit => ({
        unitId: unit._id,
        itemCode: unit.itemCode || unit.priceBookItemCode,
        attribute1: unit.checksum,  // The hash that went to Oracle
        gpsCoordinates: unit.location ? 
          `${unit.location.latitude},${unit.location.longitude}` : null,
        gpsAccuracy: unit.location?.accuracy,
        hasPhoto: unit.photos?.length > 0 || unit.photoWaived,
        workDate: unit.workDate,
        tier: unit.performedBy?.tier,
      })),
      
      compliance: {
        hashesPresent: units.filter(u => u.checksum).length,
        hashesTotal: units.length,
        gpsVerified: units.filter(u => u.location?.accuracy <= 50).length,
        photoVerified: units.filter(u => u.photos?.length > 0).length,
      },
    };

    // Generate report checksum
    report.checksum = await generatePayloadChecksum(report);

    return report;
  }

  /**
   * Sleep utility
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
const oracleExportService = new OracleExportService();
export default oracleExportService;

// Export class for testing
export { OracleExportService };

