/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * FieldLedger Service Worker
 * 
 * Provides:
 * - Versioned cache management with automatic stale cache purging
 * - Static asset caching (CacheFirst for hashed assets)
 * - API response caching for offline viewing (NetworkFirst with timeout)
 * - Image caching (CacheFirst with 30-day expiry)
 * - HTML with StaleWhileRevalidate
 * - Offline fallback page
 * - Background sync for pending operations
 * - Periodic sync registration (every 15 minutes)
 * - Cache size monitoring (warn > 50MB)
 * - Cache hit/miss rate logging
 */

// ==================== CACHE VERSIONING ====================
const CACHE_VERSION = 'v4';
const CACHE_PREFIX = 'fl';
const STATIC_CACHE = `${CACHE_PREFIX}-${CACHE_VERSION}-static`;
const API_CACHE = `${CACHE_PREFIX}-${CACHE_VERSION}-api`;
const IMAGE_CACHE = `${CACHE_PREFIX}-${CACHE_VERSION}-images`;

// Maximum cache size in bytes (50MB)
const MAX_CACHE_SIZE_BYTES = 50 * 1024 * 1024;

// Image cache expiry (30 days in ms)
const IMAGE_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// API network timeout before falling back to cache (10 seconds)
const API_NETWORK_TIMEOUT_MS = 10 * 1000;

const OFFLINE_URL = '/offline.html';

// Background sync tags
const SYNC_TAGS = {
  QUEUE: 'sync-queue',
  PENDING: 'sync-pending',
  UNIT_ENTRIES: 'sync-pendingUnitEntries',
  FIELD_TICKETS: 'sync-pendingFieldTickets',
};

// Periodic sync tag
const PERIODIC_SYNC_TAG = 'sync-queue-periodic';

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

// ==================== CACHE METRICS ====================
let cacheMetrics = {
  hits: 0,
  misses: 0,
  errors: 0,
  lastReset: Date.now(),
};

function logCacheAccess(hit, cacheName) {
  if (hit) {
    cacheMetrics.hits++;
  } else {
    cacheMetrics.misses++;
  }
  
  // Log every 100 accesses
  const total = cacheMetrics.hits + cacheMetrics.misses;
  if (total > 0 && total % 100 === 0) {
    const hitRate = ((cacheMetrics.hits / total) * 100).toFixed(1);
    console.log(`[SW] Cache stats: ${cacheMetrics.hits} hits, ${cacheMetrics.misses} misses (${hitRate}% hit rate) [${cacheName || 'all'}]`);
  }
}

// ==================== INSTALL ====================
self.addEventListener('install', event => {
  console.log(`[SW] Installing service worker (cache version: ${CACHE_VERSION})...`);
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('[SW] Precaching static assets');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// ==================== ACTIVATE (purge stale caches) ====================
self.addEventListener('activate', event => {
  console.log(`[SW] Activating service worker (version: ${CACHE_VERSION})...`);
  
  event.waitUntil(
    Promise.all([
      // Purge ALL old caches that don't match current version
      caches.keys().then(keys => {
        return Promise.all(
          keys
            .filter(key => {
              // Delete any cache that starts with our prefix but doesn't match current version
              const isOurCache = key.startsWith(`${CACHE_PREFIX}-`) || key.startsWith('fieldledger-');
              const isCurrent = key === STATIC_CACHE || key === API_CACHE || key === IMAGE_CACHE;
              return isOurCache && !isCurrent;
            })
            .map(key => {
              console.log('[SW] Purging stale cache:', key);
              return caches.delete(key);
            })
        );
      }),
      // Take control of all clients immediately
      self.clients.claim()
    ]).then(() => {
      console.log(`[SW] Activation complete. Active caches: ${STATIC_CACHE}, ${API_CACHE}, ${IMAGE_CACHE}`);
      // Monitor cache size after activation
      monitorCacheSize();
    })
  );
});

// ==================== FETCH ====================
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

  // Handle API requests (NetworkFirst with timeout)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiRequest(request));
    return;
  }

  // Handle image requests (CacheFirst with 30-day expiry)
  if (isImageRequest(request)) {
    event.respondWith(handleImageRequest(request));
    return;
  }

  // Handle navigation requests (StaleWhileRevalidate for HTML)
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(request));
    return;
  }

  // Handle static assets
  event.respondWith(handleStaticRequest(request));
});

// ==================== API REQUESTS (NetworkFirst + 10s timeout) ====================
async function handleApiRequest(request) {
  const url = new URL(request.url);
  const shouldCache = CACHEABLE_API_ROUTES.some(route => url.pathname.startsWith(route));

  try {
    // Try network first with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_NETWORK_TIMEOUT_MS);
    
    const networkResponse = await fetch(request, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    // Cache successful GET responses for cacheable routes
    if (networkResponse.ok && shouldCache) {
      const cache = await caches.open(API_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    logCacheAccess(false, API_CACHE); // network hit = cache miss
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed for API, checking cache:', url.pathname);
    
    // Try cache if network fails
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      console.log('[SW] Serving API from cache:', url.pathname);
      logCacheAccess(true, API_CACHE);
      return cachedResponse;
    }
    
    logCacheAccess(false, API_CACHE);
    
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

// ==================== IMAGE REQUESTS (CacheFirst + 30-day expiry) ====================
async function handleImageRequest(request) {
  // Check cache first for images
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    // Check expiry via custom header
    const cachedAt = cachedResponse.headers.get('sw-cached-at');
    if (cachedAt) {
      const age = Date.now() - parseInt(cachedAt, 10);
      if (age > IMAGE_CACHE_MAX_AGE_MS) {
        // Expired - fetch fresh copy
        console.log('[SW] Image cache expired, refetching');
      } else {
        logCacheAccess(true, IMAGE_CACHE);
        return cachedResponse;
      }
    } else {
      logCacheAccess(true, IMAGE_CACHE);
      return cachedResponse;
    }
  }

  try {
    const networkResponse = await fetch(request);
    
    // Cache successful image responses with timestamp header
    if (networkResponse.ok) {
      const cache = await caches.open(IMAGE_CACHE);
      const headers = new Headers(networkResponse.headers);
      headers.set('sw-cached-at', Date.now().toString());
      const timedResponse = new Response(await networkResponse.clone().blob(), {
        status: networkResponse.status,
        statusText: networkResponse.statusText,
        headers,
      });
      cache.put(request, timedResponse);
    }
    
    logCacheAccess(false, IMAGE_CACHE);
    return networkResponse;
  } catch (_error) {
    // Return placeholder image for offline
    logCacheAccess(false, IMAGE_CACHE);
    return new Response('', { status: 404 });
  }
}

// ==================== NAVIGATION (StaleWhileRevalidate for HTML) ====================
async function handleNavigationRequest(request) {
  try {
    // Try network first for navigation
    const networkResponse = await fetch(request);
    
    // Cache the response for SPA fallback
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put('/index.html', networkResponse.clone());
    }
    
    return networkResponse;
  } catch (_error) {
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

// ==================== STATIC ASSETS ====================
/**
 * Handle static assets
 * - JS/CSS with content hashes: cache-first (immutable — filename changes when content changes)
 * - Other static: stale-while-revalidate
 */
async function handleStaticRequest(request) {
  const url = new URL(request.url);
  const cache = await caches.open(STATIC_CACHE);
  
  // Hashed assets (e.g. /assets/vendor-react-Ch7kLwPn.js) are immutable:
  // the hash in the filename changes whenever the content changes, so a
  // cached copy is always valid. Cache-first saves bandwidth for field
  // workers on cellular connections.
  const isHashedAsset = /\.(js|css)$/.test(url.pathname) && 
                        /assets\//.test(url.pathname);
  
  if (isHashedAsset) {
    // Cache-first: serve from cache if available
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      logCacheAccess(true, STATIC_CACHE);
      return cachedResponse;
    }
    
    // Not cached yet — fetch from network
    try {
      const networkResponse = await fetch(request);
      const contentType = networkResponse.headers.get('content-type') || '';
      
      if (networkResponse.ok && (contentType.includes('javascript') || contentType.includes('css'))) {
        cache.put(request, networkResponse.clone());
        logCacheAccess(false, STATIC_CACHE);
        return networkResponse;
      }
      
      // Server returned HTML for a JS file = chunk doesn't exist (version mismatch)
      if (contentType.includes('text/html')) {
        console.warn('[SW] Detected stale chunk request, triggering reload');
        const clients = await self.clients.matchAll({ type: 'window' });
        clients.forEach(client => {
          client.postMessage({ type: 'STALE_CHUNK_DETECTED' });
        });
      }
      return networkResponse;
    } catch (_error) {
      logCacheAccess(false, STATIC_CACHE);
      return new Response('Offline', { status: 503 });
    }
  }
  
  // Other static assets: stale-while-revalidate
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
    logCacheAccess(true, STATIC_CACHE);
    return cachedResponse;
  }

  // Wait for network if no cache
  logCacheAccess(false, STATIC_CACHE);
  const networkResponse = await fetchPromise;
  if (networkResponse) {
    return networkResponse;
  }

  // Fallback for offline
  return new Response('Offline', { status: 503 });
}

// ==================== HELPERS ====================

/**
 * Check if request is for an image
 */
function isImageRequest(request) {
  const url = new URL(request.url);
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
  return imageExtensions.some(ext => url.pathname.toLowerCase().endsWith(ext)) ||
         request.destination === 'image';
}

// ==================== CACHE SIZE MONITORING ====================

/**
 * Monitor total cache size and warn if exceeding threshold
 */
async function monitorCacheSize() {
  try {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      const usedMB = ((estimate.usage || 0) / (1024 * 1024)).toFixed(2);
      const quotaMB = ((estimate.quota || 0) / (1024 * 1024)).toFixed(0);
      
      console.log(`[SW] Storage: ${usedMB} MB used of ${quotaMB} MB quota`);
      
      if (estimate.usage > MAX_CACHE_SIZE_BYTES) {
        console.warn(`[SW] Cache size WARNING: ${usedMB} MB exceeds ${MAX_CACHE_SIZE_BYTES / 1024 / 1024} MB threshold`);
        // Attempt to evict old image cache entries
        await evictOldImageCache();
        
        // Notify clients
        const clients = await self.clients.matchAll({ type: 'window' });
        clients.forEach(client => {
          client.postMessage({
            type: 'CACHE_SIZE_WARNING',
            data: { usedMB: parseFloat(usedMB), quotaMB: parseFloat(quotaMB) },
          });
        });
      }
    }
  } catch (err) {
    console.warn('[SW] Cache size monitoring error:', err);
  }
}

/**
 * Evict old entries from image cache to reclaim space
 */
async function evictOldImageCache() {
  try {
    const cache = await caches.open(IMAGE_CACHE);
    const requests = await cache.keys();
    let evicted = 0;
    
    for (const request of requests) {
      const response = await cache.match(request);
      const cachedAt = response?.headers?.get('sw-cached-at');
      
      if (cachedAt) {
        const age = Date.now() - parseInt(cachedAt, 10);
        if (age > IMAGE_CACHE_MAX_AGE_MS) {
          await cache.delete(request);
          evicted++;
        }
      }
    }
    
    if (evicted > 0) {
      console.log(`[SW] Evicted ${evicted} expired image cache entries`);
    }
  } catch (err) {
    console.warn('[SW] Image cache eviction error:', err);
  }
}

// ==================== BACKGROUND SYNC ====================

/**
 * Handle background sync events.
 * Registers for both general queue sync and specific store syncs.
 */
self.addEventListener('sync', event => {
  console.log('[SW] Background sync triggered:', event.tag);
  
  const syncTags = Object.values(SYNC_TAGS);
  if (syncTags.includes(event.tag)) {
    event.waitUntil(handleBackgroundSync(event.tag));
  }
});

/**
 * Handle background sync - notify clients to process queue
 * The actual queue processing happens in the main thread (QueueManager)
 * because IndexedDB access is more reliable there.
 */
async function handleBackgroundSync(tag) {
  console.log(`[SW] Starting background sync for tag: ${tag}...`);
  
  try {
    // Get all clients (open windows/tabs)
    const clients = await self.clients.matchAll({ type: 'window' });
    
    if (clients.length > 0) {
      // Notify first available client to handle sync
      clients[0].postMessage({ 
        type: 'BACKGROUND_SYNC_TRIGGERED',
        tag,
        timestamp: Date.now(),
      });
      console.log(`[SW] Notified client to process sync queue (tag: ${tag})`);
    } else {
      // No clients open - sync will happen when app next opens
      console.log('[SW] No active clients - sync will resume when app opens');
    }
  } catch (err) {
    console.error('[SW] Background sync error:', err);
    throw err; // Let the browser retry
  }
}

// ==================== PERIODIC SYNC ====================

/**
 * Handle periodic background sync (if supported)
 * Fires every 15 minutes if items are pending
 */
self.addEventListener('periodicsync', event => {
  console.log('[SW] Periodic sync triggered:', event.tag);
  
  if (event.tag === PERIODIC_SYNC_TAG) {
    event.waitUntil(handleBackgroundSync(PERIODIC_SYNC_TAG));
  }
});

// ==================== MESSAGE HANDLER ====================

self.addEventListener('message', event => {
  const { type, data } = event.data || {};
  
  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'CACHE_JOB': {
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
    }
      
    case 'GET_SYNC_STATUS':
      // Respond with current SW status
      event.source?.postMessage({
        type: 'SYNC_STATUS',
        data: {
          cacheVersion: CACHE_VERSION,
          cachePrefix: CACHE_PREFIX,
          online: self.navigator?.onLine ?? true,
          cacheMetrics: { ...cacheMetrics },
        }
      });
      break;
      
    case 'GET_CACHE_METRICS':
      // Return cache hit/miss stats
      event.source?.postMessage({
        type: 'CACHE_METRICS',
        data: {
          ...cacheMetrics,
          hitRate: cacheMetrics.hits + cacheMetrics.misses > 0
            ? (cacheMetrics.hits / (cacheMetrics.hits + cacheMetrics.misses) * 100).toFixed(1)
            : '0.0',
        },
      });
      break;
      
    case 'RESET_CACHE_METRICS':
      cacheMetrics = { hits: 0, misses: 0, errors: 0, lastReset: Date.now() };
      break;
      
    case 'MONITOR_CACHE_SIZE':
      monitorCacheSize();
      break;

    case 'REGISTER_BACKGROUND_SYNC':
      // Register background sync for specific stores
      registerBackgroundSyncs(event.source);
      break;

    case 'REGISTER_PERIODIC_SYNC':
      // Try to register periodic sync (progressive enhancement)
      if ('periodicSync' in self.registration) {
        self.registration.periodicSync.register(PERIODIC_SYNC_TAG, {
          minInterval: 15 * 60 * 1000 // 15 minutes
        }).then(() => {
          console.log('[SW] Periodic sync registered (15 min interval)');
          event.source?.postMessage({ type: 'PERIODIC_SYNC_REGISTERED' });
        }).catch(err => {
          console.log('[SW] Periodic sync registration failed:', err);
        });
      }
      break;
  }
});

/**
 * Register background sync for all pending stores
 */
async function registerBackgroundSyncs(source) {
  if (!('sync' in self.registration)) {
    console.log('[SW] Background sync not supported');
    source?.postMessage({ type: 'BACKGROUND_SYNC_UNSUPPORTED' });
    return;
  }

  const tags = [
    SYNC_TAGS.QUEUE,
    SYNC_TAGS.UNIT_ENTRIES,
    SYNC_TAGS.FIELD_TICKETS,
  ];

  const results = [];
  for (const tag of tags) {
    try {
      await self.registration.sync.register(tag);
      results.push({ tag, registered: true });
      console.log(`[SW] Background sync registered: ${tag}`);
    } catch (err) {
      results.push({ tag, registered: false, error: err.message });
      console.warn(`[SW] Background sync registration failed for ${tag}:`, err);
    }
  }

  source?.postMessage({
    type: 'BACKGROUND_SYNC_REGISTERED',
    data: { results },
  });
}

console.log(`[SW] Service worker loaded (version: ${CACHE_VERSION}, prefix: ${CACHE_PREFIX})`);
