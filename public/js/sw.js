// 数字生活 · Service Worker（PWA 可“添加到主屏幕”当 APP 用）
// 关键：HTML 与 JS 走“网络优先”，保证部署新版本后浏览器一定能拿到最新代码，
// 不再被首次部署时的旧缓存卡住（之前登录无反应的根因）。
const CACHE = 'shuzishenghuo-v2';
const PRECACHE = ['./', './index.html', './manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // 只处理 GET；POST（登录/接口写入）一律直连网络
  if (req.method !== 'GET') return;
  // 接口请求始终走网络（保证数据实时）
  if (req.url.includes('/api/')) return;

  const url = new URL(req.url);
  const isNav = req.mode === 'navigate';
  const isJS = url.pathname.endsWith('.js') || url.pathname.endsWith('.mjs');

  // 页面与脚本：网络优先，失败再回退缓存（确保更新立即生效）
  if (isNav || isJS) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // CSS / 图标 / manifest：缓存优先，离线可用
  e.respondWith(
    caches.match(req).then((cached) =>
      cached ||
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => cached)
    )
  );
});
