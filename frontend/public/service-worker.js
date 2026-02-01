/**
 * FieldLedger Service Worker
 * 
 * Provides:
 * - Static asset caching
 * - API response caching for offline viewing
 * - Offline fallback page
 * - Background sync support
 */

const CACHE_VERSION = 'v2';
const STATIC_CACHE = `fieldledger-static-${CACHE_VERSION}`;
const API_CACHE = `fieldledger-api-${CACHE_VERSION}`;
const IMAGE_CACHE = `fieldledger-images-${CACHE_VERSION}`;

const OFFLINE_URL = '/offline.html';

// Static assets to precache
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/favicon.ico'
];

// API routes to cache for offline viewing
const CACHEABLE_API_ROUTES = [
  '/api/jobs',
  '/api/users',
  '/api/companies'
];

// Install event - precache static assets
self.addEventListener('install', event => {
  console.log('[SW] Installing service worker...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('[SW] Precaching static assets');
        return cache.addAll(PRECACHE_ASSETS);
    })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('[SW] Activating service worker...');
  
  event.waitUntil(
    Promise.all([
      // Clean old caches
      caches.keys().then(keys => {
        return Promise.all(
          keys
            .filter(key => {
              return key.startsWith('fieldledger-') && 
                     key !== STATIC_CACHE && 
                     key !== API_CACHE && 
                     key !== IMAGE_CACHE;
            })
            .map(key => {
              console.log('[SW] Deleting old cache:', key);
              return caches.delete(key);
            })
        );
      }),
      // Take control of all clients immediately
      self.clients.claim()
    ])
  );
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // Handle API requests
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiRequest(request));
    return;
  }

  // Handle image requests (for job photos)
  if (isImageRequest(request)) {
    event.respondWith(handleImageRequest(request));
    return;
  }

  // Handle navigation requests
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(request));
    return;
  }

  // Handle static assets with stale-while-revalidate
  event.respondWith(handleStaticRequest(request));
});

/**
 * Handle API requests - network first, fallback to cache
 */
async function handleApiRequest(request) {
  const url = new URL(request.url);
  const shouldCache = CACHEABLE_API_ROUTES.some(route => url.pathname.startsWith(route));

  try {
    // Try network first
    const networkResponse = await fetch(request);
    
    // Cache successful GET responses for cacheable routes
    if (networkResponse.ok && shouldCache) {
      const cache = await caches.open(API_CACHE);
      // Clone response before caching
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed for API, checking cache:', url.pathname);
    
    // Try cache if network fails
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      console.log('[SW] Serving API from cache:', url.pathname);
      return cachedResponse;
    }
    
    // Return offline JSON response
    return new Response(
      JSON.stringify({ 
        error: 'You are offline', 
        offline: true,
        cached: false 
      }),
      { 
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * Handle image requests - cache first for performance
 */
async function handleImageRequest(request) {
  // Check cache first for images
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    
    // Cache successful image responses
    if (networkResponse.ok) {
      const cache = await caches.open(IMAGE_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // Return placeholder image for offline
    return new Response('', { status: 404 });
  }
}

/**
 * Handle navigation requests
 */
async function handleNavigationRequest(request) {
  try {
    // Try network first for navigation
    const networkResponse = await fetch(request);
    return networkResponse;
  } catch (error) {
    console.log('[SW] Navigation failed, serving offline page');
    
    // Try to serve cached index.html for SPA navigation
    const cachedIndex = await caches.match('/index.html');
    if (cachedIndex) {
      return cachedIndex;
    }
    
    // Fall back to offline page
    const offlinePage = await caches.match(OFFLINE_URL);
    return offlinePage || new Response('Offline', { status: 503 });
  }
}

/**
 * Handle static assets - stale-while-revalidate
 */
async function handleStaticRequest(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cachedResponse = await cache.match(request);

  // Fetch from network in background
  const fetchPromise = fetch(request)
    .then(networkResponse => {
      if (networkResponse.ok) {
        cache.put(request, networkResponse.clone());
            }
            return networkResponse;
    })
    .catch(() => null);

  // Return cached version immediately if available
  if (cachedResponse) {
    return cachedResponse;
  }

  // Wait for network if no cache
  const networkResponse = await fetchPromise;
  if (networkResponse) {
    return networkResponse;
  }

  // Fallback for offline
  return new Response('Offline', { status: 503 });
}

/**
 * Check if request is for an image
 */
function isImageRequest(request) {
  const url = new URL(request.url);
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
  return imageExtensions.some(ext => url.pathname.toLowerCase().endsWith(ext)) ||
         request.destination === 'image';
}

// Handle background sync for pending operations
// This is the "Secondary (Background Sync)" part of the Hybrid Sync Architecture
self.addEventListener('sync', event => {
  console.log('[SW] Background sync triggered:', event.tag);
  
  // Handle queue sync (matches registration from useSync hook)
  if (event.tag === 'sync-queue' || event.tag === 'sync-pending') {
    event.waitUntil(handleBackgroundSync());
  }
});

/**
 * Handle background sync - notify clients to process queue
 * The actual queue processing happens in the main thread (QueueManager)
 * because IndexedDB access is more reliable there.
 */
async function handleBackgroundSync() {
  console.log('[SW] Starting background sync...');
  
  try {
    // Get all clients (open windows/tabs)
    const clients = await self.clients.matchAll({ type: 'window' });
    
    if (clients.length > 0) {
      // Notify first available client to handle sync
      // This triggers the QueueManager in the main thread
      clients[0].postMessage({ 
        type: 'BACKGROUND_SYNC_TRIGGERED',
        timestamp: Date.now(),
      });
      console.log('[SW] Notified client to process sync queue');
    } else {
      // No clients open - we can't process the queue from SW
      // because IndexedDB and our app code aren't available here
      // The sync will happen when the app is next opened
      console.log('[SW] No active clients - sync will resume when app opens');
    }
  } catch (err) {
    console.error('[SW] Background sync error:', err);
    throw err; // Let the browser retry
  }
}

// Handle periodic background sync (if supported)
self.addEventListener('periodicsync', event => {
  console.log('[SW] Periodic sync triggered:', event.tag);
  
  if (event.tag === 'sync-queue-periodic') {
    event.waitUntil(handleBackgroundSync());
  }
});

// Handle messages from main app
self.addEventListener('message', event => {
  const { type, data } = event.data || {};
  
  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'CACHE_JOB':
      // Cache a specific job's data
      const jobUrl = data?.url || event.data.url;
      if (jobUrl) {
        fetch(jobUrl)
          .then(response => {
            if (response.ok) {
              caches.open(API_CACHE).then(cache => {
                cache.put(jobUrl, response);
              });
            }
          })
          .catch(err => console.log('[SW] Failed to cache job:', err));
      }
      break;
      
    case 'GET_SYNC_STATUS':
      // Respond with current SW status
      event.source?.postMessage({
        type: 'SYNC_STATUS',
        data: {
          cacheVersion: CACHE_VERSION,
          online: self.navigator?.onLine ?? true,
        }
      });
      break;
      
    case 'REGISTER_PERIODIC_SYNC':
      // Try to register periodic sync (progressive enhancement)
      if ('periodicSync' in self.registration) {
        self.registration.periodicSync.register('sync-queue-periodic', {
          minInterval: 15 * 60 * 1000 // 15 minutes
        }).then(() => {
          console.log('[SW] Periodic sync registered');
          event.source?.postMessage({ type: 'PERIODIC_SYNC_REGISTERED' });
        }).catch(err => {
          console.log('[SW] Periodic sync registration failed:', err);
        });
      }
      break;
  }
});

console.log('[SW] Service worker loaded');
