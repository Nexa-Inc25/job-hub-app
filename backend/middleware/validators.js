/**
 * Express Validator Schemas
 * 
 * Centralized input validation for API endpoints.
 * Uses express-validator for consistent, declarative validation.
 * 
 * @module middleware/validators
 */

const { body, param, query, validationResult } = require('express-validator');

/**
 * Validation result handler - returns 400 with details if validation fails
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    });
  }
  next();
};

// ============================================================================
// AUTH VALIDATORS
// ============================================================================

/**
 * Login validation
 */
const loginValidation = [
  body('email')
    .trim()
    .isEmail()
    .withMessage('Valid email is required')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  validate
];

/**
 * Signup validation
 */
const signupValidation = [
  body('email')
    .trim()
    .isEmail()
    .withMessage('Valid email is required')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/[a-z]/)
    .withMessage('Password must contain a lowercase letter')
    .matches(/[A-Z]/)
    .withMessage('Password must contain an uppercase letter')
    .matches(/[0-9]/)
    .withMessage('Password must contain a number'),
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ max: 100 })
    .withMessage('Name must be less than 100 characters'),
  body('companyCode')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Company code must be less than 50 characters'),
  validate
];

/**
 * MFA code validation
 */
const mfaValidation = [
  body('code')
    .trim()
    .isLength({ min: 6, max: 6 })
    .withMessage('MFA code must be 6 digits')
    .isNumeric()
    .withMessage('MFA code must be numeric'),
  validate
];

// ============================================================================
// BILLING VALIDATORS
// ============================================================================

/**
 * Unit entry creation validation
 */
const unitEntryValidation = [
  body('jobId')
    .notEmpty()
    .withMessage('Job ID is required')
    .isMongoId()
    .withMessage('Invalid job ID format'),
  body('quantity')
    .isInt({ min: 1, max: 10000 })
    .withMessage('Quantity must be between 1 and 10,000'),
  body('itemCode')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Item code must be less than 50 characters'),
  body('priceBookItemId')
    .optional()
    .isMongoId()
    .withMessage('Invalid price book item ID'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Notes must be less than 2000 characters'),
  validate
];

/**
 * Unit approval validation
 */
const unitApprovalValidation = [
  param('unitId')
    .isMongoId()
    .withMessage('Invalid unit ID'),
  body('status')
    .isIn(['approved', 'rejected', 'pending'])
    .withMessage('Status must be approved, rejected, or pending'),
  body('rejectionReason')
    .if(body('status').equals('rejected'))
    .notEmpty()
    .withMessage('Rejection reason is required when rejecting'),
  validate
];

/**
 * Claim creation validation
 */
const claimValidation = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Claim name is required')
    .isLength({ max: 200 })
    .withMessage('Name must be less than 200 characters'),
  body('claimPeriod')
    .optional()
    .isObject()
    .withMessage('Claim period must be an object'),
  body('claimPeriod.startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid date'),
  body('claimPeriod.endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid date'),
  validate
];

// ============================================================================
// JOB VALIDATORS
// ============================================================================

/**
 * Job creation validation
 */
const jobCreationValidation = [
  body('title')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Title must be less than 200 characters'),
  body('woNumber')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('WO number must be less than 50 characters'),
  body('pmNumber')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('PM number must be less than 50 characters'),
  body('address')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Address must be less than 500 characters'),
  body('status')
    .optional()
    .isIn(['pending', 'in_progress', 'completed', 'cancelled', 'archived'])
    .withMessage('Invalid status value'),
  validate
];

/**
 * MongoDB ObjectId parameter validation
 */
const mongoIdParam = (paramName = 'id') => [
  param(paramName)
    .isMongoId()
    .withMessage(`Invalid ${paramName} format`),
  validate
];

/**
 * Pagination query validation
 */
const paginationValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('sort')
    .optional()
    .isIn(['createdAt', '-createdAt', 'updatedAt', '-updatedAt', 'name', '-name'])
    .withMessage('Invalid sort field'),
  validate
];

module.exports = {
  validate,
  // Auth
  loginValidation,
  signupValidation,
  mfaValidation,
  // Billing
  unitEntryValidation,
  unitApprovalValidation,
  claimValidation,
  // Jobs
  jobCreationValidation,
  mongoIdParam,
  paginationValidation
};

