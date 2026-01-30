/**
 * MFA (Multi-Factor Authentication) Tests
 * 
 * Tests for MFA utility functions including secret generation,
 * QR code generation, and token verification.
 */

const mfa = require('../utils/mfa');

describe('MFA Utilities', () => {
  
  // ==================== Secret Generation ====================
  describe('generateMFASecret', () => {
    it('should generate a secret with base32 encoding', async () => {
      const result = await mfa.generateMFASecret('test@example.com');
      
      expect(result).toBeDefined();
      expect(result.secret).toBeDefined();
      expect(typeof result.secret).toBe('string');
      // Base32 characters only
      expect(result.secret).toMatch(/^[A-Z2-7]+$/);
    });
    
    it('should generate unique secrets each time', async () => {
      const result1 = await mfa.generateMFASecret('test1@example.com');
      const result2 = await mfa.generateMFASecret('test2@example.com');
      
      expect(result1.secret).not.toBe(result2.secret);
    });
    
    it('should include otpauth URL', async () => {
      const result = await mfa.generateMFASecret('test@example.com');
      
      expect(result.otpauthUrl).toBeDefined();
      expect(result.otpauthUrl).toContain('otpauth://totp/');
      // Email is URL-encoded (@ becomes %40)
      expect(result.otpauthUrl).toContain('test%40example.com');
    });
    
    it('should include QR code data URL', async () => {
      const result = await mfa.generateMFASecret('test@example.com');
      
      expect(result.qrCodeDataUrl).toBeDefined();
      expect(result.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    });
  });
  
  // ==================== Token Verification ====================
  describe('verifyMFAToken', () => {
    it('should verify a valid TOTP token', async () => {
      // Generate a secret and get the current valid token
      const result = await mfa.generateMFASecret('test@example.com');
      const secret = result.secret;
      
      // Use otpauth library to generate current token
      const { TOTP, Secret } = require('otpauth');
      const totp = new TOTP({
        secret: Secret.fromBase32(secret),
        digits: 6,
        period: 30
      });
      const validToken = totp.generate();
      
      const isValid = mfa.verifyMFAToken(validToken, secret);
      
      expect(isValid).toBe(true);
    });
    
    it('should reject an invalid token', async () => {
      const result = await mfa.generateMFASecret('test@example.com');
      
      const isValid = mfa.verifyMFAToken('000000', result.secret);
      
      expect(isValid).toBe(false);
    });
    
    it('should reject empty token', async () => {
      const result = await mfa.generateMFASecret('test@example.com');
      
      expect(mfa.verifyMFAToken('', result.secret)).toBe(false);
      expect(mfa.verifyMFAToken(null, result.secret)).toBe(false);
    });
    
    it('should reject when secret is missing', () => {
      expect(mfa.verifyMFAToken('123456', null)).toBe(false);
      expect(mfa.verifyMFAToken('123456', '')).toBe(false);
    });
  });
  
  // ==================== Backup Codes ====================
  describe('generateBackupCodes', () => {
    it('should generate 10 backup codes by default', () => {
      const codes = mfa.generateBackupCodes();
      
      expect(Array.isArray(codes)).toBe(true);
      expect(codes.length).toBe(10);
    });
    
    it('should generate specified number of codes', () => {
      const codes = mfa.generateBackupCodes(5);
      
      expect(codes.length).toBe(5);
    });
    
    it('should generate codes with correct structure', () => {
      const codes = mfa.generateBackupCodes();
      
      for (const codeObj of codes) {
        expect(codeObj).toHaveProperty('code');
        expect(codeObj).toHaveProperty('used');
        expect(codeObj.used).toBe(false);
        // Format: XXXX-XXXX
        expect(codeObj.code).toMatch(/^[A-F0-9]{4}-[A-F0-9]{4}$/);
      }
    });
    
    it('should generate unique codes', () => {
      const codes = mfa.generateBackupCodes();
      const codeStrings = codes.map(c => c.code);
      const uniqueCodes = new Set(codeStrings);
      
      expect(uniqueCodes.size).toBe(codes.length);
    });
  });
  
  // ==================== Backup Code Hashing ====================
  describe('hashBackupCode', () => {
    it('should hash a backup code', () => {
      const code = 'ABCD-1234';
      const hash = mfa.hashBackupCode(code);
      
      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64); // SHA256 hex = 64 chars
    });
    
    it('should normalize dashes and case', () => {
      const hash1 = mfa.hashBackupCode('ABCD-1234');
      const hash2 = mfa.hashBackupCode('abcd1234');
      const hash3 = mfa.hashBackupCode('AbCd-1234');
      
      // All should produce same hash
      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });
    
    it('should produce different hashes for different codes', () => {
      const hash1 = mfa.hashBackupCode('ABCD-1234');
      const hash2 = mfa.hashBackupCode('EFGH-5678');
      
      expect(hash1).not.toBe(hash2);
    });
  });
  
  // ==================== Backup Code Verification ====================
  describe('verifyBackupCode', () => {
    it('should verify a valid backup code', () => {
      // Generate codes, hash them, then verify
      const plainCodes = ['ABCD-1234', 'EFGH-5678', 'IJKL-9012'];
      const storedCodes = plainCodes.map(code => ({
        code: mfa.hashBackupCode(code),
        used: false
      }));
      
      const result = mfa.verifyBackupCode('ABCD-1234', storedCodes);
      
      expect(result).toBe(0); // First index
    });
    
    it('should return -1 for invalid code', () => {
      const storedCodes = [
        { code: mfa.hashBackupCode('ABCD-1234'), used: false }
      ];
      
      const result = mfa.verifyBackupCode('WRONG-CODE', storedCodes);
      
      expect(result).toBe(-1);
    });
    
    it('should return -1 for already used code', () => {
      const storedCodes = [
        { code: mfa.hashBackupCode('ABCD-1234'), used: true }
      ];
      
      const result = mfa.verifyBackupCode('ABCD-1234', storedCodes);
      
      expect(result).toBe(-1);
    });
    
    it('should handle empty inputs', () => {
      expect(mfa.verifyBackupCode('', [])).toBe(-1);
      expect(mfa.verifyBackupCode(null, [])).toBe(-1);
      expect(mfa.verifyBackupCode('ABCD-1234', null)).toBe(-1);
      expect(mfa.verifyBackupCode('ABCD-1234', [])).toBe(-1);
    });
    
    it('should be case-insensitive', () => {
      const storedCodes = [
        { code: mfa.hashBackupCode('ABCD-1234'), used: false }
      ];
      
      const result = mfa.verifyBackupCode('abcd-1234', storedCodes);
      
      expect(result).toBe(0);
    });
  });
  
  // ==================== Device ID ====================
  describe('generateDeviceId', () => {
    it('should generate device ID from request headers', () => {
      const mockReq = {
        headers: {
          'user-agent': 'Mozilla/5.0 Test Browser',
          'accept-language': 'en-US'
        },
        ip: '192.168.1.1'
      };
      
      const deviceId = mfa.generateDeviceId(mockReq);
      
      expect(deviceId).toBeDefined();
      expect(typeof deviceId).toBe('string');
      expect(deviceId.length).toBe(32);
    });
    
    it('should generate same ID for same device', () => {
      const mockReq = {
        headers: {
          'user-agent': 'Mozilla/5.0 Test Browser',
          'accept-language': 'en-US'
        },
        ip: '192.168.1.1'
      };
      
      const id1 = mfa.generateDeviceId(mockReq);
      const id2 = mfa.generateDeviceId(mockReq);
      
      expect(id1).toBe(id2);
    });
    
    it('should generate different IDs for different devices', () => {
      const req1 = {
        headers: { 'user-agent': 'Chrome' },
        ip: '192.168.1.1'
      };
      const req2 = {
        headers: { 'user-agent': 'Firefox' },
        ip: '192.168.1.2'
      };
      
      expect(mfa.generateDeviceId(req1)).not.toBe(mfa.generateDeviceId(req2));
    });
  });
  
  // ==================== Trusted Device Check ====================
  describe('isDeviceTrusted', () => {
    it('should return true for trusted device', () => {
      const deviceId = 'abc123';
      const trustedDevices = [
        { deviceId: 'abc123', addedAt: new Date() },
        { deviceId: 'def456', addedAt: new Date() }
      ];
      
      expect(mfa.isDeviceTrusted(deviceId, trustedDevices)).toBe(true);
    });
    
    it('should return false for untrusted device', () => {
      const deviceId = 'xyz789';
      const trustedDevices = [
        { deviceId: 'abc123', addedAt: new Date() }
      ];
      
      expect(mfa.isDeviceTrusted(deviceId, trustedDevices)).toBe(false);
    });
    
    it('should handle empty trusted devices list', () => {
      expect(mfa.isDeviceTrusted('abc123', [])).toBe(false);
      expect(mfa.isDeviceTrusted('abc123', null)).toBe(false);
    });
  });
});
