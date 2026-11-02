const CACHE_NAME = 'j2me-player-v2';

const STATIC_ASSETS = [
  './',
  './index.html',
  './main.html',
  './manifest.webmanifest',
  './style/app.css',
  './style/player.css',
  './js/app.js',
  './js/player-controls.js',
  './img/icon-192.png',
  './img/icon-512.png',
  './img/bounce.png',
  './libs/encoding.js',
  './libs/webaudio-tinysynth.min.js',
  './libs/BenzAMRRecorder.min.js',
  './bld/native.js',
  './config/default.js',
  './config/runtests.js',
  './config/build.js',
  './config/urlparams.js',
  './bld/j2me.js',
  './bld/main-all.js',
  './keymap.js',
  './java/classesold.jar',
  './java/classes2.jar',
  './java/classes.jar',
  './jar/BounceTales.jar',
  './jar/pvz.jar',
  './jar/nfs13.jar',
  './jar/city.jar'
];

// Install event - precache core files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[SW] Pre-caching offline static assets...');
      for (const asset of STATIC_ASSETS) {
        try {
          await cache.add(asset);
        } catch (err) {
          console.warn('[SW] Could not pre-cache asset:', asset, err);
        }
      }
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - Cache-first with network fallback & dynamic caching
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (!url.protocol.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request, { ignoreSearch: false }).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
