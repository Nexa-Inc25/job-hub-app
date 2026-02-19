/**
 * FieldLedger - API Client
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 */

import * as Sentry from '@sentry/react';
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
      globalThis.dispatchEvent(new CustomEvent('auth-required', { 
        detail: { reason: 'token_expired' } 
      }));
      // Optionally redirect to login (except for public pages)
      const publicPaths = ['/login', '/signup', '/demo'];
      if (!publicPaths.includes(globalThis.location.pathname)) {
        globalThis.location.href = '/login';
      }
    }
    if (error.response?.status >= 500) {
      Sentry.captureException(error, {
        tags: { apiStatus: error.response.status },
        extra: { url: error.config?.url, method: error.config?.method },
      });
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
    
    const payload = JSON.parse(atob(parts[1].replaceAll('-', '+').replaceAll('_', '/')));
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

// ---------------------------------------------------------------------------
// Signed File URL Resolution (Ghost Ship Audit Fix #1)
//
// All file access now requires authentication + company-scoped authorization.
// The backend generates short-lived (15min) R2 signed URLs after verifying
// the requesting user's company owns the file.
//
// In-memory cache prevents redundant API calls when the same file is
// referenced multiple times on a page (e.g. thumbnails in a grid).
// ---------------------------------------------------------------------------

/** @type {Map<string, {url: string, expiresAt: number}>} */
const signedUrlCache = new Map();

/** Buffer before expiry to trigger refresh (2 minutes) */
const REFRESH_BUFFER_MS = 2 * 60 * 1000;

/** Maximum cache entries to prevent memory leaks on long sessions */
const MAX_CACHE_ENTRIES = 500;

/**
 * Get a signed URL for an R2 file key.
 * Returns a cached URL if still valid, otherwise fetches a new one.
 *
 * @param {string} r2Key - The R2 object key (e.g. "jobs/abc123/photos/img.jpg")
 * @returns {Promise<string>} The signed URL ready for use in <img src> or fetch()
 * @throws {Error} If the file is not found or access is denied
 */
api.getSignedFileUrl = async function(r2Key) {
  if (!r2Key) return '';

  // If URL is already absolute (legacy http URLs), return as-is
  if (r2Key.startsWith('http://') || r2Key.startsWith('https://')) return r2Key;

  // Strip leading /api/files/ prefix if passed (backward compat with old URLs)
  const cleanKey = r2Key.replace(/^\/api\/files\//, '');

  // Check cache
  const cached = signedUrlCache.get(cleanKey);
  if (cached && cached.expiresAt > Date.now() + REFRESH_BUFFER_MS) {
    return cached.url;
  }

  // Fetch new signed URL from backend
  const response = await api.get(`/api/files/signed/${cleanKey}`);
  const { url, expiresAt, ttlSeconds } = response.data;

  // If the backend returned a relative proxy URL (e.g. /api/files/proxy/KEY),
  // resolve it to a full URL using the API base so fetch() and <img src> work
  // from the frontend origin (which differs from the API origin).
  const apiBase = (import.meta.env.VITE_API_URL || 'https://api.fieldledger.io').replace(/\/+$/, '');
  const resolvedUrl = url.startsWith('/') ? `${apiBase}${url}` : url;

  // Cache with actual expiry, or 30 min for proxy URLs (no URL expiry, re-auth needed)
  const expiryMs = expiresAt
    ? new Date(expiresAt).getTime()
    : Date.now() + (ttlSeconds || 1800) * 1000;

  // Evict oldest entries if cache is full
  if (signedUrlCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = signedUrlCache.keys().next().value;
    signedUrlCache.delete(oldestKey);
  }

  signedUrlCache.set(cleanKey, { url: resolvedUrl, expiresAt: expiryMs });

  return resolvedUrl;
};

/**
 * Invalidate all cached signed URLs.
 * Call on logout or company switch.
 */
api.clearSignedUrlCache = function() {
  signedUrlCache.clear();
};

/**
 * Check if a signed URL is still valid (not expired or close to expiry).
 *
 * @param {string} r2Key - The R2 object key
 * @returns {boolean} True if cached URL is still usable
 */
api.isSignedUrlValid = function(r2Key) {
  const cleanKey = r2Key?.replace(/^\/api\/files\//, '');
  if (!cleanKey) return false;
  const cached = signedUrlCache.get(cleanKey);
  return cached ? cached.expiresAt > Date.now() + REFRESH_BUFFER_MS : false;
};

export default api;
