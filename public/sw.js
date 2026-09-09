// Service Worker for Hamed Trading Lab PWA
// Provides 100% offline functionality, asset caching, and fast app-shell loading on Windows and Mobile

// Bump this whenever the app shell or Next.js chunks change. Keeping an old
// document cached can reference removed chunks and leave the preview stuck.
const CACHE_NAME = 'hamed-trading-lab-v4';
const PRESERVED_CACHE_PREFIXES = ['webllm', 'transformers', 'onnx', 'huggingface', 'wllama', 'model'];

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
          .filter(name => {
            if (name === CACHE_NAME) return false;
            // حفاظت از کش‌های وزن مدل‌های هوش مصنوعی آفلاین (WebLLM / Transformers / ONNX)
            const isModelCache = PRESERVED_CACHE_PREFIXES.some(p => name.toLowerCase().includes(p));
            return !isModelCache;
          })
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
