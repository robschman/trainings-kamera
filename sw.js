// Offline-Speicher für die App-Dateien.
// Große, unveränderliche Dateien (KI-Modell, Bibliotheken) kommen aus dem Speicher,
// der Rest wird bei Netz frisch geholt und nur ohne Netz aus dem Speicher genommen.
const CACHE = 'trainings-kamera-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return;
  const keep = res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; };
  if (url.pathname.includes('/vendor/')) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(keep)));
  } else {
    e.respondWith(fetch(req).then(keep).catch(() => caches.match(req, { ignoreSearch: true })));
  }
});
