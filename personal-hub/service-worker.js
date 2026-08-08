// 个人工作台 PWA Service Worker — ph-v4
// 关键策略：页面 HTML 永远优先走网络（保证用户看到最新版），副本仅用于离线兜底。
const CACHE = 'ph-v4';
self.addEventListener('install', function (e) {
  // 安装新 SW 时立即激活，不等待旧页面关闭
  self.skipWaiting();
});
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      // 删除所有旧版本缓存
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});
self.addEventListener('message', function (e) { if (e.data && e.data.type === 'SKIP_WAITING') { self.skipWaiting(); } });
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  // 页面 HTML：网络优先取最新，失败才用缓存离线兜底
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
  // 其他静态资源：缓存优先，回退网络
  e.respondWith(caches.match(req).then(function (r) { return r || fetch(req); }));
});
