const mongoose = require('mongoose');

/**
 * Routing Rule Schema
 * Defines how different document types get routed to utility systems
 * Rules are utility-specific and can be customized per company
 */
const routingRuleSchema = new mongoose.Schema({
  // Rule identification
  name: {
    type: String,
    required: true
  },
  description: String,
  
  // Scope
  utilityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Utility',
    required: true
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company'
    // If null, applies to all companies for this utility
  },
  
  // Document type this rule applies to
  sectionType: {
    type: String,
    required: true,
    enum: [
      'face_sheet',
      'crew_instructions',
      'crew_materials',
      'equipment_info',
      'feedback_form',
      'construction_sketch',
      'circuit_map',
      'permits',
      'tcp',
      'job_checklist',
      'billing_form',
      'paving_form',
      'ccsc',
      'photos',
      'other'
    ]
  },
  
  // Page range detection (for PDF splitting)
  pageDetection: {
    method: {
      type: String,
      enum: ['fixed_range', 'keyword_search', 'ai_classification', 'header_match'],
      default: 'fixed_range'
    },
    // For fixed_range
    startPage: Number,
    endPage: Number,
    // For keyword_search
    startKeywords: [String],
    endKeywords: [String],
    // For header_match
    headerPattern: String  // Regex pattern
  },
  
  // Destination configuration
  destination: {
    type: {
      type: String,
      required: true,
      enum: [
        'oracle_api',
        'sap_api',
        'sharepoint',
        'email',
        'sftp',
        'gis_api',
        'webhook',
        'archive_only'
      ]
    },
    
    // Oracle configuration
    oracle: {
      endpoint: String,
      module: {
        type: String,
        enum: ['ppm', 'eam', 'payables', 'content_mgmt']
      },
      projectField: String,
      taskField: String,
      documentCategory: String
    },
    
    // SAP configuration
    sap: {
      system: String,       // DEV, QA, PROD
      rfcDestination: String,
      documentType: String,
      objectType: String,   // Equipment, WBS, etc.
    },
    
    // SharePoint configuration
    sharepoint: {
      siteUrl: String,
      libraryName: String,
      folderPath: String,   // Can include {{pmNumber}}, {{jobNumber}} placeholders
      contentType: String
    },
    
    // Email configuration
    email: {
      to: [String],
      cc: [String],
      subjectTemplate: String,  // "As-Built: {{pmNumber}} - {{sectionType}}"
      bodyTemplate: String,
      attachDocument: { type: Boolean, default: true }
    },
    
    // SFTP configuration
    sftp: {
      host: String,
      port: { type: Number, default: 22 },
      username: String,
      // Password stored in secrets manager, referenced by key
      passwordSecretKey: String,
      remotePath: String    // Can include placeholders
    },
    
    // GIS API configuration
    gis: {
      endpoint: String,
      layerId: String,
      updateType: {
        type: String,
        enum: ['attachment', 'feature_update', 'new_feature']
      }
    },
    
    // Webhook configuration
    webhook: {
      url: String,
      method: { type: String, enum: ['POST', 'PUT'], default: 'POST' },
      headers: mongoose.Schema.Types.Mixed,
      payloadTemplate: String  // JSON template
    }
  },
  
  // Metadata mapping
  metadataMapping: [{
    sourceField: String,      // Field from extracted data
    destinationField: String, // Field in destination system
    transform: String,        // Optional: 'uppercase', 'date_format', etc.
    defaultValue: String
  }],
  
  // Conditions for when this rule applies
  conditions: {
    // Only apply if certain fields match
    pmNumberPattern: String,      // Regex
    jobTypeIn: [String],
    workCategoryIn: [String],
    circuitIdPattern: String,
    // Date conditions
    workDateAfter: Date,
    workDateBefore: Date
  },
  
  // Rule settings
  priority: { type: Number, default: 100 },  // Lower = higher priority
  isActive: { type: Boolean, default: true },
  requiresApproval: { type: Boolean, default: false },
  maxRetries: { type: Number, default: 3 },
  retryDelayMinutes: { type: Number, default: 5 },
  
  // Notification settings
  notifications: {
    onSuccess: {
      enabled: { type: Boolean, default: false },
      recipients: [String]
    },
    onFailure: {
      enabled: { type: Boolean, default: true },
      recipients: [String]
    }
  },
  
  // Audit
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes
routingRuleSchema.index({ utilityId: 1, sectionType: 1, isActive: 1 });
routingRuleSchema.index({ utilityId: 1, companyId: 1, isActive: 1 });
routingRuleSchema.index({ priority: 1 });

// Get active rules for a utility/company/section type
routingRuleSchema.statics.getApplicableRules = async function(utilityId, companyId, sectionType) {
  const rules = await this.find({
    utilityId,
    sectionType,
    isActive: true,
    $or: [
      { companyId: null },        // Utility-wide rules
      { companyId: companyId }    // Company-specific rules
    ]
  }).sort({ priority: 1 });
  
  return rules;
};

/**
 * Check if a single condition passes
 */
function checkCondition(conditionValue, dataValue, checkFn) {
  if (!conditionValue || !dataValue) return true;
  return checkFn(conditionValue, dataValue);
}

/**
 * Safely test a regex pattern with ReDoS protection
 * Limits input length and uses simple pattern validation
 * @param {string} pattern - The regex pattern to test
 * @param {string} input - The input string to test against
 * @returns {boolean} - Whether the pattern matches
 */
function safeRegexTest(pattern, input) {
  // Limit input length to prevent DoS
  const MAX_INPUT_LENGTH = 1000;
  const safeInput = String(input).slice(0, MAX_INPUT_LENGTH);
  
  // Reject obviously dangerous patterns (nested quantifiers)
  // Patterns like (a+)+, (a*)+, (a+)*, etc.
  const dangerousPatterns = /\([^)]*[+*][^)]*\)[+*]|\([^)]*\|[^)]*\)[+*]/;
  if (dangerousPatterns.test(pattern)) {
    console.warn('Rejected potentially dangerous regex pattern:', pattern);
    return false;
  }
  
  try {
    const regex = new RegExp(pattern);
    return regex.test(safeInput);
  } catch (err) {
    console.warn('Invalid regex pattern:', pattern, err.message);
    return false;
  }
}

/**
 * Transform mapping functions for metadata
 */
const transformFunctions = {
  uppercase: (v) => String(v).toUpperCase(),
  lowercase: (v) => String(v).toLowerCase(),
  date_format: (v) => new Date(v).toISOString().split('T')[0],
  trim: (v) => String(v).trim()
};

// Evaluate conditions
routingRuleSchema.methods.evaluateConditions = function(submissionData) {
  const { conditions } = this;
  if (!conditions) return true;
  
  // PM Number pattern check (using safe regex to prevent ReDoS)
  if (!checkCondition(conditions.pmNumberPattern, submissionData.pmNumber, 
    (pattern, pm) => safeRegexTest(pattern, pm))) return false;
  
  // Job type check  
  if (!checkCondition(conditions.jobTypeIn?.length, submissionData.jobType,
    () => conditions.jobTypeIn.includes(submissionData.jobType))) return false;
  
  // Work category check
  if (!checkCondition(conditions.workCategoryIn?.length, submissionData.workCategory,
    () => conditions.workCategoryIn.includes(submissionData.workCategory))) return false;
  
  // Date range checks
  if (!checkCondition(conditions.workDateAfter, submissionData.workDate,
    (after, date) => new Date(date) >= new Date(after))) return false;
  if (!checkCondition(conditions.workDateBefore, submissionData.workDate,
    (before, date) => new Date(date) <= new Date(before))) return false;
  
  return true;
};

// Apply metadata mapping
routingRuleSchema.methods.applyMetadataMapping = function(sourceData) {
  const result = {};
  
  for (const mapping of this.metadataMapping || []) {
    let value = sourceData[mapping.sourceField] ?? mapping.defaultValue;
    
    // Apply transform if value exists and transform is defined
    const transformFn = value && mapping.transform ? transformFunctions[mapping.transform] : null;
    if (transformFn) value = transformFn(value);
    
    if (value !== undefined) {
      result[mapping.destinationField] = value;
    }
  }
  
  return result;
};

module.exports = mongoose.model('RoutingRule', routingRuleSchema);

