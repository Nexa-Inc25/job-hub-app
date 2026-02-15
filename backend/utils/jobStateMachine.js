/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Job State Machine
 *
 * Defines the valid status transitions for jobs and validates
 * transition attempts. Used by job-lifecycle routes to replace
 * ad-hoc if/else chains with a declarative transition map.
 *
 * @module utils/jobStateMachine
 */

/**
 * All valid job statuses (excludes legacy aliases).
 */
const JOB_STATUSES = [
  'new',
  'assigned_to_gf',
  'pre_fielding',
  'scheduled',
  'stuck',
  'in_progress',
  'pending_gf_review',
  'pending_qa_review',
  'pending_pm_approval',
  'ready_to_submit',
  'submitted',
  'go_back',
  'billed',
  'invoiced',
];

/**
 * Legacy status aliases that map to canonical statuses.
 */
const LEGACY_STATUS_MAP = {
  pending: 'new',
  'pre-field': 'pre_fielding',
  'in-progress': 'in_progress',
  completed: 'ready_to_submit',
};

/**
 * Transition map: `from` → allowed `to` statuses.
 *
 * "stuck" is reachable from scheduled and in_progress (side-state).
 * "go_back" is reachable from submitted (utility rejects).
 */
const TRANSITIONS = {
  new: ['assigned_to_gf'],
  assigned_to_gf: ['pre_fielding'],
  pre_fielding: ['scheduled'],
  scheduled: ['in_progress', 'stuck'],
  stuck: ['scheduled', 'in_progress'],
  in_progress: ['pending_gf_review', 'stuck'],
  pending_gf_review: ['pending_qa_review', 'in_progress'],
  pending_qa_review: ['pending_pm_approval', 'pending_gf_review'],
  pending_pm_approval: ['ready_to_submit', 'pending_qa_review'],
  ready_to_submit: ['submitted'],
  submitted: ['billed', 'go_back'],
  go_back: ['in_progress', 'pending_gf_review'],
  billed: ['invoiced'],
  invoiced: [],
};

/**
 * Fields required for specific transitions.
 * Key format: "from→to"
 */
const REQUIRED_FIELDS = {
  'new→assigned_to_gf': ['assignedToGF'],
  'pre_fielding→scheduled': ['crewScheduledDate'],
  'scheduled→in_progress': ['safetyGateCleared'],
  'in_progress→stuck': ['stuckReason'],
  'scheduled→stuck': ['stuckReason'],
};

/**
 * Resolve a status value, mapping legacy aliases to canonical form.
 *
 * @param {string} status - Raw status value (may be legacy).
 * @returns {string} Canonical status.
 */
function resolveStatus(status) {
  if (!status || typeof status !== 'string') {
    return status;
  }
  return LEGACY_STATUS_MAP[status] || status;
}

/**
 * Validate whether a transition from `fromStatus` to `toStatus` is allowed.
 *
 * @param {string} fromStatus - Current job status (may be legacy).
 * @param {string} toStatus   - Desired job status (may be legacy).
 * @param {object} [jobData]  - Object with job/request fields for required-field checks.
 * @returns {{ valid: boolean, canonicalFrom?: string, canonicalTo?: string, requiredFields?: string[], error?: string, code?: string }}
 */
function validateTransition(fromStatus, toStatus, jobData = {}) {
  const canonicalFrom = resolveStatus(fromStatus);
  const canonicalTo = resolveStatus(toStatus);

  // Unknown source status
  if (!TRANSITIONS[canonicalFrom]) {
    return {
      valid: false,
      error: `Unknown source status "${fromStatus}"`,
      code: 'UNKNOWN_STATUS',
    };
  }

  // Unknown target status
  if (!JOB_STATUSES.includes(canonicalTo)) {
    return {
      valid: false,
      error: `Unknown target status "${toStatus}"`,
      code: 'UNKNOWN_STATUS',
    };
  }

  // Check transition allowed
  const allowed = TRANSITIONS[canonicalFrom];
  if (!allowed.includes(canonicalTo)) {
    return {
      valid: false,
      error: `Transition from "${canonicalFrom}" to "${canonicalTo}" is not allowed`,
      code: 'INVALID_TRANSITION',
    };
  }

  // Check required fields
  const key = `${canonicalFrom}→${canonicalTo}`;
  const requiredFields = REQUIRED_FIELDS[key] || [];
  const missingFields = requiredFields.filter((field) => {
    const value = jobData[field];
    return value === undefined || value === null || value === '';
  });

  if (missingFields.length > 0) {
    return {
      valid: false,
      canonicalFrom,
      canonicalTo,
      requiredFields: missingFields,
      error: `Missing required fields for this transition: ${missingFields.join(', ')}`,
      code: 'MISSING_REQUIRED_FIELDS',
    };
  }

  return {
    valid: true,
    canonicalFrom,
    canonicalTo,
    requiredFields: [],
  };
}

/**
 * Get the list of valid next statuses from a given status.
 *
 * @param {string} currentStatus - Current job status (may be legacy).
 * @returns {string[]} Array of valid next statuses.
 */
function getValidNextStatuses(currentStatus) {
  const canonical = resolveStatus(currentStatus);
  return TRANSITIONS[canonical] || [];
}

/**
 * Check whether a status value is a legacy alias.
 *
 * @param {string} status
 * @returns {boolean}
 */
function isLegacyStatus(status) {
  return Object.prototype.hasOwnProperty.call(LEGACY_STATUS_MAP, status);
}

module.exports = {
  JOB_STATUSES,
  LEGACY_STATUS_MAP,
  TRANSITIONS,
  REQUIRED_FIELDS,
  resolveStatus,
  validateTransition,
  getValidNextStatuses,
  isLegacyStatus,
};
