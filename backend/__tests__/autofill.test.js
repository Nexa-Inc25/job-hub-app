/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Auto-Fill Fuzzy Matching Tests
 *
 * Tests for the fuzzy field name matching, field type detection,
 * and value formatting in documentAutoFill.js
 */

const {
  normalizeFieldName,
  fuzzyMatchFieldName,
  detectFieldType,
  formatFieldValue,
  diceSimilarity,
  FIELD_ALIASES,
  getDocumentTypes,
  DOCUMENT_TEMPLATES,
} = require('../utils/documentAutoFill');

describe('Auto-Fill: normalizeFieldName', () => {
  it('should lowercase and strip punctuation', () => {
    expect(normalizeFieldName('PM#')).toBe('pm');
    expect(normalizeFieldName('PM Number')).toBe('pm number');
    expect(normalizeFieldName('PM_Number')).toBe('pm number');
    expect(normalizeFieldName('PM-Number')).toBe('pm number');
    expect(normalizeFieldName('PM.Number')).toBe('pm number');
  });

  it('should collapse whitespace', () => {
    expect(normalizeFieldName('PM   Number')).toBe('pm number');
    expect(normalizeFieldName('  PM  #  ')).toBe('pm');
  });

  it('should handle empty and null', () => {
    expect(normalizeFieldName('')).toBe('');
    expect(normalizeFieldName(null)).toBe('');
    expect(normalizeFieldName(undefined)).toBe('');
  });

  it('should strip non-alphanumeric characters', () => {
    expect(normalizeFieldName('Field@Name!')).toBe('fieldname');
    expect(normalizeFieldName('(PO) Number')).toBe('po number');
  });
});

describe('Auto-Fill: diceSimilarity', () => {
  it('should return 1 for identical strings', () => {
    expect(diceSimilarity('hello', 'hello')).toBe(1);
  });

  it('should return 0 for completely different strings', () => {
    expect(diceSimilarity('abc', 'xyz')).toBe(0);
  });

  it('should return a value between 0 and 1 for partial matches', () => {
    const sim = diceSimilarity('pm number', 'pm no');
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });

  it('should handle short strings gracefully', () => {
    expect(diceSimilarity('a', 'b')).toBe(0);
    expect(diceSimilarity('ab', 'ab')).toBe(1);
  });
});

describe('Auto-Fill: fuzzyMatchFieldName', () => {
  it('should exact-match known aliases', () => {
    expect(fuzzyMatchFieldName('PM Number')).toEqual({ path: 'pmNumber', confidence: 1 });
    expect(fuzzyMatchFieldName('PM#')).toEqual({ path: 'pmNumber', confidence: 1 });
    expect(fuzzyMatchFieldName('WO Number')).toEqual({ path: 'woNumber', confidence: 1 });
    expect(fuzzyMatchFieldName('Work Order')).toEqual({ path: 'woNumber', confidence: 1 });
    expect(fuzzyMatchFieldName('Address')).toEqual({ path: 'address', confidence: 1 });
    expect(fuzzyMatchFieldName('City')).toEqual({ path: 'city', confidence: 1 });
  });

  it('should match variations of PM number', () => {
    const variations = ['PM#', 'PM Number', 'PM_Number', 'PM-Number', 'PM NO.', 'PM No', 'pm'];
    for (const name of variations) {
      const result = fuzzyMatchFieldName(name);
      expect(result.path).toBe('pmNumber');
      expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    }
  });

  it('should match foreman-related fields', () => {
    const result1 = fuzzyMatchFieldName('Foreman Name');
    expect(result1.path).toBe('user.name');
    expect(result1.confidence).toBeGreaterThanOrEqual(0.6);

    const result2 = fuzzyMatchFieldName('GF Name');
    expect(result2.path).toBe('user.name');
    expect(result2.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it('should match date-related fields', () => {
    const result = fuzzyMatchFieldName('Date');
    expect(result.path).toBe('__context_today');
    expect(result.confidence).toBe(1);
  });

  it('should return null path for unrecognised fields', () => {
    const result = fuzzyMatchFieldName('Completely Unknown Field XYZ');
    expect(result.path).toBe(null);
    expect(result.confidence).toBe(0);
  });

  it('should handle empty input', () => {
    expect(fuzzyMatchFieldName('')).toEqual({ path: null, confidence: 0 });
  });

  it('should match Work Order Number', () => {
    const result = fuzzyMatchFieldName('Work Order Number');
    expect(result.path).toBe('woNumber');
    expect(result.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it('should match PO Number', () => {
    const result = fuzzyMatchFieldName('PO Number');
    expect(result.path).toBe('poNumber');
    expect(result.confidence).toBeGreaterThanOrEqual(0.6);
  });
});

describe('Auto-Fill: detectFieldType', () => {
  it('should detect date fields by name', () => {
    expect(detectFieldType('Start Date')).toBe('date');
    expect(detectFieldType('date_of_birth')).toBe('date');
    expect(detectFieldType('Day')).toBe('date');
  });

  it('should detect date fields by value', () => {
    expect(detectFieldType('some_field', '2026-01-15')).toBe('date');
    expect(detectFieldType('some_field', '01/15/2026')).toBe('date');
  });

  it('should detect phone fields', () => {
    expect(detectFieldType('Phone Number')).toBe('phone');
    expect(detectFieldType('Emergency_Tel')).toBe('phone');
    expect(detectFieldType('Mobile')).toBe('phone');
  });

  it('should detect email fields', () => {
    expect(detectFieldType('Email Address')).toBe('email');
    expect(detectFieldType('E-Mail')).toBe('email');
  });

  it('should detect number fields', () => {
    expect(detectFieldType('Total Amount')).toBe('number');
    expect(detectFieldType('Quantity')).toBe('number');
    expect(detectFieldType('Hours Worked')).toBe('number');
    expect(detectFieldType('PM Number')).toBe('number'); // "number" in name
  });

  it('should detect number by value', () => {
    expect(detectFieldType('something', 42)).toBe('number');
    expect(detectFieldType('something', '3.14')).toBe('number');
  });

  it('should default to text', () => {
    expect(detectFieldType('Name')).toBe('text');
    expect(detectFieldType('Description')).toBe('text');
  });
});

describe('Auto-Fill: formatFieldValue', () => {
  it('should format dates with default format', () => {
    const result = formatFieldValue(new Date(2026, 1, 14), 'date'); // Feb 14, 2026
    expect(result).toBe('02/14/2026');
  });

  it('should format dates with custom format', () => {
    const result = formatFieldValue(new Date(2026, 1, 14), 'date', { dateFormat: 'YYYY-MM-DD' });
    expect(result).toBe('2026-02-14');
  });

  it('should return string for invalid dates', () => {
    expect(formatFieldValue('not a date', 'date')).toBe('not a date');
  });

  it('should format numbers', () => {
    expect(formatFieldValue(42, 'number')).toBe('42');
    expect(formatFieldValue(3.14159, 'number')).toBe('3.14');
  });

  it('should format currency numbers', () => {
    expect(formatFieldValue(1234.5, 'number', { isCurrency: true })).toBe('1234.50');
  });

  it('should format phone numbers', () => {
    expect(formatFieldValue('5551234567', 'phone')).toBe('(555) 123-4567');
    expect(formatFieldValue('123', 'phone')).toBe('123'); // too short, pass through
  });

  it('should pass through text values', () => {
    expect(formatFieldValue('Hello', 'text')).toBe('Hello');
  });

  it('should return null for null input', () => {
    expect(formatFieldValue(null, 'text')).toBe(null);
    expect(formatFieldValue(undefined, 'date')).toBe(null);
  });
});

describe('Auto-Fill: DOCUMENT_TEMPLATES and getDocumentTypes', () => {
  it('should have all expected document types', () => {
    const types = getDocumentTypes();
    const keys = types.map(t => t.key);
    expect(keys).toContain('CWC');
    expect(keys).toContain('AS_BUILT');
    expect(keys).toContain('DAILY_REPORT');
    expect(keys).toContain('PRE_FIELD_REPORT');
  });

  it('should report field counts correctly', () => {
    const types = getDocumentTypes();
    for (const type of types) {
      expect(type.fieldCount).toBeGreaterThan(0);
      expect(type.humanFieldCount).toBeGreaterThanOrEqual(0);
      expect(type.humanFieldCount).toBeLessThanOrEqual(type.fieldCount);
    }
  });

  it('DOCUMENT_TEMPLATES should have valid field definitions', () => {
    for (const [_key, template] of Object.entries(DOCUMENT_TEMPLATES)) {
      expect(template.name).toBeTruthy();
      expect(Object.keys(template.fields).length).toBeGreaterThan(0);
      for (const [, fieldDef] of Object.entries(template.fields)) {
        expect(['job', 'user', 'context', 'pattern', 'human']).toContain(fieldDef.source);
        expect(typeof fieldDef.confidence).toBe('number');
      }
    }
  });

  it('FIELD_ALIASES should map to valid paths', () => {
    for (const [alias, path] of Object.entries(FIELD_ALIASES)) {
      expect(typeof alias).toBe('string');
      expect(typeof path).toBe('string');
      expect(alias.length).toBeGreaterThan(0);
      expect(path.length).toBeGreaterThan(0);
    }
  });
});
