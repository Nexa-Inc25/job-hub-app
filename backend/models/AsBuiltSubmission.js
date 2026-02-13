/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
const mongoose = require('mongoose');

/**
 * Document Section Schema
 * Represents a single extracted section from an as-built package
 */
const documentSectionSchema = new mongoose.Schema({
  // Section identification
  sectionType: {
    type: String,
    required: true,
    enum: [
      'face_sheet',           // PGE Face Sheet (pages 1-3)
      'crew_instructions',    // Crew Instructions (pages 4-6)
      'crew_materials',       // Crew Materials (page 7)
      'equipment_info',       // Electric Equipment/Pole Info (pages 8-9)
      'feedback_form',        // Construction Feedback Form (page 10)
      'construction_sketch',  // Construction Sketch / As-Built Drawing (pages 11-14)
      'circuit_map',          // Circuit Map Change Sheet (page 15)
      'permits',              // City Permits (pages 16-21)
      'tcp',                  // Traffic Control Plan (pages 22-23)
      'job_checklist',        // Electric Job Package Checklist (page 24)
      'billing_form',         // Pole Replacement Progress Billing (page 27)
      'paving_form',          // Field Paving Form (pages 28-29)
      'ccsc',                 // Construction Completion Standards Checklist (pages 32-33)
      'photos',               // Completion Photos
      'other'                 // Unclassified
    ]
  },
  
  // Source information
  pageStart: { type: Number },
  pageEnd: { type: Number },
  pageCount: { type: Number },
  
  // Extracted file
  fileKey: { type: String },      // R2/S3 key for extracted PDF
  fileUrl: { type: String },      // Presigned URL (temporary)
  fileSize: { type: Number },
  fileHash: { type: String },     // SHA-256 for integrity
  
  // Extracted metadata
  extractedData: {
    pmNumber: String,
    jobNumber: String,
    workOrderNumber: String,
    circuitId: String,
    poleIds: [String],
    transformerIds: [String],
    meterNumbers: [String],
    gpsCoordinates: [{
      latitude: Number,
      longitude: Number,
      description: String
    }],
    workDate: Date,
    crewInfo: String,
    notes: String
  },
  
  // Classification confidence
  classificationMethod: {
    type: String,
    enum: ['ai', 'rule_based', 'page_range', 'manual'],
    default: 'rule_based'
  },
  classificationConfidence: { type: Number, min: 0, max: 1 },
  
  // Routing destination
  destination: {
    type: String,
    enum: [
      'oracle_ppm',           // Oracle Project Portfolio Management
      'oracle_eam',           // Oracle Enterprise Asset Management
      'oracle_payables',      // Oracle Accounts Payable
      'gis_esri',             // ESRI GIS System
      'sharepoint_do',        // District Office SharePoint
      'sharepoint_permits',   // Permits SharePoint
      'sharepoint_utcs',      // UTCS/Safety SharePoint
      'email_mapping',        // Email to Mapping Department
      'email_do',             // Email to District Office
      'email_permits',        // Email to Permits
      'email_compliance',     // Email to Compliance
      'email_estimating',     // Email to Estimating/Design (for redlines/bluelines)
      'regulatory_portal',    // CPUC/Regulatory Portal
      'archive',              // Long-term archive only
      'pending',              // Not yet routed
      'manual_review'         // Needs human review
    ],
    default: 'pending'
  },
  
  // Delivery status
  deliveryStatus: {
    type: String,
    enum: ['pending', 'queued', 'sending', 'delivered', 'acknowledged', 'failed', 'skipped'],
    default: 'pending'
  },
  deliveryAttempts: { type: Number, default: 0 },
  deliveredAt: Date,
  deliveryError: String,
  externalReferenceId: String,  // ID from destination system
  
  // Timestamps
  extractedAt: { type: Date, default: Date.now },
  classifiedAt: Date,
  routedAt: Date
});

/**
 * As-Built Submission Schema
 * Represents a complete as-built package submission
 */
const asBuiltSubmissionSchema = new mongoose.Schema({
  // Submission identification (auto-generated in pre-save hook)
  submissionId: {
    type: String,
    unique: true
  },
  
  // Company and job reference
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    required: true
  },
  utilityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Utility'
    // Optional - will use job's utilityId or default PG&E utility
  },
  
  // Job identifiers
  pmNumber: { type: String, required: true },
  jobNumber: String,
  workOrderNumber: String,
  circuitId: String,
  
  // Original package
  originalFile: {
    key: String,              // R2/S3 key
    url: String,              // Presigned URL
    filename: String,
    size: Number,
    hash: String,             // SHA-256
    pageCount: Number,
    uploadedAt: { type: Date, default: Date.now }
  },
  
  // Extracted sections
  sections: [documentSectionSchema],
  
  // Processing status
  status: {
    type: String,
    enum: [
      'uploaded',           // File received
      'processing',         // Splitting/classifying
      'classified',         // All sections classified
      'routing',            // Sending to destinations
      'partially_delivered',// Some sections delivered
      'delivered',          // All sections delivered
      'failed',             // Processing failed
      'manual_review'       // Needs human intervention
    ],
    default: 'uploaded'
  },
  
  // Processing metadata
  processingStartedAt: Date,
  processingCompletedAt: Date,
  processingError: String,
  processingDuration: Number,   // milliseconds
  
  // Routing summary
  routingSummary: {
    totalSections: { type: Number, default: 0 },
    pendingSections: { type: Number, default: 0 },
    deliveredSections: { type: Number, default: 0 },
    failedSections: { type: Number, default: 0 },
    skippedSections: { type: Number, default: 0 }
  },
  
  // Submitter info
  submittedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  submittedAt: { type: Date, default: Date.now },
  
  // Utility acknowledgment
  utilityAcknowledged: { type: Boolean, default: false },
  utilityAcknowledgedAt: Date,
  utilityReferenceId: String,
  
  // Wizard data (from AsBuiltWizard steps)
  wizardData: { type: mongoose.Schema.Types.Mixed },
  validationScore: { type: Number },
  validationChecks: [{ type: mongoose.Schema.Types.Mixed }],
  fileNames: { type: mongoose.Schema.Types.Mixed },
  
  // EC FDA Attributes — structured equipment data for Asset Registry
  // Config-driven: attribute categories come from UtilityAsBuiltConfig
  fdaAttributes: {
    // Work performed summary
    workPerformed: {
      type: String, // e.g., 'POLE_DECA_REPL'
      description: String,
      action: { type: String, enum: ['install', 'replace', 'relocate', 'remove', 'repair', 'deactivate', 'idle'] },
    },
    
    // Pole attributes (when pole work is in scope)
    pole: {
      action: { type: String, enum: ['install', 'replace', 'remove', 'transfer', 'no_change'] },
      oldPole: {
        class: String,        // e.g., '4', '5', '2'
        height: Number,       // feet (e.g., 45, 55, 65)
        species: String,      // e.g., 'DF' (Douglas Fir), 'WRC' (Western Red Cedar), 'SP' (Southern Pine)
        treatment: String,    // e.g., 'CCA', 'PENTA', 'CU-NAP'
        yearSet: Number,      // Year pole was originally set
        sapEquipment: String, // SAP Equipment ID
        groundLineCirc: Number, // Ground line circumference in inches
      },
      newPole: {
        class: String,
        height: Number,
        species: String,
        treatment: String,
        yearSet: Number,      // Current year
        sapEquipment: String,
        manufacturer: String,
        serialNumber: String,
      },
    },
    
    // Conductor attributes
    conductors: [{
      action: { type: String, enum: ['install', 'replace', 'remove', 'transfer', 'no_change'] },
      type: { type: String }, // e.g., 'primary', 'secondary', 'neutral', 'service'
      size: String,           // e.g., '#4 ACSR', '1/0 AAC', '#2 CU'
      material: String,       // e.g., 'ACSR', 'AAC', 'CU', 'AAAC'
      spanLength: Number,     // feet
      fromPole: String,       // Pole ID or description
      toPole: String,
      phaseCount: Number,     // 1, 2, or 3
    }],
    
    // Transformer attributes
    transformer: {
      action: { type: String, enum: ['install', 'replace', 'remove', 'transfer', 'no_change'] },
      old: {
        kva: Number,
        voltage: String,       // e.g., '12470/7200 - 120/240'
        phase: { type: Number, enum: [1, 3] },
        serialNumber: String,
        manufacturer: String,
        sapEquipment: String,
      },
      new: {
        kva: Number,
        voltage: String,
        phase: { type: Number, enum: [1, 3] },
        serialNumber: String,
        manufacturer: String,
        sapEquipment: String,
        yearInstalled: Number,
      },
    },
    
    // Switch/Fuse/Recloser attributes
    switchgear: [{
      action: { type: String, enum: ['install', 'replace', 'remove', 'transfer', 'no_change'] },
      type: { type: String }, // e.g., 'fuse_cutout', 'gang_switch', 'recloser', 'sectionalizer'
      rating: String,         // e.g., '100A', '65K'
      manufacturer: String,
      serialNumber: String,
      sapEquipment: String,
    }],
    
    // Miscellaneous equipment
    otherEquipment: [{
      type: { type: String }, // e.g., 'capacitor', 'regulator', 'streetlight', 'riser', 'meter'
      action: { type: String, enum: ['install', 'replace', 'remove', 'transfer', 'no_change'] },
      description: String,
      attributes: { type: mongoose.Schema.Types.Mixed }, // Flexible key-value pairs
    }],
    
    // Notes for Mapping team
    mappingNotes: String,
  },
  
  // Notification number (for EC tag work)
  notificationNumber: String,
  // Utility code (for config lookup)
  utilityCode: String,
  // Work type (from wizard)
  workType: String,

  // Audit trail
  auditLog: [{
    action: {
      type: String,
      enum: ['uploaded', 'processing_started', 'section_extracted', 'section_classified', 
             'section_routed', 'section_delivered', 'section_failed', 'section_retried',
             'completed', 'failed', 'manual_override', 'warning']
    },
    sectionIndex: Number,
    details: String,
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    timestamp: { type: Date, default: Date.now },
    metadata: mongoose.Schema.Types.Mixed
  }]
}, {
  timestamps: true
});

// Indexes
asBuiltSubmissionSchema.index({ companyId: 1, status: 1 });
asBuiltSubmissionSchema.index({ jobId: 1 });
asBuiltSubmissionSchema.index({ pmNumber: 1 });
asBuiltSubmissionSchema.index({ utilityId: 1, status: 1 });
asBuiltSubmissionSchema.index({ submittedAt: -1 });
asBuiltSubmissionSchema.index({ 'sections.deliveryStatus': 1 });

// Generate submission ID
asBuiltSubmissionSchema.pre('save', async function(next) {
  if (!this.submissionId) {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const count = await this.constructor.countDocuments({
      createdAt: {
        $gte: new Date(date.getFullYear(), date.getMonth(), 1),
        $lt: new Date(date.getFullYear(), date.getMonth() + 1, 1)
      }
    });
    this.submissionId = `ASB-${year}${month}-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

// Update routing summary
asBuiltSubmissionSchema.methods.updateRoutingSummary = function() {
  const summary = {
    totalSections: this.sections.length,
    pendingSections: 0,
    deliveredSections: 0,
    failedSections: 0,
    skippedSections: 0
  };
  
  this.sections.forEach(section => {
    switch (section.deliveryStatus) {
      case 'pending':
      case 'queued':
      case 'sending':
        summary.pendingSections++;
        break;
      case 'delivered':
      case 'acknowledged':
        summary.deliveredSections++;
        break;
      case 'failed':
        summary.failedSections++;
        break;
      case 'skipped':
        summary.skippedSections++;
        break;
    }
  });
  
  this.routingSummary = summary;
  
  // Update overall status
  if (summary.failedSections > 0 && summary.pendingSections === 0) {
    this.status = summary.deliveredSections > 0 ? 'partially_delivered' : 'failed';
  } else if (summary.pendingSections === 0 && summary.deliveredSections > 0) {
    this.status = 'delivered';
  } else if (summary.deliveredSections > 0) {
    this.status = 'partially_delivered';
  }
  
  return summary;
};

// Add audit log entry
asBuiltSubmissionSchema.methods.addAuditEntry = function(action, details, userId, sectionIndex, metadata) {
  this.auditLog.push({
    action,
    details,
    userId,
    sectionIndex,
    metadata,
    timestamp: new Date()
  });
};

// Get sections by destination
asBuiltSubmissionSchema.methods.getSectionsByDestination = function(destination) {
  return this.sections.filter(s => s.destination === destination);
};

// Get failed sections for retry
asBuiltSubmissionSchema.methods.getFailedSections = function() {
  return this.sections.filter(s => s.deliveryStatus === 'failed');
};

// Mark section as delivered
asBuiltSubmissionSchema.methods.markSectionDelivered = function(sectionIndex, externalRefId) {
  if (this.sections[sectionIndex]) {
    this.sections[sectionIndex].deliveryStatus = 'delivered';
    this.sections[sectionIndex].deliveredAt = new Date();
    this.sections[sectionIndex].externalReferenceId = externalRefId;
    this.updateRoutingSummary();
  }
};

// Mark section as failed
asBuiltSubmissionSchema.methods.markSectionFailed = function(sectionIndex, error) {
  if (this.sections[sectionIndex]) {
    this.sections[sectionIndex].deliveryStatus = 'failed';
    this.sections[sectionIndex].deliveryError = error;
    this.sections[sectionIndex].deliveryAttempts++;
    this.updateRoutingSummary();
  }
};

module.exports = mongoose.model('AsBuiltSubmission', asBuiltSubmissionSchema);

