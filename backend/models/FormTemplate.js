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

// Validation rules per field
const validationRuleSchema = new mongoose.Schema({
  // Required field validation
  required: { type: Boolean, default: false },
  requiredMessage: { type: String, default: 'This field is required' },

  // Format pattern (regex string)
  pattern: { type: String, default: '' },
  patternMessage: { type: String, default: 'Invalid format' },

  // Preset format shortcuts (applied before custom pattern)
  formatPreset: {
    type: String,
    enum: ['none', 'date', 'phone', 'email', 'number', 'zipcode'],
    default: 'none'
  },

  // Length constraints
  minLength: { type: Number, default: 0 },
  maxLength: { type: Number, default: 0 },  // 0 = no limit

  // Numeric range constraints (for number fields)
  min: { type: Number, default: null },
  max: { type: Number, default: null },

  // Cross-field validation references
  // e.g. { field: 'end_date', operator: 'gt', message: 'End date must be after start date' }
  crossFieldRules: [{
    field: { type: String, required: true },    // Other field name to compare against
    operator: {
      type: String,
      enum: ['gt', 'gte', 'lt', 'lte', 'eq', 'neq'],
      required: true
    },
    message: { type: String, default: 'Cross-field validation failed' },
  }],
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
  validation: { type: validationRuleSchema, default: () => ({}) },
}, { _id: false });

// Page dimensions for coordinate mapping
const pageDimensionSchema = new mongoose.Schema({
  page: { type: Number, required: true },
  width: { type: Number, required: true },  // PDF points (72 DPI)
  height: { type: Number, required: true },
}, { _id: false });

// Main FormTemplate schema
const formTemplateSchema = new mongoose.Schema({
  // Note: companyId indexed via compound indexes companyId_1_status_1 and companyId_1_category_1
  companyId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Company', 
    required: true
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

// Preset format regex patterns
const FORMAT_PRESETS = {
  date: /^\d{1,2}\/\d{1,2}\/\d{2,4}$|^\d{4}-\d{2}-\d{2}$/,
  phone: /^\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  number: /^-?\d+(\.\d+)?$/,
  zipcode: /^\d{5}(-\d{4})?$/,
};

/**
 * Validate a set of field values against this template's validation rules.
 *
 * @param {Object} fieldValues - Map of fieldName → value
 * @returns {{ valid: boolean, errors: Array<{ field: string, message: string }> }}
 */
formTemplateSchema.methods.validateFieldValues = function(fieldValues) {
  const errors = [];

  for (const field of this.fields) {
    const rules = field.validation;
    if (!rules) continue;

    const value = fieldValues[field.name];
    const isEmpty = value === null || value === undefined || String(value).trim() === '';

    // Required check
    if ((rules.required || field.required) && isEmpty) {
      errors.push({ field: field.name, message: rules.requiredMessage || 'This field is required' });
      continue; // skip other checks if empty & required
    }

    // Skip remaining validations if empty and not required
    if (isEmpty) continue;

    const strVal = String(value).trim();

    // Format preset check
    if (rules.formatPreset && rules.formatPreset !== 'none') {
      const regex = FORMAT_PRESETS[rules.formatPreset];
      if (regex && !regex.test(strVal)) {
        errors.push({ field: field.name, message: `Invalid ${rules.formatPreset} format` });
      }
    }

    // Custom pattern check
    if (rules.pattern) {
      try {
        const regex = new RegExp(rules.pattern);
        if (!regex.test(strVal)) {
          errors.push({ field: field.name, message: rules.patternMessage || 'Invalid format' });
        }
      } catch {
        // Invalid regex pattern stored — skip
      }
    }

    // Length constraints
    if (rules.minLength > 0 && strVal.length < rules.minLength) {
      errors.push({ field: field.name, message: `Minimum length is ${rules.minLength} characters` });
    }
    if (rules.maxLength > 0 && strVal.length > rules.maxLength) {
      errors.push({ field: field.name, message: `Maximum length is ${rules.maxLength} characters` });
    }

    // Numeric range
    if (rules.min !== null && rules.min !== undefined) {
      const num = Number(value);
      if (!isNaN(num) && num < rules.min) {
        errors.push({ field: field.name, message: `Value must be at least ${rules.min}` });
      }
    }
    if (rules.max !== null && rules.max !== undefined) {
      const num = Number(value);
      if (!isNaN(num) && num > rules.max) {
        errors.push({ field: field.name, message: `Value must be at most ${rules.max}` });
      }
    }

    // Cross-field validation
    if (rules.crossFieldRules?.length > 0) {
      for (const rule of rules.crossFieldRules) {
        const otherValue = fieldValues[rule.field];
        if (otherValue === null || otherValue === undefined) continue;

        const a = Number(value) || new Date(value).getTime();
        const b = Number(otherValue) || new Date(otherValue).getTime();

        if (isNaN(a) || isNaN(b)) continue;

        let passed = true;
        switch (rule.operator) {
          case 'gt':  passed = a > b; break;
          case 'gte': passed = a >= b; break;
          case 'lt':  passed = a < b; break;
          case 'lte': passed = a <= b; break;
          case 'eq':  passed = a === b; break;
          case 'neq': passed = a !== b; break;
          default: break;
        }

        if (!passed) {
          errors.push({ field: field.name, message: rule.message || `Cross-field validation failed with ${rule.field}` });
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
};

const FormTemplate = mongoose.model('FormTemplate', formTemplateSchema);

module.exports = FormTemplate;

