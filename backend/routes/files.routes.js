/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * File Routes
 * 
 * Handles file access and streaming endpoints.
 * 
 * @swagger
 * tags:
 *   - name: Files
 *     description: File access and download endpoints
 */

const express = require('express');
const router = express.Router();
const filesController = require('../controllers/files.controller');

// Import auth middleware - will be passed from server.js
let authenticateUser;

/**
 * Initialize routes with auth middleware
 * @param {Function} authMiddleware - Authentication middleware function
 */
const initRoutes = (authMiddleware) => {
  authenticateUser = authMiddleware;
  return router;
};

/**
 * @swagger
 * /api/files/signed/{key}:
 *   get:
 *     summary: Get signed URL for file download
 *     description: Returns a time-limited signed URL for authenticated file download
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: File key/path in storage
 *     responses:
 *       200:
 *         description: Signed URL generated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url:
 *                   type: string
 *                   description: Signed download URL
 *       404:
 *         description: File not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/signed/:key(*)', (req, res, _next) => {
  if (authenticateUser) {
    return authenticateUser(req, res, () => filesController.getSignedUrl(req, res));
  }
  return filesController.getSignedUrl(req, res);
});

/**
 * @swagger
 * /api/files/{key}:
 *   get:
 *     summary: Stream file directly
 *     description: |
 *       Streams file content directly for embedding in img tags, iframes, etc.
 *       No authentication required - security via obscure file paths.
 *     tags: [Files]
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: File key/path in storage
 *     responses:
 *       200:
 *         description: File content
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: File not found
 */
router.get('/:key(*)', filesController.streamFile);

module.exports = { router, initRoutes };

