// ????? PWA Service Worker ? ph-v5
// ??????? HTML ?????????????????????????????
const CACHE = 'ph-v5';
self.addEventListener('install', function (e) {
  self.skipWaiting();
});
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});
self.addEventListener('message', function (e) { if (e.data && e.data.type === 'SKIP_WAITING') { self.skipWaiting(); } });
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (req.mode === 'navigate' || /\/index\.html$/.test(url.pathname) || /\/personal-hub\/?$/.test(url.pathname)) {
    e.respondWith(
      fetch(req, { cache: 'no-store' }).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        return caches.match(req).then(function (r) { return r || caches.match('./index.html'); });
      })
    );
    return;
  }
  e.respondWith(caches.match(req).then(function (r) { return r || fetch(req); }));
});
