/**
 * FieldLedger - API Client
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 */

import axios from 'axios';

// Create axios instance with base URL
// Use custom domain for API
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'https://api.fieldledger.io',
  timeout: 60000, // 60 second timeout for large PDF uploads
  maxContentLength: 100 * 1024 * 1024, // 100MB
  maxBodyLength: 100 * 1024 * 1024, // 100MB
});

// Add auth token to all requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 responses (token expired)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('isAdmin');
      // Emit auth-required event for sync manager to catch
      window.dispatchEvent(new CustomEvent('auth-required', { 
        detail: { reason: 'token_expired' } 
      }));
      // Optionally redirect to login
      if (globalThis.location.pathname !== '/login' && globalThis.location.pathname !== '/signup') {
        globalThis.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

/**
 * NIST AC-3: Session Containment
 * Check if user is authenticated with a valid token
 * 
 * @returns {boolean} True if authenticated with valid token
 */
api.isAuthenticated = function() {
  const token = localStorage.getItem('token');
  if (!token) return false;
  
  // Decode and check expiration
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (!payload.exp) return true; // No expiry, assume valid
    
    // Check if expired (with 60 second buffer)
    const expiryTime = payload.exp * 1000;
    return Date.now() < (expiryTime - 60000);
  } catch {
    return false;
  }
};

/**
 * Get the current auth token
 * 
 * @returns {string|null} Current token or null
 */
api.getToken = function() {
  return localStorage.getItem('token');
};

export default api;
