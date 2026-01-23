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
  
  // SAP integration config (for future direct integration)
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

// Indexes
utilitySchema.index({ slug: 1 });
utilitySchema.index({ isActive: 1 });

module.exports = mongoose.model('Utility', utilitySchema);
