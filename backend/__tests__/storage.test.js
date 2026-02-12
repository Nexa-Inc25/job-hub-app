/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Storage Utility Tests
 * 
 * Tests for R2 cloud storage and local fallback functionality.
 */

// Mock AWS SDK before requiring the storage module
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: jest.fn()
  })),
  PutObjectCommand: jest.fn(),
  GetObjectCommand: jest.fn(),
  DeleteObjectCommand: jest.fn(),
  ListObjectsV2Command: jest.fn()
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn()
}));

jest.mock('node:fs', () => ({
  readFileSync: jest.fn().mockReturnValue(Buffer.from('test file content'))
}));

describe('Storage Utility', () => {
  let storage;
  let originalEnv;
  
  beforeEach(() => {
    // Save original env
    originalEnv = { ...process.env };
    jest.clearAllMocks();
    
    // Reset module cache to re-initialize with new env
    jest.resetModules();
  });
  
  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
  });
  
  // ==================== isR2Configured ====================
  describe('isR2Configured', () => {
    it('should return false when R2 credentials are not set', () => {
      delete process.env.R2_ACCOUNT_ID;
      delete process.env.R2_ACCESS_KEY_ID;
      delete process.env.R2_SECRET_ACCESS_KEY;
      
      storage = require('../utils/storage');
      expect(storage.isR2Configured()).toBe(false);
    });
    
    it('should return true when all R2 credentials are set', () => {
      process.env.R2_ACCOUNT_ID = 'test-account';
      process.env.R2_ACCESS_KEY_ID = 'test-key';
      process.env.R2_SECRET_ACCESS_KEY = 'test-secret';
      
      storage = require('../utils/storage');
      expect(storage.isR2Configured()).toBe(true);
    });
    
    it('should return false when partial credentials are set', () => {
      process.env.R2_ACCOUNT_ID = 'test-account';
      delete process.env.R2_ACCESS_KEY_ID;
      delete process.env.R2_SECRET_ACCESS_KEY;
      
      storage = require('../utils/storage');
      expect(storage.isR2Configured()).toBe(false);
    });
  });
  
  // ==================== getPublicUrl ====================
  describe('getPublicUrl', () => {
    beforeEach(() => {
      delete process.env.R2_ACCOUNT_ID;
      delete process.env.R2_ACCESS_KEY_ID;
      delete process.env.R2_SECRET_ACCESS_KEY;
      storage = require('../utils/storage');
    });
    
    it('should return fallback API URL when R2_PUBLIC_URL not set', () => {
      const url = storage.getPublicUrl('jobs/123/doc.pdf');
      expect(url).toBe('/api/files/jobs/123/doc.pdf');
    });
  });
  
  // ==================== uploadFile (without R2) ====================
  describe('uploadFile (without R2)', () => {
    beforeEach(() => {
      delete process.env.R2_ACCOUNT_ID;
      delete process.env.R2_ACCESS_KEY_ID;
      delete process.env.R2_SECRET_ACCESS_KEY;
      storage = require('../utils/storage');
    });
    
    it('should return local fallback when R2 not configured', async () => {
      const result = await storage.uploadFile('/local/path/file.pdf', 'test-key');
      
      expect(result.local).toBe(true);
      expect(result.url).toBe('/local/path/file.pdf');
      expect(result.key).toBe('test-key');
    });
  });
  
  // ==================== uploadBuffer (without R2) ====================
  describe('uploadBuffer (without R2)', () => {
    beforeEach(() => {
      delete process.env.R2_ACCOUNT_ID;
      storage = require('../utils/storage');
    });
    
    it('should return null when R2 not configured', async () => {
      const buffer = Buffer.from('test content');
      const result = await storage.uploadBuffer(buffer, 'test-key');
      
      expect(result).toBeNull();
    });
  });
  
  // ==================== getSignedDownloadUrl (without R2) ====================
  describe('getSignedDownloadUrl (without R2)', () => {
    beforeEach(() => {
      delete process.env.R2_ACCOUNT_ID;
      storage = require('../utils/storage');
    });
    
    it('should return null when R2 not configured', async () => {
      const result = await storage.getSignedDownloadUrl('test-key');
      expect(result).toBeNull();
    });
  });
  
  // ==================== getFileStream (without R2) ====================
  describe('getFileStream (without R2)', () => {
    beforeEach(() => {
      delete process.env.R2_ACCOUNT_ID;
      storage = require('../utils/storage');
    });
    
    it('should return null when R2 not configured', async () => {
      const result = await storage.getFileStream('test-key');
      expect(result).toBeNull();
    });
  });
  
  // ==================== deleteFile (without R2) ====================
  describe('deleteFile (without R2)', () => {
    beforeEach(() => {
      delete process.env.R2_ACCOUNT_ID;
      storage = require('../utils/storage');
    });
    
    it('should return false when R2 not configured', async () => {
      const result = await storage.deleteFile('test-key');
      expect(result).toBe(false);
    });
  });
  
  // ==================== listFiles (without R2) ====================
  describe('listFiles (without R2)', () => {
    beforeEach(() => {
      delete process.env.R2_ACCOUNT_ID;
      storage = require('../utils/storage');
    });
    
    it('should return empty array when R2 not configured', async () => {
      const result = await storage.listFiles('templates/');
      expect(result).toEqual([]);
    });
  });
  
  // ==================== uploadTemplate ====================
  describe('uploadTemplate', () => {
    beforeEach(() => {
      delete process.env.R2_ACCOUNT_ID;
      storage = require('../utils/storage');
    });
    
    it('should construct correct R2 key for templates', async () => {
      const result = await storage.uploadTemplate('/local/path/form.pdf', 'W9_Form.pdf');
      
      expect(result.key).toBe('templates/W9_Form.pdf');
    });
  });
  
  // ==================== uploadJobFile ====================
  describe('uploadJobFile', () => {
    beforeEach(() => {
      delete process.env.R2_ACCOUNT_ID;
      storage = require('../utils/storage');
    });
    
    it('should construct correct R2 key for job files', async () => {
      const result = await storage.uploadJobFile(
        '/local/path/doc.pdf',
        'job123',
        'ACI/Documents',
        'facesheet.pdf'
      );
      
      expect(result.key).toBe('jobs/job123/ACI/Documents/facesheet.pdf');
    });
  });
  
  // ==================== uploadExtractedImage (without R2) ====================
  describe('uploadExtractedImage (without R2)', () => {
    beforeEach(() => {
      delete process.env.R2_ACCOUNT_ID;
      storage = require('../utils/storage');
    });
    
    it('should return null when R2 not configured', async () => {
      const buffer = Buffer.from('image data');
      const result = await storage.uploadExtractedImage(
        buffer,
        'job123',
        'photos',
        'image1.jpg'
      );
      
      expect(result).toBeNull();
    });
  });
  
  // ==================== copyFile (without R2) ====================
  describe('copyFile (without R2)', () => {
    beforeEach(() => {
      delete process.env.R2_ACCOUNT_ID;
      storage = require('../utils/storage');
    });
    
    it('should throw error when R2 not configured', async () => {
      await expect(
        storage.copyFile('source-key', 'dest-key')
      ).rejects.toThrow('R2 storage not configured');
    });
  });
  
  // ==================== Constants ====================
  describe('Constants', () => {
    beforeEach(() => {
      delete process.env.R2_ACCOUNT_ID;
      storage = require('../utils/storage');
    });
    
    it('should export BUCKET_NAME', () => {
      expect(storage.BUCKET_NAME).toBeDefined();
      expect(typeof storage.BUCKET_NAME).toBe('string');
    });
    
    it('should use default bucket name when not set', () => {
      expect(storage.BUCKET_NAME).toBe('fieldledger-uploads');
    });
  });
});

