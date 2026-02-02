/**
 * Input Sanitization Utilities
 * Prevents NoSQL injection and path traversal attacks
 * 
 * @module utils/sanitize
 */

const mongoose = require('mongoose');
const path = require('node:path');

/**
 * Sanitize a string value for use in MongoDB queries
 * Removes operators and special characters that could be used for injection
 * 
 * @param {any} value - Value to sanitize
 * @returns {string|null} Sanitized string or null
 */
const sanitizeString = (value) => {
  if (value === null || value === undefined) {
    return null;
  }
  
  // If it's an object (potential injection), convert to string or reject
  if (typeof value === 'object') {
    return null;
  }
  
  // Convert to string and trim
  const str = String(value).trim();
  
  // Reject strings starting with $ (MongoDB operators)
  if (str.startsWith('$')) {
    return null;
  }
  
  return str;
};

/**
 * Validate and sanitize a MongoDB ObjectId
 * Returns null if invalid
 * 
 * @param {string} id - ID to validate
 * @returns {mongoose.Types.ObjectId|null} Valid ObjectId or null
 */
const sanitizeObjectId = (id) => {
  if (!id) return null;
  
  // Reject objects (injection attempt)
  if (typeof id === 'object' && !(id instanceof mongoose.Types.ObjectId)) {
    return null;
  }
  
  const idStr = String(id).trim();
  
  // Validate ObjectId format
  if (!mongoose.Types.ObjectId.isValid(idStr)) {
    return null;
  }
  
  // Extra check: length should be 24 hex chars
  if (!/^[a-fA-F0-9]{24}$/.test(idStr)) {
    return null;
  }
  
  return new mongoose.Types.ObjectId(idStr);
};

/**
 * Sanitize an email address
 * 
 * @param {string} email - Email to sanitize
 * @returns {string|null} Sanitized email or null
 */
const sanitizeEmail = (email) => {
  const sanitized = sanitizeString(email);
  if (!sanitized) return null;
  
  // Basic email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(sanitized)) {
    return null;
  }
  
  return sanitized.toLowerCase();
};

/**
 * Sanitize a positive integer
 * 
 * @param {any} value - Value to sanitize
 * @param {number} defaultValue - Default if invalid
 * @param {number} max - Maximum allowed value
 * @returns {number} Sanitized integer
 */
const sanitizeInt = (value, defaultValue = 0, max = Number.MAX_SAFE_INTEGER) => {
  const num = Number.parseInt(value, 10);
  if (Number.isNaN(num) || num < 0) {
    return defaultValue;
  }
  return Math.min(num, max);
};

/**
 * Sanitize pagination parameters
 * 
 * @param {object} params - Object with page, limit, skip
 * @returns {object} Sanitized pagination params
 */
const sanitizePagination = ({ page, limit, skip }) => {
  return {
    page: sanitizeInt(page, 1, 10000),
    limit: sanitizeInt(limit, 20, 100),
    skip: sanitizeInt(skip, 0, 100000)
  };
};

/**
 * Sanitize a file path to prevent path traversal
 * 
 * @param {string} filePath - Path to sanitize
 * @param {string} baseDir - Base directory (path must stay within)
 * @returns {string|null} Safe path or null if traversal detected
 */
const sanitizePath = (filePath, baseDir) => {
  if (!filePath || typeof filePath !== 'string') {
    return null;
  }
  
  // Remove null bytes
  const cleaned = filePath.replaceAll('\0', '');
  
  // Normalize the path
  const normalized = path.normalize(cleaned);
  
  // Check for path traversal attempts
  if (normalized.includes('..')) {
    return null;
  }
  
  // If baseDir provided, ensure path stays within it
  if (baseDir) {
    const resolvedBase = path.resolve(baseDir);
    const resolvedPath = path.resolve(baseDir, normalized);
    
    if (!resolvedPath.startsWith(resolvedBase)) {
      return null;
    }
    
    return resolvedPath;
  }
  
  return normalized;
};

/**
 * Sanitize a date value
 * 
 * @param {any} value - Date value to sanitize
 * @returns {Date|null} Valid Date or null
 */
const sanitizeDate = (value) => {
  if (!value) return null;
  
  // Reject objects that aren't dates
  if (typeof value === 'object' && !(value instanceof Date)) {
    // Allow date strings as objects from query params
    if (value.$gt || value.$gte || value.$lt || value.$lte) {
      return null; // Reject operator injection
    }
  }
  
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  
  return date;
};

/**
 * Sanitize query object - removes MongoDB operators from user input
 * Use for building safe queries from request bodies
 * 
 * @param {object} obj - Object to sanitize
 * @returns {object} Sanitized object
 */
const sanitizeQueryObject = (obj) => {
  if (!obj || typeof obj !== 'object') {
    return {};
  }
  
  const result = {};
  
  for (const [key, value] of Object.entries(obj)) {
    // Skip keys starting with $
    if (key.startsWith('$')) {
      continue;
    }
    
    // Skip prototype pollution attempts
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    
    if (typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)) {
      // Recursively sanitize nested objects
      const sanitized = sanitizeQueryObject(value);
      if (Object.keys(sanitized).length > 0) {
        result[key] = sanitized;
      }
    } else if (Array.isArray(value)) {
      // Sanitize arrays (but don't allow operator arrays)
      result[key] = value.filter(v => typeof v !== 'object' || v instanceof Date);
    } else {
      result[key] = value;
    }
  }
  
  return result;
};

/**
 * Sanitize a PM number (alphanumeric with limited special chars)
 * 
 * @param {string} pmNumber - PM number to sanitize
 * @returns {string|null} Sanitized PM number or null
 */
const sanitizePmNumber = (pmNumber) => {
  const sanitized = sanitizeString(pmNumber);
  if (!sanitized) return null;
  
  // Allow alphanumeric, dashes, underscores, and spaces
  if (!/^[a-zA-Z0-9\-_\s]+$/.test(sanitized)) {
    return null;
  }
  
  return sanitized;
};

/**
 * Sanitize sort field - only allow known field names
 * 
 * @param {string} field - Field to sort by
 * @param {string[]} allowedFields - List of allowed field names
 * @returns {string|null} Safe field name or null
 */
const sanitizeSortField = (field, allowedFields = []) => {
  const sanitized = sanitizeString(field);
  if (!sanitized) return null;
  
  // Default allowed sort fields if none provided
  const defaults = ['createdAt', 'updatedAt', 'name', 'title', 'date', 'status'];
  const allowed = allowedFields.length > 0 ? allowedFields : defaults;
  
  // Handle -field for descending
  const fieldName = sanitized.startsWith('-') ? sanitized.slice(1) : sanitized;
  
  if (!allowed.includes(fieldName)) {
    return null;
  }
  
  return sanitized;
};

module.exports = {
  sanitizeString,
  sanitizeObjectId,
  sanitizeEmail,
  sanitizeInt,
  sanitizePagination,
  sanitizePath,
  sanitizeDate,
  sanitizeQueryObject,
  sanitizePmNumber,
  sanitizeSortField
};

