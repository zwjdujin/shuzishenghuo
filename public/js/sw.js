// 数字生活 · 极简 Service Worker（让页面可“添加到主屏幕”当 APP 用）
const CACHE = 'shuzishenghuo-v0.0.1';
const ASSETS = ['./', './index.html', './css/style.css', './js/app.js', './manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  // 接口请求始终走网络（保证数据实时）
  if (req.url.includes('/api/')) return;
  // 静态资源：先缓存后网络，离线可用
  e.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
