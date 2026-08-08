// 个人工作台 PWA Service Worker — ph-v3
// 关键策略：页面 HTML 永远优先走网络（保证用户看到最新版），副本仅用于离线兜底。
const CACHE = 'ph-v3';
self.addEventListener('install', function (e) { self.skipWaiting(); });
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
  // 页面 HTML：stale-while-revalidate（网络优先取最新，后台更新缓存供离线）
  if (req.mode === 'navigate' || /\/index\.html$/.test(url.pathname) || /\/personal-hub\/?$/.test(url.pathname)) {
    e.respondWith(
      fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
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
  // 其他静态资源：缓存优先，回退网络
  e.respondWith(caches.match(req).then(function (r) { return r || fetch(req); }));
});
