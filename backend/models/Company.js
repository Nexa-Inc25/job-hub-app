const mongoose = require('mongoose');

// Subscription/billing info
const subscriptionSchema = new mongoose.Schema({
  plan: { type: String, enum: ['free', 'starter', 'pro', 'enterprise'], default: 'free' },
  seats: { type: Number, default: 5 },  // Number of users allowed
  billingEmail: String,
  stripeCustomerId: String,  // For Stripe integration
  currentPeriodEnd: Date,
  status: { type: String, enum: ['active', 'past_due', 'canceled', 'trialing'], default: 'active' }
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
  
  // The user who created/owns the company
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  // Status
  isActive: { type: Boolean, default: true },
  
}, { timestamps: true });

// Indexes (slug already has unique:true which creates an index)
companySchema.index({ isActive: 1 });
companySchema.index({ 'utilities': 1 });

// Generate slug from name before saving
companySchema.pre('save', function(next) {
  if (!this.slug && this.name) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 50);
  }
  next();
});

module.exports = mongoose.model('Company', companySchema);
