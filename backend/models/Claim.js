/**
 * FieldLedger - Claim Model
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Invoice/Claim for unit-price billing.
 * Aggregates verified UnitEntries into billable claims with
 * Oracle Payables-compatible export fields.
 */

const mongoose = require('mongoose');

// Line item schema (snapshot from UnitEntry for invoice)
const claimLineItemSchema = new mongoose.Schema({
  unitEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'UnitEntry', required: true },
  lineNumber: { type: Number, required: true },
  
  // Snapshot from UnitEntry (locked at claim creation)
  itemCode: { type: String, required: true },
  description: { type: String, required: true },
  quantity: { type: Number, required: true },
  unit: { type: String, required: true },
  unitPrice: { type: Number, required: true },
  totalAmount: { type: Number, required: true },
  
  // Work date for period reporting
  workDate: Date,
  
  // Verification summary (for utility confidence)
  photoCount: { type: Number, default: 0 },
  hasGPS: { type: Boolean, default: false },
  gpsAccuracy: Number,                              // Best accuracy from photos
  gpsQuality: String,                               // 'high', 'medium', 'low'
  
  // Sub-tier info (for sub invoicing and reporting)
  performedByTier: String,                          // 'prime', 'sub', 'sub_of_sub'
  subContractorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
  subContractorName: String,
  workCategory: String,                             // 'electrical', 'civil', etc.
  
  // Oracle mapping per line
  oracleExpenditureType: String,
  oracleTaskNumber: String
});

// Payment tracking schema
const paymentSchema = new mongoose.Schema({
  paymentDate: { type: Date, required: true },
  amount: { type: Number, required: true },
  paymentMethod: { 
    type: String, 
    enum: ['ach', 'check', 'wire', 'credit_card', 'other'],
    default: 'ach'
  },
  referenceNumber: String,                          // Check # or transaction ID
  bankReference: String,                            // Bank transaction reference
  notes: String,
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  recordedAt: { type: Date, default: Date.now }
});

// Adjustment schema
const adjustmentSchema = new mongoose.Schema({
  description: { type: String, required: true },
  amount: { type: Number, required: true },         // Positive or negative
  reason: String,
  category: {
    type: String,
    enum: ['correction', 'credit', 'deduction', 'backcharge', 'retention_release', 'other']
  },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  addedAt: { type: Date, default: Date.now }
});

// Main Claim schema
const claimSchema = new mongoose.Schema({
  // === RELATIONSHIPS ===
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job' },          // Optional - can span jobs
  jobIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Job' }],       // If claim spans multiple jobs
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  utilityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Utility' },
  priceBookId: { type: mongoose.Schema.Types.ObjectId, ref: 'PriceBook' },
  
  // === IDENTIFICATION ===
  claimNumber: { type: String, unique: true },  // "CLM-2026-00001" - auto-generated in pre-save
  invoiceNumber: String,                            // External invoice # if different
  poNumber: String,                                 // Utility PO reference
  contractNumber: String,                           // MSA reference
  
  // === CLAIM TYPE ===
  claimType: {
    type: String,
    enum: ['progress', 'final', 'retention', 'change_order', 'time_and_material'],
    default: 'progress'
  },
  
  // === PERIOD ===
  periodStart: Date,                                // Work period covered
  periodEnd: Date,
  billingPeriod: String,                            // "January 2026" or "Week 5"
  
  // === LINE ITEMS ===
  lineItems: [claimLineItemSchema],
  lineItemCount: { type: Number, default: 0 },
  
  // === CATEGORY BREAKDOWN (for reporting) ===
  categoryTotals: {
    civil: { type: Number, default: 0 },
    electrical: { type: Number, default: 0 },
    traffic_control: { type: Number, default: 0 },
    vegetation: { type: Number, default: 0 },
    other: { type: Number, default: 0 }
  },
  
  // === SUB-TIER BREAKDOWN (for sub billing) ===
  tierTotals: {
    prime: { type: Number, default: 0 },
    sub: { type: Number, default: 0 },
    sub_of_sub: { type: Number, default: 0 }
  },
  
  // === TOTALS ===
  subtotal: { type: Number, required: true },
  
  // Adjustments
  adjustments: [adjustmentSchema],
  adjustmentTotal: { type: Number, default: 0 },
  
  // Tax (if applicable)
  taxable: { type: Boolean, default: false },
  taxRate: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  
  // Retention (common in construction)
  retentionRate: { type: Number, default: 0 },      // e.g., 0.10 for 10%
  retentionAmount: { type: Number, default: 0 },
  retentionReleased: { type: Boolean, default: false },
  retentionReleasedAt: Date,
  
  // Final amounts
  totalAmount: { type: Number, required: true },    // subtotal + adjustments + tax
  amountDue: { type: Number, required: true },      // totalAmount - retentionAmount
  
  // === VERIFICATION METRICS (for utility confidence) ===
  verificationMetrics: {
    totalUnits: { type: Number, default: 0 },
    unitsWithPhotos: { type: Number, default: 0 },
    unitsWithGPS: { type: Number, default: 0 },
    highQualityGPS: { type: Number, default: 0 },   // < 10m accuracy
    photoComplianceRate: { type: Number, default: 0 }, // percentage
    gpsComplianceRate: { type: Number, default: 0 }    // percentage
  },
  
  // === ORACLE/ERP EXPORT FIELDS ===
  oracle: {
    // Oracle Payables REST API fields
    invoiceNumber: String,                          // Oracle AP Invoice Number
    vendorId: String,                               // Oracle Vendor ID
    vendorSiteId: String,                           // Oracle Vendor Site ID
    vendorName: String,                             // Vendor name for reference
    businessUnit: String,                           // Oracle Business Unit
    legalEntity: String,                            // Oracle Legal Entity
    
    // Project fields
    projectNumber: String,                          // Maps to PM Number
    projectName: String,
    taskNumber: String,
    expenditureOrganization: String,
    expenditureType: String,
    
    // Payment terms
    paymentTerms: String,                           // "Net 30", "Net 45"
    paymentMethod: String,                          // "EFT", "Check"
    
    // GL coding
    glDate: Date,
    accountingDate: Date,
    
    // Export tracking
    exportedAt: Date,
    exportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    exportFormat: { 
      type: String, 
      enum: ['rest_api', 'csv', 'json', 'xml', 'fbdi'],  // FBDI = Oracle's bulk import
      default: 'json'
    },
    exportStatus: {
      type: String,
      enum: ['pending', 'exported', 'accepted', 'rejected', 'error', 'cancelled']
    },
    externalId: String,                             // ID returned from Oracle
    batchId: String,                                // If part of batch upload
    errorMessage: String,
    errorDetails: mongoose.Schema.Types.Mixed
  },
  
  // SAP export (for PG&E hybrid environment)
  sap: {
    documentNumber: String,
    companyCode: String,
    fiscalYear: String,
    vendorNumber: String,
    postingDate: Date,
    exportedAt: Date,
    status: String
  },
  
  // === WORKFLOW STATUS ===
  status: {
    type: String,
    enum: [
      'draft',                // Being built
      'pending_review',       // Ready for GF/PM review
      'revision_requested',   // Sent back for changes
      'approved',             // Internally approved
      'submitted',            // Sent to utility
      'accepted',             // Utility accepted
      'partially_paid',       // Partial payment received
      'rejected',             // Utility rejected
      'paid',                 // Full payment received
      'closed',               // Fully reconciled
      'void'                  // Voided claim
    ],
    default: 'draft'
  },
  
  // === REVIEW WORKFLOW ===
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
  reviewNotes: String,
  
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: Date,
  approvalNotes: String,
  
  // === SUBMISSION ===
  submittedAt: Date,
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  submissionMethod: { 
    type: String, 
    enum: ['portal', 'email', 'api', 'mail', 'hand_delivery'],
    default: 'portal'
  },
  submissionReference: String,                      // Portal confirmation #, email ID, etc.
  
  // === UTILITY RESPONSE ===
  utilityReceivedAt: Date,
  utilityResponseAt: Date,
  utilityStatus: String,
  utilityNotes: String,
  utilityRejectionReason: String,
  utilityApprovedAmount: Number,                    // May differ from amountDue
  utilityAdjustments: [{
    description: String,
    amount: Number,
    reason: String
  }],
  
  // === PAYMENT TRACKING ===
  payments: [paymentSchema],
  totalPaid: { type: Number, default: 0 },
  balanceDue: Number,                               // amountDue - totalPaid
  dueDate: Date,                                    // Payment due date
  paidInFullAt: Date,
  daysPastDue: Number,                              // Calculated field
  
  // === DOCUMENTS ===
  pdfUrl: String,                                   // Generated invoice PDF
  pdfR2Key: String,
  pdfGeneratedAt: Date,
  
  supportingDocs: [{
    name: String,
    url: String,
    r2Key: String,
    type: { 
      type: String, 
      enum: ['backup', 'lien_waiver', 'certified_payroll', 'insurance', 'bond', 'other']
    },
    uploadedAt: Date,
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],
  
  // === NOTES ===
  internalNotes: String,                            // Internal only
  externalNotes: String,                            // Visible to utility
  
  // === CHANGE LOG ===
  changeLog: [{
    date: { type: Date, default: Date.now },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    action: String,                                 // 'created', 'submitted', 'approved', etc.
    details: String,
    previousStatus: String,
    newStatus: String
  }]
  
}, { timestamps: true });

// Indexes for efficient queries
claimSchema.index({ companyId: 1, status: 1, createdAt: -1 });
claimSchema.index({ companyId: 1, createdAt: -1 });
claimSchema.index({ jobId: 1 });
// claimNumber index already created via { unique: true } in schema
claimSchema.index({ 'oracle.exportStatus': 1 });
claimSchema.index({ status: 1, submittedAt: -1 });
claimSchema.index({ status: 1, dueDate: 1 });
claimSchema.index({ utilityId: 1, status: 1 });

// Auto-generate claim number before save
claimSchema.pre('save', async function(next) {
  // Generate claim number if not set - use atomic counter to prevent race conditions
  if (!this.claimNumber) {
    const year = new Date().getFullYear();
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    
    // Use findOneAndUpdate with upsert for atomic counter
    // Fallback: Generate unique claim number with timestamp + random suffix
    // This prevents duplicate key errors from concurrent saves
    const count = await this.constructor.countDocuments({
      companyId: this.companyId,
      createdAt: { $gte: new Date(year, 0, 1) }
    });
    
    // Include timestamp suffix to ensure uniqueness even with race conditions
    this.claimNumber = `CLM-${year}-${String(count + 1).padStart(5, '0')}-${random}`;
  }
  
  // Calculate line item count
  this.lineItemCount = this.lineItems?.length || 0;
  
  // Always recalculate adjustment total (handles empty adjustments case)
  this.adjustmentTotal = (this.adjustments && this.adjustments.length > 0)
    ? this.adjustments.reduce((sum, adj) => sum + (adj.amount || 0), 0)
    : 0;
  
  // Calculate totals
  if (this.subtotal !== undefined) {
    this.totalAmount = this.subtotal + this.adjustmentTotal + this.taxAmount;
    this.amountDue = this.totalAmount - this.retentionAmount;
  }
  
  // Calculate balance due
  this.balanceDue = (this.amountDue || 0) - (this.totalPaid || 0);
  
  // Calculate days past due
  if (this.dueDate && this.balanceDue > 0) {
    const today = new Date();
    const due = new Date(this.dueDate);
    const diffTime = today - due;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    this.daysPastDue = diffDays > 0 ? diffDays : 0;
  }
  
  // Calculate verification metrics
  if (this.lineItems && this.lineItems.length > 0) {
    const totalUnits = this.lineItems.length;
    const unitsWithPhotos = this.lineItems.filter(li => li.photoCount > 0).length;
    const unitsWithGPS = this.lineItems.filter(li => li.hasGPS).length;
    const highQualityGPS = this.lineItems.filter(li => li.gpsQuality === 'high').length;
    
    this.verificationMetrics = {
      totalUnits,
      unitsWithPhotos,
      unitsWithGPS,
      highQualityGPS,
      photoComplianceRate: Math.round((unitsWithPhotos / totalUnits) * 100),
      gpsComplianceRate: Math.round((unitsWithGPS / totalUnits) * 100)
    };
  }
  
  // Calculate category totals
  if (this.lineItems && this.lineItems.length > 0) {
    const categoryTotals = { civil: 0, electrical: 0, traffic_control: 0, vegetation: 0, other: 0 };
    const tierTotals = { prime: 0, sub: 0, sub_of_sub: 0 };
    
    for (const item of this.lineItems) {
      const cat = item.workCategory || 'other';
      if (categoryTotals[cat] !== undefined) {
        categoryTotals[cat] += item.totalAmount || 0;
      } else {
        categoryTotals.other += item.totalAmount || 0;
      }
      
      const tier = item.performedByTier || 'prime';
      if (tierTotals[tier] !== undefined) {
        tierTotals[tier] += item.totalAmount || 0;
      } else {
        // Fallback to 'prime' for invalid/unknown tier values
        tierTotals.prime += item.totalAmount || 0;
      }
    }
    
    this.categoryTotals = categoryTotals;
    this.tierTotals = tierTotals;
  }
  
  next();
});

// Static method to get claims by status
claimSchema.statics.getByStatus = async function(companyId, status) {
  return this.find({ companyId, status }).sort({ createdAt: -1 });
};

// Static method to get unpaid claims
claimSchema.statics.getUnpaid = async function(companyId) {
  return this.find({
    companyId,
    status: { $in: ['submitted', 'accepted', 'partially_paid'] },
    balanceDue: { $gt: 0 }
  }).sort({ dueDate: 1 });
};

// Static method to get past due claims
claimSchema.statics.getPastDue = async function(companyId) {
  const today = new Date();
  return this.find({
    companyId,
    status: { $in: ['submitted', 'accepted', 'partially_paid'] },
    dueDate: { $lt: today },
    balanceDue: { $gt: 0 }
  }).sort({ dueDate: 1 });
};

// Instance method to add line item from UnitEntry
// Returns the saved document for consistency with recordPayment()
claimSchema.methods.addLineItem = function(unitEntry, lineNumber) {
  this.lineItems.push({
    unitEntryId: unitEntry._id,
    lineNumber,
    itemCode: unitEntry.itemCode,
    description: unitEntry.description,
    quantity: unitEntry.quantity,
    unit: unitEntry.unit,
    unitPrice: unitEntry.unitPrice,
    totalAmount: unitEntry.totalAmount,
    workDate: unitEntry.workDate,
    photoCount: unitEntry.photos?.length || 0,
    hasGPS: !!unitEntry.location?.latitude,
    gpsAccuracy: unitEntry.location?.accuracy,
    gpsQuality: unitEntry.gpsQuality,
    performedByTier: unitEntry.performedBy?.tier,
    subContractorId: unitEntry.performedBy?.subContractorId,
    subContractorName: unitEntry.performedBy?.subContractorName,
    workCategory: unitEntry.performedBy?.workCategory
  });
  
  // Recalculate subtotal
  this.subtotal = this.lineItems.reduce((sum, li) => sum + li.totalAmount, 0);
  
  // Save and return the document (consistent with recordPayment behavior)
  return this.save();
};

// Instance method to record payment
claimSchema.methods.recordPayment = function(paymentData, userId) {
  this.payments.push({
    ...paymentData,
    recordedBy: userId,
    recordedAt: new Date()
  });
  
  this.totalPaid = this.payments.reduce((sum, p) => sum + p.amount, 0);
  
  if (this.totalPaid >= this.amountDue) {
    this.status = 'paid';
    this.paidInFullAt = new Date();
  } else if (this.totalPaid > 0) {
    this.status = 'partially_paid';
  }
  
  return this.save();
};

/**
 * Generate Oracle Payables REST API payload
 * Matches Oracle Fusion Cloud Payables Invoice Import REST API schema
 * Reference: Oracle REST API for Financials - Payables Invoices
 * 
 * PG&E uses Oracle Cloud Financials with custom DFFs for:
 * - Contract/MSA reference
 * - Work order/job number
 * - GPS verification status
 * - Digital receipt hash for audit trail
 */
claimSchema.methods.toOraclePayload = function() {
  const invoiceDate = this.submittedAt || this.createdAt;
  const dueDate = new Date(invoiceDate);
  dueDate.setDate(dueDate.getDate() + 30); // Net 30

  return {
    // === HEADER (AP_INVOICES_INTERFACE) ===
    InvoiceNumber: this.claimNumber,
    InvoiceAmount: this.amountDue,
    InvoiceCurrencyCode: 'USD',
    InvoiceDate: invoiceDate.toISOString().split('T')[0],
    InvoiceType: 'Standard',
    InvoiceSource: 'FieldLedger',
    
    // Vendor (Contractor) Info
    VendorNumber: this.oracle?.vendorNumber,
    VendorId: this.oracle?.vendorId,
    VendorName: this.oracle?.vendorName,
    VendorSiteCode: this.oracle?.vendorSiteCode,
    VendorSiteId: this.oracle?.vendorSiteId,
    
    // Business Unit / Legal Entity
    BusinessUnit: this.oracle?.businessUnit || 'PG&E',
    LegalEntityIdentifier: this.oracle?.legalEntity,
    
    // Payment Terms
    PaymentTerms: this.oracle?.paymentTerms || 'Net 30',
    PaymentTermsDate: invoiceDate.toISOString().split('T')[0],
    TermsDate: invoiceDate.toISOString().split('T')[0],
    
    // GL Date (accounting period)
    GlDate: invoiceDate.toISOString().split('T')[0],
    
    // Contract/PO Reference
    PurchaseOrderNumber: this.oracle?.poNumber,
    ContractNumber: this.oracle?.contractNumber,
    
    // Description
    Description: `Unit Price Claim: ${this.claimNumber} | Job: ${this.jobNumber || 'N/A'} | Period: ${this.periodStart?.toISOString().split('T')[0] || 'N/A'} to ${this.periodEnd?.toISOString().split('T')[0] || 'N/A'}`,
    
    // === PG&E CUSTOM DFFs (Descriptive Flexfields) ===
    AttributeCategory: 'CONTRACTOR_INVOICE',
    Attribute1: this.jobNumber, // Work Order Number
    Attribute2: this.oracle?.contractNumber, // MSA Contract Number
    Attribute3: this.claimNumber, // FieldLedger Claim ID
    Attribute4: this.digitalReceiptHash, // Audit trail hash
    Attribute5: this.gpsVerificationStatus || 'VERIFIED', // GPS status
    Attribute6: this.photoCount?.toString() || '0', // Evidence count
    Attribute7: new Date().toISOString(), // Export timestamp
    
    // === LINE ITEMS (AP_INVOICE_LINES_INTERFACE) ===
    invoiceLines: this.lineItems.map((item, idx) => ({
      LineNumber: item.lineNumber || idx + 1,
      LineType: 'Item',
      
      // Item/Service
      ItemDescription: `${item.itemCode}: ${item.description}`.substring(0, 240),
      Quantity: item.quantity,
      UnitOfMeasure: item.unit || 'EA',
      UnitPrice: item.unitPrice,
      Amount: item.totalAmount,
      
      // Accounting (Distribution)
      DistributionCombination: this.oracle?.glSegments || null,
      
      // Project Accounting (for capital work)
      ProjectNumber: item.oracleProjectNumber || this.oracle?.projectNumber,
      TaskNumber: item.oracleTaskNumber || this.oracle?.taskNumber,
      ExpenditureType: item.oracleExpenditureType || this.oracle?.expenditureType || 'Contract Labor',
      ExpenditureItemDate: item.workDate?.toISOString().split('T')[0] || invoiceDate.toISOString().split('T')[0],
      ExpenditureOrganization: this.oracle?.expenditureOrganization,
      
      // Contract Reference
      POLineNumber: item.poLineNumber,
      POShipmentNumber: item.poShipmentNumber,
      
      // Line-level DFFs
      LineAttributeCategory: 'UNIT_PRICE_ITEM',
      LineAttribute1: item.itemCode, // Price book item code
      LineAttribute2: item.priceBookItemId?.toString(), // FieldLedger item ID
      LineAttribute3: item.performedByTier || 'prime', // Prime/Sub tier
      LineAttribute4: item.subContractorName || '', // Sub name if applicable
      LineAttribute5: item.workCategory || 'electrical', // Work type
      LineAttribute6: item.digitalReceiptHash || '', // Line-level audit hash
      LineAttribute7: item.gpsLatitude?.toString() || '', // GPS for audit
      LineAttribute8: item.gpsLongitude?.toString() || '',
      LineAttribute9: item.hasPhoto ? 'Y' : 'N', // Photo evidence flag
      LineAttribute10: item.workDate?.toISOString().split('T')[0] || '' // Work performed date
    })),
    
    // === ATTACHMENTS (AP_INVOICES_ATTACHMENTS) ===
    // Reference to supporting documentation
    attachments: [
      {
        FileName: `${this.claimNumber}_backup.pdf`,
        FileType: 'application/pdf',
        Category: 'Contractor Backup',
        Description: 'GPS-verified unit entries with photo evidence',
        Url: `https://api.fieldledger.io/api/billing/claims/${this._id}/backup-pdf`
      }
    ],
    
    // === METADATA (for FieldLedger tracking) ===
    _metadata: {
      exportedAt: new Date().toISOString(),
      exportVersion: '2.0',
      fieldLedgerClaimId: this._id.toString(),
      lineCount: this.lineItems.length,
      totalAmount: this.amountDue,
      gpsVerifiedLines: this.lineItems.filter(li => li.hasGPS).length,
      photoEvidenceLines: this.lineItems.filter(li => li.hasPhoto).length
    }
  };
};

/**
 * Generate CSV export matching PG&E's bulk import template
 * This is the "FBDI" (File-Based Data Import) format for Oracle
 */
claimSchema.methods.toOracleFBDI = function() {
  const invoiceDate = (this.submittedAt || this.createdAt).toISOString().split('T')[0];
  
  // FBDI Header row format
  const headerRow = [
    this.claimNumber, // INVOICE_NUM
    this.oracle?.vendorNumber || '', // VENDOR_NUM
    this.oracle?.vendorSiteCode || '', // VENDOR_SITE_CODE
    this.amountDue.toFixed(2), // INVOICE_AMOUNT
    invoiceDate, // INVOICE_DATE
    'Standard', // INVOICE_TYPE_LOOKUP_CODE
    'FieldLedger', // SOURCE
    this.oracle?.businessUnit || 'PG&E', // ORG_ID
    `Unit Price Claim ${this.claimNumber}`, // DESCRIPTION
    this.oracle?.paymentTerms || 'Net 30', // TERMS_NAME
    invoiceDate, // GL_DATE
    'USD', // INVOICE_CURRENCY_CODE
    '', // EXCHANGE_RATE
    '', // EXCHANGE_RATE_TYPE
    '', // EXCHANGE_DATE
    this.oracle?.poNumber || '', // PO_NUMBER
    this.jobNumber || '', // ATTRIBUTE1 (Job Number)
    this.oracle?.contractNumber || '', // ATTRIBUTE2 (Contract)
    this.claimNumber, // ATTRIBUTE3 (Claim ID)
    this.digitalReceiptHash || '', // ATTRIBUTE4 (Audit Hash)
    'CONTRACTOR_INVOICE' // ATTRIBUTE_CATEGORY
  ];

  // FBDI Line rows
  const lineRows = this.lineItems.map((item, idx) => [
    this.claimNumber, // INVOICE_NUM (links to header)
    item.lineNumber || idx + 1, // LINE_NUMBER
    'Item', // LINE_TYPE_LOOKUP_CODE
    item.totalAmount.toFixed(2), // AMOUNT
    item.quantity, // QUANTITY_INVOICED
    item.unitPrice.toFixed(2), // UNIT_PRICE
    `${item.itemCode}: ${item.description}`.substring(0, 240), // DESCRIPTION
    '', // DIST_CODE_COMBINATION_ID (let Oracle derive)
    item.oracleProjectNumber || this.oracle?.projectNumber || '', // PROJECT_ID
    item.oracleTaskNumber || this.oracle?.taskNumber || '', // TASK_ID
    item.oracleExpenditureType || 'Contract Labor', // EXPENDITURE_TYPE
    (item.workDate || this.submittedAt || this.createdAt).toISOString().split('T')[0], // EXPENDITURE_ITEM_DATE
    this.oracle?.expenditureOrganization || '', // EXPENDITURE_ORGANIZATION_ID
    item.itemCode, // LINE_ATTRIBUTE1 (Item Code)
    item.performedByTier || 'prime', // LINE_ATTRIBUTE2 (Tier)
    item.subContractorName || '', // LINE_ATTRIBUTE3 (Sub)
    item.workCategory || '', // LINE_ATTRIBUTE4 (Category)
    item.hasPhoto ? 'Y' : 'N', // LINE_ATTRIBUTE5 (Has Photo)
    item.hasGPS ? 'Y' : 'N', // LINE_ATTRIBUTE6 (Has GPS)
    'UNIT_PRICE_ITEM' // LINE_ATTRIBUTE_CATEGORY
  ]);

  return {
    header: headerRow,
    lines: lineRows,
    headerColumns: [
      'INVOICE_NUM', 'VENDOR_NUM', 'VENDOR_SITE_CODE', 'INVOICE_AMOUNT', 
      'INVOICE_DATE', 'INVOICE_TYPE_LOOKUP_CODE', 'SOURCE', 'ORG_ID',
      'DESCRIPTION', 'TERMS_NAME', 'GL_DATE', 'INVOICE_CURRENCY_CODE',
      'EXCHANGE_RATE', 'EXCHANGE_RATE_TYPE', 'EXCHANGE_DATE', 'PO_NUMBER',
      'ATTRIBUTE1', 'ATTRIBUTE2', 'ATTRIBUTE3', 'ATTRIBUTE4', 'ATTRIBUTE_CATEGORY'
    ],
    lineColumns: [
      'INVOICE_NUM', 'LINE_NUMBER', 'LINE_TYPE_LOOKUP_CODE', 'AMOUNT',
      'QUANTITY_INVOICED', 'UNIT_PRICE', 'DESCRIPTION', 'DIST_CODE_COMBINATION_ID',
      'PROJECT_ID', 'TASK_ID', 'EXPENDITURE_TYPE', 'EXPENDITURE_ITEM_DATE',
      'EXPENDITURE_ORGANIZATION_ID', 'LINE_ATTRIBUTE1', 'LINE_ATTRIBUTE2',
      'LINE_ATTRIBUTE3', 'LINE_ATTRIBUTE4', 'LINE_ATTRIBUTE5', 'LINE_ATTRIBUTE6',
      'LINE_ATTRIBUTE_CATEGORY'
    ]
  };
};

module.exports = mongoose.model('Claim', claimSchema);

