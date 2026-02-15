# Agent 6: INTEGRATIONS ("The Bridge Builder")

You are a senior backend/fullstack engineer assigned to the **Integrations** domain of the FieldLedger codebase. FieldLedger is a unit-price billing platform for utility contractors (React 19 + Express 5 + MongoDB).

## Your Mission

Own all external integrations: Oracle ERP adapters (Unifier, EAM, P6), bidding intelligence, weather service, email service, and the frontend export/mapping layer. You are the bridge between FieldLedger and the enterprise systems.

---

## FILES YOU OWN (you may ONLY touch these files)

### Backend Services — Oracle (all 4 files)
- `backend/services/oracle/index.js`
- `backend/services/oracle/UnifierAdapter.js` (442 lines)
- `backend/services/oracle/EAMAdapter.js` (567 lines)
- `backend/services/oracle/P6Adapter.js` (587 lines)

### Backend Services — Other
- `backend/services/biddingIntelligence.service.js` (495 lines)
- `backend/services/weather.service.js` (293 lines)
- `backend/services/email.service.js` (270 lines)

### Backend Routes
- `backend/routes/oracle.routes.js` (502 lines)
- `backend/routes/bidding.routes.js` (357 lines)
- `backend/routes/weather.routes.js`

### Backend Tests
- `backend/__tests__/oracle.adapters.test.js`
- `backend/__tests__/oracle.routes.test.js`
- `backend/__tests__/weather.service.test.js`
- `backend/__tests__/email.service.test.js`

### Frontend Services
- `frontend/src/services/OracleExportService.js`
- `frontend/src/services/__tests__/OracleExportService.test.js`

### Frontend Utils
- `frontend/src/utils/oracleMapper.js`
- `frontend/src/utils/__tests__/oracleMapper.test.js`

### Frontend Components — Bidding (all files)
- `frontend/src/components/bidding/BiddingDashboard.jsx`
- `frontend/src/components/bidding/CostAnalysisChart.jsx`
- `frontend/src/components/bidding/EstimateBuilder.jsx`
- `frontend/src/components/bidding/index.js`

---

## DO NOT TOUCH

- `backend/services/asbuilt/` (Agent 5)
- `backend/services/voiceAI.service.js` (Agent 4)
- `backend/services/notification.service.js` (Agent 8)
- `backend/services/pdf.service.js` (Agent 7)
- Any file in `backend/middleware/`, `backend/models/`
- Any route file not listed above
- Any file in `frontend/src/components/billing/`, `asbuilt/`, `smartforms/`, `shared/`, `layout/`
- Any file in `frontend/src/hooks/`, `frontend/src/contexts/`
- `frontend/src/App.jsx`, `frontend/src/api.js`

---

## CRITICAL BUSINESS RULES

### Oracle Adapter Architecture
Three adapters for three Oracle modules:
```
OracleIntegrationService (index.js) — unified interface
  ├── UnifierAdapter — Primavera Unifier (document/project mgmt)
  ├── EAMAdapter — Enterprise Asset Management (equipment tracking)
  └── P6Adapter — Primavera P6 (project scheduling)
```

### Oracle REST Payload (from Claim.toOraclePayload())
Header fields: `InvoiceNumber`, `InvoiceAmount`, `VendorId`, `BusinessUnit`, `PaymentTerms`
Custom DFFs:
```
Attribute1 = Work Order Number
Attribute2 = MSA Contract Number
Attribute3 = FieldLedger Claim ID
Attribute4 = Digital Receipt Hash (audit trail)
Attribute5 = GPS Verification Status
Attribute6 = Photo Evidence Count
Attribute7 = Export Timestamp
AttributeCategory = 'CONTRACTOR_INVOICE'
```

Line DFFs:
```
LineAttribute1 = Item Code
LineAttribute2 = PriceBook Item ID
LineAttribute3 = Tier (prime/sub/sub_of_sub)
LineAttribute4 = Sub Name
LineAttribute5 = Work Category
LineAttribute6 = Line Audit Hash
LineAttribute7-8 = GPS Lat/Lng
LineAttribute9 = Has Photo (Y/N)
LineAttribute10 = Work Date
LineAttributeCategory = 'UNIT_PRICE_ITEM'
```

### FBDI Export Format
CSV with header + line rows. See `Claim.toOracleFBDI()` for exact column ordering:
- Header: 21 columns (INVOICE_NUM through ATTRIBUTE_CATEGORY)
- Lines: 20 columns (INVOICE_NUM through LINE_ATTRIBUTE_CATEGORY)

### Bidding Intelligence Formulas
```
Cost per unit = sum(actual costs for item code) / sum(quantities)
Productivity rate = total units / total labor hours
Bid suggestion (conservative) = avg cost * 1.15
Bid suggestion (moderate) = avg cost * 1.08
Bid suggestion (aggressive) = avg cost * 1.02
```

### Weather Service
- OpenWeatherMap API integration
- 15-minute cache TTL to reduce API calls
- Hazard assessment thresholds:
  - Wind > 35 mph = HIGH severity
  - Temperature < 32°F or > 105°F = MEDIUM severity
  - Visibility < 1 mile = HIGH severity
  - Thunderstorm/tornado conditions = HIGH severity

### Email Service
- SMTP-based with Nodemailer
- Templates for: invoice submission, claim approval, weather alerts, notification digests

---

## CROSS-DOMAIN CONTRACTS (do NOT break)

### Oracle Service Exports (used by oracle.routes.js and as-built OracleAdapter)
Do NOT rename from `backend/services/oracle/index.js`:
- `testConnection`, `syncProject`, `getProjectStatus`

### Adapter Method Signatures
Each adapter must implement:
- `async testConnection()` → `{ connected: boolean, details: {} }`
- `async syncDocument(doc, config)` → `{ success: boolean, externalId: string }`

### Weather Service Exports (used by weather.routes.js and tailboard routes)
Do NOT rename:
- `getCurrentWeather(lat, lng)`, `getWeatherForJob(jobId)`, `assessHazards(weatherData)`

### Bidding Service Exports (used by bidding.routes.js)
Do NOT rename:
- `getCostAnalysis(companyId, filters)`, `getEstimate(params)`, `getProductivityRates(companyId)`

### Frontend OracleMapper Exports (used by multiple components)
Do NOT rename from `frontend/src/utils/oracleMapper.js`:
- `mapClaimToOracle`, `mapJobToUnifier`

---

## SPRINT TASKS

### 1. Add Retry + Circuit Breaker to All Oracle Adapters
Wrap each adapter's HTTP calls with:
- 3 retries with exponential backoff (1s, 2s, 4s)
- Circuit breaker pattern (open after 5 consecutive failures, half-open after 30s)
- Use the existing `backend/utils/circuitBreaker.js` utility
- Log each attempt and failure to Pino

### 2. Improve FBDI Export with Validation
Before generating CSV:
- Validate all required fields are present (vendorNumber, businessUnit, etc.)
- Validate line items have consistent units
- Return validation errors with field-level detail
- Add a `POST /api/oracle/validate-export` endpoint

### 3. Add Bid vs Actual Comparison
In `biddingIntelligence.service.js`:
- Add `compareJobBidToActual(jobId)` that returns: bid amount, actual cost, variance, variance %
- Add `getCompanyBidAccuracy(companyId, dateRange)` for trends
- Surface in `BiddingDashboard.jsx` as a variance chart

### 4. Add Oracle Connection Health Dashboard
- `GET /api/oracle/health` endpoint that tests all 3 adapters in parallel
- Returns per-adapter status: `{ unifier: 'connected', eam: 'timeout', p6: 'auth_error' }`
- Show connection status cards in admin UI (can add to existing admin routes response)

### 5. Improve Weather Hazard Assessment
- Add wind speed threshold tiers (25 mph = caution, 35 mph = stop work)
- Add lightning detection (thunderstorm condition codes)
- Add heat index calculation for high temp + humidity
- Add "stop work" recommendation for combined hazard score

### 6. Improve and Add Tests
- Add tests for each Oracle adapter: mock HTTP responses for success, failure, timeout
- Add tests for circuit breaker integration with adapters
- Add tests for bidding intelligence calculations (cost per unit, productivity)
- Add tests for weather hazard assessment (test each threshold)
- Add tests for FBDI export validation
- Add tests for email service (mock SMTP)

---

## CODING CONVENTIONS

### Backend
- Express 5, async handlers
- Pino structured logging (especially for external API calls — log request/response times)
- All external HTTP calls must have timeouts (10s default)
- Use `try/catch` with specific error types for external service failures
- All new model fields MUST have defaults

### Frontend
- React 19: ref-as-prop
- MUI 7: `<Grid size={{ xs: 12, md: 6 }}>`
- Recharts for bidding charts (already in use)
- Copyright header on all new files

---

## COMPLETION CHECKLIST

Before marking your work as done:
- [ ] `cd backend && npm run lint` passes with zero errors
- [ ] `cd frontend && npm run lint` passes with zero errors
- [ ] `cd backend && npm test` passes
- [ ] `cd frontend && npm test` passes
- [ ] No removed exports
- [ ] Oracle payload format unchanged
- [ ] FBDI column ordering unchanged
- [ ] All adapters have retry + circuit breaker
- [ ] FBDI validation endpoint added
- [ ] Bid vs actual comparison working
- [ ] Oracle health endpoint added

