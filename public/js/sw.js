// 数字生活 · Service Worker（PWA 可“添加到主屏幕”当 APP 用）
// 策略：除 /api/ 接口外，所有静态资源（HTML/JS/CSS/图标/manifest）一律“网络优先”，
// 失败再回退缓存。这样每次部署新版本后，浏览器刷新即能拿到最新代码，不再被旧缓存卡住。
const CACHE = 'shuzishenghuo-v7';
const PRECACHE = ['./', './index.html', './manifest.webmanifest', './css/style.css', './js/app.js'];

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

  // 网络优先：始终尝试最新资源，离线时回退缓存
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
  );
});
