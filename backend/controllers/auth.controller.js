/**
 * Authentication Controller
 * 
 * Handles user authentication, registration, and session management.
 * Extracted from server.js for modularity and testability.
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { logAuth } = require('../middleware/auditLogger');
const mfa = require('../utils/mfa');

/**
 * User Login
 * POST /api/login
 */
const login = async (req, res) => {
  try {
    const { email, password, mfaCode } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    
    if (!user) {
      await logAuth.loginFailed(req, email, 'User not found');
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Check if account is locked
    if (user.lockUntil && user.lockUntil > Date.now()) {
      const remainingTime = Math.ceil((user.lockUntil - Date.now()) / 60000);
      await logAuth.loginFailed(req, email, 'Account locked');
      return res.status(423).json({ 
        error: `Account locked. Try again in ${remainingTime} minutes.` 
      });
    }
    
    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      // Increment failed attempts
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      
      // Lock account after 5 failed attempts
      if (user.failedLoginAttempts >= 5) {
        user.lockUntil = Date.now() + 15 * 60 * 1000; // 15 minutes
        await user.save();
        await logAuth.accountLocked(req, email, user.failedLoginAttempts);
        return res.status(423).json({ 
          error: 'Account locked due to too many failed attempts. Try again in 15 minutes.' 
        });
      }
      
      await user.save();
      await logAuth.loginFailed(req, email, 'Invalid password');
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Check MFA if enabled
    if (user.mfaEnabled) {
      if (!mfaCode) {
        return res.status(200).json({ 
          requiresMFA: true,
          message: 'MFA code required' 
        });
      }
      
      const isValidMFA = mfa.verifyToken(user.mfaSecret, mfaCode);
      if (!isValidMFA) {
        await logAuth.loginFailed(req, email, 'Invalid MFA code');
        return res.status(401).json({ error: 'Invalid MFA code' });
      }
    }
    
    // Reset failed attempts on successful login
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    user.lastLogin = new Date();
    await user.save();
    
    // Generate JWT
    const token = jwt.sign(
      {
        userId: user._id,
        role: user.role,
        isAdmin: user.isAdmin,
        isSuperAdmin: user.isSuperAdmin,
        companyId: user.companyId
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    await logAuth.loginSuccess(req, user);
    
    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        isAdmin: user.isAdmin,
        isSuperAdmin: user.isSuperAdmin,
        companyId: user.companyId,
        mfaEnabled: user.mfaEnabled
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
};

/**
 * User Signup
 * POST /api/signup
 */
const signup = async (req, res) => {
  try {
    const { email, password, name, role = 'crew' } = req.body;
    
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }
    
    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    
    // Validate password strength
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);
    
    // Create user
    const user = await User.create({
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      name: name.trim(),
      role: role
    });
    
    // Generate JWT
    const token = jwt.sign(
      {
        userId: user._id,
        role: user.role,
        isAdmin: user.isAdmin,
        isSuperAdmin: user.isSuperAdmin,
        companyId: user.companyId
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.status(201).json({
      message: 'User created successfully',
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
    
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Signup failed' });
  }
};

/**
 * Get Current User Profile
 * GET /api/me
 */
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password -mfaSecret');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
    
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
};

/**
 * Update User Password
 * PUT /api/password
 */
const updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password required' });
    }
    
    const user = await User.findById(req.userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    // Validate new password
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }
    
    // Hash and save new password
    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();
    
    await logAuth.passwordChange(req, user._id);
    
    res.json({ message: 'Password updated successfully' });
    
  } catch (error) {
    console.error('Update password error:', error);
    res.status(500).json({ error: 'Failed to update password' });
  }
};

module.exports = {
  login,
  signup,
  getProfile,
  updatePassword
};

