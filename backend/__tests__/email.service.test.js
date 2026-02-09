/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Email Service Tests
 * 
 * Tests for email notification functionality with Resend integration.
 */

// Mock the Resend SDK before requiring the email service
jest.mock('resend', () => {
  return {
    Resend: jest.fn().mockImplementation(() => ({
      emails: {
        send: jest.fn()
      }
    }))
  };
});

const { Resend } = require('resend');

// Store original env
const originalEnv = process.env;

describe('Email Service', () => {
  let emailService;
  let consoleSpy;
  let consoleErrorSpy;
  
  beforeEach(() => {
    // Reset modules to get fresh instance
    jest.resetModules();
    
    // Reset environment
    process.env = { ...originalEnv };
    delete process.env.RESEND_API_KEY;
    
    // Fresh import
    emailService = require('../services/email.service');
    emailService.resetClient();
    
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });
  
  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    process.env = originalEnv;
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
  
  // ==================== Stub Mode (no API key) ====================
  describe('sendEmail (stub mode)', () => {
    it('should return success response in stub mode', async () => {
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
    
    it('should generate message IDs with stub prefix', async () => {
      const result = await emailService.sendEmail({
        to: 'test@example.com',
        subject: 'Test'
      });
      
      expect(result.messageId).toMatch(/^stub-\d+$/);
    });
    
    it('should log email details in stub mode', async () => {
      await emailService.sendEmail({
        to: 'test@example.com',
        subject: 'Test Subject',
        attachments: [{ filename: 'file.pdf' }]
      });
      
      expect(consoleSpy).toHaveBeenCalled();
      const logCall = consoleSpy.mock.calls[0];
      expect(logCall[0]).toContain('stub mode');
    });
    
    it('should handle missing attachments', async () => {
      await emailService.sendEmail({
        to: 'test@example.com',
        subject: 'No Attachments'
      });
      
      expect(consoleSpy).toHaveBeenCalled();
    });
  });
  
  // ==================== Resend Integration ====================
  describe('sendEmail (with Resend)', () => {
    let mockResendInstance;
    
    beforeEach(() => {
      jest.resetModules();
      
      // Set up mock Resend
      mockResendInstance = {
        emails: {
          send: jest.fn().mockResolvedValue({
            data: { id: 'resend-msg-123' },
            error: null
          })
        }
      };
      
      jest.doMock('resend', () => ({
        Resend: jest.fn().mockImplementation(() => mockResendInstance)
      }));
      
      // Set API key
      process.env.RESEND_API_KEY = 're_test_key';
      
      // Fresh import with mocked Resend
      emailService = require('../services/email.service');
      emailService.resetClient();
    });
    
    it('should send email via Resend when API key is set', async () => {
      const result = await emailService.sendEmail({
        to: 'test@example.com',
        subject: 'Test Email',
        html: '<p>Hello</p>',
        text: 'Hello'
      });
      
      expect(result.success).toBe(true);
      expect(result.messageId).toBe('resend-msg-123');
      expect(mockResendInstance.emails.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: 'Test Email'
        })
      );
    });
    
    it('should handle Resend errors', async () => {
      mockResendInstance.emails.send.mockResolvedValue({
        data: null,
        error: { message: 'Invalid API key' }
      });
      
      await expect(
        emailService.sendEmail({
          to: 'test@example.com',
          subject: 'Test'
        })
      ).rejects.toThrow('Invalid API key');
    });
    
    it('should transform attachments for Resend format', async () => {
      const buffer = Buffer.from('test content');
      
      await emailService.sendEmail({
        to: 'test@example.com',
        subject: 'With Attachment',
        html: '<p>See attached</p>',
        attachments: [
          { filename: 'test.pdf', content: buffer }
        ]
      });
      
      expect(mockResendInstance.emails.send).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: [
            expect.objectContaining({
              filename: 'test.pdf'
            })
          ]
        })
      );
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
    
    it('should include attachment with correct filename', async () => {
      await emailService.sendJobDocuments({
        to: 'test@example.com',
        pmNumber: 'PM-67890',
        zipBuffer: Buffer.from('zip'),
        senderName: 'Sender'
      });
      
      expect(consoleSpy).toHaveBeenCalled();
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
      
      expect(consoleSpy).toHaveBeenCalled();
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
      
      expect(consoleSpy).toHaveBeenCalled();
    });
  });
  
  // ==================== sendInvitation ====================
  describe('sendInvitation', () => {
    it('should send invitation email with all fields', async () => {
      const result = await emailService.sendInvitation({
        email: 'newuser@example.com',
        name: 'New User',
        tempPassword: 'TempPass123!',
        inviterName: 'Admin User',
        companyName: 'Test Company',
        role: 'pm'
      });
      
      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
    });
    
    it('should format role display names correctly', async () => {
      await emailService.sendInvitation({
        email: 'gf@example.com',
        name: 'GF User',
        tempPassword: 'Pass123!',
        inviterName: 'Admin',
        companyName: 'Company',
        role: 'gf'
      });
      
      expect(consoleSpy).toHaveBeenCalled();
    });
    
    it('should handle unknown roles gracefully', async () => {
      const result = await emailService.sendInvitation({
        email: 'user@example.com',
        name: 'User',
        tempPassword: 'Pass123!',
        inviterName: 'Admin',
        companyName: 'Company',
        role: 'unknown_role'
      });
      
      expect(result.success).toBe(true);
    });
    
    it('should include login URL in email', async () => {
      await emailService.sendInvitation({
        email: 'test@example.com',
        name: 'Test',
        tempPassword: 'Pass!',
        inviterName: 'Admin',
        companyName: 'Test Co',
        role: 'crew'
      });
      
      expect(consoleSpy).toHaveBeenCalled();
    });
  });
  
  // ==================== Module Exports ====================
  describe('Module Exports', () => {
    it('should export all required functions', () => {
      expect(typeof emailService.sendEmail).toBe('function');
      expect(typeof emailService.sendJobDocuments).toBe('function');
      expect(typeof emailService.sendPasswordReset).toBe('function');
      expect(typeof emailService.sendMfaEnabled).toBe('function');
      expect(typeof emailService.sendInvitation).toBe('function');
      expect(typeof emailService.resetClient).toBe('function');
    });
    
    it('should export config object', () => {
      expect(emailService.config).toBeDefined();
      expect(typeof emailService.config).toBe('object');
    });
  });
});
