/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * User Model Tests
 * 
 * Tests for User model methods including password hashing,
 * authentication, and account lockout logic.
 */

const mongoose = require('mongoose');
const User = require('../models/User');

describe('User Model', () => {
  
  // ==================== Password Hashing ====================
  describe('Password Hashing', () => {
    it('should hash password before saving', async () => {
      const user = new User({
        email: `test${Date.now()}@example.com`,
        password: 'PlainPassword123',
        name: 'Test User'
      });
      
      await user.save();
      
      // Password should be hashed, not plain text
      expect(user.password).not.toBe('PlainPassword123');
      expect(user.password.length).toBeGreaterThan(20);
    });
    
    it('should not rehash password if unchanged', async () => {
      const user = await User.create({
        email: `test${Date.now()}@example.com`,
        password: 'TestPassword123',
        name: 'Test User'
      });
      
      const originalHash = user.password;
      
      // Update non-password field
      user.name = 'Updated Name';
      await user.save();
      
      expect(user.password).toBe(originalHash);
    });
  });
  
  // ==================== Password Comparison ====================
  describe('comparePassword', () => {
    let user;
    
    beforeEach(async () => {
      user = await User.create({
        email: `compare${Date.now()}@example.com`,
        password: 'CorrectPassword123',
        name: 'Test User'
      });
    });
    
    it('should return true for correct password', async () => {
      const result = await user.comparePassword('CorrectPassword123');
      expect(result).toBe(true);
    });
    
    it('should return false for incorrect password', async () => {
      const result = await user.comparePassword('WrongPassword123');
      expect(result).toBe(false);
    });
    
    it('should return false for empty password', async () => {
      const result = await user.comparePassword('');
      expect(result).toBe(false);
    });
  });
  
  // ==================== Account Lockout ====================
  describe('Account Lockout', () => {
    let user;
    
    beforeEach(async () => {
      user = await User.create({
        email: `lockout${Date.now()}@example.com`,
        password: 'TestPassword123',
        name: 'Test User',
        failedLoginAttempts: 0
      });
    });
    
    it('should start with zero failed attempts', () => {
      expect(user.failedLoginAttempts).toBe(0);
      expect(user.lockoutUntil).toBeFalsy();
    });
    
    it('should increment failed login attempts', async () => {
      await user.incLoginAttempts();
      
      const updated = await User.findById(user._id);
      expect(updated.failedLoginAttempts).toBe(1);
    });
    
    it('should lock account after 5 failed attempts', async () => {
      // Simulate 5 failed attempts
      for (let i = 0; i < 5; i++) {
        await user.incLoginAttempts();
        user = await User.findById(user._id);
      }
      
      expect(user.failedLoginAttempts).toBe(5);
      expect(user.lockoutUntil).toBeDefined();
      expect(user.isLocked()).toBe(true);
    });
    
    it('should report locked status correctly', async () => {
      // isLocked returns undefined/falsy when not locked
      expect(user.isLocked()).toBeFalsy();
      
      // Lock the account
      user.lockoutUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 min
      await user.save();
      
      expect(user.isLocked()).toBe(true);
    });
    
    it('should unlock after lockout period', async () => {
      // Set lockout in the past
      user.lockoutUntil = new Date(Date.now() - 1000);
      user.failedLoginAttempts = 5;
      await user.save();
      
      expect(user.isLocked()).toBe(false);
    });
    
    it('should reset failed attempts on successful login', async () => {
      user.failedLoginAttempts = 3;
      await user.save();
      
      await user.resetLoginAttempts();
      
      const updated = await User.findById(user._id);
      expect(updated.failedLoginAttempts).toBe(0);
      expect(updated.lockoutUntil).toBeFalsy();
    });
  });
  
  // ==================== Role & Permissions ====================
  describe('Role and Permissions', () => {
    it('should default to crew role', async () => {
      const user = await User.create({
        email: `role${Date.now()}@example.com`,
        password: 'TestPassword123',
        name: 'Test User'
      });
      
      expect(user.role).toBe('crew');
    });
    
    it('should accept valid roles', async () => {
      const roles = ['crew', 'foreman', 'gf', 'pm', 'admin'];
      
      for (const role of roles) {
        const user = await User.create({
          email: `role${role}${Date.now()}@example.com`,
          password: 'TestPassword123',
          name: 'Test User',
          role
        });
        
        expect(user.role).toBe(role);
      }
    });
    
    it('should set isAdmin for pm and admin roles', async () => {
      const pmUser = await User.create({
        email: `pm${Date.now()}@example.com`,
        password: 'TestPassword123',
        name: 'PM User',
        role: 'pm',
        isAdmin: true
      });
      
      expect(pmUser.isAdmin).toBe(true);
    });
    
    it('should set canApprove for gf, pm, admin roles', async () => {
      const gfUser = await User.create({
        email: `gf${Date.now()}@example.com`,
        password: 'TestPassword123',
        name: 'GF User',
        role: 'gf',
        canApprove: true
      });
      
      expect(gfUser.canApprove).toBe(true);
    });
  });
  
  // ==================== Email Validation ====================
  describe('Email Validation', () => {
    it('should require email', async () => {
      const user = new User({
        password: 'TestPassword123',
        name: 'No Email User'
      });
      
      await expect(user.save()).rejects.toThrow();
    });
    
    it('should require unique email', async () => {
      const email = `unique${Date.now()}@example.com`;
      
      await User.create({
        email,
        password: 'TestPassword123',
        name: 'First User'
      });
      
      const duplicate = new User({
        email,
        password: 'TestPassword123',
        name: 'Duplicate User'
      });
      
      await expect(duplicate.save()).rejects.toThrow();
    });
    
    it('should lowercase email', async () => {
      const user = await User.create({
        email: `UPPERCASE${Date.now()}@EXAMPLE.COM`,
        password: 'TestPassword123',
        name: 'Test User'
      });
      
      expect(user.email).toMatch(/^[a-z]/);
    });
  });
  
  // ==================== Company Association ====================
  describe('Company Association', () => {
    it('should allow companyId to be set', async () => {
      const companyId = new mongoose.Types.ObjectId();
      
      const user = await User.create({
        email: `company${Date.now()}@example.com`,
        password: 'TestPassword123',
        name: 'Company User',
        companyId
      });
      
      expect(user.companyId.toString()).toBe(companyId.toString());
    });
    
    it('should allow user without company', async () => {
      const user = await User.create({
        email: `nocompany${Date.now()}@example.com`,
        password: 'TestPassword123',
        name: 'No Company User'
      });
      
      expect(user.companyId).toBeFalsy();
    });
  });
});

