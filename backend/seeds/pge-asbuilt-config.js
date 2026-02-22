/**
 * FieldLedger - PG&E As-Built Configuration Seed
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Seeds the UtilityAsBuiltConfig with PG&E TD-2051P-10 (Rev 0, 2025).
 * This is the first utility config; others follow the same schema.
 * 
 * Usage: node seeds/pge-asbuilt-config.js
 *   or:  require('./seeds/pge-asbuilt-config').getPGEConfig()
 */

// ---- PG&E Electrical Symbol SVG Paths (TD-9213S) ----
// Simplified SVG paths for rendering on construction sketches.
// viewBox 0 0 32 32 for all symbols.

const PGE_SYMBOLS = [
  // --- Structures ---
  { code: 'POLE_WOOD', label: 'Wood Pole', category: 'structure', sortOrder: 1,
    svgPath: 'M16 2 L16 30 M10 30 L22 30', width: 32, height: 32 },
  { code: 'POLE_STEEL', label: 'Steel Pole', category: 'structure', sortOrder: 2,
    svgPath: 'M14 2 L14 30 M18 2 L18 30 M10 30 L22 30', width: 32, height: 32 },
  { code: 'POLE_CONCRETE', label: 'Concrete Pole', category: 'structure', sortOrder: 3,
    svgPath: 'M13 2 L13 30 L19 30 L19 2 Z M10 30 L22 30', width: 32, height: 32 },
  { code: 'CROSSARM', label: 'Crossarm', category: 'structure', sortOrder: 4,
    svgPath: 'M4 16 L28 16 M16 12 L16 20', width: 32, height: 32 },
  { code: 'PUSH_BRACE', label: 'Push Brace', category: 'structure', sortOrder: 5,
    svgPath: 'M8 28 L24 4 M16 2 L16 30', width: 32, height: 32 },
  { code: 'STUB_POLE', label: 'Stub Pole', category: 'structure', sortOrder: 6,
    svgPath: 'M16 10 L16 30 M10 30 L22 30 M12 10 L20 10', width: 32, height: 32 },
  { code: 'ANCHOR', label: 'Anchor/Guy', category: 'structure', sortOrder: 7,
    svgPath: 'M16 4 L8 28 L24 28 Z', width: 32, height: 32 },

  // --- Devices ---
  { code: 'XFMR_OH', label: 'Transformer (OH)', category: 'device', sortOrder: 1,
    svgPath: 'M16 4 L16 10 M10 10 A6 6 0 1 0 22 10 A6 6 0 1 0 10 10 M10 18 A6 6 0 1 0 22 18 A6 6 0 1 0 10 18 M16 24 L16 30', width: 32, height: 32 },
  { code: 'XFMR_PAD', label: 'Transformer (Pad)', category: 'device', sortOrder: 2,
    svgPath: 'M6 6 L26 6 L26 26 L6 26 Z M10 12 A6 6 0 1 0 22 12 A6 6 0 1 0 10 12 M10 20 A6 6 0 1 0 22 20 A6 6 0 1 0 10 20', width: 32, height: 32 },
  { code: 'FUSE_CUTOUT', label: 'Fuse Cutout', category: 'device', sortOrder: 3,
    svgPath: 'M16 4 L16 10 M12 10 L20 10 L20 22 L12 22 L12 10 M16 22 L16 28', width: 32, height: 32 },
  { code: 'SWITCH_GANG', label: 'Gang Switch', category: 'device', sortOrder: 4,
    svgPath: 'M6 16 L12 16 M12 16 L22 8 M20 16 L26 16', width: 32, height: 32 },
  { code: 'SWITCH_DISC', label: 'Disconnect Switch', category: 'device', sortOrder: 5,
    svgPath: 'M6 16 L12 16 L22 6 M20 16 L26 16 M20 14 L20 18', width: 32, height: 32 },
  { code: 'RECLOSER', label: 'Recloser', category: 'device', sortOrder: 6,
    svgPath: 'M8 8 L24 8 L24 24 L8 24 Z M12 16 L20 16 M16 12 L16 20', width: 32, height: 32 },
  { code: 'CAPACITOR', label: 'Capacitor', category: 'device', sortOrder: 7,
    svgPath: 'M16 4 L16 12 M8 12 L24 12 M8 16 A8 8 0 0 0 24 16 M16 16 L16 28', width: 32, height: 32 },
  { code: 'REGULATOR', label: 'Voltage Regulator', category: 'device', sortOrder: 8,
    svgPath: 'M8 6 L24 6 L24 26 L8 26 Z M12 16 L20 16 M16 10 L16 22 M10 16 A6 6 0 1 0 22 16', width: 32, height: 32 },
  { code: 'STREETLIGHT', label: 'Streetlight', category: 'device', sortOrder: 9,
    svgPath: 'M16 4 L16 24 M10 24 L22 24 M12 8 L16 4 L20 8', width: 32, height: 32 },
  { code: 'METER', label: 'Meter', category: 'device', sortOrder: 10,
    svgPath: 'M16 2 A12 12 0 1 0 16 26 A12 12 0 1 0 16 2 M10 14 L22 14 M16 8 L16 20', width: 32, height: 32 },

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
  { code: 'GUY_WIRE', label: 'Guy Wire', category: 'conductor', sortOrder: 7,
    svgPath: 'M4 4 L28 28 M4 8 L8 4 M24 28 L28 24', width: 32, height: 32 },

  // --- Service/Underground ---
  { code: 'RISER', label: 'Riser', category: 'service', sortOrder: 1,
    svgPath: 'M16 2 L16 16 L16 30 M12 16 L20 16 M12 20 L20 20 M12 24 L20 24', width: 32, height: 32 },
  { code: 'GROUND_ROD', label: 'Ground Rod', category: 'service', sortOrder: 2,
    svgPath: 'M16 4 L16 20 M10 20 L22 20 M12 24 L20 24 M14 28 L18 28', width: 32, height: 32 },
  { code: 'HANDHOLE', label: 'Handhole', category: 'underground', sortOrder: 1,
    svgPath: 'M8 8 L24 8 L24 24 L8 24 Z M12 12 L20 12 L20 20 L12 20 Z', width: 32, height: 32 },
  { code: 'MANHOLE', label: 'Manhole', category: 'underground', sortOrder: 2,
    svgPath: 'M4 16 A12 12 0 1 0 28 16 A12 12 0 1 0 4 16 M10 10 L22 22 M22 10 L10 22', width: 32, height: 32 },
  { code: 'CONDUIT', label: 'Conduit', category: 'underground', sortOrder: 3,
    svgPath: 'M2 12 L30 12 M2 20 L30 20', width: 32, height: 8 },

  // --- Markers ---
  { code: 'REMOVE_X', label: 'Remove (X)', category: 'marker', sortOrder: 1,
    svgPath: 'M4 4 L28 28 M28 4 L4 28', width: 32, height: 32,
    allowedColors: ['red'] },
  { code: 'NEW_INSTALL', label: 'New Install', category: 'marker', sortOrder: 2,
    svgPath: 'M16 4 L16 28 M4 16 L28 16', width: 32, height: 32,
    allowedColors: ['blue'] },
  { code: 'TRANSFER', label: 'Transfer', category: 'marker', sortOrder: 3,
    svgPath: 'M4 16 L14 16 L10 12 M14 16 L10 20 M18 16 L28 16 L24 12 M28 16 L24 20', width: 32, height: 32 },
  { code: 'EXISTING', label: 'Existing (no change)', category: 'marker', sortOrder: 4,
    svgPath: 'M8 8 L24 8 L24 24 L8 24 Z', width: 32, height: 32,
    allowedColors: ['black'] },
];

// ---- PG&E CCSC Checklist Items (TD-2504P-01-F01 Rev 6) ----

const PGE_CCSC_OH_ITEMS = [
  { number: 1, text: 'POLES – Visibility strips installed per standard', safetyCritical: true },
  { number: 2, text: 'POLES – Bottom pole step 8½ ft or more above ground or climbable surface', safetyCritical: true },
  { number: 3, text: 'GUYS – Marker installed on all guys (visibility strips as required)' },
  { number: 4, text: 'GUYS – No broken, slack, or missing guy wires', safetyCritical: true },
  { number: 5, text: 'GUYS – Preforms completed and guy wire ends not exposed' },
  { number: 6, text: 'GUYS – Guy insulator (bobs) 3 in. or more apart' },
  { number: 7, text: 'GUYS – Trees not grounding guy wire above guy insulator' },
  { number: 8, text: 'GUYS – 3 in. clearance from Communication, Cable, Secondary, and/or Service' },
  { number: 9, text: 'GUYS – Guy insulators 8 ft or more above ground' },
  { number: 10, text: 'GUYS – Anchor rod installed per standard; ID tag installed' },
  { number: 11, text: 'HARDWARE – Covers installed over bolts in climbing space' },
  { number: 12, text: 'HARDWARE – Pole line hardware not loose and installed per standard' },
  { number: 13, text: 'CONDUCTORS – G.O. 95 clearances maintained above ground throughout entire span', safetyCritical: true },
  { number: 14, text: 'CONDUCTORS – G.O. 95 clearances maintained to other conductors, guys, and equipment', safetyCritical: true },
  { number: 15, text: 'CONDUCTORS – Connectors installed per standard (type, cleaned, inhibitor, dies, crimps)' },
  { number: 16, text: 'RISERS – All lags installed in first section of molding' },
  { number: 17, text: 'HIGH-VOLTAGE – Signs installed per standard', safetyCritical: true },
  { number: 18, text: 'GROUNDS – Ground rod(s) and wire(s) not exposed', safetyCritical: true },
  { number: 19, text: 'SERVICES – Proper clearances maintained (above ground, streets, from communications)' },
  { number: 20, text: 'SERVICES – Checked/removed vegetation excessive strain and abrasion on service(s)' },
  { number: 21, text: 'HFTD – 10 ft radial minimum clearance provisions addressed on subject poles', safetyCritical: true },
  { number: 22, text: 'EQUIPMENT – OH equipment secured and locked' },
  { number: 23, text: 'THIRD PARTY – Assessed third-party condition(s); create notification if required' },
  { number: 24, text: 'VEGETATION – No vegetation within 18" of primary', safetyCritical: true },
  { number: 25, text: 'VEGETATION – HFTD/SRA: No vegetation within 4 ft of primary conductors', safetyCritical: true },
  { number: 26, text: 'VEGETATION – Checked/removed excessive strain and abrasion on secondary and guy wires' },
  { number: 27, text: 'VERIFY jobsite is clean and idle material is removed' },
];

const PGE_CCSC_UG_ITEMS = [
  { number: 1, text: 'ENCLOSURES – Lid secured (bolted, no public hazard)', safetyCritical: true },
  { number: 2, text: 'ENCLOSURES – Set at grade/level, no tripping hazard', safetyCritical: true },
  { number: 3, text: 'ENCLOSURES – HV, Ownership, and Equipment # on lid' },
  { number: 4, text: 'PAD-MOUNTS – Securely anchored per standard' },
  { number: 5, text: 'PAD-MOUNTS – Caulking applied, no gaps' },
  { number: 6, text: 'PAD-MOUNTS – Windows grouted' },
  { number: 7, text: 'PAD-MOUNTS – HV/8 ft clearance label on exterior door' },
  { number: 8, text: 'PAD-MOUNTS – Equipment # installed on interior/exterior' },
  { number: 9, text: 'PAD-MOUNTS – Exterior door bolted and locked', safetyCritical: true },
  { number: 10, text: 'PAD-MOUNTS – 8 ft working space in front of doors' },
  { number: 11, text: 'PAD-MOUNTS – Barrier posts installed as required (visibility strips, locked)' },
  { number: 12, text: 'LIVE-FRONT – HV barricade installed and signed', safetyCritical: true },
  { number: 13, text: 'LIVE-FRONT – Stress cone tape not split or damaged' },
  { number: 14, text: 'SUB-SURFACE – Operating # installed inside enclosure' },
  { number: 15, text: 'GROUNDING – H0/Ground Buss/Ring Buss/Ground source sized and installed correctly', safetyCritical: true },
  { number: 16, text: 'GROUNDING – Exterior ground rod not exposed' },
  { number: 17, text: 'GROUNDING – Connections installed per standard (type, surface cleaned, dies, crimps)' },
  { number: 18, text: 'CABLES – Voltage/phase tags on primary cables' },
  { number: 19, text: 'CABLES – Secondary and service tags installed' },
  { number: 20, text: 'CABLES – Cable protector or duct terminators installed' },
  { number: 21, text: 'TERMINATIONS – Bleeder wire(s) installed' },
  { number: 22, text: 'TERMINATIONS – Capacitance test cap installed' },
  { number: 23, text: 'TERMINATIONS – Hold-down bail secure/on straight' },
  { number: 24, text: 'VERIFY jobsite is clean and idle material is removed' },
];

// ---- Full PG&E Config Object ----

function getPGEConfig() {
  return {
    utilityName: 'Pacific Gas and Electric Company',
    utilityCode: 'PGE',
    procedureId: 'TD-2051P-10',
    procedureName: 'As-Built Procedure',
    procedureVersion: 'Rev 1',
    effectiveDate: new Date('2025-01-01'),
    isActive: true,

    // Page ranges are FALLBACK only — actual page detection uses keywords
    // because job packages are NOT always uploaded in the same page order.
    // The detectionKeywords are matched against each page's text content.
    pageRanges: [
      { sectionType: 'ec_tag', label: 'EC Tag', start: 1, end: 2,
        detectionKeyword: 'Electric Overhead Tag', variableLength: true,
        detectionKeywordsAlt: ['Electric Underground Tag', 'Field Disposition Activity', 'Completed or Canceled in Field'] },
      { sectionType: 'face_sheet', label: 'PGE Face Sheet', start: 1, end: 3,
        detectionKeyword: 'Contractor Face Sheet',
        detectionKeywordsAlt: ['Construction Foreman Sign-Off', 'Estimated Job Package'] },
      { sectionType: 'crew_instructions', label: 'Crew Instructions', start: 4, end: 6,
        detectionKeyword: 'CREW INSTRUCTIONS',
        detectionKeywordsAlt: ['Crew Instruction'] },
      { sectionType: 'crew_materials', label: 'Crew Materials', start: 7, end: 7,
        detectionKeyword: 'CREW MATERIALS',
        detectionKeywordsAlt: ['Material List', 'Crew Material'] },
      { sectionType: 'equipment_info', label: 'Electric Equipment/Pole Info', start: 8, end: 9,
        detectionKeyword: 'Electric Equipment/Pole Information',
        detectionKeywordsAlt: ['Electrical Equipment and Pole', 'OH/UG Equipment'] },
      { sectionType: 'feedback_form', label: 'Construction Feedback Form', start: 10, end: 10,
        detectionKeyword: 'CONSTRUCTION FEEDBACK',
        detectionKeywordsAlt: ['Feedback Form'] },
      { sectionType: 'construction_sketch', label: 'Construction Sketch', start: 11, end: 14,
        detectionKeyword: 'SCALE:', variableLength: true,
        detectionKeywordsAlt: ['Construction Drawing', 'SKETCH'] },
      { sectionType: 'circuit_map', label: 'Circuit Map Change Sheet', start: 15, end: 15,
        detectionKeyword: 'Circuit Map Change Sheet',
        detectionKeywordsAlt: ['Circuit Map'] },
      { sectionType: 'permits', label: 'City Permits', start: 16, end: 21,
        detectionKeyword: 'PERMIT', variableLength: true },
      { sectionType: 'tcp', label: 'Traffic Control Plan', start: 22, end: 23,
        detectionKeyword: 'TRAFFIC CONTROL' },
      { sectionType: 'job_checklist', label: 'Electric Job Package Checklist', start: 24, end: 24,
        detectionKeyword: 'JOB PACKAGE CHECKLIST',
        detectionKeywordsAlt: ['Job Package Checklist', 'Electric Job Checklist'] },
      { sectionType: 'unit_price_completion', label: 'Distribution Unit Price Completion Form', start: 25, end: 26,
        detectionKeyword: 'Distribution Unit Price Completion Form',
        detectionKeywordsAlt: ['Unit Price Completion', 'Exhibit B'] },
      { sectionType: 'billing_form', label: 'Pole Replacement Progress Billing', start: 27, end: 27,
        detectionKeyword: 'Progress Billing / Project Completion Form',
        detectionKeywordsAlt: ['Progress Billing', 'Project Completion Form'] },
      { sectionType: 'paving_form', label: 'Field Paving Form', start: 28, end: 29,
        detectionKeyword: 'PAVING FORM',
        detectionKeywordsAlt: ['Field Paving', 'Paving Information'] },
      { sectionType: 'cwc', label: 'Contractor Work Checklist', start: 30, end: 31,
        detectionKeyword: 'Contractor Work Checklist',
        detectionKeywordsAlt: ['CWC', 'Work Checklist'] },
      { sectionType: 'ccsc', label: 'Construction Completion Standards Checklist', start: 32, end: 33,
        detectionKeyword: 'Distribution Construction Completion',
        detectionKeywordsAlt: ['Construction Completion Standards', 'CCSC'] },
    ],

    workTypes: [
      {
        code: 'estimated',
        label: 'Estimated Work',
        description: 'Standard estimated jobs — pole replacement (07D), line extension, service upgrade, bare wire, etc.',
        requiredDocs: ['ec_tag', 'face_sheet', 'equipment_info', 'construction_sketch', 'ccsc', 'billing_form'],
        optionalDocs: ['paving_form', 'permits', 'tcp', 'crew_instructions', 'unit_price_completion', 'cwc'],
        requiresSketchMarkup: true,
        allowBuiltAsDesigned: true,
      },
      {
        code: 'ec_corrective',
        label: 'EC Tag Work',
        description: 'Electric corrective maintenance from EC tags — pole replacement, switch replacement, etc.',
        requiredDocs: ['ec_tag', 'equipment_info', 'construction_sketch', 'ccsc'],
        optionalDocs: ['billing_form', 'unit_price_completion', 'cwc'],
        requiresSketchMarkup: true,
        allowBuiltAsDesigned: true,
      },
    ],

    checklist: {
      formId: 'TD-2504P-01-F01',
      formName: 'Distribution Construction Completion Standards Checklist (CCSC)',
      version: 'Rev 6 (04/06/2024)',
      requiresCrewLeadSignature: true,
      requiresSupervisorSignature: false,
      requiresComments: false,
      sections: [
        { code: 'OH', label: 'Overhead', items: PGE_CCSC_OH_ITEMS },
        { code: 'UG', label: 'Underground', items: PGE_CCSC_UG_ITEMS },
      ],
    },

    symbolLibrary: {
      standardId: 'TD-9213S',
      standardName: 'Uniform Symbols for Electric Estimating and Mapping',
      version: 'Current',
      symbols: PGE_SYMBOLS,
    },

    documentCompletions: [
      {
        // EC Tag Completion — calibrated against FOREMAN_DOC_PM-46271318 (Letter 612x792)
        // Page 1: Header + Item Details + Completion fields at bottom
        sectionType: 'ec_tag',
        label: 'EC Tag Completion',
        fields: [
          {
            fieldName: 'lanId', label: 'LAN ID', type: 'lanId', required: true,
            autoFillFrom: 'user.lanId',
            helpText: 'Your utility LAN ID (e.g., AB1C)',
            // "Completed or Canceled in Field By (LAN ID):" label at (21.25, 235.26)
            // Fill area starts after label text
            position: { pageOffset: 0, x: 205, y: 235, width: 150, fontSize: 9 },
            zoomRegion: { x: 15, y: 220, width: 580, height: 40 },
          },
          {
            fieldName: 'completionDate', label: 'Completion Date', type: 'date', required: true,
            autoFillFrom: 'today',
            // "Complete or Cancel Date: ______________" at (21.25, 217.85)
            position: { pageOffset: 0, x: 170, y: 218, width: 55, fontSize: 9 },
            zoomRegion: { x: 15, y: 205, width: 320, height: 35 },
          },
          {
            fieldName: 'actualHours', label: 'Actual Hours', type: 'number', required: true,
            autoFillFrom: 'timesheet.totalHours',
            helpText: 'Total crew hours for this job (auto-filled from timesheet)',
            // "Actual Hours:" at (211.18, 217.85), fill at (270.71, 217.85)
            position: { pageOffset: 0, x: 271, y: 218, width: 50, fontSize: 9 },
            zoomRegion: { x: 205, y: 205, width: 130, height: 35 },
          },
          {
            fieldName: 'completionType', label: 'Status', type: 'select', required: true,
            options: ['Completed', 'Canceled', 'Found Completed Upon Arrival'],
            // Checkboxes at y≈197: Completed (130,197), Canceled (278,197), Found (416,197)
            // Stamp text of the selected option next to its checkbox position
            position: { pageOffset: 0, x: 130, y: 197, width: 10, fontSize: 9 },
            zoomRegion: { x: 15, y: 185, width: 580, height: 30 },
            // Checkbox positions for each option
            optionPositions: {
              'Completed': { x: 130, y: 197 },
              'Canceled': { x: 278, y: 197 },
              'Found Completed Upon Arrival': { x: 416, y: 197 },
            },
          },
          {
            fieldName: 'crewType', label: 'Crew Type', type: 'select', required: true,
            options: ['PG&E Crew', 'T-Man', 'Contractor'],
            // Checkboxes at y≈218: PG&E Crew (385,218), T-Man (465,218), Contractor (519,218)
            position: { pageOffset: 0, x: 385, y: 218, width: 10, fontSize: 9 },
            zoomRegion: { x: 330, y: 205, width: 260, height: 35 },
            optionPositions: {
              'PG&E Crew': { x: 385, y: 218 },
              'T-Man': { x: 465, y: 218 },
              'Contractor': { x: 519, y: 218 },
            },
          },
          {
            fieldName: 'signature', label: 'Signature', type: 'signature', required: true,
            // "Signature:" at (21.26, 173.11), fill underline at (69.44, 173.11)
            position: { pageOffset: 0, x: 70, y: 160, width: 520, height: 25, fontSize: 10 },
            zoomRegion: { x: 15, y: 150, width: 580, height: 40 },
          },
        ],
      },
      {
        // Face Sheet Sign-Off — calibrated against Estimated_Job_Package.pdf page 2 (A4 595x842)
        // Page 1 (pageOffset:0) = info/totals, Page 2 (pageOffset:1) = sign-off section
        sectionType: 'face_sheet',
        label: 'Face Sheet Completion',
        fields: [
          // --- Sign-off checkboxes (page 2 of face sheet, pageOffset: 1) ---
          {
            fieldName: 'builtAsDesigned', label: 'Built as Designed', type: 'checkbox', required: false,
            helpText: 'Check if construction matches the design — no redlines needed',
            // "Built as Designed" label at (12.78, 711.38), checkbox goes LEFT of text
            position: { pageOffset: 1, x: 2, y: 711, width: 10, height: 10, fontSize: 10 },
            zoomRegion: { x: 0, y: 695, width: 580, height: 50 },
          },
          {
            fieldName: 'redlined', label: 'Redlined', type: 'checkbox', required: false,
            helpText: 'Check if changes from design were made and marked in red on the sketch',
            // "Redlined" label at (239.56, 711.38)
            position: { pageOffset: 1, x: 228, y: 711, width: 10, height: 10, fontSize: 10 },
            zoomRegion: { x: 0, y: 695, width: 580, height: 50 },
          },
          {
            fieldName: 'feedbackFormCompleted', label: 'Feedback Form completed', type: 'checkbox', required: false,
            // "Feedback Form completed" label at (409.65, 711.38)
            position: { pageOffset: 1, x: 398, y: 711, width: 10, height: 10, fontSize: 10 },
            zoomRegion: { x: 0, y: 695, width: 580, height: 50 },
          },
          // --- Foreman signature line (page 2) ---
          {
            fieldName: 'foremanSignature', label: 'Foreman Signature', type: 'signature', required: true,
            // Between date separator (y≈686) and label "Foreman's Signature" (y=668.9)
            position: { pageOffset: 1, x: 12, y: 678, width: 260, height: 22, fontSize: 10 },
            zoomRegion: { x: 0, y: 660, width: 580, height: 55 },
          },
          {
            fieldName: 'foremanLanId', label: 'Foreman LAN ID', type: 'lanId', required: true,
            autoFillFrom: 'user.lanId',
            // "Lan ID" label at (296.22, 668.9), fill above
            position: { pageOffset: 1, x: 296, y: 685, width: 130, fontSize: 10 },
            zoomRegion: { x: 280, y: 665, width: 200, height: 45 },
          },
          {
            fieldName: 'foremanDate', label: 'Foreman Date', type: 'date', required: true,
            autoFillFrom: 'today',
            // "mm/dd/yy" labels at (469.14, 668.9), date separator "/" at (491.82, 685.88)
            position: { pageOffset: 1, x: 469, y: 685, width: 100, fontSize: 10 },
            zoomRegion: { x: 460, y: 665, width: 130, height: 45 },
          },
          // --- Supervisor signature line (page 2) ---
          {
            fieldName: 'supervisorSignature', label: 'Supervisor Signature', type: 'signature', required: false,
            // Between date separator (y≈652) and label "Supervisor's Signature" (y=634.88)
            position: { pageOffset: 1, x: 12, y: 644, width: 260, height: 22, fontSize: 10 },
            zoomRegion: { x: 0, y: 626, width: 580, height: 55 },
          },
          {
            fieldName: 'supervisorLanId', label: 'Supervisor LAN ID', type: 'lanId', required: false,
            // "Lan ID" label at (296.22, 634.88), fill above
            position: { pageOffset: 1, x: 296, y: 651, width: 130, fontSize: 10 },
            zoomRegion: { x: 280, y: 631, width: 200, height: 45 },
          },
          {
            fieldName: 'supervisorDate', label: 'Supervisor Date', type: 'date', required: false,
            // "mm/dd/yy" at (469.14, 634.88)
            position: { pageOffset: 1, x: 469, y: 651, width: 100, fontSize: 10 },
            zoomRegion: { x: 460, y: 631, width: 130, height: 45 },
          },
        ],
      },
      {
        // Equipment Info — calibrated against Electrical_Equipment_and_Pole_Informatio.pdf (Letter 612x792)
        // "Electric Equipment/Pole Information" title at (202.14, 734.2)
        // OH/UG Equipment table headers at y=665.12: LOC.#, EQP.#, SIZE, INST., REM., SERIAL#, MFG., MFG.DATE
        // Poles table headers at y=426.03: LOC.#, HEIGHT, CLASS, INST., REM., ABN., POLE NUMBER, JT.
        sectionType: 'equipment_info',
        label: 'Equipment Info Completion',
        fields: [
          {
            fieldName: 'oldPoleNumber', label: 'Old Pole #', type: 'text', required: false,
            helpText: 'SAP number of the pole being replaced (if applicable)',
            // Poles table REM. column at x≈219, first data row below header y=426
            position: { pageOffset: 0, x: 325, y: 410, width: 150, fontSize: 9 },
            zoomRegion: { x: 30, y: 395, width: 550, height: 40 },
          },
          {
            fieldName: 'newPoleNumber', label: 'New Pole #', type: 'text', required: false,
            helpText: 'SAP number of the new pole installed',
            // POLE NUMBER column at x≈325, INST. row
            position: { pageOffset: 0, x: 325, y: 395, width: 150, fontSize: 9 },
            zoomRegion: { x: 30, y: 380, width: 550, height: 40 },
          },
          {
            fieldName: 'poleHeight', label: 'Pole Height (ft)', type: 'number', required: false,
            helpText: 'Height of installed pole in feet',
            // HEIGHT column at x≈102
            position: { pageOffset: 0, x: 102, y: 410, width: 35, fontSize: 9 },
            zoomRegion: { x: 30, y: 395, width: 200, height: 40 },
          },
          {
            fieldName: 'poleClass', label: 'Pole Class', type: 'text', required: false,
            helpText: 'Class of pole (e.g., 2, 3, 4, 5)',
            // CLASS column at x≈145
            position: { pageOffset: 0, x: 145, y: 410, width: 30, fontSize: 9 },
            zoomRegion: { x: 100, y: 395, width: 130, height: 40 },
          },
          {
            fieldName: 'transformerSerial', label: 'Transformer Serial #', type: 'text', required: false,
            helpText: 'Serial number of new transformer (if applicable)',
            // OH/UG Equipment SERIAL# column at x≈318, first data row below y=665
            position: { pageOffset: 0, x: 318, y: 648, width: 120, fontSize: 9 },
            zoomRegion: { x: 30, y: 633, width: 550, height: 40 },
          },
          {
            fieldName: 'meterNumber', label: 'Meter #', type: 'text', required: false,
            helpText: 'Meter number (if service work)',
            // EQP.# column at x≈123
            position: { pageOffset: 0, x: 123, y: 648, width: 50, fontSize: 9 },
            zoomRegion: { x: 30, y: 633, width: 250, height: 40 },
          },
        ],
      },
      {
        // CCSC — calibrated against FOREMAN_DOC page 10 (Rev 7, Letter 612x792)
        // Also validated against standalone CCSC_FORM.pdf (Rev 6)
        // Header: "PM/Order #" at (51.48, 715.32), "Location #" at (210, 715.32),
        //   "Address or GPS:" at (297.72, 715.32)
        // Footer: "LAN ID:" at (34.44, 80.64), "Date:" at (206.52, 80.64),
        //   "Signature:" at (34.44, 64.32), "Crew Lead:" at (322.2, 95.04)
        sectionType: 'ccsc',
        label: 'CCSC Completion',
        fields: [
          {
            fieldName: 'pmNumber', label: 'PM/Order #', type: 'text', required: true,
            autoFillFrom: 'job.pmNumber',
            // "PM/Order # ____" at (51.48, 715.32) — fill after label ~x=105
            position: { pageOffset: 0, x: 105, y: 715, width: 100, fontSize: 9 },
            zoomRegion: { x: 40, y: 700, width: 260, height: 35 },
          },
          {
            fieldName: 'locationNumber', label: 'Location #', type: 'text', required: false,
            autoFillFrom: 'job.locationNumber',
            // "Location # ___" at (210, 715.32) — fill after label ~x=250
            position: { pageOffset: 0, x: 250, y: 715, width: 42, fontSize: 9 },
            zoomRegion: { x: 200, y: 700, width: 100, height: 35 },
          },
          {
            fieldName: 'address', label: 'Address or GPS', type: 'text', required: true,
            autoFillFrom: 'job.address',
            // "Address or GPS: ___" at (297.72, 715.32) — fill after label ~x=378
            position: { pageOffset: 0, x: 378, y: 715, width: 200, fontSize: 8 },
            zoomRegion: { x: 290, y: 700, width: 300, height: 35 },
          },
          {
            fieldName: 'foremanLanId', label: 'LAN ID', type: 'lanId', required: true,
            autoFillFrom: 'user.lanId',
            // "LAN ID:" at (34.44, 80.64) — fill after label ~x=66
            position: { pageOffset: 0, x: 66, y: 81, width: 100, fontSize: 9 },
            zoomRegion: { x: 28, y: 60, width: 200, height: 40 },
          },
          {
            fieldName: 'completionDate', label: 'Date', type: 'date', required: true,
            autoFillFrom: 'today',
            // "Date:" at (206.52, 80.64) — fill after label ~x=228
            position: { pageOffset: 0, x: 228, y: 81, width: 80, fontSize: 9 },
            zoomRegion: { x: 200, y: 60, width: 120, height: 40 },
          },
          {
            fieldName: 'crewLeadSignature', label: 'Crew Lead Signature', type: 'signature', required: true,
            // "Signature:" at (34.44, 64.32) — fill after label ~x=75
            position: { pageOffset: 0, x: 75, y: 48, width: 120, height: 25, fontSize: 10 },
            zoomRegion: { x: 28, y: 35, width: 200, height: 50 },
          },
          {
            fieldName: 'foremanName', label: 'Crew Lead Name', type: 'text', required: true,
            autoFillFrom: 'user.name',
            // Right column: "Crew Lead:" at (322.2, 95.04)
            position: { pageOffset: 0, x: 400, y: 95, width: 180, fontSize: 9 },
            zoomRegion: { x: 310, y: 80, width: 280, height: 35 },
          },
          {
            fieldName: 'comments', label: 'Comments', type: 'text', required: false,
            helpText: 'Any notes about checklist items (optional)',
            // "COMMENTS" at (324, 196.08) — right column comments area
            position: { pageOffset: 0, x: 324, y: 180, width: 250, fontSize: 8 },
            zoomRegion: { x: 310, y: 165, width: 280, height: 50 },
          },
        ],
      },
      {
        // Progress Billing — calibrated against FOREMAN_DOC page 7 (Letter 612x792)
        // "Pole Replacement Progress Billing / Project Completion Form (Types 1-4)" at (75.6, 712.08)
        sectionType: 'billing_form',
        label: 'Progress Billing Completion',
        fields: [
          {
            fieldName: 'contractorName', label: 'Contractor', type: 'text', required: true,
            autoFillFrom: 'company.name',
            // "Contractor:" at (75.6, 685.08) → fill at ~130
            position: { pageOffset: 0, x: 130, y: 685, width: 200, fontSize: 10 },
            zoomRegion: { x: 70, y: 670, width: 300, height: 30 },
          },
          {
            fieldName: 'poNumber', label: 'Purchase Order #', type: 'text', required: false,
            // "Purchase Order #:" at (75.6, 670.44) → fill at ~155
            position: { pageOffset: 0, x: 155, y: 670, width: 150, fontSize: 10 },
            zoomRegion: { x: 70, y: 655, width: 300, height: 30 },
          },
          {
            fieldName: 'pmNumber', label: 'PM Order #', type: 'text', required: true,
            autoFillFrom: 'job.pmNumber',
            // "PM Order #:" at (75.6, 656.04) → fill at ~130
            position: { pageOffset: 0, x: 130, y: 656, width: 150, fontSize: 10 },
            zoomRegion: { x: 70, y: 641, width: 300, height: 30 },
          },
          {
            fieldName: 'notificationNumber', label: 'Notification #', type: 'text', required: false,
            autoFillFrom: 'job.notificationNumber',
            // "Notification #:" at (75.6, 641.64) → fill at ~140
            position: { pageOffset: 0, x: 140, y: 642, width: 150, fontSize: 10 },
            zoomRegion: { x: 70, y: 627, width: 300, height: 30 },
          },
          {
            fieldName: 'address', label: 'Address', type: 'text', required: true,
            autoFillFrom: 'job.address',
            // "Address:" at (75.6, 627.24) → fill at ~115
            position: { pageOffset: 0, x: 115, y: 627, width: 400, fontSize: 9 },
            zoomRegion: { x: 70, y: 612, width: 500, height: 30 },
          },
          {
            fieldName: 'locationNumber', label: 'Location #', type: 'text', required: false,
            autoFillFrom: 'job.locationNumber',
            // "Location #:" at (75.6, 612.84) → fill at ~125
            position: { pageOffset: 0, x: 125, y: 613, width: 150, fontSize: 10 },
            zoomRegion: { x: 70, y: 598, width: 300, height: 30 },
          },
          {
            fieldName: 'completionDate', label: 'Date', type: 'date', required: true,
            autoFillFrom: 'today',
            // "Date:" at (75.6, 598.44) → fill at ~100
            position: { pageOffset: 0, x: 100, y: 598, width: 100, fontSize: 10 },
            zoomRegion: { x: 70, y: 583, width: 300, height: 30 },
          },
          {
            fieldName: 'contractorSignature', label: 'Contractor Signature', type: 'signature', required: true,
            // "Contractor Representative Signed" at (339.96, 120.24) — line above
            position: { pageOffset: 0, x: 330, y: 125, width: 200, height: 30, fontSize: 10 },
            zoomRegion: { x: 320, y: 110, width: 250, height: 50 },
          },
          {
            fieldName: 'contractorPrintedName', label: 'Contractor Printed Name', type: 'text', required: true,
            autoFillFrom: 'user.name',
            // "Contractor Printed Name" at (357.24, 84.24) — line above
            position: { pageOffset: 0, x: 340, y: 95, width: 200, fontSize: 10 },
            zoomRegion: { x: 320, y: 75, width: 250, height: 35 },
          },
        ],
      },
      {
        // Unit Price Completion Form — calibrated against FOREMAN_DOC page 9 (Letter 612x792)
        // "Distribution Unit Price Completion Form – Exhibit B" at (27.96, 737.04)
        sectionType: 'unit_price_completion',
        label: 'Unit Price Completion Form',
        fields: [
          {
            fieldName: 'completionDate', label: 'Date', type: 'date', required: true,
            autoFillFrom: 'today',
            // "DATE:" at (27, 694.2), fill underline at (58.56, 694.2)
            position: { pageOffset: 0, x: 58, y: 694, width: 75, fontSize: 10 },
            zoomRegion: { x: 20, y: 680, width: 120, height: 30 },
          },
          {
            fieldName: 'pmNumber', label: 'PM/Order #', type: 'text', required: true,
            autoFillFrom: 'job.pmNumber',
            // "PM/ORDER #:" at (138.96, 694.2), fill at (210.72, 694.2)
            position: { pageOffset: 0, x: 211, y: 694, width: 75, fontSize: 10 },
            zoomRegion: { x: 130, y: 680, width: 165, height: 30 },
          },
          {
            fieldName: 'notificationNumber', label: 'Notification #', type: 'text', required: false,
            autoFillFrom: 'job.notificationNumber',
            // "NOTIFICATION #:" at (293.76, 694.2), fill at (379.92, 694.2)
            position: { pageOffset: 0, x: 380, y: 694, width: 100, fontSize: 10 },
            zoomRegion: { x: 285, y: 680, width: 200, height: 30 },
          },
          {
            fieldName: 'locationNumber', label: 'Location #', type: 'text', required: false,
            autoFillFrom: 'job.locationNumber',
            // "LOCATION #:" at (486.96, 694.2), fill at (552.48, 694.2)
            position: { pageOffset: 0, x: 553, y: 694, width: 35, fontSize: 10 },
            zoomRegion: { x: 480, y: 680, width: 120, height: 30 },
          },
          {
            fieldName: 'contractorSignature', label: 'Contractor Signature', type: 'signature', required: true,
            // Signature line at (328.17, 104.63)
            position: { pageOffset: 0, x: 328, y: 105, width: 200, height: 25, fontSize: 10 },
            zoomRegion: { x: 320, y: 90, width: 260, height: 40 },
          },
          {
            fieldName: 'contractorPrintedName', label: 'Contractor Name & LAN ID', type: 'text', required: true,
            autoFillFrom: 'user.name',
            // "Contractor Representative - Print Name, LAN ID" at (332.76, 82.32)
            position: { pageOffset: 0, x: 335, y: 83, width: 230, fontSize: 9 },
            zoomRegion: { x: 320, y: 70, width: 260, height: 30 },
          },
        ],
      },
      {
        // CWC (Contractor Work Checklist) — calibrated against Contractor_Work_Checklist_GF.pdf (Letter 612x792)
        // "Contractor Work Checklist" header at (41.4, 718.92)
        sectionType: 'cwc',
        label: 'Contractor Work Checklist',
        fields: [
          {
            fieldName: 'pmNumber', label: 'PM #', type: 'text', required: true,
            autoFillFrom: 'job.pmNumber',
            // "PM #:" at (41.76, 693.96) → fill at ~70
            position: { pageOffset: 0, x: 70, y: 694, width: 100, fontSize: 10 },
            zoomRegion: { x: 35, y: 680, width: 140, height: 30 },
          },
          {
            fieldName: 'notificationNumber', label: 'Notification #', type: 'text', required: false,
            autoFillFrom: 'job.notificationNumber',
            // "NOTIFICATION #:" at (176.52, 693.96) → fill at ~262
            position: { pageOffset: 0, x: 262, y: 694, width: 100, fontSize: 10 },
            zoomRegion: { x: 170, y: 680, width: 200, height: 30 },
          },
          {
            fieldName: 'dueDate', label: 'Due Date', type: 'date', required: false,
            autoFillFrom: 'job.dueDate',
            // "DUE DATE:" at (387.6, 693.96) → fill at ~445
            position: { pageOffset: 0, x: 445, y: 694, width: 100, fontSize: 10 },
            zoomRegion: { x: 380, y: 680, width: 180, height: 30 },
          },
          {
            fieldName: 'contractorName', label: 'Contractor', type: 'text', required: true,
            autoFillFrom: 'company.name',
            // "CONTRACTOR:" at (41.89, 673.61) → fill at ~120
            position: { pageOffset: 0, x: 120, y: 674, width: 200, fontSize: 10 },
            zoomRegion: { x: 35, y: 659, width: 300, height: 30 },
          },
          {
            fieldName: 'completionDate', label: 'Date', type: 'date', required: true,
            autoFillFrom: 'today',
            // "DATE:" at (392.16, 673.8) → fill at ~425
            position: { pageOffset: 0, x: 425, y: 674, width: 100, fontSize: 10 },
            zoomRegion: { x: 385, y: 659, width: 180, height: 30 },
          },
          {
            fieldName: 'foremanName', label: 'Foreman', type: 'text', required: true,
            autoFillFrom: 'user.name',
            // "FOREMAN:" at (41.89, 640.49) → fill at ~100
            position: { pageOffset: 0, x: 100, y: 640, width: 200, fontSize: 10 },
            zoomRegion: { x: 35, y: 625, width: 300, height: 30 },
          },
        ],
      },
    ],

    // FDA Grid Map — maps equipment selections to checkbox positions on the FDA sheet.
    // The FDA section spans 3 pages of the EC tag (pages 4-6 in a 6-page tag).
    // Each page has 4 columns of categories with rows of (condition → action)
    // and New/Priority/Comp status checkboxes per row.
    //
    // Structure extracted from real PG&E EC tag PDF (PM-46271318).
    // The stamp engine looks up (category, condition, action) and checks the
    // correct boxes at the mapped positions. The foreman never touches this grid
    // directly — the FDAAttributeForm captures their selections and the engine
    // does the rest.
    //
    // NOTE: Y positions and page assignments need calibration against a real PDF.
    // The category list below is COMPLETE — extracted from actual PG&E EC tag text.
    // FDA Grid — calibrated against FOREMAN_DOC pages 4-6 (Letter 612x792)
    // The FDA grid uses a 4-COLUMN layout per page. Each column has its own
    // x positions for conditions, actions, and status checkboxes.
    // Row data maps (category, condition) → (column, y, page).
    // The stamp engine uses the column's actionX for the action checkmark,
    // and the column's newX/priorityX/compX for status checkmarks.
    fdaGrid: {
      pageOffset: 3,     // FDA grid starts at page index 3 (4th page of EC tag section)
      checkboxSize: 8,

      // 4-column layout per page — x positions calibrated from real PDF text positions
      columns: [
        { index: 0, actionX: 94.39, newX: 139.1, priorityX: 148.45, compX: 157.8 },
        { index: 1, actionX: 238.25, newX: 282.95, priorityX: 292.31, compX: 301.66 },
        { index: 2, actionX: 382.11, newX: 426.81, priorityX: 436.17, compX: 445.52 },
        { index: 3, actionX: 525.97, newX: 570.67, priorityX: 580.02, compX: 589.38 },
      ],

      // ========== PAGE 4 (pageOffset: 0) — calibrated from FOREMAN_DOC page 4 ==========
      // Each row includes `column` (0-3) for the 4-column layout.
      // Y positions from real pdfjs-dist text extraction.
      rows: [
        // --- Page 4, Column 0: Anchor → Climbing Space ---
        { category: 'Anchor', condition: 'Broken/Damaged', y: 732.98, page: 0, column: 0 },
        { category: 'Anchor', condition: 'Corroded', y: 708.64, page: 0, column: 0 },
        { category: 'Anchor', condition: 'Missing', y: 684.30, page: 0, column: 0 },
        { category: 'Anchor', condition: 'Soil/Eroded/Graded', y: 671.63, page: 0, column: 0 },
        { category: 'Animal Mitigation', condition: 'Broken/Damaged', y: 637.09, page: 0, column: 0 },
        { category: 'Animal Mitigation', condition: 'Mitigation Missing', y: 624.42, page: 0, column: 0 },
        { category: 'Bird Protection', condition: 'Bird Protection', y: 601.54, page: 0, column: 0 },
        { category: 'Bonding', condition: 'Broken/Damaged', y: 567.00, page: 0, column: 0 },
        { category: 'Bonding', condition: 'Missing', y: 554.32, page: 0, column: 0 },
        { category: 'CB Pole', condition: 'Broken/Damaged', y: 531.45, page: 0, column: 0 },
        { category: 'CB Pole', condition: 'Burnt', y: 518.78, page: 0, column: 0 },
        { category: 'CB Pole', condition: 'Decayed/Rotten', y: 506.11, page: 0, column: 0 },
        { category: 'Buddy Pole', condition: 'Improperly Supported', y: 483.23, page: 0, column: 0 },
        { category: 'Booster/Regulator', condition: 'Broken/Damaged', y: 460.35, page: 0, column: 0 },
        { category: 'Booster/Regulator', condition: 'Burnt', y: 436.01, page: 0, column: 0 },
        { category: 'Booster/Regulator', condition: 'Excessive Operation', y: 423.34, page: 0, column: 0 },
        { category: 'Booster/Regulator', condition: 'Leaks/Seeps/Weeps', y: 410.67, page: 0, column: 0 },
        { category: 'Booster/Regulator', condition: 'Temp Differential', y: 374.16, page: 0, column: 0 },
        { category: 'Capacitor', condition: 'Broken/Damaged', y: 351.29, page: 0, column: 0 },
        { category: 'Capacitor', condition: 'Burnt', y: 326.95, page: 0, column: 0 },
        { category: 'Capacitor', condition: 'Leaks/Seeps/Weeps', y: 314.78, page: 0, column: 0 },
        { category: 'Capacitor', condition: 'Temp Differential', y: 302.61, page: 0, column: 0 },

        // --- Page 4, Column 1: Conductor → Fuse ---
        { category: 'Conductor', condition: 'Broken/Damaged', y: 732.98, page: 0, column: 1 },
        { category: 'Conductor', condition: 'Broken Splice', y: 708.64, page: 0, column: 1 },
        { category: 'Conductor', condition: 'Burnt', y: 695.97, page: 0, column: 1 },
        { category: 'Conductor', condition: 'Clearance Impaired', y: 671.63, page: 0, column: 1 },
        { category: 'Conductor', condition: 'Idle Facilities', y: 616.62, page: 0, column: 1 },
        { category: 'Conductor', condition: 'Improper Connection', y: 603.95, page: 0, column: 1 },
        { category: 'Conductor', condition: 'Loose Lashing', y: 591.28, page: 0, column: 1 },
        { category: 'Conductor', condition: 'Overloaded', y: 578.61, page: 0, column: 1 },
        { category: 'Conductor', condition: 'Sag/Clearance', y: 565.94, page: 0, column: 1 },
        { category: 'Conductor', condition: 'Splice Tied In', y: 513.83, page: 0, column: 1 },
        { category: 'Conductor', condition: 'Temp Differential', y: 501.16, page: 0, column: 1 },
        { category: 'Connector', condition: 'Burnt', y: 478.28, page: 0, column: 1 },
        { category: 'Connector', condition: 'Corroded', y: 465.61, page: 0, column: 1 },
        { category: 'Connector', condition: 'COPPER OVER ALUMINUM', y: 441.27, page: 0, column: 1 },
        { category: 'Connector', condition: 'Incorrectly Installed', y: 428.60, page: 0, column: 1 },
        { category: 'Connector', condition: 'Insulation Deteriorated', y: 415.93, page: 0, column: 1 },
        { category: 'Connector', condition: 'TAP CLAMP W/EQUIPM', y: 403.26, page: 0, column: 1 },
        { category: 'Connector', condition: 'Temp Differential', y: 390.59, page: 0, column: 1 },
        { category: 'Crossarm', condition: 'Broken/Damaged', y: 367.71, page: 0, column: 1 },
        { category: 'Crossarm', condition: 'Burnt', y: 343.37, page: 0, column: 1 },
        { category: 'Crossarm', condition: 'Decayed/Rotten', y: 319.03, page: 0, column: 1 },

        // --- Page 4, Column 2: Ground → Molding ---
        { category: 'Ground', condition: 'Broken/Damaged', y: 732.98, page: 0, column: 2 },
        { category: 'Ground', condition: 'Exposed', y: 708.64, page: 0, column: 2 },
        { category: 'Ground', condition: 'Missing', y: 695.97, page: 0, column: 2 },
        { category: 'Ground', condition: 'Temp Differential', y: 683.30, page: 0, column: 2 },
        { category: 'Guy', condition: 'Broken/Damaged', y: 660.43, page: 0, column: 2 },
        { category: 'Guy', condition: 'Clearance Impaired', y: 636.09, page: 0, column: 2 },
        { category: 'Guy', condition: 'Corroded', y: 623.41, page: 0, column: 2 },
        { category: 'Guy', condition: 'Loose', y: 599.07, page: 0, column: 2 },
        { category: 'Guy', condition: 'Missing', y: 586.40, page: 0, column: 2 },
        { category: 'Guy', condition: 'Overgrown', y: 573.73, page: 0, column: 2 },
        { category: 'Guy', condition: 'Strain/Abrasion', y: 561.06, page: 0, column: 2 },
        { category: 'Guy Marker', condition: 'Missing', y: 548.89, page: 0, column: 2 },
        { category: 'Hardware/Framing', condition: 'Bird Prot Required', y: 491.97, page: 0, column: 2 },
        { category: 'Hardware/Framing', condition: 'Birdcage', y: 479.30, page: 0, column: 2 },
        { category: 'Hardware/Framing', condition: 'Broken/Damaged', y: 466.63, page: 0, column: 2 },
        { category: 'Hardware/Framing', condition: 'Loose', y: 430.12, page: 0, column: 2 },
        { category: 'Hardware/Framing', condition: 'Missing', y: 417.45, page: 0, column: 2 },
        { category: 'High Sign', condition: 'Broken/Damaged', y: 394.57, page: 0, column: 2 },
        { category: 'High Sign', condition: 'Missing', y: 381.90, page: 0, column: 2 },
        { category: 'Insulator', condition: 'Broken/Damaged', y: 359.03, page: 0, column: 2 },
        { category: 'Insulator', condition: 'Flashed', y: 346.35, page: 0, column: 2 },
        { category: 'Insulator', condition: 'Primary Squatter', y: 333.68, page: 0, column: 2 },
        { category: 'Insulator', condition: 'Secondary Squatter', y: 321.51, page: 0, column: 2 },
        { category: 'Insulator', condition: 'Temp Differential', y: 308.84, page: 0, column: 2 },

        // --- Page 4, Column 3: OH Facility → Recloser/Sectionalizer ---
        { category: 'OH Facility', condition: 'Bird Prot Required', y: 732.98, page: 0, column: 3 },
        { category: 'OH Facility', condition: 'Customer Related', y: 720.31, page: 0, column: 3 },
        { category: 'OH Facility', condition: 'Graffiti', y: 683.80, page: 0, column: 3 },
        { category: 'OH Facility', condition: 'Idle Facilities', y: 671.13, page: 0, column: 3 },
        { category: 'OH Facility', condition: 'Limited Access', y: 634.62, page: 0, column: 3 },
        { category: 'OH Facility', condition: 'Bird Nest', y: 598.11, page: 0, column: 3 },
        { category: 'OH Facility', condition: 'Obstructed', y: 585.44, page: 0, column: 3 },
        { category: 'OH Facility', condition: 'Transmission Issue', y: 548.93, page: 0, column: 3 },
        { category: 'Operating Number', condition: 'Broken/Damaged', y: 526.05, page: 0, column: 3 },
        { category: 'Operating Number', condition: 'Missing', y: 513.38, page: 0, column: 3 },
        { category: 'Pole', condition: 'Broken/Damaged', y: 490.51, page: 0, column: 3 },
        { category: 'Pole', condition: 'Burnt', y: 441.83, page: 0, column: 3 },
        { category: 'Pole', condition: 'Clearance Impaired', y: 405.32, page: 0, column: 3 },
        { category: 'Pole', condition: 'Decayed/Rotten', y: 380.98, page: 0, column: 3 },
        { category: 'Pole', condition: 'Leaning', y: 368.81, page: 0, column: 3 },
        { category: 'Pole', condition: 'Overloaded', y: 348.84, page: 0, column: 3 },
        { category: 'Pole', condition: 'No Safe Access to Pole', y: 336.67, page: 0, column: 3 },
        { category: 'Pole', condition: 'Soil/Eroded/Graded', y: 324.50, page: 0, column: 3 },
        { category: 'Pole', condition: 'Woodpecker Damage', y: 312.33, page: 0, column: 3 },

        // ========== PAGE 5 (pageOffset: 1) — calibrated from FOREMAN_DOC page 5 ==========
        // Page 5 is single-column (column 0) for remaining categories
        { category: 'Riser/Pothead', condition: 'Broken/Damaged', y: 661.41, page: 1, column: 0 },
        { category: 'Riser/Pothead', condition: 'Installed in Error', y: 637.07, page: 1, column: 0 },
        { category: 'Riser/Pothead', condition: 'Flashed', y: 624.40, page: 1, column: 0 },
        { category: 'Riser/Pothead', condition: 'Temp Differential', y: 600.06, page: 1, column: 0 },
        { category: 'ROAD', condition: 'No Safe Access to Pole', y: 577.18, page: 1, column: 0 },
        { category: 'Relinquished Pole', condition: 'Decayed/Rotten', y: 554.30, page: 1, column: 0 },
        { category: 'RTVI', condition: 'Interference', y: 531.43, page: 1, column: 0 },
        { category: 'SCADA/PDAC', condition: 'Broken/Damaged', y: 496.88, page: 1, column: 0 },
        { category: 'SCADA/PDAC', condition: 'Leaks/Seeps/Weeps', y: 472.54, page: 1, column: 0 },
        { category: 'Steel Lattice Pole', condition: 'Guarding Missing', y: 425.83, page: 1, column: 0 },
        { category: 'Sec_Svc Conductor', condition: 'Splice Installed', y: 402.95, page: 1, column: 0 },
        { category: 'Pole Step', condition: 'Clearance Impaired', y: 380.08, page: 1, column: 0 },
        { category: 'Streetlight', condition: 'Broken/Damaged', y: 357.20, page: 1, column: 0 },
        { category: 'Streetlight', condition: 'Missing', y: 332.86, page: 1, column: 0 },
        { category: 'Steel Lattice Tower', condition: 'Broken/Damaged', y: 309.99, page: 1, column: 0 },
        { category: 'Switch', condition: 'Broken/Damaged', y: 287.11, page: 1, column: 0 },
        { category: 'Switch', condition: 'Temp Differential', y: 262.77, page: 1, column: 0 },
        { category: 'Tap Clamp', condition: 'Overloaded', y: 239.89, page: 1, column: 0 },
        { category: 'Trans_Dist Pole', condition: 'Bridging Broken', y: 217.02, page: 1, column: 0 },
        { category: 'Trans_Dist Pole', condition: 'Bridging Missing', y: 204.35, page: 1, column: 0 },
        { category: 'Trans_Dist Pole', condition: 'Bonding Missing', y: 191.68, page: 1, column: 0 },
        { category: 'Trans_Dist Pole', condition: 'Bonding Broken', y: 179.00, page: 1, column: 0 },
        { category: 'Tie Wire', condition: 'Broken/Damaged', y: 156.13, page: 1, column: 0 },
        { category: 'Tie Wire', condition: 'Corroded', y: 143.46, page: 1, column: 0 },
        { category: 'Tie Wire', condition: 'Improperly Installed', y: 130.79, page: 1, column: 0 },
        { category: 'Tie Wire', condition: 'Loose', y: 118.12, page: 1, column: 0 },
        { category: 'Tie Wire', condition: 'Temp Differential', y: 105.44, page: 1, column: 0 },

        // ========== PAGE 6 (pageOffset: 2) — calibrated from FOREMAN_DOC page 6 ==========
        // Page 6 is single-column (column 0) for final categories
        { category: 'Transformer', condition: 'Broken/Damaged', y: 661.41, page: 2, column: 0 },
        { category: 'Transformer', condition: 'Corroded', y: 637.07, page: 2, column: 0 },
        { category: 'Transformer', condition: 'Flashed', y: 624.40, page: 2, column: 0 },
        { category: 'Transformer', condition: 'Idle Facilities', y: 600.06, page: 2, column: 0 },
        { category: 'Transformer', condition: 'No Common Neutral', y: 587.39, page: 2, column: 0 },
        { category: 'Transformer', condition: 'Overloaded', y: 574.72, page: 2, column: 0 },
        { category: 'Transformer', condition: 'Parallel', y: 562.04, page: 2, column: 0 },
        { category: 'Transformer', condition: 'Leaks/Seeps/Weeps', y: 549.37, page: 2, column: 0 },
        { category: 'Transformer', condition: 'Temp Differential', y: 500.69, page: 2, column: 0 },
        { category: 'Tree/Vine', condition: 'Clearance Impaired', y: 477.82, page: 2, column: 0 },
        { category: 'Tree/Vine', condition: 'Decayed/Rotten', y: 453.48, page: 2, column: 0 },
        { category: 'Tree/Vine', condition: 'Overgrown', y: 435.48, page: 2, column: 0 },
        { category: 'Tree/Vine', condition: 'Tree Connect', y: 411.14, page: 2, column: 0 },
        { category: 'Trip Saver', condition: 'Broken/Damaged', y: 370.76, page: 2, column: 0 },
        { category: 'Tree Wire', condition: 'Exposed', y: 336.22, page: 2, column: 0 },
        { category: 'Under-Arm Bus', condition: 'Broken/Damaged', y: 313.34, page: 2, column: 0 },
        { category: 'Visibility Strip', condition: 'Broken/Damaged', y: 290.46, page: 2, column: 0 },
      ],

      emergencyCauses: [
        { label: 'Animal', x: 55, y: 175 },
        { label: 'Equip Failed', x: 55, y: 162 },
        { label: 'Lightning', x: 55, y: 149 },
        { label: 'Third Party', x: 55, y: 136 },
        { label: 'Tree Contact', x: 55, y: 123 },
        { label: 'Unknown', x: 55, y: 110 },
        { label: 'Bird', x: 145, y: 175 },
        { label: 'Fire', x: 145, y: 162 },
        { label: 'Pole Rotten', x: 145, y: 149 },
        { label: 'Tree Branch', x: 145, y: 136 },
        { label: 'Tree Fell', x: 145, y: 123 },
      ],
    },

    colorConventions: [
      { color: 'red', hex: '#CC0000', label: 'Red', meaning: 'Removed / Changed from design / Demolished', shortcut: 'R' },
      { color: 'blue', hex: '#0000CC', label: 'Blue', meaning: 'New installation / Added / As-built', shortcut: 'B' },
      { color: 'black', hex: '#000000', label: 'Black', meaning: 'Existing / Unchanged / Reference', shortcut: 'K' },
    ],

    validationRules: [
      { code: 'SKETCH_MARKUP', target: 'sketch_markup', rule: 'required_unless', condition: 'built_as_designed',
        description: 'Construction sketch must have markup or be marked "Built As Designed"', severity: 'error' },
      { code: 'CCSC_COMPLETE', target: 'ccsc_completed', rule: 'required',
        description: 'CCSC checklist must be completed with all applicable items checked', severity: 'error' },
      { code: 'CCSC_SIGNED', target: 'ccsc_signature', rule: 'signature_required',
        description: 'CCSC must be signed by crew lead', severity: 'error' },
      { code: 'EC_TAG_SIGNED', target: 'ec_tag_signature', rule: 'signature_required',
        description: 'EC Tag must be signed with completion info', severity: 'error' },
      { code: 'COMPLETION_PHOTOS', target: 'completion_photos', rule: 'min_count', minValue: 1,
        description: 'At least one completion photo is required', severity: 'warning' },
      { code: 'GPS_PRESENT', target: 'gps_coordinates', rule: 'gps_required',
        description: 'GPS coordinates should be captured for asset location', severity: 'warning' },
    ],

    namingConventions: [
      { documentType: 'as_built_package', pattern: '{PM}_ASBUILT_{DATE}', example: '35589054_ASBUILT_20250210' },
      { documentType: 'construction_sketch', pattern: '{PM}_SKETCH_{REV}', example: '35589054_SKETCH_R0' },
      { documentType: 'ccsc', pattern: '{PM}_CCSC_{LOC}', example: '35589054_CCSC_1' },
      { documentType: 'ec_tag', pattern: '{NOTIF}_ECTAG', example: '119080350_ECTAG' },
      { documentType: 'photos', pattern: '{PM}_PHOTO_{SEQ}', example: '35589054_PHOTO_001' },
    ],

    // Required document order for final assembled package
    // Matches PG&E As-Built Document Order reference
    documentOrder: [
      'ec_tag',
      'face_sheet',
      'crew_instructions',
      'crew_materials',
      'equipment_info',
      'feedback_form',
      'construction_sketch',
      'circuit_map',
      'permits',
      'tcp',
      'job_checklist',
      'unit_price_completion',
      'billing_form',
      'paving_form',
      'cwc',
      'ccsc',
      'photos',
    ],
  };
}

module.exports = { getPGEConfig };

