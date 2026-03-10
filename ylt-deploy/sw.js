// sw.js — YLT Agogo Service Worker
// Caches the app shell for offline use. Update CACHE_VERSION to bust cache on deploy.

const CACHE_VERSION = 'ylt-v3';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

// Install — cache core assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

// Activate — delete old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network-first for API calls, cache-first for assets
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Always network for API calls and Netlify functions
  if (
    url.pathname.startsWith('/.netlify/') ||
    url.hostname === 'api.anthropic.com' ||
    url.hostname === 'api.emailjs.com'
  ) {
    return; // let browser handle natively
  }

  // Network-first for HTML (always fresh)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then(c => c.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Cache-first for everything else
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then(c => c.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
