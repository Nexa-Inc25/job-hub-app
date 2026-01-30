/**
 * Security Middleware Tests
 * 
 * Tests for security middleware functions including rate limiting,
 * input sanitization, and request validation.
 */

const {
  requestId,
  additionalSecurityHeaders,
  sanitizeInput,
  preventParamPollution,
  blockSuspiciousAgents,
  REQUEST_LIMITS
} = require('../middleware/security');

// Mock Express request/response
const mockRequest = (overrides = {}) => ({
  method: 'GET',
  path: '/api/test',
  ip: '127.0.0.1',
  headers: {
    'user-agent': 'Mozilla/5.0 Test Browser',
    ...overrides.headers
  },
  query: {},
  body: {},
  ...overrides
});

const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  res.set = jest.fn().mockReturnValue(res);
  return res;
};

const mockNext = () => jest.fn();

describe('Security Middleware', () => {
  
  // ==================== requestId ====================
  describe('requestId', () => {
    it('should add unique request ID to each request', () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();
      
      requestId(req, res, next);
      
      expect(req.requestId).toBeDefined();
      expect(typeof req.requestId).toBe('string');
      expect(req.requestId.length).toBeGreaterThan(0);
      expect(next).toHaveBeenCalled();
    });
    
    it('should generate different IDs for different requests', () => {
      const req1 = mockRequest();
      const req2 = mockRequest();
      const res = mockResponse();
      
      requestId(req1, res, mockNext());
      requestId(req2, res, mockNext());
      
      expect(req1.requestId).not.toBe(req2.requestId);
    });
    
    it('should set X-Request-ID header on response', () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();
      
      requestId(req, res, next);
      
      expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', req.requestId);
    });
  });
  
  // ==================== additionalSecurityHeaders ====================
  describe('additionalSecurityHeaders', () => {
    it('should set security headers', () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();
      
      additionalSecurityHeaders(req, res, next);
      
      expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(res.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
      expect(res.setHeader).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
      expect(next).toHaveBeenCalled();
    });
  });
  
  // ==================== sanitizeInput ====================
  describe('sanitizeInput', () => {
    it('should pass through normal input', () => {
      const req = mockRequest({
        body: { name: 'John Doe', email: 'john@example.com' },
        query: { search: 'test query' }
      });
      const res = mockResponse();
      const next = mockNext();
      
      sanitizeInput(req, res, next);
      
      expect(req.body.name).toBe('John Doe');
      expect(req.body.email).toBe('john@example.com');
      expect(next).toHaveBeenCalled();
    });
    
    it('should remove null bytes from body', () => {
      const req = mockRequest({
        body: { name: 'John\0Doe' }
      });
      const res = mockResponse();
      const next = mockNext();
      
      sanitizeInput(req, res, next);
      
      expect(req.body.name).toBe('JohnDoe');
      expect(req.body.name).not.toContain('\0');
      expect(next).toHaveBeenCalled();
    });
    
    it('should remove null bytes from query parameters', () => {
      const req = mockRequest({
        query: { search: 'test\0query' }
      });
      const res = mockResponse();
      const next = mockNext();
      
      sanitizeInput(req, res, next);
      
      expect(req.query.search).toBe('testquery');
      expect(next).toHaveBeenCalled();
    });
    
    it('should handle nested objects', () => {
      const req = mockRequest({
        body: {
          user: {
            name: 'John\0',
            profile: {
              bio: 'Normal bio'
            }
          }
        }
      });
      const res = mockResponse();
      const next = mockNext();
      
      sanitizeInput(req, res, next);
      
      expect(req.body.user.name).toBe('John');
      expect(req.body.user.profile.bio).toBe('Normal bio');
      expect(next).toHaveBeenCalled();
    });
    
    it('should truncate very long strings', () => {
      const longString = 'a'.repeat(60000);
      const req = mockRequest({
        body: { data: longString }
      });
      const res = mockResponse();
      const next = mockNext();
      
      sanitizeInput(req, res, next);
      
      expect(req.body.data.length).toBe(50000);
      expect(next).toHaveBeenCalled();
    });
  });
  
  // ==================== preventParamPollution ====================
  describe('preventParamPollution', () => {
    it('should pass through single-value parameters', () => {
      const req = mockRequest({
        query: { page: '1', limit: '10' }
      });
      const res = mockResponse();
      const next = mockNext();
      
      preventParamPollution(req, res, next);
      
      expect(req.query.page).toBe('1');
      expect(req.query.limit).toBe('10');
      expect(next).toHaveBeenCalled();
    });
    
    it('should take first value for duplicate query params', () => {
      const req = mockRequest({
        query: { status: ['new', 'pending', 'completed'] }
      });
      const res = mockResponse();
      const next = mockNext();
      
      preventParamPollution(req, res, next);
      
      // Should take first value to prevent pollution
      expect(req.query.status).toBe('new');
      expect(next).toHaveBeenCalled();
    });
  });
  
  // ==================== blockSuspiciousAgents ====================
  describe('blockSuspiciousAgents', () => {
    it('should allow normal browser user agents', () => {
      const req = mockRequest({
        headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0' }
      });
      const res = mockResponse();
      const next = mockNext();
      
      blockSuspiciousAgents(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
    
    it('should allow health check endpoint without user agent', () => {
      const req = mockRequest({
        path: '/api/health',
        headers: { 'user-agent': '' }
      });
      const res = mockResponse();
      const next = mockNext();
      
      blockSuspiciousAgents(req, res, next);
      
      expect(next).toHaveBeenCalled();
    });
    
    it('should block requests with no user agent on API endpoints', () => {
      const req = mockRequest({
        path: '/api/jobs',
        headers: {}
      });
      delete req.headers['user-agent'];
      const res = mockResponse();
      const next = mockNext();
      
      blockSuspiciousAgents(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden' });
      expect(next).not.toHaveBeenCalled();
    });
    
    it('should block sqlmap user agent', () => {
      const req = mockRequest({
        headers: { 'user-agent': 'sqlmap/1.0' }
      });
      const res = mockResponse();
      const next = mockNext();
      
      blockSuspiciousAgents(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
    
    it('should block nikto scanner', () => {
      const req = mockRequest({
        headers: { 'user-agent': 'Nikto/2.1.6' }
      });
      const res = mockResponse();
      const next = mockNext();
      
      blockSuspiciousAgents(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(403);
    });
    
    it('should block nmap', () => {
      const req = mockRequest({
        headers: { 'user-agent': 'nmap scripting engine' }
      });
      const res = mockResponse();
      const next = mockNext();
      
      blockSuspiciousAgents(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });
  
  // ==================== REQUEST_LIMITS ====================
  describe('REQUEST_LIMITS', () => {
    it('should define standard limits', () => {
      expect(REQUEST_LIMITS).toBeDefined();
      expect(REQUEST_LIMITS.default).toBeDefined();
      expect(REQUEST_LIMITS.upload).toBeDefined();
      expect(REQUEST_LIMITS.json).toBeDefined();
    });
    
    it('should have string format values', () => {
      // Limits are defined as strings like '1mb', '150mb'
      expect(typeof REQUEST_LIMITS.default).toBe('string');
      expect(REQUEST_LIMITS.default).toMatch(/\d+mb/i);
      expect(REQUEST_LIMITS.upload).toMatch(/\d+mb/i);
      expect(REQUEST_LIMITS.json).toMatch(/\d+mb/i);
    });
    
    it('should have upload limit larger than default', () => {
      // Extract numbers from strings like '1mb' -> 1, '150mb' -> 150
      const defaultMb = parseInt(REQUEST_LIMITS.default);
      const uploadMb = parseInt(REQUEST_LIMITS.upload);
      expect(uploadMb).toBeGreaterThan(defaultMb);
    });
  });
});

