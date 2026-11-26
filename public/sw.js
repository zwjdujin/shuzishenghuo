// 数字生活 · Service Worker（由 scripts/release.mjs 自动生成，勿手改）
// 策略：除 /api/ 外静态资源网络优先、离线回退缓存；install 时预缓存版本化资源。
// 文件名固定为 sw.js（_headers 对其 no-cache）；内容变化 → 字节变化 → 浏览器自动更新。
const CACHE = 'shuzishenghuo-2c6dc0fd';

const PRECACHE = ['./', './index.html', './manifest.webmanifest', './assets/fce02c80/css/style.css', './assets/d40af4ef/js/lunar.js', './assets/f27ea80c/js/profile.js', './assets/7038a657/js/medicine.js', './assets/f4f14e26/js/app.js'];

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
        // v0.5.56：只缓存 2xx 或 opaque（跨域 no-cors，如 jsDelivr 字体 CSS，status 恒为 0）。
        // 此前未校验，404/500 的错误页也被塞进缓存，之后离线时会把错误页当正常内容返回。
        if (res.ok || res.type === 'opaque') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
  );
});

// ===== Web Push：收到推送即弹通知（B 后台到点推送） =====
self.addEventListener('push', (e) => {
  let data = { title: '数字生活', body: '' };
  try { if (e.data) data = e.data.json(); } catch (_) {}
  e.waitUntil(
    self.registration.showNotification(data.title || '数字生活', {
      body: data.body || '',
      icon: './icons/icon-512.png',
      badge: './icons/icon-192.png',
      tag: data.tag || 'szsh-push',
      data: data.url || './',
    })
  );
});

// 点击通知 → 聚焦已开窗口并跳到通知指向的深链，或新开应用
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      // v0.5.56：点通知跳深链（此前只 focus 不导航，点「待办提醒」永远停在当前页）。
      // target 是相对路径（如 ./#/todos），换算成绝对地址再与窗口当前地址比对。
      const abs = new URL(target, self.registration.scope).href;
      for (const w of wins) {
        if ('focus' in w) {
          if (w.navigate && w.url !== abs) return w.navigate(abs).catch(() => w.focus());
          return w.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});
