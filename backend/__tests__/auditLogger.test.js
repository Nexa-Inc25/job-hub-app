/**
 * Audit Logger Tests
 * 
 * Tests for audit logging middleware used for PG&E compliance.
 * Verifies that security events are properly logged.
 */

const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');
const { logAuth, logDocument, logJob, logUser, logSecurity, logExport } = require('../middleware/auditLogger');

// Mock Express request
const mockRequest = (overrides = {}) => ({
  ip: '192.168.1.1',
  headers: {
    'user-agent': 'Mozilla/5.0 Test',
    'x-forwarded-for': '10.0.0.1'
  },
  method: 'POST',
  originalUrl: '/api/test',
  path: '/api/test',
  userId: new mongoose.Types.ObjectId(),
  userEmail: 'test@example.com',
  userName: 'Test User',
  userRole: 'gf',
  companyId: new mongoose.Types.ObjectId(),
  ...overrides
});

describe('Audit Logger', () => {
  
  // ==================== Auth Logging ====================
  describe('logAuth', () => {
    it('should log successful login', async () => {
      const req = mockRequest();
      const user = {
        _id: new mongoose.Types.ObjectId(),
        email: 'user@test.com',
        role: 'gf',
        isAdmin: false
      };
      
      await logAuth.loginSuccess(req, user);
      
      const logs = await AuditLog.find({ action: 'LOGIN_SUCCESS' }).sort({ timestamp: -1 }).limit(1);
      expect(logs.length).toBe(1);
      expect(logs[0].resourceName).toBe('user@test.com');
    });
    
    it('should log failed login with warning severity', async () => {
      const req = mockRequest();
      
      await logAuth.loginFailed(req, 'bad@test.com', 'Invalid credentials');
      
      const logs = await AuditLog.find({ action: 'LOGIN_FAILED' }).sort({ timestamp: -1 }).limit(1);
      expect(logs.length).toBe(1);
      expect(logs[0].severity).toBe('warning');
      expect(logs[0].success).toBe(false);
    });
    
    it('should log logout', async () => {
      const req = mockRequest();
      
      await logAuth.logout(req);
      
      const logs = await AuditLog.find({ action: 'LOGOUT' }).sort({ timestamp: -1 }).limit(1);
      expect(logs.length).toBe(1);
    });
    
    it('should log password change with warning severity', async () => {
      const req = mockRequest();
      const userId = new mongoose.Types.ObjectId();
      
      await logAuth.passwordChange(req, userId);
      
      const logs = await AuditLog.find({ action: 'PASSWORD_CHANGE' }).sort({ timestamp: -1 }).limit(1);
      expect(logs.length).toBe(1);
      expect(logs[0].severity).toBe('warning');
    });
    
    it('should log account lockout as critical', async () => {
      const req = mockRequest();
      
      await logAuth.accountLocked(req, 'locked@test.com', 5);
      
      const logs = await AuditLog.find({ action: 'ACCOUNT_LOCKED' }).sort({ timestamp: -1 }).limit(1);
      expect(logs.length).toBe(1);
      expect(logs[0].severity).toBe('critical');
    });
  });
  
  // ==================== Document Logging ====================
  describe('logDocument', () => {
    it('should log document upload', async () => {
      const req = mockRequest();
      const jobId = new mongoose.Types.ObjectId();
      
      await logDocument.upload(req, 'test.pdf', jobId, 'ACI/Documents');
      
      const logs = await AuditLog.find({ action: 'DOCUMENT_UPLOAD' }).sort({ timestamp: -1 }).limit(1);
      expect(logs.length).toBe(1);
      expect(logs[0].resourceName).toBe('test.pdf');
    });
    
    it('should log document view', async () => {
      const req = mockRequest();
      const doc = {
        _id: new mongoose.Types.ObjectId(),
        name: 'report.pdf',
        folder: 'ACI/Documents'
      };
      const jobId = new mongoose.Types.ObjectId();
      
      await logDocument.view(req, doc, jobId);
      
      const logs = await AuditLog.find({ action: 'DOCUMENT_VIEW' }).sort({ timestamp: -1 }).limit(1);
      expect(logs.length).toBe(1);
    });
    
    it('should log document delete', async () => {
      const req = mockRequest();
      const doc = {
        _id: new mongoose.Types.ObjectId(),
        name: 'old.pdf'
      };
      const jobId = new mongoose.Types.ObjectId();
      
      await logDocument.delete(req, doc, jobId);
      
      const logs = await AuditLog.find({ action: 'DOCUMENT_DELETE' }).sort({ timestamp: -1 }).limit(1);
      expect(logs.length).toBe(1);
      expect(logs[0].severity).toBe('warning');
    });
    
    it('should log document approval', async () => {
      const req = mockRequest();
      const doc = {
        _id: new mongoose.Types.ObjectId(),
        name: 'PM-12345_FaceSheet.pdf'
      };
      const jobId = new mongoose.Types.ObjectId();
      
      await logDocument.approve(req, doc, jobId);
      
      const logs = await AuditLog.find({ action: 'DOCUMENT_APPROVE' }).sort({ timestamp: -1 }).limit(1);
      expect(logs.length).toBe(1);
    });
    
    it('should log document rejection', async () => {
      const req = mockRequest();
      const doc = {
        _id: new mongoose.Types.ObjectId(),
        name: 'draft.pdf'
      };
      const jobId = new mongoose.Types.ObjectId();
      
      await logDocument.reject(req, doc, jobId, 'Missing signature');
      
      const logs = await AuditLog.find({ action: 'DOCUMENT_REJECT' }).sort({ timestamp: -1 }).limit(1);
      expect(logs.length).toBe(1);
      expect(logs[0].details.reason).toBe('Missing signature');
    });
  });
  
  // ==================== Job Logging ====================
  describe('logJob', () => {
    it('should log job creation', async () => {
      const req = mockRequest();
      const job = {
        _id: new mongoose.Types.ObjectId(),
        pmNumber: 'PM-12345',
        title: 'Test Job'
      };
      
      await logJob.create(req, job);
      
      const logs = await AuditLog.find({ action: 'JOB_CREATE' }).sort({ timestamp: -1 }).limit(1);
      expect(logs.length).toBe(1);
      expect(logs[0].resourceName).toBe('PM-12345');
    });
    
    it('should log job status change', async () => {
      const req = mockRequest();
      const job = {
        _id: new mongoose.Types.ObjectId(),
        pmNumber: 'PM-12345'
      };
      
      await logJob.statusChange(req, job, 'new', 'pre_fielding');
      
      const logs = await AuditLog.find({ action: 'JOB_STATUS_CHANGE' }).sort({ timestamp: -1 }).limit(1);
      expect(logs.length).toBe(1);
      expect(logs[0].details.oldStatus).toBe('new');
      expect(logs[0].details.newStatus).toBe('pre_fielding');
    });
    
    it('should log job deletion', async () => {
      const req = mockRequest();
      const jobId = new mongoose.Types.ObjectId();
      
      await logJob.delete(req, jobId, 'PM-12345');
      
      const logs = await AuditLog.find({ action: 'JOB_DELETE' }).sort({ timestamp: -1 }).limit(1);
      expect(logs.length).toBe(1);
      expect(logs[0].severity).toBe('warning');
    });
  });
  
  // ==================== User Logging ====================
  describe('logUser', () => {
    it('should log user creation', async () => {
      const req = mockRequest();
      const user = {
        _id: new mongoose.Types.ObjectId(),
        email: 'new@test.com',
        role: 'foreman'
      };
      
      await logUser.create(req, user);
      
      const logs = await AuditLog.find({ action: 'USER_CREATE' }).sort({ timestamp: -1 }).limit(1);
      expect(logs.length).toBe(1);
      expect(logs[0].details.role).toBe('foreman');
    });
    
    it('should log role change as warning', async () => {
      const req = mockRequest();
      const user = {
        _id: new mongoose.Types.ObjectId(),
        email: 'rolechange@test.com'
      };
      
      await logUser.roleChange(req, user, 'crew', 'gf');
      
      const logs = await AuditLog.find({ action: 'USER_ROLE_CHANGE' }).sort({ timestamp: -1 }).limit(1);
      expect(logs.length).toBe(1);
      expect(logs[0].severity).toBe('warning');
    });
    
    it('should log user deletion as warning', async () => {
      const req = mockRequest();
      const userId = new mongoose.Types.ObjectId();
      
      await logUser.delete(req, userId, 'inactive@test.com');
      
      const logs = await AuditLog.find({ action: 'USER_DELETE' }).sort({ timestamp: -1 }).limit(1);
      expect(logs.length).toBe(1);
      expect(logs[0].severity).toBe('warning');
    });
  });
  
  // ==================== Security Logging ====================
  describe('logSecurity', () => {
    it('should log rate limit exceeded as warning', async () => {
      const req = mockRequest();
      
      await logSecurity.rateLimitExceeded(req);
      
      const logs = await AuditLog.find({ action: 'RATE_LIMIT_EXCEEDED' }).sort({ timestamp: -1 }).limit(1);
      expect(logs.length).toBe(1);
      expect(logs[0].severity).toBe('warning');
    });
    
    it('should log unauthorized access as critical', async () => {
      const req = mockRequest();
      
      await logSecurity.unauthorizedAccess(req, { type: 'job', id: new mongoose.Types.ObjectId() });
      
      const logs = await AuditLog.find({ action: 'UNAUTHORIZED_ACCESS_ATTEMPT' }).sort({ timestamp: -1 }).limit(1);
      expect(logs.length).toBe(1);
      expect(logs[0].severity).toBe('critical');
    });
    
    it('should log suspicious activity as critical', async () => {
      const req = mockRequest();
      
      await logSecurity.suspiciousActivity(req, 'Multiple failed login attempts from different IPs');
      
      const logs = await AuditLog.find({ action: 'SUSPICIOUS_ACTIVITY' }).sort({ timestamp: -1 }).limit(1);
      expect(logs.length).toBe(1);
      expect(logs[0].severity).toBe('critical');
    });
  });
  
  // ==================== Export Logging ====================
  describe('logExport', () => {
    it('should log email share', async () => {
      const req = mockRequest();
      const jobId = new mongoose.Types.ObjectId();
      
      await logExport.email(req, jobId, 'ACI/Documents', ['test@example.com']);
      
      const logs = await AuditLog.find({ action: 'EMAIL_SHARE' }).sort({ timestamp: -1 }).limit(1);
      expect(logs.length).toBe(1);
      expect(logs[0].details.recipientCount).toBe(1);
    });
    
    it('should log bulk download', async () => {
      const req = mockRequest();
      const jobId = new mongoose.Types.ObjectId();
      
      await logExport.bulkDownload(req, jobId, 5);
      
      const logs = await AuditLog.find({ action: 'BULK_DOWNLOAD' }).sort({ timestamp: -1 }).limit(1);
      expect(logs.length).toBe(1);
      expect(logs[0].details.fileCount).toBe(5);
    });
  });
  
  // ==================== Request Metadata ====================
  describe('Request Metadata', () => {
    it('should capture IP address', async () => {
      const req = mockRequest({ ip: '203.0.113.50' });
      
      await logAuth.logout(req);
      
      const logs = await AuditLog.find({ action: 'LOGOUT' }).sort({ timestamp: -1 }).limit(1);
      expect(logs[0].ipAddress).toBe('203.0.113.50');
    });
    
    it('should capture user agent', async () => {
      const req = mockRequest({
        headers: { 'user-agent': 'CustomApp/1.0' }
      });
      
      await logAuth.logout(req);
      
      const logs = await AuditLog.find({ action: 'LOGOUT' }).sort({ timestamp: -1 }).limit(1);
      expect(logs[0].userAgent).toBe('CustomApp/1.0');
    });
    
    it('should capture user info from request', async () => {
      const userId = new mongoose.Types.ObjectId();
      const companyId = new mongoose.Types.ObjectId();
      const req = mockRequest({
        userId,
        userEmail: 'captured@test.com',
        userName: 'Captured User',
        userRole: 'pm',
        companyId
      });
      
      await logAuth.logout(req);
      
      const logs = await AuditLog.find({ action: 'LOGOUT' }).sort({ timestamp: -1 }).limit(1);
      expect(logs[0].userId.toString()).toBe(userId.toString());
      expect(logs[0].userRole).toBe('pm');
    });
  });
});

