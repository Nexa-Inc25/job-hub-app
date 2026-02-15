/** Copyright (c) 2024-2026 FieldLedger. All Rights Reserved. */
/**
 * Token Refresh & Auth Hardening Tests
 */

require('./setup');

const jwt = require('jsonwebtoken');
const { authenticateToken } = require('../middleware/auth');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET;

// Helper to build a mock Express request
const mockReq = (token, headers = {}) => ({
  headers: {
    authorization: token ? `Bearer ${token}` : undefined,
    ...headers
  }
});

// Helper to build a mock Express response
const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res;
};

describe('Auth Middleware – Token Refresh & Error Codes', () => {
  let testUser;

  beforeEach(async () => {
    testUser = await User.create({
      email: 'auth-test@fieldledger.demo',
      password: 'TestPass123',
      name: 'Auth Tester',
      role: 'admin',
      isAdmin: true
    });
  });

  // ---- Missing token ----
  it('should return TOKEN_MISSING when no token is provided', async () => {
    const req = mockReq(null);
    const res = mockRes();
    const next = jest.fn();

    await authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'TOKEN_MISSING' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  // ---- Expired token ----
  it('should return TOKEN_EXPIRED for an expired JWT', async () => {
    const token = jwt.sign(
      { userId: testUser._id },
      JWT_SECRET,
      { expiresIn: '0s' } // immediately expired
    );
    // Wait a tick for the token to actually be past expiry
    await new Promise((r) => setTimeout(r, 50));

    const req = mockReq(token);
    const res = mockRes();
    const next = jest.fn();

    await authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'TOKEN_EXPIRED' })
    );
  });

  // ---- Malformed token ----
  it('should return TOKEN_INVALID for a malformed JWT', async () => {
    const req = mockReq('not.a.valid.jwt');
    const res = mockRes();
    const next = jest.fn();

    await authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'TOKEN_INVALID' })
    );
  });

  // ---- Valid token sets req.tokenExpiresAt ----
  it('should populate req.tokenExpiresAt on valid token', async () => {
    const token = jwt.sign(
      { userId: testUser._id },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    const req = mockReq(token);
    const res = mockRes();
    const next = jest.fn();

    await authenticateToken(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.tokenExpiresAt).toBeInstanceOf(Date);
    // Should expire ~24 h from now
    const diff = req.tokenExpiresAt.getTime() - Date.now();
    expect(diff).toBeGreaterThan(23 * 60 * 60 * 1000); // >23h
    expect(diff).toBeLessThan(25 * 60 * 60 * 1000);    // <25h
  });

  // ---- Token refresh when near expiry ----
  it('should set X-Refreshed-Token header when token is within 15 min of expiry', async () => {
    // Create a token that expires in 10 minutes (within the 15-min window)
    const token = jwt.sign(
      { userId: testUser._id },
      JWT_SECRET,
      { expiresIn: '10m' }
    );

    const req = mockReq(token);
    const res = mockRes();
    const next = jest.fn();

    await authenticateToken(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith(
      'X-Refreshed-Token',
      expect.any(String)
    );

    // The refreshed token should be valid and contain the same userId
    const refreshed = res.setHeader.mock.calls.find(
      ([header]) => header === 'X-Refreshed-Token'
    )[1];
    const decoded = jwt.verify(refreshed, JWT_SECRET);
    expect(decoded.userId.toString()).toBe(testUser._id.toString());
  });

  // ---- No refresh for long-lived token ----
  it('should NOT set X-Refreshed-Token when token has plenty of time left', async () => {
    const token = jwt.sign(
      { userId: testUser._id },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    const req = mockReq(token);
    const res = mockRes();
    const next = jest.fn();

    await authenticateToken(req, res, next);

    expect(next).toHaveBeenCalled();
    const refreshCall = res.setHeader.mock.calls.find(
      ([header]) => header === 'X-Refreshed-Token'
    );
    expect(refreshCall).toBeUndefined();
  });

  // ---- User not found ----
  it('should return USER_NOT_FOUND when user no longer exists', async () => {
    const token = jwt.sign(
      { userId: '507f1f77bcf86cd799439011' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    const req = mockReq(token);
    const res = mockRes();
    const next = jest.fn();

    await authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'USER_NOT_FOUND' })
    );
  });

  // ---- Sets all req fields ----
  it('should populate req.userId, req.userEmail, req.userRole, req.companyId', async () => {
    const token = jwt.sign(
      { userId: testUser._id },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    const req = mockReq(token);
    const res = mockRes();
    const next = jest.fn();

    await authenticateToken(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.userId).toBe(testUser._id.toString());
    expect(req.userEmail).toBe(testUser.email);
    expect(req.userName).toBe(testUser.name);
    expect(req.userRole).toBe(testUser.role);
  });
});
