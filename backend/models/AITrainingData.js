/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
const mongoose = require('mongoose');

/**
 * AI Training Data Model
 * 
 * Captures structured data from user actions to train AI for:
 * 1. Auto-filling forms based on job type, location, conditions
 * 2. Predicting dependencies based on job characteristics
 * 3. Estimating crew size, hours, materials based on similar jobs
 * 4. Suggesting pre-field checklist items based on patterns
 * 
 * Every time a user fills out a field, makes a decision, or completes
 * a form, we capture the INPUT (context) and OUTPUT (what they entered)
 * so the AI can learn the patterns.
 */

// Individual field entry - what was filled in
const fieldEntrySchema = new mongoose.Schema({
  fieldName: { type: String, required: true },  // e.g., "crew_size", "excavation_depth", "traffic_control_type"
  fieldType: { type: String, enum: ['text', 'number', 'boolean', 'date', 'select', 'multiselect'], default: 'text' },
  value: mongoose.Schema.Types.Mixed,  // The actual value entered
  previousValue: mongoose.Schema.Types.Mixed,  // If edited, what it was before
  confidence: { type: Number, min: 0, max: 1 },  // If AI suggested this, how confident
  wasAISuggested: { type: Boolean, default: false },  // Did AI suggest this value?
  wasAccepted: { type: Boolean, default: true },  // Did user accept AI suggestion or override?
  userOverride: mongoose.Schema.Types.Mixed,  // If user changed AI suggestion, what did they change it to?
});

// Form completion record - a filled-out form
const formCompletionSchema = new mongoose.Schema({
  formType: { type: String, required: true },  // e.g., "CWC", "As-Built", "Daily_Report", "Pre_Field_Checklist"
  formTemplateName: String,  // The template used
  fields: [fieldEntrySchema],
  completionTime: Number,  // How long it took to fill out (seconds) - faster = easier to predict
  editCount: { type: Number, default: 0 },  // How many times was this form edited?
});

// Main training data schema
const aiTrainingDataSchema = new mongoose.Schema({
  // === CONTEXT (INPUT FEATURES FOR AI) ===
  
  // Job characteristics
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
  jobType: String,  // e.g., "new_service", "repair", "upgrade", "emergency"
  orderType: String,  // From job package
  division: String,  // DA, etc.
  matCode: String,  // Material code
  
  // Location context
  address: String,
  city: String,
  zipCode: String,
  county: String,
  state: { type: String, default: 'CA' },
  // Geolocation for regional patterns
  latitude: Number,
  longitude: Number,
  
  // Job package context (what came from utility)
  hasUSADig: Boolean,
  hasTrafficControl: Boolean,
  hasPermit: Boolean,
  hasCivilWork: Boolean,
  requiresHeavyEquipment: Boolean,
  estimatedFootage: Number,  // Linear feet of work
  pipeSize: String,  // e.g., "2 inch", "4 inch"
  pipeType: String,  // e.g., "PE", "Steel"
  serviceType: String,  // e.g., "Gas", "Electric"
  
  // Site conditions (from pre-field)
  siteConditions: String,
  soilType: String,  // e.g., "rocky", "clay", "sandy"
  accessDifficulty: { type: String, enum: ['easy', 'moderate', 'difficult', 'very_difficult'] },
  trafficLevel: { type: String, enum: ['none', 'light', 'moderate', 'heavy'] },
  residentialCommercial: { type: String, enum: ['residential', 'commercial', 'industrial', 'mixed'] },
  
  // Weather at time of work (can correlate with decisions)
  weatherCondition: String,
  temperature: Number,
  
  // Crew context
  crewSize: Number,
  estimatedHours: Number,
  actualHours: Number,  // Filled in after completion
  foremanId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  foremanExperienceLevel: String,  // junior, mid, senior - affects how much AI should help
  
  // === OUTPUT (WHAT WE'RE TRAINING AI TO PREDICT) ===
  
  // Dependencies that were needed
  dependenciesUsed: [{
    type: { type: String },
    wasNeeded: Boolean,
    daysInAdvance: Number,  // How many days before work was this scheduled?
    ticketNumber: String,
    notes: String
  }],
  
  // Forms that were filled out
  formsCompleted: [formCompletionSchema],
  
  // Materials used (for future material prediction)
  materialsUsed: [{
    materialCode: String,
    materialName: String,
    quantity: Number,
    unit: String  // feet, each, etc.
  }],
  
  // Pre-field checklist decisions
  preFieldDecisions: [{
    checklistItem: String,  // e.g., "usa_dig", "traffic_control"
    wasChecked: Boolean,
    notes: String,
    actuallyNeeded: Boolean  // After job completion, was this actually needed?
  }],
  
  // Photos taken and their context
  photosTaken: [{
    photoType: String,  // "before", "during", "after", "issue", "as_built"
    description: String,
    tags: [String]
  }],
  
  // === OUTCOME (FOR QUALITY SCORING) ===
  
  // Was the job successful on first try?
  firstTimeSuccess: { type: Boolean, default: true },
  revisionsRequired: { type: Number, default: 0 },
  rejectionReasons: [String],
  
  // Customer/utility feedback
  utilityFeedback: String,
  qualityScore: { type: Number, min: 1, max: 5 },
  
  // === METADATA ===
  
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
  utilityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Utility' },
  
  // When this training data was captured
  capturedAt: { type: Date, default: Date.now },
  capturedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  // Data quality flags
  isComplete: { type: Boolean, default: false },  // Has all required fields?
  isValidated: { type: Boolean, default: false },  // Has been reviewed for accuracy?
  validatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  // For ML training
  isTrainingData: { type: Boolean, default: true },  // Include in training set?
  isTestData: { type: Boolean, default: false },  // Hold out for testing?

}, { timestamps: true });

// Indexes for efficient querying when training
aiTrainingDataSchema.index({ jobType: 1, city: 1 });
aiTrainingDataSchema.index({ companyId: 1, createdAt: -1 });
aiTrainingDataSchema.index({ utilityId: 1, orderType: 1 });
aiTrainingDataSchema.index({ isTrainingData: 1, isComplete: 1 });
aiTrainingDataSchema.index({ foremanId: 1 });  // For personalized predictions

module.exports = mongoose.model('AITrainingData', aiTrainingDataSchema);
