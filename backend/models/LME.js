/**
 * LME Model - Daily Statement of Labor, Material, and Equipment
 * 
 * PG&E official contractor timesheet format.
 */

const mongoose = require('mongoose');

const laborEntrySchema = new mongoose.Schema({
  craft: { type: String, required: true }, // GF, F, JL, AL, GM, EO, etc.
  name: { type: String, required: true },
  stHours: { type: Number, default: 0 }, // Straight time
  otHours: { type: Number, default: 0 }, // Overtime (1.5x)
  dtHours: { type: Number, default: 0 }, // Double time (2x)
  rate: { type: Number, required: true }, // Base hourly rate
  stAmount: { type: Number, default: 0 },
  otAmount: { type: Number, default: 0 },
  dtAmount: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
});

const materialEntrySchema = new mongoose.Schema({
  description: { type: String, required: true },
  unit: { type: String, default: 'EA' },
  quantity: { type: Number, default: 0 },
  unitCost: { type: Number, default: 0 },
  amount: { type: Number, default: 0 },
});

const equipmentEntrySchema = new mongoose.Schema({
  type: { type: String, required: true },
  unitNumber: String,
  hours: { type: Number, default: 0 },
  rate: { type: Number, default: 0 },
  amount: { type: Number, default: 0 },
});

const lmeSchema = new mongoose.Schema({
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  
  // LME identification
  lmeNumber: { type: String, required: true },
  date: { type: Date, required: true },
  sheetNumber: { type: String, default: '1' },
  totalSheets: { type: String, default: '1' },
  
  // Job info (denormalized for PDF generation)
  jobInfo: {
    pmNumber: String,
    woNumber: String,
    notificationNumber: String,
    address: String,
    city: String,
    poNumber: String,
    cwaNumber: String,
    fieldAuthNumber: String,
    corNumber: String,
  },
  
  // Work details
  startTime: String,
  endTime: String,
  workDescription: String,
  subcontractorName: String,
  missedMeals: { type: Number, default: 0 }, // 0.5 hrs each
  subsistanceCount: { type: Number, default: 0 },
  
  // Entries
  labor: [laborEntrySchema],
  materials: [materialEntrySchema],
  equipment: [equipmentEntrySchema],
  
  // Totals
  totals: {
    labor: { type: Number, default: 0 },
    material: { type: Number, default: 0 },
    equipment: { type: Number, default: 0 },
    grand: { type: Number, default: 0 },
  },
  
  // Workflow
  status: {
    type: String,
    enum: ['draft', 'submitted', 'approved', 'rejected', 'exported'],
    default: 'draft',
  },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  submittedAt: Date,
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: Date,
  rejectionReason: String,
  
  // Export tracking
  exports: [{
    format: String, // 'pdf', 'oracle', 'sap'
    exportedAt: Date,
    exportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  }],
  
  // Signature
  foremanSignature: String, // Base64 signature data
  foremanSignedAt: Date,
  pgeRepSignature: String,
  pgeRepName: String,
  pgeRepSignedAt: Date,
  
}, { timestamps: true });

// Indexes
lmeSchema.index({ jobId: 1, date: 1 });
lmeSchema.index({ companyId: 1, date: -1 });
lmeSchema.index({ lmeNumber: 1 }, { unique: true });

/**
 * Format for Oracle CATS time import
 */
lmeSchema.methods.toOracleCATS = function() {
  const entries = [];
  
  for (const labor of this.labor) {
    // Straight time entry
    if (labor.stHours > 0) {
      entries.push({
        PERNR: labor.name.replaceAll(/\s+/g, '_').toUpperCase(),
        WORKDATE: this.date.toISOString().split('T')[0].replaceAll('-', ''),
        CATSHOURS: labor.stHours.toFixed(2),
        AWART: '1001', // Regular time
        AUFNR: this.jobInfo.woNumber || '',
        POSID: this.jobInfo.pmNumber || '',
        LTXA1: `${this.jobInfo.address || ''} - ${labor.craft}`,
        LSTAR: labor.craft,
        RATE: labor.rate.toFixed(2),
        AMOUNT: labor.stAmount.toFixed(2),
      });
    }
    
    // Overtime entry
    if (labor.otHours > 0) {
      entries.push({
        PERNR: labor.name.replaceAll(/\s+/g, '_').toUpperCase(),
        WORKDATE: this.date.toISOString().split('T')[0].replaceAll('-', ''),
        CATSHOURS: labor.otHours.toFixed(2),
        AWART: '1510', // Overtime
        AUFNR: this.jobInfo.woNumber || '',
        POSID: this.jobInfo.pmNumber || '',
        LTXA1: `${this.jobInfo.address || ''} - ${labor.craft} OT`,
        LSTAR: labor.craft,
        RATE: (labor.rate * 1.5).toFixed(2),
        AMOUNT: labor.otAmount.toFixed(2),
      });
    }
    
    // Double time entry
    if (labor.dtHours > 0) {
      entries.push({
        PERNR: labor.name.replaceAll(/\s+/g, '_').toUpperCase(),
        WORKDATE: this.date.toISOString().split('T')[0].replaceAll('-', ''),
        CATSHOURS: labor.dtHours.toFixed(2),
        AWART: '1520', // Double time
        AUFNR: this.jobInfo.woNumber || '',
        POSID: this.jobInfo.pmNumber || '',
        LTXA1: `${this.jobInfo.address || ''} - ${labor.craft} DT`,
        LSTAR: labor.craft,
        RATE: (labor.rate * 2).toFixed(2),
        AMOUNT: labor.dtAmount.toFixed(2),
      });
    }
  }
  
  return {
    format: 'oracle_cats',
    lmeNumber: this.lmeNumber,
    date: this.date,
    entries,
    totals: this.totals,
  };
};

/**
 * Format for PG&E SAP integration
 */
lmeSchema.methods.toSAPFormat = function() {
  return {
    format: 'sap_lme',
    header: {
      LIFNR: 'ALVAH', // Vendor code
      BLDAT: this.date.toISOString().split('T')[0].replaceAll('-', ''),
      BUDAT: this.date.toISOString().split('T')[0].replaceAll('-', ''),
      BELNR: this.lmeNumber,
      AUFNR: this.jobInfo.woNumber || '',
      POSID: this.jobInfo.pmNumber || '',
      XBLNR: this.lmeNumber,
      BKTXT: this.workDescription?.substring(0, 50) || 'Daily LME',
    },
    laborLines: this.labor.map((l, idx) => ({
      BUZEI: String(idx + 1).padStart(3, '0'),
      WRBTR: l.totalAmount.toFixed(2),
      MWSKZ: '', // Tax code
      KOSTL: '', // Cost center
      AUFNR: this.jobInfo.woNumber || '',
      SGTXT: `${l.craft} - ${l.name} (ST:${l.stHours} OT:${l.otHours} DT:${l.dtHours})`,
    })),
    materialLines: this.materials.map((m, idx) => ({
      BUZEI: String(100 + idx + 1).padStart(3, '0'),
      WRBTR: m.amount.toFixed(2),
      MATNR: '', // Material number
      MENGE: m.quantity.toString(),
      MEINS: m.unit,
      SGTXT: m.description,
    })),
    equipmentLines: this.equipment.map((e, idx) => ({
      BUZEI: String(200 + idx + 1).padStart(3, '0'),
      WRBTR: e.amount.toFixed(2),
      SGTXT: `${e.type} - Unit ${e.unitNumber} (${e.hours} hrs)`,
    })),
    totals: this.totals,
  };
};

module.exports = mongoose.model('LME', lmeSchema);

