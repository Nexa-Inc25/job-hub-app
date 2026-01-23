const mongoose = require('mongoose');

// Document schema for files stored in folders
const documentSchema = new mongoose.Schema({
  name: String,
  path: String,
  url: String,
  r2Key: String, // R2 storage key
  type: { type: String, enum: ['pdf', 'image', 'template', 'drawing', 'map', 'other'], default: 'other' },
  // AI-assigned category for extracted content
  category: { type: String, enum: ['SKETCH', 'MAP', 'FORM', 'PHOTO', null], default: null },
  uploadDate: { type: Date, default: Date.now },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isTemplate: { type: Boolean, default: false },
  isCompleted: { type: Boolean, default: false },
  completedDate: Date,
  completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // Document approval workflow
  approvalStatus: { 
    type: String, 
    enum: ['draft', 'pending_approval', 'approved', 'rejected', null], 
    default: null 
  },
  // Draft documents have a different name until approved
  draftName: String,  // e.g., "DRAFT_46357356_CWC_1705123456789.pdf"
  finalName: String,  // e.g., "46357356_CWC.pdf" - set when approved
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedDate: Date,
  rejectionReason: String,
  // For AI-extracted content
  extractedFrom: String, // Original PDF this was extracted from
  pageNumber: Number // Page number in original PDF
});

// Recursive subfolder schema to support nested folders
const subfolderSchema = new mongoose.Schema({
  name: String,
  documents: [documentSchema],
  subfolders: [] // Will be populated with same schema structure
});

// Allow recursive nesting
subfolderSchema.add({ subfolders: [subfolderSchema] });

// Main folder schema (parent folders like ACI, UTC)
const folderSchema = new mongoose.Schema({
  name: String,
  documents: [documentSchema],
  subfolders: [subfolderSchema]
});

const jobSchema = new mongoose.Schema({
  title: String,
  description: String,
  woNumber: String,
  pmNumber: String,
  notificationNumber: String,
  address: String,
  city: String,
  client: String,
  projectName: String,
  orderType: String,
  division: { type: String, default: 'DA' },
  matCode: String,
  status: { type: String, enum: ['pending', 'pre-field', 'in-progress', 'completed', 'billed', 'invoiced'], default: 'pending' },
  priority: { type: String, enum: ['low', 'medium', 'high', 'emergency'], default: 'medium' },
  // Due date from job package - when work must be completed by
  dueDate: Date,
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  folders: [folderSchema],
  isEmergency: { type: Boolean, default: false },
  
  // === MULTI-TENANT FIELDS (optional for backwards compatibility) ===
  // Which company owns this job
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
  // Which utility this job is for
  utilityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Utility' },
  
  // === UTILITY VISIBILITY (Phase 2 - utility dashboard) ===
  // Can the utility see this job in their dashboard?
  utilityVisible: { type: Boolean, default: false },
  // Utility's view of this job's status
  utilityStatus: { 
    type: String, 
    enum: ['not_submitted', 'submitted', 'under_review', 'approved', 'rejected', 'revision_requested', null], 
    default: null 
  },
  utilitySubmittedDate: Date,
  utilityReviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  utilityReviewedDate: Date,
  utilityNotes: String,  // Notes from utility reviewer
  // Crew Assignment/Scheduling (set by GF)
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },  // Which foreman/crew
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },  // Who assigned it (GF)
  assignedDate: Date,                                                  // When it was assigned
  crewScheduledDate: Date,                                             // When crew is scheduled to work
  crewScheduledEndDate: Date,                                          // End date for multi-day jobs
  assignmentNotes: String,                                             // Special instructions
  // GF Pre-field data
  bidAmount: Number,
  bidNotes: String,
  crewSize: Number,
  // Completion tracking
  completedDate: Date,
  completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  billedDate: Date,
  invoicedDate: Date,
  // AI extraction tracking
  aiExtractionComplete: { type: Boolean, default: false },
  aiExtractionStarted: Date,
  aiExtractionEnded: Date,
  aiProcessingTimeMs: Number, // Track extraction duration for performance monitoring
  aiExtractedAssets: [{
    type: { type: String, enum: ['photo', 'drawing', 'map', 'document'] },
    name: String,
    url: String,
    extractedAt: Date
  }]
}, { timestamps: true });

// Indexes for searching
jobSchema.index({ pmNumber: 1 });
jobSchema.index({ woNumber: 1 });
jobSchema.index({ notificationNumber: 1 });
jobSchema.index({ assignedTo: 1, crewScheduledDate: 1 }); // For calendar queries
jobSchema.index({ userId: 1, createdAt: -1 }); // For dashboard listing (fast user-specific sorted queries)
// Multi-tenant indexes
jobSchema.index({ companyId: 1, createdAt: -1 }); // Company dashboard
jobSchema.index({ utilityId: 1, utilityVisible: 1, createdAt: -1 }); // Utility dashboard

module.exports = mongoose.model('Job', jobSchema);
