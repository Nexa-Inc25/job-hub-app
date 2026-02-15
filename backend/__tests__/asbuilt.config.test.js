/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 *
 * As-Built config validation tests.
 * Ensures PGE and SCE seed configs have all required fields
 * and follow the UtilityAsBuiltConfig schema.
 */

const { getPGEConfig } = require('../seeds/pge-asbuilt-config');
const { getSCEConfig } = require('../seeds/sce-asbuilt-config');

const REQUIRED_TOP_LEVEL = [
  'utilityName', 'utilityCode', 'procedureId', 'procedureName',
  'procedureVersion', 'effectiveDate', 'isActive',
  'pageRanges', 'workTypes', 'checklist', 'symbolLibrary',
  'colorConventions', 'validationRules', 'namingConventions',
];

const _SECTION_TYPES = [
  'face_sheet', 'crew_instructions', 'crew_materials', 'equipment_info',
  'construction_sketch', 'circuit_map', 'permits', 'tcp',
  'billing_form', 'ccsc',
];

function testConfigStructure(getConfig, utilityCode) {
  describe(`${utilityCode} config structure`, () => {
    const config = getConfig();

    test('has all required top-level fields', () => {
      for (const field of REQUIRED_TOP_LEVEL) {
        expect(config).toHaveProperty(field);
      }
    });

    test('utilityCode matches expected', () => {
      expect(config.utilityCode).toBe(utilityCode);
    });

    test('isActive is true', () => {
      expect(config.isActive).toBe(true);
    });

    test('effectiveDate is a valid Date', () => {
      expect(config.effectiveDate).toBeInstanceOf(Date);
    });

    // Page ranges
    describe('pageRanges', () => {
      test('is a non-empty array', () => {
        expect(Array.isArray(config.pageRanges)).toBe(true);
        expect(config.pageRanges.length).toBeGreaterThan(0);
      });

      test('each range has required fields', () => {
        for (const range of config.pageRanges) {
          expect(range).toHaveProperty('sectionType');
          expect(range).toHaveProperty('label');
          expect(range).toHaveProperty('start');
          expect(range).toHaveProperty('end');
          expect(typeof range.start).toBe('number');
          expect(typeof range.end).toBe('number');
          expect(range.end).toBeGreaterThanOrEqual(range.start);
        }
      });

      test('covers at least construction_sketch and ccsc', () => {
        const types = config.pageRanges.map(r => r.sectionType);
        expect(types).toContain('construction_sketch');
        expect(types).toContain('ccsc');
      });
    });

    // Work types
    describe('workTypes', () => {
      test('is a non-empty array', () => {
        expect(Array.isArray(config.workTypes)).toBe(true);
        expect(config.workTypes.length).toBeGreaterThan(0);
      });

      test('each work type has code, label, and requiredDocs', () => {
        for (const wt of config.workTypes) {
          expect(wt).toHaveProperty('code');
          expect(wt).toHaveProperty('label');
          expect(wt).toHaveProperty('requiredDocs');
          expect(Array.isArray(wt.requiredDocs)).toBe(true);
          expect(wt.requiredDocs.length).toBeGreaterThan(0);
        }
      });

      test('work type codes are unique', () => {
        const codes = config.workTypes.map(wt => wt.code);
        expect(new Set(codes).size).toBe(codes.length);
      });
    });

    // Checklist
    describe('checklist', () => {
      test('has formId and formName', () => {
        expect(config.checklist).toHaveProperty('formId');
        expect(config.checklist).toHaveProperty('formName');
      });

      test('has sections with items', () => {
        expect(Array.isArray(config.checklist.sections)).toBe(true);
        expect(config.checklist.sections.length).toBeGreaterThan(0);

        for (const section of config.checklist.sections) {
          expect(section).toHaveProperty('code');
          expect(section).toHaveProperty('label');
          expect(Array.isArray(section.items)).toBe(true);
          expect(section.items.length).toBeGreaterThan(0);
        }
      });

      test('each item has number and text', () => {
        for (const section of config.checklist.sections) {
          for (const item of section.items) {
            expect(item).toHaveProperty('number');
            expect(item).toHaveProperty('text');
            expect(typeof item.number).toBe('number');
            expect(typeof item.text).toBe('string');
          }
        }
      });

      test('has at least some safety-critical items', () => {
        const safetyCritical = config.checklist.sections
          .flatMap(s => s.items)
          .filter(i => i.safetyCritical);
        expect(safetyCritical.length).toBeGreaterThan(0);
      });
    });

    // Symbol library
    describe('symbolLibrary', () => {
      test('has standardId and symbols array', () => {
        expect(config.symbolLibrary).toHaveProperty('standardId');
        expect(Array.isArray(config.symbolLibrary.symbols)).toBe(true);
        expect(config.symbolLibrary.symbols.length).toBeGreaterThan(0);
      });

      test('each symbol has code, label, category, and svgPath', () => {
        for (const sym of config.symbolLibrary.symbols) {
          expect(sym).toHaveProperty('code');
          expect(sym).toHaveProperty('label');
          expect(sym).toHaveProperty('category');
          expect(sym).toHaveProperty('svgPath');
          expect(typeof sym.svgPath).toBe('string');
          expect(sym.svgPath.length).toBeGreaterThan(0);
        }
      });

      test('has symbols from multiple categories', () => {
        const categories = new Set(config.symbolLibrary.symbols.map(s => s.category));
        expect(categories.size).toBeGreaterThanOrEqual(3);
      });
    });

    // Color conventions
    describe('colorConventions', () => {
      test('has red, blue, and black', () => {
        const colors = config.colorConventions.map(c => c.color);
        expect(colors).toContain('red');
        expect(colors).toContain('blue');
        expect(colors).toContain('black');
      });

      test('each convention has hex, label, and meaning', () => {
        for (const cc of config.colorConventions) {
          expect(cc).toHaveProperty('hex');
          expect(cc).toHaveProperty('label');
          expect(cc).toHaveProperty('meaning');
          expect(cc.hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
        }
      });
    });

    // Validation rules
    describe('validationRules', () => {
      test('is a non-empty array', () => {
        expect(Array.isArray(config.validationRules)).toBe(true);
        expect(config.validationRules.length).toBeGreaterThan(0);
      });

      test('each rule has code, target, rule, description, severity', () => {
        for (const rule of config.validationRules) {
          expect(rule).toHaveProperty('code');
          expect(rule).toHaveProperty('target');
          expect(rule).toHaveProperty('rule');
          expect(rule).toHaveProperty('description');
          expect(rule).toHaveProperty('severity');
          expect(['error', 'warning']).toContain(rule.severity);
        }
      });
    });

    // Naming conventions
    describe('namingConventions', () => {
      test('is a non-empty array', () => {
        expect(Array.isArray(config.namingConventions)).toBe(true);
        expect(config.namingConventions.length).toBeGreaterThan(0);
      });

      test('each convention has documentType and pattern', () => {
        for (const nc of config.namingConventions) {
          expect(nc).toHaveProperty('documentType');
          expect(nc).toHaveProperty('pattern');
          expect(typeof nc.pattern).toBe('string');
        }
      });
    });
  });
}

// Test both utility configs
testConfigStructure(getPGEConfig, 'PGE');
testConfigStructure(getSCEConfig, 'SCE');

// Cross-utility tests
describe('Multi-utility config compatibility', () => {
  const pge = getPGEConfig();
  const sce = getSCEConfig();

  test('utility codes are different', () => {
    expect(pge.utilityCode).not.toBe(sce.utilityCode);
  });

  test('both have the same color convention colors (red/blue/black)', () => {
    const pgeColors = pge.colorConventions.map(c => c.color).sort();
    const sceColors = sce.colorConventions.map(c => c.color).sort();
    expect(pgeColors).toEqual(sceColors);
  });

  test('symbol category enums are compatible', () => {
    const validCategories = ['structure', 'device', 'conductor', 'land', 'service', 'underground', 'marker'];
    for (const sym of [...pge.symbolLibrary.symbols, ...sce.symbolLibrary.symbols]) {
      expect(validCategories).toContain(sym.category);
    }
  });
});
