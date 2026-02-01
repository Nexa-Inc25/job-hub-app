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

// Evaluate conditions
routingRuleSchema.methods.evaluateConditions = function(submissionData) {
  const { conditions } = this;
  if (!conditions) return true;
  
  // PM Number pattern
  if (conditions.pmNumberPattern && submissionData.pmNumber) {
    const regex = new RegExp(conditions.pmNumberPattern);
    if (!regex.test(submissionData.pmNumber)) return false;
  }
  
  // Job type
  if (conditions.jobTypeIn?.length > 0 && submissionData.jobType) {
    if (!conditions.jobTypeIn.includes(submissionData.jobType)) return false;
  }
  
  // Work category
  if (conditions.workCategoryIn?.length > 0 && submissionData.workCategory) {
    if (!conditions.workCategoryIn.includes(submissionData.workCategory)) return false;
  }
  
  // Date conditions
  if (conditions.workDateAfter && submissionData.workDate) {
    if (new Date(submissionData.workDate) < new Date(conditions.workDateAfter)) return false;
  }
  if (conditions.workDateBefore && submissionData.workDate) {
    if (new Date(submissionData.workDate) > new Date(conditions.workDateBefore)) return false;
  }
  
  return true;
};

// Apply metadata mapping
routingRuleSchema.methods.applyMetadataMapping = function(sourceData) {
  const result = {};
  
  for (const mapping of this.metadataMapping || []) {
    let value = sourceData[mapping.sourceField];
    
    // Apply default if no value
    if (value === undefined || value === null) {
      value = mapping.defaultValue;
    }
    
    // Apply transform
    if (value && mapping.transform) {
      switch (mapping.transform) {
        case 'uppercase':
          value = String(value).toUpperCase();
          break;
        case 'lowercase':
          value = String(value).toLowerCase();
          break;
        case 'date_format':
          value = new Date(value).toISOString().split('T')[0];
          break;
        case 'trim':
          value = String(value).trim();
          break;
      }
    }
    
    if (value !== undefined) {
      result[mapping.destinationField] = value;
    }
  }
  
  return result;
};

module.exports = mongoose.model('RoutingRule', routingRuleSchema);

