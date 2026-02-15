/**
 * FieldLedger - Billing Routes
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 *
 * Thin route definitions for unit-price billing.
 * All business logic lives in controllers/billing.controller.js.
 *
 * @swagger
 * tags:
 *   - name: Units
 *     description: Unit entry management for field work verification
 *   - name: Claims
 *     description: Invoice/claim generation and Oracle export
 */

const express = require('express');
const router = express.Router();
const billing = require('../controllers/billing.controller');

// ============================================================================
// UNIT ENTRIES - The "Digital Receipt"
// ============================================================================

router.get('/units', billing.listUnits);
router.get('/units/unbilled', billing.getUnbilledUnits);
router.get('/units/disputed', billing.getDisputedUnits);
router.get('/units/:id', billing.getUnitById);
router.post('/units', billing.createUnit);
router.post('/units/batch', billing.batchCreateUnits);
router.post('/units/:id/submit', billing.submitUnit);
router.post('/units/:id/verify', billing.verifyUnit);
router.post('/units/:id/approve', billing.approveUnit);
router.post('/units/:id/dispute', billing.disputeUnit);
router.post('/units/:id/resolve-dispute', billing.resolveDispute);
router.delete('/units/:id', billing.deleteUnit);

// ============================================================================
// CLAIMS - Invoice Generation and Oracle Export
// ============================================================================

router.get('/claims', billing.listClaims);
router.get('/claims/unpaid', billing.getUnpaidClaims);
router.get('/claims/past-due', billing.getPastDueClaims);
router.get('/claims/:id', billing.getClaimById);
router.post('/claims', billing.createClaim);
router.post('/claims/bulk-export-fbdi', billing.bulkExportFBDI);
router.put('/claims/:id', billing.updateClaim);
router.delete('/claims/:id', billing.deleteClaim);
router.post('/claims/:id/approve', billing.approveClaim);
router.post('/claims/:id/submit', billing.submitClaim);
router.post('/claims/:id/payment', billing.recordPayment);
router.get('/claims/:id/export-oracle', billing.exportOracle);
router.get('/claims/:id/export-csv', billing.exportCSV);
router.get('/claims/:id/export-fbdi', billing.exportFBDI);

// ============================================================================
// ADMIN
// ============================================================================

router.post('/admin/cleanup-orphaned-units', billing.cleanupOrphanedUnits);

module.exports = router;
