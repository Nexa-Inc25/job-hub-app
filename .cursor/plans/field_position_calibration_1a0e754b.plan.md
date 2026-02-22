---
name: Field Position Calibration
overview: Calibrate the PG&E seed config field positions (x/y coordinates) against real job package PDFs so the stamp engine places values in the exact correct spots on face sheets, EC tags, FDA grids, and equipment info pages.
todos:
  - id: cal-face-sheet
    content: Calibrate face sheet sign-off field positions from Estimated_Job_Package.pdf page 2
    status: pending
  - id: cal-ec-tag
    content: Calibrate EC tag completion field positions from FOREMAN_DOC pages 1-3
    status: pending
  - id: cal-fda-grid
    content: Calibrate FDA grid checkbox positions from FOREMAN_DOC pages 4-6
    status: pending
  - id: cal-equipment
    content: Calibrate equipment info field positions from Electrical_Equipment_and_Pole_Informatio.pdf
    status: pending
  - id: cal-ccsc
    content: Calibrate CCSC header/footer field positions from CCSC_FORM.pdf
    status: pending
  - id: cal-unit-price
    content: Add unit_price_completion document type with division checkbox positions
    status: pending
  - id: cal-detection
    content: Update page classifier detection keywords from real document text
    status: completed
  - id: cal-test
    content: Test stamp output against real PDFs to verify field alignment
    status: in_progress
isProject: false
---

# As-Built Field Position Calibration

## Context

The As-Built Guided Completion Engine is built (Phases 0-6 complete). The stamp engine writes values onto the original job package PDF at x/y coordinates defined in the PG&E utility config seed. Currently those coordinates are **estimates**. This task calibrates them against real PG&E documents.

## What Exists

- **PG&E seed config**: [backend/seeds/pge-asbuilt-config.js](backend/seeds/pge-asbuilt-config.js) -- has `documentCompletions` with field positions (x, y, width, fontSize) and `fdaGrid` with 161 checkbox rows
- **Stamp engine**: [backend/services/asbuilt/PdfStamper.js](backend/services/asbuilt/PdfStamper.js) -- `stampSection()` draws text/checkmarks/signatures at the configured positions
- **Page classifier**: [backend/services/asbuilt/PageClassifier.js](backend/services/asbuilt/PageClassifier.js) -- identifies pages by content using detection keywords
- **Wizard submit**: [backend/routes/asbuilt.routes.js](backend/routes/asbuilt.routes.js) (line ~1570) -- stamps all sections on submit

## Real PDFs Available for Calibration

Uploaded to `/Users/mike/.cursor/projects/Users-mike-job-hub-app/uploads/`:**Job Package PDFs (pages to calibrate against):**

- `Estimated_Job_Package.pdf` -- 9 pages, A4 (595x842), contains Face Sheet (3 pages), Crew Instructions, Crew Materials
- `FOREMAN_DOC_PM-46271318_20260202_042904.pdf` -- 11 pages, Letter (612x792), contains EC Tag (6 pages incl. 3 FDA pages), Progress Billing, Circuit Map, CCSC

**Standalone Form PDFs (for reference):**

- `Distribution_Unit_Price_Completion_Form_.pdf` -- the unit price form with division checkboxes
- `CCSC_FORM.pdf` -- 2 pages, Rev 6
- `Pole_replacement_Progress_Billing_Projec.pdf` -- billing form
- `Electrical_Equipment_and_Pole_Informatio.pdf` -- equipment/pole info
- `Contractor_Work_Checklist_GF.pdf` -- CWC
- `Field_Paving_Form.pdf` -- paving form
- `Job_Package_Checklist.pdf` -- checklist
- `LME_.pdf` -- LME timesheet
- `Circuit_Map_Change_Sheet.pdf`
- `Construction_drawing.pdf` -- sketch page (792x1224, landscape)

## Calibration Method

For each document section, extract text with position data from the real PDF to find exact x/y coordinates where fields sit. The approach:

1. Use `pdf-lib` to get page dimensions
2. Use `pdfjs-dist` (backend has it installed) or text position extraction to find where labels like "PM/Order #", "LAN ID", "Signature" appear on the page
3. The fill-in field is typically to the RIGHT of or BELOW the label
4. Record the exact coordinates and update the seed config

## Documents to Calibrate

### 1. Face Sheet Sign-Off (Estimated_Job_Package.pdf, page 2)

Text from page 2:

```javascript
Construction Foreman Sign-Off (Check all that apply)
Built as Designed  |  Redlined  |  Feedback Form completed
Foreman's Signature  |  Lan ID  |  mm/dd/yy
Supervisor's Signature  |  Lan ID  |  mm/dd/yy
```

Fields to position:

- `builtAsDesigned` checkbox
- `redlined` checkbox
- `feedbackFormCompleted` checkbox
- `foremanSignature` (signature)
- `foremanLanId` (text)
- `foremanDate` (date)
- `supervisorSignature` (signature)
- `supervisorLanId` (text)
- `supervisorDate` (date)

### 2. EC Tag Completion (FOREMAN_DOC, pages 1-3)

Page 1 fields: LAN ID, Completion Date, Actual Hours, Status, Crew Type, SignaturePage 3 fields: Additional EC tag items (if multi-tag)

### 3. FDA Grid (FOREMAN_DOC, pages 4-6)

Already have 161 rows mapped. Need to calibrate:

- Action column X positions (Repair, Replace, Install, etc.)
- Status checkbox X offsets (New, Priority, Comp)
- Row Y positions for each category
- Verify against real text positions on pages 4-6

### 4. Equipment Info (Electrical_Equipment_and_Pole_Informatio.pdf)

Fields: old/new pole numbers, heights, classes, serial numbers, equipment entries

### 5. CCSC (CCSC_FORM.pdf, 2 pages)

Header fields: PM/Order #, Location #, Address/GPSFooter fields: Crew Lead Name, Signature, Date, Comments

### 6. Distribution Unit Price Completion Form

Fields: Date, PM/Order #, Notification #, Location #, Division checkboxes, Tag Type, Crew Headcount, Hours

## Deliverables

1. Updated [backend/seeds/pge-asbuilt-config.js](backend/seeds/pge-asbuilt-config.js) with exact field positions
2. Updated detection keywords based on real document text
3. New document types added: `unit_price_completion`, `cwc` (Contractor Work Checklist)
4. Add face sheet sign-off fields (Built as Designed/Redlined/Feedback checkboxes)
5. Test stamp output against real PDFs to verify alignment