// Service Worker for Hamed Trading Lab PWA
// Provides a cached app-shell fallback. APIs and initial AI model downloads still require network access.

// Bump this whenever the app shell or Next.js chunks change. Keeping an old
// document cached can reference removed chunks and leave the preview stuck.
const APP_SHELL_CACHE_PREFIX = 'hamed-trading-app-shell-';
const APP_SHELL_CACHE_VERSION = 'v5-phase6';
const CACHE_NAME = `${APP_SHELL_CACHE_PREFIX}${APP_SHELL_CACHE_VERSION}`;

const STATIC_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/icon.svg',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[SW] Pre-caching asset skipped or failed:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          // Delete only stale caches owned by this service worker. Runtime/model
          // caches are owned and versioned by their providers and must not be guessed.
          .filter(name => name.startsWith(APP_SHELL_CACHE_PREFIX) && name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Skip chrome extension and internal requests
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Cross-origin model/runtime requests are managed by WebLLM/LiteRT. Caching
  // them here would blur artifact integrity and offline-verification ownership.
  if (url.origin !== self.location.origin) return;

  // تمام اندپوینت‌های /api به طور قطعی از کش مستثنی شده و مستقیماً به شبکه ارسال می‌شوند (Network Only)
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Always obtain the HTML document from the current deployment first. A
  // cached document may point at a different build's hashed JS chunks.
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request)
        .then(networkResponse => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request).then(cached => cached || caches.match('/')))
    );
    return;
  }

  // Stale-While-Revalidate strategy for static and app pages
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      const fetchPromise = fetch(event.request)
        .then(networkResponse => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // If offline and request is for an HTML page, serve cached root
          if (event.request.mode === 'navigate') {
            return caches.match('/');
          }
          return cachedResponse;
        });

      return cachedResponse || fetchPromise;
    })
  );
});

self.addEventListener('message', event => {
  if (event.data?.type !== 'GET_OFFLINE_SHELL_STATUS') return;
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.match('/'))
      .then(root => event.source?.postMessage({
        type: 'OFFLINE_SHELL_STATUS',
        cacheName: CACHE_NAME,
        cacheVersion: APP_SHELL_CACHE_VERSION,
        shellCached: Boolean(root),
      }))
  );
});
