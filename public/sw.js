// Service worker: cache app shell + handle push notifications
const CACHE = 'alerte-accident-v2';
const SHELL = [
  '/',
  '/styles.css',
  '/app.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Never cache API or dynamic photo endpoints
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/photo/')) {
    return;
  }
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached =>
      cached || fetch(e.request).then(r => {
        const copy = r.clone();
        if (r.ok) caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return r;
      }).catch(() => cached)
    )
  );
});

self.addEventListener('push', e => {
  let data = { title: 'Alerte Accident', body: 'Nouvelle alerte' };
  try { if (e.data) data = e.data.json(); } catch {}
  const opts = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'alerte-' + (data.accidentId || Date.now()),
    data: { url: data.url || '/', accidentId: data.accidentId },
    vibrate: [200, 100, 200],
    requireInteraction: false
  };
  e.waitUntil(self.registration.showNotification(data.title || 'Alerte Accident', opts));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes(url) && 'focus' in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
