/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Jobs Routes
 * 
 * Handles all job-related endpoints.
 * 
 * @module routes/jobs
 */

const express = require('express');
const router = express.Router();
const jobsController = require('../controllers/jobs.controller');

/**
 * @swagger
 * /api/jobs:
 *   get:
 *     summary: List all jobs
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by status
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *       - in: query
 *         name: skip
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: List of jobs
 */
router.get('/', jobsController.listJobs);

/**
 * @swagger
 * /api/jobs/{id}:
 *   get:
 *     summary: Get job by ID
 *     tags: [Jobs]
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
 *         description: Job details
 *       404:
 *         description: Job not found
 */
router.get('/:id', jobsController.getJob);

/**
 * @swagger
 * /api/jobs:
 *   post:
 *     summary: Create new job
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               pmNumber:
 *                 type: string
 *               woNumber:
 *                 type: string
 *               address:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Job created
 */
router.post('/', jobsController.createJob);

/**
 * @swagger
 * /api/jobs/{id}:
 *   put:
 *     summary: Update job
 *     tags: [Jobs]
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
 *         description: Job updated
 */
router.put('/:id', jobsController.updateJob);

/**
 * @swagger
 * /api/jobs/{id}:
 *   delete:
 *     summary: Delete job
 *     tags: [Jobs]
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
 *         description: Job deleted
 */
router.delete('/:id', jobsController.deleteJob);

/**
 * @swagger
 * /api/jobs/{id}/status:
 *   patch:
 *     summary: Update job status
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 */
router.patch('/:id/status', jobsController.updateStatus);

/**
 * @swagger
 * /api/jobs/{id}/assign:
 *   patch:
 *     summary: Assign job to user
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 */
router.patch('/:id/assign', jobsController.assignJob);

/**
 * @swagger
 * /api/jobs/{id}/cancel:
 *   post:
 *     summary: Cancel or reschedule a job
 *     description: Moves job back to pre_fielding status with reason tracking. Used when a scheduled job needs to be unscheduled.
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Job ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Reason for cancellation or reschedule
 *                 example: "Customer not available, needs to reschedule"
 *               cancelType:
 *                 type: string
 *                 enum: [canceled, rescheduled]
 *                 default: canceled
 *                 description: Type of cancellation
 *     responses:
 *       200:
 *         description: Job canceled/rescheduled successfully
 *       400:
 *         description: Invalid request or job status
 *       404:
 *         description: Job not found
 */
router.post('/:id/cancel', jobsController.cancelJob);

module.exports = router;

