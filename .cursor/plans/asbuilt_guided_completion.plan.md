# As-Built Guided Completion Engine

## The Problem

Foremen in the field are not technically savvy. The current experience hands them a 30+ page PDF and says "scroll to find the face sheet, use the toolbar to type stuff in." They get lost, fill the wrong fields, miss pages, and submit incomplete packages. This is the #1 pain point in the field.

## The Solution

A guided, field-by-field completion flow that:

1. Automatically identifies which page is which (regardless of upload order)
2. Shows only the relevant pages for each step
3. Pre-fills 70%+ of fields from job data
4. Walks the foreman through the remaining fields one at a time
5. Stamps values onto the original PDF at the correct positions
6. Reassembles the completed package in the utility's required document order

## Existing Infrastructure (What We Have)

| Component | Status | Location ||-----------|--------|----------|| UtilityAsBuiltConfig model | Built | `backend/models/UtilityAsBuiltConfig.js` || PG&E config seed (page ranges, detection keywords, fields, CCSC, symbols) | Built | `backend/seeds/pge-asbuilt-config.js` || As-Built Wizard (step-by-step flow) | Built | `frontend/src/components/asbuilt/AsBuiltWizard.jsx` || PDFFormEditor (annotation tool) | Built | `frontend/src/components/PDFFormEditor.jsx` || ECTagCompletion (native form) | Built | `frontend/src/components/asbuilt/ECTagCompletion.jsx` || CCSCChecklist (swipeable checklist) | Built | `frontend/src/components/asbuilt/CCSCChecklist.jsx` || PDF text extraction (pdf-parse) | Built | `backend/utils/pdfUtils.js` || pdf-lib (PDF manipulation) | Installed | Both frontend and backend || react-pdf (PDF rendering) | Installed | Frontend || AsBuiltSubmission model | Built | `backend/models/AsBuiltSubmission.js` || UTVAC Validator | Built | `backend/services/asbuilt/UTVACValidator.js` || AsBuiltRouter (post-submission processing) | Built | `backend/services/asbuilt/AsBuiltRouter.js` || Document auto-fill engine | Built | `backend/utils/documentAutoFill.js` |

## What's Missing

| Gap | Description ||-----|-------------|| Page classifier | No content-based page identification. Currently relies on page numbers which break when pages are out of order || Field positions | `completionFieldSchema` has no x/y coordinates for where values stamp onto the PDF || Auto-stamp engine | No code to write values onto specific PDF page coordinates || Guided fill UI | Current UI shows whole PDF with "scroll to find it". Needs one-field-at-a-time with zoomed view || Page extraction | No code to split the uploaded PDF into section-specific page groups || PDF reassembly | No code to merge annotated sections back into the final package in correct order |---

## Phase 0: Page Classifier

**Goal:** When a job package PDF is uploaded, classify every page by its sectionType using text content, not page numbers.

### Backend: `POST /api/asbuilt/classify` ([backend/routes/asbuilt.routes.js](backend/routes/asbuilt.routes.js))

```javascript
Input: Job package PDF (from R2 or uploaded)
Process:
        1. Load PDF with pdf-lib, iterate each page
        2. Extract text from each page using pdf-parse (per-page extraction)
        3. For each page, match against utility config's detectionKeywords:
                    - "CREW FOREMAN SIGN-OFF SHEET" → face_sheet
                    - "CREW INSTRUCTIONS" → crew_instructions
                    - "SAP Equipment" → equipment_info
                    - "SCALE:" → construction_sketch
                    - "TRAFFIC CONTROL" → tcp
                    - "Construction Completion Standards" → ccsc
                    - etc.
        4. Score each match (keyword found = high confidence, fuzzy match = medium, page position fallback = low)
        5. Return page classification map: { pageIndex: sectionType, confidence }
Output: Stored on job as job.packageClassification
```

The PG&E seed config already has `detectionKeyword` on every page range -- this just needs to be wired up.For scanned PDFs (images, not text): fall back to page position from `pageRanges.start/end` as a best-guess, but flag low confidence. Future enhancement: OCR via Tesseract or OpenAI vision.

### Schema addition on Job model ([backend/models/Job.js](backend/models/Job.js))

```js
packageClassification: [{
  pageIndex: Number,
  sectionType: String,
  confidence: { type: String, enum: ['high', 'medium', 'low'] },
  detectedKeyword: String,
}]
```



### Auto-classify on upload

Wire into the existing file upload flow: when a PDF is uploaded to the job's root or "Job Package" folder, automatically run classification and store the result.---

## Phase 1: Field Position Mapping

**Goal:** Add x/y coordinates to the completion field schema so values can be stamped at the right spot on each PDF page.

### Schema update on UtilityAsBuiltConfig ([backend/models/UtilityAsBuiltConfig.js](backend/models/UtilityAsBuiltConfig.js))

Add position data to `completionFieldSchema`:

```js
const completionFieldSchema = new mongoose.Schema({
  fieldName: { type: String, required: true },
  label: { type: String, required: true },
  type: { type: String, enum: ['text', 'date', 'number', 'signature', 'checkbox', 'select', 'lanId'] },
  required: { type: Boolean, default: false },
  autoFillFrom: { type: String },
  options: [{ type: String }],

  // NEW: Position on the PDF page for auto-stamping
  position: {
    pageOffset: { type: Number, default: 0 },  // Which page within the section (0 = first page)
    x: { type: Number },                        // Points from left edge
    y: { type: Number },                        // Points from bottom edge (PDF coordinate system)
    width: { type: Number, default: 200 },      // Max width of the text box
    fontSize: { type: Number, default: 10 },    // Font size for stamped text
    align: { type: String, enum: ['left', 'center', 'right'], default: 'left' },
  },

  // NEW: Zoom region for the guided fill UI (shows foreman where this field is)
  zoomRegion: {
    x: Number, y: Number, width: Number, height: Number,  // Crop area to show in the guided UI
  },
});
```



### PG&E field position data ([backend/seeds/pge-asbuilt-config.js](backend/seeds/pge-asbuilt-config.js))

Define x/y positions for each field on PG&E forms. This is a one-time mapping exercise using a sample job package PDF as reference. Example:

```js
{
  sectionType: 'face_sheet',
  label: 'Face Sheet Completion',
  fields: [
    {
      fieldName: 'pmNumber', label: 'PM/Order #', type: 'text',
      required: true, autoFillFrom: 'job.pmNumber',
      position: { pageOffset: 0, x: 390, y: 695, width: 150, fontSize: 10 },
      zoomRegion: { x: 300, y: 670, width: 280, height: 60 },
    },
    {
      fieldName: 'completionDate', label: 'Completion Date', type: 'date',
      required: true, autoFillFrom: 'today',
      position: { pageOffset: 0, x: 390, y: 665, width: 100, fontSize: 10 },
      zoomRegion: { x: 300, y: 640, width: 280, height: 60 },
    },
    // ... more fields
  ],
}
```



### Admin tool: Position calibration UI (future)

A drag-and-drop tool where an admin loads a sample PDF page and clicks where each field goes. For now, positions are defined manually in the seed config.---

## Phase 2: Auto-Fill + Stamp Engine

**Goal:** Backend service that takes extracted PDF pages and stamps pre-filled values onto the correct positions.

### New service: `backend/services/asbuilt/PdfStamper.js`

```javascript
Input: {
  pdfBuffer,           // Original PDF page(s) for this section
  fields,              // From utility config documentCompletions
  jobData,             // Job record with PM#, WO#, address, etc.
  userData,            // Foreman name, LAN ID, etc.
  manualValues,        // Values the foreman entered for non-auto fields
}

Process:
        1. Load PDF page(s) with pdf-lib
        2. For each field in the section's completionFields:
     a. Resolve the value:
                                - If autoFillFrom is set and data exists → use it
                                - If manualValues has this field → use it
                                - Otherwise → leave blank (will be flagged in validation)
     b. If field has position coordinates:
                                - Embed font (Helvetica)
                                - Draw text at (x, y) with specified fontSize and width
     c. If field type is 'signature':
                                - Embed the signature image (base64 PNG) at position
     d. If field type is 'checkbox':
                                - Draw checkmark or X at position
        3. Return the stamped PDF buffer

Output: Stamped PDF buffer ready for assembly
```



### Endpoint: `POST /api/asbuilt/sections/:sectionType/fill`

Takes the job ID, resolves the section's pages from the classified package, auto-fills all fields, and returns the stamped PDF for preview.---

## Phase 3: Guided Fill UI (The Core Experience)

**Goal:** Replace "scroll through 30 pages" with a dead-simple field-by-field flow.

### Component: `GuidedFill.jsx` ([frontend/src/components/asbuilt/GuidedFill.jsx](frontend/src/components/asbuilt/GuidedFill.jsx))

What the foreman sees for each step (face sheet, equipment info, etc.):

```javascript
┌─────────────────────────────────────┐
│  Face Sheet  (Step 2 of 7)          │
│  ─────────────────────────────────  │
│                                     │
│  ┌─ Zoomed PDF area ─────────────┐  │
│  │                               │  │
│  │  PM/Order#: [35673238]  ✓     │  │
│  │            ↑ highlighted      │  │
│  └───────────────────────────────┘  │
│                                     │
│  PM/Order Number                    │
│  ┌──────────────────────────────┐   │
│  │ 35673238              [AUTO] │   │
│  └──────────────────────────────┘   │
│                                     │
│  [  ✓ Looks Good  ]  [ Edit ]      │
│                                     │
│         3 of 4 fields filled        │
│  ◉ ◉ ◉ ○  ← field progress dots    │
│                                     │
│  [ ← Back ]          [ Next → ]     │
└─────────────────────────────────────┘
```

**Per field:**

1. Show the zoomed region of the PDF page where this field lives (so the foreman sees context)
2. Display the pre-filled value with an `[AUTO]` badge if it came from job data
3. Big "Looks Good" button to accept auto-filled value (one tap)
4. "Edit" button to change it if wrong
5. For manual fields (no auto-fill): show the input with a suggested value if possible
6. Progress dots showing how many fields are done

**For signatures:**

- Show the signature pad (or saved signature from profile)
- GPS captured silently for on-site proof

**For checkboxes (CCSC):**

- Already built as `CCSCChecklist.jsx` with swipeable cards
- Wire it into the guided flow as a step

**For construction sketch:**

- Already has the `PDFFormEditor` with symbol palette
- Show only the sketch pages (classified from Phase 0), not the whole PDF

### Flow integration into AsBuiltWizard

Replace the current `isPdfStep` rendering in `AsBuiltWizard.jsx` (which shows the full PDF with "scroll to find it") with `GuidedFill` for each section. The wizard step structure stays the same -- just the content rendering changes.---

## Phase 4: Construction Sketch Markup

Already mostly built (`PDFFormEditor` + symbol library). Enhancements:

- Show only the classified `construction_sketch` pages (not the whole PDF)
- Pre-load the utility's symbol palette from `utilityConfig.symbolLibrary`
- Color mode switcher: Red (remove) / Blue (new) / Black (existing) -- already defined in `colorConventions`
- "Built As Designed" toggle (already wired in wizard)
- GPS stamp on the sketch (proves on-site)

---

## Phase 5: PDF Reassembly

**Goal:** After all sections are filled, merge everything back into a single PDF in the utility's required document order.

### Service: `backend/services/asbuilt/PdfAssembler.js`

```javascript
Input: {
  originalPdfBuffer,      // The uploaded job package
  classificationMap,      // From Phase 0
  stampedSections,        // Map of sectionType → stamped PDF buffers from Phase 2
  documentOrder,          // From utility config or the document order reference
}

Process:
        1. Create a new PDFDocument
        2. For each section in the required document order:
     a. If a stamped version exists → copy those pages from the stamped buffer
     b. If no stamp (section wasn't modified) → copy original pages
        3. Handle pages that weren't classified (unknown sections) → append at end
        4. Save the assembled PDF

Output: Complete job package PDF ready for utility submission
```



### Required document order

Add to `UtilityAsBuiltConfig`:

```js
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
]
```

This matches the PG&E document order from the uploaded reference PDF.---

## Phase 6: Review Screen + Submit

### Review UI

Before final submission, show:

- Thumbnail of each section in document order
- Green check / red warning per section
- Completion percentage (X of Y fields filled)
- UTVAC validation score
- "Download Preview" to see the assembled PDF
- "Submit" button

### Post-submit flow (already built)

The existing `POST /api/asbuilt/wizard/submit` handles:

- UTVAC validation
- AsBuiltSubmission record creation
- SAP file naming
- Job status advancement
- AsBuiltRouter processing (splits to Oracle, GIS, etc.)

The only change: save the assembled PDF to R2 and link it in the submission record, so the PM can download the actual filled-out job package (not just an HTML summary).---

## Implementation Order

Each phase builds on the previous and is independently testable:| Phase | Deliverable | Depends On | Effort ||-------|-------------|------------|--------|| 0 | Page classifier + auto-classify on upload | Nothing | 1 session || 1 | Field positions in schema + PG&E position data | Phase 0 (for testing) | 1 session || 2 | Auto-fill stamp engine | Phase 0 + 1 | 1 session || 3 | Guided fill UI (the big one) | Phase 0 + 1 + 2 | 2-3 sessions || 4 | Sketch markup enhancements | Phase 0 | 1 session || 5 | PDF reassembly | Phase 0 + 2 | 1 session || 6 | Review screen + assembled PDF download | Phase 5 | 1 session |**Total: ~8-10 sessions**Phases 0-2 are the foundation. Phase 3 is the user-facing transformation. Phases 4-6 are polish and completion.---

## What This Means for the Foreman

**Before:** Open 30-page PDF → scroll around confused → miss fields → type in wrong spots → submit incomplete package → utility rejects → redo**After:**

1. Tap "Complete As-Built" on the close-out screen
2. Select work type (one tap)
3. See face sheet with PM#, address, date already filled in → tap "Looks Good" (one tap per field)
4. Type the 3-5 values that need human input (old pole #, serial number)
5. Swipe through CCSC checklist items
6. Mark up the construction sketch (or tap "Built As Designed")