const CACHE = 'stx-build-017';
const STATIC_VERSION = 'build-017';

async function clearAllCaches() {
  const keys = await caches.keys();
  await Promise.all(keys.map((key) => caches.delete(key)));
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    await clearAllCaches();
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await clearAllCaches();
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) {
      client.postMessage({ type: 'STX_CACHE_CLEARED', version: STATIC_VERSION });
    }
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && (event.data.type === 'CLEAR_STX_CACHE' || event.data.type === 'SKIP_WAITING')) {
    event.waitUntil((async () => {
      await clearAllCaches();
      await self.skipWaiting();
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clients) {
        client.postMessage({ type: 'STX_CACHE_CLEARED', version: STATIC_VERSION });
      }
    })());
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request, { cache: 'no-store' }));
});