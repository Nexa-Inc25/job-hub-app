/**
 * Authentication Tests
 * 
 * Tests for login, signup, and authentication flows.
 */

const request = require('supertest');
const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const authRoutes = require('../routes/auth.routes');

// Create test app
const app = express();
app.use(express.json());
app.use('/api', authRoutes);

describe('Authentication Endpoints', () => {
  
  describe('POST /api/signup', () => {
    
    it('should create a new user with valid data', async () => {
      const res = await request(app)
        .post('/api/signup')
        .send({
          email: 'newuser@test.com',
          password: 'SecurePassword123!',
          name: 'New User'
        });
      
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user).toHaveProperty('email', 'newuser@test.com');
      expect(res.body.user).toHaveProperty('name', 'New User');
      expect(res.body.user).toHaveProperty('role', 'crew');
    });
    
    it('should reject signup with missing email', async () => {
      const res = await request(app)
        .post('/api/signup')
        .send({
          password: 'SecurePassword123!',
          name: 'New User'
        });
      
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
    
    it('should reject signup with short password', async () => {
      const res = await request(app)
        .post('/api/signup')
        .send({
          email: 'shortpass@test.com',
          password: 'short',
          name: 'Short Password User'
        });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('8 characters');
    });
    
    it('should reject duplicate email', async () => {
      // Create first user
      await User.create({
        email: 'duplicate@test.com',
        password: await bcrypt.hash('password123', 10),
        name: 'First User'
      });
      
      // Try to create second user with same email
      const res = await request(app)
        .post('/api/signup')
        .send({
          email: 'duplicate@test.com',
          password: 'SecurePassword123!',
          name: 'Second User'
        });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('already registered');
    });
    
  });
  
  describe('POST /api/login', () => {
    
    beforeEach(async () => {
      // Create a test user for login tests
      await User.create({
        email: 'logintest@test.com',
        password: await bcrypt.hash('CorrectPassword123!', 10),
        name: 'Login Test User',
        role: 'gf'
      });
    });
    
    it('should login with valid credentials', async () => {
      const res = await request(app)
        .post('/api/login')
        .send({
          email: 'logintest@test.com',
          password: 'CorrectPassword123!'
        });
      
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user).toHaveProperty('email', 'logintest@test.com');
      expect(res.body.user).toHaveProperty('role', 'gf');
    });
    
    it('should reject login with wrong password', async () => {
      const res = await request(app)
        .post('/api/login')
        .send({
          email: 'logintest@test.com',
          password: 'WrongPassword123!'
        });
      
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error', 'Invalid credentials');
    });
    
    it('should reject login with non-existent email', async () => {
      const res = await request(app)
        .post('/api/login')
        .send({
          email: 'nonexistent@test.com',
          password: 'SomePassword123!'
        });
      
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error', 'Invalid credentials');
    });
    
    it('should reject login with missing credentials', async () => {
      const res = await request(app)
        .post('/api/login')
        .send({});
      
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
    
    it('should lock account after 5 failed attempts', async () => {
      // Make 5 failed login attempts
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/login')
          .send({
            email: 'logintest@test.com',
            password: 'WrongPassword!'
          });
      }
      
      // 6th attempt should show locked message
      const res = await request(app)
        .post('/api/login')
        .send({
          email: 'logintest@test.com',
          password: 'WrongPassword!'
        });
      
      expect(res.status).toBe(423);
      expect(res.body.error).toContain('locked');
    });
    
  });
  
});

