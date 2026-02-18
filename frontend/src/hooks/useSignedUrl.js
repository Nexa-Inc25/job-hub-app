/**
 * FieldLedger - Signed URL Hook
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 *
 * React hook for resolving R2 file keys to short-lived signed URLs.
 * Handles loading states, error recovery, and automatic refresh
 * before expiry so images/documents never show broken links.
 *
 * Usage:
 *   const { url, isLoading, error } = useSignedUrl(doc.r2Key);
 *   return <img src={url || ''} alt="..." />;
 *
 * @module hooks/useSignedUrl
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../api';

/** Default refresh interval — check every 10 minutes */
const REFRESH_CHECK_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Resolve an R2 file key to a signed URL.
 *
 * - Returns cached URL immediately if still valid
 * - Fetches a new signed URL on mount and when the key changes
 * - Automatically refreshes before the URL expires (if component is still mounted)
 * - Returns `null` url during loading and on error
 *
 * @param {string|null|undefined} r2Key - R2 object key, or null/undefined to skip
 * @param {Object} [options]
 * @param {boolean} [options.enabled=true] - Set to false to disable fetching
 * @returns {{ url: string|null, isLoading: boolean, error: Error|null, refresh: () => void }}
 */
export default function useSignedUrl(r2Key, { enabled = true } = {}) {
  const [url, setUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const refreshTimerRef = useRef(null);
  const mountedRef = useRef(true);

  const fetchUrl = useCallback(async () => {
    if (!r2Key || !enabled) {
      setUrl(null);
      setIsLoading(false);
      return;
    }

    // If URL is already absolute HTTP, use directly (legacy compat)
    if (r2Key.startsWith('http://') || r2Key.startsWith('https://')) {
      setUrl(r2Key);
      setIsLoading(false);
      return;
    }

    // If cached URL is still valid, use it without a network call
    if (api.isSignedUrlValid(r2Key)) {
      try {
        const cachedUrl = await api.getSignedFileUrl(r2Key);
        if (mountedRef.current) {
          setUrl(cachedUrl);
          setIsLoading(false);
          setError(null);
        }
        return;
      } catch {
        // Cache miss or stale — fall through to fetch
      }
    }

    setIsLoading(true);
    setError(null);

    try {
      const signedUrl = await api.getSignedFileUrl(r2Key);
      if (mountedRef.current) {
        setUrl(signedUrl);
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err);
        setUrl(null);
        // Log but don't crash — broken image is better than crash
        console.warn('[useSignedUrl] Failed to get signed URL for:', r2Key, err.message);
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [r2Key, enabled]);

  // Fetch on mount and when key changes
  useEffect(() => {
    mountedRef.current = true;
    fetchUrl();

    // Set up periodic refresh check
    refreshTimerRef.current = setInterval(() => {
      if (r2Key && enabled && !api.isSignedUrlValid(r2Key)) {
        fetchUrl();
      }
    }, REFRESH_CHECK_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, [fetchUrl, r2Key, enabled]);

  return { url, isLoading, error, refresh: fetchUrl };
}

