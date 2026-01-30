/**
 * Authentication Controller
 * 
 * Handles user authentication, registration, and session management.
 * Extracted from server.js - matches EXACT current behavior.
 * 
 * @module controllers/auth
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { logAuth } = require('../middleware/auditLogger');
const { performSecurityCheck } = require('../utils/securityAlerts');
const mfa = require('../utils/mfa');

/**
 * Password validation - matches current server.js rules
 */
const validatePassword = (password) => {
  if (!password || password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one uppercase letter' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one lowercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one number' };
  }
  return { valid: true };
};

/**
 * User Signup
 * POST /api/signup
 * 
 * Matches exact behavior from server.js lines 316-389
 */
const signup = async (req, res) => {
  try {
    const { email, password, name, role } = req.body;
    console.log('Signup attempt for:', email ? email.substring(0, 3) + '***' : 'none', 'role:', role || 'crew');
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Password strength validation
    const passwordCheck = validatePassword(password);
    if (!passwordCheck.valid) {
      return res.status(400).json({ error: passwordCheck.error });
    }
    
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      // Don't reveal that email exists - security best practice
      return res.status(400).json({ error: 'Unable to create account. Please try a different email or contact support.' });
    }
    
    // Validate role
    const validRoles = ['crew', 'foreman', 'gf', 'pm', 'admin'];
    const userRole = validRoles.includes(role) ? role : 'crew';
    
    // Determine permissions based on role
    const isAdmin = ['gf', 'pm', 'admin'].includes(userRole);
    const canApprove = ['gf', 'pm', 'admin'].includes(userRole);
    
    const user = new User({ 
      email, 
      password, 
      name: name || email.split('@')[0],
      role: userRole,
      isAdmin,
      canApprove
    });
    await user.save();
    
    const token = jwt.sign({ 
      userId: user._id, 
      isAdmin: user.isAdmin || false,
      isSuperAdmin: user.isSuperAdmin || false,
      role: user.role,
      canApprove: user.canApprove || false,
      name: user.name
    }, process.env.JWT_SECRET, { expiresIn: '24h' });
    
    console.log('User created successfully:', user._id, 'role:', userRole);
    res.status(201).json({ 
      token, 
      userId: user._id, 
      isAdmin: user.isAdmin || false,
      role: user.role,
      canApprove: user.canApprove || false
    });
  } catch (err) {
    console.error('Signup error:', err.message);
    res.status(500).json({ error: 'Server error during signup', details: err.message });
  }
};

/**
 * User Login
 * POST /api/login
 * 
 * Matches exact behavior from server.js lines 392-477
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    
    // Check if account is locked
    if (user && user.isLocked()) {
      const remainingMins = Math.ceil((user.lockoutUntil - new Date()) / 60000);
      console.log('Account locked for:', email ? email.substring(0, 3) + '***' : 'unknown');
      logAuth.loginFailed(req, email, 'Account locked');
      return res.status(423).json({ 
        error: `Account temporarily locked. Try again in ${remainingMins} minutes.` 
      });
    }
    
    // Validate credentials
    if (!user || !(await user.comparePassword(password))) {
      // Track failed attempt if user exists
      if (user) {
        await user.incLoginAttempts();
        console.log('Failed login attempt for:', email ? email.substring(0, 3) + '***' : 'unknown', 
          'Attempts:', user.failedLoginAttempts + 1);
        
        // Log account lockout if threshold reached
        if (user.failedLoginAttempts + 1 >= 5) {
          logAuth.accountLocked(req, email, user.failedLoginAttempts + 1);
        }
      }
      logAuth.loginFailed(req, email, 'Invalid credentials');
      performSecurityCheck(req, 'LOGIN_FAILED', { email });
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Reset failed attempts on successful login
    if (user.failedLoginAttempts > 0) {
      await user.resetLoginAttempts();
    }
    
    // Check if MFA is required
    if (user.mfaEnabled) {
      // Generate a temporary token for MFA verification (short expiry)
      const mfaToken = jwt.sign({ 
        userId: user._id, 
        mfaPending: true 
      }, process.env.JWT_SECRET, { expiresIn: '5m' });
      
      logAuth.loginSuccess(req, user);
      
      return res.json({
        mfaRequired: true,
        mfaToken,
        userId: user._id
      });
    }
    
    // Log successful login
    logAuth.loginSuccess(req, user);
    
    const token = jwt.sign({ 
      userId: user._id, 
      isAdmin: user.isAdmin,
      isSuperAdmin: user.isSuperAdmin || false,
      role: user.role,
      canApprove: user.canApprove || false,
      name: user.name
    }, process.env.JWT_SECRET, { expiresIn: '24h' });
    
    res.json({ 
      token, 
      userId: user._id, 
      isAdmin: user.isAdmin,
      isSuperAdmin: user.isSuperAdmin || false, 
      role: user.role, 
      canApprove: user.canApprove || false,
      name: user.name,
      mfaEnabled: false
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Server error during login' });
  }
};

/**
 * Verify MFA code during login
 * POST /api/auth/mfa/verify
 */
const verifyMfa = async (req, res) => {
  try {
    const { mfaToken, code, trustDevice } = req.body;
    
    if (!mfaToken || !code) {
      return res.status(400).json({ error: 'MFA token and code are required' });
    }
    
    // Verify the temporary MFA token
    let decoded;
    try {
      decoded = jwt.verify(mfaToken, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'MFA session expired. Please login again.' });
    }
    
    if (!decoded.mfaPending) {
      return res.status(400).json({ error: 'Invalid MFA token' });
    }
    
    const user = await User.findById(decoded.userId);
    if (!user || !user.mfaEnabled) {
      return res.status(400).json({ error: 'MFA not configured for this account' });
    }
    
    // Verify the TOTP code
    const isValid = mfa.verifyToken(user.mfaSecret, code);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid MFA code' });
    }
    
    // Generate full session token
    const token = jwt.sign({ 
      userId: user._id, 
      isAdmin: user.isAdmin,
      isSuperAdmin: user.isSuperAdmin || false,
      role: user.role,
      canApprove: user.canApprove || false,
      name: user.name
    }, process.env.JWT_SECRET, { expiresIn: '24h' });
    
    res.json({ 
      token, 
      userId: user._id, 
      isAdmin: user.isAdmin,
      isSuperAdmin: user.isSuperAdmin || false, 
      role: user.role, 
      canApprove: user.canApprove || false,
      name: user.name,
      mfaEnabled: true
    });
  } catch (err) {
    console.error('MFA verify error:', err.message);
    res.status(500).json({ error: 'Server error during MFA verification' });
  }
};

/**
 * Get current user profile
 * GET /api/users/me
 */
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('name email role isAdmin isSuperAdmin');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
  } catch (err) {
    console.error('Get profile error:', err.message);
    res.status(500).json({ error: 'Failed to get profile' });
  }
};

/**
 * Setup MFA - Generate secret and QR code
 * POST /api/auth/mfa/setup
 */
const setupMfa = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (user.mfaEnabled) {
      return res.status(400).json({ error: 'MFA is already enabled' });
    }
    
    // Generate new secret
    const { secret, qrCode } = await mfa.generateSecret(user.email);
    
    // Store secret temporarily (not enabled yet)
    user.mfaSecret = secret;
    await user.save();
    
    res.json({
      secret,
      qrCode,
      message: 'Scan this QR code with your authenticator app, then verify with a code'
    });
  } catch (err) {
    console.error('MFA setup error:', err.message);
    res.status(500).json({ error: 'Failed to setup MFA' });
  }
};

/**
 * Enable MFA - Verify initial code and activate
 * POST /api/auth/mfa/enable
 */
const enableMfa = async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Verification code is required' });
    }
    
    const user = await User.findById(req.userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (!user.mfaSecret) {
      return res.status(400).json({ error: 'MFA not set up. Please run setup first.' });
    }
    
    if (user.mfaEnabled) {
      return res.status(400).json({ error: 'MFA is already enabled' });
    }
    
    // Verify the code
    const isValid = mfa.verifyToken(user.mfaSecret, code);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid verification code' });
    }
    
    // Enable MFA
    user.mfaEnabled = true;
    user.mfaEnabledAt = new Date();
    await user.save();
    
    res.json({ 
      success: true, 
      message: 'MFA enabled successfully' 
    });
  } catch (err) {
    console.error('MFA enable error:', err.message);
    res.status(500).json({ error: 'Failed to enable MFA' });
  }
};

/**
 * Disable MFA
 * POST /api/auth/mfa/disable
 */
const disableMfa = async (req, res) => {
  try {
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({ error: 'Password is required to disable MFA' });
    }
    
    const user = await User.findById(req.userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Verify password
    const isValid = await user.comparePassword(password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid password' });
    }
    
    // Disable MFA
    user.mfaEnabled = false;
    user.mfaSecret = null;
    user.mfaEnabledAt = null;
    await user.save();
    
    res.json({ 
      success: true, 
      message: 'MFA disabled successfully' 
    });
  } catch (err) {
    console.error('MFA disable error:', err.message);
    res.status(500).json({ error: 'Failed to disable MFA' });
  }
};

/**
 * Get MFA status
 * GET /api/auth/mfa/status
 */
const getMfaStatus = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('mfaEnabled mfaEnabledAt mfaVerifiedDevices');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      mfaEnabled: user.mfaEnabled || false,
      mfaEnabledAt: user.mfaEnabledAt || null,
      trustedDevices: user.mfaVerifiedDevices?.length || 0
    });
  } catch (err) {
    console.error('MFA status error:', err.message);
    res.status(500).json({ error: 'Failed to get MFA status' });
  }
};

// Export for testing
module.exports = {
  signup,
  login,
  verifyMfa,
  getProfile,
  setupMfa,
  enableMfa,
  disableMfa,
  getMfaStatus,
  validatePassword
};
