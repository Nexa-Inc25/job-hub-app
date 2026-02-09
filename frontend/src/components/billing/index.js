/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Billing Components Index
 * 
 * Phase 2: Field Interface for Digital Receipt capture
 * Phase 3: Office Dashboard for Unit Approval and Claims
 * NIST SP 800-53 Compliant Sync Architecture
 */

// Phase 2: Field Components
export { default as GPSPhotoCapture } from './GPSPhotoCapture';
export { default as UnitEntryForm } from './UnitEntryForm';
export { default as PriceBookSelector } from './PriceBookSelector';
export { default as ForemanCapturePage } from './ForemanCapturePage';

// Phase 3: Office Dashboard Components
export { default as ProofPanel } from './ProofPanel';
export { default as UnitApprovalGrid } from './UnitApprovalGrid';
export { default as ClaimsManagement } from './ClaimsManagement';
export { default as BillingDashboard } from './BillingDashboard';
export { default as DisputeDialog, CreateDisputeDialog, ResolveDisputeDialog, DISPUTE_CATEGORIES, RESOLUTION_ACTIONS } from './DisputeDialog';
export { default as BillingAnalytics } from './BillingAnalytics';
export { default as PriceBookAdmin } from './PriceBookAdmin';

// Subscription/Stripe Components
export { default as PricingPage } from './PricingPage';
export { default as BillingSettings } from './BillingSettings';

// Oracle Export Service
export { default as oracleExportService, OracleExportService, EXPORT_STATUS } from '../../services/OracleExportService';

// Re-export hooks for convenience
export { useGeolocation, GPS_THRESHOLDS, getGPSQuality } from '../../hooks/useGeolocation';
export { useSync } from '../../hooks/useSync';
export { 
  useSyncQueue, 
  QUEUE_TYPES, 
  QUEUE_STATUS, 
  LOCK_REASONS 
} from '../../hooks/useSyncQueue';

// Re-export SyncBadge for billing UIs (NIST-compliant)
export { 
  default as SyncBadge, 
  SyncBadgeMinimal,
  SyncBadgeCompact, 
  SyncStatusPanel 
} from '../SyncBadge';

// Re-export crypto utilities for Digital Receipt generation
export {
  generatePayloadChecksum,
  generateDigitalReceiptHash,
  hashPhoto,
  isTokenExpired,
  generateDeviceSignature,
} from '../../utils/crypto.utils';

// Re-export Oracle mapper for export functionality
export {
  formatForOracle,
  exportToCSV,
  generateAuditTrail,
  validateForExport,
} from '../../utils/oracleMapper';

