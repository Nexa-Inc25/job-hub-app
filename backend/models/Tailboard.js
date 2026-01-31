/**
 * Job Hub Pro - Tailboard/JHA Model
 * Copyright (c) 2024-2026 Job Hub Pro. All Rights Reserved.
 * 
 * Daily tailboard meetings for crew safety briefings.
 * Records hazards, controls, PPE, and crew acknowledgments.
 * Based on Alvah Electric Tailboard Form structure.
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
      'rigging',
      'backing',
      'third_party',
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

// Special Mitigation Measures schema (Yes/No/NA checkboxes)
const mitigationCheckSchema = new mongoose.Schema({
  item: { type: String, required: true },
  value: { 
    type: String, 
    enum: ['yes', 'no', 'na', null],
    default: null 
  }
});

// Source Side Device schema
const sourceSideDeviceSchema = new mongoose.Schema({
  device: String,
  physicalLocation: String
});

// Grounding Location schema
const groundingLocationSchema = new mongoose.Schema({
  location: { type: String, required: true },
  installed: { type: Boolean, default: false },
  removed: { type: Boolean, default: false }
});

// UG Work Completed Checklist Item
const ugChecklistItemSchema = new mongoose.Schema({
  item: { type: String, required: true },
  value: { 
    type: String, 
    enum: ['yes', 'no', 'na', null],
    default: null 
  }
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
  jobAddress: String,
  woNumber: String,
  pmNumber: String,           // Project Management number (Alvah PM#)
  circuit: String,            // Circuit number for electrical work
  showUpYardLocation: String, // Where crew meets before heading to job
  
  // Foreman conducting tailboard
  foremanId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  foremanName: String,
  foremanSignature: String,  // Base64 encoded signature
  
  // General Foreman (Alvah has this as separate role)
  generalForemanId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  generalForemanName: String,
  
  // Inspector info
  inspector: {
    type: String,
    enum: ['pge', 'sce', 'sdge', 'smud', 'other', null],
    default: null
  },
  inspectorName: String,      // Used when inspector is 'other'
  
  // EIC (Employee In Charge) for electrical work
  eicName: String,
  eicPhone: String,
  
  // Crew members present
  crewMembers: [crewSignatureSchema],
  
  // Work description
  taskDescription: { type: String, required: true },
  jobSteps: String,           // Summary of work - job steps (from paper form)
  
  // Hazards Associated with Work (free-form text)
  hazardsDescription: String,
  
  // Mitigation Measures (free-form text)
  mitigationDescription: String,
  
  // Hazard Analysis (structured - core of JHA)
  hazards: [hazardSchema],
  
  // Special Mitigation Measures (Yes/No/NA checkboxes from Alvah form)
  specialMitigations: [mitigationCheckSchema],
  
  // PPE Requirements
  ppeRequired: [ppeSchema],
  
  // Source Side Devices section
  sourceSideDevices: [sourceSideDeviceSchema],
  
  // Grounding section (per Title 8 §2941)
  grounding: {
    needed: { type: String, enum: ['yes', 'no', null], default: null },
    accountedFor: { type: String, enum: ['yes', 'no', null], default: null },
    locations: [groundingLocationSchema]
  },
  
  // Line/Equipment Characteristics
  nominalVoltages: String,
  copperConditionInspected: { type: String, enum: ['yes', 'no', null], default: null },
  notTiedIntoCircuit: { type: Boolean, default: false },
  
  // UG Work Completed Checklist (for underground work)
  ugChecklist: [ugChecklistItemSchema],
  
  // Emergency information
  emergencyContact: String,
  emergencyPhone: String,
  nearestHospital: String,
  nearMissReporting: String,  // Near miss injuries & reporting info
  
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
      'Working near power lines',
      'Accidental contacts',
      'Back-feed potential'
    ],
    commonControls: [
      'De-energize and LOTO',
      'Maintain clearance distances',
      'Use insulated tools',
      'Wear arc-rated PPE',
      'Voltage testing before work',
      'Rubber gloving procedures'
    ]
  },
  fall: {
    label: 'Fall Protection',
    commonHazards: [
      'Working at heights',
      'Ladder work',
      'Unprotected edges',
      'Unstable surfaces',
      'Open holes'
    ],
    commonControls: [
      'Use fall protection harness',
      'Set up guardrails',
      'Inspect ladder before use',
      '3-point contact on ladders',
      'Watch footing'
    ]
  },
  traffic: {
    label: 'Traffic Control',
    commonHazards: [
      'Work zone traffic',
      'Moving vehicles',
      'Limited visibility',
      'Pedestrian conflicts',
      'Public safety'
    ],
    commonControls: [
      'Set up traffic control plan',
      'Use flaggers',
      'Wear high-visibility vest',
      'Position escape routes',
      'Cone off work area'
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
      'Suspended loads',
      'Overhead loads'
    ],
    commonControls: [
      'Maintain clearance from lines',
      'Use tag lines',
      'Establish drop zones',
      'Wear hard hat',
      'Stay out from under loads'
    ]
  },
  rigging: {
    label: 'Rigging',
    commonHazards: [
      'Rigging failure',
      'Load shift',
      'Overloading',
      'Improper rigging'
    ],
    commonControls: [
      'Inspect rigging before use',
      'Verify load weight',
      'Use proper rigging techniques',
      'Boom spotter/backup'
    ]
  },
  environmental: {
    label: 'Environmental',
    commonHazards: [
      'Heat stress',
      'Cold exposure',
      'Severe weather',
      'Sun exposure',
      'Atmosphere/COVID'
    ],
    commonControls: [
      'Hydration breaks',
      'Monitor weather conditions',
      'Provide shade/shelter',
      'Adjust work schedule',
      'Drink water'
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
      'Pulling tension',
      'Slip/trip hazards'
    ],
    commonControls: [
      'Use mechanical aids',
      'Team lifts for heavy items',
      'Rotate tasks',
      'Take stretch breaks'
    ]
  },
  backing: {
    label: 'Backing/Vehicles',
    commonHazards: [
      'Backing incidents',
      'Limited visibility',
      'Pedestrians in area'
    ],
    commonControls: [
      'Use spotter when backing',
      'GOAL (Get Out And Look)',
      '360 walk-around',
      'Back into parking spots'
    ]
  },
  third_party: {
    label: '3rd Party Contractors',
    commonHazards: [
      'Coordination issues',
      'Unknown hazards',
      'Communication gaps',
      'New crew members'
    ],
    commonControls: [
      'Pre-job briefing with all parties',
      'Ask questions',
      '3 points contact',
      'Verify certifications'
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

// Special Mitigation Measures (from Alvah Electric Tailboard Form)
tailboardSchema.statics.SPECIAL_MITIGATIONS = [
  { id: 'liveLineWork', label: 'Live-Line Work', category: 'electrical' },
  { id: 'rubberGloving', label: 'Rubber Gloving', category: 'electrical' },
  { id: 'backfeedDiscussed', label: 'Possible Back-feed Discussed', category: 'electrical' },
  { id: 'groundingPerTitle8', label: 'Grounding per Title 8 §2941', category: 'electrical' },
  { id: 'madDiscussed', label: 'MAD Discussed', category: 'electrical' },
  { id: 'ppeDiscussed', label: 'Personal Protective Equipment', category: 'ppe' },
  { id: 'publicPedestrianSafety', label: 'Public / Pedestrian Safety - T/C', category: 'traffic' },
  { id: 'rotationDiscussed', label: 'Rotation Discussed', category: 'electrical' },
  { id: 'phaseMarkingDiscussed', label: 'Phase Marking Discussed', category: 'electrical' },
  { id: 'voltageTesting', label: 'Voltage Testing', category: 'electrical' },
  { id: 'switchLog', label: 'Switch Log', category: 'electrical' },
  { id: 'dielectricInspection', label: 'Di-Electric & Live-Line Tool Inspection', category: 'electrical' },
  { id: 'adequateCover', label: 'Adequate Cover on Secondary Points of Contact', category: 'electrical' }
];

// UG (Underground) Work Completed Checklist Items
tailboardSchema.statics.UG_CHECKLIST_ITEMS = [
  { id: 'elbowsSeated', label: 'Are all Elbows Fully Seated?' },
  { id: 'deadbreakBails', label: 'Are all 200A Deadbreak Bails on?' },
  { id: 'groundsMadeUp', label: 'Are all Grounds Made Up (Splices, Switches, TX, etc.)?' },
  { id: 'bleedersInstalled', label: 'Bleeders all Installed (Bushing Inserts, Extensions, Elbows, Splices, Etc.)?' },
  { id: 'tagsInstalledNewWork', label: 'Are all Tags Installed on New Work?' },
  { id: 'tagsUpdatedAdjacent', label: 'Have Tags Been Updated on Adjacent Equipment?' },
  { id: 'voltagePhaseTagsApplied', label: 'Correct Voltage & Phase Tags Applied to Each Conductor?' },
  { id: 'primaryNeutralIdentified', label: 'Primary Neutral Identified - 4 KV & 21 KV?' },
  { id: 'spareDuctsPlugged', label: 'All Spare Ducts Plugged?' },
  { id: 'equipmentNumbersInstalled', label: 'Equipment Numbers Installed on New Equipment & Lid?' },
  { id: 'lidsFramesBonded', label: 'Lids or Frames Bonded?' },
  { id: 'allBoltsInstalled', label: 'All Bolts Installed on Lids?' },
  { id: 'equipmentBoltedDown', label: 'Is Equipment Bolted Down Correctly (Padmount TX, Switches, Switch Stands, etc.)?' }
];

// Inspector options
tailboardSchema.statics.INSPECTOR_OPTIONS = [
  { id: 'pge', label: 'PG&E' },
  { id: 'sce', label: 'SCE' },
  { id: 'sdge', label: 'SDG&E' },
  { id: 'smud', label: 'SMUD' },
  { id: 'other', label: 'Other' }
];

module.exports = mongoose.model('Tailboard', tailboardSchema);
