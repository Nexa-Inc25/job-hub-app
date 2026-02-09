/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Cryptographic Utilities for NIST SP 800-53 Compliance
 * 
 * Provides:
 * - SHA-256 hashing for Digital Receipt integrity (NIST SC-8)
 * - Payload checksums for transmission verification
 * - Token validation utilities
 * 
 * @module utils/crypto.utils
 */

/**
 * Generate SHA-256 hash of a string
 * Used for Digital Receipt integrity verification
 * 
 * @param {string} data - Data to hash
 * @returns {Promise<string>} Hex-encoded hash
 */
export async function sha256(data) {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a checksum for a payload object
 * Creates a deterministic hash of the payload for transmission verification
 * 
 * NIST SC-8: Transmission Security
 * The hash acts as a checksum to prevent tampering in transit
 * 
 * @param {Object} payload - The payload to hash
 * @returns {Promise<string>} SHA-256 hash of the payload
 */
export async function generatePayloadChecksum(payload) {
  // Create a deterministic JSON string (sorted keys)
  const sortedPayload = JSON.stringify(payload, Object.keys(payload).sort((a, b) => a.localeCompare(b)));
  return await sha256(sortedPayload);
}

/**
 * Generate a Digital Receipt hash
 * Combines GPS, timestamp, and photo data into a unique identifier
 * 
 * @param {Object} receipt - Digital receipt data
 * @param {Object} receipt.gps - GPS coordinates
 * @param {string} receipt.timestamp - ISO timestamp
 * @param {string} receipt.photoHash - Hash of the photo data
 * @param {string} receipt.deviceId - Device identifier
 * @returns {Promise<string>} Digital Receipt hash
 */
export async function generateDigitalReceiptHash(receipt) {
  const receiptData = {
    lat: receipt.gps?.lat || 0,
    lng: receipt.gps?.lng || 0,
    accuracy: receipt.gps?.accuracy || 0,
    timestamp: receipt.timestamp,
    photoHash: receipt.photoHash || '',
    deviceId: receipt.deviceId || '',
  };
  
  return await sha256(JSON.stringify(receiptData));
}

/**
 * Hash a photo blob for integrity verification
 * 
 * @param {Blob|string} photo - Photo blob or data URL
 * @returns {Promise<string>} SHA-256 hash of photo data
 */
export async function hashPhoto(photo) {
  let arrayBuffer;
  
  if (photo instanceof Blob) {
    arrayBuffer = await photo.arrayBuffer();
  } else if (typeof photo === 'string' && photo.startsWith('data:')) {
    // Data URL
    const base64 = photo.split(',')[1];
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      // NOSONAR: Use charCodeAt for byte values (0-255), not codePointAt which can exceed byte range
      // Binary strings from atob() are guaranteed to have values 0-255, codePointAt would be incorrect
      bytes[i] = binaryString.charCodeAt(i); // NOSONAR
    }
    arrayBuffer = bytes.buffer;
  } else {
    throw new Error('Invalid photo format');
  }
  
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Decode JWT token without verification
 * Used for checking expiration on client side
 * 
 * @param {string} token - JWT token
 * @returns {Object|null} Decoded payload or null if invalid
 */
export function decodeJWT(token) {
  try {
    if (!token) return null;
    
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const payload = parts[1];
    const decoded = atob(payload.replaceAll('-', '+').replaceAll('_', '/'));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Check if JWT token is expired
 * 
 * NIST AC-3: Session Containment
 * Sync must pause if token is expired
 * 
 * @param {string} token - JWT token
 * @param {number} bufferSeconds - Seconds before expiry to consider expired (default 60)
 * @returns {boolean} True if expired or invalid
 */
export function isTokenExpired(token, bufferSeconds = 60) {
  const decoded = decodeJWT(token);
  if (!decoded?.exp) return true;
  
  const expiryTime = decoded.exp * 1000; // Convert to milliseconds
  const bufferMs = bufferSeconds * 1000;
  
  return Date.now() >= (expiryTime - bufferMs);
}

/**
 * Get time until token expiry
 * 
 * @param {string} token - JWT token
 * @returns {number} Milliseconds until expiry, 0 if expired/invalid
 */
export function getTokenTTL(token) {
  const decoded = decodeJWT(token);
  if (!decoded?.exp) return 0;
  
  const expiryTime = decoded.exp * 1000;
  const remaining = expiryTime - Date.now();
  
  return Math.max(0, remaining);
}

/**
 * Generate a unique device signature
 * Used for audit trail identification
 * 
 * @returns {Promise<string>} Device signature hash
 */
export async function generateDeviceSignature() {
  // Get platform info, preferring modern userAgentData API with fallback
  const getPlatform = () => {
    if (navigator.userAgentData?.platform) {
      return navigator.userAgentData.platform;
    }
    // Fallback for browsers without userAgentData
    return navigator.userAgent || 'unknown';
  };

  const fingerprint = {
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: getPlatform(),
    screenWidth: screen.width,
    screenHeight: screen.height,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
  
  return await sha256(JSON.stringify(fingerprint));
}

/**
 * Verify a payload checksum
 * 
 * @param {Object} payload - The payload to verify
 * @param {string} expectedChecksum - The expected checksum
 * @returns {Promise<boolean>} True if checksum matches
 */
export async function verifyPayloadChecksum(payload, expectedChecksum) {
  const actualChecksum = await generatePayloadChecksum(payload);
  return actualChecksum === expectedChecksum;
}

export default {
  sha256,
  generatePayloadChecksum,
  generateDigitalReceiptHash,
  hashPhoto,
  decodeJWT,
  isTokenExpired,
  getTokenTTL,
  generateDeviceSignature,
  verifyPayloadChecksum,
};

