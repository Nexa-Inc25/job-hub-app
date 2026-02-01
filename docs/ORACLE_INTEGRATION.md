# Oracle Cloud Integration Guide

## Overview

FieldLedger provides seamless integration with Oracle Cloud applications, enabling utility contractors to automate the flow of billing data from field operations directly into Oracle ERP systems.

---

## Supported Oracle Products

| Product | Integration Type | Status |
|---------|------------------|--------|
| **Oracle Fusion Cloud ERP** | FBDI Import | ✅ Production |
| **Oracle Primavera Unifier** | REST API | 🔄 Roadmap |
| **Oracle EAM** | REST API | 🔄 Roadmap |
| **Oracle Primavera P6** | File Export | 🔄 Roadmap |

---

## Oracle Fusion Cloud ERP Integration

### Accounts Payable (FBDI Import)

FieldLedger generates File-Based Data Import (FBDI) files compatible with Oracle Fusion Cloud Payables.

#### Export Format

**Standard Oracle FBDI CSV** for AP Invoice Import:

```csv
INVOICE_NUMBER,INVOICE_DATE,VENDOR_NAME,VENDOR_SITE_CODE,INVOICE_AMOUNT,INVOICE_CURRENCY_CODE,PAYMENT_METHOD_CODE,TERMS_NAME,DESCRIPTION,PO_NUMBER,LINE_NUMBER,LINE_TYPE,LINE_AMOUNT,DISTRIBUTION_ACCOUNT,PROJECT_NUMBER,TASK_NUMBER
CLM-2026-00123,2026-02-01,Alvah Contractors,HQ,45000.00,USD,CHECK,Net 30,Pole Replacement Work,PO-12345,1,ITEM,4500.00,01-510-5100-0000,PRJ-55678,TSK-001
CLM-2026-00123,2026-02-01,Alvah Contractors,HQ,45000.00,USD,CHECK,Net 30,Pole Replacement Work,PO-12345,2,ITEM,4500.00,01-510-5100-0000,PRJ-55678,TSK-002
```

#### API Endpoint

```
POST /api/billing/claims/{claimId}/export
Content-Type: application/json
Authorization: Bearer <token>

{
  "format": "FBDI_CSV",
  "includeLineDetails": true,
  "oracleConfig": {
    "supplierNumber": "SUP-123456",
    "supplierSite": "HQ",
    "paymentTerms": "Net 30",
    "distributionAccount": "01-510-5100-0000"
  }
}
```

#### Response

```json
{
  "success": true,
  "exportId": "exp_abc123",
  "format": "FBDI_CSV",
  "fileName": "AP_INVOICES_CLM-2026-00123.csv",
  "downloadUrl": "https://api.fieldledger.io/api/exports/exp_abc123/download",
  "lineCount": 15,
  "totalAmount": 45000.00,
  "expiresAt": "2026-02-08T00:00:00Z"
}
```

---

## Bulk Export for Multiple Claims

```
POST /api/billing/export/fbdi
Content-Type: application/json
Authorization: Bearer <token>

{
  "claimIds": ["claim_id_1", "claim_id_2", "claim_id_3"],
  "format": "FBDI_CSV",
  "consolidate": true,
  "oracleConfig": {
    "supplierNumber": "SUP-123456",
    "supplierSite": "HQ"
  }
}
```

---

## Data Mapping

### FieldLedger to Oracle Field Mapping

| FieldLedger Field | Oracle FBDI Field | Notes |
|-------------------|-------------------|-------|
| `claim.claimNumber` | `INVOICE_NUMBER` | Unique identifier |
| `claim.createdAt` | `INVOICE_DATE` | Claim creation date |
| `company.name` | `VENDOR_NAME` | Contractor company |
| `company.oracleSiteCode` | `VENDOR_SITE_CODE` | Oracle supplier site |
| `claim.totalAmount` | `INVOICE_AMOUNT` | Total claim value |
| `unitEntry.itemCode` | `DESCRIPTION` | Line item description |
| `unitEntry.totalPrice` | `LINE_AMOUNT` | Line total |
| `job.pmNumber` | `PO_NUMBER` | Work order reference |
| `job.projectCode` | `PROJECT_NUMBER` | Oracle project code |
| `job.taskCode` | `TASK_NUMBER` | Oracle task code |

---

## Oracle Primavera Unifier Integration (Roadmap)

### Planned Capabilities

1. **Project Sync**
   - Sync work orders from Primavera to FieldLedger
   - Update project status upon completion

2. **Document Upload**
   - Push as-built documents to project folders
   - Link documents to WBS elements

3. **Cost Data**
   - Report actual costs back to Primavera
   - Update forecasts based on unit billing

### API Design (Draft)

```
POST /api/oracle/primavera/sync
{
  "projectId": "PRJ-55678",
  "operation": "push_asbuilt",
  "documents": ["doc_id_1", "doc_id_2"],
  "targetFolder": "/As-Builts/Completed"
}
```

---

## Authentication with Oracle Cloud

### Option 1: FBDI File Upload (Current)

No direct API connection required. Users download FBDI files from FieldLedger and upload to Oracle via:
- Oracle Fusion Cloud > Navigator > Scheduled Processes > Load Interface File for Import

### Option 2: Oracle REST API (Future)

```
POST /api/oracle/connect
{
  "tenantUrl": "https://your-tenant.oraclecloud.com",
  "clientId": "your-oauth-client-id",
  "clientSecret": "your-oauth-client-secret",
  "scope": "urn:opc:resource:consumer::all"
}
```

OAuth 2.0 client credentials flow for machine-to-machine integration.

---

## Security Considerations

### Data Protection

| Aspect | Implementation |
|--------|----------------|
| Data in Transit | TLS 1.3 encryption |
| Export Files | Signed URLs with 7-day expiry |
| Audit Trail | All exports logged with user/timestamp |
| Access Control | Role-based (PM/Admin only for exports) |

### Compliance

- FBDI exports contain only approved, finalized claims
- Audit log maintained for all Oracle-bound exports
- Export history available for reconciliation

---

## Setup Instructions

### For Utility Contractors

1. **Configure Oracle Settings** in FieldLedger Admin:
   - Navigate to Settings > Oracle Integration
   - Enter your Oracle Supplier Number
   - Enter your Oracle Supplier Site Code
   - Configure default distribution account

2. **Map Project Codes**:
   - Ensure each job has Oracle Project Number
   - Ensure each job has Oracle Task Number (if using project accounting)

3. **Export Claims**:
   - Go to Billing > Claims
   - Select approved claims
   - Click "Export to Oracle FBDI"
   - Download the generated CSV file

4. **Import to Oracle**:
   - Log into Oracle Fusion Cloud
   - Navigate to Payables > Import Invoices
   - Upload the FBDI file
   - Run the Import Payables Invoices process

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Import fails validation | Missing required fields | Ensure all jobs have project/task codes |
| Duplicate invoice error | Claim already imported | Check Oracle for existing invoice number |
| Amount mismatch | Tax or adjustments | Review line item totals in FieldLedger |
| Supplier not found | Incorrect supplier number | Verify Oracle supplier setup |

### Support

For integration assistance:
- Email: support@fieldledger.io
- Documentation: https://www.fieldledger.io/docs/oracle

---

## Appendix: FBDI File Specifications

### AP_INVOICES_INTERFACE

| Column | Data Type | Required | Description |
|--------|-----------|----------|-------------|
| INVOICE_NUMBER | VARCHAR2(50) | Yes | Unique invoice identifier |
| INVOICE_DATE | DATE | Yes | Invoice date (YYYY-MM-DD) |
| VENDOR_NAME | VARCHAR2(240) | Yes | Supplier name |
| VENDOR_SITE_CODE | VARCHAR2(15) | Yes | Supplier site |
| INVOICE_AMOUNT | NUMBER | Yes | Total invoice amount |
| INVOICE_CURRENCY_CODE | VARCHAR2(15) | Yes | Currency (USD) |
| PAYMENT_METHOD_CODE | VARCHAR2(30) | No | Payment method |
| TERMS_NAME | VARCHAR2(50) | No | Payment terms |
| DESCRIPTION | VARCHAR2(240) | No | Invoice description |
| PO_NUMBER | VARCHAR2(20) | No | Purchase order reference |

### AP_INVOICE_LINES_INTERFACE

| Column | Data Type | Required | Description |
|--------|-----------|----------|-------------|
| LINE_NUMBER | NUMBER | Yes | Line sequence |
| LINE_TYPE | VARCHAR2(25) | Yes | ITEM, TAX, FREIGHT |
| LINE_AMOUNT | NUMBER | Yes | Line amount |
| DESCRIPTION | VARCHAR2(240) | No | Line description |
| DISTRIBUTION_ACCOUNT | VARCHAR2(250) | No | GL account |
| PROJECT_NUMBER | VARCHAR2(25) | No | Project reference |
| TASK_NUMBER | VARCHAR2(100) | No | Task reference |

---

*Document Version: 1.0.0*  
*Last Updated: February 2026*  
*FieldLedger Oracle Integration Team*

