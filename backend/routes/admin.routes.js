/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Admin Routes
 * 
 * Administrative endpoints for audit logs, user management, and system monitoring.
 * 
 * @swagger
 * tags:
 *   - name: Admin
 *     description: Administrative operations (requires admin access)
 */

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');

/**
 * @swagger
 * /api/admin/audit-logs:
 *   get:
 *     summary: Get audit logs
 *     description: Returns paginated audit logs. Super admins see all, company admins see their company only.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *         description: Filter by action type (LOGIN_SUCCESS, DOCUMENT_VIEW, etc.)
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [authentication, authorization, data_access, data_modification, security, admin]
 *       - in: query
 *         name: severity
 *         schema:
 *           type: string
 *           enum: [info, warning, critical]
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Paginated audit logs
 *       403:
 *         description: Admin access required
 */
router.get('/audit-logs', adminController.getAuditLogs);

/**
 * @swagger
 * /api/admin/audit-stats:
 *   get:
 *     summary: Get audit statistics
 *     description: Returns aggregated statistics for compliance dashboard
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Number of days to include in stats
 *     responses:
 *       200:
 *         description: Audit statistics
 */
router.get('/audit-stats', adminController.getAuditStats);

/**
 * @swagger
 * /api/admin/audit-logs/export:
 *   get:
 *     summary: Export audit logs
 *     description: Export audit logs in CSV or JSON format for compliance reporting
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [csv, json]
 *           default: csv
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Exported audit logs file
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *           application/json:
 *             schema:
 *               type: array
 */
router.get('/audit-logs/export', adminController.exportAuditLogs);

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: List users
 *     description: Get list of users in the admin's company (or all users for super admins)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of users
 */
router.get('/users', adminController.getUsers);

/**
 * @swagger
 * /api/admin/users/{id}/role:
 *   put:
 *     summary: Update user role
 *     description: Update a user's role or admin status
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [admin, pm, gf, foreman, crew]
 *               isAdmin:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: User updated successfully
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: User not found
 */
router.put('/users/:id/role', adminController.updateUserRole);

/**
 * @swagger
 * /api/admin/users/{id}:
 *   delete:
 *     summary: Deactivate user
 *     description: Soft delete/deactivate a user account
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User deactivated successfully
 *       400:
 *         description: Cannot deactivate own account
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: User not found
 */
router.delete('/users/:id', adminController.deactivateUser);

module.exports = router;

