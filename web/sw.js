// Service worker de la app instalable (PWA).
// Red primero (siempre la versión publicada más reciente); si no hay conexión, se abre desde la copia guardada.
// No toca Microsoft (inicio de sesión) ni Microsoft Graph / SharePoint: los datos siempre vienen en vivo.
const CACHE = 'control-unidades-__V__';
const BASE = ['./', './index.html', './manifest.webmanifest', './img/icono-192.png', './img/icono-512.png', './img/logo.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('control-unidades-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // Microsoft, Graph, CDNs: sin intervenir
  if (url.pathname.endsWith('/version.json')) return; // aviso de nueva versión: siempre de la red
  e.respondWith(
    fetch(req).then((r) => {
      if (r.ok && r.type === 'basic') { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); }
      return r;
    }).catch(() => caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then((r) => r || caches.match('./index.html'))),
  );
});
