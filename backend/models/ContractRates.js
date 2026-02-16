/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * ContractRates Model
 *
 * Stores extracted rate data from MSA contracts. Feeds into LME labor totals,
 * field ticket T&M calculations, and PriceBook unit pricing.
 *
 * Rates are extracted from the MSA PDF by the RateExtractor service,
 * reviewed by an admin, and saved. Each company has one active rate set
 * per utility.
 *
 * @module models/ContractRates
 */

const mongoose = require('mongoose');

// Region-specific unit rate
const regionRateSchema = new mongoose.Schema({
  division: { type: String, required: true },   // 'Humboldt', 'East Bay', 'Kern', etc.
  rate: { type: Number, required: true },       // Dollar amount
}, { _id: false });

// Unit pricing (per work type)
const unitRateSchema = new mongoose.Schema({
  refCode: { type: String, required: true },        // '07-1', '08S-1', '56A-1'
  workType: { type: String, required: true },       // 'Pole Replacement', 'OH Replace Switches'
  unitDescription: { type: String, required: true },// 'Pole Replacement - Type 1'
  unitOfMeasure: { type: String, default: 'Each' }, // 'Each', 'Foot', 'Lump Sum', 'Cost Plus'
  laborPercent: { type: Number, default: 0 },       // 0.79 = 79%
  regionRates: [regionRateSchema],
}, { _id: false });

// Fringe breakdown
const fringeBreakdownSchema = new mongoose.Schema({
  healthWelfare: { type: Number, default: 0 },
  pension: { type: Number, default: 0 },
  payrollTaxes: { type: Number, default: 0 },
  insurance: { type: Number, default: 0 },
  overheadProfit: { type: Number, default: 0 },
  training: { type: Number, default: 0 },
  subsistence: { type: Number, default: 0 },
  other: { type: Number, default: 0 },
}, { _id: false });

// IBEW labor classification rate
const laborRateSchema = new mongoose.Schema({
  classification: { type: String, required: true }, // 'Journeyman Lineman', 'Foreman', 'General Foreman'
  baseWage: { type: Number, required: true },       // 72.26
  totalBurdenedRate: { type: Number, required: true }, // ~156.83 (all-in billable rate)
  fringes: fringeBreakdownSchema,
}, { _id: false });

// Crew member in a crew composition
const crewMemberSchema = new mongoose.Schema({
  classification: { type: String, required: true },
  count: { type: Number, required: true },
}, { _id: false });

// Crew composition rate (pre-calculated)
const crewRateSchema = new mongoose.Schema({
  crewSize: { type: Number, required: true },         // 4, 5, 6
  crewConfig: { type: String, required: true },       // '4-Man Crew #1'
  straightTimeRate: { type: Number, required: true },  // $/hr for full crew
  overtimeRate: { type: Number, default: 0 },          // 1.5x labor portion
  doubleTimeRate: { type: Number, default: 0 },        // 2x labor portion
  composition: [crewMemberSchema],
}, { _id: false });

// Equipment rate
const equipmentRateSchema = new mongoose.Schema({
  equipmentType: { type: String, required: true },    // 'Bucket Truck 65 ft 2WD'
  hourlyRate: { type: Number, default: 0 },
  dailyRate: { type: Number, default: 0 },
  weeklyRate: { type: Number, default: 0 },
  monthlyRate: { type: Number, default: 0 },
}, { _id: false });

// Main schema
const contractRatesSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  utilityCode: { type: String, required: true, default: 'PGE' },
  contractNumber: { type: String },
  effectiveDate: { type: Date },
  expirationDate: { type: Date },
  isActive: { type: Boolean, default: true },

  // Rate tables
  unitRates: [unitRateSchema],
  laborRates: [laborRateSchema],
  crewRates: [crewRateSchema],
  equipmentRates: [equipmentRateSchema],

  // Source file reference
  sourceFile: {
    r2Key: String,
    fileName: String,
    uploadedAt: { type: Date, default: Date.now },
  },

  // Metadata
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  parsedAt: Date,
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
  status: {
    type: String,
    enum: ['draft', 'reviewed', 'active', 'superseded'],
    default: 'draft',
  },
}, { timestamps: true });

// Indexes
contractRatesSchema.index({ companyId: 1, utilityCode: 1, isActive: 1 });
contractRatesSchema.index({ companyId: 1, status: 1 });

/**
 * Get the active contract rates for a company + utility.
 */
contractRatesSchema.statics.getActiveRates = function (companyId, utilityCode = 'PGE') {
  return this.findOne({ companyId, utilityCode, isActive: true, status: 'active' }).lean();
};

/**
 * Get labor rate for a specific classification.
 */
contractRatesSchema.methods.getLaborRate = function (classification) {
  return this.laborRates.find(
    r => r.classification.toLowerCase() === classification.toLowerCase()
  ) || null;
};

/**
 * Get unit rate for a specific ref code and division.
 */
contractRatesSchema.methods.getUnitRate = function (refCode, division) {
  const unit = this.unitRates.find(r => r.refCode === refCode);
  if (!unit) return null;
  const regionRate = unit.regionRates.find(r => r.division === division);
  return regionRate ? { ...unit.toObject(), rate: regionRate.rate } : null;
};

/**
 * Get equipment rate by type.
 */
contractRatesSchema.methods.getEquipmentRate = function (equipmentType) {
  return this.equipmentRates.find(
    r => r.equipmentType.toLowerCase().includes(equipmentType.toLowerCase())
  ) || null;
};

module.exports = mongoose.model('ContractRates', contractRatesSchema);
