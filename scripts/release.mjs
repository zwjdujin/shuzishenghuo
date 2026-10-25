#!/usr/bin/env node
// ============================================================
// 数字生活 · 发布脚本（v0.5.5 起替代手工版本目录发版）
// 用法：node scripts/release.mjs <版本号> [发版说明]
//   例：node scripts/release.mjs 0.5.5 "P1 流程地基 + P2 体验修复"
//
// 做四件事：
//   1. 版本号单源注入：app.js / home / health / sysinfo / package.json
//   2. 5 个静态文件按内容 sha256 前 8 位放入 public/assets/<hash>/（内容没变自动复用旧目录）
//   3. 生成固定名 public/sw.js（CACHE 名 = 全部内容 hash 拼接，内容变 → SW 字节变 → 浏览器自动更新）
//   4. 改写 index.html 的 5 处资源引用
// 配合 public/_headers（index/sw no-cache、assets immutable）即获得确定性缓存语义。
// ============================================================
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('用法: node scripts/release.mjs <版本号> [发版说明]   例: 0.5.5');
  process.exit(1);
}
const buildId = process.argv[3] || ('v' + version);
const today = new Date().toISOString().slice(0, 10);

const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const write = (p, s) => writeFileSync(join(ROOT, p), s);
const sha8 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 8);

// ---------- 1. 版本号注入 ----------
const patch = (file, rules) => {
  let s = read(file);
  let changed = 0;
  for (const [re, to] of rules) {
    const before = s;
    s = s.replace(re, to);
    if (s !== before) changed++;
  }
  write(file, s);
  return changed;
};
patch('public/js/app.js', [
  [/^(\/\/ 数字生活 · 前端逻辑 )v[\d.]+/m, `$1v${version}`],
  [/const VERSION = '[^']*';/, `const VERSION = '${version}';`],
  [/const __BUILD_ID__ = '[^']*';/, `const __BUILD_ID__ = '${buildId}';`],
  [/const __BUILD_TIME__ = '[^']*';/, `const __BUILD_TIME__ = '${today}';`],
  [/register\('\.\/sw-v?[\d.]+\.js'\)/, `register('./sw.js')`],
]);
patch('functions/api/home.js', [[/version: '[\d.]+'/m, `version: '${version}'`]]);
patch('functions/api/health.js', [[/version: '[\d.]+'/m, `version: '${version}'`]]);
patch('functions/api/sysinfo.js', [[/pick\(env, 'APP_VERSION', '[\d.]+'\)/, `pick(env, 'APP_VERSION', '${version}')`]]);
{
  const pkg = JSON.parse(read('package.json'));
  pkg.version = version;
  write('package.json', JSON.stringify(pkg, null, 2) + '\n');
}

// ---------- 2. 内容 hash 拷贝 ----------
const FILES = [
  ['public/css/style.css', 'css/style.css', 'style'],
  ['public/js/lunar.js', 'js/lunar.js', 'lunar'],
  ['public/js/profile.js', 'js/profile.js', 'profile'],
  ['public/js/medicine.js', 'js/medicine.js', 'medicine'],
  ['public/js/app.js', 'js/app.js', 'app'],
];
const contents = {};
const hashes = {};
for (const [src, rel] of FILES) {
  contents[rel] = read(src);
  hashes[rel] = sha8(contents[rel]);
  const dest = join(ROOT, 'public/assets', hashes[rel], rel);
  if (!existsSync(dest)) {
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(ROOT, src), dest);
    console.log(`  + assets/${hashes[rel]}/${rel}`);
  } else {
    console.log(`  = assets/${hashes[rel]}/${rel}（内容未变，复用）`);
  }
}

// ---------- 3. index.html 引用改写 ----------
{
  let html = read('public/index.html');
  html = html.replace(/\.\/assets\/[^/"']+(\/css\/style\.css)/, `./assets/${hashes['css/style.css']}$1`);
  for (const name of ['lunar', 'profile', 'medicine', 'app']) {
    html = html.replace(new RegExp(`\\./assets/[^/"']+/js/${name}\\.js`), `./assets/${hashes[`js/${name}.js`]}/js/${name}.js`);
  }
  write('public/index.html', html);
}

// ---------- 4. 固定名 sw.js（字节随内容变化，浏览器自动判定更新） ----------
const cacheTag = sha8(Object.values(contents).join(''));
const pre = [
  "'./', './index.html', './manifest.webmanifest'",
  `'./assets/${hashes['css/style.css']}/css/style.css'`,
  `'./assets/${hashes['js/lunar.js']}/js/lunar.js'`,
  `'./assets/${hashes['js/profile.js']}/js/profile.js'`,
  `'./assets/${hashes['js/medicine.js']}/js/medicine.js'`,
  `'./assets/${hashes['js/app.js']}/js/app.js'`,
].join(', ');
write('public/sw.js', `// 数字生活 · Service Worker（由 scripts/release.mjs 自动生成，勿手改）
// 策略：除 /api/ 外静态资源网络优先、离线回退缓存；install 时预缓存版本化资源。
// 文件名固定为 sw.js（_headers 对其 no-cache）；内容变化 → 字节变化 → 浏览器自动更新。
const CACHE = 'shuzishenghuo-${cacheTag}';

const PRECACHE = [${pre}];

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

// 点击通知 → 聚焦或打开应用
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) { if ('focus' in w) return w.focus(); }
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});
`);

console.log(`\n✅ v${version} 发布产物就绪：sw.js CACHE=${cacheTag}`);
console.log('   提交前请跑：node --check public/js/*.js && node --check public/sw.js');
