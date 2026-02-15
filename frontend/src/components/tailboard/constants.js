/**
 * Tailboard Form Constants
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 *
 * Shared constants for tailboard/JHA sub-components.
 */

// Helper function to get risk level color (avoids nested ternary)
export const getRiskLevelColor = (riskLevel) => {
  if (riskLevel === 'high') return 'error';
  if (riskLevel === 'medium') return 'warning';
  return 'success';
};

// Hazard category definitions
export const HAZARD_CATEGORIES = {
  electrical: {
    label: 'Electrical',
    icon: '⚡',
    color: '#f44336',
    commonHazards: ['Energized equipment', 'Arc flash potential', 'Exposed conductors', 'Working near power lines', 'Accidental contacts', 'Back-feed potential'],
    commonControls: ['De-energize and LOTO', 'Maintain clearance distances', 'Use insulated tools', 'Wear arc-rated PPE', 'Voltage testing', 'Rubber gloving']
  },
  fall: {
    label: 'Fall Protection',
    icon: '🪜',
    color: '#ff9800',
    commonHazards: ['Working at heights', 'Ladder work', 'Unprotected edges', 'Unstable surfaces', 'Open holes'],
    commonControls: ['Use fall protection harness', 'Set up guardrails', 'Inspect ladder before use', '3-point contact on ladders', 'Watch footing']
  },
  traffic: {
    label: 'Traffic Control',
    icon: '🚧',
    color: '#ff5722',
    commonHazards: ['Work zone traffic', 'Moving vehicles', 'Limited visibility', 'Pedestrian conflicts', 'Public safety'],
    commonControls: ['Set up traffic control plan', 'Use flaggers', 'Wear high-visibility vest', 'Position escape routes', 'Cone off work area']
  },
  excavation: {
    label: 'Excavation',
    icon: '🕳️',
    color: '#795548',
    commonHazards: ['Trench collapse', 'Underground utilities', 'Spoil pile hazards', 'Water accumulation'],
    commonControls: ['Call 811 / USA ticket', 'Shore or slope trench', 'Keep spoils back 2ft', 'Competent person inspection']
  },
  overhead: {
    label: 'Overhead Work',
    icon: '🏗️',
    color: '#9c27b0',
    commonHazards: ['Overhead power lines', 'Falling objects', 'Crane operations', 'Suspended loads', 'Overhead loads'],
    commonControls: ['Maintain clearance from lines', 'Use tag lines', 'Establish drop zones', 'Wear hard hat', 'Stay out from under loads']
  },
  rigging: {
    label: 'Rigging',
    icon: '🪝',
    color: '#673ab7',
    commonHazards: ['Rigging failure', 'Load shift', 'Overloading', 'Improper rigging'],
    commonControls: ['Inspect rigging before use', 'Verify load weight', 'Use proper rigging techniques', 'Boom spotter/backup']
  },
  environmental: {
    label: 'Environmental',
    icon: '🌡️',
    color: '#4caf50',
    commonHazards: ['Heat stress', 'Cold exposure', 'Severe weather', 'Sun exposure', 'Atmosphere/COVID'],
    commonControls: ['Hydration breaks', 'Monitor weather conditions', 'Provide shade/shelter', 'Adjust work schedule', 'Drink water']
  },
  confined_space: {
    label: 'Confined Space',
    icon: '🚪',
    color: '#607d8b',
    commonHazards: ['Oxygen deficiency', 'Toxic atmosphere', 'Engulfment hazard', 'Limited egress'],
    commonControls: ['Atmospheric testing', 'Ventilation', 'Entry permit', 'Rescue plan in place']
  },
  chemical: {
    label: 'Chemical/Materials',
    icon: '☢️',
    color: '#e91e63',
    commonHazards: ['Hazardous materials', 'Dust/fumes', 'Skin contact', 'Spill potential'],
    commonControls: ['Review SDS', 'Use appropriate PPE', 'Proper ventilation', 'Spill kit available']
  },
  ergonomic: {
    label: 'Ergonomic',
    icon: '💪',
    color: '#00bcd4',
    commonHazards: ['Heavy lifting', 'Repetitive motion', 'Awkward positions', 'Pulling tension', 'Slip/trip hazards'],
    commonControls: ['Use mechanical aids', 'Team lifts for heavy items', 'Rotate tasks', 'Take stretch breaks']
  },
  backing: {
    label: 'Backing/Vehicles',
    icon: '🚛',
    color: '#ff7043',
    commonHazards: ['Backing incidents', 'Limited visibility', 'Pedestrians in area'],
    commonControls: ['Use spotter when backing', 'GOAL (Get Out And Look)', '360 walk-around', 'Back into parking spots']
  },
  third_party: {
    label: '3rd Party Contractors',
    icon: '👷',
    color: '#8d6e63',
    commonHazards: ['Coordination issues', 'Unknown hazards', 'Communication gaps', 'New crew members'],
    commonControls: ['Pre-job briefing with all parties', 'Ask questions', '3 points contact', 'Verify certifications']
  },
  other: {
    label: 'Other',
    icon: '⚠️',
    color: '#9e9e9e',
    commonHazards: [],
    commonControls: []
  }
};

// Standard PPE items
export const STANDARD_PPE = [
  { item: 'Hard Hat', icon: '🪖' },
  { item: 'Safety Glasses', icon: '🥽' },
  { item: 'FR Clothing', icon: '👔' },
  { item: 'High-Visibility Vest', icon: '🦺' },
  { item: 'Leather Gloves', icon: '🧤' },
  { item: 'Rubber Insulating Gloves', icon: '🧤' },
  { item: 'Steel-Toe Boots', icon: '🥾' },
  { item: 'Hearing Protection', icon: '🎧' },
  { item: 'Face Shield', icon: '😷' },
  { item: 'Fall Protection Harness', icon: '🪢' }
];

// Special Mitigation Measures (from Alvah Electric Tailboard Form)
export const SPECIAL_MITIGATIONS = [
  { id: 'liveLineWork', label: 'Live-Line Work' },
  { id: 'rubberGloving', label: 'Rubber Gloving' },
  { id: 'backfeedDiscussed', label: 'Possible Back-feed Discussed' },
  { id: 'groundingPerTitle8', label: 'Grounding per Title 8 §2941' },
  { id: 'madDiscussed', label: 'MAD Discussed' },
  { id: 'ppeDiscussed', label: 'Personal Protective Equipment' },
  { id: 'publicPedestrianSafety', label: 'Public / Pedestrian Safety - T/C' },
  { id: 'rotationDiscussed', label: 'Rotation Discussed' },
  { id: 'phaseMarkingDiscussed', label: 'Phase Marking Discussed' },
  { id: 'voltageTesting', label: 'Voltage Testing' },
  { id: 'switchLog', label: 'Switch Log' },
  { id: 'dielectricInspection', label: 'Di-Electric & Live-Line Tool Inspection' },
  { id: 'adequateCover', label: 'Adequate Cover on Secondary Points of Contact' }
];

// UG Work Completed Checklist Items
export const UG_CHECKLIST_ITEMS = [
  { id: 'elbowsSeated', label: 'Are all Elbows Fully Seated?' },
  { id: 'deadbreakBails', label: 'Are all 200A Deadbreak Bails on?' },
  { id: 'groundsMadeUp', label: 'Are all Grounds Made Up (Splices, Switches, TX, etc.)?' },
  { id: 'bleedersInstalled', label: 'Bleeders all Installed?' },
  { id: 'tagsInstalledNewWork', label: 'Are all Tags Installed on New Work?' },
  { id: 'tagsUpdatedAdjacent', label: 'Have Tags Been Updated on Adjacent Equipment?' },
  { id: 'voltagePhaseTagsApplied', label: 'Correct Voltage & Phase Tags Applied?' },
  { id: 'primaryNeutralIdentified', label: 'Primary Neutral Identified - 4 KV & 21 KV?' },
  { id: 'spareDuctsPlugged', label: 'All Spare Ducts Plugged?' },
  { id: 'equipmentNumbersInstalled', label: 'Equipment Numbers Installed?' },
  { id: 'lidsFramesBonded', label: 'Lids or Frames Bonded?' },
  { id: 'allBoltsInstalled', label: 'All Bolts Installed on Lids?' },
  { id: 'equipmentBoltedDown', label: 'Is Equipment Bolted Down Correctly?' }
];

// Inspector options
export const INSPECTOR_OPTIONS = [
  { id: 'pge', label: 'PG&E' },
  { id: 'sce', label: 'SCE' },
  { id: 'sdge', label: 'SDG&E' },
  { id: 'smud', label: 'SMUD' },
  { id: 'other', label: 'Other' }
];
