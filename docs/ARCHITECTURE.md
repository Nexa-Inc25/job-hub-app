# FieldLedger System Architecture

## Overview

FieldLedger is an enterprise-grade field operations platform designed for utility contractors performing electric distribution construction work. The system provides end-to-end workflow management from field unit capture to Oracle ERP integration.

---

## High-Level Architecture

The system utilizes a multi-tier architecture consisting of a Mobile/Desktop PWA Frontend, an API Gateway/Express.js Layer, a Business Logic Layer, and a Data Layer with various External Integrations.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FIELD OPERATIONS                                │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Foreman   │  │    Crew     │  │     PM      │  │    Admin    │        │
│  │   (Mobile)  │  │  (Mobile)   │  │  (Desktop)  │  │  (Desktop)  │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
│         │                │                │                │               │
│         └────────────────┴────────────────┴────────────────┘               │
│                                   │                                         │
│                          ┌────────▼────────┐                               │
│                          │   PWA Frontend  │                               │
│                          │  (React + Vite) │                               │
│                          │  Offline-First  │                               │
│                          └────────┬────────┘                               │
└───────────────────────────────────┼─────────────────────────────────────────┘
                                    │ HTTPS/WSS
                                    │
┌───────────────────────────────────▼─────────────────────────────────────────┐
│                              API GATEWAY                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ Rate Limit  │  │    CORS     │  │   Helmet    │  │  JWT Auth   │        │
│  │  (Tiered)   │  │  Whitelist  │  │  Security   │  │ + MFA/TOTP  │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                     Express.js REST API                               │  │
│  │                     (Node.js v20 LTS)                                 │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  /api/jobs  │  │/api/billing │  │/api/asbuilt │  │/api/oracle  │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼─────────────────────────────────────────┐
│                           BUSINESS LOGIC LAYER                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐    │
│  │   Billing Engine   │  │  As-Built Router   │  │  Document Manager  │    │
│  │                    │  │                    │  │                    │    │
│  │ • Price Book Mgmt  │  │ • AI Classification│  │ • PDF Processing   │    │
│  │ • Unit Capture     │  │ • Rule Engine      │  │ • Digital Signing  │    │
│  │ • Claim Generation │  │ • Multi-Adapter    │  │ • Version Control  │    │
│  │ • Oracle Export    │  │ • Audit Trail      │  │ • Template Mgmt    │    │
│  └────────────────────┘  └────────────────────┘  └────────────────────┘    │
│                                                                             │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼─────────────────────────────────────────┐
│                              DATA LAYER                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐    │
│  │    MongoDB Atlas   │  │  Cloudflare R2     │  │     Redis          │    │
│  │                    │  │  (Object Storage)  │  │   (Future)         │    │
│  │ • Users            │  │                    │  │                    │    │
│  │ • Jobs             │  │ • PDFs             │  │ • Session Cache    │    │
│  │ • Claims           │  │ • Photos           │  │ • Rate Limit       │    │
│  │ • Price Books      │  │ • As-Builts        │  │ • Real-time Pub/Sub│    │
│  │ • Audit Logs       │  │ • Exports          │  │                    │    │
│  └────────────────────┘  └────────────────────┘  └────────────────────┘    │
│                                                                             │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼─────────────────────────────────────────┐
│                         EXTERNAL INTEGRATIONS                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐    │
│  │   Oracle Fusion    │  │   Oracle Primavera │  │   Oracle EAM       │    │
│  │   Cloud ERP ✅     │  │   Unifier 🧪       │  │   + P6 🧪          │    │
│  │                    │  │                    │  │                    │    │
│  │ • FBDI CSV Export  │  │ • Project Sync     │  │ • Work Orders      │    │
│  │ • AP Invoices      │  │ • Document Upload  │  │ • Asset Updates    │    │
│  │ • REST + FBDI      │  │ • BP Records       │  │ • Scheduling       │    │
│  └────────────────────┘  └────────────────────┘  └────────────────────┘    │
│                                                                             │
│  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐    │
│  │     ESRI GIS       │  │    SharePoint      │  │   Email (SMTP)     │    │
│  │                    │  │                    │  │                    │    │
│  │ • Asset Updates    │  │ • Document Archive │  │ • Notifications    │    │
│  │ • Map Integration  │  │ • Compliance Docs  │  │ • Alerts           │    │
│  │ • Spatial Data     │  │                    │  │                    │    │
│  └────────────────────┘  └────────────────────┘  └────────────────────┘    │
│                                                                             │
│  ┌────────────────────┐  ┌────────────────────┐                            │
│  │    OpenAI API      │  │  OpenWeatherMap    │  ✅ = Production           │
│  │                    │  │                    │  🧪 = Beta (mock mode if   │
│  │ • Doc Classification│ │ • Auto-weather     │       not configured)      │
│  │ • Data Extraction  │  │ • Hazard Detection │                            │
│  │ • Voice AI         │  │                    │                            │
│  └────────────────────┘  └────────────────────┘                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Frontend

| Component | Technology | Purpose |
|-----------|------------|---------|
| Framework | React 18 | UI components |
| Build Tool | Vite 5 | Fast builds, HMR |
| UI Library | Material-UI v5 | Enterprise components |
| State | React Context | App state management |
| Offline | Service Worker | PWA offline support |
| Data Grid | MUI X Data Grid | Large dataset handling |

### Backend

| Component | Technology | Purpose |
|-----------|------------|---------|
| Runtime | Node.js 20 LTS | Server runtime |
| Framework | Express.js 4 | REST API |
| Database | MongoDB 7 | Document storage |
| ODM | Mongoose 8 | Data modeling |
| Auth | JWT + bcrypt | Authentication |
| MFA | speakeasy (TOTP) | Multi-factor auth |
| Real-time | Socket.io | WebSocket support |
| Docs | Swagger/OpenAPI | API documentation |

### Infrastructure

| Component | Technology | Purpose |
|-----------|------------|---------|
| Frontend Hosting | Vercel | CDN, edge deployment |
| Backend Hosting | Railway | Container orchestration |
| Database | MongoDB Atlas | Managed MongoDB |
| Object Storage | Cloudflare R2 | S3-compatible storage |
| DNS | Namecheap | Domain management |
| SSL | Let's Encrypt | TLS certificates |

---

## Synchronization & Offline Strategy

FieldLedger utilizes a **Store-and-Forward** architecture to ensure data integrity in low-connectivity environments. The PWA caches all mutations (unit capture, photos, logs) locally in IndexedDB and flushes them to the API Gateway via a persistent background sync queue when connectivity is restored.

### Conflict Resolution Logic

To handle concurrent edits (e.g., a Foreman and PM editing the same Job simultaneously), the system employs **Optimistic Concurrency Control**:

1. **Versioning:** Every document includes a strictly monotonic version number (utilizing the Mongoose `__v` key).

2. **Detection:** Upon sync, the backend compares the incoming payload's version against the database version.

3. **Resolution Strategy:**
   - **Non-Conflicting Fields:** Patches are merged automatically (e.g., Foreman adds a photo, PM updates a description).
   - **Field Collisions:** The system applies a **"Server-Side Trust"** policy where the PM/Admin (office) state generally takes precedence over stale field data, but creates an **Audit Alert** for manual review if significant quantity variances are detected.
   - **Photo/File Duplication:** All binary assets are treated as additive (append-only) to prevent accidental data loss.

### Sync Queue Reliability

- **Retry Mechanism:** Exponential backoff for failed sync attempts (up to 24 hours).
- **Idempotency:** All `POST` mutations utilize unique `transactionId` keys to prevent duplicate records during network jitter.

---

## Observability & System Health

To ensure the reliability of the **Unit-to-Invoice** flow, FieldLedger employs a multi-layered monitoring strategy.

### Monitoring Stack

- **Application Performance Monitoring (APM):** Tracks API latency, error rates, and Node.js v20 LTS runtime health.

- **Error Tracking:** Captures front-end (React/Vite) crashes and back-end exceptions in real-time to prevent data loss during unit capture.

- **Integration Logging:** Dedicated monitoring for the **As-Built Router** and **Oracle FBDI Exports** to alert administrators of failed record imports or spatial data mismatches.

- **Database Insights:** MongoDB Atlas monitoring for replica set health, disk utilization, and auto-scaling events.

### Alerting & Incident Response

- **Notification Channels:** Critical system alerts are routed via SMTP/Email and future Webhook integrations to the Admin (Desktop) interface.

- **Audit Trail:** Every mutation, including AI-driven document classifications and claim generations, is logged for compliance and troubleshooting.

- **Health Checks:** Automated `/health` endpoints are monitored by Railway to trigger container restarts if the Express.js API becomes unresponsive.

---

## Security Architecture

### Authentication Flow

```
Client                    API                      Database
  │                        │                          │
  │  POST /api/login       │                          │
  │  {email, password}     │                          │
  │───────────────────────>│                          │
  │                        │  Verify credentials      │
  │                        │─────────────────────────>│
  │                        │                          │
  │                        │  User record             │
  │                        │<─────────────────────────│
  │                        │                          │
  │  {token, mfaRequired}  │                          │
  │<───────────────────────│                          │
  │                        │                          │
  │  POST /api/mfa/verify  │  (if MFA enabled)       │
  │  {mfaToken, code}      │                          │
  │───────────────────────>│                          │
  │                        │                          │
  │  {token} (full access) │                          │
  │<───────────────────────│                          │
```

### Security Controls

| Layer | Control | Implementation |
|-------|---------|----------------|
| Transport | TLS 1.3 | Enforced by Railway/Vercel |
| API | Rate Limiting | Tiered by endpoint type |
| API | CORS | Whitelist-only origins |
| API | Helmet | Security headers |
| Auth | JWT | RS256 signed tokens |
| Auth | MFA | TOTP (Google Authenticator) |
| Data | Encryption | AES-256 at rest |
| Data | Sanitization | NoSQL injection prevention |
| Audit | Logging | All mutations logged |

---

## Data Flow: Unit-to-Invoice

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   FOREMAN    │      │     GF       │      │     PM       │      │    ORACLE    │
│   (Field)    │      │  (Review)    │      │  (Approve)   │      │    (AP)      │
└──────┬───────┘      └──────┬───────┘      └──────┬───────┘      └──────┬───────┘
       │                     │                     │                     │
       │ 1. Capture Unit     │                     │                     │
       │    + GPS + Photo    │                     │                     │
       │────────────────────>│                     │                     │
       │                     │                     │                     │
       │                     │ 2. Review & Approve │                     │
       │                     │────────────────────>│                     │
       │                     │                     │                     │
       │                     │                     │ 3. Generate Claim   │
       │                     │                     │    FBDI Export      │
       │                     │                     │────────────────────>│
       │                     │                     │                     │
       │                     │                     │                     │ 4. Import to
       │                     │                     │                     │    AP Invoice
       │                     │                     │                     │
       │<────────────────────┴─────────────────────┴─────────────────────┤
       │                    5. Payment Notification                       │
       │                                                                  │
```

1. **Capture:** Foreman captures unit data, GPS coordinates, and photos in the field.
2. **Review:** General Foreman reviews and approves the field data.
3. **Approval:** Project Manager approves the record and generates a claim.
4. **Export:** System generates an FBDI CSV file via `/api/billing/claims/:id/export-fbdi` for manual upload to Oracle Fusion Cloud ERP. Automated UCM Web Services upload is planned for Q3 2026.
5. **Payment:** Oracle imports the AP Invoice and triggers a payment notification back to FieldLedger.

---

## Deployment Architecture

```
                    ┌─────────────────────────────────────┐
                    │           CLOUDFLARE               │
                    │         (DNS + CDN Edge)           │
                    └──────────────┬──────────────────────┘
                                   │
            ┌──────────────────────┼──────────────────────┐
            │                      │                      │
            ▼                      ▼                      ▼
   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
   │     VERCEL      │   │    RAILWAY      │   │  CLOUDFLARE R2  │
   │                 │   │                 │   │                 │
   │ www.fieldledger │   │ api.fieldledger │   │  File Storage   │
   │     .io         │   │      .io        │   │                 │
   │                 │   │                 │   │                 │
   │ React Frontend  │   │ Node.js API     │   │ PDFs, Photos    │
   │ Static Assets   │   │ WebSocket       │   │ Exports         │
   └─────────────────┘   └────────┬────────┘   └─────────────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │  MONGODB ATLAS  │
                         │                 │
                         │  Replica Set    │
                         │  Auto-scaling   │
                         │  Backups        │
                         └─────────────────┘
```

---

## Scalability Considerations

| Component | Current | Scale Path |
|-----------|---------|------------|
| API | Single Docker container (Railway) | Horizontal pod scaling |
| Database | M10 cluster | Sharding by companyId |
| Storage | R2 single region | Multi-region replication |
| Cache | In-memory | Redis cluster |
| Queue | Sync processing | Bull/Redis job queue |

---

## Compliance & Certifications

| Standard | Status | Notes |
|----------|--------|-------|
| SOC 2 Type II | In Progress | Q2 2026 target |
| NIST SP 800-53 | Aligned | Security controls |
| GDPR | Compliant | Data handling |
| CCPA | Compliant | CA privacy law |

---

## Roadmap

| Feature | Target | Status |
|---------|--------|--------|
| SSO/SAML Integration | Q3 2026 | Planned |
| API v2 (GraphQL) | Q4 2026 | Design |
| Redis Cache Layer | Q2 2026 | In Progress |
| Automated UCM Upload | Q3 2026 | Planned |

### Enterprise SSO

Large utility contractors require SSO integration for centralized IT access management. The roadmap includes:

- **Azure AD / Entra ID** - Primary target for Microsoft-centric utilities
- **Okta** - Secondary IdP support
- **SAML 2.0** - Protocol support for custom IdP configurations

SSO is gated to the **Enterprise** subscription tier (configured in `subscriptionGate.js`).

---

*Document Version: 1.3.0*  
*Last Updated: February 2026*
