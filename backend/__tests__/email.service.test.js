/**
 * Email Service Tests
 * 
 * Tests for email notification functionality.
 */

const emailService = require('../services/email.service');

describe('Email Service', () => {
  let consoleSpy;
  
  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  });
  
  afterEach(() => {
    consoleSpy.mockRestore();
  });
  
  // ==================== Config ====================
  describe('config', () => {
    it('should have default from address', () => {
      expect(emailService.config.from).toBeDefined();
      expect(emailService.config.from).toContain('@');
    });
    
    it('should have default reply-to address', () => {
      expect(emailService.config.replyTo).toBeDefined();
      expect(emailService.config.replyTo).toContain('@');
    });
  });
  
  // ==================== sendEmail ====================
  describe('sendEmail', () => {
    it('should return success response', async () => {
      const result = await emailService.sendEmail({
        to: 'test@example.com',
        subject: 'Test Email',
        html: '<p>Test content</p>',
        text: 'Test content'
      });
      
      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });
    
    it('should generate message IDs with timestamp', async () => {
      const result = await emailService.sendEmail({
        to: 'test@example.com',
        subject: 'Test'
      });
      
      expect(result.messageId).toMatch(/^stub-\d+$/);
    });
    
    it('should log email details', async () => {
      await emailService.sendEmail({
        to: 'test@example.com',
        subject: 'Test Subject',
        attachments: [{ filename: 'file.pdf' }]
      });
      
      expect(consoleSpy).toHaveBeenCalled();
      const logCall = consoleSpy.mock.calls[0][1];
      expect(logCall.to).toBe('test@example.com');
      expect(logCall.subject).toBe('Test Subject');
      expect(logCall.attachmentCount).toBe(1);
    });
    
    it('should handle missing attachments', async () => {
      await emailService.sendEmail({
        to: 'test@example.com',
        subject: 'No Attachments'
      });
      
      const logCall = consoleSpy.mock.calls[0][1];
      expect(logCall.attachmentCount).toBe(0);
    });
  });
  
  // ==================== sendJobDocuments ====================
  describe('sendJobDocuments', () => {
    it('should send job documents with PM number', async () => {
      const result = await emailService.sendJobDocuments({
        to: 'recipient@example.com',
        jobTitle: 'Test Job',
        pmNumber: 'PM-12345',
        zipBuffer: Buffer.from('test zip content'),
        senderName: 'John Doe'
      });
      
      expect(result.success).toBe(true);
    });
    
    it('should use job title when PM number not provided', async () => {
      const result = await emailService.sendJobDocuments({
        to: 'recipient@example.com',
        jobTitle: 'Important Job',
        zipBuffer: Buffer.from('test zip'),
        senderName: 'Jane Doe'
      });
      
      expect(result.success).toBe(true);
    });
    
    it('should log with correct subject', async () => {
      await emailService.sendJobDocuments({
        to: 'test@example.com',
        pmNumber: 'PM-67890',
        zipBuffer: Buffer.from('zip'),
        senderName: 'Sender'
      });
      
      const logCall = consoleSpy.mock.calls[0][1];
      expect(logCall.subject).toContain('PM-67890');
    });
  });
  
  // ==================== sendPasswordReset ====================
  describe('sendPasswordReset', () => {
    it('should send password reset email', async () => {
      const result = await emailService.sendPasswordReset(
        'user@example.com',
        'reset-token-123',
        'https://app.example.com/reset?token=reset-token-123'
      );
      
      expect(result.success).toBe(true);
    });
    
    it('should log password reset details', async () => {
      await emailService.sendPasswordReset(
        'user@example.com',
        'token',
        'https://example.com/reset'
      );
      
      const logCall = consoleSpy.mock.calls[0][1];
      expect(logCall.to).toBe('user@example.com');
      expect(logCall.subject).toContain('Password Reset');
    });
  });
  
  // ==================== sendMfaEnabled ====================
  describe('sendMfaEnabled', () => {
    it('should send MFA enabled confirmation', async () => {
      const result = await emailService.sendMfaEnabled(
        'secure@example.com',
        'John Smith'
      );
      
      expect(result.success).toBe(true);
    });
    
    it('should log MFA notification details', async () => {
      await emailService.sendMfaEnabled(
        'mfa@example.com',
        'Jane Doe'
      );
      
      const logCall = consoleSpy.mock.calls[0][1];
      expect(logCall.to).toBe('mfa@example.com');
      expect(logCall.subject).toContain('Two-Factor Authentication');
    });
  });
  
  // ==================== Module Exports ====================
  describe('Module Exports', () => {
    it('should export all required functions', () => {
      expect(typeof emailService.sendEmail).toBe('function');
      expect(typeof emailService.sendJobDocuments).toBe('function');
      expect(typeof emailService.sendPasswordReset).toBe('function');
      expect(typeof emailService.sendMfaEnabled).toBe('function');
    });
    
    it('should export config object', () => {
      expect(emailService.config).toBeDefined();
      expect(typeof emailService.config).toBe('object');
    });
  });
});

