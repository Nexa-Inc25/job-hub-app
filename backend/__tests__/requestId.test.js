/** Copyright (c) 2024-2026 FieldLedger. All Rights Reserved. */
/**
 * Request-ID Middleware Tests
 *
 * Validates UUID generation, header propagation, and Pino child logger creation.
 */

const { requestId } = require('../middleware/security');

const mockRequest = (overrides = {}) => ({
  headers: {},
  ...overrides
});

const mockResponse = () => {
  const res = {};
  res.setHeader = jest.fn().mockReturnValue(res);
  return res;
};

describe('requestId middleware', () => {
  it('should generate a UUID and set it on req.requestId', () => {
    const req = mockRequest();
    const res = mockResponse();
    const next = jest.fn();

    requestId(req, res, next);

    expect(req.requestId).toBeDefined();
    // UUID v4 format
    expect(req.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(next).toHaveBeenCalled();
  });

  it('should set X-Request-ID response header', () => {
    const req = mockRequest();
    const res = mockResponse();
    const next = jest.fn();

    requestId(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', req.requestId);
  });

  it('should honour an inbound X-Request-Id header', () => {
    const inboundId = 'inbound-trace-abc123';
    const req = mockRequest({ headers: { 'x-request-id': inboundId } });
    const res = mockResponse();
    const next = jest.fn();

    requestId(req, res, next);

    expect(req.requestId).toBe(inboundId);
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', inboundId);
  });

  it('should attach a pino child logger as req.log', () => {
    const req = mockRequest();
    const res = mockResponse();
    const next = jest.fn();

    requestId(req, res, next);

    expect(req.log).toBeDefined();
    // Pino child loggers expose standard level methods
    expect(typeof req.log.info).toBe('function');
    expect(typeof req.log.warn).toBe('function');
    expect(typeof req.log.error).toBe('function');
  });

  it('should generate unique IDs for consecutive requests', () => {
    const ids = new Set();
    for (let i = 0; i < 50; i++) {
      const req = mockRequest();
      requestId(req, mockResponse(), jest.fn());
      ids.add(req.requestId);
    }
    expect(ids.size).toBe(50);
  });
});
