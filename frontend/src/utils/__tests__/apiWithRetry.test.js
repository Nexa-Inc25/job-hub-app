/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * API With Retry Tests
 * 
 * Tests exponential backoff retry logic, error classification, and error messages.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getErrorMessage, apiWithRetry, retryGet, retryPost, retryPut, retryPatch, retryDelete } from '../apiWithRetry';

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

import api from '../../api';

describe('API With Retry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('apiWithRetry', () => {
    it('should make a successful GET request', async () => {
      api.get.mockResolvedValue({ data: { items: [] } });
      
      const result = await apiWithRetry('get', '/api/jobs');
      
      expect(api.get).toHaveBeenCalledWith('/api/jobs', {});
      expect(result.data.items).toEqual([]);
    });

    it('should make a successful POST request', async () => {
      api.post.mockResolvedValue({ data: { id: '123' } });
      
      const result = await apiWithRetry('post', '/api/jobs', { title: 'New Job' });
      
      expect(api.post).toHaveBeenCalledWith('/api/jobs', { title: 'New Job' }, {});
      expect(result.data.id).toBe('123');
    });

    it('should make a successful PUT request', async () => {
      api.put.mockResolvedValue({ data: { updated: true } });
      
      await apiWithRetry('put', '/api/jobs/1', { title: 'Updated' });
      
      expect(api.put).toHaveBeenCalledWith('/api/jobs/1', { title: 'Updated' }, {});
    });

    it('should make a successful PATCH request', async () => {
      api.patch.mockResolvedValue({ data: { patched: true } });
      
      await apiWithRetry('patch', '/api/jobs/1', { status: 'done' });
      
      expect(api.patch).toHaveBeenCalledWith('/api/jobs/1', { status: 'done' }, {});
    });

    it('should make a successful DELETE request', async () => {
      api.delete.mockResolvedValue({ data: { deleted: true } });
      
      await apiWithRetry('delete', '/api/jobs/1');
      
      expect(api.delete).toHaveBeenCalledWith('/api/jobs/1', {});
    });

    it('should throw on unsupported method', async () => {
      await expect(apiWithRetry('HEAD', '/api/test')).rejects.toThrow('Unsupported method');
    });

    it('should throw non-retryable errors immediately', async () => {
      api.get.mockRejectedValue({ response: { status: 400, data: { error: 'Bad request' } } });
      
      await expect(apiWithRetry('get', '/api/test')).rejects.toEqual(
        expect.objectContaining({ response: { status: 400, data: { error: 'Bad request' } } })
      );
      expect(api.get).toHaveBeenCalledTimes(1);
    });

    it('should retry on 500 server errors', async () => {
      api.get
        .mockRejectedValueOnce({ response: { status: 500 }, message: 'Server error' })
        .mockResolvedValueOnce({ data: { success: true } });

      const result = await apiWithRetry('get', '/api/test', null, {
        retry: { maxRetries: 2, baseDelay: 10, maxDelay: 50 }
      });

      expect(api.get).toHaveBeenCalledTimes(2);
      expect(result.data.success).toBe(true);
    });

    it('should retry on network errors', async () => {
      api.get
        .mockRejectedValueOnce({ message: 'Network Error' })
        .mockResolvedValueOnce({ data: { ok: true } });

      await apiWithRetry('get', '/api/test', null, {
        retry: { maxRetries: 2, baseDelay: 10, maxDelay: 50 }
      });

      expect(api.get).toHaveBeenCalledTimes(2);
    });

    it('should exhaust retries then throw', async () => {
      api.get.mockRejectedValue({ response: { status: 503 }, message: 'Service unavailable' });

      await expect(
        apiWithRetry('get', '/api/test', null, {
          retry: { maxRetries: 2, baseDelay: 10, maxDelay: 50 }
        })
      ).rejects.toEqual(expect.objectContaining({ message: 'Service unavailable' }));

      expect(api.get).toHaveBeenCalledTimes(3); // initial + 2 retries
    });
  });

  describe('Convenience methods', () => {
    it('retryGet should call apiWithRetry with GET', async () => {
      api.get.mockResolvedValue({ data: {} });
      await retryGet('/api/test');
      expect(api.get).toHaveBeenCalled();
    });

    it('retryPost should call apiWithRetry with POST', async () => {
      api.post.mockResolvedValue({ data: {} });
      await retryPost('/api/test', { data: 1 });
      expect(api.post).toHaveBeenCalled();
    });

    it('retryPut should call apiWithRetry with PUT', async () => {
      api.put.mockResolvedValue({ data: {} });
      await retryPut('/api/test', { data: 1 });
      expect(api.put).toHaveBeenCalled();
    });

    it('retryPatch should call apiWithRetry with PATCH', async () => {
      api.patch.mockResolvedValue({ data: {} });
      await retryPatch('/api/test', { data: 1 });
      expect(api.patch).toHaveBeenCalled();
    });

    it('retryDelete should call apiWithRetry with DELETE', async () => {
      api.delete.mockResolvedValue({ data: {} });
      await retryDelete('/api/test');
      expect(api.delete).toHaveBeenCalled();
    });
  });

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

