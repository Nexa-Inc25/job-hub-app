# FieldLedger — Subprocessor Registry
**Document Classification:** Compliance — PG&E Exhibit DATA-1, Xcel Energy Supplier Code of Conduct, DTE Energy Protection of Company Data Schedule  
**Owner:** FieldLedger Security Team  
**Last Updated:** February 21, 2026  
**Review Cadence:** Quarterly, or within 5 business days of any subprocessor change  

## Purpose
This registry lists all third-party subprocessors that receive, store, process, or have access to Customer Data handled by FieldLedger. It satisfies:

- **PG&E Exhibit DATA-1** — Subprocessor flow-down and transparency
- **Xcel Energy Supplier Code of Conduct** — Protection of confidential/restricted information
- **DTE Energy Protection of Company Data Schedule** — Security program, breach notification, encryption, and subcontractor obligations

FieldLedger contractually requires every subprocessor to maintain security controls equivalent to or exceeding those in the above standards.

**Per-Utility Data Segregation**  
To ensure strict isolation and simplify audits/contract termination, FieldLedger uses dedicated R2 buckets:
- `fieldledger-pge` — PG&E affiliated companies
- `fieldledger-xcel` — Xcel Energy affiliated companies
- `fieldledger-dte` — DTE Energy affiliated companies
- `fieldledger-uploads` — All other customers (default)

Bucket routing is determined by `Company.utilityAffiliation` at upload time.

## Notification of Changes
Customers will be notified at least **30 days** prior to adding or replacing any subprocessor that processes Customer Data. Notifications go to the Company administrator and all addresses in `Company.securitySettings.securityAlertEmails`.

## Subprocessor List

### 1. MongoDB Atlas (MongoDB, Inc.)
| Field                  | Detail |
|------------------------|--------|
| Purpose                | Primary database (jobs, users, audit logs, billing) |
| Data Processed         | All structured Customer Data |
| Data Classification    | Confidential / Utility Regulated |
| US-Only Processing     | Yes (US-East-1 or US-West-2 clusters) |
| Encryption             | AES-256 at rest & TLS 1.2+ in transit |
| DPA / Certifications   | SOC 2 Type II, ISO 27001, HIPAA |
| Flow-Down              | Yes — MongoDB DPA Section 6 |

### 2. Cloudflare R2 (Cloudflare, Inc.)
| Field                  | Detail |
|------------------------|--------|
| Purpose                | Object storage for PDFs, photos, sketches, forms |
| Data Processed         | Binary files (job packages, field photos, markup layers) |
| Data Classification    | Confidential / Utility Regulated |
| US-Only Processing     | Yes — per-utility buckets with US jurisdiction |
| Encryption             | AES-256 server-side + TLS 1.3 |
| DPA / Certifications   | SOC 2 Type II, ISO 27001, PCI DSS |
| Flow-Down              | Yes — Cloudflare DPA Section 7 |
| Access Control         | Private buckets, signed URLs (15-min TTL) with ownership verification |

### 3. OpenAI (OpenAI, LLC)
| Field                  | Detail |
|------------------------|--------|
| Purpose                | AI extraction from job packages (GPT-4o Vision) |
| Data Processed         | PDF page images and prompts |
| Data Classification    | Confidential / Utility Regulated |
| US-Only Processing     | Yes (API default US routing) |
| Encryption             | TLS 1.2+ |
| Retention              | Zero retention (`"store": false`) |
| DPA / Certifications   | SOC 2 Type II |
| Flow-Down              | Yes — OpenAI DPA Section 5 |

### 4. Stripe (Stripe, Inc.)
| Field                  | Detail |
|------------------------|--------|
| Purpose                | Subscription billing |
| Data Processed         | Billing contact & payment tokens (no utility data) |
| Data Classification    | Commercial |
| US-Only Processing     | Yes |
| DPA / Certifications   | SOC 2 Type II, PCI DSS Level 1 |
| Flow-Down              | Yes — Stripe DPA Section 6 |

### 5. Resend (Resend, Inc.)
| Field                  | Detail |
|------------------------|--------|
| Purpose                | Transactional emails & breach alerts |
| Data Processed         | Email addresses, security alert content |
| Data Classification    | Mixed |
| US-Only Processing     | Yes (AWS US-East-1) |
| DPA / Certifications   | SOC 2 Type II |
| Flow-Down              | Yes — Resend DPA Section 4 |

### 6. Railway (Railway Corp.)
| Field                  | Detail |
|------------------------|--------|
| Purpose                | Backend API hosting |
| Data Processed         | Transient API traffic |
| Data Classification    | Confidential |
| US-Only Processing     | Yes (US-West) |
| DPA / Certifications   | SOC 2 Type II |
| Flow-Down              | Yes — Railway DPA |

### 7. Vercel (Vercel, Inc.)
| Field                  | Detail |
|------------------------|--------|
| Purpose                | Frontend hosting |
| Data Processed         | Static assets only (no Customer Data) |
| Data Classification    | Public |
| US-Only Processing     | Yes |
| DPA / Certifications   | SOC 2 Type II |
| Flow-Down              | Yes — Vercel DPA Section 5 |

## Subprocessors That Do NOT Receive Customer Data
- GitHub, SonarCloud, npm, Docker Hub — source code and build tools only.

## Oracle Cloud (Customer-Managed)
Oracle integrations are initiated by the customer with their own credentials. Oracle is **not** a FieldLedger subprocessor.

## Inactive Subprocessors (Not Currently Enabled)
The following services are integrated in code but **not active** in production (no API keys configured). If activated, this registry will be updated 30 days prior per notification policy.

| Service | Purpose | Status |
|---------|---------|--------|
| OpenWeatherMap | Tailboard weather data (sends GPS coordinates) | Disabled — placeholder mode |
| Sentry | Error monitoring (may contain request metadata) | Disabled — no DSN configured |

## Compliance Attestation
FieldLedger attests that:
1. All listed subprocessors handling regulated data have executed DPAs with flow-down obligations matching PG&E Exhibit DATA-1, Xcel Supplier Code of Conduct, and DTE Protection of Company Data Schedule.
2. All Customer Data is stored and processed exclusively in the **United States**.
3. Dedicated per-utility R2 buckets enforce logical and physical segregation.
4. Customers will be notified within **30 days** of any subprocessor change and within **8 hours** (PG&E) / **24 hours** (DTE) / **immediate** (Xcel) of any suspected breach.
5. Full subprocessor DPA documents are available for review during any utility Third-Party Security Review (TSR) or equivalent audit.

*This document is reviewed quarterly. Next review: May 2026.*
