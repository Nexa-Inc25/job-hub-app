# FieldLedger — Subprocessor Registry

**Document Classification:** Compliance — PG&E Exhibit DATA-1
**Owner:** FieldLedger Security Team
**Last Updated:** February 19, 2026
**Review Cadence:** Quarterly, or within 5 business days of any subprocessor change

---

## Purpose

This document enumerates all third-party subprocessors that receive, store, process, or
have access to Customer Data handled by FieldLedger. It is maintained to satisfy:

- **PG&E Exhibit DATA-1** — Subprocessor flow-down and data handling transparency
- **SOC 2 Type II (CC9.2)** — Risk management of vendors and subprocessors
- **ISO 27001 Annex A.15** — Supplier relationship security

FieldLedger contractually requires each subprocessor to maintain security controls
equivalent to or exceeding those described in PG&E Exhibit DATA-1. Subprocessors are
reviewed annually and upon any material change to their service scope.

---

## Notification of Changes

Customers will be notified at least **30 days** prior to adding or replacing a subprocessor
that processes Customer Data. Notifications are sent to the Company administrator's email
on file and to all addresses listed in `Company.securitySettings.securityAlertEmails`.

---

## Subprocessor List

### 1. MongoDB Atlas (MongoDB, Inc.)

| Field | Detail |
|---|---|
| **Purpose** | Primary application database — stores all job data, user accounts, audit logs, billing records, and document metadata |
| **Data Processed** | All structured Customer Data: jobs, PM numbers, work orders, user profiles, crew assignments, unit entries, claims, audit trails, company settings |
| **Data Classification** | Confidential / PG&E Regulated |
| **US-Only Processing** | **Yes** — cluster deployed in `US-EAST-1` (Virginia) with replication within US regions only |
| **Encryption at Rest** | AES-256 via WiredTiger storage engine (enabled by default on Atlas M10+ clusters) |
| **Encryption in Transit** | TLS 1.2+ enforced for all client connections |
| **DPA / BAA Status** | MongoDB Atlas DPA executed; covers SOC 2, ISO 27001, HIPAA |
| **Certifications** | SOC 2 Type II, ISO 27001, ISO 27017, ISO 27018, HIPAA, CSA STAR |
| **Flow-Down Clause** | Yes — MongoDB Atlas DPA Section 6 (Sub-processor obligations) |
| **Data Retention** | Per FieldLedger application logic; audit logs auto-expire via TTL index after 7 years |
| **Codebase References** | `server.js` (connection), all `models/*.js`, `utils/migration.js` |

---

### 2. Cloudflare R2 (Cloudflare, Inc.)

| Field | Detail |
|---|---|
| **Purpose** | Object storage for job package PDFs, construction photos, sketches, as-built documents, filled forms, and field ticket attachments |
| **Data Processed** | Binary file content: PDFs (may contain PG&E PM numbers, addresses, crew materials, construction sketches), photos (GPS-tagged), signature images |
| **Data Classification** | Confidential / PG&E Regulated |
| **US-Only Processing** | **Yes** — R2 bucket configured in `us` jurisdiction hint; Cloudflare guarantees data-at-rest location per jurisdiction setting |
| **Encryption at Rest** | AES-256 server-side encryption (enabled by default on all R2 buckets) |
| **Encryption in Transit** | TLS 1.3 for all S3-compatible API calls |
| **DPA / BAA Status** | Cloudflare DPA executed; standard Customer DPA covers R2 |
| **Certifications** | SOC 2 Type II, ISO 27001, ISO 27701, PCI DSS Level 1, C5 |
| **Flow-Down Clause** | Yes — Cloudflare DPA Section 7 (Subprocessing restrictions) |
| **Access Control** | Private bucket; all access via short-lived signed URLs (15-minute TTL) with company-scoped ownership verification |
| **Codebase References** | `utils/storage.js`, `routes/index.js` (signed URL endpoint) |

---

### 3. OpenAI (OpenAI, LLC)

| Field | Detail |
|---|---|
| **Purpose** | AI-powered extraction from job package PDFs (GPT-4o Vision), voice-to-structured-data (Whisper), as-built assistant, procedure Q&A |
| **Data Processed** | PDF page images (may contain PG&E PM numbers, addresses, crew materials, construction details), audio recordings (field crew voice notes), text prompts with job context |
| **Data Classification** | Confidential / PG&E Regulated |
| **US-Only Processing** | **Configurable** — API calls route to OpenAI's US infrastructure; data processing region is US by default for API customers. No EU routing is configured. |
| **Encryption in Transit** | TLS 1.2+ for all API calls |
| **Data Retention by OpenAI** | **Zero Retention** — API usage with `"store": false` (default for API tier); OpenAI does not retain API inputs/outputs for training per API Data Usage Policy (effective March 2023) |
| **DPA / BAA Status** | OpenAI DPA executed; covers Enterprise API usage |
| **Certifications** | SOC 2 Type II |
| **Flow-Down Clause** | Yes — OpenAI DPA Section 5 (Subprocessor obligations and restrictions) |
| **Rate Limiting** | Application-level: 10 requests/minute, circuit breaker with automatic fallback |
| **Codebase References** | `utils/pdfUtils.js`, `utils/pdfImageExtractor.js`, `services/voiceAI.service.js`, `routes/job-core.routes.js`, `routes/asbuilt-assistant.routes.js`, `routes/procedures.routes.js` |

---

### 4. Stripe (Stripe, Inc.)

| Field | Detail |
|---|---|
| **Purpose** | Subscription billing, payment processing, and seat management for FieldLedger SaaS plans |
| **Data Processed** | Company billing contact name, billing email, subscription plan tier, payment method tokens (PCI-scoped — FieldLedger never handles raw card numbers) |
| **Data Classification** | Commercial — does NOT include PG&E job data or utility-regulated content |
| **US-Only Processing** | **Yes** — Stripe US entity; data processed in US data centers |
| **Encryption at Rest** | AES-256 |
| **Encryption in Transit** | TLS 1.2+ enforced |
| **DPA / BAA Status** | Stripe DPA executed (included in Stripe Services Agreement) |
| **Certifications** | PCI DSS Level 1, SOC 2 Type II, ISO 27001 |
| **Flow-Down Clause** | Yes — Stripe DPA Section 6 |
| **Codebase References** | `routes/stripe.routes.js`, `models/Company.js` (subscription schema) |

---

### 5. Resend (Resend, Inc.)

| Field | Detail |
|---|---|
| **Purpose** | Transactional email delivery — user invitations, password resets, MFA confirmations, security breach alerts, document sharing |
| **Data Processed** | Recipient email addresses, email subject lines, email body content (may include PM numbers in document share emails and security alert details in breach notifications) |
| **Data Classification** | Mixed — security alerts may contain user IDs, IP addresses, and company identifiers |
| **US-Only Processing** | **Yes** — Resend US infrastructure; AWS US-East-1 |
| **Encryption in Transit** | TLS 1.2+ for API calls and SMTP delivery |
| **DPA / BAA Status** | Resend DPA executed |
| **Certifications** | SOC 2 Type II |
| **Flow-Down Clause** | Yes — Resend DPA Section 4 (Sub-processor management) |
| **Codebase References** | `services/email.service.js`, `utils/securityAlerts.js` (breach notification pipeline) |

---

### 6. OpenWeatherMap (OpenWeather Ltd.)

| Field | Detail |
|---|---|
| **Purpose** | Automated weather condition logging at job sites for excusable delay documentation |
| **Data Processed** | GPS coordinates (latitude/longitude of job site — does NOT include job ID, PM number, or company identifiers in the API call) |
| **Data Classification** | Low Sensitivity — coordinates only, no PG&E-identifiable data transmitted |
| **US-Only Processing** | N/A — only GPS coordinates are sent; no Customer Data or PG&E-regulated content leaves the platform |
| **Encryption in Transit** | HTTPS (TLS 1.2+) |
| **DPA / BAA Status** | Not required — no Customer Data or PII transmitted |
| **Flow-Down Clause** | Not required |
| **Codebase References** | `services/weather.service.js` |

---

### 7. Railway (Railway Corp.)

| Field | Detail |
|---|---|
| **Purpose** | Backend API hosting — runs the Node.js application server in a containerized environment |
| **Data Processed** | All API request/response traffic (transient — in-memory processing only); application logs (structured JSON via Pino) |
| **Data Classification** | Confidential — production API server handles all Customer Data in transit |
| **US-Only Processing** | **Yes** — Railway US-West region; data does not leave US infrastructure |
| **Encryption in Transit** | TLS 1.3 termination at Railway's edge; internal container networking is isolated |
| **Encryption at Rest** | N/A — Railway is stateless compute; persistent data resides in MongoDB Atlas and Cloudflare R2 |
| **DPA / BAA Status** | Railway DPA executed |
| **Certifications** | SOC 2 Type II |
| **Flow-Down Clause** | Yes — Railway Terms of Service, Data Processing section |
| **Codebase References** | `railway.toml`, `backend/Dockerfile`, `backend/nixpacks.toml` |

---

### 8. Vercel (Vercel, Inc.)

| Field | Detail |
|---|---|
| **Purpose** | Frontend static site hosting — serves the React single-page application (HTML, CSS, JS bundles) |
| **Data Processed** | No Customer Data at rest; static assets only. API requests are proxied to Railway backend. Vercel Analytics (if enabled) collects anonymous page-view metrics. |
| **Data Classification** | Public — static assets contain no Customer Data |
| **US-Only Processing** | **Yes** — Vercel edge nodes serve from US-primary CDN; no Customer Data stored |
| **Encryption in Transit** | TLS 1.3 with automatic certificate management |
| **DPA / BAA Status** | Vercel DPA executed |
| **Certifications** | SOC 2 Type II, ISO 27001 |
| **Flow-Down Clause** | Yes — Vercel DPA Section 5 |
| **Codebase References** | `frontend/vercel.json` |

---

### 9. Upstash / Redis (Optional — Real-Time Scaling)

| Field | Detail |
|---|---|
| **Purpose** | Socket.IO adapter for horizontal scaling of WebSocket connections across multiple server instances |
| **Data Processed** | Socket.IO room membership and event routing metadata (room names include company IDs and job IDs); no document content or PII |
| **Data Classification** | Low Sensitivity — ephemeral routing data only |
| **US-Only Processing** | **Yes** — Redis instance configured in US region |
| **Encryption in Transit** | TLS-encrypted Redis connections (`rediss://` protocol) |
| **DPA / BAA Status** | Upstash DPA executed (if using Upstash); self-hosted Redis has no third-party DPA |
| **Deployment Status** | Optional — system operates without Redis (single-instance mode) |
| **Codebase References** | `utils/socketAdapter.js` |

---

## Subprocessors That Do NOT Receive Customer Data

The following services are used by FieldLedger but do **not** receive, process, or store
any Customer Data or PG&E-regulated information:

| Service | Purpose | Data Exposure |
|---|---|---|
| **GitHub** | Source code repository, CI/CD pipelines | Source code only — no Customer Data in repo |
| **SonarCloud** | Static code analysis | Source code only |
| **npm Registry** | Package dependency resolution | Package metadata only |
| **Docker Hub** | Container image storage | Application images only — no Customer Data |

---

## Oracle Cloud (Customer-Managed — Not a FieldLedger Subprocessor)

FieldLedger supports integration with Oracle Cloud applications (Unifier, EAM, P6, Fusion
Cloud ERP) via adapter modules in `services/oracle/`. These connections are **initiated and
configured by the Customer** using their own Oracle Cloud credentials. FieldLedger acts as a
data processor transmitting structured export files (FBDI, CSV) to the Customer's Oracle
environment. Oracle Cloud is the **Customer's subprocessor**, not FieldLedger's.

---

## Data Flow Summary

```
┌─────────────────────────────────────────────────────────────┐
│                    CUSTOMER BROWSER                         │
│                   (React PWA on Vercel)                     │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS / WSS
                       ▼
┌──────────────────────────────────────────────────────────────┐
│              RAILWAY  (Backend API Server)                    │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐ │
│  │  OpenAI  │  │  Resend  │  │  Stripe  │  │ OpenWeather │ │
│  │ (AI/LLM) │  │ (Email)  │  │(Billing) │  │ (Weather)   │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬──────┘ │
│       │ PDF images   │ Alerts     │ Tokens        │ GPS     │
│       │ Audio        │ Invites    │ Subs          │ coords  │
│       ▼              ▼            ▼               ▼         │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                 APPLICATION LOGIC                     │  │
│  └──────────┬──────────────────────────┬────────────────┘  │
│             │                          │                    │
│             ▼                          ▼                    │
│  ┌──────────────────┐      ┌───────────────────────┐       │
│  │  MongoDB Atlas   │      │   Cloudflare R2       │       │
│  │  (US-East-1)     │      │   (US jurisdiction)   │       │
│  │                  │      │                       │       │
│  │  • Job records   │      │  • PDFs               │       │
│  │  • User accounts │      │  • Photos             │       │
│  │  • Audit logs    │      │  • Drawings           │       │
│  │  • Billing data  │      │  • Signatures         │       │
│  └──────────────────┘      └───────────────────────┘       │
│                                                              │
│  ┌──────────────────┐                                       │
│  │  Redis (Optional)│  Ephemeral socket routing metadata    │
│  └──────────────────┘                                       │
└──────────────────────────────────────────────────────────────┘
```

---

## Compliance Attestation

FieldLedger attests that:

1. All subprocessors listed above that handle PG&E-regulated Customer Data (MongoDB Atlas,
   Cloudflare R2, OpenAI, Resend, Railway) are contractually bound by Data Processing
   Agreements with security obligations equivalent to PG&E Exhibit DATA-1.

2. All Customer Data at rest is stored exclusively in **United States** data centers.

3. No subprocessor is permitted to use Customer Data for purposes other than providing
   the contracted service to FieldLedger.

4. FieldLedger will notify affected Customers within **30 days** of any subprocessor
   addition or change, and within **8 hours** of any suspected security breach involving
   Customer Data, per PG&E Exhibit DATA-1 requirements.

5. Subprocessor DPA documents are available for review upon request during PG&E Third-Party
   Security Reviews (TSR).

---

*This document is reviewed quarterly by the FieldLedger Security Team. Next review: May 2026.*
