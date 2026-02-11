/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * URL Validator Utility Tests
 * 
 * Tests SSRF prevention including private IP detection,
 * hostname blocking, and domain allowlist.
 */

const {
  isPrivateIP,
  isAllowedDomain,
  isUrlSafeSync,
  validateUrl,
} = require('../utils/urlValidator');

describe('URL Validator', () => {

  describe('isPrivateIP', () => {
    it('should detect 10.x private range', () => {
      expect(isPrivateIP('10.0.0.1')).toBe(true);
      expect(isPrivateIP('10.255.255.255')).toBe(true);
    });

    it('should detect 172.16-31.x private range', () => {
      expect(isPrivateIP('172.16.0.1')).toBe(true);
      expect(isPrivateIP('172.31.255.255')).toBe(true);
    });

    it('should detect 192.168.x private range', () => {
      expect(isPrivateIP('192.168.1.1')).toBe(true);
    });

    it('should detect localhost/loopback', () => {
      expect(isPrivateIP('127.0.0.1')).toBe(true);
    });

    it('should detect cloud metadata IP', () => {
      expect(isPrivateIP('169.254.169.254')).toBe(true);
    });

    it('should allow public IPs', () => {
      expect(isPrivateIP('8.8.8.8')).toBe(false);
      expect(isPrivateIP('1.1.1.1')).toBe(false);
    });

    it('should detect IPv6 loopback', () => {
      expect(isPrivateIP('::1')).toBe(true);
    });

    it('should detect IPv6 link-local', () => {
      expect(isPrivateIP('fe80::1')).toBe(true);
    });

    it('should detect IPv6 private (fd)', () => {
      expect(isPrivateIP('fd12:3456::1')).toBe(true);
    });
  });

  describe('isAllowedDomain', () => {
    it('should allow fieldledger.io', () => {
      expect(isAllowedDomain('fieldledger.io')).toBe(true);
      expect(isAllowedDomain('api.fieldledger.io')).toBe(true);
    });

    it('should allow R2 subdomains', () => {
      expect(isAllowedDomain('bucket.r2.cloudflarestorage.com')).toBe(true);
    });

    it('should reject unknown domains', () => {
      expect(isAllowedDomain('evil.com')).toBe(false);
      expect(isAllowedDomain('google.com')).toBe(false);
    });
  });

  describe('isUrlSafeSync', () => {
    it('should accept HTTPS URLs to allowed domains', () => {
      expect(isUrlSafeSync('https://api.fieldledger.io/test')).toBe(true);
    });

    it('should reject HTTP by default', () => {
      expect(isUrlSafeSync('http://api.fieldledger.io/test')).toBe(false);
    });

    it('should allow HTTP when configured', () => {
      expect(isUrlSafeSync('http://api.fieldledger.io/test', { allowHttp: true })).toBe(true);
    });

    it('should reject private IPs', () => {
      expect(isUrlSafeSync('https://192.168.1.1/api')).toBe(false);
    });

    it('should reject localhost', () => {
      expect(isUrlSafeSync('https://localhost/api')).toBe(false);
    });

    it('should reject .internal domains', () => {
      expect(isUrlSafeSync('https://metadata.google.internal/api')).toBe(false);
    });

    it('should reject non-allowlisted domains', () => {
      expect(isUrlSafeSync('https://evil.com/callback')).toBe(false);
    });

    it('should allow non-allowlisted when allowlist not required', () => {
      expect(isUrlSafeSync('https://google.com', { requireAllowlist: false })).toBe(true);
    });

    it('should reject invalid URLs', () => {
      expect(isUrlSafeSync('not-a-url')).toBe(false);
    });

    it('should reject FTP protocol', () => {
      expect(isUrlSafeSync('ftp://fieldledger.io/file')).toBe(false);
    });
  });

  describe('validateUrl (async)', () => {
    it('should return valid for safe URLs', async () => {
      const result = await validateUrl('https://api.fieldledger.io/test', { resolveDNS: false });
      expect(result.valid).toBe(true);
      expect(result.url).toBeDefined();
    });

    it('should return error for invalid URL format', async () => {
      const result = await validateUrl('not-a-url');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid URL');
    });

    it('should block private IPs', async () => {
      const result = await validateUrl('https://10.0.0.1/admin', { resolveDNS: false });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Private');
    });

    it('should block localhost', async () => {
      const result = await validateUrl('https://localhost:3000/api', { resolveDNS: false });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('blocked');
    });
  });
});

