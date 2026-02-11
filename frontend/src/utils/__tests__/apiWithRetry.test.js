/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * API With Retry Tests
 * 
 * Tests exponential backoff retry logic, error classification, and error messages.
 */

import { describe, it, expect, vi } from 'vitest';
import { getErrorMessage } from '../apiWithRetry';

// Mock the api module
vi.mock('../../api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('API With Retry', () => {

  describe('getErrorMessage', () => {
    it('should handle offline errors', () => {
      const originalOnLine = navigator.onLine;
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
      
      const msg = getErrorMessage({ message: 'Network Error' });
      expect(msg).toContain('offline');
      
      Object.defineProperty(navigator, 'onLine', { value: originalOnLine, writable: true });
    });

    it('should handle timeout errors', () => {
      const msg = getErrorMessage({ message: 'timeout of 60000ms exceeded' });
      expect(msg).toContain('timed out');
    });

    it('should handle generic network errors', () => {
      Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
      const msg = getErrorMessage({ message: 'something failed' });
      expect(msg).toContain('connect');
    });

    it('should handle 400 errors', () => {
      const msg = getErrorMessage({ response: { status: 400, data: {} } });
      expect(msg).toContain('Invalid request');
    });

    it('should handle 401 errors', () => {
      const msg = getErrorMessage({ response: { status: 401, data: {} } });
      expect(msg).toContain('session');
    });

    it('should handle 403 errors', () => {
      const msg = getErrorMessage({ response: { status: 403, data: {} } });
      expect(msg).toContain('permission');
    });

    it('should handle 404 errors', () => {
      const msg = getErrorMessage({ response: { status: 404, data: {} } });
      expect(msg).toContain('not found');
    });

    it('should handle 409 conflicts', () => {
      const msg = getErrorMessage({ response: { status: 409, data: {} } });
      expect(msg).toContain('conflicts');
    });

    it('should handle 413 payload too large', () => {
      const msg = getErrorMessage({ response: { status: 413, data: {} } });
      expect(msg).toContain('too large');
    });

    it('should handle 429 rate limiting', () => {
      const msg = getErrorMessage({ response: { status: 429, data: {} } });
      expect(msg).toContain('Too many requests');
    });

    it('should handle 500 server errors', () => {
      const msg = getErrorMessage({ response: { status: 500, data: {} } });
      expect(msg).toContain('server error');
    });

    it('should handle 502/503/504 errors', () => {
      for (const status of [502, 503, 504]) {
        const msg = getErrorMessage({ response: { status, data: {} } });
        expect(msg).toContain('temporarily unavailable');
      }
    });

    it('should use server message when available', () => {
      const msg = getErrorMessage({
        response: { status: 400, data: { error: 'Custom error from server' } },
      });
      expect(msg).toBe('Custom error from server');
    });

    it('should handle unknown status codes', () => {
      const msg = getErrorMessage({ response: { status: 418, data: {} } });
      expect(msg).toContain('418');
    });
  });
});

