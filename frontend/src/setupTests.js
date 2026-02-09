/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Vitest Test Setup for Frontend
 * 
 * Configures testing environment with React Testing Library matchers.
 */

import '@testing-library/jest-dom';
import { vi, beforeAll, afterAll, afterEach } from 'vitest';

// Reset all mocks after each test
afterEach(() => {
  vi.clearAllMocks();
});

// Mock navigator.geolocation
const mockGeolocation = {
  getCurrentPosition: vi.fn((success, error) => {
    success({
      coords: {
        latitude: 37.7749,
        longitude: -122.4194,
        accuracy: 10,
        altitude: 50,
        altitudeAccuracy: 5,
        heading: null,
        speed: null
      },
      timestamp: Date.now()
    });
  }),
  watchPosition: vi.fn(),
  clearWatch: vi.fn()
};

Object.defineProperty(globalThis.navigator, 'geolocation', {
  value: mockGeolocation,
  writable: true
});

// Mock URL.createObjectURL and revokeObjectURL
globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
globalThis.URL.revokeObjectURL = vi.fn();

// Mock canvas for image processing
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  drawImage: vi.fn(),
  getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(100) })),
  putImageData: vi.fn(),
  fillRect: vi.fn(),
  fillText: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  translate: vi.fn(),
  rotate: vi.fn()
}));

HTMLCanvasElement.prototype.toBlob = vi.fn((callback) => {
  callback(new Blob(['mock-image'], { type: 'image/jpeg' }));
});

// Mock MediaDevices API for camera
const mockMediaDevices = {
  getUserMedia: vi.fn().mockResolvedValue({
    getTracks: () => [{ stop: vi.fn() }]
  }),
  enumerateDevices: vi.fn().mockResolvedValue([
    { kind: 'videoinput', deviceId: 'mock-camera', label: 'Mock Camera' }
  ])
};

Object.defineProperty(globalThis.navigator, 'mediaDevices', {
  value: mockMediaDevices,
  writable: true
});

// Mock crypto.randomUUID
Object.defineProperty(globalThis.crypto, 'randomUUID', {
  value: vi.fn(() => 'mock-uuid-' + Math.random().toString(36).slice(2, 11))
});

// Mock window.matchMedia (used by MUI)
Object.defineProperty(globalThis, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock IntersectionObserver
globalThis.IntersectionObserver = class IntersectionObserver {
  observe() { return null; }
  unobserve() { return null; }
  disconnect() { return null; }
};

// Mock ResizeObserver
globalThis.ResizeObserver = class ResizeObserver {
  observe() { return null; }
  unobserve() { return null; }
  disconnect() { return null; }
};

// Suppress console errors during tests (optional)
const originalError = console.error;
beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning: ReactDOM.render is no longer supported')
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});
