# FieldLedger System Architecture

## Overview

FieldLedger is an enterprise-grade field operations platform designed for utility contractors performing electric distribution construction work. The system provides end-to-end workflow management from field unit capture to Oracle ERP integration.

---

## High-Level Architecture

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
│  │  /api/jobs  │  │/api/billing │  │/api/asbuilt │  │/api/pricebk │        │
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
│  │   Oracle Fusion    │  │   Oracle Primavera │  │     ESRI GIS       │    │
│  │   Cloud ERP        │  │      Unifier       │  │                    │    │
│  │                    │  │                    │  │                    │    │
│  │ • FBDI Import      │  │ • Project Sync     │  │ • Asset Updates    │    │
│  │ • AP Invoices      │  │ • Document Upload  │  │ • Map Integration  │    │
│  │ • Supplier Portal  │  │ • WBS Mapping      │  │ • Spatial Data     │    │
│  └────────────────────┘  └────────────────────┘  └────────────────────┘    │
│                                                                             │
│  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐    │
│  │    SharePoint      │  │   Email (SMTP)     │  │    OpenAI API      │    │
│  │                    │  │                    │  │                    │    │
│  │ • Document Archive │  │ • Notifications    │  │ • Doc Classification│   │
│  │ • Compliance Docs  │  │ • Alerts           │  │ • Data Extraction  │    │
│  └────────────────────┘  └────────────────────┘  └────────────────────┘    │
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

## API Versioning Strategy

Current: `/api/` (v1 implicit)  
Future: `/api/v2/` for breaking changes

All endpoints maintain backward compatibility within major versions.

---

## Scalability Considerations

| Component | Current | Scale Path |
|-----------|---------|------------|
| API | Single container | Horizontal pod scaling |
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

*Document Version: 1.0.0*  
*Last Updated: February 2026*

