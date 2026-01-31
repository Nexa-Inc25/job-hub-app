/**
 * Job Hub Pro - Tailboard/JHA Model
 * Copyright (c) 2024-2026 Job Hub Pro. All Rights Reserved.
 * 
 * Daily tailboard meetings for crew safety briefings.
 * Records hazards, controls, PPE, and crew acknowledgments.
 */

const mongoose = require('mongoose');

// Crew member signature schema
const crewSignatureSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name: { type: String, required: true },
  role: { type: String, default: 'crew' },
  signatureData: String,  // Base64 encoded signature image
  signedAt: { type: Date, default: Date.now }
});

// Hazard analysis schema
const hazardSchema = new mongoose.Schema({
  category: {
    type: String,
    enum: [
      'electrical',
      'fall',
      'traffic',
      'excavation',
      'overhead',
      'environmental',
      'confined_space',
      'chemical',
      'ergonomic',
      'other'
    ],
    required: true
  },
  description: { type: String, required: true },
  controls: [String],  // Mitigation measures
  riskLevel: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  }
});

// PPE requirement schema
const ppeSchema = new mongoose.Schema({
  item: { type: String, required: true },
  checked: { type: Boolean, default: false }
});

// Main Tailboard schema
const tailboardSchema = new mongoose.Schema({
  // Link to job
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
  
  // Date/time of tailboard meeting
  date: { type: Date, required: true },
  startTime: String,  // "06:30" format
  
  // Location info (denormalized for quick reference)
  jobLocation: String,
  woNumber: String,
  
  // Foreman conducting tailboard
  foremanId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  foremanName: String,
  foremanSignature: String,  // Base64 encoded signature
  
  // Crew members present
  crewMembers: [crewSignatureSchema],
  
  // Work description
  taskDescription: { type: String, required: true },
  
  // Hazard Analysis (core of JHA)
  hazards: [hazardSchema],
  
  // PPE Requirements
  ppeRequired: [ppeSchema],
  
  // Emergency information
  emergencyContact: String,
  nearestHospital: String,
  
  // Weather/site conditions
  weatherConditions: String,
  siteConditions: String,
  
  // Additional safety notes
  additionalNotes: String,
  
  // Status tracking
  status: {
    type: String,
    enum: ['draft', 'completed', 'archived'],
    default: 'draft'
  },
  completedAt: Date,
  
  // For QR sharing (Phase 2)
  shareToken: String,
  shareTokenExpiry: Date
}, { timestamps: true });

// Indexes for efficient queries
tailboardSchema.index({ jobId: 1, date: -1 });
tailboardSchema.index({ foremanId: 1, date: -1 });
tailboardSchema.index({ companyId: 1, date: -1 });
tailboardSchema.index({ status: 1 });
tailboardSchema.index({ shareToken: 1 }, { sparse: true });

// Pre-defined hazard categories with common descriptions
tailboardSchema.statics.HAZARD_CATEGORIES = {
  electrical: {
    label: 'Electrical',
    commonHazards: [
      'Energized equipment',
      'Arc flash potential',
      'Exposed conductors',
      'Working near power lines'
    ],
    commonControls: [
      'De-energize and LOTO',
      'Maintain clearance distances',
      'Use insulated tools',
      'Wear arc-rated PPE'
    ]
  },
  fall: {
    label: 'Fall Protection',
    commonHazards: [
      'Working at heights',
      'Ladder work',
      'Unprotected edges',
      'Unstable surfaces'
    ],
    commonControls: [
      'Use fall protection harness',
      'Set up guardrails',
      'Inspect ladder before use',
      '3-point contact on ladders'
    ]
  },
  traffic: {
    label: 'Traffic Control',
    commonHazards: [
      'Work zone traffic',
      'Moving vehicles',
      'Limited visibility',
      'Pedestrian conflicts'
    ],
    commonControls: [
      'Set up traffic control plan',
      'Use flaggers',
      'Wear high-visibility vest',
      'Position escape routes'
    ]
  },
  excavation: {
    label: 'Excavation',
    commonHazards: [
      'Trench collapse',
      'Underground utilities',
      'Spoil pile hazards',
      'Water accumulation'
    ],
    commonControls: [
      'Call 811 / USA ticket',
      'Shore or slope trench',
      'Keep spoils back 2ft',
      'Competent person inspection'
    ]
  },
  overhead: {
    label: 'Overhead Work',
    commonHazards: [
      'Overhead power lines',
      'Falling objects',
      'Crane operations',
      'Suspended loads'
    ],
    commonControls: [
      'Maintain clearance from lines',
      'Use tag lines',
      'Establish drop zones',
      'Wear hard hat'
    ]
  },
  environmental: {
    label: 'Environmental',
    commonHazards: [
      'Heat stress',
      'Cold exposure',
      'Severe weather',
      'Sun exposure'
    ],
    commonControls: [
      'Hydration breaks',
      'Monitor weather conditions',
      'Provide shade/shelter',
      'Adjust work schedule'
    ]
  },
  confined_space: {
    label: 'Confined Space',
    commonHazards: [
      'Oxygen deficiency',
      'Toxic atmosphere',
      'Engulfment hazard',
      'Limited egress'
    ],
    commonControls: [
      'Atmospheric testing',
      'Ventilation',
      'Entry permit',
      'Rescue plan in place'
    ]
  },
  chemical: {
    label: 'Chemical/Materials',
    commonHazards: [
      'Hazardous materials',
      'Dust/fumes',
      'Skin contact',
      'Spill potential'
    ],
    commonControls: [
      'Review SDS',
      'Use appropriate PPE',
      'Proper ventilation',
      'Spill kit available'
    ]
  },
  ergonomic: {
    label: 'Ergonomic',
    commonHazards: [
      'Heavy lifting',
      'Repetitive motion',
      'Awkward positions',
      'Vibration exposure'
    ],
    commonControls: [
      'Use mechanical aids',
      'Team lifts for heavy items',
      'Rotate tasks',
      'Take stretch breaks'
    ]
  },
  other: {
    label: 'Other',
    commonHazards: [],
    commonControls: []
  }
};

// Pre-defined PPE items for utility work
tailboardSchema.statics.STANDARD_PPE = [
  { item: 'Hard Hat', category: 'head' },
  { item: 'Safety Glasses', category: 'eye' },
  { item: 'FR Clothing', category: 'body' },
  { item: 'High-Visibility Vest', category: 'body' },
  { item: 'Leather Gloves', category: 'hand' },
  { item: 'Rubber Insulating Gloves', category: 'hand' },
  { item: 'Steel-Toe Boots', category: 'foot' },
  { item: 'Hearing Protection', category: 'ear' },
  { item: 'Face Shield', category: 'face' },
  { item: 'Fall Protection Harness', category: 'fall' },
  { item: 'Respirator', category: 'respiratory' }
];

module.exports = mongoose.model('Tailboard', tailboardSchema);
