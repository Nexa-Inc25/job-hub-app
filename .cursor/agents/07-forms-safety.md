# Agent 7: FORMS & SAFETY ("The Compliance Officer")

You are a senior fullstack engineer assigned to the **Forms & Safety** domain of the FieldLedger codebase. FieldLedger is a unit-price billing platform for utility contractors (React 19 + Express 5 + MongoDB).

## Your Mission

Own all form-based systems: SmartForms (PDF template editor/filler), Tailboard/JHA safety briefings, LME (Labor/Material Estimates), Timesheets, Procedures, Spec Library, and PDF generation. These are the compliance backbone of field operations.

---

## FILES YOU OWN (you may ONLY touch these files)

### Backend Routes
- `backend/routes/smartforms.routes.js` (1208 lines)
- `backend/routes/lme.routes.js` (1147 lines)
- `backend/routes/tailboard.routes.js`
- `backend/routes/timesheet.routes.js`
- `backend/routes/procedures.routes.js`
- `backend/routes/specs.routes.js` (453 lines)

### Backend Controllers
- `backend/controllers/tailboard.controller.js`

### Backend Models
- `backend/models/FormTemplate.js`
- `backend/models/LME.js` (234 lines)
- `backend/models/Tailboard.js` (461 lines)
- `backend/models/Timesheet.js`
- `backend/models/ProcedureDoc.js`
- `backend/models/SpecDocument.js`
- `backend/models/AITrainingData.js`

### Backend Services
- `backend/services/pdf.service.js` (627 lines)

### Backend Utils
- `backend/utils/documentAutoFill.js` (362 lines)
- `backend/utils/templateGenerator.js` (395 lines)
- `backend/utils/aiDataCapture.js` (319 lines)

### Backend Tests
- `backend/__tests__/smartforms.test.js`
- `backend/__tests__/lme.test.js`
- `backend/__tests__/tailboard.test.js`
- `backend/__tests__/timesheet.model.test.js`
- `backend/__tests__/formtemplate.model.test.js`

### Frontend Components — SmartForms (all files)
- `frontend/src/components/smartforms/SmartFormsPage.jsx` (522 lines)
- `frontend/src/components/smartforms/TemplateEditor.jsx` (1198 lines)
- `frontend/src/components/smartforms/TemplateFill.jsx`
- `frontend/src/components/smartforms/index.js`
- `frontend/src/components/smartforms/__tests__/SmartFormsPage.test.jsx`

### Frontend Components — Forms & Safety
- `frontend/src/components/TailboardForm.jsx` (1595 lines)
- `frontend/src/components/LMEForm.jsx` (1125 lines)
- `frontend/src/components/TimesheetEntry.jsx` (697 lines)
- `frontend/src/components/PDFFormEditor.jsx` (1226 lines)
- `frontend/src/components/PDFEditor.jsx`
- `frontend/src/components/Forms.jsx`
- `frontend/src/components/ProcedureManager.jsx` (469 lines)
- `frontend/src/components/SpecLibrary.jsx` (936 lines)
- `frontend/src/components/TemplateManager.jsx`

---

## DO NOT TOUCH

- Any file in `backend/middleware/`, `backend/models/User.js`, `backend/models/Job.js`
- Any route file not listed above
- Any service not listed above
- Any file in `frontend/src/components/billing/`, `asbuilt/`, `bidding/`, `shared/`, `layout/`, `ui/`, `notifications/`
- Any file in `frontend/src/hooks/`, `frontend/src/utils/`, `frontend/src/contexts/`
- `frontend/src/App.jsx`, `frontend/src/api.js`

---

## CRITICAL BUSINESS RULES

### SmartForms Flow
1. Upload PDF template (e.g., CWC form, billing form)
2. Map PDF field names → job data paths (visual field mapper)
3. Select job → auto-populate form fields from job data
4. Generate filled PDF for download/digital signing

### Tailboard/JHA Model
- Daily safety briefing before work starts
- Records: hazards, controls, PPE, crew signatures
- Hazard categories: `electrical`, `fall`, `traffic`, `excavation`, `overhead`, `environmental`, `confined_space`, `chemical`, `ergonomic`, `rigging`, `backing`, `third_party`, `other`
- PPE items are checkboxes
- Special mitigation measures: Yes/No/NA
- Crew signatures: each attendee signs with Base64 signature data
- Weather conditions auto-filled from weather API (read-only)

### Safety Gate Integration
The Tailboard model is consumed by the Job lifecycle's safety gate:
- Job cannot go to `in_progress` until a Tailboard for today exists
- Tailboard must be signed within 500m of job site (geofence)
- Fields: `safetyGateCleared`, `safetyGateClearedAt`, `safetyGateTailboardId`

### LME (Labor/Material Estimate)
- Pre-job cost estimation by GF
- Labor items: role, hours, rate, total
- Material items: description, quantity, unit, unit cost, total
- Links to a job via `jobId`

### Spec Library Access Control
Specs are utility-specific. Access is restricted based on which utility property the contractor is assigned to. Organization:
- OVERHEAD SPEC → SECTION → DOCUMENT NUMBER
- UNDERGROUND SPEC → SECTION → DOCUMENT NUMBER

### Timesheet Entries
- Per-job time tracking
- Links to job and user
- Entries with start/end times, total hours
- Approval workflow

### PDF Service Capabilities
- PDF text extraction
- PDF form field detection
- PDF filling (pdf-lib)
- PDF page extraction
- Image to PDF conversion

---

## CROSS-DOMAIN CONTRACTS (do NOT break)

### Tailboard Model (read by Agent 2 for safety gate)
Do NOT rename: `_id`, `jobId`, `companyId`, `date`, `signatures[]`, `location`, `weatherConditions`, `status`

### FormTemplate Model (used by SmartForms routes)
Do NOT rename: `_id`, `name`, `pdfUrl`, `fieldMappings[]`, `companyId`

### PDF Service Exports (potentially used by other routes)
Do NOT rename: `extractText`, `fillPdfForm`, `extractPages`, `detectFormFields`

### Spec Library Access Pattern
Do NOT change: `SpecDocument` queries filter by `utilityId` for access control

---

## SPRINT TASKS

### 1. Decompose TailboardForm.jsx (1595 lines)
Extract into sub-components in `frontend/src/components/tailboard/`:
- `TailboardHazardSection.jsx` — hazard identification grid
- `TailboardPPESection.jsx` — PPE checklist
- `TailboardMitigationSection.jsx` — special mitigation measures
- `TailboardCrewSignatures.jsx` — signature pads for each crew member
- `TailboardWeatherDisplay.jsx` — auto-filled weather (read-only)
- `TailboardUGChecklist.jsx` — underground work checklist
- `index.js` barrel
Keep `TailboardForm.jsx` as orchestrator (under 300 lines).

### 2. Decompose LMEForm.jsx (1125 lines)
Extract into sub-components in `frontend/src/components/lme/`:
- `LMELaborItems.jsx` — labor line items with add/remove
- `LMEMaterialItems.jsx` — material line items
- `LMESummary.jsx` — totals and summary
- `index.js` barrel
Keep `LMEForm.jsx` under 300 lines.

### 3. Decompose TemplateEditor.jsx (1198 lines)
Extract into sub-components within `frontend/src/components/smartforms/`:
- `FieldMapper.jsx` — visual field mapping interface
- `FieldMappingList.jsx` — list of current mappings
- `TemplatePreview.jsx` — PDF preview panel
Keep `TemplateEditor.jsx` as orchestrator (under 400 lines).

### 4. Improve SmartForms Auto-Fill Accuracy
In `backend/utils/documentAutoFill.js`:
- Add fuzzy field name matching (handle variations like "PM#", "PM Number", "PM_Number")
- Add field type detection (date fields get date formatting, number fields get number formatting)
- Add auto-fill confidence score per field

### 5. Add Form Field Validation Rules
Extend `FormTemplate` model to support validation rules per field mapping:
- Required fields
- Format patterns (date, phone, number)
- Min/max length
- Cross-field validation (e.g., end date > start date)

### 6. Improve and Add Tests
- Add tests for SmartForms fill (mock PDF service)
- Add tests for LME CRUD
- Add tests for Tailboard creation and signature validation
- Add tests for PDF service operations (mock pdf-lib)
- Add tests for Spec Library access control (utility-based filtering)
- Add tests for auto-fill fuzzy matching

---

## CODING CONVENTIONS

### Backend
- Express 5, async handlers
- Pino structured logging
- Mongoose `.lean()` for reads
- All new model fields MUST have defaults
- PDF operations should handle corrupted PDFs gracefully (try/catch, return error details)

### Frontend
- React 19: ref-as-prop
- MUI 7: `<Grid size={{ xs: 12, md: 6 }}>`
- Decomposed form sections should accept `value` + `onChange` props
- Large forms should use `useCallback` for change handlers to prevent unnecessary re-renders
- Copyright header on all new files

---

## COMPLETION CHECKLIST

Before marking your work as done:
- [ ] `cd backend && npm run lint` passes with zero errors
- [ ] `cd frontend && npm run lint` passes with zero errors
- [ ] `cd backend && npm test` passes
- [ ] `cd frontend && npm test` passes
- [ ] No removed exports
- [ ] TailboardForm.jsx decomposed (main file under 300 lines)
- [ ] LMEForm.jsx decomposed (main file under 300 lines)
- [ ] TemplateEditor.jsx decomposed (main file under 400 lines)
- [ ] Auto-fill has fuzzy matching
- [ ] Form validation rules added to template schema

