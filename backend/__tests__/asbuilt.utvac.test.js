/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 *
 * UTVACValidator unit tests.
 * Tests each UTVAC dimension and the configurable scoring system.
 */

// ---- Mock UtilityAsBuiltConfig before requiring the module ----
const mockConfig = {
  utilityCode: 'PGE',
  workTypes: [
    {
      code: 'estimated',
      label: 'Estimated Work',
      requiredDocs: ['ec_tag', 'construction_sketch', 'ccsc', 'billing_form'],
      requiresSketchMarkup: true,
      allowBuiltAsDesigned: true,
    },
    {
      code: 'ec_corrective',
      label: 'EC Tag Work',
      requiredDocs: ['ec_tag', 'construction_sketch', 'ccsc'],
      requiresSketchMarkup: true,
      allowBuiltAsDesigned: true,
    },
  ],
  checklist: {
    formId: 'TD-2504P-01-F01',
    formName: 'CCSC',
    requiresCrewLeadSignature: true,
    sections: [
      {
        code: 'OH',
        label: 'Overhead',
        items: [
          { number: 1, text: 'Poles — Visibility strips installed', safetyCritical: true },
          { number: 2, text: 'Hardware — Bolts tightened', safetyCritical: false },
          { number: 3, text: 'Grounds — Not exposed', safetyCritical: true },
        ],
      },
    ],
  },
  validationRules: [],
  scoreThresholds: {
    usability: 60,
    traceability: 70,
    verification: 70,
    accuracy: 80,
    overall: 70,
  },
};

jest.mock('../models/UtilityAsBuiltConfig', () => ({
  findByUtilityCode: jest.fn().mockResolvedValue(mockConfig),
}));

const utvac = require('../services/asbuilt/UTVACValidator');

describe('UTVACValidator', () => {
  // ---- Completeness / Accuracy ----

  describe('Accuracy dimension', () => {
    test('passes when all required docs are completed', async () => {
      const submission = {
        utilityCode: 'PGE',
        workType: 'estimated',
        completedSteps: { work_type: true, ec_tag: true, sketch: true, ccsc: true, billing_form: true },
        stepData: {
          ec_tag: { lanId: 'jdoe', completionDate: '2026-02-14', signatureData: 'sig', completionType: 'Completed' },
          sketch: { strokeCount: 5, lineCount: 2, symbolCount: 1, textCount: 1, colorsUsed: ['red', 'blue'] },
          ccsc: { signatureData: 'sig', sections: {} },
        },
      };

      const result = await utvac.validate(submission, { job: { pmNumber: '123', address: '123 Main St' } });
      const accuracyErrors = result.errors.filter(e => e.category === 'accuracy');
      expect(accuracyErrors).toHaveLength(0);
    });

    test('fails when required docs are missing', async () => {
      const submission = {
        utilityCode: 'PGE',
        workType: 'estimated',
        completedSteps: { work_type: true },
        stepData: {},
      };

      const result = await utvac.validate(submission, {});
      const missingDocs = result.errors.filter(e => e.code.startsWith('MISSING_DOC_'));
      expect(missingDocs.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ---- Traceability ----

  describe('Traceability dimension', () => {
    test('passes when LAN ID and completion date are present', async () => {
      const submission = {
        utilityCode: 'PGE',
        workType: 'ec_corrective',
        completedSteps: { work_type: true, ec_tag: true, sketch: true, ccsc: true },
        stepData: {
          ec_tag: { lanId: 'jdoe', completionDate: '2026-02-14', signatureData: 'sig', completionType: 'Completed' },
          sketch: { builtAsDesigned: true },
          ccsc: { signatureData: 'sig', sections: {} },
        },
      };

      const result = await utvac.validate(submission, { job: { pmNumber: '123', workOrderNumber: 'WO-1' } });
      const traceErrors = result.errors.filter(e => e.category === 'traceability');
      expect(traceErrors).toHaveLength(0);
    });

    test('fails when LAN ID is missing', async () => {
      const submission = {
        utilityCode: 'PGE',
        workType: 'ec_corrective',
        completedSteps: { work_type: true },
        stepData: { ec_tag: {} },
      };

      const result = await utvac.validate(submission, { job: {} });
      expect(result.errors.some(e => e.code === 'MISSING_IDENTITY')).toBe(true);
    });

    test('traces materials when crew materials match conductor data', async () => {
      const submission = {
        utilityCode: 'PGE',
        workType: 'estimated',
        completedSteps: { work_type: true, ec_tag: true, sketch: true, ccsc: true, billing_form: true },
        stepData: {
          ec_tag: { lanId: 'jdoe', completionDate: '2026-02-14', signatureData: 'sig', completionType: 'Completed' },
          sketch: { builtAsDesigned: true },
          ccsc: { signatureData: 'sig', sections: {} },
          fda: {
            conductors: [{ size: '#4 ACSR', material: 'ACSR' }],
          },
        },
      };

      const job = {
        pmNumber: '123',
        crewMaterials: [
          { mCode: 'M-001', description: '#4 ACSR Conductor 500ft', quantity: 500 },
        ],
      };

      const result = await utvac.validate(submission, { job });
      const traceCheck = result.checks.find(c => c.code === 'MATERIAL_TRACE_CONDUCTORS');
      expect(traceCheck).toBeDefined();
      expect(traceCheck.passed).toBe(true);
    });
  });

  // ---- Verification ----

  describe('Verification dimension', () => {
    test('flags missing EC Tag signature', async () => {
      const submission = {
        utilityCode: 'PGE',
        workType: 'ec_corrective',
        completedSteps: { work_type: true, ec_tag: true },
        stepData: { ec_tag: { lanId: 'jdoe', completionDate: '2026-02-14' } }, // No signatureData
      };

      const result = await utvac.validate(submission, { job: { pmNumber: '123' } });
      expect(result.errors.some(e => e.code === 'MISSING_EC_TAG_SIG')).toBe(true);
    });

    test('flags missing CCSC signature when required', async () => {
      const submission = {
        utilityCode: 'PGE',
        workType: 'ec_corrective',
        completedSteps: { work_type: true, ccsc: true },
        stepData: { ccsc: { sections: {} } }, // No signatureData
      };

      const result = await utvac.validate(submission, { job: { pmNumber: '123' } });
      expect(result.errors.some(e => e.code === 'MISSING_CCSC_SIG')).toBe(true);
    });

    test('warns when no photos uploaded', async () => {
      const submission = {
        utilityCode: 'PGE',
        workType: 'ec_corrective',
        completedSteps: { work_type: true },
        stepData: {},
      };

      const result = await utvac.validate(submission, { job: {}, photos: [] });
      expect(result.warnings.some(w => w.code === 'NO_PHOTOS')).toBe(true);
    });
  });

  // ---- Usability ----

  describe('Usability dimension', () => {
    test('passes usability when sketch has enough annotations', async () => {
      const submission = {
        utilityCode: 'PGE',
        workType: 'estimated',
        completedSteps: { work_type: true, ec_tag: true, sketch: true, ccsc: true, billing_form: true },
        stepData: {
          ec_tag: { lanId: 'jdoe', completionDate: '2026-02-14', signatureData: 'sig', completionType: 'Completed' },
          sketch: { strokeCount: 3, lineCount: 2, symbolCount: 1, textCount: 2, colorsUsed: ['red', 'blue'] },
          ccsc: { signatureData: 'sig', sections: {} },
        },
      };

      const result = await utvac.validate(submission, { job: { pmNumber: '123', address: '123 St' } });
      const annotCheck = result.checks.find(c => c.code === 'SKETCH_ANNOTATION_COUNT');
      expect(annotCheck).toBeDefined();
      expect(annotCheck.passed).toBe(true);
    });

    test('warns when sketch has very few annotations', async () => {
      const submission = {
        utilityCode: 'PGE',
        workType: 'estimated',
        completedSteps: { work_type: true, sketch: true },
        stepData: {
          sketch: { strokeCount: 1, lineCount: 0, symbolCount: 0, textCount: 0, colorsUsed: ['red'] },
        },
      };

      const result = await utvac.validate(submission, { job: { pmNumber: '123' } });
      expect(result.warnings.some(w => w.code === 'SKETCH_FEW_ANNOTATIONS')).toBe(true);
    });
  });

  // ---- Scoring ----

  describe('Scoring', () => {
    test('returns dimension scores', async () => {
      const submission = {
        utilityCode: 'PGE',
        workType: 'estimated',
        completedSteps: { work_type: true, ec_tag: true, sketch: true, ccsc: true, billing_form: true },
        stepData: {
          ec_tag: { lanId: 'jdoe', completionDate: '2026-02-14', signatureData: 'sig', completionType: 'Completed' },
          sketch: { strokeCount: 5, lineCount: 2, symbolCount: 1, textCount: 1, colorsUsed: ['red', 'blue'] },
          ccsc: { signatureData: 'sig', sections: {} },
        },
      };

      const result = await utvac.validate(submission, {
        job: { pmNumber: '123', address: '123 Main St', workOrderNumber: 'WO-1' },
        photos: [{ id: 1 }],
      });

      expect(result.dimensions).toBeDefined();
      expect(result.dimensions.usability).toBeDefined();
      expect(result.dimensions.traceability).toBeDefined();
      expect(result.dimensions.verification).toBeDefined();
      expect(result.dimensions.accuracy).toBeDefined();

      // Each dimension should have a score between 0 and 100
      for (const dim of Object.values(result.dimensions)) {
        expect(dim.score).toBeGreaterThanOrEqual(0);
        expect(dim.score).toBeLessThanOrEqual(100);
      }

      // Overall score should be a weighted average
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    test('returns zero scores when config is missing', async () => {
      const UtilityConfig = require('../models/UtilityAsBuiltConfig');
      UtilityConfig.findByUtilityCode.mockResolvedValueOnce(null);

      const submission = { utilityCode: 'UNKNOWN', workType: 'test', completedSteps: {}, stepData: {} };
      const result = await utvac.validate(submission, {});

      expect(result.valid).toBe(false);
      expect(result.score).toBe(0);
      expect(result.errors[0].code).toBe('NO_CONFIG');
    });
  });

  // ---- Checklist validation ----

  describe('Checklist validation', () => {
    test('flags safety-critical items not addressed', async () => {
      const submission = {
        utilityCode: 'PGE',
        workType: 'ec_corrective',
        completedSteps: { work_type: true, ccsc: true },
        stepData: {
          ccsc: {
            signatureData: 'sig',
            sections: {
              OH: {
                items: [
                  { number: 1, checked: false }, // safety-critical
                  { number: 2, checked: true },
                  { number: 3, checked: false }, // safety-critical
                ],
              },
            },
          },
        },
      };

      const result = await utvac.validate(submission, { job: { pmNumber: '123' } });
      expect(result.errors.some(e => e.code === 'CCSC_SAFETY_OH')).toBe(true);
    });

    test('warns on non-safety items unchecked', async () => {
      const submission = {
        utilityCode: 'PGE',
        workType: 'ec_corrective',
        completedSteps: { work_type: true, ccsc: true },
        stepData: {
          ccsc: {
            signatureData: 'sig',
            sections: {
              OH: {
                items: [
                  { number: 1, checked: true },
                  { number: 2, checked: false }, // non-safety
                  { number: 3, checked: true },
                ],
              },
            },
          },
        },
      };

      const result = await utvac.validate(submission, { job: { pmNumber: '123' } });
      expect(result.warnings.some(w => w.code === 'CCSC_INCOMPLETE_OH')).toBe(true);
    });
  });
});
