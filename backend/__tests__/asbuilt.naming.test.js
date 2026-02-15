/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 *
 * NamingConvention unit tests.
 * Tests PG&E SAP naming patterns and multi-utility support.
 */

const naming = require('../services/asbuilt/NamingConvention');

describe('NamingConvention', () => {
  describe('generate', () => {
    test('replaces {PM} placeholder', () => {
      const result = naming.generate('{PM}_ASBUILT', { pmNumber: '35589054' });
      expect(result).toBe('35589054_ASBUILT');
    });

    test('replaces {DATE} with YYYYMMDD', () => {
      // Use noon UTC to avoid timezone date-shift issues
      const result = naming.generate('{PM}_ASBUILT_{DATE}', {
        pmNumber: '35589054',
        date: new Date('2025-02-10T12:00:00Z'),
      });
      expect(result).toBe('35589054_ASBUILT_20250210');
    });

    test('replaces {REV} with revision number', () => {
      const result = naming.generate('{PM}_SKETCH_{REV}', {
        pmNumber: '35589054',
        revision: 0,
      });
      expect(result).toBe('35589054_SKETCH_R0');
    });

    test('replaces {SEQ} with zero-padded sequence', () => {
      const result = naming.generate('{PM}_PHOTO_{SEQ}', {
        pmNumber: '35589054',
        sequence: 3,
      });
      expect(result).toBe('35589054_PHOTO_003');
    });

    test('replaces {NOTIF} placeholder', () => {
      const result = naming.generate('{NOTIF}_ECTAG', { notificationNumber: '119080350' });
      expect(result).toBe('119080350_ECTAG');
    });

    test('replaces {LOC} placeholder', () => {
      const result = naming.generate('{PM}_CCSC_{LOC}', {
        pmNumber: '35589054',
        location: 2,
      });
      expect(result).toBe('35589054_CCSC_2');
    });

    test('replaces {DOC_TYPE} placeholder', () => {
      const result = naming.generate('{PM}_{DOC_TYPE}_{DATE}', {
        pmNumber: '35589054',
        documentType: 'SKETCH',
        date: new Date('2025-03-15T12:00:00Z'),
      });
      expect(result).toBe('35589054_SKETCH_20250315');
    });

    test('cleans up trailing underscores from empty replacements', () => {
      const result = naming.generate('{PM}_{NOTIF}_ASBUILT', { pmNumber: '35589054' });
      // {NOTIF} is empty → should not leave double underscores
      expect(result).not.toContain('__');
      expect(result).toBe('35589054_ASBUILT');
    });

    test('sanitizes special characters from input', () => {
      const result = naming.generate('{PM}_ASBUILT', { pmNumber: 'PM-123/456' });
      // Only alphanumeric, hyphens, underscores allowed
      expect(result).toBe('PM-123456_ASBUILT');
    });

    test('returns fallback name when no pattern provided', () => {
      const result = naming.generate(null, { pmNumber: '35589054', documentType: 'SKETCH' });
      expect(result).toContain('35589054');
      expect(result).toContain('SKETCH');
    });
  });

  describe('generatePackageNames', () => {
    const PGE_CONVENTIONS = [
      { documentType: 'as_built_package', pattern: '{PM}_ASBUILT_{DATE}' },
      { documentType: 'construction_sketch', pattern: '{PM}_SKETCH_{REV}' },
      { documentType: 'ccsc', pattern: '{PM}_CCSC_{LOC}' },
      { documentType: 'ec_tag', pattern: '{NOTIF}_ECTAG' },
      { documentType: 'photos', pattern: '{PM}_PHOTO_{SEQ}' },
    ];

    test('generates names for all document types', () => {
      const names = naming.generatePackageNames(PGE_CONVENTIONS, {
        pmNumber: '35589054',
        notificationNumber: '119080350',
        date: new Date('2025-02-10T12:00:00Z'),
      });

      expect(names.as_built_package).toBe('35589054_ASBUILT_20250210');
      expect(names.construction_sketch).toBe('35589054_SKETCH_R0');
      expect(names.ccsc).toBe('35589054_CCSC_1');
      expect(names.ec_tag).toBe('119080350_ECTAG');
      expect(names.photos).toBe('35589054_PHOTO_001');
    });

    test('handles empty conventions array', () => {
      const names = naming.generatePackageNames([], { pmNumber: '123' });
      expect(Object.keys(names)).toHaveLength(0);
    });

    test('handles null conventions', () => {
      const names = naming.generatePackageNames(null, { pmNumber: '123' });
      expect(Object.keys(names)).toHaveLength(0);
    });
  });

  describe('generateForType', () => {
    const conventions = [
      { documentType: 'ccsc', pattern: '{PM}_CCSC_{LOC}' },
    ];

    test('generates name for a specific document type', () => {
      const result = naming.generateForType(conventions, 'ccsc', { pmNumber: '35589054' });
      expect(result).toBe('35589054_CCSC_1');
    });

    test('returns fallback when document type not found in conventions', () => {
      const result = naming.generateForType(conventions, 'photos', { pmNumber: '35589054' });
      expect(result).toContain('35589054');
      expect(result).toContain('photos');
    });
  });
});
