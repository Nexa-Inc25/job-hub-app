/**
 * FieldLedger - User Model
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 8  // Increased from 6 to 8
  },
  name: {
    type: String,
    trim: true
  },
  role: {
    type: String,
    enum: ['crew', 'foreman', 'gf', 'qa', 'pm', 'admin'],
    default: 'crew'
  },
  // Computed admin check - gf, pm, and admin roles can approve documents
  isAdmin: {
    type: Boolean,
    default: false
  },
  // Can this user approve draft documents?
  canApprove: {
    type: Boolean,
    default: false
  },
  
  // === SUPER ADMIN - FieldLedger Platform Owners Only ===
  // Only 2-3 people should have this - the actual owners of FieldLedger SaaS
  // Super admins can: access owner dashboard, onboard new companies, manage all users
  isSuperAdmin: {
    type: Boolean,
    default: false
  },
  
  // === MULTI-TENANT FIELDS (optional for backwards compatibility) ===
  // Which company this user belongs to
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
  
  // User type: contractor employee vs utility employee
  userType: {
    type: String,
    enum: ['contractor', 'utility'],
    default: 'contractor'
  },
  
  // For utility employees - which utility they work for
  utilityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Utility' },
  
  // Profile info
  phone: String,
  avatar: String,  // URL to profile picture
  
  // Security - account lockout
  failedLoginAttempts: { type: Number, default: 0 },
  lockoutUntil: { type: Date, default: null },
  lastFailedLogin: { type: Date, default: null },
  
  // === MFA/2FA (PG&E Exhibit DATA-1 Compliance) ===
  mfaEnabled: { type: Boolean, default: false },
  mfaSecret: { type: String, select: false }, // TOTP secret - hidden by default
  mfaBackupCodes: [{ 
    code: { type: String, select: false },
    used: { type: Boolean, default: false },
    usedAt: Date
  }],
  mfaEnabledAt: Date,
  mfaVerifiedDevices: [{
    deviceId: String,
    deviceName: String,
    lastUsed: Date,
    createdAt: { type: Date, default: Date.now }
  }],
  
  // Password history for compliance (prevent reuse)
  passwordHistory: [{
    hash: { type: String, select: false },
    changedAt: Date
  }],
  passwordChangedAt: Date,
  mustChangePassword: { type: Boolean, default: false },
  
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Check if account is currently locked
userSchema.methods.isLocked = function() {
  return this.lockoutUntil && this.lockoutUntil > new Date();
};

// Increment failed login attempts and lock if threshold reached
userSchema.methods.incLoginAttempts = async function() {
  // Reset if lockout has expired
  if (this.lockoutUntil && this.lockoutUntil < new Date()) {
    await this.updateOne({
      $set: { failedLoginAttempts: 1, lastFailedLogin: new Date() },
      $unset: { lockoutUntil: 1 }
    });
    return;
  }
  
  const updates = {
    $inc: { failedLoginAttempts: 1 },
    $set: { lastFailedLogin: new Date() }
  };
  
  // Lock account after 5 failed attempts (30 minute lockout)
  if (this.failedLoginAttempts + 1 >= 5) {
    updates.$set.lockoutUntil = new Date(Date.now() + 30 * 60 * 1000);
  }
  
  await this.updateOne(updates);
};

// Reset failed login attempts on successful login
userSchema.methods.resetLoginAttempts = async function() {
  await this.updateOne({
    $set: { failedLoginAttempts: 0 },
    $unset: { lockoutUntil: 1, lastFailedLogin: 1 }
  });
};

// Indexes
userSchema.index({ companyId: 1 });
userSchema.index({ utilityId: 1, userType: 1 });

// Password hashing middleware
userSchema.pre('save', async function(next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

// Method to compare passwords
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);