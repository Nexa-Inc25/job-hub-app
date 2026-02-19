# Compliance Documentation

## FieldLedger - Security & Compliance Architecture

This document outlines how FieldLedger meets SOC 2 Type II, NERC CIP, and PG&E compliance requirements.

---

## Compliance Summary

| Standard | Status | Key Controls |
|----------|--------|--------------|
| **SOC 2 Type II** | Architecture Supports | Access controls, audit logging, encryption, availability |
| **NERC CIP** | Audit Logging Compliant | CIP-004, CIP-005, CIP-007, CIP-011 controls |
| **PG&E Exhibit 5** | Compliant | 7-year document retention via MongoDB TTL |

---

## SOC 2 Type II Controls

### Trust Service Criteria Mapping

#### 1. Security (Common Criteria)

| Control | Implementation | Location |
|---------|---------------|----------|
| **CC6.1** - Logical Access Controls | JWT + MFA authentication | `middleware/auth.js`, `utils/mfa.js` |
| **CC6.2** - User Authentication | bcrypt password hashing, MFA (TOTP) | `models/User.js`, `/api/auth/*` |
| **CC6.3** - Access Provisioning | Role-based access (Admin, PM, GF, QA) | `req.userRole` checks throughout |
| **CC6.6** - Audit Logging | Comprehensive action logging | `middleware/auditLogger.js` |
| **CC6.7** - Access Revocation | Account deactivation, token invalidation | `controllers/admin.controller.js` |
| **CC6.8** - Security Alerts | Critical event logging, rate limiting | `utils/securityAlerts.js` |

#### 2. Availability

| Control | Implementation | Location |
|---------|---------------|----------|
| **A1.1** - Health Monitoring | `/api/health` endpoint | `server.js` |
| **A1.2** - Backup & Recovery | MongoDB Atlas automated backups | Infrastructure |
| **A1.3** - Disaster Recovery | Cloudflare R2 redundant storage | `utils/storage.js` |

#### 3. Processing Integrity

| Control | Implementation | Location |
|---------|---------------|----------|
| **PI1.1** - Input Validation | express-validator, mongoSanitize | `middleware/security.js` |
| **PI1.4** - Error Handling | Standardized error responses | `server.js` |

#### 4. Confidentiality

| Control | Implementation | Location |
|---------|---------------|----------|
| **C1.1** - Data Classification | Folder structure, document types | `models/Job.js` |
| **C1.2** - Access Restrictions | Multi-tenant isolation by companyId | All controllers |
| **C1.3** - Encryption in Transit | HTTPS enforced (Vercel/Railway) | Infrastructure |

---

## NERC CIP Compliance

### CIP-004: Personnel & Training

| Requirement | Implementation |
|-------------|---------------|
| R4.1 - Access Authorization | Role-based access control (RBAC) |
| R4.2 - Access Revocation | Account deactivation with audit trail |
| R5 - Access Management | User creation/modification logged |

### CIP-005: Electronic Security Perimeter

| Requirement | Implementation |
|-------------|---------------|
| R1 - Electronic Security Perimeter | Rate limiting, IP logging |
| R2 - Remote Access Management | JWT authentication, MFA support |

### CIP-007: System Security Management

| Requirement | Implementation |
|-------------|---------------|
| R4 - Security Event Monitoring | `SUSPICIOUS_ACTIVITY`, `UNAUTHORIZED_ACCESS_ATTEMPT` events |
| R5 - Access Control | Role-based permissions, multi-tenant isolation |
| R6 - Security Patch Management | npm audit in CI/CD pipeline |

### CIP-011: Information Protection

| Requirement | Implementation |
|-------------|---------------|
| R1 - Information Protection | Document approval workflow, access logging |
| R2 - BES Cyber Asset Reuse/Disposal | Document deletion with audit trail |

---

## Audit Log Schema

All security-relevant actions are logged to MongoDB with the following structure:

```javascript
{
  timestamp: Date,           // When action occurred
  userId: ObjectId,          // Who performed action
  userEmail: String,
  userName: String,
  userRole: String,
  companyId: ObjectId,       // Multi-tenant isolation
  action: String,            // Action type (see below)
  resourceType: String,      // user, job, document, photo, folder
  resourceId: ObjectId,
  resourceName: String,
  details: Object,           // Additional context
  ipAddress: String,         // Client IP
  userAgent: String,         // Browser/client info
  requestMethod: String,     // HTTP method
  requestPath: String,       // API endpoint
  success: Boolean,
  errorMessage: String,
  category: String,          // authentication, authorization, data_access, etc.
  severity: String           // info, warning, critical
}
```

### Logged Action Types

#### Authentication Events
- `LOGIN_SUCCESS` - Successful login
- `LOGIN_FAILED` - Failed login attempt (warning)
- `LOGOUT` - User logout
- `PASSWORD_CHANGE` - Password changed (warning)
- `PASSWORD_RESET_REQUEST` - Password reset requested
- `MFA_ENABLED` - MFA activated
- `MFA_DISABLED` - MFA deactivated
- `ACCOUNT_LOCKED` - Account locked after failed attempts (critical)
- `ACCOUNT_UNLOCKED` - Account unlocked

#### Document Events
- `DOCUMENT_VIEW` - Document accessed
- `DOCUMENT_DOWNLOAD` - Document downloaded
- `DOCUMENT_UPLOAD` - Document uploaded
- `DOCUMENT_DELETE` - Document deleted (warning)
- `DOCUMENT_EDIT` - Document modified
- `DOCUMENT_APPROVE` - Document approved
- `DOCUMENT_REJECT` - Document rejected (warning)
- `DOCUMENT_EXPORT` - Documents exported

#### Job/Work Order Events
- `JOB_CREATE` - Work order created
- `JOB_UPDATE` - Work order modified
- `JOB_DELETE` - Work order deleted (warning)
- `JOB_STATUS_CHANGE` - Status updated
- `JOB_ASSIGN` - Job assigned to user
- `JOB_REVIEW` - Job reviewed

#### Security Events (High Priority)
- `SUSPICIOUS_ACTIVITY` - Anomalous behavior detected (critical)
- `RATE_LIMIT_EXCEEDED` - Rate limit hit (warning)
- `UNAUTHORIZED_ACCESS_ATTEMPT` - Access denied (critical)
- `API_KEY_CREATED` - New API key generated
- `API_KEY_REVOKED` - API key revoked

---

## Data Retention

### PG&E Exhibit 5 Compliance

| Data Type | Retention Period | Implementation |
|-----------|-----------------|----------------|
| Audit Logs | 7 years | MongoDB TTL index |
| Work Orders | Indefinite | No auto-deletion |
| Documents | Indefinite | Stored in Cloudflare R2 |
| User Accounts | Until deactivated | Soft delete with `isDeleted` flag |

### TTL Index Configuration

```javascript
// In models/AuditLog.js
auditLogSchema.index(
  { timestamp: 1 }, 
  { expireAfterSeconds: 2557 * 24 * 60 * 60 }  // 7 years
);
```

---

## Security Controls

### Authentication

1. **Password Security**
   - bcrypt hashing (cost factor 10)
   - Minimum 8 characters required
   - Account lockout after 5 failed attempts

2. **Multi-Factor Authentication (MFA)**
   - TOTP-based (Google Authenticator compatible)
   - Backup codes for recovery
   - Optional per-user basis

3. **Session Management**
   - JWT tokens with 24-hour expiration
   - Token invalidation on password change
   - Secure HTTP-only cookies optional

### Authorization

1. **Role-Based Access Control**
   - `admin` - Full system access
   - `pm` - Project management, job oversight
   - `gf` - General Foreman, field operations
   - `qa` - Quality assurance review

2. **Multi-Tenant Isolation**
   - All queries filtered by `companyId`
   - Cross-tenant access prevented at model layer

### Input Validation

1. **Request Sanitization**
   - `express-mongo-sanitize` - NoSQL injection prevention
   - `helmet` - Security headers
   - Rate limiting - 100 requests/15 minutes

---

## Audit Log Access

### Admin API Endpoints

```
GET /api/admin/audit-logs
  Query Parameters:
  - startDate: ISO date
  - endDate: ISO date
  - action: Action type filter
  - userId: User filter
  - severity: info|warning|critical
  - limit: Number of records (max 1000)
```

### Compliance Reports

Audit logs can be exported for compliance audits:

```
GET /api/admin/audit-logs/export?format=csv
```

---

## US-Only Data Residency (PG&E Exhibit DATA-1 §VI)

### Policy Statement

All Customer Data processed and stored by FieldLedger resides exclusively within the
continental United States. No Customer Data is transmitted to, processed in, or
replicated to data centers outside US borders at any point in the data lifecycle —
at rest, in transit, or during processing.

### Infrastructure Regions

| Service | Role | Region | Verification |
|---|---|---|---|
| **MongoDB Atlas** | Primary database (all structured data) | `US-EAST-1` (N. Virginia), replicas within US | Atlas cluster configuration; region locked in project settings |
| **Cloudflare R2** | Object storage (PDFs, photos, drawings) | `us` jurisdiction hint | R2 bucket jurisdiction setting; Cloudflare guarantees data-at-rest location per [Data Localization Suite](https://www.cloudflare.com/data-localization/) |
| **OpenAI API** | AI extraction, voice transcription | US-routed API endpoint | OpenAI API processes requests in US data centers by default for API-tier customers; confirmed via OpenAI DPA |
| **Railway** | Backend API compute | `US-West` | Railway project region setting; container networking isolated within region |
| **Vercel** | Frontend CDN (static assets only) | US-primary edge | No Customer Data stored; static HTML/CSS/JS bundles only |
| **Resend** | Transactional email | `US-EAST-1` (AWS) | Resend infrastructure runs on AWS US-East-1 |
| **Redis / Upstash** | WebSocket scaling (optional) | US region | Instance provisioned in US; ephemeral routing metadata only |

### Exceptions and Mitigations

| Exception | Handling |
|---|---|
| **OpenWeatherMap API** | Only GPS coordinates (latitude/longitude) are transmitted. No job identifiers, PM numbers, company names, or PG&E-regulated data is included in the API call. Weather data flows inbound only. |
| **Stripe** | Processes billing data (company name, billing email, payment tokens) — no PG&E job data or utility-regulated content. Stripe is PCI DSS Level 1 certified and processes within US infrastructure. |
| **CDN edge caching (Vercel)** | Vercel edge nodes may cache static assets (JS/CSS bundles) at international PoPs for performance. These assets contain zero Customer Data — they are compiled React application code. API requests are never served from edge; they route directly to the Railway backend in `US-West`. |

### Operational Controls

1. **Infrastructure-as-config** — Region settings for MongoDB Atlas, R2, Railway, and Redis
   are locked in each provider's project configuration. Changing a region requires
   administrative access and triggers an audit log entry at the provider level.

2. **No cross-region replication** — MongoDB Atlas replication is configured within US regions
   only. R2 jurisdiction hint prevents Cloudflare from storing object data outside the US.

3. **Subprocessor DPA enforcement** — All subprocessors handling Customer Data are bound by
   Data Processing Agreements that contractually restrict processing to US data centers.
   See [`docs/SUBPROCESSORS.md`](docs/SUBPROCESSORS.md) for the full registry.

4. **Review cadence** — Data residency configuration is reviewed quarterly alongside the
   subprocessor registry. Any region change requires Security Team approval and 30-day
   advance customer notification.

**Last Reviewed:** February 19, 2026
**Next Review:** May 2026

---

## Incident Response

### Critical Event Handling

When severity is `critical`, the system:
1. Persists the event to the audit log with full context (authoritative record)
2. Sends email alerts to company security contacts (`Company.securitySettings.securityAlertEmails`) and the platform security team (`SECURITY_ALERT_EMAIL`)
3. Applies per-alert-type cooldown (1 hour) to prevent inbox flooding during sustained attacks
4. Logs delivery success/failure for each recipient

Implementation: `backend/utils/securityAlerts.js` → `sendAlertEmail()` → `services/email.service.js`

### Breach Notification SLA

Per PG&E Exhibit DATA-1, FieldLedger will notify affected parties within **8 hours** of
a suspected breach involving Customer Data. The automated alert pipeline delivers email
notifications within seconds of detection. Manual escalation procedures supplement
automated alerts for confirmed incidents.

### Monitored Critical Events
- `BRUTE_FORCE_DETECTED` - 10+ failed logins from same IP in 1 hour
- `MASS_DELETION_WARNING` - 10+ document deletions by one user in 1 hour
- `REPEATED_UNAUTHORIZED_ACCESS` - 3+ permission-denied events for same user/IP
- `ACCOUNT_LOCKED` - Account locked after 5 failed login attempts

---

## Compliance Checklist for Auditors

### Pre-Audit Preparation

- [ ] Export audit logs for review period
- [ ] Generate user access report
- [ ] Document any security incidents
- [ ] Prepare system architecture diagram
- [ ] List third-party integrations

### Evidence Collection

| Evidence Type | Location |
|--------------|----------|
| Audit Logs | `GET /api/admin/audit-logs` |
| User List | `GET /api/admin/users` |
| Access Controls | Role definitions in code |
| Encryption | TLS certificates |
| Backup Logs | MongoDB Atlas console |

---

## Subprocessor Registry

A complete list of all third-party subprocessors that receive, store, or process
Customer Data — including data types handled, US-only attestations, DPA status,
and flow-down clause confirmation — is maintained at:

**[`docs/SUBPROCESSORS.md`](docs/SUBPROCESSORS.md)**

This registry is reviewed quarterly and updated within 5 business days of any
subprocessor change, per PG&E Exhibit DATA-1 requirements.

---

## Contact

For compliance inquiries:
- Technical: Review `backend/middleware/auditLogger.js`
- Architecture: Review `TECHNICAL_DUE_DILIGENCE.md`
- Security: Review `backend/middleware/security.js`
- Subprocessors / DPA: Review `docs/SUBPROCESSORS.md`

---

*Last Updated: February 2026*
*Version: 1.1*

