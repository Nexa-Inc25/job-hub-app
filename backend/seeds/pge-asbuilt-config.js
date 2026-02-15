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
        detectionKeyword: 'Electric Overhead Tag', variableLength: true },
      { sectionType: 'face_sheet', label: 'PGE Face Sheet', start: 1, end: 3,
        detectionKeyword: 'CREW FOREMAN SIGN-OFF SHEET' },
      { sectionType: 'crew_instructions', label: 'Crew Instructions', start: 4, end: 6,
        detectionKeyword: 'CREW INSTRUCTIONS' },
      { sectionType: 'crew_materials', label: 'Crew Materials', start: 7, end: 7,
        detectionKeyword: 'CREW MATERIALS' },
      { sectionType: 'equipment_info', label: 'Electric Equipment/Pole Info', start: 8, end: 9,
        detectionKeyword: 'SAP Equipment' },
      { sectionType: 'feedback_form', label: 'Construction Feedback Form', start: 10, end: 10,
        detectionKeyword: 'CONSTRUCTION FEEDBACK' },
      { sectionType: 'construction_sketch', label: 'Construction Sketch', start: 11, end: 14,
        detectionKeyword: 'SCALE:', variableLength: true },
      { sectionType: 'circuit_map', label: 'Circuit Map Change Sheet', start: 15, end: 15,
        detectionKeyword: 'CIRCUIT MAP' },
      { sectionType: 'permits', label: 'City Permits', start: 16, end: 21,
        detectionKeyword: 'PERMIT', variableLength: true },
      { sectionType: 'tcp', label: 'Traffic Control Plan', start: 22, end: 23,
        detectionKeyword: 'TRAFFIC CONTROL' },
      { sectionType: 'job_checklist', label: 'Electric Job Package Checklist', start: 24, end: 24,
        detectionKeyword: 'JOB PACKAGE CHECKLIST' },
      { sectionType: 'billing_form', label: 'Pole Replacement Progress Billing', start: 27, end: 27,
        detectionKeyword: 'PROGRESS BILLING' },
      { sectionType: 'paving_form', label: 'Field Paving Form', start: 28, end: 29,
        detectionKeyword: 'PAVING FORM' },
      { sectionType: 'ccsc', label: 'Construction Completion Standards Checklist', start: 32, end: 33,
        detectionKeyword: 'Construction Completion Standards' },
    ],

    workTypes: [
      {
        code: 'estimated',
        label: 'Estimated Work',
        description: 'Standard estimated jobs — pole replacement (07D), line extension, service upgrade, bare wire, etc.',
        requiredDocs: ['ec_tag', 'face_sheet', 'equipment_info', 'construction_sketch', 'ccsc', 'billing_form'],
        optionalDocs: ['paving_form', 'permits', 'tcp', 'crew_instructions'],
        requiresSketchMarkup: true,
        allowBuiltAsDesigned: true,
      },
      {
        code: 'ec_corrective',
        label: 'EC Tag Work',
        description: 'Electric corrective maintenance from EC tags — pole replacement, switch replacement, etc.',
        requiredDocs: ['ec_tag', 'equipment_info', 'construction_sketch', 'ccsc'],
        optionalDocs: ['billing_form'],
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
        sectionType: 'ec_tag',
        label: 'EC Tag Completion',
        fields: [
          {
            fieldName: 'lanId', label: 'LAN ID', type: 'lanId', required: true,
            autoFillFrom: 'user.lanId',
            helpText: 'Your utility LAN ID (e.g., AB1C)',
            position: { pageOffset: 0, x: 400, y: 710, width: 120, fontSize: 10 },
            zoomRegion: { x: 320, y: 690, width: 260, height: 50 },
          },
          {
            fieldName: 'completionDate', label: 'Completion Date', type: 'date', required: true,
            autoFillFrom: 'today',
            position: { pageOffset: 0, x: 400, y: 685, width: 100, fontSize: 10 },
            zoomRegion: { x: 320, y: 665, width: 260, height: 50 },
          },
          {
            fieldName: 'actualHours', label: 'Actual Hours', type: 'number', required: true,
            autoFillFrom: 'timesheet.totalHours',
            helpText: 'Total crew hours for this job (auto-filled from timesheet)',
            position: { pageOffset: 0, x: 400, y: 660, width: 80, fontSize: 10 },
            zoomRegion: { x: 320, y: 640, width: 260, height: 50 },
          },
          {
            fieldName: 'completionType', label: 'Status', type: 'select', required: true,
            options: ['Completed', 'Canceled', 'Found Completed Upon Arrival'],
            position: { pageOffset: 0, x: 400, y: 635, width: 150, fontSize: 10 },
            zoomRegion: { x: 320, y: 615, width: 260, height: 50 },
          },
          {
            fieldName: 'crewType', label: 'Crew Type', type: 'select', required: true,
            options: ['PG&E Crew', 'T-Man', 'Contractor'],
            position: { pageOffset: 0, x: 400, y: 610, width: 120, fontSize: 10 },
            zoomRegion: { x: 320, y: 590, width: 260, height: 50 },
          },
          {
            fieldName: 'signature', label: 'Signature', type: 'signature', required: true,
            position: { pageOffset: 0, x: 350, y: 560, width: 180, height: 40, fontSize: 10 },
            zoomRegion: { x: 300, y: 540, width: 280, height: 70 },
          },
          // FDA (Facility Data Attributes) checkboxes on the EC tag form
          // These confirm equipment data has been recorded for GIS/SAP
          {
            fieldName: 'fdaPoleComplete', label: 'Pole Data Complete', type: 'checkbox', required: false,
            helpText: 'Check if pole FDA attributes have been recorded (species, class, height, year)',
            position: { pageOffset: 1, x: 55, y: 690, width: 12, height: 12, fontSize: 10 },
            zoomRegion: { x: 40, y: 670, width: 300, height: 50 },
          },
          {
            fieldName: 'fdaConductorComplete', label: 'Conductor Data Complete', type: 'checkbox', required: false,
            helpText: 'Check if conductor FDA attributes have been recorded (material, size, phase)',
            position: { pageOffset: 1, x: 55, y: 665, width: 12, height: 12, fontSize: 10 },
            zoomRegion: { x: 40, y: 645, width: 300, height: 50 },
          },
          {
            fieldName: 'fdaTransformerComplete', label: 'Transformer Data Complete', type: 'checkbox', required: false,
            helpText: 'Check if transformer FDA attributes have been recorded (kVA, serial, type)',
            position: { pageOffset: 1, x: 55, y: 640, width: 12, height: 12, fontSize: 10 },
            zoomRegion: { x: 40, y: 620, width: 300, height: 50 },
          },
          {
            fieldName: 'fdaSwitchgearComplete', label: 'Switchgear Data Complete', type: 'checkbox', required: false,
            helpText: 'Check if switchgear/device FDA attributes have been recorded',
            position: { pageOffset: 1, x: 55, y: 615, width: 12, height: 12, fontSize: 10 },
            zoomRegion: { x: 40, y: 595, width: 300, height: 50 },
          },
          {
            fieldName: 'fdaServiceComplete', label: 'Service Data Complete', type: 'checkbox', required: false,
            helpText: 'Check if service/meter FDA attributes have been recorded',
            position: { pageOffset: 1, x: 55, y: 590, width: 12, height: 12, fontSize: 10 },
            zoomRegion: { x: 40, y: 570, width: 300, height: 50 },
          },
          {
            fieldName: 'fdaUgComplete', label: 'Underground Data Complete', type: 'checkbox', required: false,
            helpText: 'Check if underground FDA attributes have been recorded (cable type, conduit)',
            position: { pageOffset: 1, x: 55, y: 565, width: 12, height: 12, fontSize: 10 },
            zoomRegion: { x: 40, y: 545, width: 300, height: 50 },
          },
        ],
      },
      {
        sectionType: 'face_sheet',
        label: 'Face Sheet Completion',
        fields: [
          {
            fieldName: 'pmNumber', label: 'PM/Order #', type: 'text', required: true,
            autoFillFrom: 'job.pmNumber',
            helpText: 'Project Management number from the job package',
            position: { pageOffset: 0, x: 390, y: 695, width: 150, fontSize: 10 },
            zoomRegion: { x: 300, y: 675, width: 280, height: 50 },
          },
          {
            fieldName: 'woNumber', label: 'Work Order #', type: 'text', required: false,
            autoFillFrom: 'job.woNumber',
            position: { pageOffset: 0, x: 390, y: 670, width: 150, fontSize: 10 },
            zoomRegion: { x: 300, y: 650, width: 280, height: 50 },
          },
          {
            fieldName: 'notificationNumber', label: 'Notification #', type: 'text', required: false,
            autoFillFrom: 'job.notificationNumber',
            position: { pageOffset: 0, x: 390, y: 645, width: 150, fontSize: 10 },
            zoomRegion: { x: 300, y: 625, width: 280, height: 50 },
          },
          {
            fieldName: 'address', label: 'Job Address', type: 'text', required: true,
            autoFillFrom: 'job.address',
            position: { pageOffset: 0, x: 120, y: 620, width: 350, fontSize: 9 },
            zoomRegion: { x: 40, y: 600, width: 520, height: 50 },
          },
          {
            fieldName: 'foremanName', label: 'Foreman Name', type: 'text', required: true,
            autoFillFrom: 'user.name',
            position: { pageOffset: 0, x: 120, y: 580, width: 200, fontSize: 10 },
            zoomRegion: { x: 40, y: 560, width: 520, height: 50 },
          },
          {
            fieldName: 'foremanLanId', label: 'Foreman LAN ID', type: 'lanId', required: true,
            autoFillFrom: 'user.lanId',
            position: { pageOffset: 0, x: 390, y: 580, width: 120, fontSize: 10 },
            zoomRegion: { x: 300, y: 560, width: 280, height: 50 },
          },
          {
            fieldName: 'completionDate', label: 'Completion Date', type: 'date', required: true,
            autoFillFrom: 'today',
            position: { pageOffset: 0, x: 390, y: 555, width: 100, fontSize: 10 },
            zoomRegion: { x: 300, y: 535, width: 280, height: 50 },
          },
          {
            fieldName: 'signature', label: 'Foreman Signature', type: 'signature', required: true,
            position: { pageOffset: 0, x: 120, y: 520, width: 200, height: 40, fontSize: 10 },
            zoomRegion: { x: 40, y: 500, width: 520, height: 70 },
          },
        ],
      },
      {
        sectionType: 'equipment_info',
        label: 'Equipment Info Completion',
        fields: [
          {
            fieldName: 'oldPoleNumber', label: 'Old Pole #', type: 'text', required: false,
            helpText: 'SAP number of the pole being replaced (if applicable)',
            position: { pageOffset: 0, x: 120, y: 700, width: 150, fontSize: 10 },
            zoomRegion: { x: 40, y: 680, width: 520, height: 50 },
          },
          {
            fieldName: 'newPoleNumber', label: 'New Pole #', type: 'text', required: false,
            helpText: 'SAP number of the new pole installed',
            position: { pageOffset: 0, x: 350, y: 700, width: 150, fontSize: 10 },
            zoomRegion: { x: 260, y: 680, width: 300, height: 50 },
          },
          {
            fieldName: 'poleHeight', label: 'Pole Height (ft)', type: 'number', required: false,
            helpText: 'Height of installed pole in feet',
            position: { pageOffset: 0, x: 120, y: 670, width: 80, fontSize: 10 },
            zoomRegion: { x: 40, y: 650, width: 260, height: 50 },
          },
          {
            fieldName: 'poleClass', label: 'Pole Class', type: 'text', required: false,
            helpText: 'Class of pole (e.g., 2, 3, 4, 5)',
            position: { pageOffset: 0, x: 250, y: 670, width: 80, fontSize: 10 },
            zoomRegion: { x: 170, y: 650, width: 260, height: 50 },
          },
          {
            fieldName: 'transformerSerial', label: 'Transformer Serial #', type: 'text', required: false,
            helpText: 'Serial number of new transformer (if applicable)',
            position: { pageOffset: 0, x: 120, y: 600, width: 180, fontSize: 10 },
            zoomRegion: { x: 40, y: 580, width: 520, height: 50 },
          },
          {
            fieldName: 'meterNumber', label: 'Meter #', type: 'text', required: false,
            helpText: 'Meter number (if service work)',
            position: { pageOffset: 0, x: 350, y: 600, width: 150, fontSize: 10 },
            zoomRegion: { x: 260, y: 580, width: 300, height: 50 },
          },
        ],
      },
      {
        sectionType: 'ccsc',
        label: 'CCSC Completion',
        fields: [
          {
            fieldName: 'pmNumber', label: 'PM/Order #', type: 'text', required: true,
            autoFillFrom: 'job.pmNumber',
            position: { pageOffset: 0, x: 160, y: 755, width: 120, fontSize: 9 },
            zoomRegion: { x: 40, y: 735, width: 300, height: 50 },
          },
          {
            fieldName: 'address', label: 'Address or GPS', type: 'text', required: true,
            autoFillFrom: 'job.address',
            position: { pageOffset: 0, x: 350, y: 755, width: 200, fontSize: 9 },
            zoomRegion: { x: 260, y: 735, width: 300, height: 50 },
          },
          {
            fieldName: 'foremanName', label: 'Crew Lead Name', type: 'text', required: true,
            autoFillFrom: 'user.name',
            position: { pageOffset: 0, x: 120, y: 100, width: 180, fontSize: 10 },
            zoomRegion: { x: 40, y: 70, width: 520, height: 70 },
          },
          {
            fieldName: 'comments', label: 'Comments', type: 'text', required: false,
            helpText: 'Any notes about checklist items (optional)',
            position: { pageOffset: 0, x: 120, y: 130, width: 400, fontSize: 9 },
            zoomRegion: { x: 40, y: 110, width: 520, height: 50 },
          },
          {
            fieldName: 'crewLeadSignature', label: 'Crew Lead Signature', type: 'signature', required: true,
            position: { pageOffset: 0, x: 350, y: 80, width: 180, height: 35, fontSize: 10 },
            zoomRegion: { x: 260, y: 55, width: 300, height: 70 },
          },
          {
            fieldName: 'completionDate', label: 'Date', type: 'date', required: true,
            autoFillFrom: 'today',
            position: { pageOffset: 0, x: 120, y: 80, width: 100, fontSize: 10 },
            zoomRegion: { x: 40, y: 55, width: 260, height: 70 },
          },
        ],
      },
      {
        sectionType: 'billing_form',
        label: 'Progress Billing Completion',
        fields: [
          {
            fieldName: 'pmNumber', label: 'PM #', type: 'text', required: true,
            autoFillFrom: 'job.pmNumber',
            position: { pageOffset: 0, x: 120, y: 730, width: 120, fontSize: 10 },
            zoomRegion: { x: 40, y: 710, width: 300, height: 50 },
          },
          {
            fieldName: 'woNumber', label: 'WO #', type: 'text', required: false,
            autoFillFrom: 'job.woNumber',
            position: { pageOffset: 0, x: 350, y: 730, width: 120, fontSize: 10 },
            zoomRegion: { x: 260, y: 710, width: 300, height: 50 },
          },
          {
            fieldName: 'contractorName', label: 'Contractor', type: 'text', required: true,
            autoFillFrom: 'company.name',
            position: { pageOffset: 0, x: 120, y: 705, width: 200, fontSize: 10 },
            zoomRegion: { x: 40, y: 685, width: 520, height: 50 },
          },
          {
            fieldName: 'completionDate', label: 'Completion Date', type: 'date', required: true,
            autoFillFrom: 'today',
            position: { pageOffset: 0, x: 390, y: 705, width: 100, fontSize: 10 },
            zoomRegion: { x: 300, y: 685, width: 260, height: 50 },
          },
          {
            fieldName: 'percentComplete', label: '% Complete', type: 'number', required: true,
            helpText: 'Percentage of work completed (100 if fully done)',
            position: { pageOffset: 0, x: 350, y: 600, width: 60, fontSize: 12 },
            zoomRegion: { x: 260, y: 580, width: 300, height: 50 },
          },
          {
            fieldName: 'foremanSignature', label: 'Foreman Signature', type: 'signature', required: true,
            position: { pageOffset: 0, x: 120, y: 150, width: 180, height: 40, fontSize: 10 },
            zoomRegion: { x: 40, y: 120, width: 520, height: 70 },
          },
        ],
      },
    ],

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
      'billing_form',
      'paving_form',
      'ccsc',
      'photos',
    ],
  };
}

module.exports = { getPGEConfig };

