self.addEventListener('install', (event) => {
  console.log('STX service worker installed');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('STX service worker activated');
});

self.addEventListener('fetch', () => {});
