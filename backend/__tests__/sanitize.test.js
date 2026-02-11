/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Sanitize Utility Tests
 * 
 * Tests input sanitization for NoSQL injection and path traversal prevention.
 */

const mongoose = require('mongoose');
const {
  sanitizeString,
  sanitizeObjectId,
  sanitizeEmail,
  sanitizeInt,
  sanitizePagination,
  sanitizePath,
  sanitizeDate,
  sanitizeQueryObject,
  sanitizePmNumber,
  sanitizeSortField,
} = require('../utils/sanitize');

describe('Sanitize Utilities', () => {

  describe('sanitizeString', () => {
    it('should return trimmed string', () => {
      expect(sanitizeString('  hello  ')).toBe('hello');
    });

    it('should return null for null/undefined', () => {
      expect(sanitizeString(null)).toBeNull();
      expect(sanitizeString(undefined)).toBeNull();
    });

    it('should reject objects (injection attempt)', () => {
      expect(sanitizeString({ $gt: '' })).toBeNull();
    });

    it('should reject strings starting with $', () => {
      expect(sanitizeString('$gt')).toBeNull();
    });

    it('should convert numbers to strings', () => {
      expect(sanitizeString(123)).toBe('123');
    });
  });

  describe('sanitizeObjectId', () => {
    it('should return valid ObjectId', () => {
      const id = '507f1f77bcf86cd799439011';
      const result = sanitizeObjectId(id);
      expect(result).toBeInstanceOf(mongoose.Types.ObjectId);
    });

    it('should return null for invalid id', () => {
      expect(sanitizeObjectId('not-valid')).toBeNull();
    });

    it('should return null for objects', () => {
      expect(sanitizeObjectId({ $gt: '' })).toBeNull();
    });

    it('should return null for null', () => {
      expect(sanitizeObjectId(null)).toBeNull();
    });

    it('should accept existing ObjectId instances', () => {
      const id = new mongoose.Types.ObjectId();
      const result = sanitizeObjectId(id);
      expect(result).toBeInstanceOf(mongoose.Types.ObjectId);
    });
  });

  describe('sanitizeEmail', () => {
    it('should accept valid email', () => {
      expect(sanitizeEmail('Test@Example.com')).toBe('test@example.com');
    });

    it('should reject invalid email', () => {
      expect(sanitizeEmail('not-email')).toBeNull();
    });

    it('should reject objects', () => {
      expect(sanitizeEmail({ $gt: '' })).toBeNull();
    });

    it('should return null for null', () => {
      expect(sanitizeEmail(null)).toBeNull();
    });
  });

  describe('sanitizeInt', () => {
    it('should return parsed integer', () => {
      expect(sanitizeInt('42')).toBe(42);
    });

    it('should return default for NaN', () => {
      expect(sanitizeInt('abc', 10)).toBe(10);
    });

    it('should return default for negative', () => {
      expect(sanitizeInt('-5', 0)).toBe(0);
    });

    it('should cap at max', () => {
      expect(sanitizeInt('999', 0, 100)).toBe(100);
    });

    it('should handle zero correctly', () => {
      expect(sanitizeInt('0')).toBe(0);
    });
  });

  describe('sanitizePagination', () => {
    it('should return sanitized pagination', () => {
      const result = sanitizePagination({ page: '2', limit: '50', skip: '100' });
      expect(result).toEqual({ page: 2, limit: 50, skip: 100 });
    });

    it('should use defaults for missing values', () => {
      const result = sanitizePagination({});
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.skip).toBe(0);
    });

    it('should cap limit at 100', () => {
      const result = sanitizePagination({ limit: '999' });
      expect(result.limit).toBe(100);
    });
  });

  describe('sanitizePath', () => {
    it('should return normalized path', () => {
      expect(sanitizePath('folder/file.pdf')).toBe('folder/file.pdf');
    });

    it('should reject path traversal', () => {
      expect(sanitizePath('../../../etc/passwd')).toBeNull();
    });

    it('should reject null bytes', () => {
      const result = sanitizePath('file\0.pdf');
      // After removing null bytes and normalizing
      expect(result).toBe('file.pdf');
    });

    it('should reject non-string input', () => {
      expect(sanitizePath(null)).toBeNull();
      expect(sanitizePath(123)).toBeNull();
    });

    it('should validate against base directory', () => {
      const result = sanitizePath('subdir/file.pdf', '/home/uploads');
      expect(result).toBe('/home/uploads/subdir/file.pdf');
    });

    it('should reject paths escaping base directory', () => {
      const result = sanitizePath('../../etc/passwd', '/home/uploads');
      expect(result).toBeNull();
    });
  });

  describe('sanitizeDate', () => {
    it('should return valid Date object', () => {
      const result = sanitizeDate('2026-02-10');
      expect(result).toBeInstanceOf(Date);
    });

    it('should return null for invalid date', () => {
      expect(sanitizeDate('not-a-date')).toBeNull();
    });

    it('should return null for null', () => {
      expect(sanitizeDate(null)).toBeNull();
    });

    it('should reject MongoDB operator injection', () => {
      expect(sanitizeDate({ $gt: new Date() })).toBeNull();
    });

    it('should accept Date instances', () => {
      const d = new Date();
      expect(sanitizeDate(d)).toEqual(d);
    });
  });

  describe('sanitizeQueryObject', () => {
    it('should remove $ keys', () => {
      const result = sanitizeQueryObject({
        name: 'test',
        $gt: 5,
        $where: 'hack()',
      });
      expect(result).toEqual({ name: 'test' });
    });

    it('should remove prototype pollution keys', () => {
      const result = sanitizeQueryObject({
        __proto__: { isAdmin: true },
        constructor: 'hack',
        prototype: { evil: true },
        name: 'safe',
      });
      expect(result).toEqual({ name: 'safe' });
    });

    it('should recursively sanitize nested objects', () => {
      const result = sanitizeQueryObject({
        user: { name: 'test', $gt: 'hack' },
      });
      expect(result.user).toEqual({ name: 'test' });
    });

    it('should handle non-objects gracefully', () => {
      expect(sanitizeQueryObject(null)).toEqual({});
      expect(sanitizeQueryObject('string')).toEqual({});
    });
  });

  describe('sanitizePmNumber', () => {
    it('should accept valid PM numbers', () => {
      expect(sanitizePmNumber('PM-35440499')).toBe('PM-35440499');
      expect(sanitizePmNumber('PM 12345')).toBe('PM 12345');
    });

    it('should reject special characters', () => {
      expect(sanitizePmNumber('PM-123; DROP TABLE')).toBeNull();
      expect(sanitizePmNumber('PM-123$gt')).toBeNull();
    });
  });

  describe('sanitizeSortField', () => {
    it('should accept default allowed fields', () => {
      expect(sanitizeSortField('createdAt')).toBe('createdAt');
      expect(sanitizeSortField('-updatedAt')).toBe('-updatedAt');
    });

    it('should reject unknown fields', () => {
      expect(sanitizeSortField('password')).toBeNull();
      expect(sanitizeSortField('__v')).toBeNull();
    });

    it('should accept custom allowed fields', () => {
      expect(sanitizeSortField('amount', ['amount', 'date'])).toBe('amount');
    });

    it('should handle descending prefix', () => {
      expect(sanitizeSortField('-name')).toBe('-name');
    });
  });
});

