/**
 * Oracle Payables API Mapper
 * 
 * Transforms internal Claim and UnitEntry objects into the Oracle REST API
 * format required by /fscmRestApi/resources/11.13.18.05/invoices
 * 
 * Also provides CSV export for legacy systems and audit trail generation.
 * 
 * @module utils/oracleMapper
 */

import { generatePayloadChecksum } from './crypto.utils';

/**
 * Format a Claim for Oracle Payables REST API
 * 
 * @param {Object} claim - The claim object from database
 * @param {Array} units - Array of UnitEntry objects included in claim
 * @param {Object} options - Additional options
 * @returns {Object} Oracle Payables invoice payload
 */
export async function formatForOracle(claim, units, options = {}) {
  const {
    supplierSiteId,
    paymentTerms = 'NET30',
    currencyCode = 'USD',
    businessUnit,
    legalEntity,
  } = options;

  // Generate invoice lines from units
  const invoiceLines = units.map((unit, index) => ({
    LineNumber: index + 1,
    LineType: 'Item',
    LineAmount: unit.totalAmount || (unit.quantity * unit.unitPrice),
    Description: formatLineDescription(unit),
    Quantity: unit.quantity,
    UnitPrice: unit.unitPrice,
    UnitOfMeasure: unit.unitOfMeasure || 'EA',
    // Oracle Distribution fields
    DistributionCombination: unit.glAccountCode || null,
    // Custom DFF attributes for audit trail
    Attribute1: unit.digitalReceiptHash || unit.checksum,
    Attribute2: formatGPSString(unit.location),
    Attribute3: unit.workDate ? new Date(unit.workDate).toISOString().split('T')[0] : null,
    Attribute4: unit.performedBy?.tier || 'prime',
    Attribute5: unit.performedBy?.subContractorName || null,
    // Project costing fields
    ProjectNumber: unit.projectNumber || claim.projectNumber,
    TaskNumber: unit.taskNumber || claim.taskNumber,
    ExpenditureType: unit.expenditureType || 'Labor',
    ExpenditureOrganization: unit.expenditureOrg,
  }));

  // Calculate totals
  const subtotal = invoiceLines.reduce((sum, line) => sum + line.LineAmount, 0);
  const taxAmount = claim.taxAmount || 0;
  const retentionAmount = claim.retentionAmount || 0;
  const invoiceAmount = subtotal + taxAmount - retentionAmount;

  // Build the Oracle payload
  const oraclePayload = {
    // Header fields
    InvoiceNumber: claim.claimNumber || `CLM-${claim._id}`,
    InvoiceType: 'Standard',
    InvoiceDate: formatOracleDate(claim.claimDate || new Date()),
    InvoiceReceivedDate: formatOracleDate(new Date()),
    InvoiceAmount: invoiceAmount,
    InvoiceCurrencyCode: currencyCode,
    PaymentCurrencyCode: currencyCode,
    
    // Supplier identification
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
    
    // Reference fields
    SupplierInvoiceNumber: claim.contractorInvoiceNumber,
    PONumber: claim.purchaseOrderNumber,
    
    // Custom header attributes
    HeaderAttribute1: claim._id?.toString(),
    HeaderAttribute2: claim.jobId?.toString(),
    HeaderAttribute3: await generateClaimChecksum(claim, units),
    
    // Invoice lines
    invoiceLines: invoiceLines,
    
    // Holds (if any validation issues)
    holds: generateHolds(units),
  };

  return oraclePayload;
}

/**
 * Format line description with item details
 */
function formatLineDescription(unit) {
  const parts = [
    unit.itemCode || unit.priceBookItemCode,
    unit.itemDescription || unit.description,
  ].filter(Boolean);
  
  return parts.join(' - ').slice(0, 240); // Oracle limit
}

/**
 * Format GPS coordinates as string for audit attribute
 */
function formatGPSString(location) {
  if (!location?.latitude || !location?.longitude) return null;
  return `${location.latitude.toFixed(6)},${location.longitude.toFixed(6)}`;
}

/**
 * Format date for Oracle (YYYY-MM-DD)
 */
function formatOracleDate(date) {
  if (!date) return null;
  const d = new Date(date);
  return d.toISOString().split('T')[0];
}

/**
 * Generate checksum for claim verification
 */
async function generateClaimChecksum(claim, units) {
  const data = {
    claimId: claim._id?.toString(),
    unitCount: units.length,
    totalAmount: units.reduce((sum, u) => sum + (u.totalAmount || 0), 0),
    timestamp: new Date().toISOString(),
  };
  
  try {
    return await generatePayloadChecksum(data);
  } catch {
    return null;
  }
}

/**
 * Generate invoice holds for validation issues
 */
function generateHolds(units) {
  const holds = [];
  
  const unitsWithGPSIssues = units.filter(u => 
    !u.location?.latitude || u.location?.accuracy > 50
  );
  
  const unitsWithPhotoIssues = units.filter(u => 
    (!u.photos || u.photos.length === 0) && !u.photoWaived
  );
  
  if (unitsWithGPSIssues.length > 0) {
    holds.push({
      HoldName: 'GPS_VERIFICATION',
      HoldReason: `${unitsWithGPSIssues.length} units have GPS accuracy issues`,
      ReleaseName: null,
    });
  }
  
  if (unitsWithPhotoIssues.length > 0) {
    holds.push({
      HoldName: 'PHOTO_VERIFICATION',
      HoldReason: `${unitsWithPhotoIssues.length} units missing photo evidence`,
      ReleaseName: null,
    });
  }
  
  return holds;
}

/**
 * Export claim to CSV format for legacy systems
 * 
 * @param {Object} claim - The claim object
 * @param {Array} units - Array of UnitEntry objects
 * @returns {string} CSV content
 */
export function exportToCSV(claim, units) {
  const headers = [
    'Claim Number',
    'Line Number',
    'Item Code',
    'Description',
    'Quantity',
    'Unit Price',
    'Total Amount',
    'Work Date',
    'Contractor Tier',
    'Subcontractor',
    'GPS Latitude',
    'GPS Longitude',
    'GPS Accuracy',
    'Photo Count',
    'Digital Receipt Hash',
  ];

  const rows = units.map((unit, index) => [
    claim.claimNumber || `CLM-${claim._id}`,
    index + 1,
    unit.itemCode || unit.priceBookItemCode || '',
    `"${(unit.itemDescription || unit.description || '').replaceAll(/"/g, '""')}"`,
    unit.quantity,
    unit.unitPrice?.toFixed(2) || '0.00',
    (unit.totalAmount || unit.quantity * unit.unitPrice)?.toFixed(2) || '0.00',
    unit.workDate ? new Date(unit.workDate).toISOString().split('T')[0] : '',
    unit.performedBy?.tier || 'prime',
    unit.performedBy?.subContractorName || '',
    unit.location?.latitude?.toFixed(6) || '',
    unit.location?.longitude?.toFixed(6) || '',
    unit.location?.accuracy?.toFixed(1) || '',
    unit.photos?.length || 0,
    unit.checksum || unit.digitalReceiptHash || '',
  ]);

  return [
    headers.join(','),
    ...rows.map(row => row.join(',')),
  ].join('\n');
}

/**
 * Generate audit trail report
 * 
 * @param {Object} claim - The claim object
 * @param {Array} units - Array of UnitEntry objects
 * @returns {Object} Audit trail data
 */
export function generateAuditTrail(claim, units) {
  return {
    claimId: claim._id?.toString(),
    claimNumber: claim.claimNumber,
    generatedAt: new Date().toISOString(),
    generatedBy: claim.createdBy?.toString(),
    
    summary: {
      totalUnits: units.length,
      totalAmount: units.reduce((sum, u) => sum + (u.totalAmount || 0), 0),
      byTier: {
        prime: units.filter(u => u.performedBy?.tier === 'prime').length,
        sub: units.filter(u => u.performedBy?.tier === 'sub').length,
        sub_of_sub: units.filter(u => u.performedBy?.tier === 'sub_of_sub').length,
      },
      byCategory: groupByCategory(units),
    },
    
    compliance: {
      gpsVerified: units.filter(u => u.location?.accuracy <= 50).length,
      gpsWarnings: units.filter(u => u.location?.accuracy > 50).length,
      photoVerified: units.filter(u => u.photos?.length > 0).length,
      photoWaived: units.filter(u => u.photoWaived).length,
    },
    
    digitalReceipts: units.map(u => ({
      unitId: u._id?.toString(),
      itemCode: u.itemCode || u.priceBookItemCode,
      checksum: u.checksum,
      gps: u.location ? {
        lat: u.location.latitude,
        lng: u.location.longitude,
        accuracy: u.location.accuracy,
        capturedAt: u.location.capturedAt,
      } : null,
      photoHashes: u.photos?.map(p => p.hash || p.s3Key) || [],
    })),
  };
}

/**
 * Group units by work category
 */
function groupByCategory(units) {
  const categories = {};
  
  units.forEach(unit => {
    const cat = unit.performedBy?.workCategory || 'other';
    if (!categories[cat]) {
      categories[cat] = { count: 0, amount: 0 };
    }
    categories[cat].count++;
    categories[cat].amount += unit.totalAmount || 0;
  });
  
  return categories;
}

/**
 * Validate claim data before Oracle export
 * 
 * @param {Object} claim - The claim object
 * @param {Array} units - Array of UnitEntry objects
 * @returns {Object} Validation result
 */
export function validateForExport(claim, units) {
  const errors = [];
  const warnings = [];

  // Required fields
  if (!claim.claimNumber && !claim._id) {
    errors.push('Claim number or ID is required');
  }

  if (!units || units.length === 0) {
    errors.push('At least one unit entry is required');
  }

  // Check each unit
  units?.forEach((unit, index) => {
    if (!unit.quantity || unit.quantity <= 0) {
      errors.push(`Line ${index + 1}: Invalid quantity`);
    }
    
    if (!unit.unitPrice && unit.unitPrice !== 0) {
      errors.push(`Line ${index + 1}: Missing unit price`);
    }

    // Warnings (not blocking)
    if (!unit.location?.latitude) {
      warnings.push(`Line ${index + 1}: Missing GPS coordinates`);
    } else if (unit.location.accuracy > 50) {
      warnings.push(`Line ${index + 1}: GPS accuracy ${unit.location.accuracy.toFixed(0)}m exceeds 50m threshold`);
    }

    if ((!unit.photos || unit.photos.length === 0) && !unit.photoWaived) {
      warnings.push(`Line ${index + 1}: Missing photo evidence`);
    }

    if (!unit.checksum) {
      warnings.push(`Line ${index + 1}: Missing digital receipt hash`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    canExport: errors.length === 0,
    requiresReview: warnings.length > 0,
  };
}

export default {
  formatForOracle,
  exportToCSV,
  generateAuditTrail,
  validateForExport,
};

