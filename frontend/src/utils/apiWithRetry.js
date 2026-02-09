/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * API Wrapper with Retry Logic
 * 
 * Provides automatic retry for failed API calls with exponential backoff.
 * Handles network errors gracefully for field workers with spotty connectivity.
 */

import api from '../api';

// Default retry configuration
const DEFAULT_RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  retryableStatuses: [408, 429, 500, 502, 503, 504],
  retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'Network Error']
};

/**
 * Sleep for specified milliseconds
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Calculate delay with exponential backoff and jitter
 */
const getRetryDelay = (attempt, baseDelay, maxDelay) => {
  // Exponential backoff: 1s, 2s, 4s, etc.
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  // Add random jitter (±25%) to prevent thundering herd
  // SECURITY NOTE: Math.random() is safe here - used only for non-security timing jitter.
  // No cryptographic use, not for tokens/sessions/auth. See OWASP guidelines.
  const jitter = exponentialDelay * (0.75 + Math.random() * 0.5); // NOSONAR
  return Math.min(jitter, maxDelay);
};

/**
 * Check if error is retryable
 */
const isRetryable = (error, config) => {
  // Network errors (no response)
  if (!error.response) {
    const errorMessage = error.message || '';
    return config.retryableErrors.some(e => errorMessage.includes(e));
  }
  
  // Server errors
  return config.retryableStatuses.includes(error.response.status);
};

/**
 * Make an API request with automatic retry
 */
export async function apiWithRetry(method, url, data = null, options = {}) {
  const config = { ...DEFAULT_RETRY_CONFIG, ...options.retry };
  let lastError;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      let response;
      
      switch (method.toLowerCase()) {
        case 'get':
          response = await api.get(url, options);
          break;
        case 'post':
          response = await api.post(url, data, options);
          break;
        case 'put':
          response = await api.put(url, data, options);
          break;
        case 'patch':
          response = await api.patch(url, data, options);
          break;
        case 'delete':
          response = await api.delete(url, options);
          break;
        default:
          throw new Error(`Unsupported method: ${method}`);
      }
      
      return response;
    } catch (error) {
      lastError = error;
      
      // Don't retry if it's not a retryable error or we've exhausted retries
      if (!isRetryable(error, config) || attempt === config.maxRetries) {
        throw error;
      }
      
      // Calculate delay and wait
      const delay = getRetryDelay(attempt, config.baseDelay, config.maxDelay);
      console.warn(`API request failed, retrying in ${Math.round(delay)}ms... (attempt ${attempt + 1}/${config.maxRetries})`);
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Convenience methods
 */
export const retryGet = (url, options) => apiWithRetry('get', url, null, options);
export const retryPost = (url, data, options) => apiWithRetry('post', url, data, options);
export const retryPut = (url, data, options) => apiWithRetry('put', url, data, options);
export const retryPatch = (url, data, options) => apiWithRetry('patch', url, data, options);
export const retryDelete = (url, options) => apiWithRetry('delete', url, null, options);

/**
 * User-friendly error message generator
 */
export function getErrorMessage(error) {
  // Network/connectivity errors
  if (!error.response) {
    if (!navigator.onLine) {
      return 'You appear to be offline. Please check your internet connection.';
    }
    if (error.message?.includes('timeout')) {
      return 'The request timed out. Please try again.';
    }
    return 'Unable to connect to the server. Please check your connection and try again.';
  }
  
  // HTTP errors
  const status = error.response.status;
  const serverMessage = error.response.data?.error || error.response.data?.message;
  
  switch (status) {
    case 400:
      return serverMessage || 'Invalid request. Please check your input.';
    case 401:
      return 'Your session has expired. Please log in again.';
    case 403:
      return 'You don\'t have permission to perform this action.';
    case 404:
      return serverMessage || 'The requested resource was not found.';
    case 409:
      return serverMessage || 'This action conflicts with existing data.';
    case 413:
      return 'The file is too large to upload.';
    case 429:
      return 'Too many requests. Please wait a moment and try again.';
    case 500:
      return 'A server error occurred. Our team has been notified.';
    case 502:
    case 503:
    case 504:
      return 'The server is temporarily unavailable. Please try again in a few minutes.';
    default:
      return serverMessage || `An error occurred (${status}). Please try again.`;
  }
}

export default {
  apiWithRetry,
  retryGet,
  retryPost,
  retryPut,
  retryPatch,
  retryDelete,
  getErrorMessage
};

