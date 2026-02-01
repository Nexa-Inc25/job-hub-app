/**
 * useGeolocation Hook
 * 
 * High-accuracy geolocation for Digital Receipt verification.
 * 
 * Requirements:
 * - Accuracy < 50m required for submission
 * - < 10m for "high quality" GPS badge
 * - Handles permission states and errors gracefully
 * - Provides real-time position updates during capture
 * 
 * @module hooks/useGeolocation
 */

import { useState, useCallback, useEffect, useRef } from 'react';

// GPS accuracy thresholds (meters)
export const GPS_THRESHOLDS = {
  HIGH: 10,      // "High quality" badge threshold
  ACCEPTABLE: 50, // Maximum allowed for submission
  WARNING: 30,   // Shows warning but allows submission
};

// GPS quality labels
export const getGPSQuality = (accuracy) => {
  if (!accuracy || accuracy < 0) return 'unknown';
  if (accuracy <= GPS_THRESHOLDS.HIGH) return 'high';
  if (accuracy <= GPS_THRESHOLDS.WARNING) return 'good';
  if (accuracy <= GPS_THRESHOLDS.ACCEPTABLE) return 'acceptable';
  return 'poor';
};

/**
 * Hook for high-accuracy geolocation with validation
 */
export function useGeolocation(options = {}) {
  const {
    enableHighAccuracy = true,
    timeout = 30000,           // 30 second timeout
    maximumAge = 0,            // Always get fresh position
    watchPosition = false,     // Continuous updates
    minAccuracy = GPS_THRESHOLDS.ACCEPTABLE,
    onSuccess = null,
    onError = null,
  } = options;

  const [position, setPosition] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [permissionState, setPermissionState] = useState('prompt'); // 'prompt', 'granted', 'denied'
  const [attempts, setAttempts] = useState(0);
  
  const watchIdRef = useRef(null);
  const isMountedRef = useRef(true);

  // Check if geolocation is supported
  const isSupported = 'geolocation' in navigator;

  // Parse position to our schema
  const parsePosition = useCallback((geoPosition) => {
    const { coords, timestamp } = geoPosition;
    return {
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: coords.accuracy,
      altitude: coords.altitude,
      altitudeAccuracy: coords.altitudeAccuracy,
      heading: coords.heading,
      speed: coords.speed,
      capturedAt: new Date(timestamp),
      quality: getGPSQuality(coords.accuracy),
      isValid: coords.accuracy <= minAccuracy,
    };
  }, [minAccuracy]);

  // Handle success
  const handleSuccess = useCallback((geoPosition) => {
    if (!isMountedRef.current) return;
    
    const parsed = parsePosition(geoPosition);
    setPosition(parsed);
    setError(null);
    setLoading(false);
    setAttempts(prev => prev + 1);
    
    if (onSuccess) {
      onSuccess(parsed);
    }
  }, [parsePosition, onSuccess]);

  // Handle error
  const handleError = useCallback((geoError) => {
    if (!isMountedRef.current) return;
    
    let errorMessage;
    let errorCode = geoError.code;
    
    switch (geoError.code) {
      case 1: // PERMISSION_DENIED
        errorMessage = 'Location permission denied. Please enable location access in your device settings.';
        setPermissionState('denied');
        break;
      case 2: // POSITION_UNAVAILABLE
        errorMessage = 'Unable to determine your location. Please ensure GPS is enabled.';
        break;
      case 3: // TIMEOUT
        errorMessage = 'Location request timed out. Please try again in an open area.';
        break;
      default:
        errorMessage = 'An unknown location error occurred.';
    }
    
    const errorObj = { code: errorCode, message: errorMessage };
    setError(errorObj);
    setLoading(false);
    
    if (onError) {
      onError(errorObj);
    }
  }, [onError]);

  // Check permission state
  const checkPermission = useCallback(async () => {
    if (!isSupported) return 'denied';
    
    try {
      // Query permission state if available
      if (navigator.permissions?.query) {
        const result = await navigator.permissions.query({ name: 'geolocation' });
        setPermissionState(result.state);
        
        // Listen for permission changes
        result.addEventListener('change', () => {
          setPermissionState(result.state);
        });
        
        return result.state;
      }
      return 'prompt'; // Fallback if permissions API not available
    } catch {
      return 'prompt';
    }
  }, [isSupported]);

  // Get current position (one-time)
  const getCurrentPosition = useCallback(() => {
    if (!isSupported) {
      setError({ code: 0, message: 'Geolocation is not supported by this browser.' });
      return;
    }
    
    setLoading(true);
    setError(null);
    
    navigator.geolocation.getCurrentPosition(
      handleSuccess,
      handleError,
      {
        enableHighAccuracy,
        timeout,
        maximumAge,
      }
    );
  }, [isSupported, enableHighAccuracy, timeout, maximumAge, handleSuccess, handleError]);

  // Start watching position (continuous)
  const startWatching = useCallback(() => {
    if (!isSupported) {
      setError({ code: 0, message: 'Geolocation is not supported by this browser.' });
      return;
    }
    
    // Clear existing watch
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    
    setLoading(true);
    setError(null);
    
    watchIdRef.current = navigator.geolocation.watchPosition(
      handleSuccess,
      handleError,
      {
        enableHighAccuracy,
        timeout,
        maximumAge,
      }
    );
  }, [isSupported, enableHighAccuracy, timeout, maximumAge, handleSuccess, handleError]);

  // Stop watching position
  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      setLoading(false);
    }
  }, []);

  // Clear position and error
  const reset = useCallback(() => {
    setPosition(null);
    setError(null);
    setLoading(false);
    setAttempts(0);
    stopWatching();
  }, [stopWatching]);

  // Retry getting position with increased timeout
  const retry = useCallback(() => {
    setLoading(true);
    setError(null);
    
    // Increase timeout on retry
    const retryTimeout = timeout + (attempts * 5000);
    
    navigator.geolocation.getCurrentPosition(
      handleSuccess,
      handleError,
      {
        enableHighAccuracy,
        timeout: retryTimeout,
        maximumAge: 0, // Always fresh on retry
      }
    );
  }, [attempts, timeout, enableHighAccuracy, handleSuccess, handleError]);

  // Check permission on mount
  useEffect(() => {
    checkPermission();
  }, [checkPermission]);

  // Auto-start watching if configured
  useEffect(() => {
    if (watchPosition) {
      startWatching();
    }
    
    return () => {
      stopWatching();
    };
  }, [watchPosition, startWatching, stopWatching]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stopWatching();
    };
  }, [stopWatching]);

  return {
    // State
    position,
    error,
    loading,
    permissionState,
    attempts,
    
    // Computed
    isSupported,
    hasPosition: position !== null,
    isValid: position?.isValid ?? false,
    quality: position?.quality ?? 'unknown',
    accuracy: position?.accuracy ?? null,
    
    // Actions
    getCurrentPosition,
    startWatching,
    stopWatching,
    reset,
    retry,
    checkPermission,
  };
}

export default useGeolocation;

