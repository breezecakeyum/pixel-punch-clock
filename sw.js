'use strict';

// Bump this on every deploy that changes any app-shell file, so clients
// pick up the new version instead of serving a stale cached copy forever.
const CACHE_NAME = 'pixel-punch-clock-shell-v13';

const APP_SHELL = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './fonts/PressStart2P.woff2',
  './fonts/VT323.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Never touch non-GET traffic or cross-origin requests: this is what lets
  // the webhook POSTs to Google Apps Script (and their offline failures)
  // reach app.js untouched instead of being swallowed by the service worker.
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Matched and written through this SW's own named cache specifically —
  // not the global caches.match(), which searches every cache this origin
  // has ever created in an unspecified order. If an old version's cache
  // hasn't finished being deleted yet, a global match could still resolve
  // to its stale entry; scoping to CACHE_NAME rules that out.
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(request).then((cached) => {
        const networkFetch = fetch(request)
          .then((response) => {
            if (response && response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached || cache.match('./index.html'));
        return cached || networkFetch;
      })
    )
  );
});
