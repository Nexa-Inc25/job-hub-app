/**
 * Admin Controller Tests
 * 
 * Tests for administrative endpoints including audit logs and user management.
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { createTestApp } = require('./helpers/testApp');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');

describe('Admin Controller', () => {
  let app;
  let adminUser;
  let regularUser;
  let companyId;
  
  beforeEach(async () => {
    app = createTestApp();
    companyId = new mongoose.Types.ObjectId();
    
    // Create admin user
    adminUser = await User.create({
      name: 'Admin User',
      email: `admin-${Date.now()}@test.com`,
      password: 'Admin123!@#',
      role: 'admin',
      isAdmin: true,
      companyId
    });
    
    // Create regular user
    regularUser = await User.create({
      name: 'Regular User',
      email: `regular-${Date.now()}@test.com`,
      password: 'Regular123!@#',
      role: 'gf',
      companyId
    });
    
    // Create some audit logs
    await Promise.all([
      AuditLog.log({ action: 'LOGIN_SUCCESS', userId: adminUser._id, companyId, severity: 'info' }),
      AuditLog.log({ action: 'DOCUMENT_VIEW', userId: regularUser._id, companyId, severity: 'info' }),
      AuditLog.log({ action: 'LOGIN_FAILED', userId: regularUser._id, companyId, severity: 'warning' }),
      AuditLog.log({ action: 'SUSPICIOUS_ACTIVITY', companyId, severity: 'critical' })
    ]);
  });
  
  // ==================== Audit Logs ====================
  describe('GET /api/admin/audit-logs', () => {
    it('should return audit logs for admin user', async () => {
      const res = await request(app)
        .get('/api/admin/audit-logs')
        .set('X-Test-User-Id', adminUser._id.toString())
        .set('X-Test-Is-Admin', 'true')
        .expect(200);
      
      expect(res.body.logs).toBeDefined();
      expect(res.body.pagination).toBeDefined();
      expect(res.body.pagination.page).toBe(1);
    });
    
    it('should support pagination', async () => {
      const res = await request(app)
        .get('/api/admin/audit-logs?page=1&limit=2')
        .set('X-Test-User-Id', adminUser._id.toString())
        .set('X-Test-Is-Admin', 'true')
        .expect(200);
      
      expect(res.body.logs.length).toBeLessThanOrEqual(2);
      expect(res.body.pagination.limit).toBe(2);
    });
    
    it('should filter by action type', async () => {
      const res = await request(app)
        .get('/api/admin/audit-logs?action=LOGIN_SUCCESS')
        .set('X-Test-User-Id', adminUser._id.toString())
        .set('X-Test-Is-Admin', 'true')
        .expect(200);
      
      expect(res.body.logs.every(log => log.action === 'LOGIN_SUCCESS')).toBe(true);
    });
    
    it('should filter by severity', async () => {
      const res = await request(app)
        .get('/api/admin/audit-logs?severity=critical')
        .set('X-Test-User-Id', adminUser._id.toString())
        .set('X-Test-Is-Admin', 'true')
        .expect(200);
      
      expect(res.body.logs.every(log => log.severity === 'critical')).toBe(true);
    });
    
    it('should reject non-admin users', async () => {
      const res = await request(app)
        .get('/api/admin/audit-logs')
        .set('X-Test-User-Id', regularUser._id.toString())
        .set('X-Test-Is-Admin', 'false')
        .expect(403);
      
      expect(res.body.error).toBe('Admin access required');
    });
  });
  
  // ==================== Audit Stats ====================
  describe('GET /api/admin/audit-stats', () => {
    it('should return audit statistics', async () => {
      const res = await request(app)
        .get('/api/admin/audit-stats')
        .set('X-Test-User-Id', adminUser._id.toString())
        .set('X-Test-Is-Admin', 'true')
        .set('X-Test-Is-Super-Admin', 'true')
        .expect(200);
      
      expect(res.body.period).toBeDefined();
      expect(res.body.actionCounts).toBeDefined();
      expect(res.body.severityCounts).toBeDefined();
      expect(res.body.categoryCounts).toBeDefined();
    });
    
    it('should support custom day range', async () => {
      const res = await request(app)
        .get('/api/admin/audit-stats?days=7')
        .set('X-Test-User-Id', adminUser._id.toString())
        .set('X-Test-Is-Admin', 'true')
        .set('X-Test-Is-Super-Admin', 'true')
        .expect(200);
      
      expect(res.body.period.days).toBe(7);
    });
  });
  
  // ==================== Export Audit Logs ====================
  describe('GET /api/admin/audit-logs/export', () => {
    it('should export audit logs as CSV', async () => {
      const res = await request(app)
        .get('/api/admin/audit-logs/export?format=csv')
        .set('X-Test-User-Id', adminUser._id.toString())
        .set('X-Test-Is-Admin', 'true')
        .set('X-Test-Is-Super-Admin', 'true')
        .expect(200);
      
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text).toContain('Timestamp,Action');
    });
    
    it('should export audit logs as JSON', async () => {
      const res = await request(app)
        .get('/api/admin/audit-logs/export?format=json')
        .set('X-Test-User-Id', adminUser._id.toString())
        .set('X-Test-Is-Admin', 'true')
        .set('X-Test-Is-Super-Admin', 'true')
        .expect(200);
      
      expect(res.headers['content-type']).toContain('application/json');
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
  
  // ==================== User Management ====================
  describe('GET /api/admin/users', () => {
    it('should return list of users', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('X-Test-User-Id', adminUser._id.toString())
        .set('X-Test-Is-Admin', 'true')
        .set('X-Test-Is-Super-Admin', 'true')
        .expect(200);
      
      expect(res.body.users).toBeDefined();
      expect(res.body.users.length).toBeGreaterThanOrEqual(2);
    });
    
    it('should not include passwords in response', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('X-Test-User-Id', adminUser._id.toString())
        .set('X-Test-Is-Admin', 'true')
        .set('X-Test-Is-Super-Admin', 'true')
        .expect(200);
      
      res.body.users.forEach(user => {
        expect(user.password).toBeUndefined();
      });
    });
  });
  
  describe('PUT /api/admin/users/:id/role', () => {
    it('should update user role', async () => {
      const res = await request(app)
        .put(`/api/admin/users/${regularUser._id}/role`)
        .set('X-Test-User-Id', adminUser._id.toString())
        .set('X-Test-Is-Admin', 'true')
        .set('X-Test-Is-Super-Admin', 'true')
        .send({ role: 'pm' })
        .expect(200);
      
      expect(res.body.user.role).toBe('pm');
      
      // Verify in database
      const updated = await User.findById(regularUser._id);
      expect(updated.role).toBe('pm');
    });
    
    it('should return 404 for non-existent user', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      
      const res = await request(app)
        .put(`/api/admin/users/${fakeId}/role`)
        .set('X-Test-User-Id', adminUser._id.toString())
        .set('X-Test-Is-Admin', 'true')
        .set('X-Test-Is-Super-Admin', 'true')
        .send({ role: 'pm' })
        .expect(404);
      
      expect(res.body.error).toBe('User not found');
    });
  });
  
  describe('DELETE /api/admin/users/:id', () => {
    it('should deactivate user', async () => {
      const res = await request(app)
        .delete(`/api/admin/users/${regularUser._id}`)
        .set('X-Test-User-Id', adminUser._id.toString())
        .set('X-Test-Is-Admin', 'true')
        .set('X-Test-Is-Super-Admin', 'true')
        .expect(200);
      
      expect(res.body.message).toBe('User deactivated successfully');
    });
    
    it('should prevent self-deactivation', async () => {
      const res = await request(app)
        .delete(`/api/admin/users/${adminUser._id}`)
        .set('X-Test-User-Id', adminUser._id.toString())
        .set('X-Test-Is-Admin', 'true')
        .set('X-Test-Is-Super-Admin', 'true')
        .expect(400);
      
      expect(res.body.error).toBe('Cannot deactivate your own account');
    });
    
    it('should return 404 for non-existent user', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      
      const res = await request(app)
        .delete(`/api/admin/users/${fakeId}`)
        .set('X-Test-User-Id', adminUser._id.toString())
        .set('X-Test-Is-Admin', 'true')
        .set('X-Test-Is-Super-Admin', 'true')
        .expect(404);
      
      expect(res.body.error).toBe('User not found');
    });
  });
});

