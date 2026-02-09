/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Authentication Tests
 * 
 * Comprehensive tests for auth endpoints matching exact server.js behavior.
 * These tests serve as a safety net before migrating to the new controller.
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const authController = require('../controllers/auth.controller');

// Create test app with auth routes
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  
  // Mock authenticateUser middleware for protected routes
  const mockAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No token provided' });
    }
    try {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.userId = decoded.userId;
      next();
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }
  };
  
  // Routes matching server.js
  app.post('/api/signup', authController.signup);
  app.post('/api/login', authController.login);
  app.post('/api/auth/mfa/verify', authController.verifyMfa);
  app.get('/api/users/me', mockAuth, authController.getProfile);
  app.post('/api/auth/mfa/setup', mockAuth, authController.setupMfa);
  app.post('/api/auth/mfa/enable', mockAuth, authController.enableMfa);
  app.post('/api/auth/mfa/disable', mockAuth, authController.disableMfa);
  app.get('/api/auth/mfa/status', mockAuth, authController.getMfaStatus);
  
  return app;
};

const app = createTestApp();

describe('Authentication Endpoints', () => {
  
  // ==================== SIGNUP TESTS ====================
  describe('POST /api/signup', () => {
    
    describe('Success Cases', () => {
      it('should create a new user with valid data', async () => {
        const res = await request(app)
          .post('/api/signup')
          .send({
            email: 'newuser@test.com',
            password: 'SecurePass123',
            name: 'New User'
          });
        
        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('token');
        expect(res.body).toHaveProperty('userId');
        expect(res.body).toHaveProperty('role', 'crew'); // Default role
        expect(res.body).toHaveProperty('isAdmin', false);
        expect(res.body).toHaveProperty('canApprove', false);
      });
      
      it('should create GF user with admin privileges', async () => {
        const res = await request(app)
          .post('/api/signup')
          .send({
            email: 'gf@test.com',
            password: 'SecurePass123',
            name: 'General Foreman',
            role: 'gf'
          });
        
        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('role', 'gf');
        expect(res.body).toHaveProperty('isAdmin', true);
        expect(res.body).toHaveProperty('canApprove', true);
      });
      
      it('should create PM user with admin privileges', async () => {
        const res = await request(app)
          .post('/api/signup')
          .send({
            email: 'pm@test.com',
            password: 'SecurePass123',
            name: 'Project Manager',
            role: 'pm'
          });
        
        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('role', 'pm');
        expect(res.body).toHaveProperty('isAdmin', true);
      });
      
      it('should use email prefix as name if not provided', async () => {
        const res = await request(app)
          .post('/api/signup')
          .send({
            email: 'noname@test.com',
            password: 'SecurePass123'
          });
        
        expect(res.status).toBe(201);
        
        // Verify user was created with email prefix as name
        const user = await User.findById(res.body.userId);
        expect(user.name).toBe('noname');
      });
      
      it('should default to crew role for invalid role', async () => {
        const res = await request(app)
          .post('/api/signup')
          .send({
            email: 'invalidrole@test.com',
            password: 'SecurePass123',
            role: 'superadmin' // Invalid role
          });
        
        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('role', 'crew');
      });
    });
    
    describe('Validation Errors', () => {
      it('should reject signup without email', async () => {
        const res = await request(app)
          .post('/api/signup')
          .send({
            password: 'SecurePass123',
            name: 'No Email'
          });
        
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Valid email is required');
      });
      
      it('should reject signup without password', async () => {
        const res = await request(app)
          .post('/api/signup')
          .send({
            email: 'nopass@test.com',
            name: 'No Password'
          });
        
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Email and password are required');
      });
      
      it('should reject password shorter than 8 characters', async () => {
        const res = await request(app)
          .post('/api/signup')
          .send({
            email: 'shortpass@test.com',
            password: 'Short1'
          });
        
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('at least 8 characters');
      });
      
      it('should reject password without uppercase letter', async () => {
        const res = await request(app)
          .post('/api/signup')
          .send({
            email: 'nouppercase@test.com',
            password: 'lowercase123'
          });
        
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('uppercase letter');
      });
      
      it('should reject password without lowercase letter', async () => {
        const res = await request(app)
          .post('/api/signup')
          .send({
            email: 'nolowercase@test.com',
            password: 'UPPERCASE123'
          });
        
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('lowercase letter');
      });
      
      it('should reject password without number', async () => {
        const res = await request(app)
          .post('/api/signup')
          .send({
            email: 'nonumber@test.com',
            password: 'NoNumberHere'
          });
        
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('one number');
      });
      
      it('should reject duplicate email without revealing it exists', async () => {
        // Create first user
        await request(app)
          .post('/api/signup')
          .send({
            email: 'duplicate@test.com',
            password: 'SecurePass123'
          });
        
        // Try duplicate
        const res = await request(app)
          .post('/api/signup')
          .send({
            email: 'duplicate@test.com',
            password: 'DifferentPass123'
          });
        
        expect(res.status).toBe(400);
        // Security: Should NOT say "email already exists"
        expect(res.body.error).toContain('Unable to create account');
        expect(res.body.error).not.toContain('already exists');
      });
    });
  });
  
  // ==================== LOGIN TESTS ====================
  describe('POST /api/login', () => {
    
    beforeEach(async () => {
      // Create test user for login tests
      await request(app)
        .post('/api/signup')
        .send({
          email: 'logintest@test.com',
          password: 'LoginPass123',
          name: 'Login Test User',
          role: 'gf'
        });
    });
    
    describe('Success Cases', () => {
      it('should login with valid credentials', async () => {
        const res = await request(app)
          .post('/api/login')
          .send({
            email: 'logintest@test.com',
            password: 'LoginPass123'
          });
        
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('token');
        expect(res.body).toHaveProperty('userId');
        expect(res.body).toHaveProperty('role', 'gf');
        expect(res.body).toHaveProperty('isAdmin', true);
        expect(res.body).toHaveProperty('name', 'Login Test User');
        expect(res.body).toHaveProperty('mfaEnabled', false);
      });
      
      it('should return JWT token that can be decoded', async () => {
        const res = await request(app)
          .post('/api/login')
          .send({
            email: 'logintest@test.com',
            password: 'LoginPass123'
          });
        
        expect(res.status).toBe(200);
        
        // Verify token is valid
        const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
        expect(decoded).toHaveProperty('userId');
        expect(decoded).toHaveProperty('role', 'gf');
      });
    });
    
    describe('Invalid Credentials', () => {
      it('should reject login with wrong password', async () => {
        const res = await request(app)
          .post('/api/login')
          .send({
            email: 'logintest@test.com',
            password: 'WrongPassword123'
          });
        
        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('error', 'Invalid credentials');
      });
      
      it('should reject login with non-existent email', async () => {
        const res = await request(app)
          .post('/api/login')
          .send({
            email: 'nonexistent@test.com',
            password: 'SomePassword123'
          });
        
        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('error', 'Invalid credentials');
      });
    });
    
    describe('Account Lockout', () => {
      it('should track failed login attempts', async () => {
        // Make failed attempt
        await request(app)
          .post('/api/login')
          .send({
            email: 'logintest@test.com',
            password: 'WrongPassword'
          });
        
        // Check user has failed attempts
        const user = await User.findOne({ email: 'logintest@test.com' });
        expect(user.failedLoginAttempts).toBe(1);
      });
      
      it('should lock account after 5 failed attempts', async () => {
        // Make 5 failed login attempts
        for (let i = 0; i < 5; i++) {
          await request(app)
            .post('/api/login')
            .send({
              email: 'logintest@test.com',
              password: 'WrongPassword'
            });
        }
        
        // 6th attempt should show locked
        const res = await request(app)
          .post('/api/login')
          .send({
            email: 'logintest@test.com',
            password: 'WrongPassword'
          });
        
        expect(res.status).toBe(423);
        expect(res.body.error).toContain('locked');
      });
      
      it('should reset failed attempts on successful login', async () => {
        // Make a failed attempt first
        await request(app)
          .post('/api/login')
          .send({
            email: 'logintest@test.com',
            password: 'WrongPassword'
          });
        
        let user = await User.findOne({ email: 'logintest@test.com' });
        expect(user.failedLoginAttempts).toBe(1);
        
        // Successful login
        await request(app)
          .post('/api/login')
          .send({
            email: 'logintest@test.com',
            password: 'LoginPass123'
          });
        
        user = await User.findOne({ email: 'logintest@test.com' });
        expect(user.failedLoginAttempts).toBe(0);
      });
    });
  });
  
  // ==================== GET PROFILE TESTS ====================
  describe('GET /api/users/me', () => {
    let token;
    let userId;
    
    beforeEach(async () => {
      const signupRes = await request(app)
        .post('/api/signup')
        .send({
          email: 'profile@test.com',
          password: 'ProfilePass123',
          name: 'Profile User',
          role: 'pm'
        });
      
      token = signupRes.body.token;
      userId = signupRes.body.userId;
    });
    
    it('should return user profile with valid token', async () => {
      const res = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('name', 'Profile User');
      expect(res.body).toHaveProperty('email', 'profile@test.com');
      expect(res.body).toHaveProperty('role', 'pm');
      expect(res.body).not.toHaveProperty('password'); // Password should not be returned
    });
    
    it('should reject request without token', async () => {
      const res = await request(app)
        .get('/api/users/me');
      
      expect(res.status).toBe(401);
    });
    
    it('should reject request with invalid token', async () => {
      const res = await request(app)
        .get('/api/users/me')
        .set('Authorization', 'Bearer invalid-token');
      
      expect(res.status).toBe(401);
    });
  });
  
  // ==================== PASSWORD VALIDATION TESTS ====================
  describe('Password Validation Function', () => {
    const { validatePassword } = require('../controllers/auth.controller');
    
    it('should accept valid password', () => {
      const result = validatePassword('ValidPass123');
      expect(result.valid).toBe(true);
    });
    
    it('should reject short password', () => {
      const result = validatePassword('Short1');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('8 characters');
    });
    
    it('should reject password without uppercase', () => {
      const result = validatePassword('lowercase123');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('uppercase');
    });
    
    it('should reject password without lowercase', () => {
      const result = validatePassword('UPPERCASE123');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('lowercase');
    });
    
    it('should reject password without number', () => {
      const result = validatePassword('NoNumbers');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('number');
    });
  });
});
