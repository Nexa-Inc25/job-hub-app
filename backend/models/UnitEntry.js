/**
 * FieldLedger - UnitEntry Model
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * The "Digital Receipt" for unit-price billing.
 * Each entry captures work performed with GPS-verified photos,
 * enabling automated invoice generation and utility audit approval.
 */

const mongoose = require('mongoose');

// GPS coordinates schema (reusable)
const gpsSchema = new mongoose.Schema({
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  accuracy: Number,                                 // Accuracy in meters
  altitude: Number,
  altitudeAccuracy: Number,
  heading: Number,                                  // Device heading (for context)
  speed: Number,
  capturedAt: { type: Date, default: Date.now }
}, { _id: false });

// Photo verification schema (the "Digital Receipt" core)
const unitPhotoSchema = new mongoose.Schema({
  url: String,
  r2Key: String,
  fileName: String,
  mimeType: { type: String, default: 'image/jpeg' },
  fileSize: Number,                                 // Bytes
  
  // GPS stamp on the photo itself
  gpsCoordinates: gpsSchema,
  
  // Capture metadata
  capturedAt: { type: Date, required: true },
  deviceInfo: String,                               // "iPhone 14 Pro / iOS 17.2"
  appVersion: String,                               // FieldLedger version
  
  // Photo classification
  photoType: {
    type: String,
    enum: ['before', 'during', 'after', 'measurement', 'issue', 'verification', 'other'],
    default: 'after'
  },
  description: String,
  
  // Verification status
  isVerified: { type: Boolean, default: false },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  verifiedAt: Date,
  
  // Flag if photo has issues
  flagged: { type: Boolean, default: false },
  flagReason: String
});

// Sub-tier contractor tracking schema
const performedBySchema = new mongoose.Schema({
  // Contractor tier - critical for billing separation
  tier: {
    type: String,
    enum: ['prime', 'sub', 'sub_of_sub'],
    required: true
  },
  
  // Work category (for billing separation between civil/electrical)
  workCategory: {
    type: String,
    enum: ['electrical', 'civil', 'overhead', 'underground', 'traffic_control', 'vegetation', 'inspection', 'emergency', 'other'],
    required: true
  },
  
  // Prime contractor's crew (if tier === 'prime')
  crewId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  foremanId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  foremanName: String,                              // Denormalized for reports
  
  // Subcontractor info (if tier === 'sub' or 'sub_of_sub')
  subContractorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
  subContractorName: String,                        // Denormalized: "ABC Civil"
  subContractorLicense: String,                     // CA Contractor License #
  
  // For sub_of_sub: who is their prime?
  primeContractorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
  primeContractorName: String                       // Denormalized
}, { _id: false });

// Main UnitEntry schema
const unitEntrySchema = new mongoose.Schema({
  // === RELATIONSHIPS ===
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  priceBookId: { type: mongoose.Schema.Types.ObjectId, ref: 'PriceBook', required: true },
  priceBookItemId: { type: mongoose.Schema.Types.ObjectId, required: true },  // Embedded item ID
  claimId: { type: mongoose.Schema.Types.ObjectId, ref: 'Claim' },            // Set when added to claim
  
  // === UNIT DETAILS (snapshot from price book at time of entry) ===
  itemCode: { type: String, required: true },
  description: { type: String, required: true },
  category: String,                                 // civil, electrical, etc.
  subcategory: String,
  
  // === QUANTITY & PRICING ===
  quantity: { type: Number, required: true },
  unit: { type: String, required: true },          // "LF", "EA", "HR", "CY", "SF"
  unitPrice: { type: Number, required: true },     // LOCKED at entry time (prevents rate disputes)
  totalAmount: { type: Number, required: true },   // quantity * unitPrice
  
  // === THE "DIGITAL RECEIPT" - Verification Data ===
  photos: { 
    type: [unitPhotoSchema], 
    validate: {
      validator: function(arr) {
        // At least one photo required unless explicitly waived
        return arr.length >= 1 || this.photoWaived;
      },
      message: 'At least one photo required for unit verification'
    }
  },
  photoWaived: { type: Boolean, default: false },  // Rare cases where photo not possible
  photoWaivedReason: String,
  photoWaivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  // Primary GPS location for this unit entry
  location: {
    type: gpsSchema,
    required: true
  },
  locationDescription: String,                      // "NE corner of Main & 1st St"
  
  // GPS quality flag (for audit filtering)
  gpsQuality: {
    type: String,
    enum: ['high', 'medium', 'low', 'none'],       // Based on accuracy threshold
    default: 'medium'
  },
  
  // === WHO PERFORMED THE WORK ===
  performedBy: { type: performedBySchema, required: true },
  
  // === TIMING ===
  workDate: { type: Date, required: true },        // When work was actually performed
  workStartTime: String,                            // "07:30" - optional for time tracking
  workEndTime: String,                              // "15:30"
  enteredAt: { type: Date, default: Date.now },    // When entry was created in system
  enteredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  // === WORKFLOW STATUS ===
  status: {
    type: String,
    enum: [
      'draft',              // Saved but not submitted
      'submitted',          // Submitted by foreman for review
      'verified',           // GF/QA verified the unit
      'disputed',           // GC or utility disputes this unit
      'approved',           // Final approval for billing
      'invoiced',           // Added to a claim/invoice
      'paid'                // Payment received for this unit
    ],
    default: 'draft'
  },
  
  // === SUBMISSION WORKFLOW ===
  submittedAt: Date,
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  // === VERIFICATION WORKFLOW ===
  verifiedAt: Date,
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  verificationNotes: String,
  
  // === APPROVAL WORKFLOW ===
  approvedAt: Date,
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvalNotes: String,
  
  // === DISPUTE TRACKING ===
  isDisputed: { type: Boolean, default: false },
  disputedAt: Date,
  disputedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  disputeReason: String,
  disputeCategory: {
    type: String,
    enum: ['quantity', 'rate', 'quality', 'location', 'photo', 'duplicate', 'other']
  },
  disputeResolution: String,
  disputeResolvedAt: Date,
  disputeResolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  // === NOTES & CONTEXT ===
  notes: String,                                    // Field notes from crew
  fieldConditions: String,                          // "Rocky soil", "Wet conditions"
  accessNotes: String,                              // Access challenges
  
  // === ADJUSTMENTS (if quantity/rate needs correction) ===
  adjustments: [{
    date: { type: Date, default: Date.now },
    adjustedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    originalQuantity: Number,
    newQuantity: Number,
    originalTotal: Number,
    newTotal: Number,
    reason: String
  }],
  
  // === OFFLINE SYNC ===
  offlineId: String,                                // Client-generated UUID for offline entries
  syncedAt: Date,
  syncStatus: {
    type: String,
    enum: ['pending', 'synced', 'conflict', 'error'],
    default: 'synced'
  },
  syncError: String,
  
  // === DELETION (soft delete for audit trail) ===
  isDeleted: { type: Boolean, default: false },
  deletedAt: Date,
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  deleteReason: String
  
}, { timestamps: true });

// Indexes for efficient queries
unitEntrySchema.index({ jobId: 1, status: 1 });
unitEntrySchema.index({ jobId: 1, workDate: -1 });
unitEntrySchema.index({ companyId: 1, workDate: -1 });
unitEntrySchema.index({ companyId: 1, status: 1, workDate: -1 });
unitEntrySchema.index({ claimId: 1 });
unitEntrySchema.index({ 'performedBy.tier': 1, companyId: 1 });
unitEntrySchema.index({ 'performedBy.subContractorId': 1 });
unitEntrySchema.index({ 'performedBy.workCategory': 1, companyId: 1 });
unitEntrySchema.index({ status: 1, isDisputed: 1 });
unitEntrySchema.index({ offlineId: 1 }, { sparse: true });
unitEntrySchema.index({ itemCode: 1, companyId: 1 });

// Virtual for GPS compliance check (< 50m accuracy = high quality)
unitEntrySchema.virtual('hasValidGPS').get(function() {
  return this.location?.accuracy && this.location.accuracy < 50;
});

// Virtual for photo compliance
unitEntrySchema.virtual('photoCompliant').get(function() {
  return this.photos.length > 0 || this.photoWaived;
});

// Pre-save hook to calculate totals and GPS quality
unitEntrySchema.pre('save', function(next) {
  // Calculate total amount
  if (this.quantity && this.unitPrice) {
    this.totalAmount = Math.round(this.quantity * this.unitPrice * 100) / 100;
  }
  
  // Set GPS quality based on accuracy
  if (this.location?.accuracy) {
    if (this.location.accuracy < 10) {
      this.gpsQuality = 'high';
    } else if (this.location.accuracy < 50) {
      this.gpsQuality = 'medium';
    } else {
      this.gpsQuality = 'low';
    }
  } else {
    this.gpsQuality = 'none';
  }
  
  next();
});

// Static method to get units for a job
unitEntrySchema.statics.getByJob = async function(jobId, includeDeleted = false) {
  const query = { jobId };
  if (!includeDeleted) {
    query.isDeleted = { $ne: true };
  }
  return this.find(query).sort({ workDate: -1, createdAt: -1 });
};

// Static method to get unbilled units for a company
unitEntrySchema.statics.getUnbilledByCompany = async function(companyId) {
  return this.find({
    companyId,
    status: 'approved',
    claimId: null,
    isDeleted: { $ne: true }
  }).sort({ workDate: -1 });
};

// Static method to get disputed units
unitEntrySchema.statics.getDisputed = async function(companyId) {
  return this.find({
    companyId,
    isDisputed: true,
    disputeResolvedAt: null,
    isDeleted: { $ne: true }
  }).sort({ disputedAt: -1 });
};

// Instance method to submit for review
unitEntrySchema.methods.submit = function(userId) {
  this.status = 'submitted';
  this.submittedAt = new Date();
  this.submittedBy = userId;
  return this.save();
};

// Instance method to verify
unitEntrySchema.methods.verify = function(userId, notes) {
  this.status = 'verified';
  this.verifiedAt = new Date();
  this.verifiedBy = userId;
  this.verificationNotes = notes;
  return this.save();
};

// Instance method to approve
unitEntrySchema.methods.approve = function(userId, notes) {
  this.status = 'approved';
  this.approvedAt = new Date();
  this.approvedBy = userId;
  this.approvalNotes = notes;
  return this.save();
};

// Instance method to dispute
unitEntrySchema.methods.dispute = function(userId, reason, category) {
  this.status = 'disputed';
  this.isDisputed = true;
  this.disputedAt = new Date();
  this.disputedBy = userId;
  this.disputeReason = reason;
  this.disputeCategory = category;
  return this.save();
};

module.exports = mongoose.model('UnitEntry', unitEntrySchema);

