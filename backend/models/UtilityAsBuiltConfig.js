/**
 * FieldLedger - Utility As-Built Configuration
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Per-utility configuration that drives the As-Built wizard.
 * PG&E (TD-2051P-10) is the first config; each utility gets its own
 * without any code changes to the wizard engine.
 * 
 * What lives here (not in code):
 *  - Page ranges for PDF splitting
 *  - Required documents by work type
 *  - Completion checklist items (CCSC equivalent)
 *  - Symbol library metadata
 *  - SAP naming conventions
 *  - Completion field requirements
 *  - Validation rules
 *  - Color conventions for markup
 */

const mongoose = require('mongoose');

// ------------------------------------------------------------------
// Sub-schemas
// ------------------------------------------------------------------

/** Page range for a document section within a job package PDF */
const pageRangeSchema = new mongoose.Schema({
  sectionType: {
    type: String,
    required: true,
  },
  label: { type: String, required: true },
  start: { type: Number, required: true },
  end: { type: Number, required: true },
  // Some utilities have variable page counts for certain sections
  variableLength: { type: Boolean, default: false },
  // Keyword to detect section start if variableLength
  detectionKeyword: { type: String },
}, { _id: false });

/** Work type definition — what documents are required for each type of work */
const workTypeSchema = new mongoose.Schema({
  code: { type: String, required: true },
  label: { type: String, required: true },
  description: { type: String },
  // Which document sections the foreman must complete for this work type
  requiredDocs: [{ type: String }],
  // Which document sections are optional but recommended
  optionalDocs: [{ type: String }],
  // Does this work type require construction sketch markup?
  requiresSketchMarkup: { type: Boolean, default: true },
  // Can the foreman mark "Built As Designed" to skip redlines?
  allowBuiltAsDesigned: { type: Boolean, default: true },
}, { _id: false });

/** Single checklist item (e.g., one line on the CCSC form) */
const checklistItemSchema = new mongoose.Schema({
  number: { type: Number, required: true },
  text: { type: String, required: true },
  // Which work scopes this item applies to (empty = all)
  applicableScopes: [{ type: String }],
  // Is this a safety-critical item that must be explicitly addressed?
  safetyCritical: { type: Boolean, default: false },
}, { _id: false });

/** Checklist section (e.g., "Overhead" or "Underground" on CCSC) */
const checklistSectionSchema = new mongoose.Schema({
  code: { type: String, required: true },
  label: { type: String, required: true },
  items: [checklistItemSchema],
}, { _id: false });

/** Completion checklist configuration (e.g., PG&E CCSC TD-2504P-01-F01) */
const checklistConfigSchema = new mongoose.Schema({
  formId: { type: String, required: true },
  formName: { type: String, required: true },
  version: { type: String },
  sections: [checklistSectionSchema],
  // Does the checklist require crew lead signature?
  requiresCrewLeadSignature: { type: Boolean, default: true },
  // Does the checklist require supervisor signature?
  requiresSupervisorSignature: { type: Boolean, default: false },
  requiresComments: { type: Boolean, default: false },
}, { _id: false });

/** Symbol definition for construction sketch markup */
const symbolSchema = new mongoose.Schema({
  code: { type: String, required: true },
  label: { type: String, required: true },
  category: {
    type: String,
    required: true,
    // Common categories across utilities
    enum: ['structure', 'device', 'conductor', 'land', 'service', 'underground', 'marker'],
  },
  // SVG path data for rendering the symbol
  svgPath: { type: String, required: true },
  // Symbol dimensions (viewBox)
  width: { type: Number, default: 32 },
  height: { type: Number, default: 32 },
  // Can this symbol be used in each color mode?
  allowedColors: {
    type: [String],
    default: ['red', 'blue', 'black'],
    enum: ['red', 'blue', 'black'],
  },
  // Sort order within category
  sortOrder: { type: Number, default: 0 },
}, { _id: false });

/** Symbol library configuration */
const symbolLibrarySchema = new mongoose.Schema({
  standardId: { type: String, required: true }, // e.g., "TD-9213S"
  standardName: { type: String },
  version: { type: String },
  symbols: [symbolSchema],
}, { _id: false });

/** Position on a PDF page for auto-stamping a field value */
const fieldPositionSchema = new mongoose.Schema({
  pageOffset: { type: Number, default: 0 },     // Which page within the section (0 = first)
  x: { type: Number, required: true },           // Points from left edge
  y: { type: Number, required: true },           // Points from bottom edge (PDF coords)
  width: { type: Number, default: 200 },         // Max width of text box
  height: { type: Number, default: 14 },         // Height (used for signatures/checkboxes)
  fontSize: { type: Number, default: 10 },       // Font size for stamped text
  align: { type: String, enum: ['left', 'center', 'right'], default: 'left' },
}, { _id: false });

/** Zoom region — the area of the PDF page shown to the foreman during guided fill */
const zoomRegionSchema = new mongoose.Schema({
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  width: { type: Number, required: true },
  height: { type: Number, required: true },
}, { _id: false });

/** Completion field configuration — what the foreman fills on each form */
const completionFieldSchema = new mongoose.Schema({
  fieldName: { type: String, required: true },
  label: { type: String, required: true },
  type: {
    type: String,
    enum: ['text', 'date', 'number', 'signature', 'checkbox', 'select', 'lanId'],
    default: 'text',
  },
  required: { type: Boolean, default: false },
  // Auto-fill source from job data (dot-path, e.g., "job.pmNumber")
  autoFillFrom: { type: String },
  // For select type
  options: [{ type: String }],
  // Position on the PDF page for auto-stamping (Phase 1)
  position: fieldPositionSchema,
  // Zoom region shown in the guided fill UI (Phase 3)
  zoomRegion: zoomRegionSchema,
  // Help text shown to foreman during guided fill
  helpText: { type: String },
}, { _id: false });

/** Document completion configuration */
const documentCompletionSchema = new mongoose.Schema({
  sectionType: { type: String, required: true },
  label: { type: String, required: true },
  fields: [completionFieldSchema],
}, { _id: false });

/**
 * FDA Grid Map - maps equipment selections to checkbox positions on the FDA sheet.
 * The FDA form is a large matrix: rows = (category + condition), columns = (action + New/Priority/Comp).
 * Instead of defining hundreds of individual fields, we define the grid structure
 * so the stamp engine can compute the position from the foreman's selections.
 */
const fdaGridColumnSchema = new mongoose.Schema({
  columnName: { type: String, required: true },  // e.g., 'Repair', 'Replace', 'Install', 'Adjust'
  x: { type: Number, required: true },           // X position of this column's checkbox
}, { _id: false });

const fdaGridRowSchema = new mongoose.Schema({
  category: { type: String, required: true },     // e.g., 'Anchor', 'Conductor', 'Ground', 'Pole'
  condition: { type: String, required: true },     // e.g., 'Broken/Damaged', 'Missing', 'Corroded'
  y: { type: Number, required: true },            // Y position of this row
}, { _id: false });

const fdaGridCheckboxSchema = new mongoose.Schema({
  label: { type: String, required: true },         // e.g., 'New', 'Priority', 'Comp'
  xOffset: { type: Number, required: true },       // X offset from action column
}, { _id: false });

const fdaGridSchema = new mongoose.Schema({
  pageOffset: { type: Number, default: 1 },       // Which page the FDA grid is on (usually page 2 of EC tag)
  checkboxSize: { type: Number, default: 10 },    // Size of each checkbox in points
  // The grid columns (actions): Repair, Replace, Install, Adjust, etc.
  actionColumns: [fdaGridColumnSchema],
  // Status checkboxes after each action: New, Priority, Comp
  statusCheckboxes: [fdaGridCheckboxSchema],
  // All rows in the grid: (category, condition) → y position
  rows: [fdaGridRowSchema],
  // Emergency cause checkboxes (bottom-left of form)
  emergencyCauses: [{
    label: { type: String, required: true },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
  }],
}, { _id: false });

/** Validation rule */
const validationRuleSchema = new mongoose.Schema({
  code: { type: String, required: true },
  description: { type: String, required: true },
  // What to validate
  target: { type: String, required: true }, // e.g., "sketch_markup", "ccsc_signature"
  // Rule type
  rule: {
    type: String,
    required: true,
    enum: [
      'required',
      'required_unless', // requires `condition` field
      'min_count',       // requires `minValue` field
      'signature_required',
      'photo_required',
      'gps_required',
    ],
  },
  condition: { type: String },   // For 'required_unless' rules
  minValue: { type: Number },    // For 'min_count' rules
  severity: {
    type: String,
    enum: ['error', 'warning'],
    default: 'error',
  },
}, { _id: false });

/** SAP naming convention pattern */
const namingConventionSchema = new mongoose.Schema({
  documentType: { type: String, required: true },
  // Pattern with placeholders: {PM}, {NOTIF}, {DOC_TYPE}, {REV}, {DATE}
  pattern: { type: String, required: true },
  example: { type: String },
}, { _id: false });

/** Color convention for markup */
const colorConventionSchema = new mongoose.Schema({
  color: {
    type: String,
    required: true,
    enum: ['red', 'blue', 'black'],
  },
  hex: { type: String, required: true },
  label: { type: String, required: true },
  meaning: { type: String, required: true },
  // Keyboard shortcut
  shortcut: { type: String },
}, { _id: false });

// ------------------------------------------------------------------
// Main schema
// ------------------------------------------------------------------

const utilityAsBuiltConfigSchema = new mongoose.Schema({
  // Which utility this config belongs to
  utilityName: {
    type: String,
    required: true,
    index: true,
  },
  utilityCode: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },

  // Procedure reference
  procedureId: { type: String },       // e.g., "TD-2051P-10"
  procedureName: { type: String },     // e.g., "As-Built Procedure"
  procedureVersion: { type: String },  // e.g., "Rev 0"
  effectiveDate: { type: Date },

  // Active/inactive
  isActive: { type: Boolean, default: true },

  // ---- Configuration sections ----

  /** PDF page ranges for job package splitting */
  pageRanges: [pageRangeSchema],

  /** Work types and their required documents */
  workTypes: [workTypeSchema],

  /** Completion checklist (CCSC or equivalent) */
  checklist: checklistConfigSchema,

  /** Symbol library for construction sketch markup */
  symbolLibrary: symbolLibrarySchema,

  /** Document completion field requirements */
  documentCompletions: [documentCompletionSchema],

  /** FDA grid checkbox mapping (for EC tag FDA sheet) */
  fdaGrid: fdaGridSchema,

  /** UTVAC / pre-submission validation rules */
  validationRules: [validationRuleSchema],

  /** SAP naming conventions */
  namingConventions: [namingConventionSchema],

  /** Color conventions for redline/blueline markup */
  colorConventions: [colorConventionSchema],

  /** Required document order for the final assembled package */
  documentOrder: [{ type: String }],

  // Metadata
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
});

// ------------------------------------------------------------------
// Methods
// ------------------------------------------------------------------

/**
 * Get required documents for a given work type
 */
utilityAsBuiltConfigSchema.methods.getRequiredDocs = function (workTypeCode) {
  const workType = this.workTypes.find(wt => wt.code === workTypeCode);
  if (!workType) return [];
  return workType.requiredDocs;
};

/**
 * Get page range for a section type
 */
utilityAsBuiltConfigSchema.methods.getPageRange = function (sectionType) {
  const range = this.pageRanges.find(pr => pr.sectionType === sectionType);
  return range || null;
};

/**
 * Get symbols for a category
 */
utilityAsBuiltConfigSchema.methods.getSymbolsByCategory = function (category) {
  if (!this.symbolLibrary?.symbols) return [];
  return this.symbolLibrary.symbols
    .filter(s => s.category === category)
    .sort((a, b) => a.sortOrder - b.sortOrder);
};

/**
 * Get all symbol categories
 */
utilityAsBuiltConfigSchema.methods.getSymbolCategories = function () {
  if (!this.symbolLibrary?.symbols) return [];
  const categories = [...new Set(this.symbolLibrary.symbols.map(s => s.category))];
  return categories;
};

/**
 * Validate a submission against this config's rules
 * Returns { valid, errors, warnings }
 */
utilityAsBuiltConfigSchema.methods.validateSubmission = function (submissionData) {
  const errors = [];
  const warnings = [];

  for (const rule of this.validationRules) {
    const value = submissionData[rule.target];

    switch (rule.rule) {
      case 'required':
        if (!value) {
          (rule.severity === 'error' ? errors : warnings).push({
            code: rule.code,
            message: rule.description,
          });
        }
        break;

      case 'required_unless':
        if (!value && !submissionData[rule.condition]) {
          (rule.severity === 'error' ? errors : warnings).push({
            code: rule.code,
            message: rule.description,
          });
        }
        break;

      case 'min_count':
        if (!value || (Array.isArray(value) ? value.length : value) < rule.minValue) {
          (rule.severity === 'error' ? errors : warnings).push({
            code: rule.code,
            message: rule.description,
          });
        }
        break;

      case 'signature_required':
      case 'photo_required':
      case 'gps_required':
        if (!value) {
          (rule.severity === 'error' ? errors : warnings).push({
            code: rule.code,
            message: rule.description,
          });
        }
        break;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
};

// ------------------------------------------------------------------
// Statics
// ------------------------------------------------------------------

/**
 * Find active config for a utility
 */
utilityAsBuiltConfigSchema.statics.findByUtilityCode = function (code) {
  return this.findOne({ utilityCode: code, isActive: true });
};

module.exports = mongoose.model('UtilityAsBuiltConfig', utilityAsBuiltConfigSchema);

