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
    minlength: 6
  },
  name: {
    type: String,
    trim: true
  },
  role: {
    type: String,
    enum: ['crew', 'foreman', 'gf', 'pm', 'admin'],
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
  
  createdAt: {
    type: Date,
    default: Date.now
  }
});

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