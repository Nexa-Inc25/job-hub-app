/**
 * FieldLedger - PriceBook Model
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Stores utility contract rates (Schedule of Values) for unit-price billing.
 * Supports rate versioning, Oracle/SAP mapping, and category filtering for mobile UI.
 */

const mongoose = require('mongoose');

// Individual rate item schema
const priceBookItemSchema = new mongoose.Schema({
  // Identification
  itemCode: { type: String, required: true },      // "UG-TRENCH-001", "OH-POLE-SET-001"
  description: { type: String, required: true },   // "Trenching - Normal Soil (0-24\")"
  shortDescription: String,                         // "Trench Normal" (for mobile UI)
  
  // Categorization (for foreman UI filtering)
  category: { 
    type: String, 
    enum: ['civil', 'electrical', 'overhead', 'underground', 'traffic_control', 'vegetation', 'emergency', 'other'],
    required: true 
  },
  subcategory: String,                              // "Trenching", "Pole Work", "Conduit"
  workType: String,                                 // "New Construction", "Maintenance", "Repair"
  
  // Unit and pricing
  unit: { type: String, required: true },          // "LF", "EA", "HR", "CY", "SF"
  unitPrice: { type: Number, required: true },     // Contract rate
  
  // Cost breakdown (for detailed reporting)
  laborRate: Number,                                // Labor portion per unit
  materialRate: Number,                             // Material portion per unit
  equipmentRate: Number,                            // Equipment portion per unit
  
  // Flags
  laborIncluded: { type: Boolean, default: true },
  materialIncluded: { type: Boolean, default: false },
  requiresPhoto: { type: Boolean, default: true }, // Must have photo verification
  requiresGPS: { type: Boolean, default: true },   // Must have GPS stamp
  minQuantity: Number,                              // Minimum billable quantity
  maxQuantity: Number,                              // Maximum per entry (sanity check)
  
  // Oracle/ERP mapping
  oracleItemId: String,                             // Oracle item master ID
  oracleExpenseAccount: String,                     // GL account code
  oracleExpenditureType: String,                    // Oracle Project expenditure type
  sapMaterialNumber: String,                        // SAP material number
  sapGLAccount: String,                             // SAP GL account
  
  // Status
  isActive: { type: Boolean, default: true },
  effectiveDate: Date,
  expirationDate: Date,
  
  // Audit
  notes: String
});

// Main PriceBook schema
const priceBookSchema = new mongoose.Schema({
  // Ownership
  utilityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Utility', required: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  
  // Identification
  name: { type: String, required: true },          // "PG&E MSA 2026 Rates"
  description: String,
  contractNumber: String,                           // Master Service Agreement #
  version: { type: Number, default: 1 },           // Increment on rate updates
  
  // Validity period
  effectiveDate: { type: Date, required: true },
  expirationDate: Date,
  
  // Rate items
  items: [priceBookItemSchema],
  
  // Summary stats (denormalized for quick display)
  itemCount: { type: Number, default: 0 },
  categoryBreakdown: {
    civil: { type: Number, default: 0 },
    electrical: { type: Number, default: 0 },
    overhead: { type: Number, default: 0 },
    underground: { type: Number, default: 0 },
    traffic_control: { type: Number, default: 0 },
    vegetation: { type: Number, default: 0 },
    emergency: { type: Number, default: 0 },
    other: { type: Number, default: 0 }
  },
  
  // Import tracking
  importSource: { 
    type: String, 
    enum: ['csv_upload', 'excel_upload', 'api_sync', 'manual', 'copy'],
    default: 'manual'
  },
  importedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  importedAt: Date,
  originalFileName: String,                         // For audit trail
  importErrors: [{
    row: Number,
    field: String,
    message: String
  }],
  
  // Status
  status: { 
    type: String, 
    enum: ['draft', 'active', 'superseded', 'archived'],
    default: 'draft'
  },
  activatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  activatedAt: Date,
  
  // Supersession tracking (when rates update)
  supersededBy: { type: mongoose.Schema.Types.ObjectId, ref: 'PriceBook' },
  supersedes: { type: mongoose.Schema.Types.ObjectId, ref: 'PriceBook' },
  
  // Notes
  internalNotes: String,
  changeLog: [{
    date: { type: Date, default: Date.now },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    action: String,                                 // "created", "updated", "activated", etc.
    details: String
  }]
  
}, { timestamps: true });

// Indexes for efficient queries
priceBookSchema.index({ utilityId: 1, companyId: 1, status: 1 });
priceBookSchema.index({ companyId: 1, status: 1, effectiveDate: -1 });
priceBookSchema.index({ 'items.itemCode': 1 });
priceBookSchema.index({ 'items.category': 1 });
priceBookSchema.index({ effectiveDate: 1, expirationDate: 1 });

// Pre-save hook to update stats
priceBookSchema.pre('save', function(next) {
  // Always reset category breakdown to zeros first
  const breakdown = {
    civil: 0, electrical: 0, overhead: 0, underground: 0,
    traffic_control: 0, vegetation: 0, emergency: 0, other: 0
  };
  
  // Always update itemCount (handles empty items case)
  this.itemCount = this.items?.length || 0;
  
  // Count categories if items exist
  if (this.items && this.items.length > 0) {
    for (const item of this.items) {
      if (item.category && breakdown[item.category] !== undefined) {
        breakdown[item.category]++;
      }
    }
  }
  
  this.categoryBreakdown = breakdown;
  next();
});

// Static method to get active price book for a company/utility
priceBookSchema.statics.getActive = async function(companyId, utilityId) {
  return this.findOne({
    companyId,
    utilityId,
    status: 'active',
    effectiveDate: { $lte: new Date() },
    $or: [
      { expirationDate: null },
      { expirationDate: { $gte: new Date() } }
    ]
  }).sort({ effectiveDate: -1 });
};

// Static method to find item by code
priceBookSchema.statics.findItemByCode = async function(companyId, utilityId, itemCode) {
  const priceBook = await this.getActive(companyId, utilityId);
  if (!priceBook) return null;
  
  return priceBook.items.find(item => item.itemCode === itemCode && item.isActive);
};

// Instance method to get items by category
priceBookSchema.methods.getItemsByCategory = function(category) {
  return this.items.filter(item => item.category === category && item.isActive);
};

// Instance method to search items
priceBookSchema.methods.searchItems = function(query) {
  const lowerQuery = query.toLowerCase();
  return this.items.filter(item => 
    item.isActive && (
      item.itemCode.toLowerCase().includes(lowerQuery) ||
      item.description.toLowerCase().includes(lowerQuery) ||
      item.shortDescription?.toLowerCase().includes(lowerQuery)
    )
  );
};

module.exports = mongoose.model('PriceBook', priceBookSchema);

