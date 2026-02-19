/**
 * FieldLedger - Field Ticket Model (T&M / Change Order)
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Captures extra work (Time & Material) when scope changes occur.
 * This is the "Revenue Defense" system - work that would otherwise
 * be lost to paper tickets or forgotten emails.
 * 
 * Key Features:
 * - Labor hours by worker
 * - Equipment hours by asset
 * - Materials used with costs
 * - Mandatory inspector signature for validation
 * - GPS-verified location
 * - Photo documentation
 */

const mongoose = require('mongoose');

// GPS coordinates schema (shared with UnitEntry)
const gpsSchema = new mongoose.Schema({
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  accuracy: Number,
  altitude: Number,
  capturedAt: { type: Date, default: Date.now }
}, { _id: false });

// Labor entry schema - tracks hours per worker
const laborEntrySchema = new mongoose.Schema({
  workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  workerName: { type: String, required: true },
  role: {
    type: String,
    enum: ['foreman', 'journeyman', 'apprentice', 'laborer', 'operator', 'other'],
    default: 'journeyman'
  },
  regularHours: { type: Number, default: 0 },
  overtimeHours: { type: Number, default: 0 },
  doubleTimeHours: { type: Number, default: 0 },
  // Billing rates (snapshot at time of entry)
  regularRate: { type: Number, required: true },
  overtimeRate: Number,
  doubleTimeRate: Number,
  totalAmount: { type: Number, required: true },
  notes: String
});

// Equipment entry schema - tracks hours per piece of equipment
const equipmentEntrySchema = new mongoose.Schema({
  equipmentId: String,                              // Internal asset ID
  equipmentType: {
    type: String,
    enum: [
      'bucket_truck', 'digger_derrick', 'crane', 'excavator', 'backhoe',
      'trencher', 'dump_truck', 'flatbed', 'trailer', 'generator',
      'compressor', 'pump', 'welder', 'tensioner', 'puller', 'other'
    ],
    required: true
  },
  description: { type: String, required: true },    // "60' Bucket Truck #BT-42"
  hours: { type: Number, required: true },
  // Billing rates (snapshot at time of entry)
  hourlyRate: { type: Number, required: true },
  standbyHours: { type: Number, default: 0 },       // Equipment on-site but idle
  standbyRate: Number,
  totalAmount: { type: Number, required: true },
  notes: String
});

// Material entry schema - tracks materials used
const materialEntrySchema = new mongoose.Schema({
  materialCode: String,                             // M-Code from utility
  description: { type: String, required: true },
  quantity: { type: Number, required: true },
  unit: { type: String, required: true },           // EA, LF, CY, etc.
  unitCost: { type: Number, required: true },
  markup: { type: Number, default: 0 },             // Markup percentage
  totalAmount: { type: Number, required: true },
  source: {
    type: String,
    enum: ['stock', 'purchased', 'utility_provided', 'rental'],
    default: 'stock'
  },
  purchaseOrderNumber: String,
  notes: String
});

// Photo schema for field ticket documentation
const ticketPhotoSchema = new mongoose.Schema({
  url: String,
  r2Key: String,
  fileName: String,
  mimeType: { type: String, default: 'image/jpeg' },
  gpsCoordinates: gpsSchema,
  capturedAt: { type: Date, default: Date.now },
  photoType: {
    type: String,
    enum: ['condition', 'obstruction', 'work_in_progress', 'completed', 'damage', 'other'],
    default: 'work_in_progress'
  },
  description: String
});

// Inspector signature schema
const signatureSchema = new mongoose.Schema({
  signatureData: { type: String, required: true },  // Base64 encoded signature
  signedAt: { type: Date, default: Date.now },
  signerName: { type: String, required: true },
  signerTitle: String,
  signerCompany: String,                            // Utility name
  signerEmployeeId: String,                         // Inspector badge/ID
  // GPS at time of signature (proves on-site)
  signatureLocation: gpsSchema,
  // Device info for audit trail
  deviceInfo: String,
  ipAddress: String
});

// Main Field Ticket schema
const fieldTicketSchema = new mongoose.Schema({
  // === RELATIONSHIPS ===
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  claimId: { type: mongoose.Schema.Types.ObjectId, ref: 'Claim' },         // Set when added to claim
  
  // === IDENTIFICATION ===
  ticketNumber: { type: String, unique: true },     // "FT-2026-00001" - auto-generated
  
  // === REASON FOR EXTRA WORK ===
  changeReason: {
    type: String,
    enum: [
      'scope_change',           // Utility changed scope mid-job
      'unforeseen_condition',   // Hit rock, underground obstruction, etc.
      'utility_request',        // Utility asked for additional work
      'safety_requirement',     // Safety issue required extra work
      'permit_requirement',     // Permit required additional scope
      'design_error',           // Design was incorrect
      'weather_damage',         // Weather caused additional work
      'third_party_damage',     // Someone else damaged work
      'other'
    ],
    required: true
  },
  changeDescription: { type: String, required: true }, // Detailed description
  
  // === WORK DATE & LOCATION ===
  workDate: { type: Date, required: true },
  workStartTime: String,                            // "07:30"
  workEndTime: String,                              // "16:00"
  location: { type: gpsSchema, required: true },
  locationDescription: String,                       // "100 ft south of pole #42"
  
  // === LABOR, EQUIPMENT, MATERIALS ===
  laborEntries: [laborEntrySchema],
  equipmentEntries: [equipmentEntrySchema],
  materialEntries: [materialEntrySchema],
  
  // === TOTALS ===
  laborTotal: { type: Number, default: 0 },
  equipmentTotal: { type: Number, default: 0 },
  materialTotal: { type: Number, default: 0 },
  subtotal: { type: Number, default: 0 },
  markup: { type: Number, default: 0 },             // Overall markup amount
  markupRate: { type: Number, default: 0 },         // Markup percentage
  totalAmount: { type: Number, default: 0 },
  
  // === PHOTO DOCUMENTATION ===
  photos: [ticketPhotoSchema],
  
  // === INSPECTOR SIGNATURE (Required for approval) ===
  inspectorSignature: signatureSchema,
  
  // === WHO CREATED ===
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  foremanId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  foremanName: String,
  
  // === WORKFLOW STATUS ===
  status: {
    type: String,
    enum: [
      'draft',                  // Still being filled out
      'pending_signature',      // Awaiting inspector signature
      'signed',                 // Inspector signed, awaiting internal approval
      'approved',               // Internally approved, ready for billing
      'disputed',               // Utility or GC disputes this ticket
      'billed',                 // Added to a claim
      'paid',                   // Payment received
      'voided'                  // Cancelled/voided
    ],
    default: 'draft'
  },
  
  // === APPROVAL WORKFLOW ===
  submittedAt: Date,
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
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
    enum: ['hours', 'rates', 'materials', 'scope', 'quality', 'other'],
    default: 'other'
  },
  disputeEvidence: [{
    url: String,
    r2Key: String,
    fileName: String,
    documentType: {
      type: String,
      enum: ['photo', 'document', 'email', 'receipt', 'other'],
      default: 'photo'
    },
    description: String,
    addedAt: { type: Date, default: Date.now },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],
  disputeResolution: String,
  disputeResolvedAt: Date,
  disputeResolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  // === NOTES ===
  internalNotes: String,                            // For contractor use only
  utilityNotes: String,                             // Notes for/from utility
  
  // === WEATHER CONDITIONS (auto-captured) ===
  weatherConditions: {
    temperature: Number,                            // Fahrenheit
    conditions: String,                             // "Clear", "Rain", etc.
    windSpeed: Number,                              // MPH
    humidity: Number,                               // Percentage
    source: { type: String, default: 'api' },       // 'api' or 'manual'
    capturedAt: Date
  },
  
  // === OFFLINE SYNC ===
  offlineId: String,
  syncedAt: Date,
  syncStatus: {
    type: String,
    enum: ['pending', 'synced', 'conflict', 'error'],
    default: 'synced'
  },
  
  // === SOFT DELETE ===
  isDeleted: { type: Boolean, default: false },
  deletedAt: Date,
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  deleteReason: String
  
}, { timestamps: true });

// Indexes
fieldTicketSchema.index({ jobId: 1, workDate: -1 });
fieldTicketSchema.index({ companyId: 1, status: 1, workDate: -1 });
// Note: standalone { companyId: 1, status: 1 } removed — it's a prefix of the compound above
fieldTicketSchema.index({ claimId: 1 });
// ticketNumber already indexed via unique: true on schema field
fieldTicketSchema.index({ offlineId: 1 }, { sparse: true });

// Auto-generate ticket number
fieldTicketSchema.pre('save', async function(next) {
  if (!this.ticketNumber) {
    const year = new Date().getFullYear();
    const count = await this.constructor.countDocuments({
      companyId: this.companyId,
      createdAt: {
        $gte: new Date(year, 0, 1),
        $lt: new Date(year + 1, 0, 1)
      }
    });
    this.ticketNumber = `FT-${year}-${String(count + 1).padStart(5, '0')}`;
  }
  
  // Calculate entry totals (must be done here since sub-schema pre('save') hooks
  // don't fire for embedded documents - middleware must be added before embedding)
  
  // Calculate labor entry totals
  for (const entry of this.laborEntries) {
    const regular = (entry.regularHours || 0) * (entry.regularRate || 0);
    const overtime = (entry.overtimeHours || 0) * (entry.overtimeRate || entry.regularRate * 1.5);
    const doubleTime = (entry.doubleTimeHours || 0) * (entry.doubleTimeRate || entry.regularRate * 2);
    entry.totalAmount = regular + overtime + doubleTime;
  }
  
  // Calculate equipment entry totals
  for (const entry of this.equipmentEntries) {
    const operating = (entry.hours || 0) * (entry.hourlyRate || 0);
    const standby = (entry.standbyHours || 0) * (entry.standbyRate || entry.hourlyRate * 0.5);
    entry.totalAmount = operating + standby;
  }
  
  // Calculate material entry totals
  for (const entry of this.materialEntries) {
    const base = (entry.quantity || 0) * (entry.unitCost || 0);
    const markupAmount = base * ((entry.markup || 0) / 100);
    entry.totalAmount = base + markupAmount;
  }
  
  // Calculate aggregate totals
  this.laborTotal = this.laborEntries.reduce((sum, e) => sum + (e.totalAmount || 0), 0);
  this.equipmentTotal = this.equipmentEntries.reduce((sum, e) => sum + (e.totalAmount || 0), 0);
  this.materialTotal = this.materialEntries.reduce((sum, e) => sum + (e.totalAmount || 0), 0);
  this.subtotal = this.laborTotal + this.equipmentTotal + this.materialTotal;
  // markupRate is stored as percentage (e.g., 15 for 15%), divide by 100 to get multiplier
  this.markup = this.subtotal * ((this.markupRate || 0) / 100);
  this.totalAmount = this.subtotal + this.markup;
  
  next();
});

// Virtual for "at risk" status (unsigned tickets)
fieldTicketSchema.virtual('isAtRisk').get(function() {
  return ['draft', 'pending_signature'].includes(this.status);
});

// Static method to get "At Risk" tickets (for dashboard)
fieldTicketSchema.statics.getAtRisk = async function(companyId) {
  return this.find({
    companyId,
    status: { $in: ['draft', 'pending_signature'] },
    isDeleted: { $ne: true }
  })
    .populate('jobId', 'woNumber pmNumber address')
    .sort({ workDate: -1 });
};

// Static method to get "At Risk" total dollar value
fieldTicketSchema.statics.getAtRiskTotal = async function(companyId) {
  const result = await this.aggregate([
    {
      $match: {
        companyId: new mongoose.Types.ObjectId(companyId),
        status: { $in: ['draft', 'pending_signature'] },
        isDeleted: { $ne: true }
      }
    },
    {
      $group: {
        _id: null,
        totalAtRisk: { $sum: '$totalAmount' },
        count: { $sum: 1 }
      }
    }
  ]);
  
  return result[0] || { totalAtRisk: 0, count: 0 };
};

// Static method to get "At Risk" with aging breakdown
fieldTicketSchema.statics.getAtRiskAging = async function(companyId, thresholds = { warning: 3, critical: 7 }) {
  const now = new Date();
  const warningDate = new Date(now);
  warningDate.setDate(warningDate.getDate() - thresholds.warning);
  const criticalDate = new Date(now);
  criticalDate.setDate(criticalDate.getDate() - thresholds.critical);

  const result = await this.aggregate([
    {
      $match: {
        companyId: new mongoose.Types.ObjectId(companyId),
        status: { $in: ['draft', 'pending_signature'] },
        isDeleted: { $ne: true }
      }
    },
    {
      $addFields: {
        ageDays: {
          $dateDiff: { startDate: '$workDate', endDate: now, unit: 'day' }
        }
      }
    },
    {
      $group: {
        _id: {
          $cond: [
            { $lte: ['$ageDays', thresholds.warning] },
            'fresh',
            {
              $cond: [
                { $lte: ['$ageDays', thresholds.critical] },
                'warning',
                'critical'
              ]
            }
          ]
        },
        count: { $sum: 1 },
        totalAmount: { $sum: '$totalAmount' }
      }
    }
  ]);

  const aging = { fresh: { count: 0, totalAmount: 0 }, warning: { count: 0, totalAmount: 0 }, critical: { count: 0, totalAmount: 0 } };
  for (const bucket of result) {
    aging[bucket._id] = { count: bucket.count, totalAmount: bucket.totalAmount };
  }
  return aging;
};

// Static method to get weekly at-risk trend (last N weeks)
fieldTicketSchema.statics.getAtRiskTrend = async function(companyId, weeks = 8) {
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - (weeks * 7));

  const result = await this.aggregate([
    {
      $match: {
        companyId: new mongoose.Types.ObjectId(companyId),
        status: { $in: ['draft', 'pending_signature'] },
        isDeleted: { $ne: true },
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: {
          year: { $isoWeekYear: '$createdAt' },
          week: { $isoWeek: '$createdAt' }
        },
        totalAmount: { $sum: '$totalAmount' },
        count: { $sum: 1 }
      }
    },
    { $sort: { '_id.year': 1, '_id.week': 1 } }
  ]);

  return result.map(r => ({
    year: r._id.year,
    week: r._id.week,
    totalAmount: r.totalAmount,
    count: r.count
  }));
};

// Static method to get approved tickets for billing
fieldTicketSchema.statics.getApprovedForBilling = async function(companyId) {
  return this.find({
    companyId,
    status: 'approved',
    claimId: null,
    isDeleted: { $ne: true }
  }).sort({ workDate: -1 });
};

// Instance method to submit for signature
fieldTicketSchema.methods.submitForSignature = function(userId) {
  if (this.photos.length === 0) {
    throw new Error('At least one photo is required before submitting');
  }
  this.status = 'pending_signature';
  this.submittedAt = new Date();
  this.submittedBy = userId;
  return this.save();
};

// Instance method to add inspector signature
fieldTicketSchema.methods.addSignature = function(signatureData) {
  this.inspectorSignature = signatureData;
  this.status = 'signed';
  return this.save();
};

// Instance method to approve
fieldTicketSchema.methods.approve = function(userId, notes) {
  if (!this.inspectorSignature) {
    throw new Error('Inspector signature required before approval');
  }
  this.status = 'approved';
  this.approvedAt = new Date();
  this.approvedBy = userId;
  this.approvalNotes = notes;
  return this.save();
};

// Instance method to dispute
fieldTicketSchema.methods.dispute = function(userId, reason, category, evidence) {
  this.status = 'disputed';
  this.isDisputed = true;
  this.disputedAt = new Date();
  this.disputedBy = userId;
  this.disputeReason = reason;
  if (category) this.disputeCategory = category;
  if (evidence && Array.isArray(evidence)) {
    this.disputeEvidence = evidence.map(e => ({
      ...e,
      addedAt: new Date(),
      addedBy: userId
    }));
  }
  return this.save();
};

// Instance method to resolve dispute
fieldTicketSchema.methods.resolveDispute = function(userId, resolution, evidence) {
  if (this.status !== 'disputed') {
    throw new Error('Only disputed tickets can be resolved');
  }
  this.disputeResolution = resolution;
  this.disputeResolvedAt = new Date();
  this.disputeResolvedBy = userId;
  // Revert to signed status so it can be re-approved
  this.status = 'signed';
  if (evidence && Array.isArray(evidence)) {
    const newEvidence = evidence.map(e => ({
      ...e,
      addedAt: new Date(),
      addedBy: userId
    }));
    this.disputeEvidence = [...(this.disputeEvidence || []), ...newEvidence];
  }
  return this.save();
};

module.exports = mongoose.model('FieldTicket', fieldTicketSchema);

