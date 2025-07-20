// service-worker.js

// This is the fetch event handler that satisfies the browser.
// It currently acts as a "no-op" by simply letting requests go to the network.
// You would expand this in the future to implement caching strategies.
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});

// These are common lifecycle events for a Service Worker.
// 'install' event: Fired when the service worker is installed.
// self.skipWaiting() ensures the new service worker activates immediately
// without waiting for existing tabs to close.
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// 'activate' event: Fired when the service worker is activated.
// clients.claim() ensures the service worker controls any pages that
// opened before the service worker was activated.
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// You can add other event listeners here, like 'push' or 'sync' for
// more advanced PWA features.