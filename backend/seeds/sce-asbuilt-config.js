/**
 * FieldLedger - SCE (Southern California Edison) As-Built Configuration Seed
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 *
 * Seeds the UtilityAsBuiltConfig with SCE's construction completion
 * documentation requirements. This is the second utility config and
 * validates that the config-driven architecture works for multiple
 * utilities without code changes.
 *
 * SCE references:
 *   - Distribution Construction Completion (DCC) Standards
 *   - SCE Electrical Drawing Standards (EDS)
 *   - SCE SAP Plant Maintenance naming conventions
 *
 * Usage: node seeds/sce-asbuilt-config.js
 *   or:  require('./seeds/sce-asbuilt-config').getSCEConfig()
 */

// ---- SCE Electrical Symbol SVG Paths ----
// Simplified SVG paths for rendering on construction sketches.
// SCE uses similar standard symbols to PG&E (IEEE Std 315 derived).

const SCE_SYMBOLS = [
  // --- Structures ---
  { code: 'POLE_WOOD', label: 'Wood Pole', category: 'structure', sortOrder: 1,
    svgPath: 'M16 2 L16 30 M10 30 L22 30', width: 32, height: 32 },
  { code: 'POLE_STEEL', label: 'Steel Pole', category: 'structure', sortOrder: 2,
    svgPath: 'M14 2 L14 30 M18 2 L18 30 M10 30 L22 30', width: 32, height: 32 },
  { code: 'POLE_FRP', label: 'FRP Pole (Composite)', category: 'structure', sortOrder: 3,
    svgPath: 'M13 2 L13 30 L19 30 L19 2 Z M10 30 L22 30 M14 6 L18 6', width: 32, height: 32 },
  { code: 'CROSSARM', label: 'Crossarm', category: 'structure', sortOrder: 4,
    svgPath: 'M4 16 L28 16 M16 12 L16 20', width: 32, height: 32 },
  { code: 'ANCHOR_GUY', label: 'Anchor / Guy', category: 'structure', sortOrder: 5,
    svgPath: 'M16 4 L8 28 L24 28 Z', width: 32, height: 32 },

  // --- Devices ---
  { code: 'XFMR_OH', label: 'Overhead Transformer', category: 'device', sortOrder: 1,
    svgPath: 'M16 4 L16 10 M10 10 A6 6 0 1 0 22 10 A6 6 0 1 0 10 10 M10 18 A6 6 0 1 0 22 18 A6 6 0 1 0 10 18 M16 24 L16 30', width: 32, height: 32 },
  { code: 'XFMR_PAD', label: 'Pad-Mount Transformer', category: 'device', sortOrder: 2,
    svgPath: 'M6 6 L26 6 L26 26 L6 26 Z M10 12 A6 6 0 1 0 22 12 A6 6 0 1 0 10 12 M10 20 A6 6 0 1 0 22 20 A6 6 0 1 0 10 20', width: 32, height: 32 },
  { code: 'FUSE_CUTOUT', label: 'Fuse Cutout', category: 'device', sortOrder: 3,
    svgPath: 'M16 4 L16 10 M12 10 L20 10 L20 22 L12 22 L12 10 M16 22 L16 28', width: 32, height: 32 },
  { code: 'SWITCH_GANG', label: 'Gang-Operated Switch', category: 'device', sortOrder: 4,
    svgPath: 'M6 16 L12 16 M12 16 L22 8 M20 16 L26 16', width: 32, height: 32 },
  { code: 'RECLOSER', label: 'Recloser', category: 'device', sortOrder: 5,
    svgPath: 'M8 8 L24 8 L24 24 L8 24 Z M12 16 L20 16 M16 12 L16 20', width: 32, height: 32 },
  { code: 'CAPACITOR', label: 'Capacitor Bank', category: 'device', sortOrder: 6,
    svgPath: 'M16 4 L16 12 M8 12 L24 12 M8 16 A8 8 0 0 0 24 16 M16 16 L16 28', width: 32, height: 32 },
  { code: 'REGULATOR', label: 'Voltage Regulator', category: 'device', sortOrder: 7,
    svgPath: 'M8 6 L24 6 L24 26 L8 26 Z M12 16 L20 16 M16 10 L16 22 M10 16 A6 6 0 1 0 22 16', width: 32, height: 32 },
  { code: 'STREETLIGHT', label: 'Streetlight', category: 'device', sortOrder: 8,
    svgPath: 'M16 4 L16 24 M10 24 L22 24 M12 8 L16 4 L20 8', width: 32, height: 32 },

  // --- Conductors ---
  { code: 'PRI_OH', label: 'Primary OH', category: 'conductor', sortOrder: 1,
    svgPath: 'M2 16 L30 16', width: 32, height: 8 },
  { code: 'SEC_OH', label: 'Secondary OH', category: 'conductor', sortOrder: 2,
    svgPath: 'M2 16 L30 16 M6 12 L6 20 M14 12 L14 20 M22 12 L22 20', width: 32, height: 8 },
  { code: 'PRI_UG', label: 'Primary UG', category: 'conductor', sortOrder: 3,
    svgPath: 'M2 16 L6 16 L8 12 L10 20 L12 12 L14 20 L16 12 L18 20 L20 12 L22 20 L24 12 L26 16 L30 16', width: 32, height: 8 },
  { code: 'SEC_UG', label: 'Secondary UG', category: 'conductor', sortOrder: 4,
    svgPath: 'M2 16 L4 16 M4 12 L4 20 M6 16 L8 16 L10 12 L12 20 L14 12 L16 20 L18 16 L20 16 M20 12 L20 20 M22 16 L30 16', width: 32, height: 8 },
  { code: 'NEUTRAL', label: 'Neutral', category: 'conductor', sortOrder: 5,
    svgPath: 'M2 16 L8 16 M10 16 L18 16 M20 16 L30 16', width: 32, height: 8 },
  { code: 'SERVICE_DROP', label: 'Service Drop', category: 'conductor', sortOrder: 6,
    svgPath: 'M2 12 Q16 24 30 12', width: 32, height: 16 },

  // --- Service / Underground ---
  { code: 'RISER', label: 'Riser', category: 'service', sortOrder: 1,
    svgPath: 'M16 2 L16 16 L16 30 M12 16 L20 16 M12 20 L20 20 M12 24 L20 24', width: 32, height: 32 },
  { code: 'GROUND_ROD', label: 'Ground Rod', category: 'service', sortOrder: 2,
    svgPath: 'M16 4 L16 20 M10 20 L22 20 M12 24 L20 24 M14 28 L18 28', width: 32, height: 32 },
  { code: 'HANDHOLE', label: 'Handhole', category: 'underground', sortOrder: 1,
    svgPath: 'M8 8 L24 8 L24 24 L8 24 Z M12 12 L20 12 L20 20 L12 20 Z', width: 32, height: 32 },
  { code: 'CONDUIT', label: 'Conduit', category: 'underground', sortOrder: 2,
    svgPath: 'M2 12 L30 12 M2 20 L30 20', width: 32, height: 8 },

  // --- Markers ---
  { code: 'REMOVE_X', label: 'Remove (X)', category: 'marker', sortOrder: 1,
    svgPath: 'M4 4 L28 28 M28 4 L4 28', width: 32, height: 32,
    allowedColors: ['red'] },
  { code: 'NEW_INSTALL', label: 'New Install (+)', category: 'marker', sortOrder: 2,
    svgPath: 'M16 4 L16 28 M4 16 L28 16', width: 32, height: 32,
    allowedColors: ['blue'] },
  { code: 'EXISTING', label: 'Existing (no change)', category: 'marker', sortOrder: 3,
    svgPath: 'M8 8 L24 8 L24 24 L8 24 Z', width: 32, height: 32,
    allowedColors: ['black'] },
];

// ---- SCE DCC Checklist Items ----
// Based on SCE Distribution Construction Completion checklist standards.

const SCE_DCC_OH_ITEMS = [
  { number: 1, text: 'POLES — New pole properly set, plumb, and tamped', safetyCritical: true },
  { number: 2, text: 'POLES — Visibility strips installed (reflective tape at 10 ft)', safetyCritical: true },
  { number: 3, text: 'POLES — Old pole removed and stub cut to grade (if applicable)' },
  { number: 4, text: 'GUYS — Guy wires tensioned properly, guard installed', safetyCritical: true },
  { number: 5, text: 'GUYS — Anchor rods installed per standard' },
  { number: 6, text: 'HARDWARE — All bolts tightened and cotter keys installed' },
  { number: 7, text: 'HARDWARE — Climbing space clear of obstructions' },
  { number: 8, text: 'CONDUCTORS — GO 95 clearances met at all points', safetyCritical: true },
  { number: 9, text: 'CONDUCTORS — Proper connectors used (compression/wedge)' },
  { number: 10, text: 'CONDUCTORS — Sagging per design (check at mid-span)' },
  { number: 11, text: 'EQUIPMENT — Transformers properly mounted, cover secured', safetyCritical: true },
  { number: 12, text: 'EQUIPMENT — Fuse cutouts/switches properly installed and operable' },
  { number: 13, text: 'EQUIPMENT — Equipment nameplate data matches SAP' },
  { number: 14, text: 'GROUNDS — System neutral bonded to ground rod', safetyCritical: true },
  { number: 15, text: 'GROUNDS — Ground resistance meets specifications' },
  { number: 16, text: 'SERVICES — Customer service drop properly connected' },
  { number: 17, text: 'SERVICES — Service clearances per GO 95' },
  { number: 18, text: 'SIGNS — High-voltage warning signs posted per standard', safetyCritical: true },
  { number: 19, text: 'VEGETATION — No vegetation contacts with conductors', safetyCritical: true },
  { number: 20, text: 'SITE — Jobsite clean, no unused materials left on-site' },
];

const SCE_DCC_UG_ITEMS = [
  { number: 1, text: 'ENCLOSURES — All lids secured, bolted, and flush with grade', safetyCritical: true },
  { number: 2, text: 'ENCLOSURES — Proper identification tags installed' },
  { number: 3, text: 'PAD-MOUNTS — Properly anchored per SCE standard', safetyCritical: true },
  { number: 4, text: 'PAD-MOUNTS — Door bolted and padlocked' },
  { number: 5, text: 'PAD-MOUNTS — Warning labels on exterior' },
  { number: 6, text: 'PAD-MOUNTS — 8 ft clearance zone maintained' },
  { number: 7, text: 'CABLES — Phase tags on all primary terminations' },
  { number: 8, text: 'CABLES — Cable protectors/terminators installed' },
  { number: 9, text: 'CABLES — Elbows properly seated and tested' },
  { number: 10, text: 'GROUNDING — Ground connections per specification', safetyCritical: true },
  { number: 11, text: 'GROUNDING — All metallic parts bonded' },
  { number: 12, text: 'CONDUIT — Duct banks sealed, spare conduits capped' },
  { number: 13, text: 'CONDUIT — Pull rope installed in spare conduits' },
  { number: 14, text: 'TRENCH — Backfill compacted per specification' },
  { number: 15, text: 'TRENCH — Warning tape installed at correct depth' },
  { number: 16, text: 'SITE — All excavation restored to pre-existing condition' },
];

// ---- Full SCE Config Object ----

function getSCEConfig() {
  return {
    utilityName: 'Southern California Edison',
    utilityCode: 'SCE',
    procedureId: 'DCC-100',
    procedureName: 'Distribution Construction Completion',
    procedureVersion: 'Rev 3',
    effectiveDate: new Date('2025-03-01'),
    isActive: true,

    pageRanges: [
      { sectionType: 'face_sheet', label: 'SCE Job Summary Sheet', start: 1, end: 2,
        detectionKeyword: 'JOB SUMMARY SHEET' },
      { sectionType: 'crew_instructions', label: 'Crew Work Instructions', start: 3, end: 5,
        detectionKeyword: 'WORK INSTRUCTIONS' },
      { sectionType: 'crew_materials', label: 'Material List', start: 6, end: 7,
        detectionKeyword: 'MATERIAL LIST' },
      { sectionType: 'equipment_info', label: 'Equipment Data Sheet', start: 8, end: 9,
        detectionKeyword: 'EQUIPMENT DATA' },
      { sectionType: 'construction_sketch', label: 'Construction Drawing', start: 10, end: 13,
        detectionKeyword: 'CONSTRUCTION DRAWING', variableLength: true },
      { sectionType: 'circuit_map', label: 'Circuit Map', start: 14, end: 14,
        detectionKeyword: 'CIRCUIT MAP' },
      { sectionType: 'permits', label: 'Encroachment/City Permits', start: 15, end: 18,
        detectionKeyword: 'PERMIT', variableLength: true },
      { sectionType: 'tcp', label: 'Traffic Control Plan', start: 19, end: 20,
        detectionKeyword: 'TRAFFIC CONTROL' },
      { sectionType: 'billing_form', label: 'Progress Billing Form', start: 21, end: 22,
        detectionKeyword: 'PROGRESS BILLING' },
      { sectionType: 'ccsc', label: 'Distribution Construction Completion Checklist', start: 23, end: 25,
        detectionKeyword: 'Construction Completion' },
    ],

    workTypes: [
      {
        code: 'capital',
        label: 'Capital Construction',
        description: 'Capital jobs — new construction, line extension, capacity upgrades, system improvements.',
        requiredDocs: ['face_sheet', 'equipment_info', 'construction_sketch', 'ccsc', 'billing_form'],
        optionalDocs: ['permits', 'tcp', 'crew_instructions', 'crew_materials'],
        requiresSketchMarkup: true,
        allowBuiltAsDesigned: true,
      },
      {
        code: 'maintenance',
        label: 'Maintenance / Corrective',
        description: 'Corrective maintenance — pole replacement, equipment change-out, damage repair.',
        requiredDocs: ['equipment_info', 'construction_sketch', 'ccsc'],
        optionalDocs: ['billing_form', 'permits'],
        requiresSketchMarkup: true,
        allowBuiltAsDesigned: true,
      },
      {
        code: 'emergency',
        label: 'Emergency Restoration',
        description: 'Emergency response — storm damage, vehicle hit, fire damage restoration.',
        requiredDocs: ['equipment_info', 'ccsc'],
        optionalDocs: ['construction_sketch', 'billing_form'],
        requiresSketchMarkup: false,
        allowBuiltAsDesigned: true,
      },
    ],

    checklist: {
      formId: 'DCC-100-F01',
      formName: 'SCE Distribution Construction Completion Checklist',
      version: 'Rev 3 (01/15/2025)',
      requiresCrewLeadSignature: true,
      requiresSupervisorSignature: true,
      requiresComments: true,
      sections: [
        { code: 'OH', label: 'Overhead', items: SCE_DCC_OH_ITEMS },
        { code: 'UG', label: 'Underground', items: SCE_DCC_UG_ITEMS },
      ],
    },

    symbolLibrary: {
      standardId: 'EDS-200',
      standardName: 'SCE Electrical Drawing Standards',
      version: 'Current',
      symbols: SCE_SYMBOLS,
    },

    documentCompletions: [
      {
        sectionType: 'face_sheet',
        label: 'Job Summary Completion',
        fields: [
          { fieldName: 'woNumber', label: 'Work Order #', type: 'text', required: true, autoFillFrom: 'job.woNumber' },
          { fieldName: 'completionDate', label: 'Completion Date', type: 'date', required: true, autoFillFrom: 'today' },
          { fieldName: 'foremanName', label: 'Foreman Name', type: 'text', required: true, autoFillFrom: 'user.name' },
          { fieldName: 'signature', label: 'Foreman Signature', type: 'signature', required: true },
        ],
      },
      {
        sectionType: 'ccsc',
        label: 'DCC Checklist Completion',
        fields: [
          { fieldName: 'woNumber', label: 'Work Order #', type: 'text', required: true, autoFillFrom: 'job.woNumber' },
          { fieldName: 'circuitId', label: 'Circuit ID', type: 'text', required: true, autoFillFrom: 'job.circuitId' },
          { fieldName: 'address', label: 'Job Location', type: 'text', required: true, autoFillFrom: 'job.address' },
          { fieldName: 'comments', label: 'Comments / Exceptions', type: 'text', required: false },
          { fieldName: 'crewLeadSignature', label: 'Crew Lead Signature', type: 'signature', required: true },
          { fieldName: 'supervisorSignature', label: 'Supervisor Signature', type: 'signature', required: true },
          { fieldName: 'completionDate', label: 'Date', type: 'date', required: true, autoFillFrom: 'today' },
        ],
      },
    ],

    colorConventions: [
      { color: 'red', hex: '#CC0000', label: 'Red', meaning: 'Removed / Demolished / Changed from design', shortcut: 'R' },
      { color: 'blue', hex: '#0033CC', label: 'Blue', meaning: 'New installation / As-built addition', shortcut: 'B' },
      { color: 'black', hex: '#000000', label: 'Black', meaning: 'Existing / Unchanged / Reference', shortcut: 'K' },
    ],

    validationRules: [
      { code: 'SKETCH_MARKUP', target: 'sketch_markup', rule: 'required_unless', condition: 'built_as_designed',
        description: 'Construction drawing must have markup or be marked "Built As Designed"', severity: 'error' },
      { code: 'CCSC_COMPLETE', target: 'ccsc_completed', rule: 'required',
        description: 'DCC checklist must be completed', severity: 'error' },
      { code: 'CCSC_SIGNED', target: 'ccsc_signature', rule: 'signature_required',
        description: 'DCC checklist requires crew lead signature', severity: 'error' },
      { code: 'SUPERVISOR_SIGNED', target: 'supervisor_signature', rule: 'signature_required',
        description: 'DCC checklist requires supervisor signature', severity: 'error' },
      { code: 'COMPLETION_PHOTOS', target: 'completion_photos', rule: 'min_count', minValue: 2,
        description: 'At least two completion photos required (before/after)', severity: 'warning' },
      { code: 'GPS_PRESENT', target: 'gps_coordinates', rule: 'gps_required',
        description: 'GPS coordinates required for asset location', severity: 'warning' },
    ],

    namingConventions: [
      { documentType: 'as_built_package', pattern: '{PM}_ASBUILT_{DATE}', example: '4501234567_ASBUILT_20250310' },
      { documentType: 'construction_sketch', pattern: '{PM}_DWG_{REV}', example: '4501234567_DWG_R0' },
      { documentType: 'ccsc', pattern: '{PM}_DCC_{SEQ}', example: '4501234567_DCC_001' },
      { documentType: 'photos', pattern: '{PM}_PHOTO_{SEQ}', example: '4501234567_PHOTO_001' },
    ],

    // SCE-specific score thresholds (higher than defaults)
    scoreThresholds: {
      usability: 65,
      traceability: 70,
      verification: 75,
      accuracy: 80,
      overall: 75,
    },
  };
}

module.exports = { getSCEConfig };
