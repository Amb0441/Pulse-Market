// Pulse Market Service Worker
// Provides offline support and caching for PWA functionality

// __APP_VERSION__ is replaced at build time with the version from package.json
// (see the sw-version plugin in vite.config.ts). The previous hardcoded
// 'pulse-market-v1' never changed between deploys, so activate never deleted
// the old cache and returning visitors stayed on a stale app indefinitely.
const CACHE_NAME = `pulse-market-__APP_VERSION__`;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192x192.svg',
  '/icons/icon-512x512.svg',
];

const CACHE_STRATEGIES = {
  // Cache first for static assets
  static: 'cache-first',
  // Network first for API calls
  api: 'network-first',
  // Stale while revalidate for images
  images: 'stale-while-revalidate',
};

const MAX_CACHE_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Deliberately not cache.addAll: that is atomic, so a single 404 in this
      // list rejects the whole promise and the worker never installs at all.
      // That is not hypothetical - this list once referenced .png icons that
      // only existed as .svg, which silently disabled every offline feature.
      // Caching each entry independently means one bad path costs one asset.
      Promise.all(
        STATIC_ASSETS.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch((err) => {
            console.warn('[sw] could not precache', url, err);
          })
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith('http')) return;

  // Cross-origin GETs (Cloudinary photos, OSM tiles, Google Fonts) must not be
  // intercepted. A service-worker fetch() is governed by connect-src, while the
  // document loads those URLs under img-src / font-src. Intercepting them made
  // connect-src block res.cloudinary.com, *.tile.openstreetmap.org and
  // fonts.gstatic.com even though img-src/font-src already allowed them.
  if (url.origin !== self.location.origin) return;

  // Handle API requests with network-first strategy
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // The HTML document is network-first, and this is the important one.
  //
  // index.html is what names the hashed bundles, so serving it from cache pins a
  // returning visitor to whichever build they first happened to load: the old
  // document references the old `/assets/index-<hash>.js`, which is still in the
  // cache too, and cache-first never evicted it. The result is an app that
  // silently refuses to update - a fixed bug shipped to production, a corrected
  // validation message, anything at all, and the browser keeps running the copy
  // from before. Network-first keeps the offline fallback while making a stale
  // document impossible while online.
  if (request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(networkFirst(request));
    return;
  }

  // Vite emits content-hashed filenames under /assets, so the contents at a
  // given URL can never change. Cache-first is correct and fastest here.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Handle image requests with stale-while-revalidate
  if (request.destination === 'image' || url.pathname.match(/\.(png|jpg|jpeg|webp|avif|svg|gif)$/)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Everything else (manifest, robots, unversioned scripts): revalidate in the
  // background so the next load is current without paying a network round trip.
  event.respondWith(staleWhileRevalidate(request));
});

async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    // Return offline fallback for navigation requests
    if (request.mode === 'navigate') {
      return caches.match('/index.html');
    }
    throw error;
  }
}

async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // A navigation must be answered with a document. Returning the JSON offline
    // envelope here would hand the browser a page body it cannot render, so
    // fall back to the precached shell instead. The JSON envelope is only
    // correct for XHR/fetch callers, which is what the API branch is.
    if (request.mode === 'navigate') {
      const shell = await caches.match('/index.html');
      if (shell) return shell;
    }

    // Offline response for API failures. This has to match the envelope the API
    // itself returns ({ error: { code, message } }); the previous flat
    // `{ error: 'Offline' }` shape left `error.message` undefined, so the app
    // showed a bare "Request failed with status 503" instead of "Offline".
    return new Response(
      JSON.stringify({
        error: {
          code: 'OFFLINE',
          message: 'You appear to be offline. Showing the last saved results.',
        },
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function staleWhileRevalidate(request) {
  const cachedResponse = await caches.match(request);

  const fetchPromise = fetch(request).then((networkResponse) => {
    if (networkResponse.ok) {
      // Clone inside this callback, before the response is returned to the page.
      // Deferring to a later `.then` (as this did) meant `clone()` ran after the
      // browser had read the body, which throws "Response body is already used".
      const copy = networkResponse.clone();
      caches
        .open(CACHE_NAME)
        .then((c) => c.put(request, copy))
        .catch(() => {
          // A failed cache write is not worth failing the request over.
        });
    }
    return networkResponse;
  }).catch(() => cachedResponse ?? new Response('', { status: 504, statusText: 'Offline' }));

  return cachedResponse || fetchPromise;
}

// Handle push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;

  // event.data.json() throws on a non-JSON payload, which rejects waitUntil and
  // drops the notification. Fall back to treating the body as the text.
  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: 'Pulse Market', body: event.data.text() };
  }

  const options = {
    body: data.body,
    // These must be the .svg assets that actually exist in public/icons. The
    // .png names were carried over from a template and 404'd on every push.
    icon: '/icons/icon-192x192.svg',
    badge: '/icons/badge-72x72.svg',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/',
    },
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === event.notification.data.url && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(event.notification.data.url);
    })
  );
});

// Periodic cache cleanup
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'cleanup-cache') {
    event.waitUntil(cleanupCache());
  }
});

async function cleanupCache() {
  const cache = await caches.open(CACHE_NAME);
  const keys = await cache.keys();

  for (const request of keys) {
    const response = await cache.match(request);
    if (response) {
      const dateHeader = response.headers.get('date');
      if (dateHeader) {
        const responseDate = new Date(dateHeader).getTime();
        if (Date.now() - responseDate > MAX_CACHE_AGE) {
          await cache.delete(request);
        }
      }
    }
  }
}