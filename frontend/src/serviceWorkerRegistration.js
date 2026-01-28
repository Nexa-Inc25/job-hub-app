/**
 * Service Worker Registration
 * 
 * Registers the service worker for offline functionality.
 */

const isLocalhost = Boolean(
  globalThis.location.hostname === 'localhost' ||
  globalThis.location.hostname === '[::1]' ||
  globalThis.location.hostname.match(/^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/)
);

export function register(config) {
  if ('serviceWorker' in navigator) {
    const publicUrl = new URL(process.env.PUBLIC_URL, globalThis.location.href);
    
    // Don't register if PUBLIC_URL is on a different origin
    if (publicUrl.origin !== globalThis.location.origin) {
      return;
    }

    globalThis.addEventListener('load', () => {
      const swUrl = `${process.env.PUBLIC_URL}/service-worker.js`;

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
      
      registration.onupdatefound = () => {
        const installingWorker = registration.installing;
        if (!installingWorker) return;
        
        installingWorker.onstatechange = () => {
          if (installingWorker.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              // New content available
              console.log('[SW] New content available; please refresh.');
              config?.onUpdate?.(registration);
            } else {
              // Content cached for offline use
              console.log('[SW] Content is cached for offline use.');
              config?.onSuccess?.(registration);
            }
          }
        };
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

