/**
 * MFA/2FA Utilities
 * 
 * Implements TOTP (Time-based One-Time Password) for PG&E compliance.
 * Compatible with Google Authenticator, Microsoft Authenticator, Authy, etc.
 */

const { TOTP, Secret } = require('otpauth');
const QRCode = require('qrcode');
const crypto = require('node:crypto');

const APP_NAME = 'Job Hub Pro';
const ISSUER = 'JobHubPro';

/**
 * Generate a new TOTP secret for a user
 * @param {string} userEmail - User's email address
 * @returns {Object} { secret, otpauthUrl, qrCodeDataUrl }
 */
async function generateMFASecret(userEmail) {
  // Generate a random secret
  const secret = new Secret({ size: 20 });
  
  // Create TOTP instance
  const totp = new TOTP({
    issuer: ISSUER,
    label: userEmail,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: secret
  });
  
  // Generate OTP auth URL (for QR code)
  const otpauthUrl = totp.toString();
  
  // Generate QR code as data URL
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
    errorCorrectionLevel: 'M',
    width: 256,
    margin: 2
  });
  
  return {
    secret: secret.base32,
    otpauthUrl,
    qrCodeDataUrl
  };
}

/**
 * Verify a TOTP code
 * @param {string} token - 6-digit code from authenticator app
 * @param {string} secret - User's base32-encoded secret
 * @returns {boolean} True if valid
 */
function verifyMFAToken(token, secret) {
  if (!token || !secret) return false;
  
  try {
    const totp = new TOTP({
      issuer: ISSUER,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secret)
    });
    
    // Validate with a window of 1 (allows for slight clock drift)
    const delta = totp.validate({ token: token.toString(), window: 1 });
    
    // delta is null if invalid, otherwise returns the time step difference
    return delta !== null;
  } catch (err) {
    console.error('MFA verification error:', err.message);
    return false;
  }
}

/**
 * Generate backup codes for account recovery
 * @param {number} count - Number of codes to generate (default 10)
 * @returns {Array} Array of backup codes
 */
function generateBackupCodes(count = 10) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    // Generate 8-character alphanumeric codes
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    // Format as XXXX-XXXX for readability
    codes.push({
      code: code.slice(0, 4) + '-' + code.slice(4),
      used: false
    });
  }
  return codes;
}

/**
 * Hash a backup code for secure storage
 * @param {string} code - Plain backup code
 * @returns {string} Hashed code
 */
function hashBackupCode(code) {
  // Normalize: remove dashes, uppercase
  const normalized = code.replaceAll('-', '').toUpperCase();
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Verify a backup code
 * @param {string} code - Plain backup code entered by user
 * @param {Array} storedCodes - Array of { code: hashedCode, used: boolean }
 * @returns {number} Index of matching code, or -1 if not found/already used
 */
function verifyBackupCode(code, storedCodes) {
  if (!code || !storedCodes || storedCodes.length === 0) return -1;
  
  const hashedInput = hashBackupCode(code);
  
  for (let i = 0; i < storedCodes.length; i++) {
    if (!storedCodes[i].used && storedCodes[i].code === hashedInput) {
      return i;
    }
  }
  
  return -1;
}

/**
 * Generate a device ID for trusted device tracking
 * @param {Object} req - Express request object
 * @returns {string} Device identifier hash
 */
function generateDeviceId(req) {
  const components = [
    req.headers['user-agent'] || '',
    req.ip || req.headers['x-forwarded-for'] || '',
    req.headers['accept-language'] || ''
  ].join('|');
  
  return crypto.createHash('sha256').update(components).digest('hex').slice(0, 32);
}

/**
 * Check if a device is trusted
 * @param {string} deviceId - Current device ID
 * @param {Array} trustedDevices - User's trusted devices array
 * @returns {boolean} True if device is trusted
 */
function isDeviceTrusted(deviceId, trustedDevices) {
  if (!trustedDevices || trustedDevices.length === 0) return false;
  return trustedDevices.some(d => d.deviceId === deviceId);
}

module.exports = {
  generateMFASecret,
  verifyMFAToken,
  generateBackupCodes,
  hashBackupCode,
  verifyBackupCode,
  generateDeviceId,
  isDeviceTrusted
};

