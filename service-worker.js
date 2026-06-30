const CACHE_NAME = 'school-portal-cache-v5';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/styles.css',
  './js/config.js',
  './js/auth.js',
  './js/dataFetch.js',
  './js/dashboard.js',
  './js/tabs.js',
  './js/universalSearch.js',
  './js/pdfExport.js',
  './js/theme.js',
  './assets/icon.svg',
  './manifest.json',
  
  // CDN Libraries
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
  'https://unpkg.com/lucide@latest',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
];

// Install Event - cache the app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching app shell and CDNs');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Clearing old cache', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - network falling back to cache (or cache first for speed, but network fallback)
self.addEventListener('fetch', (event) => {
  // Only handle GET requests and ignore chrome-extension:// or others
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin) && !event.request.url.includes('cdn') && !event.request.url.includes('unpkg') && !event.request.url.includes('googleapis') && !event.request.url.includes('gstatic')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch new version in background if online (Stale-While-Revalidate)
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResponse);
              });
            }
          })
          .catch(() => {
            /* Ignore errors, we're offline */
          });
        return cachedResponse;
      }
      return fetch(event.request);
    })
  );
});
