---
name: 06-integrations-resume
model: claude-4.6-opus-high-thinking
description: You are resuming work on the **Integrations** domain of FieldLedger. A previous session completed partial work. Pick up where it left off.
---

# Agent 6 RESUME: Integrations — Remaining Work

You are resuming work on the **Integrations** domain of FieldLedger. A previous session completed partial work. Pick up where it left off.

## WHAT WAS ALREADY COMPLETED (do NOT redo)

- `backend/services/oracle/UnifierAdapter.js` — fully updated with retry + circuit breaker + Pino logging
- `backend/services/oracle/EAMAdapter.js` — fully updated with retry + circuit breaker + Pino logging
- `backend/services/oracle/P6Adapter.js` — constructor, `_executeWithRetry`, `authenticate`, and `getProject` updated

## FILES YOU OWN (you may ONLY touch these files)

- `backend/services/oracle/P6Adapter.js`
- `backend/services/oracle/index.js`
- `backend/services/biddingIntelligence.service.js`
- `backend/services/weather.service.js`
- `backend/services/email.service.js`
- `backend/routes/oracle.routes.js`
- `backend/routes/bidding.routes.js`
- `backend/routes/weather.routes.js`
- `backend/__tests__/oracle.adapters.test.js`
- `backend/__tests__/oracle.routes.test.js`
- `backend/__tests__/weather.service.test.js`
- `backend/__tests__/email.service.test.js`
- `frontend/src/services/OracleExportService.js`
- `frontend/src/services/__tests__/OracleExportService.test.js`
- `frontend/src/utils/oracleMapper.js`
- `frontend/src/utils/__tests__/oracleMapper.test.js`
- `frontend/src/components/bidding/BiddingDashboard.jsx`
- `frontend/src/components/bidding/CostAnalysisChart.jsx`
- `frontend/src/components/bidding/EstimateBuilder.jsx`
- `frontend/src/components/bidding/index.js`

## DO NOT TOUCH

- Any file not listed above
- `backend/middleware/`, `backend/models/`, other route files
- `frontend/src/App.jsx`, `frontend/src/api.js`
- Any file in `frontend/src/components/` outside of `bidding/`

## REMAINING TASKS (in priority order)

### Task 1: Finish P6Adapter.js
The constructor, `_executeWithRetry`, `authenticate`, and `getProject` are already done. Apply the same pattern to ALL remaining methods:
- Replace `console.log/warn/error` with Pino logger
- Wrap HTTP calls with `_executeWithRetry`
- Add proper error handling

### Task 2: Add FBDI Export Validation Endpoint
Add `POST /api/oracle/validate-export` to `backend/routes/oracle.routes.js`:
- Accept a claim ID
- Validate all required FBDI fields are present (vendorNumber, businessUnit, invoiceAmount, etc.)
- Validate line items have consistent units
- Return `{ valid: boolean, errors: [{ field, message }] }`

### Task 3: Add Bid vs Actual Comparison
In `backend/services/biddingIntelligence.service.js`:
- Add `compareJobBidToActual(jobId)` — returns bid amount, actual cost, variance, variance %
- Add `getCompanyBidAccuracy(companyId, dateRange)` — returns trend data
- Add route in `bidding.routes.js`
- Add variance chart in `BiddingDashboard.jsx`

### Task 4: Add Oracle Health Endpoint
Add `GET /api/oracle/health` to `backend/routes/oracle.routes.js`:
- Test all 3 adapters in parallel using `Promise.allSettled`
- Return `{ unifier: { status, latencyMs }, eam: { status, latencyMs }, p6: { status, latencyMs } }`

### Task 5: Improve Weather Hazard Assessment
In `backend/services/weather.service.js`, enhance `assessHazards()`:
- Wind tiers: 25 mph = CAUTION, 35 mph = STOP_WORK
- Lightning: thunderstorm condition codes (200-232) = HIGH
- Heat index: calculate from temp + humidity, >105°F = STOP_WORK
- Combined hazard score with `stopWorkRecommended: boolean`

### Task 6: Add Tests
- Tests for retry + circuit breaker on Oracle adapters (mock HTTP)
- Tests for FBDI validation (valid + invalid payloads)
- Tests for bid accuracy calculations
- Tests for Oracle health endpoint
- Tests for improved hazard assessment (each threshold)

## CODING CONVENTIONS

- Express 5, async handlers
- Pino structured logging (never console.log)
- All external HTTP calls must have 10s timeout
- Error responses: `{ error: 'message', code: 'ERROR_CODE' }`
- React 19: ref-as-prop, MUI 7: `<Grid size={{ xs: 12, md: 6 }}>`
- Copyright header: `/** Copyright (c) 2024-2026 FieldLedger. All Rights Reserved. */`

## COMPLETION CHECKLIST

- [ ] `cd backend && npm run lint` — zero errors
- [ ] `cd frontend && npm run lint` — zero errors
- [ ] `cd backend && npm test` — all passing
- [ ] `cd frontend && npm test` — all passing
- [ ] P6Adapter fully converted to Pino + retry
- [ ] FBDI validation endpoint working
- [ ] Bid vs actual comparison working
- [ ] Oracle health endpoint working
- [ ] Weather hazard assessment improved

