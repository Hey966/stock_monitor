const CACHE = 'stx-build-004';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(key => {
      if (key !== CACHE) return caches.delete(key);
    }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  event.respondWith((async () => {
    const req = event.request;
    const url = new URL(req.url);

    if (
      url.pathname.endsWith('.js') ||
      url.pathname.endsWith('.css') ||
      url.pathname.endsWith('.html') ||
      url.pathname.endsWith('manifest.json')
    ) {
      return fetch(req, {
        cache: 'no-store'
      });
    }

    return fetch(req).catch(() => caches.match(req));
  })());
});