/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Service Worker Registration
 * 
 * Registers the service worker for offline functionality.
 */

// Regex to match 127.x.x.x localhost addresses
const localhostRegex = /^127(?:\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)){3}$/;

const isLocalhost = Boolean(
  globalThis.location.hostname === 'localhost' ||
  globalThis.location.hostname === '[::1]' ||
  localhostRegex.exec(globalThis.location.hostname)
);

/**
 * Clear all caches and reload the page
 * Extracted to reduce nesting depth
 */
function clearCachesAndReload() {
  if ('caches' in globalThis) {
    caches.keys()
      .then(keys => Promise.all(keys.map(key => caches.delete(key))))
      .then(() => globalThis.location.reload());
  } else {
    globalThis.location.reload();
  }
}

/**
 * Handle messages from service worker
 * Extracted to reduce nesting depth
 */
function handleServiceWorkerMessage(event) {
  if (event.data?.type === 'STALE_CHUNK_DETECTED') {
    console.log('[SW] Stale chunk detected - reloading to get new version');
    clearCachesAndReload();
  }
}

/**
 * Handle service worker state changes
 * Extracted to reduce nesting depth
 */
function createStateChangeHandler(registration, config) {
  return function handleStateChange() {
    const installingWorker = registration.installing;
    if (installingWorker?.state === 'installed') {
      if (navigator.serviceWorker.controller) {
        console.log('[SW] New content available; please refresh.');
        config?.onUpdate?.(registration);
      } else {
        console.log('[SW] Content is cached for offline use.');
        config?.onSuccess?.(registration);
      }
    }
  };
}

export function register(config) {
  if ('serviceWorker' in navigator) {
    // Use Vite's BASE_URL or default to root
    const baseUrl = import.meta.env.BASE_URL || '/';
    const publicUrl = new URL(baseUrl, globalThis.location.href);
    
    // Don't register if base URL is on a different origin
    if (publicUrl.origin !== globalThis.location.origin) {
      return;
    }

    globalThis.addEventListener('load', () => {
      const swUrl = `${baseUrl}service-worker.js`;

      if (isLocalhost) {
        // Running on localhost - check if service worker exists
        checkValidServiceWorker(swUrl, config);
        navigator.serviceWorker.ready.then(() => {
          console.log('[SW] Service worker is ready (localhost)');
        });
      } else {
        // Production - register service worker
        registerValidSW(swUrl, config);
      }
    });
  }
}

function registerValidSW(swUrl, config) {
  navigator.serviceWorker
    .register(swUrl)
    .then((registration) => {
      console.log('[SW] Service worker registered successfully');
      
      // Listen for messages from service worker
      navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
      
      // Handle updates
      registration.onupdatefound = () => {
        const installingWorker = registration.installing;
        if (!installingWorker) return;
        installingWorker.onstatechange = createStateChangeHandler(registration, config);
      };
    })
    .catch((error) => {
      console.error('[SW] Service worker registration failed:', error);
    });
}

function checkValidServiceWorker(swUrl, config) {
  fetch(swUrl, { headers: { 'Service-Worker': 'script' } })
    .then((response) => {
      const contentType = response.headers.get('content-type');
      
      if (response.status === 404 || (contentType && !contentType.includes('javascript'))) {
        // Service worker not found - unregister any existing one
        navigator.serviceWorker.ready.then((registration) => {
          registration.unregister().then(() => {
            globalThis.location.reload();
          });
        });
      } else {
        // Service worker found - register it
        registerValidSW(swUrl, config);
      }
    })
    .catch(() => {
      console.log('[SW] No internet connection. App running in offline mode.');
    });
}

export function unregister() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => {
        registration.unregister();
      })
      .catch((error) => {
        console.error('[SW] Service worker unregistration error:', error.message);
      });
  }
}
