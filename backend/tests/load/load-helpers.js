/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Artillery Load Test Helpers
 * 
 * Custom functions for load testing scenarios
 */

module.exports = {
  /**
   * Set authorization header from captured token
   */
  setAuthHeader: function(requestParams, context, ee, next) {
    if (context.vars.authToken) {
      requestParams.headers = requestParams.headers || {};
      requestParams.headers['Authorization'] = `Bearer ${context.vars.authToken}`;
    }
    return next();
  },

  /**
   * Generate random unit entry data
   */
  generateUnitData: function(context, events, done) {
    const itemCodes = ['POLE-40-2', 'TRENCH-STD', 'WIRE-PRIMARY', 'XFMR-25KVA', 'METER-RESI'];
    const randomItem = itemCodes[Math.floor(Math.random() * itemCodes.length)];
    
    context.vars.unitData = {
      itemCode: randomItem,
      quantity: Math.floor(Math.random() * 10) + 1,
      location: {
        latitude: 37.7749 + (Math.random() - 0.5) * 0.1,
        longitude: -122.4194 + (Math.random() - 0.5) * 0.1,
        accuracy: Math.random() * 20 + 5
      },
      notes: `Load test entry at ${new Date().toISOString()}`
    };
    
    return done();
  },

  /**
   * Log response time for custom metrics
   */
  logResponseTime: function(requestParams, response, context, ee, next) {
    if (response.timings) {
      ee.emit('customStat', {
        stat: 'response_time_custom',
        value: response.timings.phases.total
      });
    }
    return next();
  },

  /**
   * Check if we got a valid auth token
   */
  checkAuthToken: function(requestParams, response, context, ee, next) {
    if (!context.vars.authToken) {
      ee.emit('error', 'Failed to capture auth token');
    }
    return next();
  }
};

