// 个人工作台 PWA Service Worker
// 作用：让网站可被"安装到主屏幕"（Android 真一键安装），并支持离线打开。
const CACHE = 'ph-v2';
const APP_SHELL = ['./', './index.html'];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(APP_SHELL).catch(function () { return c.add('./index.html'); }); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  // 页面导航：优先网络（保证更新），离线时回退缓存
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(function () {
        return caches.match(req).then(function (r) { return r || caches.match('./index.html'); });
      })
    );
    return;
  }
  // 其他静态资源：缓存优先，回退网络
  e.respondWith(
    caches.match(req).then(function (r) { return r || fetch(req); })
  );
});
