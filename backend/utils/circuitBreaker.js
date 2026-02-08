/**
 * Circuit Breaker Pattern Implementation
 * 
 * Prevents cascade failures when external services (OpenAI, R2) are down.
 * 
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Service is failing, reject requests immediately (fail fast)
 * - HALF_OPEN: Testing if service has recovered
 * 
 * @module utils/circuitBreaker
 */

// Circuit breaker states
const STATES = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN'
};

/**
 * Circuit Breaker class
 */
class CircuitBreaker {
  /**
   * Create a new circuit breaker
   * @param {string} name - Service name for logging
   * @param {Object} options - Configuration options
   * @param {number} options.failureThreshold - Number of failures before opening (default: 5)
   * @param {number} options.resetTimeout - Time in ms before trying again (default: 60000)
   * @param {number} options.halfOpenRequests - Requests to allow in half-open state (default: 1)
   */
  constructor(name, options = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000; // 1 minute
    this.halfOpenRequests = options.halfOpenRequests || 1;
    
    this.state = STATES.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.lastFailure = null;
    this.halfOpenAttempts = 0;
  }

  /**
   * Check if circuit is open (rejecting requests)
   */
  isOpen() {
    if (this.state === STATES.OPEN) {
      // Check if we should transition to half-open
      if (Date.now() - this.lastFailure >= this.resetTimeout) {
        this.state = STATES.HALF_OPEN;
        this.halfOpenAttempts = 0;
        console.log(`[CircuitBreaker:${this.name}] Transitioning to HALF_OPEN`);
        return false;
      }
      return true;
    }
    return false;
  }

  /**
   * Execute a function through the circuit breaker
   * @param {Function} fn - Async function to execute
   * @returns {Promise} Result of the function
   * @throws {Error} If circuit is open or function fails
   */
  async execute(fn) {
    // Check if circuit is open
    if (this.isOpen()) {
      const error = new Error(`Circuit breaker ${this.name} is OPEN - service unavailable`);
      error.code = 'CIRCUIT_OPEN';
      error.retryAfter = Math.ceil((this.resetTimeout - (Date.now() - this.lastFailure)) / 1000);
      throw error;
    }

    // In half-open state, limit concurrent requests
    if (this.state === STATES.HALF_OPEN) {
      if (this.halfOpenAttempts >= this.halfOpenRequests) {
        const error = new Error(`Circuit breaker ${this.name} is HALF_OPEN - waiting for test request`);
        error.code = 'CIRCUIT_HALF_OPEN';
        throw error;
      }
      this.halfOpenAttempts++;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  /**
   * Handle successful request
   */
  onSuccess() {
    this.failures = 0;
    this.successes++;
    
    if (this.state === STATES.HALF_OPEN) {
      // Recovery confirmed, close the circuit
      console.log(`[CircuitBreaker:${this.name}] Recovery confirmed, closing circuit`);
      this.state = STATES.CLOSED;
      this.halfOpenAttempts = 0;
    }
  }

  /**
   * Handle failed request
   * @param {Error} error - The error that occurred
   */
  onFailure(error) {
    this.failures++;
    this.lastFailure = Date.now();
    this.successes = 0;

    if (this.state === STATES.HALF_OPEN) {
      // Failed during recovery test, reopen
      console.warn(`[CircuitBreaker:${this.name}] Recovery failed, reopening circuit: ${error.message}`);
      this.state = STATES.OPEN;
      this.halfOpenAttempts = 0;
    } else if (this.failures >= this.failureThreshold) {
      // Too many failures, open the circuit
      console.warn(`[CircuitBreaker:${this.name}] Threshold reached (${this.failures}), opening circuit`);
      this.state = STATES.OPEN;
    }
  }

  /**
   * Get current circuit state
   */
  getState() {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailure: this.lastFailure,
      isOpen: this.state === STATES.OPEN
    };
  }

  /**
   * Manually reset the circuit breaker
   */
  reset() {
    this.state = STATES.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.lastFailure = null;
    this.halfOpenAttempts = 0;
    console.log(`[CircuitBreaker:${this.name}] Manually reset`);
  }
}

// Pre-configured circuit breakers for common services
const openaiBreaker = new CircuitBreaker('openai', {
  failureThreshold: 3,
  resetTimeout: 30000 // 30 seconds for AI (they recover quickly)
});

const r2Breaker = new CircuitBreaker('r2', {
  failureThreshold: 5,
  resetTimeout: 60000 // 1 minute for storage
});

/**
 * Create a new circuit breaker
 * @param {string} name - Service name
 * @param {Object} options - Configuration options
 * @returns {CircuitBreaker} New circuit breaker instance
 */
function createCircuitBreaker(name, options) {
  return new CircuitBreaker(name, options);
}

/**
 * Get health status of all circuit breakers
 */
function getCircuitBreakerHealth() {
  return {
    openai: openaiBreaker.getState(),
    r2: r2Breaker.getState()
  };
}

module.exports = {
  CircuitBreaker,
  createCircuitBreaker,
  openaiBreaker,
  r2Breaker,
  getCircuitBreakerHealth,
  STATES
};

