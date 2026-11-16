// Offline-Speicher für die App-Dateien.
// Große, unveränderliche Dateien (KI-Modell, Bibliotheken) kommen aus dem Speicher,
// der Rest wird bei Netz frisch geholt und nur ohne Netz aus dem Speicher genommen.
//
// Die App kann sich die Adresse mit anderen Seiten teilen (z. B. als Unterordner einer Domain).
// Darum fasst sie nur ihren eigenen Speicher und nur Dateien aus ihrem eigenen Ordner an.
const PREFIX = 'trainings-kamera-';
const CACHE = PREFIX + 'v2';
const HOME = new URL(self.registration.scope).pathname;
const own = () => caches.open(CACHE);

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
));

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || !url.pathname.startsWith(HOME) || url.pathname.includes('/api/')) return;
  const keep = res => { if (res.ok) { const copy = res.clone(); own().then(c => c.put(req, copy)); } return res; };
  if (url.pathname.includes('/vendor/')) {
    e.respondWith(own().then(c => c.match(req)).then(hit => hit || fetch(req).then(keep)));
  } else {
    e.respondWith(fetch(req).then(keep).catch(() => own().then(c => c.match(req, { ignoreSearch: true })).then(hit => hit || Response.error())));
  }
});
