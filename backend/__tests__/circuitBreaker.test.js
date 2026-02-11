/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Circuit Breaker Utility Tests
 * 
 * Tests the circuit breaker pattern for external service resilience.
 */

const { CircuitBreaker, createCircuitBreaker, STATES, getCircuitBreakerHealth } = require('../utils/circuitBreaker');

describe('CircuitBreaker', () => {
  let breaker;

  beforeEach(() => {
    breaker = new CircuitBreaker('test-service', {
      failureThreshold: 3,
      resetTimeout: 100, // Fast timeout for testing
      halfOpenRequests: 1,
    });
  });

  describe('Initial State', () => {
    it('should start in CLOSED state', () => {
      expect(breaker.state).toBe(STATES.CLOSED);
      expect(breaker.failures).toBe(0);
    });

    it('should not be open initially', () => {
      expect(breaker.isOpen()).toBe(false);
    });
  });

  describe('CLOSED State', () => {
    it('should execute functions normally', async () => {
      const result = await breaker.execute(() => Promise.resolve('success'));
      expect(result).toBe('success');
      expect(breaker.state).toBe(STATES.CLOSED);
    });

    it('should track failures', async () => {
      try { await breaker.execute(() => Promise.reject(new Error('fail'))); } catch (_e) { /* expected */ }
      expect(breaker.failures).toBe(1);
      expect(breaker.state).toBe(STATES.CLOSED);
    });

    it('should reset failure count on success', async () => {
      try { await breaker.execute(() => Promise.reject(new Error('fail'))); } catch (_e) { /* expected */ }
      expect(breaker.failures).toBe(1);
      await breaker.execute(() => Promise.resolve('ok'));
      expect(breaker.failures).toBe(0);
    });
  });

  describe('State Transitions', () => {
    it('should open after reaching failure threshold', async () => {
      for (let i = 0; i < 3; i++) {
        try { await breaker.execute(() => Promise.reject(new Error('fail'))); } catch (_e) { /* expected */ }
      }
      expect(breaker.state).toBe(STATES.OPEN);
    });

    it('should reject immediately when OPEN', async () => {
      for (let i = 0; i < 3; i++) {
        try { await breaker.execute(() => Promise.reject(new Error('fail'))); } catch (_e) { /* expected */ }
      }

      await expect(
        breaker.execute(() => Promise.resolve('should not run'))
      ).rejects.toThrow('OPEN');
    });

    it('should transition to HALF_OPEN after reset timeout', async () => {
      for (let i = 0; i < 3; i++) {
        try { await breaker.execute(() => Promise.reject(new Error('fail'))); } catch (_e) { /* expected */ }
      }
      expect(breaker.state).toBe(STATES.OPEN);

      // Wait for reset timeout
      await new Promise(r => setTimeout(r, 150));
      expect(breaker.isOpen()).toBe(false);
      expect(breaker.state).toBe(STATES.HALF_OPEN);
    });

    it('should close when HALF_OPEN request succeeds', async () => {
      for (let i = 0; i < 3; i++) {
        try { await breaker.execute(() => Promise.reject(new Error('fail'))); } catch (_e) { /* expected */ }
      }

      await new Promise(r => setTimeout(r, 150));
      await breaker.execute(() => Promise.resolve('recovered'));
      expect(breaker.state).toBe(STATES.CLOSED);
    });

    it('should reopen when HALF_OPEN request fails', async () => {
      for (let i = 0; i < 3; i++) {
        try { await breaker.execute(() => Promise.reject(new Error('fail'))); } catch (_e) { /* expected */ }
      }

      await new Promise(r => setTimeout(r, 150));
      try {
        await breaker.execute(() => Promise.reject(new Error('still failing')));
      } catch (_e) { /* expected */ }
      expect(breaker.state).toBe(STATES.OPEN);
    });
  });

  describe('getState', () => {
    it('should return current state info', () => {
      const state = breaker.getState();
      expect(state).toEqual({
        name: 'test-service',
        state: 'CLOSED',
        failures: 0,
        successes: 0,
        lastFailure: null,
        isOpen: false,
      });
    });
  });

  describe('reset', () => {
    it('should reset circuit to CLOSED', async () => {
      for (let i = 0; i < 3; i++) {
        try { await breaker.execute(() => Promise.reject(new Error('fail'))); } catch (_e) { /* expected */ }
      }
      expect(breaker.state).toBe(STATES.OPEN);
      breaker.reset();
      expect(breaker.state).toBe(STATES.CLOSED);
      expect(breaker.failures).toBe(0);
    });
  });

  describe('createCircuitBreaker', () => {
    it('should create a new instance with options', () => {
      const cb = createCircuitBreaker('new-service', { failureThreshold: 10 });
      expect(cb.name).toBe('new-service');
      expect(cb.failureThreshold).toBe(10);
    });
  });

  describe('getCircuitBreakerHealth', () => {
    it('should return health of pre-configured breakers', () => {
      const health = getCircuitBreakerHealth();
      expect(health).toHaveProperty('openai');
      expect(health).toHaveProperty('r2');
      expect(health.openai.state).toBe('CLOSED');
    });
  });

  describe('Error Properties', () => {
    it('should include CIRCUIT_OPEN error code when open', async () => {
      for (let i = 0; i < 3; i++) {
        try { await breaker.execute(() => Promise.reject(new Error('fail'))); } catch (_e) { /* expected */ }
      }

      await expect(breaker.execute(() => Promise.resolve())).rejects.toMatchObject({
        code: 'CIRCUIT_OPEN',
      });
    });
  });
});

