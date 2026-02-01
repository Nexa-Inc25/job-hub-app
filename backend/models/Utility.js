const mongoose = require('mongoose');

// Template schema for utility-specific forms
const utilityTemplateSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, enum: ['Pre-Field', 'Completion', 'Safety', 'Billing', 'General'], default: 'General' },
  r2Key: String,  // R2 storage key for the template PDF
  required: { type: Boolean, default: false },  // Is this form required for job completion?
  description: String
});

// Submission requirements for this utility
const submissionSchema = new mongoose.Schema({
  method: { type: String, enum: ['portal', 'email', 'ftp', 'api'], default: 'portal' },
  portalUrl: String,
  emailTo: String,
  requiredDocuments: [String],  // List of document types required for submission
  namingConvention: String,  // e.g., "{pmNumber}_{docType}.pdf"
  instructions: String  // Human-readable submission instructions
});

// Main Utility schema
const utilitySchema = new mongoose.Schema({
  name: { type: String, required: true },  // "Pacific Gas & Electric"
  slug: { type: String, required: true, unique: true },  // "pge"
  shortName: String,  // "PG&E"
  region: String,  // "California"
  
  // Contact info
  contactEmail: String,
  contractorPortalUrl: String,
  
  // Templates/forms specific to this utility
  templates: [utilityTemplateSchema],
  
  // Document submission requirements
  submission: submissionSchema,
  
  // Default folder structure for jobs with this utility
  folderStructure: [{
    name: String,
    subfolders: [String]
  }],
  
  // AI extraction hints (utility-specific terminology)
  aiHints: String,
  
  // === ERP/ORACLE INTEGRATION (for billing module) ===
  erpIntegration: {
    // Oracle Cloud specific
    oracleVendorId: String,           // Utility's Oracle vendor ID
    oracleBusinessUnit: String,       // Oracle Business Unit code
    oracleProjectPrefix: String,      // How project numbers map (e.g., "PGE-" prefix)
    oracleLegalEntity: String,        // Oracle Legal Entity
    
    // SAP specific (PG&E uses SAP/Oracle hybrid)
    sapCompanyCode: String,           // SAP company code
    sapVendorNumber: String,          // SAP vendor master number
    sapPlant: String,                 // SAP plant code
    sapPurchasingOrg: String,         // SAP purchasing organization
    
    // Generic integration
    externalSystemId: String,         // Generic external system reference
    apiEndpoint: String,              // Future: direct API endpoint for invoice submission
    apiVersion: String,               // API version for compatibility
    
    // Rate sheet metadata
    masterContractNumber: String,     // MSA contract number
    rateSheetVersion: String,         // Current rate sheet version
    rateEffectiveDate: Date,          // When current rates took effect
    
    // Sync tracking
    lastSyncedAt: Date,               // Last successful data sync
    syncEnabled: { type: Boolean, default: false }
  },
  
  // Legacy SAP integration config (keeping for backwards compatibility)
  sapIntegration: {
    enabled: { type: Boolean, default: false },
    endpoint: String,
    // Don't store API keys in DB - use environment variables
  },
  
  // Utility admin users (Phase 2 - utility employees who can view all contractors)
  utilityAdmins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  // Status
  isActive: { type: Boolean, default: true },
  
}, { timestamps: true });

// Indexes (slug already has unique:true which creates an index)
utilitySchema.index({ isActive: 1 });

module.exports = mongoose.model('Utility', utilitySchema);
