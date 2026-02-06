/**
 * FieldLedger - FormTemplate Model (SmartForms)
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Stores PDF template metadata, field definitions, and data mappings
 * for the SmartForms utility form filling system.
 */

const mongoose = require('mongoose');

// Field bounds definition (PDF coordinate system, origin bottom-left)
const fieldBoundsSchema = new mongoose.Schema({
  x: { type: Number, required: true },      // X position in PDF points
  y: { type: Number, required: true },      // Y position in PDF points  
  width: { type: Number, required: true },  // Field width in PDF points
  height: { type: Number, required: true }, // Field height in PDF points
}, { _id: false });

// Individual form field definition
const formFieldSchema = new mongoose.Schema({
  id: { type: String, required: true },           // Unique field identifier (e.g., "field_1")
  name: { type: String, required: true },         // Internal name (e.g., "contractor_name")
  label: { type: String },                        // Display label for UI
  page: { type: Number, required: true, min: 1 }, // Page number (1-indexed)
  type: { 
    type: String, 
    enum: ['text', 'date', 'checkbox', 'signature', 'number'],
    default: 'text'
  },
  bounds: { type: fieldBoundsSchema, required: true },
  fontSize: { type: Number, default: 10 },
  fontColor: { type: String, default: '#000000' },
  required: { type: Boolean, default: false },
  defaultValue: { type: String },
  dateFormat: { type: String, default: 'MM/DD/YYYY' }, // For date fields
}, { _id: false });

// Page dimensions for coordinate mapping
const pageDimensionSchema = new mongoose.Schema({
  page: { type: Number, required: true },
  width: { type: Number, required: true },  // PDF points (72 DPI)
  height: { type: Number, required: true },
}, { _id: false });

// Main FormTemplate schema
const formTemplateSchema = new mongoose.Schema({
  companyId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Company', 
    required: true,
    index: true
  },
  
  // Template metadata
  name: { type: String, required: true },
  description: { type: String },
  category: { 
    type: String, 
    enum: ['permits', 'compliance', 'billing', 'safety', 'utility', 'other'],
    default: 'other'
  },
  
  // Source PDF file
  sourceFile: {
    r2Key: { type: String, required: true },     // R2 storage key
    originalName: { type: String },               // Original filename
    pageCount: { type: Number, default: 1 },
    pageDimensions: [pageDimensionSchema],
    uploadedAt: { type: Date, default: Date.now },
  },
  
  // Field definitions (drawn by admin)
  fields: [formFieldSchema],
  
  // Data mappings: field name -> FieldLedger data path
  // e.g., { "contractor_name": "company.name", "job_address": "job.address" }
  dataMappings: {
    type: Map,
    of: String,
    default: new Map()
  },
  
  // Template status
  status: { 
    type: String, 
    enum: ['draft', 'active', 'archived'],
    default: 'draft',
    index: true
  },
  
  // Versioning
  version: { type: Number, default: 1 },
  
  // Usage stats
  fillCount: { type: Number, default: 0 },
  lastFilledAt: { type: Date },
  
  // Audit fields
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  // Demo sandbox flags
  isDemo: { type: Boolean, default: false },
  demoSessionId: { type: String, index: true },
  
}, { timestamps: true });

// Indexes for common queries
formTemplateSchema.index({ companyId: 1, status: 1 });
formTemplateSchema.index({ companyId: 1, category: 1 });
formTemplateSchema.index({ name: 'text', description: 'text' });

// Virtual for getting field count
formTemplateSchema.virtual('fieldCount').get(function() {
  return this.fields?.length || 0;
});

// Pre-save validation
formTemplateSchema.pre('save', function(next) {
  // Ensure unique field IDs within template
  if (this.fields && this.fields.length > 0) {
    const fieldIds = this.fields.map(f => f.id);
    const uniqueIds = new Set(fieldIds);
    if (fieldIds.length !== uniqueIds.size) {
      return next(new Error('Field IDs must be unique within a template'));
    }
  }
  next();
});

// Method to increment fill count
formTemplateSchema.methods.recordFill = async function() {
  this.fillCount += 1;
  this.lastFilledAt = new Date();
  await this.save();
};

// Static method to find active templates for a company
formTemplateSchema.statics.findActiveForCompany = function(companyId) {
  return this.find({ 
    companyId, 
    status: 'active' 
  }).sort({ name: 1 });
};

const FormTemplate = mongoose.model('FormTemplate', formTemplateSchema);

module.exports = FormTemplate;

