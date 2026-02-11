/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Validators Middleware Tests
 * 
 * Tests express-validator schemas for API input validation.
 */

const express = require('express');
const request = require('supertest');
const {
  loginValidation,
  signupValidation,
  mfaValidation,
  unitEntryValidation,
  claimValidation,
  mongoIdParam,
  paginationValidation,
} = require('../middleware/validators');

function createApp(validationChain, method = 'post', path = '/test') {
  const app = express();
  app.use(express.json());
  if (method === 'get') {
    app.get(path, ...validationChain, (req, res) => res.json({ ok: true }));
  } else {
    app.post(path, ...validationChain, (req, res) => res.json({ ok: true }));
  }
  app.put(path, ...validationChain, (req, res) => res.json({ ok: true }));
  return app;
}

describe('Validators Middleware', () => {

  describe('loginValidation', () => {
    const app = createApp(loginValidation);

    it('should accept valid login', async () => {
      const res = await request(app).post('/test').send({
        email: 'test@example.com',
        password: 'password123',
      });
      expect(res.status).toBe(200);
    });

    it('should reject missing email', async () => {
      const res = await request(app).post('/test').send({ password: 'pass' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should reject invalid email', async () => {
      const res = await request(app).post('/test').send({
        email: 'not-an-email',
        password: 'pass',
      });
      expect(res.status).toBe(400);
    });

    it('should reject missing password', async () => {
      const res = await request(app).post('/test').send({
        email: 'test@example.com',
      });
      expect(res.status).toBe(400);
    });
  });

  describe('signupValidation', () => {
    const app = createApp(signupValidation);

    it('should accept valid signup', async () => {
      const res = await request(app).post('/test').send({
        email: 'new@example.com',
        password: 'StrongPass1',
        name: 'John Doe',
      });
      expect(res.status).toBe(200);
    });

    it('should reject short password', async () => {
      const res = await request(app).post('/test').send({
        email: 'new@example.com',
        password: 'Short1',
        name: 'John',
      });
      expect(res.status).toBe(400);
    });

    it('should reject password without uppercase', async () => {
      const res = await request(app).post('/test').send({
        email: 'new@example.com',
        password: 'alllowercase1',
        name: 'John',
      });
      expect(res.status).toBe(400);
    });

    it('should reject password without number', async () => {
      const res = await request(app).post('/test').send({
        email: 'new@example.com',
        password: 'NoNumbers',
        name: 'John',
      });
      expect(res.status).toBe(400);
    });

    it('should reject missing name', async () => {
      const res = await request(app).post('/test').send({
        email: 'new@example.com',
        password: 'StrongPass1',
      });
      expect(res.status).toBe(400);
    });
  });

  describe('mfaValidation', () => {
    const app = createApp(mfaValidation);

    it('should accept valid 6-digit code', async () => {
      const res = await request(app).post('/test').send({ code: '123456' });
      expect(res.status).toBe(200);
    });

    it('should reject non-numeric code', async () => {
      const res = await request(app).post('/test').send({ code: 'abcdef' });
      expect(res.status).toBe(400);
    });

    it('should reject code shorter than 6 digits', async () => {
      const res = await request(app).post('/test').send({ code: '12345' });
      expect(res.status).toBe(400);
    });

    it('should reject code longer than 6 digits', async () => {
      const res = await request(app).post('/test').send({ code: '1234567' });
      expect(res.status).toBe(400);
    });
  });

  describe('unitEntryValidation', () => {
    const app = createApp(unitEntryValidation);
    const validId = '507f1f77bcf86cd799439011';

    it('should accept valid unit entry', async () => {
      const res = await request(app).post('/test').send({
        jobId: validId,
        quantity: 5,
      });
      expect(res.status).toBe(200);
    });

    it('should reject invalid jobId', async () => {
      const res = await request(app).post('/test').send({
        jobId: 'not-an-id',
        quantity: 5,
      });
      expect(res.status).toBe(400);
    });

    it('should reject quantity < 1', async () => {
      const res = await request(app).post('/test').send({
        jobId: validId,
        quantity: 0,
      });
      expect(res.status).toBe(400);
    });

    it('should reject quantity > 10000', async () => {
      const res = await request(app).post('/test').send({
        jobId: validId,
        quantity: 10001,
      });
      expect(res.status).toBe(400);
    });
  });

  describe('claimValidation', () => {
    const app = createApp(claimValidation);

    it('should accept valid claim', async () => {
      const res = await request(app).post('/test').send({ name: 'Claim 1' });
      expect(res.status).toBe(200);
    });

    it('should reject missing name', async () => {
      const res = await request(app).post('/test').send({});
      expect(res.status).toBe(400);
    });

    it('should reject name over 200 chars', async () => {
      const res = await request(app).post('/test').send({
        name: 'x'.repeat(201),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('mongoIdParam', () => {
    const validators = mongoIdParam('id');
    const app = express();
    app.use(express.json());
    app.get('/test/:id', ...validators, (req, res) => res.json({ ok: true }));

    it('should accept valid ObjectId', async () => {
      const res = await request(app).get('/test/507f1f77bcf86cd799439011');
      expect(res.status).toBe(200);
    });

    it('should reject invalid ObjectId', async () => {
      const res = await request(app).get('/test/invalid-id');
      expect(res.status).toBe(400);
    });
  });

  describe('paginationValidation', () => {
    const app = createApp(paginationValidation, 'get');

    it('should accept valid pagination', async () => {
      const res = await request(app).get('/test?page=1&limit=20');
      expect(res.status).toBe(200);
    });

    it('should reject page < 1', async () => {
      const res = await request(app).get('/test?page=0');
      expect(res.status).toBe(400);
    });

    it('should reject limit > 100', async () => {
      const res = await request(app).get('/test?limit=101');
      expect(res.status).toBe(400);
    });

    it('should reject invalid sort field', async () => {
      const res = await request(app).get('/test?sort=hackerField');
      expect(res.status).toBe(400);
    });

    it('should accept valid sort field', async () => {
      const res = await request(app).get('/test?sort=-createdAt');
      expect(res.status).toBe(200);
    });
  });
});

