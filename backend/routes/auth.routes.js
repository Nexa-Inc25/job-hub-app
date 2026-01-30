/**
 * Authentication Routes
 * 
 * Handles all authentication-related endpoints.
 * Matches exact behavior from server.js for safe migration.
 * 
 * @module routes/auth
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

/**
 * @swagger
 * /api/login:
 *   post:
 *     summary: User login
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful (or MFA required)
 *       401:
 *         description: Invalid credentials
 *       423:
 *         description: Account locked
 */
router.post('/login', authController.login);

/**
 * @swagger
 * /api/signup:
 *   post:
 *     summary: Register new user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 description: Must contain uppercase, lowercase, and number
 *               name:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [crew, foreman, gf, pm, admin]
 *                 default: crew
 *     responses:
 *       201:
 *         description: User created successfully
 *       400:
 *         description: Invalid input or validation error
 */
router.post('/signup', authController.signup);

/**
 * @swagger
 * /api/auth/mfa/verify:
 *   post:
 *     summary: Verify MFA code during login
 *     tags: [Authentication, MFA]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - mfaToken
 *               - code
 *             properties:
 *               mfaToken:
 *                 type: string
 *                 description: Temporary token from login response
 *               code:
 *                 type: string
 *                 description: 6-digit TOTP code
 *               trustDevice:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: MFA verified, full token returned
 *       401:
 *         description: Invalid or expired MFA token/code
 */
router.post('/auth/mfa/verify', authController.verifyMfa);

// Protected routes require authentication middleware
// These will be mounted with authenticateUser middleware in server.js

/**
 * @swagger
 * /api/users/me:
 *   get:
 *     summary: Get current user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile
 *       401:
 *         description: Not authenticated
 */
// router.get('/users/me', authController.getProfile); // Requires auth middleware

/**
 * @swagger
 * /api/auth/mfa/setup:
 *   post:
 *     summary: Setup MFA - Generate QR code
 *     tags: [MFA]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: MFA secret and QR code
 */
// Protected MFA routes - require auth middleware when mounted
const mfaRoutes = express.Router();
mfaRoutes.post('/setup', authController.setupMfa);
mfaRoutes.post('/enable', authController.enableMfa);
mfaRoutes.post('/disable', authController.disableMfa);
mfaRoutes.get('/status', authController.getMfaStatus);

// Export both the main router and MFA routes
module.exports = router;
module.exports.mfaRoutes = mfaRoutes;
module.exports.getProfile = authController.getProfile;
