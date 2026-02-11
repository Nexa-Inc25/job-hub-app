/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Oracle Routes Integration Tests
 * 
 * Tests for Oracle Cloud integration endpoints.
 */

const request = require('supertest');
const express = require('express');
const { createTestUser } = require('./helpers/testApp');
const oracleRoutes = require('../routes/oracle.routes');

// Create test app with Oracle routes
function createOracleTestApp() {
  const app = express();
  app.use(express.json());
  
  // Auth middleware for testing
  app.use((req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.userId;
        req.userRole = decoded.role;
        req.isAdmin = decoded.isAdmin;
        next();
      } catch {
        return res.status(401).json({ error: 'Invalid token' });
      }
    } else if (req.headers['x-test-user-id']) {
      req.userId = req.headers['x-test-user-id'];
      req.isAdmin = req.headers['x-test-is-admin'] === 'true';
      next();
    } else {
      return res.status(401).json({ error: 'No token provided' });
    }
  });
  
  app.use('/api/oracle', oracleRoutes);
  
  return app;
}

describe('Oracle Routes', () => {
  let app;
  let testUser;
  let authToken;
  
  beforeAll(async () => {
    app = createOracleTestApp();
    testUser = await createTestUser({ role: 'admin', isAdmin: true });
    authToken = testUser.token;
  });
  
  describe('GET /api/oracle/status', () => {
    it('should require authentication', async () => {
      const res = await request(app)
        .get('/api/oracle/status');
      
      expect(res.status).toBe(401);
    });
    
    it('should return integration status with proper structure', async () => {
      const res = await request(app)
        .get('/api/oracle/status')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('integrations');
      expect(res.body).toHaveProperty('configuredCount');
      expect(res.body).toHaveProperty('totalCount');
      expect(res.body).toHaveProperty('warnings');
      expect(res.body).toHaveProperty('mockMode');
    });
    
    it('should include all expected integrations', async () => {
      const res = await request(app)
        .get('/api/oracle/status')
        .set('Authorization', `Bearer ${authToken}`);
      
      const { integrations } = res.body;
      expect(integrations).toHaveProperty('unifier');
      expect(integrations).toHaveProperty('eam');
      expect(integrations).toHaveProperty('p6');
      expect(integrations).toHaveProperty('fbdi');
    });
    
    it('should indicate mock mode when integrations are unconfigured', async () => {
      const res = await request(app)
        .get('/api/oracle/status')
        .set('Authorization', `Bearer ${authToken}`);
      
      // In test environment, Oracle adapters should be unconfigured
      expect(res.body.mockMode).toBe(true);
      expect(res.body.warnings.length).toBeGreaterThan(0);
    });
    
    it('should report FBDI as always configured', async () => {
      const res = await request(app)
        .get('/api/oracle/status')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(res.body.integrations.fbdi.configured).toBe(true);
    });
  });
  
  describe('POST /api/oracle/test/:system', () => {
    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/oracle/test/unifier');
      
      expect(res.status).toBe(401);
    });
    
    it('should return not configured for unconfigured systems', async () => {
      const res = await request(app)
        .post('/api/oracle/test/unifier')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body.message).toContain('not configured');
    });
    
    it('should handle unknown system gracefully', async () => {
      const res = await request(app)
        .post('/api/oracle/test/unknown_system')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body.message).toContain('Unknown system');
    });
  });
  
  describe('POST /api/oracle/unifier/upload', () => {
    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/oracle/unifier/upload')
        .send({ projectNumber: 'PM-123', fileName: 'test.pdf' });
      
      expect(res.status).toBe(401);
    });
    
    it('should validate required fields', async () => {
      const res = await request(app)
        .post('/api/oracle/unifier/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});
      
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('required');
    });
    
    it('should return mock response when unconfigured', async () => {
      const res = await request(app)
        .post('/api/oracle/unifier/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          projectNumber: 'PM-12345',
          fileName: 'test.pdf',
          fileContent: 'base64content'
        });
      
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('mock', true);
    });
  });
  
  describe('POST /api/oracle/push-all', () => {
    it('should require pmNumber', async () => {
      const res = await request(app)
        .post('/api/oracle/push-all')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});
      
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('pmNumber');
    });
    
    it('should push to all systems and return combined results', async () => {
      const res = await request(app)
        .post('/api/oracle/push-all')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          pmNumber: 'PM-12345',
          sections: []
        });
      
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('pmNumber', 'PM-12345');
      expect(res.body).toHaveProperty('systems');
      expect(res.body.systems).toHaveProperty('unifier');
      expect(res.body.systems).toHaveProperty('eam');
      expect(res.body.systems).toHaveProperty('p6');
    });
  });
});

