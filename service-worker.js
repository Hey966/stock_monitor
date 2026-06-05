const CACHE = 'stx-build-013';
const STATIC_VERSION = 'build-013';

async function clearOldCaches() {
  const keys = await caches.keys();
  await Promise.all(
    keys.map((key) => {
      if (key !== CACHE || key.startsWith('stx-build-')) return caches.delete(key);
      return Promise.resolve(false);
    })
  );
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await clearOldCaches();
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) {
      client.postMessage({ type: 'STX_CACHE_CLEARED', version: STATIC_VERSION });
    }
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_STX_CACHE') {
    event.waitUntil((async () => {
      await clearOldCaches();
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clients) {
        client.postMessage({ type: 'STX_CACHE_CLEARED', version: STATIC_VERSION });
      }
    })());
  }
});

self.addEventListener('fetch', (event) => {
  event.respondWith((async () => {
    const req = event.request;
    const url = new URL(req.url);

    if (req.method !== 'GET') return fetch(req);

    if (
      url.pathname.endsWith('.js') ||
      url.pathname.endsWith('.css') ||
      url.pathname.endsWith('.html') ||
      url.pathname.endsWith('manifest.json') ||
      url.pathname.endsWith('/')
    ) {
      return fetch(req, { cache: 'no-store' });
    }

    return fetch(req).catch(() => caches.match(req));
  })());
});
