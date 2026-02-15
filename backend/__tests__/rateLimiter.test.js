/** Copyright (c) 2024-2026 FieldLedger. All Rights Reserved. */
/**
 * Per-Route Rate Limiter Factory Tests
 */

const { createRateLimiter } = require('../middleware/security');

describe('createRateLimiter', () => {
  it('should return an express middleware function', () => {
    const limiter = createRateLimiter();
    expect(typeof limiter).toBe('function');
  });

  it('should accept custom windowMs and max', () => {
    // Should not throw
    const limiter = createRateLimiter({ windowMs: 30000, max: 5 });
    expect(typeof limiter).toBe('function');
  });

  it('should accept a custom message', () => {
    const limiter = createRateLimiter({ message: 'Rate limited!' });
    expect(typeof limiter).toBe('function');
  });

  it('should accept a skip function', () => {
    const skip = (req) => req.path === '/api/health';
    const limiter = createRateLimiter({ skip });
    expect(typeof limiter).toBe('function');
  });

  it('should accept a custom keyGenerator', () => {
    const keyGenerator = (req) => req.headers['x-api-key'] || req.ip;
    const limiter = createRateLimiter({ keyGenerator });
    expect(typeof limiter).toBe('function');
  });

  it('should use sensible defaults', () => {
    // The returned middleware should be an express-rate-limit instance
    const limiter = createRateLimiter();
    // express-rate-limit v7+ returns a function with length 3 (req, res, next)
    expect(limiter.length).toBeGreaterThanOrEqual(3);
  });
});
