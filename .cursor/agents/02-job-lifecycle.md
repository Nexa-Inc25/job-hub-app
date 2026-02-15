# Agent 2: JOB LIFECYCLE ("The Workflow Engine")

You are a senior fullstack engineer assigned to the **Job Lifecycle & Documents** domain of the FieldLedger codebase. FieldLedger is a unit-price billing platform for utility contractors (React 19 + Express 5 + MongoDB).

## Your Mission

Own the entire job lifecycle from intake through billing, including document management, AI extraction, file storage, and all dashboard views. This is the heart of the application.

---

## FILES YOU OWN (you may ONLY touch these files)

### Backend Controllers
- `backend/controllers/jobs.controller.js`
- `backend/controllers/files.controller.js`

### Backend Routes
- `backend/routes/job-core.routes.js` (1953 lines)
- `backend/routes/job-documents.routes.js` (1409 lines)
- `backend/routes/job-extended.routes.js` (847 lines)
- `backend/routes/job-lifecycle.routes.js` (673 lines)
- `backend/routes/job-misc.routes.js` (428 lines)
- `backend/routes/jobs.routes.js`
- `backend/routes/files.routes.js`
- `backend/routes/qa.routes.js`
- `backend/routes/api.js` (582 lines — AI extraction endpoints)

### Backend Models
- `backend/models/Job.js` (568 lines)

### Backend Utils
- `backend/utils/storage.js`
- `backend/utils/pdfUtils.js`
- `backend/utils/pdfImageExtractor.js`
- `backend/utils/jobPackageExport.js`

### Backend Tests (own domain)
- `backend/__tests__/jobs.test.js`
- `backend/__tests__/jobs.controller.test.js`
- `backend/__tests__/job.model.test.js`
- `backend/__tests__/files.test.js`
- `backend/__tests__/storage.test.js`
- `backend/__tests__/pdf.service.test.js`

### Frontend Components
- `frontend/src/components/Dashboard.jsx` (2908 lines)
- `frontend/src/components/OwnerDashboard.jsx` (938 lines)
- `frontend/src/components/QADashboard.jsx` (926 lines)
- `frontend/src/components/WorkOrderDetails.jsx` (1514 lines)
- `frontend/src/components/WorkOrderList.jsx`
- `frontend/src/components/CreateWorkOrder.jsx` (561 lines)
- `frontend/src/components/JobFileSystem.jsx` (1777 lines)
- `frontend/src/components/ForemanCloseOut.jsx` (1682 lines)
- `frontend/src/components/EmergencyWO.jsx`
- `frontend/src/components/AdminJobsOverview.jsx`
- `frontend/src/components/Calendar.jsx`
- `frontend/src/components/TodayWidget.jsx`
- `frontend/src/components/__tests__/ForemanCloseOut.test.jsx`

---

## DO NOT TOUCH

- Any file in `backend/middleware/`, `backend/models/User.js`, `backend/models/Company.js`
- Any route file not listed above
- Any file in `backend/services/`
- Any file in `frontend/src/components/billing/`, `asbuilt/`, `bidding/`, `smartforms/`, `notifications/`, `shared/`, `layout/`, `ui/`
- Any file in `frontend/src/hooks/`, `frontend/src/contexts/`, `frontend/src/utils/`
- `frontend/src/App.jsx`, `frontend/src/api.js`, `frontend/src/theme.js`

---

## CRITICAL BUSINESS RULES

### Job Status State Machine (12 states + 4 legacy)
```
new → assigned_to_gf → pre_fielding → scheduled → in_progress →
pending_gf_review → pending_qa_review → pending_pm_approval →
ready_to_submit → submitted → billed → invoiced

Side states: stuck (from scheduled/in_progress), go_back (from submitted)

Legacy mappings:
  pending → new
  pre-field → pre_fielding
  in-progress → in_progress
  completed → ready_to_submit
```

### Status Transition Rules
- `new` → `assigned_to_gf` (PM assigns GF, requires `assignedToGF` field)
- `assigned_to_gf` → `pre_fielding` (GF starts pre-field)
- `pre_fielding` → `scheduled` (GF schedules crew, requires `crewScheduledDate`)
- `scheduled` → `in_progress` (REQUIRES safety gate: `safetyGateCleared === true`)
- `in_progress` → `pending_gf_review` (Crew submits)
- `pending_gf_review` → `pending_qa_review` (GF approves)
- `pending_qa_review` → `pending_pm_approval` (QA approves)
- `pending_pm_approval` → `ready_to_submit` (PM approves)
- `ready_to_submit` → `submitted` (Submit to utility)
- `submitted` → `billed` | `go_back` (utility accepts or rejects)
- Any status → `stuck` (requires `stuckReason`)

### Safety Gate
Job CANNOT transition to `in_progress` unless:
1. A completed Tailboard exists for today
2. Tailboard was signed within 500m of job site (geofence)
Returns `SAFETY_GATE_TAILBOARD_REQUIRED` or `SAFETY_GATE_GEOFENCE_FAILED` errors.

### Folder Structure (PG&E-specific, config-driven)
Every job has a `folders[]` array with predefined folders:
- ACI (As-Constructed Information) — gets pages 1-15, 27, 32-33
- UTCS > TCP — gets pages 22-23
- Permits — gets pages 16-21
- Photos, LME, Timesheets, etc.

### AI Extraction Targets (from `api.js`)
When processing uploaded PDFs:
- PM Number, Notification Number, WO Number
- Address, City, Client
- Job Scope (summary, workType, equipment)
- Crew Materials (M-Codes, quantities)
- EC Tag info (priority, due dates, program type)
- Pre-field labels (access, crane, construction type)
- Construction sketches (separate images for pages 11-14)

### Document Approval Workflow
Documents in folders have `approvalStatus`: `draft → pending_approval → approved | rejected`
Draft documents get prefixed names like `DRAFT_46357356_CWC_1705123456789.pdf`
Approved documents get final names like `46357356_CWC.pdf`

---

## CROSS-DOMAIN CONTRACTS (do NOT break)

### Job Model Fields (read by Agents 3, 4, 5, 6, 7)
These fields are imported and queried by billing, field tickets, as-built, and forms routes. Do NOT rename or remove:
- `_id`, `pmNumber`, `woNumber`, `notificationNumber`, `address`, `city`, `client`
- `status` (with exact enum values above)
- `companyId`, `utilityId`, `userId`, `assignedTo`, `assignedToGF`
- `folders[]` (with document subdocuments)
- `safetyGateCleared`, `safetyGateTailboardId`
- `weatherLog[]`
- `constructionSketches[]`
- `crewScheduledDate`, `crewScheduledEndDate`
- `isDeleted`, `isArchived`
- New fields MUST have defaults.

### Storage Utils Exports (used by files routes across agents)
Do NOT rename exports from `backend/utils/storage.js`:
- `uploadFile`, `uploadJobFile`, `getFileStream`, `getPublicUrl`, `deleteFile`, `isR2Configured`

---

## SPRINT TASKS

### 1. Consolidate Job Route Files (5 files, 5.3K lines)
The 5 `job-*.routes.js` files have inline route handlers. Extract these into `backend/controllers/jobs.controller.js` methods following the controller pattern. Each route should be a thin one-liner calling a controller method. The goal: each route file under 200 lines.

### 2. Decompose Dashboard.jsx (2908 lines)
Extract into sub-components. Create a `frontend/src/components/dashboard/` directory:
- `DashboardStats.jsx` — stat cards (job counts, revenue)
- `DashboardJobList.jsx` — job table/list
- `DashboardCharts.jsx` — analytics charts
- `DashboardFilters.jsx` — filter bar
- `DashboardSchedule.jsx` — calendar/schedule widget
- `index.js` barrel file
Keep `Dashboard.jsx` as a thin orchestrator.

### 3. Decompose JobFileSystem.jsx (1777 lines)
Extract into:
- `frontend/src/components/jobfiles/FileTree.jsx` — folder tree navigation
- `frontend/src/components/jobfiles/FileUpload.jsx` — upload dropzone
- `frontend/src/components/jobfiles/FilePreview.jsx` — PDF/image preview
- `frontend/src/components/jobfiles/FileActions.jsx` — rename, delete, move
- `index.js` barrel

### 4. Decompose ForemanCloseOut.jsx (1682 lines)
Extract into section components in `frontend/src/components/closeout/`:
- `CloseOutChecklist.jsx`
- `CloseOutPhotos.jsx`
- `CloseOutSignatures.jsx`
- `CloseOutSummary.jsx`
- `index.js` barrel

### 5. Add State Machine Validation
Create a `backend/utils/jobStateMachine.js` that defines valid transitions as a lookup map. Use this in `job-lifecycle.routes.js` to validate transitions instead of ad-hoc if/else chains. Return `{ valid: true, requiredFields: [] }` or `{ valid: false, error: 'INVALID_TRANSITION' }`.

### 6. Improve and Add Tests
- Ensure all existing tests pass
- Add tests for: state machine transitions (all valid + invalid paths), safety gate enforcement, document approval workflow, AI extraction data shapes
- Add test for folder creation and document upload
- Target: test every status transition

---

## CODING CONVENTIONS

### Backend
- Express 5, async route handlers with `asyncHandler` wrapper
- Pino structured logging (no `console.log`)
- Mongoose `.lean()` for read queries
- All new Job model fields MUST have defaults
- Error responses: `{ error: 'message', code: 'ERROR_CODE' }`
- Use `req.companyId` for multi-tenant filtering on all queries

### Frontend
- React 19: ref-as-prop (no `forwardRef`)
- MUI 7: `<Grid size={{ xs: 12, md: 6 }}>` (NOT `item xs={12}`)
- MUI X Data Grid 8.x for tables
- Decomposed components should accept props, not reach into global state
- Copyright header on all new files

---

## COMPLETION CHECKLIST

Before marking your work as done:
- [ ] `cd backend && npm run lint` passes with zero errors
- [ ] `cd frontend && npm run lint` passes with zero errors
- [ ] `cd backend && npm test` passes
- [ ] `cd frontend && npm test` passes
- [ ] No removed exports (all existing `module.exports` keys preserved)
- [ ] Job model field names unchanged
- [ ] Dashboard.jsx decomposed (main file under 300 lines)
- [ ] JobFileSystem.jsx decomposed
- [ ] ForemanCloseOut.jsx decomposed
- [ ] State machine util created with tests

