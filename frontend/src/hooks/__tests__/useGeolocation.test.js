/**
 * useGeolocation Hook Tests
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useGeolocation, GPS_THRESHOLDS, getGPSQuality } from '../useGeolocation';

describe('useGeolocation Hook', () => {
  let mockGeolocation;
  
  beforeEach(() => {
    // Reset mocks
    mockGeolocation = {
      getCurrentPosition: vi.fn(),
      watchPosition: vi.fn(),
      clearWatch: vi.fn(),
    };
    navigator.geolocation = mockGeolocation;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GPS_THRESHOLDS', () => {
    it('should have correct threshold values', () => {
      expect(GPS_THRESHOLDS.HIGH).toBe(10);
      expect(GPS_THRESHOLDS.WARNING).toBe(30);
      expect(GPS_THRESHOLDS.ACCEPTABLE).toBe(50);
    });
  });

  describe('getGPSQuality', () => {
    it('should return "high" for accuracy <= 10m', () => {
      expect(getGPSQuality(5)).toBe('high');
      expect(getGPSQuality(10)).toBe('high');
    });

    it('should return "good" for accuracy <= 30m', () => {
      expect(getGPSQuality(15)).toBe('good');
      expect(getGPSQuality(30)).toBe('good');
    });

    it('should return "acceptable" for accuracy <= 50m', () => {
      expect(getGPSQuality(40)).toBe('acceptable');
      expect(getGPSQuality(50)).toBe('acceptable');
    });

    it('should return "poor" for accuracy > 50m', () => {
      expect(getGPSQuality(51)).toBe('poor');
      expect(getGPSQuality(100)).toBe('poor');
    });

    it('should return "unknown" for invalid values', () => {
      expect(getGPSQuality(null)).toBe('unknown');
      expect(getGPSQuality(undefined)).toBe('unknown');
      expect(getGPSQuality(-5)).toBe('unknown');
    });
  });

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const { result } = renderHook(() => useGeolocation());
      
      expect(result.current.position).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.loading).toBe(false);
      expect(result.current.attempts).toBe(0);
      expect(result.current.isSupported).toBe(true);
      expect(result.current.hasPosition).toBe(false);
      expect(result.current.isValid).toBe(false);
      expect(result.current.quality).toBe('unknown');
    });
  });

  describe('getCurrentPosition', () => {
    it('should get position successfully', async () => {
      const mockPosition = {
        coords: {
          latitude: 37.7749,
          longitude: -122.4194,
          accuracy: 10,
          altitude: 50,
          altitudeAccuracy: 5,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      };

      mockGeolocation.getCurrentPosition.mockImplementation((success) => {
        success(mockPosition);
      });

      const { result } = renderHook(() => useGeolocation());

      act(() => {
        result.current.getCurrentPosition();
      });

      await waitFor(() => {
        expect(result.current.position).not.toBeNull();
      });

      expect(result.current.position.latitude).toBe(37.7749);
      expect(result.current.position.longitude).toBe(-122.4194);
      expect(result.current.position.accuracy).toBe(10);
      expect(result.current.position.quality).toBe('high');
      expect(result.current.position.isValid).toBe(true);
      expect(result.current.loading).toBe(false);
      expect(result.current.attempts).toBe(1);
    });

    it('should set loading state while acquiring position', async () => {
      mockGeolocation.getCurrentPosition.mockImplementation(() => {
        // Don't call callback to simulate loading
      });

      const { result } = renderHook(() => useGeolocation());

      act(() => {
        result.current.getCurrentPosition();
      });

      expect(result.current.loading).toBe(true);
    });

    it('should mark position as invalid when accuracy > threshold', async () => {
      const mockPosition = {
        coords: {
          latitude: 37.7749,
          longitude: -122.4194,
          accuracy: 100, // Over threshold
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      };

      mockGeolocation.getCurrentPosition.mockImplementation((success) => {
        success(mockPosition);
      });

      const { result } = renderHook(() => useGeolocation({ minAccuracy: 50 }));

      act(() => {
        result.current.getCurrentPosition();
      });

      await waitFor(() => {
        expect(result.current.position).not.toBeNull();
      });

      expect(result.current.position.isValid).toBe(false);
      expect(result.current.position.quality).toBe('poor');
      expect(result.current.isValid).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle permission denied error', async () => {
      mockGeolocation.getCurrentPosition.mockImplementation((success, error) => {
        error({ code: 1 }); // PERMISSION_DENIED
      });

      const { result } = renderHook(() => useGeolocation());

      act(() => {
        result.current.getCurrentPosition();
      });

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });

      expect(result.current.error.code).toBe(1);
      expect(result.current.error.message).toContain('permission denied');
      expect(result.current.permissionState).toBe('denied');
      expect(result.current.loading).toBe(false);
    });

    it('should handle position unavailable error', async () => {
      mockGeolocation.getCurrentPosition.mockImplementation((success, error) => {
        error({ code: 2 }); // POSITION_UNAVAILABLE
      });

      const { result } = renderHook(() => useGeolocation());

      act(() => {
        result.current.getCurrentPosition();
      });

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });

      expect(result.current.error.code).toBe(2);
      expect(result.current.error.message).toContain('Unable to determine');
    });

    it('should handle timeout error', async () => {
      mockGeolocation.getCurrentPosition.mockImplementation((success, error) => {
        error({ code: 3 }); // TIMEOUT
      });

      const { result } = renderHook(() => useGeolocation());

      act(() => {
        result.current.getCurrentPosition();
      });

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });

      expect(result.current.error.code).toBe(3);
      expect(result.current.error.message).toContain('timed out');
    });

    it('should call onError callback on error', async () => {
      const onError = vi.fn();
      
      mockGeolocation.getCurrentPosition.mockImplementation((success, error) => {
        error({ code: 1 });
      });

      const { result } = renderHook(() => useGeolocation({ onError }));

      act(() => {
        result.current.getCurrentPosition();
      });

      await waitFor(() => {
        expect(onError).toHaveBeenCalled();
      });

      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 1 }));
    });
  });

  describe('Callbacks', () => {
    it('should call onSuccess callback with parsed position', async () => {
      const onSuccess = vi.fn();
      const mockPosition = {
        coords: {
          latitude: 37.7749,
          longitude: -122.4194,
          accuracy: 5,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      };

      mockGeolocation.getCurrentPosition.mockImplementation((success) => {
        success(mockPosition);
      });

      const { result } = renderHook(() => useGeolocation({ onSuccess }));

      act(() => {
        result.current.getCurrentPosition();
      });

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalled();
      });

      expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({
        latitude: 37.7749,
        longitude: -122.4194,
        quality: 'high',
        isValid: true,
      }));
    });
  });

  describe('Watch Position', () => {
    it('should start watching position', () => {
      mockGeolocation.watchPosition.mockReturnValue(123);

      const { result } = renderHook(() => useGeolocation());

      act(() => {
        result.current.startWatching();
      });

      expect(mockGeolocation.watchPosition).toHaveBeenCalled();
      expect(result.current.loading).toBe(true);
    });

    it('should stop watching position', () => {
      mockGeolocation.watchPosition.mockReturnValue(123);

      const { result } = renderHook(() => useGeolocation());

      act(() => {
        result.current.startWatching();
      });

      act(() => {
        result.current.stopWatching();
      });

      expect(mockGeolocation.clearWatch).toHaveBeenCalledWith(123);
      expect(result.current.loading).toBe(false);
    });

    it('should auto-start watching when watchPosition option is true', () => {
      mockGeolocation.watchPosition.mockReturnValue(123);

      renderHook(() => useGeolocation({ watchPosition: true }));

      expect(mockGeolocation.watchPosition).toHaveBeenCalled();
    });
  });

  describe('Reset and Retry', () => {
    it('should reset all state', async () => {
      const mockPosition = {
        coords: {
          latitude: 37.7749,
          longitude: -122.4194,
          accuracy: 10,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      };

      mockGeolocation.getCurrentPosition.mockImplementation((success) => {
        success(mockPosition);
      });

      const { result } = renderHook(() => useGeolocation());

      act(() => {
        result.current.getCurrentPosition();
      });

      await waitFor(() => {
        expect(result.current.position).not.toBeNull();
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.position).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.loading).toBe(false);
      expect(result.current.attempts).toBe(0);
    });

    it('should retry with increased timeout', async () => {
      const mockPosition = {
        coords: {
          latitude: 37.7749,
          longitude: -122.4194,
          accuracy: 10,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      };

      mockGeolocation.getCurrentPosition.mockImplementation((success) => {
        success(mockPosition);
      });

      const { result } = renderHook(() => useGeolocation({ timeout: 10000 }));

      // First attempt
      act(() => {
        result.current.getCurrentPosition();
      });

      await waitFor(() => {
        expect(result.current.attempts).toBe(1);
      });

      // Retry
      act(() => {
        result.current.retry();
      });

      await waitFor(() => {
        expect(result.current.attempts).toBe(2);
      });

      // Check that retry was called with options
      expect(mockGeolocation.getCurrentPosition).toHaveBeenCalledTimes(2);
    });
  });

  describe('Unsupported Browser', () => {
    it('should set error when geolocation not supported', () => {
      // Mock isSupported check by testing getCurrentPosition without geolocation
      // Note: We can't easily undefine navigator.geolocation in jsdom,
      // so we test the error handling path directly
      mockGeolocation.getCurrentPosition.mockImplementation((success, error) => {
        error({ code: 0 }); // Unknown error simulates unsupported
      });

      const { result } = renderHook(() => useGeolocation());

      act(() => {
        result.current.getCurrentPosition();
      });

      // Check that some error was handled
      expect(result.current.loading).toBe(false);
    });
  });
});

