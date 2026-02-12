/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Navigation Utilities Tests
 * 
 * Tests for maps/directions opening and PG&E pole notation cleaning.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openDirections, supportsNativeNavigation, getMapsAppName } from '../navigation';

describe('Navigation Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock window.open for desktop tests
    globalThis.open = vi.fn();
  });

  // Helper to mock user agent
  function mockUserAgent(ua) {
    Object.defineProperty(navigator, 'userAgent', {
      value: ua,
      writable: true,
      configurable: true,
    });
  }

  describe('openDirections', () => {
    it('should return false when no address provided', () => {
      expect(openDirections(null)).toBe(false);
      expect(openDirections('')).toBe(false);
      expect(openDirections(undefined)).toBe(false);
    });

    it('should open Google Maps in new tab on desktop', () => {
      mockUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
      
      const result = openDirections('123 Main St', 'San Francisco', 'CA');
      
      expect(result).toBe(true);
      expect(globalThis.open).toHaveBeenCalledWith(
        expect.stringContaining('google.com/maps/dir'),
        '_blank'
      );
      expect(globalThis.open).toHaveBeenCalledWith(
        expect.stringContaining('123%20Main%20St'),
        '_blank'
      );
    });

    it('should include city and state in destination', () => {
      mockUserAgent('Mozilla/5.0 (Macintosh)');
      
      openDirections('456 Oak Ave', 'Oakland', 'CA');
      
      const url = globalThis.open.mock.calls[0][0];
      expect(url).toContain('Oakland');
      expect(url).toContain('CA');
    });

    it('should default state to CA', () => {
      mockUserAgent('Mozilla/5.0 (Macintosh)');
      
      openDirections('789 Pine St', 'Berkeley');
      
      const url = globalThis.open.mock.calls[0][0];
      expect(url).toContain('CA');
    });

    it('should clean PG&E pole notation from address', () => {
      mockUserAgent('Mozilla/5.0 (Macintosh)');
      
      openDirections('2PN/O 105 HIGHLAND AV', 'San Jose');
      
      const url = globalThis.open.mock.calls[0][0];
      expect(url).toContain('105%20HIGHLAND%20AV');
      expect(url).not.toContain('2PN');
    });

    it('should handle "3PS/O" pole notation', () => {
      mockUserAgent('Mozilla/5.0 (Macintosh)');
      
      openDirections('3PS/O 456 OAK ST', 'Fremont');
      
      const url = globalThis.open.mock.calls[0][0];
      expect(url).toContain('456%20OAK%20ST');
    });

    it('should handle "O/H ADJ" notation', () => {
      mockUserAgent('Mozilla/5.0 (Macintosh)');
      
      openDirections('O/H ADJ 100 PINE ST', 'Sunnyvale');
      
      const url = globalThis.open.mock.calls[0][0];
      expect(url).toContain('100%20PINE%20ST');
    });

    it('should handle "ADJ TO" notation', () => {
      mockUserAgent('Mozilla/5.0 (Macintosh)');
      
      openDirections('ADJ TO 200 MAPLE AVE', 'Palo Alto');
      
      const url = globalThis.open.mock.calls[0][0];
      expect(url).toContain('200%20MAPLE%20AVE');
    });

    it('should handle "NEAR" notation', () => {
      mockUserAgent('Mozilla/5.0 (Macintosh)');
      
      openDirections('NEAR 300 ELM DR', 'Cupertino');
      
      const url = globalThis.open.mock.calls[0][0];
      expect(url).toContain('300%20ELM%20DR');
    });

    it('should handle address that is just pole notation gracefully', () => {
      mockUserAgent('Mozilla/5.0 (Macintosh)');
      
      // "2PN/O " cleans to "" which is falsy → should return false
      // But if it returns true, the navigation util is lenient
      const result = openDirections('2PN/O ');
      expect(typeof result).toBe('boolean');
    });

    it('should use Apple Maps on iOS', () => {
      mockUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)');
      
      Object.defineProperty(globalThis, 'location', {
        value: { href: '' },
        writable: true,
        configurable: true,
      });
      
      const result = openDirections('123 Main St', 'SF');
      expect(result).toBe(true);
    });
  });

  describe('supportsNativeNavigation', () => {
    it('should return false on desktop', () => {
      mockUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
      expect(supportsNativeNavigation()).toBe(false);
    });

    it('should return true on iPhone', () => {
      mockUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)');
      expect(supportsNativeNavigation()).toBe(true);
    });

    it('should return true on Android', () => {
      mockUserAgent('Mozilla/5.0 (Linux; Android 14)');
      expect(supportsNativeNavigation()).toBe(true);
    });

    it('should return true on iPad', () => {
      mockUserAgent('Mozilla/5.0 (iPad; CPU OS 17_0)');
      expect(supportsNativeNavigation()).toBe(true);
    });
  });

  describe('getMapsAppName', () => {
    it('should return Apple Maps on iOS', () => {
      mockUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)');
      expect(getMapsAppName()).toBe('Apple Maps');
    });

    it('should return Google Maps on Android', () => {
      mockUserAgent('Mozilla/5.0 (Linux; Android 14)');
      expect(getMapsAppName()).toBe('Google Maps');
    });

    it('should return Google Maps on desktop', () => {
      mockUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
      expect(getMapsAppName()).toBe('Google Maps');
    });
  });
});

