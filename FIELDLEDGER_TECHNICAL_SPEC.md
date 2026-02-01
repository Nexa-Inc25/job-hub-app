# FieldLedger - Technical Specification & Workflow Architecture

**Version:** 1.0.0 (Production Release)  
**Date:** February 1, 2026  
**Target:** Utility Construction Enterprise (PG&E, SCE, SDG&E)

---

## 1. Executive Summary

FieldLedger is an enterprise-grade construction management platform that solves the "last mile" problem between field execution and utility payment. It replaces manual paper/PDF workflows with a digital-first, offline-capable system that integrates directly with utility ERPs (Oracle/SAP).

### Core Value Proposition
- **For Contractors:** Reduces billing lag from 45+ days to <5 days.
- **For Utilities:** Provides real-time visibility into field assets and compliance.
- **For Regulators:** Creates an immutable, GPS-verified audit trail of all work.

---

## 2. System Architecture

### High-Level Schematic

```mermaid
graph TD
    subgraph "Field Operations (Mobile PWA)"
        Foreman[Foreman / Crew]
        OfflineDB[(IndexedDB)]
        GPS[GPS Service]
        Camera[Camera]
    end

    subgraph "Cloud Infrastructure (Railway/Vercel)"
        API[Node.js API Gateway]
        Auth[JWT + MFA Security]
        Router[As-Built Router]
        Billing[Billing Engine]
    end

    subgraph "Data Persistence"
        Mongo[(MongoDB Atlas)]
        R2[(Cloudflare R2 Storage)]
        Redis[(Redis Cache)]
    end

    subgraph "Utility Integrations"
        Oracle[Oracle Fusion Cloud]
        GIS[ESRI ArcGIS]
        SharePoint[SharePoint Online]
    end

    Foreman -->|Log Unit| OfflineDB
    OfflineDB -->|Sync (TLS 1.3)| API
    Foreman -->|Capture| GPS
    Foreman -->|Photo| Camera
    
    API --> Auth
    API --> Billing
    API --> Router
    
    Billing --> Mongo
    Router --> R2
    
    Billing -->|FBDI Export| Oracle
    Router -->|GeoJSON| GIS
    Router -->|PDF| SharePoint
```

---

## 3. Role-Based Workflows

### A. Foreman (Field Execution)
**Goal:** Capture work accurately without paperwork delays.

1.  **Login & Sync**: Authenticates via mobile app; downloads Price Book & Job Data for offline use.
2.  **Unit Capture**:
    *   Selects `Job` -> `Log Unit`.
    *   Searches Price Book (e.g., "POLE-45").
    *   **GPS Lock**: App verifies location accuracy (<50m).
    *   **Photo Evidence**: Captures before/after photos (timestamped & hashed).
    *   **Submit**: Saves to local queue.
3.  **As-Built Submission**:
    *   Uploads single PDF package at end of job.
    *   App auto-splits and routes sections.

**Key Tech**: `useOffline` hook, `IndexedDB`, `GPSPhotoCapture` component.

### B. General Foreman / Superintendent (Review)
**Goal:** Verify field data before it reaches the office.

1.  **Daily Review**:
    *   Opens `BillingDashboard`.
    *   Filters by "Submitted" status.
2.  **Verification**:
    *   Checks GPS map vs. Job Location.
    *   Reviews photo evidence.
    *   **Action**: `Verify` (moves to PM) or `Dispute` (sends back to Foreman).
3.  **Redline Check**:
    *   Receives email alert if "Redlines" detected in As-Built.
    *   Confirms design changes with Estimating.

**Key Tech**: `UnitApprovalGrid`, `ProofPanel`, `DisputeDialog`.

### C. Project Manager (Billing & Compliance)
**Goal:** Generate accurate claims and ensure rapid payment.

1.  **Approval Queue**:
    *   Reviews "Verified" units.
    *   Checks budget vs. actuals.
    *   **Action**: `Approve` for billing.
2.  **Claim Generation**:
    *   Selects approved units.
    *   Clicks "Create Claim".
    *   System generates `CLM-2026-XXX`.
3.  **Oracle Export**:
    *   Exports **FBDI CSV** (bulk import) or **JSON** (API).
    *   Uploads to Utility Portal.

**Key Tech**: `ClaimsManagement`, `OracleExportService`, `BillingAnalytics`.

---

## 4. Module Specifications

### 📦 Billing Module
*   **Unit Entry**: Immutable record of work (Who, What, Where, When).
*   **Price Book Engine**: Versioned rate sheets with category filtering.
*   **Validation Rules**: Enforces photo/GPS requirements per item type.
*   **Retainage Logic**: Auto-calculates retention (e.g., 10%) per contract.

### 📄 As-Built Router (Intelligent Document Processing)
*   **Ingest**: Accepts multi-page PDF (50+ pages).
*   **Split & Classify**:
    *   Pages 1-3 → Face Sheet
    *   Pages 11-14 → Sketches
    *   Page 27 → Billing
*   **Route**:
    *   **Sketches** → GIS Dept (ESRI)
    *   **Billing** → AP (Oracle)
    *   **Redlines** → Estimating (Email)
    *   **Compliance** → CPUC Portal

### 🔒 Security & Compliance
*   **Digital Receipt**: SHA-256 hash of every unit entry (anti-tamper).
*   **Audit Trail**: Full history of every status change (Draft → Paid).
*   **Data Sovereignty**: Tenant isolation via `companyId`.
*   **Encryption**: AES-256 at rest, TLS 1.3 in transit.

---

## 5. Technology Stack Details

| Component | Technology | Reasoning |
|-----------|------------|-----------|
| **Frontend** | React 18, Vite, MUI v5 | Performance, component ecosystem |
| **State** | React Query, Context | Efficient server state management |
| **Offline** | IndexedDB, Service Workers | Critical for remote field work |
| **Backend** | Node.js, Express | Scalable, non-blocking I/O |
| **Database** | MongoDB (Mongoose) | Flexible schema for varying job types |
| **Testing** | Vitest (Unit), Cypress (E2E) | Reliability assurance |
| **Load Testing** | Artillery | Validates 500+ concurrent users |

---

## 6. Deployment & Scale

*   **CI/CD**: GitHub Actions → Vercel (Frontend) / Railway (Backend).
*   **Scaling**: Stateless backend allows horizontal scaling.
*   **Storage**: Cloudflare R2 for zero-egress fee document storage.
*   **Monitoring**: Sentry for error tracking, custom analytics for business metrics.

---

*Confidential Property of FieldLedger Inc.*

