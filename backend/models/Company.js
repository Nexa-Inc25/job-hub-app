/**
 * FieldLedger - Company Model
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 */

const mongoose = require('mongoose');

// Subscription/billing info
const subscriptionSchema = new mongoose.Schema({
  // Plan tier
  plan: { 
    type: String, 
    enum: ['free', 'starter', 'professional', 'enterprise'], 
    default: 'free' 
  },
  
  // Seat limits per plan
  seats: { type: Number, default: 5 },  // Number of users allowed
  seatsUsed: { type: Number, default: 0 },  // Current active users
  
  // Billing contact
  billingEmail: String,
  billingName: String,
  
  // Stripe integration
  stripeCustomerId: String,
  stripeSubscriptionId: String,
  stripePriceId: String,
  
  // Subscription lifecycle
  status: { 
    type: String, 
    enum: ['active', 'past_due', 'canceled', 'trialing', 'incomplete', 'incomplete_expired', 'unpaid'], 
    default: 'active' 
  },
  currentPeriodStart: Date,
  currentPeriodEnd: Date,
  cancelAtPeriodEnd: { type: Boolean, default: false },
  canceledAt: Date,
  
  // Trial management
  trialStart: Date,
  trialEnd: Date,
  
  // Usage-based billing (for AI features)
  aiCreditsIncluded: { type: Number, default: 100 },  // Per month
  aiCreditsUsed: { type: Number, default: 0 },
  aiCreditsResetDate: Date,
  
  // Feature flags by plan (overrides defaults)
  features: {
    smartForms: { type: Boolean, default: false },
    oracleExport: { type: Boolean, default: false },
    apiAccess: { type: Boolean, default: false },
    ssoEnabled: { type: Boolean, default: false },
    prioritySupport: { type: Boolean, default: false },
    customBranding: { type: Boolean, default: false },
    advancedAnalytics: { type: Boolean, default: false },
    unlimitedStorage: { type: Boolean, default: false }
  },
  
  // Billing history (last payment info)
  lastPaymentAmount: Number,
  lastPaymentDate: Date,
  lastPaymentStatus: String
});

// Company settings
const settingsSchema = new mongoose.Schema({
  logoUrl: String,
  primaryColor: String,
  timezone: { type: String, default: 'America/Los_Angeles' },
  defaultDivision: { type: String, default: 'DA' },
  // Notification preferences
  emailNotifications: { type: Boolean, default: true },
  smsNotifications: { type: Boolean, default: false }
});

// Security and compliance settings (PG&E Exhibit 5/DATA-1)
const securitySettingsSchema = new mongoose.Schema({
  // Data retention (per PG&E Exhibit 5 - 7 years default)
  dataRetentionYears: { type: Number, default: 7 },
  autoDeleteAfterRetention: { type: Boolean, default: false },
  
  // MFA settings
  mfaRequired: { type: Boolean, default: false },
  mfaRequiredForRoles: [{ type: String, enum: ['admin', 'pm', 'gf', 'qa', 'foreman', 'crew'] }],
  
  // Password policy
  passwordMinLength: { type: Number, default: 8 },
  passwordRequireUppercase: { type: Boolean, default: true },
  passwordRequireLowercase: { type: Boolean, default: true },
  passwordRequireNumber: { type: Boolean, default: true },
  passwordRequireSpecial: { type: Boolean, default: false },
  passwordExpiryDays: { type: Number, default: 0 }, // 0 = no expiry
  
  // Session settings
  sessionTimeoutMinutes: { type: Number, default: 480 }, // 8 hours
  maxConcurrentSessions: { type: Number, default: 5 },
  
  // Access controls
  ipWhitelist: [String], // Empty = allow all
  allowedDomains: [String], // For email-based access control
  
  // Audit settings
  auditLogRetentionDays: { type: Number, default: 2557 }, // 7 years
  alertOnCriticalEvents: { type: Boolean, default: true },
  securityAlertEmails: [String],
  
  // Compliance certifications
  certifications: [{
    name: String, // e.g., "ISO 27001", "SOC 2 Type II"
    issueDate: Date,
    expiryDate: Date,
    certificateUrl: String
  }],
  
  // Last security review
  lastSecurityReview: Date,
  nextSecurityReview: Date,
  securityReviewNotes: String
});

// Main Company schema
const companySchema = new mongoose.Schema({
  name: { type: String, required: true },  // "ABC Electrical Contractors"
  slug: { type: String, unique: true },  // "abc-electrical" - for URLs
  
  // Contact info
  email: String,
  phone: String,
  address: String,
  city: String,
  state: String,
  zip: String,
  
  // Which utilities this company works for
  utilities: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Utility' }],
  defaultUtility: { type: mongoose.Schema.Types.ObjectId, ref: 'Utility' },
  
  // License/contractor info
  contractorLicense: String,
  insuranceExpiry: Date,
  
  // Subscription/billing
  subscription: subscriptionSchema,
  
  // Company settings
  settings: settingsSchema,
  
  // Security and compliance settings
  securitySettings: securitySettingsSchema,
  
  // The user who created/owns the company
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  // Status
  isActive: { type: Boolean, default: true },
  
  // Demo sandbox flags
  isDemo: { type: Boolean, default: false },
  demoSessionId: { type: String, index: true },
  demoExpiresAt: { type: Date },
  
  // Custom folder structure template for jobs
  // Each company can have their own organizational structure
  folderTemplate: [{
    name: String,
    subfolders: [{
      name: String,
      subfolders: [{
        name: String,
        subfolders: [mongoose.Schema.Types.Mixed]  // Allow deeper nesting
      }]
    }]
  }],
  
}, { timestamps: true });

// Indexes (slug already has unique:true which creates an index)
companySchema.index({ isActive: 1 });
companySchema.index({ 'utilities': 1 });

// Generate slug from name before saving
companySchema.pre('save', function(next) {
  if (!this.slug && this.name) {
    this.slug = this.name
      .toLowerCase()
      .replaceAll(/[^a-z0-9\s-]/g, '')
      .replaceAll(/\s+/g, '-')
      .substring(0, 50);
  }
  next();
});

module.exports = mongoose.model('Company', companySchema);
