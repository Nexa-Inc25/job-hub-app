/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Files Controller Tests
 * 
 * Tests for file access and streaming endpoints.
 */

const request = require('supertest');
const express = require('express');
const fs = require('fs');
const filesController = require('../controllers/files.controller');

// Mock the storage module
jest.mock('../utils/storage', () => ({
  isR2Configured: jest.fn(),
  getSignedDownloadUrl: jest.fn(),
  getFileStream: jest.fn()
}));

const r2Storage = require('../utils/storage');

// Create test app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  
  // Mock auth middleware that always passes
  const mockAuth = (req, res, next) => {
    req.userId = 'test-user-id';
    next();
  };
  
  app.get('/api/files/signed/*key', mockAuth, filesController.getSignedUrl);
  app.get('/api/files/*key', filesController.streamFile);
  
  return app;
};

describe('Files Controller', () => {
  let app;
  
  beforeEach(() => {
    app = createTestApp();
    jest.clearAllMocks();
  });
  
  // ==================== getSignedUrl ====================
  describe('GET /api/files/signed/:key', () => {
    it('should return signed URL when R2 is configured', async () => {
      r2Storage.isR2Configured.mockReturnValue(true);
      r2Storage.getSignedDownloadUrl.mockResolvedValue('https://r2.example.com/signed-url');
      
      const res = await request(app)
        .get('/api/files/signed/jobs/123/documents/test.pdf')
        .expect(200);
      
      expect(res.body.url).toBe('https://r2.example.com/signed-url');
      expect(r2Storage.getSignedDownloadUrl).toHaveBeenCalledWith('jobs/123/documents/test.pdf');
    });
    
    it('should return 404 when file not found in R2 and no local fallback', async () => {
      r2Storage.isR2Configured.mockReturnValue(true);
      r2Storage.getSignedDownloadUrl.mockResolvedValue(null);
      
      const res = await request(app)
        .get('/api/files/signed/nonexistent/file.pdf')
        .expect(404);
      
      expect(res.body.error).toBe('File not found');
    });
    
    it('should handle R2 errors gracefully', async () => {
      r2Storage.isR2Configured.mockReturnValue(true);
      r2Storage.getSignedDownloadUrl.mockRejectedValue(new Error('R2 error'));
      
      const res = await request(app)
        .get('/api/files/signed/test.pdf')
        .expect(500);
      
      expect(res.body.error).toBe('Failed to get signed URL');
    });
    
    it('should fallback to local file when R2 not configured', async () => {
      r2Storage.isR2Configured.mockReturnValue(false);
      
      // Mock fs.existsSync to return false (no local file)
      const existsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(false);
      
      const res = await request(app)
        .get('/api/files/signed/local/test.pdf')
        .expect(404);
      
      expect(res.body.error).toBe('File not found');
      existsSyncSpy.mockRestore();
    });
  });
  
  // ==================== streamFile ====================
  describe('GET /api/files/:key', () => {
    it('should stream file from R2 when configured', async () => {
      r2Storage.isR2Configured.mockReturnValue(true);
      
      // Create a mock readable stream
      const { Readable } = require('stream');
      const mockStream = new Readable({
        read() {
          this.push('file content');
          this.push(null);
        }
      });
      
      r2Storage.getFileStream.mockResolvedValue({
        stream: mockStream,
        contentType: 'application/pdf',
        contentLength: 12
      });
      
      const res = await request(app)
        .get('/api/files/jobs/123/test.pdf')
        .expect(200);
      
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['cache-control']).toBe('public, max-age=3600');
    });
    
    it('should return 404 when file not found', async () => {
      r2Storage.isR2Configured.mockReturnValue(true);
      r2Storage.getFileStream.mockResolvedValue(null);
      
      // Mock fs.existsSync to return false
      const existsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(false);
      
      const res = await request(app)
        .get('/api/files/nonexistent.pdf')
        .expect(404);
      
      expect(res.body.error).toBe('File not found');
      existsSyncSpy.mockRestore();
    });
    
    it('should handle stream errors gracefully', async () => {
      r2Storage.isR2Configured.mockReturnValue(true);
      r2Storage.getFileStream.mockRejectedValue(new Error('Stream error'));
      
      const res = await request(app)
        .get('/api/files/error.pdf')
        .expect(500);
      
      expect(res.body.error).toBe('Failed to get file');
    });
    
    it('should set correct headers for streaming', async () => {
      r2Storage.isR2Configured.mockReturnValue(true);
      
      const { Readable } = require('stream');
      const mockStream = new Readable({
        read() {
          this.push('test');
          this.push(null);
        }
      });
      
      r2Storage.getFileStream.mockResolvedValue({
        stream: mockStream,
        contentType: 'image/jpeg',
        contentLength: 4
      });
      
      const res = await request(app)
        .get('/api/files/photo.jpg')
        .expect(200);
      
      expect(res.headers['content-type']).toBe('image/jpeg');
      expect(res.headers['content-disposition']).toBe('inline');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['access-control-allow-origin']).toBe('*');
    });
  });
  
  // ==================== Utility Functions ====================
  describe('Utility Functions', () => {
    describe('getContentType', () => {
      it('should return correct content type for PDF', () => {
        expect(filesController.getContentType('document.pdf')).toBe('application/pdf');
      });
      
      it('should return correct content type for images', () => {
        expect(filesController.getContentType('photo.jpg')).toBe('image/jpeg');
        expect(filesController.getContentType('photo.jpeg')).toBe('image/jpeg');
        expect(filesController.getContentType('image.png')).toBe('image/png');
        expect(filesController.getContentType('image.gif')).toBe('image/gif');
        expect(filesController.getContentType('image.webp')).toBe('image/webp');
      });
      
      it('should return correct content type for Office files', () => {
        expect(filesController.getContentType('doc.doc')).toBe('application/msword');
        expect(filesController.getContentType('doc.docx')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        expect(filesController.getContentType('sheet.xls')).toBe('application/vnd.ms-excel');
        expect(filesController.getContentType('sheet.xlsx')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      });
      
      it('should return octet-stream for unknown types', () => {
        expect(filesController.getContentType('file.unknown')).toBe('application/octet-stream');
        expect(filesController.getContentType('noextension')).toBe('application/octet-stream');
      });
    });
    
    describe('isAllowedFileType', () => {
      it('should allow PDF files', () => {
        expect(filesController.isAllowedFileType('application/pdf')).toBe(true);
      });
      
      it('should allow image files', () => {
        expect(filesController.isAllowedFileType('image/jpeg')).toBe(true);
        expect(filesController.isAllowedFileType('image/png')).toBe(true);
        expect(filesController.isAllowedFileType('image/gif')).toBe(true);
        expect(filesController.isAllowedFileType('image/webp')).toBe(true);
        expect(filesController.isAllowedFileType('image/heic')).toBe(true);
        expect(filesController.isAllowedFileType('image/heif')).toBe(true);
      });
      
      it('should allow Office documents', () => {
        expect(filesController.isAllowedFileType('application/msword')).toBe(true);
        expect(filesController.isAllowedFileType('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(true);
        expect(filesController.isAllowedFileType('application/vnd.ms-excel')).toBe(true);
        expect(filesController.isAllowedFileType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe(true);
      });
      
      it('should reject disallowed file types', () => {
        expect(filesController.isAllowedFileType('application/javascript')).toBe(false);
        expect(filesController.isAllowedFileType('text/html')).toBe(false);
        expect(filesController.isAllowedFileType('application/x-executable')).toBe(false);
        expect(filesController.isAllowedFileType('application/zip')).toBe(false);
      });
    });
    
    describe('sanitizeFilename', () => {
      it('should keep safe characters', () => {
        expect(filesController.sanitizeFilename('document.pdf')).toBe('document.pdf');
        expect(filesController.sanitizeFilename('file-name_123.txt')).toBe('file-name_123.txt');
      });
      
      it('should replace unsafe characters with underscore', () => {
        expect(filesController.sanitizeFilename('file name.pdf')).toBe('file_name.pdf');
        expect(filesController.sanitizeFilename('file<script>.pdf')).toBe('file_script_.pdf');
        // Dots are preserved, slashes become underscores
        expect(filesController.sanitizeFilename('../../../etc/passwd')).toBe('.._.._.._etc_passwd');
      });
      
      it('should handle special characters', () => {
        expect(filesController.sanitizeFilename('file@#$%.pdf')).toBe('file____.pdf');
        expect(filesController.sanitizeFilename('naïve.pdf')).toBe('na_ve.pdf');
      });
    });
  });
});

