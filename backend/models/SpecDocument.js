const mongoose = require('mongoose');

// Version history for tracking spec revisions
const versionSchema = new mongoose.Schema({
  versionNumber: { type: String, required: true },  // e.g., "2024-01", "Rev 3.2"
  r2Key: { type: String, required: true },           // R2 storage key
  fileName: String,
  fileSize: Number,
  uploadedAt: { type: Date, default: Date.now },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  notes: String,                                     // "Updated grounding requirements"
  isActive: { type: Boolean, default: true },        // Current version = true
  supersededAt: Date,                                // When this version was replaced
  supersededBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

// Main Spec Document schema
const specDocumentSchema = new mongoose.Schema({
  // Basic info
  name: { type: String, required: true },           // "Overhead Construction Standards"
  description: String,                               // Brief description
  documentNumber: String,                            // Utility's document number (e.g., "TD-0100S-001")
  
  // Primary Division - Overhead vs Underground
  division: {
    type: String,
    enum: ['overhead', 'underground'],
    default: 'overhead',
    required: true
  },
  
  // Section - Primary grouping within division (e.g., Grounding, Pole Installation, Conduit)
  // This is the main organizational field for specs
  section: { 
    type: String,
    required: true,
    default: 'General'
  },
  
  // Category - Legacy field, kept for backwards compatibility (mirrors section)
  category: {
    type: String,
    default: 'general'
  },
  
  // Legacy subcategory field - kept for backwards compatibility
  subcategory: String,                               // e.g., "Residential", "Commercial"
  
  // Which utility this spec belongs to
  utilityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Utility', required: true },
  
  // Which company uploaded this (for multi-tenant)
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
  
  // Version management
  versions: [versionSchema],
  currentVersion: { type: String },                  // Points to active version number
  
  // Current active file (denormalized for fast access)
  r2Key: String,
  fileName: String,
  fileSize: Number,
  
  // Metadata
  effectiveDate: Date,                               // When spec became effective
  expirationDate: Date,                              // If spec has expiration
  
  // Tags for searching
  tags: [String],                                    // ["grounding", "pole", "meter"]
  
  // Access tracking
  lastViewedAt: Date,
  viewCount: { type: Number, default: 0 },
  
  // Audit trail
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  // Soft delete
  isDeleted: { type: Boolean, default: false },
  deletedAt: Date,
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  
}, { timestamps: true });

// Indexes for fast queries - organized by Division -> Section -> Document
// Note: Single-field indexes removed if covered by compound indexes (MongoDB best practice)
specDocumentSchema.index({ utilityId: 1, category: 1, section: 1 }); // For utility-based queries with category/section
specDocumentSchema.index({ utilityId: 1, division: 1, section: 1 }); // For utility-based queries with division/section
specDocumentSchema.index({ utilityId: 1, isDeleted: 1 });
specDocumentSchema.index({ division: 1, section: 1 }); // Covers division-only queries (prefix)
specDocumentSchema.index({ tags: 1 });
specDocumentSchema.index({ documentNumber: 1 });
specDocumentSchema.index({ name: 'text', description: 'text', documentNumber: 'text', section: 'text' }); // Full-text search

// Method to add a new version
specDocumentSchema.methods.addVersion = async function(versionData, userId) {
  // Mark current version as superseded
  const currentVersionDoc = this.versions.find(v => v.isActive);
  if (currentVersionDoc) {
    currentVersionDoc.isActive = false;
    currentVersionDoc.supersededAt = new Date();
    currentVersionDoc.supersededBy = userId;
  }
  
  // Add new version
  const newVersion = {
    ...versionData,
    isActive: true,
    uploadedAt: new Date(),
    uploadedBy: userId
  };
  this.versions.push(newVersion);
  
  // Update current file reference
  this.currentVersion = versionData.versionNumber;
  this.r2Key = versionData.r2Key;
  this.fileName = versionData.fileName;
  this.fileSize = versionData.fileSize;
  this.lastUpdatedBy = userId;
  
  return this.save();
};

// Method to get version history
specDocumentSchema.methods.getVersionHistory = function() {
  return this.versions.sort((a, b) => b.uploadedAt - a.uploadedAt);
};

module.exports = mongoose.model('SpecDocument', specDocumentSchema);

