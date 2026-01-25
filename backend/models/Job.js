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
  // Job status workflow:
  // new → assigned_to_gf → pre_fielding → scheduled → in_progress → 
  // pending_gf_review → pending_pm_approval → ready_to_submit → submitted → billed → invoiced
  status: { 
    type: String, 
    enum: [
      'new',                  // Just received from utility, PM needs to review
      'assigned_to_gf',       // PM assigned to General Foreman
      'pre_fielding',         // GF is pre-fielding (site visit, assessing)
      'scheduled',            // GF scheduled crew and dependencies
      'stuck',                // Job has issues/discrepancies blocking work
      'in_progress',          // Crew is working on the job
      'pending_gf_review',    // Crew submitted, waiting for GF review
      'pending_pm_approval',  // GF approved, waiting for PM final approval
      'ready_to_submit',      // PM approved, ready to submit to utility
      'submitted',            // Submitted to utility
      'billed',               // Invoice sent
      'invoiced',             // Payment received
      // Legacy statuses for backwards compatibility
      'pending',              // (legacy) maps to 'new'
      'pre-field',            // (legacy) maps to 'pre_fielding'
      'in-progress',          // (legacy) maps to 'in_progress'
      'completed'             // (legacy) maps to 'ready_to_submit'
    ], 
    default: 'new' 
  },
  priority: { type: String, enum: ['low', 'medium', 'high', 'emergency'], default: 'medium' },
  // Due date from job package - when work must be completed by
  dueDate: Date,
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },  // PM who received the job
  folders: [folderSchema],
  isEmergency: { type: Boolean, default: false },
  
  // === WORKFLOW TRACKING ===
  // GF assignment (PM assigns to GF)
  assignedToGF: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assignedToGFDate: Date,
  assignedToGFBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  // Pre-field data (GF fills out)
  preFieldDate: Date,
  preFieldNotes: String,
  preFieldPhotos: [String],  // URLs to pre-field photos
  siteConditions: String,
  
  // Stuck job tracking (design discrepancy, utility issue, etc.)
  stuckReason: String,
  stuckDate: Date,
  stuckBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  // Dependencies tracking (GF manages)
  dependencies: [{
    type: { type: String, enum: ['usa', 'vegetation', 'traffic_control', 'no_parks', 'cwc', 'afw_type', 'special_equipment', 'civil'] },
    description: String,
    status: { type: String, enum: ['required', 'check', 'scheduled', 'not_required'], default: 'required' },
    scheduledDate: Date,
    completedDate: Date,
    ticketNumber: String,  // For USA dig tickets, permits, etc.
    notes: String
  }],
  
  // Crew assignment (GF assigns crew)
  // (existing fields: assignedTo, assignedBy, assignedDate, crewScheduledDate, etc.)
  
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
  // GF Pre-field data (bid/estimate)
  bidAmount: Number,
  bidNotes: String,
  estimatedHours: Number,
  crewSize: Number,
  
  // === REVIEW & APPROVAL WORKFLOW ===
  // Crew submission
  crewSubmittedDate: Date,
  crewSubmittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  crewSubmissionNotes: String,
  
  // GF Review
  gfReviewDate: Date,
  gfReviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  gfReviewStatus: { type: String, enum: ['approved', 'rejected', 'revision_requested', null], default: null },
  gfReviewNotes: String,
  
  // PM Final Approval  
  pmApprovalDate: Date,
  pmApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  pmApprovalStatus: { type: String, enum: ['approved', 'rejected', 'revision_requested', null], default: null },
  pmApprovalNotes: String,
  
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
  }],
  
  // === JOB NOTES/CHAT (company internal communication) ===
  notes: [{
    message: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName: String,  // Denormalized for fast display
    userRole: String,  // 'foreman', 'gf', 'pm', 'admin'
    createdAt: { type: Date, default: Date.now },
    // Optional: tag type of note
    noteType: { type: String, enum: ['update', 'issue', 'question', 'resolution', null], default: null },
    // If note is related to a specific dependency
    dependencyId: { type: mongoose.Schema.Types.ObjectId }
  }],
  
  // === SOFT DELETE & ARCHIVAL (preserve data for AI training & compliance) ===
  // Soft delete - job hidden from UI but fully preserved
  isDeleted: { type: Boolean, default: false },
  deletedAt: Date,
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  deleteReason: String,  // Why was it deleted (duplicate, test data, etc.)
  
  // Archival - completed jobs moved to cold storage after billing
  isArchived: { type: Boolean, default: false },
  archivedAt: Date,
  archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  archiveReason: String, // 'completed', 'billed', 'invoiced', 'retention_policy'
  
  // Document retention compliance (utilities often require 7+ years)
  retentionExpiresAt: Date,  // When this job can be permanently deleted
  retentionPolicy: String    // e.g., 'pge_7_year', 'default_5_year'
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
// Soft delete & archive indexes - filter out deleted/archived from normal queries
jobSchema.index({ isDeleted: 1, isArchived: 1 }); // Fast filtering
jobSchema.index({ companyId: 1, isArchived: 1, archivedAt: -1 }); // Archived jobs listing

module.exports = mongoose.model('Job', jobSchema);
