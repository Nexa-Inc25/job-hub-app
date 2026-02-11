/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Async Handler Middleware Tests
 */

const asyncHandler = require('../middleware/asyncHandler');

describe('asyncHandler', () => {
  const mockReq = {};
  const mockRes = { json: jest.fn(), status: jest.fn().mockReturnThis() };

  it('should pass successful handler result through', async () => {
    const handler = asyncHandler(async (req, res) => {
      res.json({ ok: true });
    });

    const next = jest.fn();
    await handler(mockReq, mockRes, next);
    expect(mockRes.json).toHaveBeenCalledWith({ ok: true });
    expect(next).not.toHaveBeenCalled();
  });

  it('should catch errors and call next', async () => {
    const error = new Error('Test error');
    const handler = asyncHandler(async () => {
      throw error;
    });

    const next = jest.fn();
    await handler(mockReq, mockRes, next);
    expect(next).toHaveBeenCalledWith(error);
  });

  it('should handle rejected promises', async () => {
    const handler = asyncHandler(() => {
      return Promise.reject(new Error('Promise rejected'));
    });

    const next = jest.fn();
    await handler(mockReq, mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next.mock.calls[0][0].message).toBe('Promise rejected');
  });

  it('should return a function', () => {
    const handler = asyncHandler(async () => {});
    expect(typeof handler).toBe('function');
  });
});

