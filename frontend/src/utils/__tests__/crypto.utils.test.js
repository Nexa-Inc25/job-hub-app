/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Crypto Utils Tests
 * 
 * Tests SHA-256 hashing, payload checksums, JWT decode, and token expiry.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  sha256,
  generatePayloadChecksum,
  generateDigitalReceiptHash,
  decodeJWT,
  isTokenExpired,
  getTokenTTL,
  verifyPayloadChecksum,
} from '../crypto.utils';

// Mock crypto.subtle for testing
beforeAll(() => {
  if (!globalThis.crypto?.subtle?.digest) {
    const { webcrypto } = require('node:crypto');
    Object.defineProperty(globalThis, 'crypto', {
      value: webcrypto,
      writable: true,
    });
  }
});

describe('Crypto Utils', () => {

  describe('sha256', () => {
    it('should produce consistent hash for same input', async () => {
      const hash1 = await sha256('hello world');
      const hash2 = await sha256('hello world');
      expect(hash1).toBe(hash2);
    });

    it('should produce different hash for different input', async () => {
      const hash1 = await sha256('hello');
      const hash2 = await sha256('world');
      expect(hash1).not.toBe(hash2);
    });

    it('should return 64 character hex string', async () => {
      const hash = await sha256('test');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('generatePayloadChecksum', () => {
    it('should produce consistent checksum regardless of key order', async () => {
      const checksum1 = await generatePayloadChecksum({ a: 1, b: 2 });
      const checksum2 = await generatePayloadChecksum({ b: 2, a: 1 });
      expect(checksum1).toBe(checksum2);
    });

    it('should produce different checksum for different data', async () => {
      const checksum1 = await generatePayloadChecksum({ a: 1 });
      const checksum2 = await generatePayloadChecksum({ a: 2 });
      expect(checksum1).not.toBe(checksum2);
    });
  });

  describe('generateDigitalReceiptHash', () => {
    it('should generate hash from receipt data', async () => {
      const hash = await generateDigitalReceiptHash({
        gps: { lat: 37.7749, lng: -122.4194, accuracy: 10 },
        timestamp: '2026-02-10T12:00:00Z',
        photoHash: 'abc123',
        deviceId: 'device-1',
      });
      expect(hash).toHaveLength(64);
    });

    it('should handle missing GPS data', async () => {
      const hash = await generateDigitalReceiptHash({
        timestamp: '2026-02-10T12:00:00Z',
      });
      expect(hash).toHaveLength(64);
    });
  });

  describe('decodeJWT', () => {
    // Create a mock JWT (header.payload.signature)
    const createMockJWT = (payload) => {
      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const body = btoa(JSON.stringify(payload));
      return `${header}.${body}.fake-signature`;
    };

    it('should decode valid JWT payload', () => {
      const token = createMockJWT({ userId: '123', role: 'admin', exp: 9999999999 });
      const decoded = decodeJWT(token);
      expect(decoded.userId).toBe('123');
      expect(decoded.role).toBe('admin');
    });

    it('should return null for null/empty token', () => {
      expect(decodeJWT(null)).toBeNull();
      expect(decodeJWT('')).toBeNull();
    });

    it('should return null for invalid token format', () => {
      expect(decodeJWT('not.a.valid.jwt.token')).toBeNull();
      expect(decodeJWT('single-segment')).toBeNull();
    });

    it('should return null for malformed base64', () => {
      expect(decodeJWT('a.!!!invalid!!!.c')).toBeNull();
    });
  });

  describe('isTokenExpired', () => {
    const createMockJWT = (payload) => {
      const header = btoa(JSON.stringify({ alg: 'HS256' }));
      const body = btoa(JSON.stringify(payload));
      return `${header}.${body}.sig`;
    };

    it('should return true for expired token', () => {
      const expired = createMockJWT({ exp: Math.floor(Date.now() / 1000) - 3600 });
      expect(isTokenExpired(expired)).toBe(true);
    });

    it('should return false for valid token', () => {
      const valid = createMockJWT({ exp: Math.floor(Date.now() / 1000) + 3600 });
      expect(isTokenExpired(valid)).toBe(false);
    });

    it('should consider buffer time', () => {
      // Token expires in 30 seconds, but buffer is 60 seconds
      const nearExpiry = createMockJWT({ exp: Math.floor(Date.now() / 1000) + 30 });
      expect(isTokenExpired(nearExpiry, 60)).toBe(true);
    });

    it('should return true for null token', () => {
      expect(isTokenExpired(null)).toBe(true);
    });

    it('should return true for token without exp', () => {
      const noExp = createMockJWT({ userId: '123' });
      expect(isTokenExpired(noExp)).toBe(true);
    });
  });

  describe('getTokenTTL', () => {
    const createMockJWT = (payload) => {
      const header = btoa(JSON.stringify({ alg: 'HS256' }));
      const body = btoa(JSON.stringify(payload));
      return `${header}.${body}.sig`;
    };

    it('should return remaining time in milliseconds', () => {
      const token = createMockJWT({ exp: Math.floor(Date.now() / 1000) + 3600 });
      const ttl = getTokenTTL(token);
      expect(ttl).toBeGreaterThan(3500000); // ~3600 seconds
      expect(ttl).toBeLessThanOrEqual(3600000);
    });

    it('should return 0 for expired token', () => {
      const expired = createMockJWT({ exp: Math.floor(Date.now() / 1000) - 100 });
      expect(getTokenTTL(expired)).toBe(0);
    });

    it('should return 0 for null token', () => {
      expect(getTokenTTL(null)).toBe(0);
    });
  });

  describe('verifyPayloadChecksum', () => {
    it('should return true for matching checksum', async () => {
      const payload = { amount: 100, units: 5 };
      const checksum = await generatePayloadChecksum(payload);
      const isValid = await verifyPayloadChecksum(payload, checksum);
      expect(isValid).toBe(true);
    });

    it('should return false for tampered payload', async () => {
      const payload = { amount: 100, units: 5 };
      const checksum = await generatePayloadChecksum(payload);
      const isValid = await verifyPayloadChecksum({ amount: 999, units: 5 }, checksum);
      expect(isValid).toBe(false);
    });
  });
});

