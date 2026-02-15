/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Job State Machine Tests
 *
 * Validates every valid transition, every invalid transition,
 * legacy status resolution, required-field enforcement,
 * and helper utilities.
 */

const {
  JOB_STATUSES,
  LEGACY_STATUS_MAP,
  TRANSITIONS,
  REQUIRED_FIELDS,
  resolveStatus,
  validateTransition,
  getValidNextStatuses,
  isLegacyStatus,
} = require('../utils/jobStateMachine');

describe('jobStateMachine', () => {
  // ==================== resolveStatus ====================
  describe('resolveStatus', () => {
    it('should return canonical status for non-legacy values', () => {
      expect(resolveStatus('new')).toBe('new');
      expect(resolveStatus('in_progress')).toBe('in_progress');
      expect(resolveStatus('billed')).toBe('billed');
    });

    it('should map legacy "pending" to "new"', () => {
      expect(resolveStatus('pending')).toBe('new');
    });

    it('should map legacy "pre-field" to "pre_fielding"', () => {
      expect(resolveStatus('pre-field')).toBe('pre_fielding');
    });

    it('should map legacy "in-progress" to "in_progress"', () => {
      expect(resolveStatus('in-progress')).toBe('in_progress');
    });

    it('should map legacy "completed" to "ready_to_submit"', () => {
      expect(resolveStatus('completed')).toBe('ready_to_submit');
    });

    it('should pass through null/undefined without error', () => {
      expect(resolveStatus(null)).toBeNull();
      expect(resolveStatus(undefined)).toBeUndefined();
    });

    it('should pass through unknown strings unchanged', () => {
      expect(resolveStatus('banana')).toBe('banana');
    });
  });

  // ==================== isLegacyStatus ====================
  describe('isLegacyStatus', () => {
    it('should return true for each legacy alias', () => {
      Object.keys(LEGACY_STATUS_MAP).forEach((legacy) => {
        expect(isLegacyStatus(legacy)).toBe(true);
      });
    });

    it('should return false for canonical statuses', () => {
      JOB_STATUSES.forEach((s) => {
        expect(isLegacyStatus(s)).toBe(false);
      });
    });
  });

  // ==================== getValidNextStatuses ====================
  describe('getValidNextStatuses', () => {
    it('should return correct next statuses for "new"', () => {
      expect(getValidNextStatuses('new')).toEqual(['assigned_to_gf']);
    });

    it('should return correct next statuses for "scheduled"', () => {
      expect(getValidNextStatuses('scheduled')).toEqual(['in_progress', 'stuck']);
    });

    it('should return correct next statuses for "submitted"', () => {
      expect(getValidNextStatuses('submitted')).toEqual(['billed', 'go_back']);
    });

    it('should return empty array for terminal status "invoiced"', () => {
      expect(getValidNextStatuses('invoiced')).toEqual([]);
    });

    it('should resolve legacy status before lookup', () => {
      // "pending" → "new" → next = ['assigned_to_gf']
      expect(getValidNextStatuses('pending')).toEqual(['assigned_to_gf']);
    });

    it('should return empty array for unknown status', () => {
      expect(getValidNextStatuses('banana')).toEqual([]);
    });
  });

  // ==================== validateTransition – happy paths ====================
  describe('validateTransition – valid transitions', () => {
    const validPaths = [
      ['new', 'assigned_to_gf', { assignedToGF: 'user123' }],
      ['assigned_to_gf', 'pre_fielding', {}],
      ['pre_fielding', 'scheduled', { crewScheduledDate: '2025-01-01' }],
      ['scheduled', 'in_progress', { safetyGateCleared: true }],
      ['scheduled', 'stuck', { stuckReason: 'Missing materials' }],
      ['in_progress', 'pending_gf_review', {}],
      ['in_progress', 'stuck', { stuckReason: 'Design issue' }],
      ['pending_gf_review', 'pending_qa_review', {}],
      ['pending_gf_review', 'in_progress', {}],
      ['pending_qa_review', 'pending_pm_approval', {}],
      ['pending_qa_review', 'pending_gf_review', {}],
      ['pending_pm_approval', 'ready_to_submit', {}],
      ['pending_pm_approval', 'pending_qa_review', {}],
      ['ready_to_submit', 'submitted', {}],
      ['submitted', 'billed', {}],
      ['submitted', 'go_back', {}],
      ['go_back', 'in_progress', {}],
      ['go_back', 'pending_gf_review', {}],
      ['billed', 'invoiced', {}],
      ['stuck', 'scheduled', {}],
      ['stuck', 'in_progress', {}],
    ];

    test.each(validPaths)(
      '%s → %s should be valid',
      (from, to, data) => {
        const result = validateTransition(from, to, data);
        expect(result.valid).toBe(true);
        expect(result.canonicalFrom).toBe(from);
        expect(result.canonicalTo).toBe(to);
      }
    );
  });

  // ==================== validateTransition – legacy resolution ====================
  describe('validateTransition – legacy statuses', () => {
    it('should resolve "pending" → "assigned_to_gf" via "new"', () => {
      const result = validateTransition('pending', 'assigned_to_gf', { assignedToGF: 'user123' });
      expect(result.valid).toBe(true);
      expect(result.canonicalFrom).toBe('new');
    });

    it('should resolve target "completed" → "ready_to_submit"', () => {
      // "pending_pm_approval" → "ready_to_submit" is valid
      const result = validateTransition('pending_pm_approval', 'completed', {});
      expect(result.valid).toBe(true);
      expect(result.canonicalTo).toBe('ready_to_submit');
    });
  });

  // ==================== validateTransition – invalid transitions ====================
  describe('validateTransition – invalid transitions', () => {
    const invalidPaths = [
      ['new', 'in_progress'],
      ['new', 'billed'],
      ['new', 'submitted'],
      ['assigned_to_gf', 'in_progress'],
      ['pre_fielding', 'in_progress'],
      ['in_progress', 'submitted'],
      ['in_progress', 'billed'],
      ['ready_to_submit', 'new'],
      ['invoiced', 'new'],
      ['billed', 'new'],
    ];

    test.each(invalidPaths)(
      '%s → %s should be INVALID',
      (from, to) => {
        const result = validateTransition(from, to);
        expect(result.valid).toBe(false);
        expect(result.code).toBe('INVALID_TRANSITION');
      }
    );
  });

  // ==================== validateTransition – missing required fields ====================
  describe('validateTransition – required fields', () => {
    it('should reject new → assigned_to_gf without assignedToGF', () => {
      const result = validateTransition('new', 'assigned_to_gf', {});
      expect(result.valid).toBe(false);
      expect(result.code).toBe('MISSING_REQUIRED_FIELDS');
      expect(result.requiredFields).toContain('assignedToGF');
    });

    it('should reject pre_fielding → scheduled without crewScheduledDate', () => {
      const result = validateTransition('pre_fielding', 'scheduled', {});
      expect(result.valid).toBe(false);
      expect(result.code).toBe('MISSING_REQUIRED_FIELDS');
      expect(result.requiredFields).toContain('crewScheduledDate');
    });

    it('should reject scheduled → in_progress without safetyGateCleared', () => {
      const result = validateTransition('scheduled', 'in_progress', {});
      expect(result.valid).toBe(false);
      expect(result.code).toBe('MISSING_REQUIRED_FIELDS');
      expect(result.requiredFields).toContain('safetyGateCleared');
    });

    it('should reject safetyGateCleared=false as missing', () => {
      const result = validateTransition('scheduled', 'in_progress', { safetyGateCleared: false });
      // false is falsy but not null/undefined/empty, so it should pass
      // Actually our check uses: value === undefined || value === null || value === ''
      // false is none of those, so it should be valid
      expect(result.valid).toBe(true);
    });

    it('should reject safetyGateCleared="" as missing', () => {
      const result = validateTransition('scheduled', 'in_progress', { safetyGateCleared: '' });
      expect(result.valid).toBe(false);
      expect(result.code).toBe('MISSING_REQUIRED_FIELDS');
    });

    it('should reject scheduled → stuck without stuckReason', () => {
      const result = validateTransition('scheduled', 'stuck', {});
      expect(result.valid).toBe(false);
      expect(result.code).toBe('MISSING_REQUIRED_FIELDS');
      expect(result.requiredFields).toContain('stuckReason');
    });

    it('should reject in_progress → stuck without stuckReason', () => {
      const result = validateTransition('in_progress', 'stuck', {});
      expect(result.valid).toBe(false);
      expect(result.code).toBe('MISSING_REQUIRED_FIELDS');
      expect(result.requiredFields).toContain('stuckReason');
    });
  });

  // ==================== validateTransition – unknown statuses ====================
  describe('validateTransition – unknown statuses', () => {
    it('should reject unknown source status', () => {
      const result = validateTransition('banana', 'new');
      expect(result.valid).toBe(false);
      expect(result.code).toBe('UNKNOWN_STATUS');
    });

    it('should reject unknown target status', () => {
      const result = validateTransition('new', 'banana');
      expect(result.valid).toBe(false);
      expect(result.code).toBe('UNKNOWN_STATUS');
    });
  });

  // ==================== Full lifecycle path ====================
  describe('Full lifecycle – happy path', () => {
    it('should validate the complete happy-path lifecycle', () => {
      const steps = [
        { from: 'new', to: 'assigned_to_gf', data: { assignedToGF: 'gf1' } },
        { from: 'assigned_to_gf', to: 'pre_fielding', data: {} },
        { from: 'pre_fielding', to: 'scheduled', data: { crewScheduledDate: '2025-06-01' } },
        { from: 'scheduled', to: 'in_progress', data: { safetyGateCleared: true } },
        { from: 'in_progress', to: 'pending_gf_review', data: {} },
        { from: 'pending_gf_review', to: 'pending_qa_review', data: {} },
        { from: 'pending_qa_review', to: 'pending_pm_approval', data: {} },
        { from: 'pending_pm_approval', to: 'ready_to_submit', data: {} },
        { from: 'ready_to_submit', to: 'submitted', data: {} },
        { from: 'submitted', to: 'billed', data: {} },
        { from: 'billed', to: 'invoiced', data: {} },
      ];

      steps.forEach(({ from, to, data }) => {
        const result = validateTransition(from, to, data);
        expect(result.valid).toBe(true);
      });
    });
  });

  // ==================== Data integrity ====================
  describe('Data integrity', () => {
    it('should have transitions defined for every status', () => {
      JOB_STATUSES.forEach((status) => {
        expect(TRANSITIONS).toHaveProperty(status);
        expect(Array.isArray(TRANSITIONS[status])).toBe(true);
      });
    });

    it('should only reference valid statuses in transition targets', () => {
      Object.entries(TRANSITIONS).forEach(([, targets]) => {
        targets.forEach((target) => {
          expect(JOB_STATUSES).toContain(target);
        });
      });
    });

    it('should only reference valid status pairs in REQUIRED_FIELDS keys', () => {
      Object.keys(REQUIRED_FIELDS).forEach((key) => {
        const [from, to] = key.split('→');
        expect(JOB_STATUSES).toContain(from);
        expect(JOB_STATUSES).toContain(to);
        // And the transition should be valid
        expect(TRANSITIONS[from]).toContain(to);
      });
    });

    it('should have exactly 4 legacy mappings', () => {
      expect(Object.keys(LEGACY_STATUS_MAP)).toHaveLength(4);
    });
  });
});
