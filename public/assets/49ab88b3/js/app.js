// 数字生活 · 前端逻辑 v0.5.32
const VERSION = '0.5.32';
// 本次发版信息（系统信息页展示）
const __BUILD_ID__ = '人际关系档案卷宗改版：目录导航+模块排序设置+BMI自动计算；设置页新增档案目录拖动排序';
const __BUILD_TIME__ = '2026-10-30';

// 同步状态（数据实时写入云端 D1，无待同步队列）
let __SYNC_TIME__ = '尚未同步';
let __PENDING__ = '0 项';
let __CONFLICT__ = '0 项';
// 每次成功调用写接口后更新「最近成功同步」
function markSynced() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  __SYNC_TIME__ = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  __PENDING__ = '0 项';
}

// 全局错误兜底：任何未捕获错误都在页面顶部显示红条，避免“点了没反应”却毫无提示
function fatal(msg) {
  let b = document.getElementById('fatalBanner');
  if (!b) {
    b = document.createElement('div');
    b.id = 'fatalBanner';
    b.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:9999;background:#b00020;color:#fff;font:13px/1.5 -apple-system,system-ui,sans-serif;padding:10px 14px;white-space:pre-wrap;box-shadow:0 2px 8px rgba(0,0,0,.3)';
    (document.body || document.documentElement).appendChild(b);
  }
  b.textContent = '⚠ 页面出错：' + msg;
}
window.addEventListener('error', (e) => fatal(e.message + (e.filename ? ` @ ${e.filename}:${e.lineno}` : '')));
window.addEventListener('unhandledrejection', (e) => fatal('Promise: ' + (e.reason && e.reason.message ? e.reason.message : e.reason)));

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
// 带空值保护的绑定助手：元素缺失时静默跳过（HTML/JS 版本错配时不再让整个应用崩溃）
function bind(sel, type, fn) {
  const el = $(sel);
  if (el) el.addEventListener(type, fn);
}

// HTML 转义：innerHTML 模板里插值用户数据（名称/备注/分类/单位/清单等）必须包一层。
// 定义在文件顶部，供所有模块使用（勿再各处另写转义实现）。
const escHtml = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function money(n) {
  return '¥' + Math.round(Number(n || 0)).toLocaleString('zh-CN');
}
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2200);
}
async function api(path, opts = {}) {
  const res = await fetch(path, { credentials: 'same-origin', ...opts });
  if (res.status === 401) {
    showLogin();
    throw new Error('unauthorized');
  }
  return res;
}

// ===== 弹窗统一管理（v0.5.5）=====
// openModal/closeModal：登记弹窗栈，负责 aria-modal、初始焦点与关闭后焦点归还。
// Esc 关闭走全局监听（见下方 keydown），优先触发各弹窗自己的关闭按钮以复用其清理逻辑。
const modalStack = [];
function openModal(m, { onEsc } = {}) {
  if (typeof m === 'string') m = $(m);
  if (!m || !m.hidden) return;
  modalStack.push({ m, onEsc, prevFocus: document.activeElement });
  m.hidden = false;
  m.setAttribute('role', 'dialog');
  m.setAttribute('aria-modal', 'true');
  const first = m.querySelector('.modal-card button, .modal-card input, .modal-card select, .modal-card textarea');
  if (first && first.focus) { try { first.focus(); } catch (_) {} }
}
function closeModal(m) {
  if (typeof m === 'string') m = $(m);
  if (!m || m.hidden) return;
  const idx = modalStack.findIndex((x) => x.m === m);
  const prev = idx >= 0 ? modalStack[idx].prevFocus : null;
  if (idx >= 0) modalStack.splice(idx, 1);
  m.hidden = true;
  m.removeAttribute('aria-modal');
  if (prev && prev.focus && document.contains(prev)) { try { prev.focus(); } catch (_) {} }
}
// Esc：关闭最上层可见弹窗。带 onEsc 的（如 confirmModal）走回调保证其 Promise 被 resolve；
// 其余优先点它自己的 Close 按钮（复用其表单清理逻辑），找不到才直接隐藏。
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const open = $$('.modal-overlay:not([hidden])');
  const m = open[open.length - 1];
  if (!m) return;
  const entry = modalStack.find((x) => x.m === m);
  if (entry && entry.onEsc) { entry.onEsc(); return; }
  const id = m.id || '';
  const closer = $('#' + id + 'Close') || $('#' + id.replace(/Modal$/, '') + 'Close');
  if (closer) closer.click();
  else closeModal(m);
});

// 自绘确认弹窗（替代 confirm()：TWA/WebView 里原生 confirm 不可靠且不可控）
// 用法：if (!(await confirmModal('确定删除？'))) return;
function confirmModal(msg, { okText = '确定', cancelText = '取消', danger = true } = {}) {
  return new Promise((resolve) => {
    const m = $('#confirmModal');
    if (!m) { resolve(window.confirm(msg)); return; } // HTML 未就绪时兜底
    $('#confirmMsg').textContent = msg;
    const ok = $('#confirmOkBtn');
    const cancel = $('#confirmCancelBtn');
    if (ok) { ok.textContent = okText; ok.classList.toggle('danger', !!danger); }
    if (cancel) cancel.textContent = cancelText;
    const done = (v) => {
      ok.onclick = null; cancel.onclick = null; m.onclick = null;
      closeModal(m);
      resolve(v);
    };
    ok.onclick = () => done(true);
    cancel.onclick = () => done(false);
    m.onclick = (e) => { if (e.target === m) done(false); };
    openModal(m, { onEsc: () => done(false) });
  });
}

// ===== 主题配色（v0.3.8 全新设计） =====
// 18 款中国传统色，每款自动派生出「日间 / 夜间」两套色板。
// 色名与色值来源：https://api.dujin.org/colors/cn-colors/
const CN_COLORS = [
  { key: 'zhiyin',    label: '胭脂',   base: '#952E3A' },
  { key: 'mudan',     label: '牡丹红', base: '#B80233' },
  { key: 'meigui',    label: '玫瑰红', base: '#973444' },
  { key: 'yinhong',   label: '殷红',   base: '#A4414F' },
  { key: 'zhangdan',  label: '章丹',   base: '#EB652D' },
  { key: 'juhuang',   label: '桔黄',   base: '#E8853B' },
  { key: 'tanxiang',  label: '檀香',   base: '#DC943B' },
  { key: 'minghuang', label: '明黄',   base: '#F0C649' },
  { key: 'ganlan',    label: '橄榄绿', base: '#6A6834' },
  { key: 'canglv',    label: '苍绿',   base: '#4E5F45' },
  { key: 'cuilv',     label: '翠绿',   base: '#006E5F' },
  { key: 'hulv',      label: '湖绿',   base: '#46817E' },
  { key: 'yushi',     label: '玉石蓝', base: '#507883' },
  { key: 'zhuyue',    label: '竹月',   base: '#5E90B8' },
  { key: 'liuli',     label: '琉璃蓝', base: '#1A638A' },
  { key: 'shenzhu',   label: '深竹月', base: '#2578B5' },
  { key: 'longdan',   label: '龙胆紫', base: '#423171' },
  { key: 'ziluo',     label: '紫罗蓝', base: '#732E7E' },
];

/* ---------- 色彩工具 ---------- */
function hexToHsl(hex) {
  let s = String(hex).replace('#', '');
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  const r = parseInt(s.slice(0, 2), 16) / 255;
  const g = parseInt(s.slice(2, 4), 16) / 255;
  const b = parseInt(s.slice(4, 6), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  const l = (mx + mn) / 2;
  let h = 0, sat = 0;
  if (d) {
    sat = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s: sat * 100, l: l * 100 };
}
function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = Math.min(100, Math.max(0, s)) / 100;
  l = Math.min(100, Math.max(0, l)) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const to = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return '#' + to(r) + to(g) + to(b);
}
/** WCAG 相对亮度：用来保证主色上的白字可读 */
function relLum(hex) {
  const s = String(hex).replace('#', '');
  const ch = [0, 2, 4].map((i) => {
    const v = parseInt(s.slice(i, i + 2), 16) / 255;
    return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4);
  });
  return .2126 * ch[0] + .7152 * ch[1] + .0722 * ch[2];
}
/** 给定色相/饱和度，二分求出相对亮度约为 target 的明度（relLum 随明度单调递增） */
function lumToLightness(h, s, target) {
  let lo = 0, hi = 100;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (relLum(hslToHex(h, s, mid)) < target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/* ---------- 由单一国色派生两套色板 ---------- */
function dayPalette(base) {
  const { h, s, l } = hexToHsl(base);
  return {
    // 主色：浅色自动压深到「白字可读」的亮度，深色保持原汁原味
    main:   hslToHex(h, s, Math.min(l, lumToLightness(h, s, .145))),
    accent: hslToHex(h, Math.min(s + 6, 100), lumToLightness(h, s, .085)),
    soft:   hslToHex(h, Math.min(Math.round(s * .55), 42), 95),
    card:   hslToHex(h, Math.min(Math.round(s * .32), 24), 98.6),
    paper:  hslToHex(h, Math.min(Math.round(s * .42), 32), 96.2),
    side:   hslToHex(h, Math.min(Math.round(s * .50), 38), 93.2),
    ink:    hslToHex(h, Math.min(Math.round(s * .45), 40), 16),
    muted:  hslToHex(h, Math.min(Math.round(s * .26), 24), 44),
    line:   hslToHex(h, Math.min(Math.round(s * .36), 30), 88),
    on: '#ffffff',
  };
}
function nightPalette(base) {
  const { h, s } = hexToHsl(base);
  const ns = Math.min(Math.round(s * 1.05), 88);
  const pl = lumToLightness(h, ns, .20);
  return {
    main:   hslToHex(h, ns, pl),
    accent: hslToHex(h, ns, Math.min(pl + 8, 78)),
    soft:   hslToHex(h, Math.min(Math.round(s * .55), 34), 15),
    card:   hslToHex(h, Math.min(Math.round(s * .40), 22), 10),
    /* 次级容器面（列表行 / 输入框 / 次级按钮）：比卡片亮一档，夜间不残留亮白 */
    surface:hslToHex(h, Math.min(Math.round(s * .46), 24), 14.5),
    paper:  hslToHex(h, Math.min(Math.round(s * .48), 26), 6.5),
    side:   hslToHex(h, Math.min(Math.round(s * .48), 26), 4.4),
    ink:    hslToHex(h, Math.min(Math.round(s * .20), 20), 93),
    muted:  hslToHex(h, Math.min(Math.round(s * .18), 18), 66),
    line:   hslToHex(h, Math.min(Math.round(s * .34), 28), 21),
    on: '#ffffff',
  };
}

const THEMES = {};
CN_COLORS.forEach((c) => {
  THEMES[c.key] = { label: c.label, base: c.base, day: dayPalette(c.base), night: nightPalette(c.base) };
});
const DEFAULT_THEME = CN_COLORS[0].key;

let currentTheme = DEFAULT_THEME;
/** 把主题的日/夜色板写入 CSS 令牌；实际生效变量由 [data-mode] 决定 */
function applyTheme(name) {
  const key = THEMES[name] ? name : DEFAULT_THEME;
  currentTheme = key;
  const { day: d, night: n } = THEMES[key];
  const vars = {
    // 主色：浅色自动压深到「白字可读」的亮度，深色保持原汁原味
    '--t-day-plum': d.main,   '--t-day-accent': d.accent,
    '--t-day-soft': d.soft,   '--t-day-card': d.card,
    '--t-day-paper': d.paper, '--t-day-side': d.side,
    '--t-day-ink': d.ink,     '--t-day-muted': d.muted,
    '--t-day-line': d.line,   '--t-day-deep': d.accent,
    /* 首页 Hero 大模块渐变：日间用主色→突显色（都够深，白字可读），夜间用主题暗色 */
    '--t-day-hero': `linear-gradient(135deg,${d.main},${d.accent})`,
    '--t-night-plum': n.main,   '--t-night-accent': n.accent,
    '--t-night-soft': n.soft,   '--t-night-card': n.card,
    '--t-night-surface': n.surface,
    '--t-night-hero': `linear-gradient(135deg,${n.soft},${n.card})`,
    '--t-night-paper': n.paper, '--t-night-side': n.side,
    '--t-night-ink': n.ink,     '--t-night-muted': n.muted,
    '--t-night-line': n.line,   '--t-night-deep': n.accent,
  };
  const root = document.documentElement;
  Object.keys(vars).forEach((p) => root.style.setProperty(p, vars[p]));
  syncThemeColor();
  persistBootVars(vars);
  try { localStorage.setItem('pf_theme', key); } catch (_) {}
}
/** 首屏外观变量缓存：head 里的内联脚本读取后提前上色，避免先闪默认主题再被主脚本纠正 */
function persistBootVars(patch) {
  try {
    const all = JSON.parse(localStorage.getItem('pf_vars') || '{}');
    Object.assign(all, patch);
    localStorage.setItem('pf_vars', JSON.stringify(all));
  } catch (_) { /* 隐私模式忽略 */ }
}
function hasLocalTheme() {
  try { return !!localStorage.getItem('pf_theme'); } catch (_) { return false; }
}
/** 同步浏览器地址栏 / PWA 的主题色 */
function syncThemeColor() {
  const t = THEMES[currentTheme];
  if (!t) return;
  const night = document.documentElement.getAttribute('data-mode') === 'night';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', night ? t.night.paper : t.day.paper);
}

/* ===== 外观多端同步 =====
   服务端 app_settings 是权威源（电脑上选好配色，手机打开就是同一套）；
   localStorage 只作首屏缓存，避免每次刷新先闪一下默认色。 */
/** 用云端返回的外观覆盖本机（静默应用，不回写服务端） */
function applyAppearanceFromServer(ap) {
  if (!ap) return;
  if (ap.theme && THEMES[ap.theme]) applyTheme(ap.theme);
  if (ap.font && FONTS[ap.font]) applyFont(ap.font);
  if (ap.mode && ['light', 'night', 'auto'].includes(ap.mode)) {
    uiMode = ap.mode;
    lastAppliedMode = '';
    applyUIMode();
    buildModeOpts();
  }
}
/** 用户显式改动外观 → 回写服务端；失败静默（本机已生效，页面顶部同步状态会提示） */
async function pushAppearance(patch) {
  try {
    await api('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  } catch (_) { /* 离线 / 未登录时忽略 */ }
}

// ===== 字体（v0.3.8：只提供「默认字体」与「霞鹜文楷」两种） =====
// 霞鹜文楷经 Google Fonts 加载，OFL 开源协议，可免费商用
const FONTS = {
  default: { label: '默认字体', note: '系统默认 · 苹方 / 雅黑', stack: `-apple-system,BlinkMacSystemFont,"Inter","PingFang SC","Microsoft YaHei",sans-serif`, serif: `"Songti SC",serif` },
  lxgwwk:  { label: '霞鹜文楷', note: 'OFL 开源 · 可免费商用', stack: `"LXGW WenKai","霞鹜文楷",-apple-system,"PingFang SC","Microsoft YaHei",sans-serif`, serif: `"LXGW WenKai","霞鹜文楷","Songti SC",serif` },
};
let currentFont = 'default';

// ===== 日夜模式（日出日落自动） =====
let uiMode = 'auto';           // light | night | auto
let lastAppliedMode = '';

/** 按纬度与日期估算日出日落时刻（简化算法，精度 ±10 分钟） */
function sunTimes(lat, date) {
  const rad = Math.PI / 180;
  const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000);
  // 太阳赤纬
  const decl = 23.45 * rad * Math.sin(((360 / 365) * (dayOfYear - 81)) * rad);
  // 日落/日出时角（忽略经度与时区中心 meridian）
  const latR = lat * rad;
  const cosH = -Math.tan(latR) * Math.tan(decl);
  let sunsetHour;
  if (cosH >= 1 || cosH <= -1) sunsetHour = 19; // 极昼/极夜
  else {
    const H = Math.acos(cosH) / rad / 15;       // 半昼长（小时）
    sunsetHour = 12 + H;
  }
  return { sunrise: 12 - (sunsetHour - 12), sunset: sunsetHour };
}

/** 应用模式；auto 时按当前时刻与日出日落判断 */
function applyUIMode() {
  let mode = uiMode;
  if (mode === 'auto') {
    const t = sunTimes(30.5, new Date()); // 默认按南京/深圳一带估算
    const now = new Date();
    const h = now.getHours() + now.getMinutes() / 60;
    mode = (h >= t.sunrise && h < t.sunset) ? 'light' : 'night';
  }
  if (mode === lastAppliedMode) return;
  lastAppliedMode = mode;
  document.documentElement.setAttribute('data-mode', mode);
  try { localStorage.setItem('pf_mode', uiMode); } catch (_) {}
  updateModeTip(mode);
  syncThemeColor();
  const badge = $('#modeNow');
  if (badge) badge.textContent = mode === 'night' ? '夜间' : '日间';
}

function updateModeTip(actual) {
  const tip = $('#modeTip');
  if (!tip) return;
  const now = actual === 'night' ? '夜间' : '日间';
  if (uiMode !== 'auto') {
    tip.textContent = `固定为${uiMode === 'night' ? '夜间模式' : '日间模式'}，界面当前以${now}显示。`;
    return;
  }
  const t = sunTimes(30.5, new Date());
  // 分钟取整到 60 时进位到小时，避免出现「07:60」
  const fmt = (x) => {
    let h = Math.floor(x);
    let m = Math.round((x - h) * 60);
    if (m >= 60) { h = (h + 1) % 24; m = 0; }
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };
  tip.textContent = `跟随日出日落自动切换，当前为${now} · 今日日出约 ${fmt(t.sunrise)}，日落约 ${fmt(t.sunset)}`;
}

function buildModeOpts() {
  const box = $('#modeSeg');
  if (!box) return;
  box.querySelectorAll('[data-mode]').forEach((b) => {
    b.classList.toggle('on', b.dataset.mode === uiMode);
    // 用 onclick 赋值而非 addEventListener：本函数会被重复调用，后者会让监听器成倍累积
    b.onclick = () => {
      uiMode = b.dataset.mode;
      lastAppliedMode = '';      // 强制重算
      applyUIMode();
      buildModeOpts();
      syncThemeColor();
      pushAppearance({ mode: uiMode });
      toast(uiMode === 'auto' ? '已开启日出日落自动切换' : (uiMode === 'night' ? '已切换夜间模式' : '已切换日间模式'));
    };
  });
  applyUIMode();
  // 每分钟检查一次（跨过日出/日落时自动切换）；全局只注册一个定时器
  if (!buildModeOpts._timer) {
    buildModeOpts._timer = setInterval(() => { if (uiMode === 'auto') { lastAppliedMode = ''; applyUIMode(); } }, 60000);
  }
}

function buildFontOpts() {
  const box = $('#fontOpts');
  if (!box) return;
  box.innerHTML = Object.keys(FONTS).map((k) => {
    const f = FONTS[k];
    return `<button type="button" class="tf${currentFont === k ? ' on' : ''}" data-font="${k}">
      <span class="tf-spec">Aa</span>
      <span class="tf-meta"><b>${f.label}</b><small>${f.note}</small></span>
      <span class="tf-check"><svg><use href="#i-check"/></svg></span>
    </button>`;
  }).join('');
  box.querySelectorAll('.tf').forEach((el) => {
    const f = FONTS[el.dataset.font];
    const spec = el.querySelector('.tf-spec');
    // 预览字样必须使用对应字体：内联 !important 才能压过全站的 !important 字体规则
    if (f && spec) spec.style.setProperty('font-family', f.stack, 'important');
    el.addEventListener('click', () => pickFont(el.dataset.font));
  });
}
function pickFont(name) {
  applyFont(name);
  buildFontOpts();
  pushAppearance({ font: currentFont });
  toast('已切换字体：' + FONTS[currentFont].label);
}

// 霞鹜文楷的 webfont CSS 按需注入：只有用户选中该字体才拉取 jsDelivr
// （整包是数百个 CJK 分片约 1MB+，默认加载会拖慢首屏，且该 CDN 在大陆不稳定）
let lxgwInjected = false;
function ensureLxgwLink() {
  if (lxgwInjected || document.querySelector('link[data-lxgw]')) { lxgwInjected = true; return; }
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.setAttribute('data-lxgw', '1');
  l.href = 'https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.7.0/style.css';
  document.head.appendChild(l);
  lxgwInjected = true;
}

function applyFont(name) {
  currentFont = FONTS[name] ? name : 'default';
  const f = FONTS[currentFont];
  const root = document.documentElement;
  // --f-ui / --f-serif 为实际生效变量（配套样式表中的 !important 覆盖层）；另写 --font-* 兼容旧引用
  root.style.setProperty('--f-ui', f.stack);
  root.style.setProperty('--f-serif', f.serif);
  root.style.setProperty('--font-ui', f.stack);
  root.style.setProperty('--font-serif', f.serif);
  if (currentFont === 'lxgwwk') ensureLxgwLink();
  persistBootVars({
    '--f-ui': f.stack, '--f-serif': f.serif,
    '--font-ui': f.stack, '--font-serif': f.serif,
  });
  try { localStorage.setItem('pf_font', currentFont); } catch (_) {}
}

// ===== 登录 =====
function showLogin() {
  const splash = $('#bootSplash');
  if (splash) splash.hidden = true;
  const fail = $('#bootErr');
  if (fail) fail.hidden = true;
  $('#appShell').hidden = true;
  $('#loginOverlay').hidden = false;
  $('#loginError').hidden = true;
}
function showLoginError(msg) {
  const err = $('#loginError');
  err.textContent = msg;
  err.hidden = false;
}
// 登录：直接用 fetch，不要把 401 交给 api() 包装函数（否则会被静默吞掉、毫无提示）
bind('#loginForm', 'submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const btn = e.target.querySelector('button');
  const user = String(fd.get('user') || '').trim();
  const pass = String(fd.get('pass') || '');
  if (!user || !pass) { showLoginError('请输入用户名和密码'); return; }
  btn.disabled = true;
  showLoginError('');
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ user, pass }),
    });
    let data = {};
    try { data = await res.json(); } catch (_) {}
    if (!res.ok) {
      showLoginError(data.error || ('登录失败（HTTP ' + res.status + '）'));
      return;
    }
    // 登录成功：进入主界面
    $('#loginOverlay').hidden = true;
    $('#appShell').hidden = false;
    routeFromHash();   // 登录前若带了深链（#/ledger 等），登录后直达
    try {
      await loadHome();
    } catch (err) {
      showLoginError('已登录，但加载首页失败：' + (err && err.message ? err.message : err));
      $('#loginOverlay').hidden = false;
      $('#appShell').hidden = true;
    }
  } catch (err) {
    showLoginError('网络错误，无法连接服务器：' + (err && err.message ? err.message : err));
  } finally {
    btn.disabled = false;
  }
});

// 退出登录（入口在「个人中心」）
async function doLogout() {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  showLogin();
}

// ===== 启动：检查登录状态 =====
async function boot() {
  $('#versionText').textContent = 'v' + VERSION;
  const lv = $('#loginVersion');
  if (lv) lv.textContent = '当前版本：v' + VERSION;
  const splash = $('#bootSplash');
  const fail = $('#bootErr');
  if (fail) fail.hidden = true;
  if (splash) splash.hidden = false;
  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (res.ok) {
      if (splash) splash.hidden = true;
      $('#loginOverlay').hidden = true;
      $('#appShell').hidden = false;
      routeFromHash();           // 深链：#/ledger、#/relations/5、#/settings/style 直接进入
      await loadHome();
      maybeNotifyTodos();
      document.addEventListener('visibilitychange', () => { if (!document.hidden) maybeNotifyTodos(); });
    } else {
      showLogin();
    }
  } catch {
    // 网络异常 ≠ 未登录：不再误踢到登录页，给出重试入口
    if (splash) splash.hidden = true;
    if (fail) fail.hidden = false;
    else showLogin();
  }
}
bind('#bootRetryBtn', 'click', boot);

// ===== 加载首页数据 =====
async function loadHome() {
  const res = await api('/api/home');
  const data = await res.json();
  markSynced();
  renderHome(data);
}

// 十二时辰 → 循行经络（子午流注）
const SHICHEN = [
  { name: '子时', range: '23:00-01:00', meridian: '足少阳胆经', tip: '子时睡得足，黑眼圈不露' },
  { name: '丑时', range: '01:00-03:00', meridian: '足厥阴肝经', tip: '丑时不睡晚，脸上不长斑' },
  { name: '寅时', range: '03:00-05:00', meridian: '手太阴肺经', tip: '寅时睡得熟，色红精气足' },
  { name: '卯时', range: '05:00-07:00', meridian: '手阳明大肠经', tip: '卯时大肠蠕，排毒渣滓出' },
  { name: '辰时', range: '07:00-09:00', meridian: '足阳明胃经', tip: '辰时吃早餐，营养身体安' },
  { name: '巳时', range: '09:00-11:00', meridian: '足太阴脾经', tip: '巳时脾经旺，造血身体壮' },
  { name: '午时', range: '11:00-13:00', meridian: '手少阴心经', tip: '午时一小憩，安神养精气' },
  { name: '未时', range: '13:00-15:00', meridian: '手太阳小肠经', tip: '未时分清浊，饮水能降火' },
  { name: '申时', range: '15:00-17:00', meridian: '足太阳膀胱经', tip: '申时津液足，养阴身体舒' },
  { name: '酉时', range: '17:00-19:00', meridian: '足少阴肾经', tip: '酉时肾藏精，纳华元气清' },
  { name: '戌时', range: '19:00-21:00', meridian: '手厥阴心包经', tip: '戌时护心脏，减压心舒畅' },
  { name: '亥时', range: '21:00-23:00', meridian: '手少阳三焦经', tip: '亥时百脉通，养身养娇容' },
];
function shichenOf(hour) {
  // 每个时辰占 2 小时：子 23-1, 丑 1-3, ... 亥 21-23
  const idx = Math.floor(((hour + 1) % 24) / 2);
  return SHICHEN[idx];
}
function renderShichen(hour) {
  const sc = shichenOf(hour);
  const orbit = $('.score-orbit');
  // 时辰名写进中间徽标，时间段写在下方小字
  const badge = $('#dayBadge');
  if (badge) badge.textContent = sc.name;
  if (orbit) {
    let small = orbit.querySelector('.shichen-range');
    if (!small) {
      small = document.createElement('small');
      small.className = 'shichen-range';
      orbit.appendChild(small);
    }
    small.textContent = sc.range;
  }
  const g = $('#heroGreeting');
  if (g) g.textContent = sc.meridian;
  const s = $('#heroSummary');
  if (s) s.textContent = sc.tip;
}

function renderHome(d) {
  // 品牌
  $('#brandAvatar').textContent = (d.brand && d.brand.avatar) || '数';
  $('#brandName').textContent = (d.brand && d.brand.name) || '数字生活';
  $('#brandTagline').textContent = (d.brand && d.brand.tagline) || '把日子过成自己喜欢的样子';
  // 外观以云端为准（首屏已由 localStorage 兜底渲染，这里对齐到云端值，实现多端一致）
  if (d.appearance) applyAppearanceFromServer(d.appearance);
  else if (d.brand && d.brand.theme && !hasLocalTheme()) applyTheme(d.brand.theme);

  // Hero 问候：按十二时辰显示时辰 + 对应循行经络
  const h = new Date().getHours();
  renderShichen(h);

  // 统计卡
  const s = d.stats;
  $('#stTodos').textContent = s.todos.today;
  $('#stTodosHint').textContent = `逾期 ${s.todos.overdue} · 本周 ${s.todos.week}`;
  // 有逾期 → 加 .alert 类走语义令牌（日夜都暗）；不再写死内联底色
  const todoIcon = $('#card-todos').querySelector('.stat-icon');
  if (todoIcon) todoIcon.classList.toggle('alert', s.todos.overdue > 0);
  $('#stHabits').textContent = `${s.habits.done} / ${s.habits.total}`;
  $('#stHabitsHint').textContent = '今日完成';
  $('#stLedger').textContent = money(s.ledger.balance);
  $('#stLedgerHint').textContent = `收 ${money(s.ledger.income)} · 支 ${money(s.ledger.expense)}`;
  $('#stMedicine').textContent = s.medicines.total;
  $('#stMedicineHint').textContent = `临期 ${s.medicines.expiring}`;
  $('#stCalendar').textContent = s.events.today;
  $('#stCalendarHint').textContent = '今日事件';
  $('#stRelations').textContent = s.relations.upcoming;
  $('#stRelationsHint').textContent = '近期生日';

  renderTodayTasks(d.todayTasks || []);
  renderPendingHabits(d.pendingHabits || []);
  renderGlance(d);
  renderP3(d.p3 || {});   // v0.6.0：随手记 / 那年今天 / 今日服药（v0.5.31 起移除保持联系）
}

/* ================= v0.6.0 · P3 首页卡片 ================= */

/** 随手记：一句话 → 优先 AI 解析（可编辑预览），未配置 AI 则直接存 memo */
// ===== v0.5.21 随手记图片：拍照/选图 → 压缩 → 缩略图 → 随文本一起交给 AI =====
let qnImageData = null;
function qnSetImage(dataUrl) {
  qnImageData = dataUrl;
  const chip = $('#qnImageChip');
  if (!chip) return;
  chip.hidden = !dataUrl;
  if (dataUrl) $('#qnImageThumb').src = dataUrl;
}
function qnReadImage(file) {
  if (!file || !/^image\/(png|jpe?g|webp)$/.test(file.type)) { toast('请选择 PNG / JPG / WebP 图片'); return; }
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      // 压缩到长边 ≤1600、JPEG 0.85，控制请求体体积
      const MAX = 1600;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * scale);
      cv.height = Math.round(img.height * scale);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      qnSetImage(cv.toDataURL('image/jpeg', 0.85));
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

async function quickNoteSubmit(e) {
  e.preventDefault();
  const input = $('#qnInput');
  const btn = $('#qnSubmitBtn');
  const text = String(input.value || '').trim();
  if (!text && !qnImageData) return;
  btn.disabled = true;
  try {
    aiQueue = [];            // 新提交清空上一轮 AI 队列
    let drafts = null;
    let parseErr = '';
    try {
      const res = await api('/api/ai/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, image: qnImageData }),
      });
      const d = await res.json();
      if (d.ok && Array.isArray(d.drafts)) drafts = d.drafts;
      else parseErr = d.error || '';
    } catch (_) { /* AI 不可用走 memo */ }
    // 带图请求失败（未配视觉/图过大等）：明确提示并保留输入与图片
    if (qnImageData && !drafts && parseErr) {
      toast(parseErr);
      return;
    }
    // v0.5.27：识别结果全部按类型走专属录入窗口（账单→记一笔 / 药品→录入药品+药典 /
    // 待办→直接录入或新增待办弹窗 / 联系人→添加联系人弹窗 / 备忘→直接保存），无简易确认框
    aiQueue = (drafts || []).slice(0, 10);
    if (aiQueue.length) {
      toast('AI 已识别，请逐条确认');
      await drainAiQueue();
    } else {
    const res = await api('/api/memos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      });
      if (res.ok) {
        // AI 已配置却没识别出账目/待办时说明一句，避免误以为记账成功
        const aiOn = drafts !== null;
        toast(aiOn ? 'AI 未识别为账目，已存为备忘' : '已记下');
        markSynced(); await refreshP3Memos();
      }
    }
    input.value = '';
    qnSetImage(null); // 清除待识别图片（含数据），避免残留在后续提交里
  } catch (_) { /* 401 已处理 */ } finally { btn.disabled = false; }
}

/** v0.5.23：AI 识别的待办直接录入（仅事情+时间时） */
async function saveTodoFromAi(d) {
  const title = String(d.title || '').trim();
  if (!title) return false;
  const res = await api('/api/todos', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title,
      date: /^\d{4}-\d{2}-\d{2}$/.test(d.date || '') ? d.date : todayStrLocal(),
      time: /^\d{2}:\d{2}$/.test(d.time || '') ? d.time : '',
      list: '生活',
    }),
  });
  return res.ok;
}

/** v0.5.27：AI 识别的联系人 → 打开「添加联系人」弹窗预填（电话/微信暂存备注由人工归档） */
function openContactFromAi(d) {
  if (window.pfOpenEditModal) window.pfOpenEditModal();
  const f = document.getElementById('contactEditForm');
  if (!f) return;
  if (d.rname) f.firstName.value = String(d.rname).slice(0, 20);
  const bits = [d.phone && '电话 ' + d.phone, d.wechat && '微信 ' + d.wechat, d.qq && 'QQ ' + d.qq,
    d.company && ('公司 ' + d.company + (d.position ? ' · ' + d.position : ''))].filter(Boolean);
  if (bits.length && f.note) f.note.value = bits.join('；').slice(0, 60);
  toast('已按识别预填，请核验后保存');
}

async function refreshP3Memos() {
  try {
    const res = await api('/api/memos?limit=3');
    const d = await res.json();
    renderP3Memos(d.list || []);
  } catch (_) { /* 忽略 */ }
}
function renderP3Memos(list) {
  const box = $('#qnMemoList');
  if (!box) return;
  if (!list.length) { box.innerHTML = ''; return; }
  box.innerHTML = list.map((m) => `
    <div class="qn-memo">
      <small>${escHtml(m.date.slice(5))}</small>
      <span></span>
      <button class="icon-btn del" data-memo-id="${m.id}" title="删除" aria-label="删除"><svg><use href="#i-x"/></svg></button>
    </div>`).join('');
  const spans = box.querySelectorAll('.qn-memo span');
  list.forEach((m, i) => { spans[i].textContent = m.content; });
  box.querySelectorAll('.del').forEach((b) => {
    b.onclick = async () => {
      if (!(await confirmModal('删除这条备忘？'))) return;
      await api('/api/memos/' + b.dataset.memoId, { method: 'DELETE' }).catch(() => {});
      refreshP3Memos();
    };
  });
}

/** 首页 P3 卡片渲染入口 */
function renderP3(p3) {
  if (!p3) return;
  renderP3Memos(p3.memos || []);
  // 那年今天
  const otd = $('#p3OnThisDay');
  if (otd) {
    if (p3.onthisday) {
      otd.hidden = false;
      renderOnThisDay();
    } else otd.hidden = true;
  }
  // 今日服药（在药箱模块渲染详情，首页只列条目）
  const mc = $('#p3MedToday');
  if (mc) {
    const list = p3.medToday || [];
    mc.hidden = !list.length;
    if (list.length) {
      $('#medTodayList').innerHTML = list.map((p) => `
        <div class="medtoday-row"><b>${p.time}</b><span></span>
          <button class="btn sm" data-med-log="${p.id}" data-st="taken">已服</button>
          <button class="btn ghost sm" data-med-log="${p.id}" data-st="skipped">跳过</button>
        </div>`).join('');
      const spans = $('#medTodayList').querySelectorAll('span');
      list.forEach((p, i) => { spans[i].textContent = p.medicine + (p.time ? '' : ''); });
      $('#medTodayList').querySelectorAll('[data-med-log]').forEach((b) => {
        b.onclick = async () => {
          try {
            const res = await api('/api/med-plans/' + b.dataset.medLog + '/log', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: b.dataset.st }),
            });
            if (res.ok) { toast(b.dataset.st === 'taken' ? '已确认服药，库存 -1' : '已跳过'); markSynced(); loadHome(); }
          } catch (_) { /* 401 已处理 */ }
        };
      });
    }
  }
  // 本周回顾（异步拉取）
  renderP3Review();
}

/** 那年今天：进页拉全量，随机/轮换展示一条 */
let otdPool = [];
let otdIdx = 0;
async function renderOnThisDay() {
  try {
    if (!otdPool.length) {
      const res = await api('/api/onthisday');
      const d = await res.json();
      otdPool = [];
      (d.years || []).forEach((y) => {
        y.memos.forEach((x) => otdPool.push({ year: y.year, text: x.content, kind: '备忘' }));
        y.habits.forEach((x) => otdPool.push({ year: y.year, text: `${x.habit} 打卡 ${x.done} ${x.unit || '次'}`, kind: '打卡' }));
        y.todos.forEach((x) => otdPool.push({ year: y.year, text: '完成待办：' + x.title, kind: '待办' }));
        y.events.forEach((x) => otdPool.push({ year: y.year, text: x.title, kind: '日程' }));
        y.txnItems.slice(0, 3).forEach((x) => otdPool.push({
          year: y.year,
          text: `${x.flow === 'income' ? '收入' : '支出'} ¥${x.amount} · ${x.category}${x.note ? '（' + x.note + '）' : ''}`,
          kind: '账本',
        }));
      });
      otdPool.sort(() => Math.random() - 0.5);
    }
    const body = $('#otdBody');
    if (!body) return;
    if (!otdPool.length) { body.innerHTML = '<div class="empty-hint">数据积累中，明年的今天这里会有故事。</div>'; return; }
    otdIdx = (otdIdx + 1) % otdPool.length;
    const it = otdPool[otdIdx];
    body.innerHTML = `
      <div class="otd-item">
        <div class="otd-year">${it.year}</div>
        <div class="otd-text"></div>
        <div class="otd-kind">${it.kind}</div>
      </div>`;
    body.querySelector('.otd-text').textContent = it.text;
  } catch (_) { /* 忽略 */ }
}

/** 本周回顾卡片 */
async function renderP3Review() {
  const card = $('#p3Review');
  if (!card) return;
  try {
    const res = await api('/api/review');
    const d = await res.json();
    const items = [
      { icon: 'sprout', label: '打卡', val: `${d.habits.doneDays} 天` },
      { icon: 'bell', label: '完成待办', val: `${d.todos.done} 件` },
      { icon: 'wallet', label: '支出', val: money(d.ledger.expense) },
      { icon: 'book', label: '随手记', val: `${d.memos} 条` },
      { icon: 'calendar', label: '日程', val: `${d.events} 个` },
    ];
    $('#rvTitle').textContent = `这一周（${d.week.from.slice(5)} ~ ${d.week.to.slice(5)}）`;
    $('#rvGrid').innerHTML = items.map((x) => `
      <div class="rv-item"><svg><use href="#i-${x.icon}"/></svg><b>${escHtml(x.val)}</b><small>${x.label}</small></div>`).join('');
    const cats = (d.ledger.topCats || []).slice(0, 3);
    $('#rvCats').textContent = cats.length
      ? '花得最多的三样：' + cats.map((c) => `${c.name} ${money(c.value)}`).join(' · ')
      : '本周还没有支出记录。';
    card.hidden = false;
  } catch (_) { card.hidden = true; }
}

function summaryLine(s) {
  if (s.todos.overdue > 0) return `有 ${s.todos.overdue} 件待办已逾期，先处理一下吧。`;
  if (s.todos.today > 0) return `今天有 ${s.todos.today} 件待办，挑最要紧的先做完。`;
  if (s.habits.total > 0 && s.habits.done < s.habits.total) return '习惯还差一点点，顺手打个卡？';
  if (s.medicines.expiring > 0) return `药箱有 ${s.medicines.expiring} 件临期，留意一下。`;
  return '今天节奏不错，慢慢来，先把要处理的事看一眼。';
}

function renderTodayTasks(list) {
  const box = $('#todayTasks');
  box.innerHTML = '';
  if (!list.length) {
    box.innerHTML = '<div class="empty-hint">今天没有要处理的事，真好。</div>';
    return;
  }
  list.forEach((t) => {
    const row = document.createElement('div');
    row.className = 'todo-row' + (t.overdue ? ' overdue' : '');
    row.innerHTML = `
      <span class="dot"></span>
      <div class="main"><b></b><small></small></div>
      <span class="when"></span>`;
    row.querySelector('.main b').textContent = t.title;
    row.querySelector('.main small').textContent = [t.list, t.priority && t.priority.startsWith('P') ? t.priority : ''].filter(Boolean).join(' · ');
    row.querySelector('.when').textContent = t.when || '';
    if (t.actionable) {
      const btn = document.createElement('button');
      btn.className = 'done-btn';
      btn.title = '标记完成';
      btn.innerHTML = '<svg><use href="#i-check"/></svg>';
      btn.addEventListener('click', () => markDone(t.id, row));
      row.appendChild(btn);
    }
    box.appendChild(row);
  });
}

async function markDone(id, rowEl) {
  try {
    const res = await api(`/api/todos/${id}/done`, { method: 'POST' });
    if (res.ok) {
      rowEl.style.opacity = '.5';
      setTimeout(async () => {
        toast('已完成，干得漂亮');
        await loadHome();
      }, 200);
    }
  } catch {
    /* 401 已处理 */
  }
}

function renderPendingHabits(list) {
  const box = $('#pendingHabits');
  box.innerHTML = '';
  if (!list.length) {
    box.innerHTML = '<div class="empty-hint">今天的习惯都完成啦，继续保持。</div>';
    return;
  }
  list.forEach((h) => {
    const el = document.createElement('div');
    el.className = 'habit-pill';
    const cat = h.category ? `<small>${escHtml(h.category)}</small>` : '<small>待打卡</small>';
    el.innerHTML = `<svg><use href="#i-${h.icon || 'sprout'}"/></svg><b></b>${cat}`;
    el.querySelector('b').textContent = h.name;
    box.appendChild(el);
  });
}

function renderGlance(d) {
  const s = d.stats;
  const items = [
    { icon: 'sprout', name: '成长打卡', val: `${s.habits.done}/${s.habits.total} 完成` },
    { icon: 'bell', name: '待办提醒', val: `今日 ${s.todos.today} · 逾期 ${s.todos.overdue}` },
    { icon: 'wallet', name: '我的账本', val: `结余 ${money(s.ledger.balance)}` },
    { icon: 'pill', name: '家庭药箱', val: `共 ${s.medicines.total} · 临期 ${s.medicines.expiring}` },
    { icon: 'calendar', name: '日历中心', val: `今日 ${s.events.today} 件` },
    { icon: 'people', name: '人际关系', val: `近期生日 ${s.relations.upcoming}` },
  ];
  const box = $('#moduleGlance');
  box.innerHTML = '';
  items.forEach((it) => {
    const el = document.createElement('div');
    el.className = 'glance-item';
    el.innerHTML = `<svg><use href="#i-${it.icon}"/></svg><div><b></b><small></small></div>`;
    el.querySelector('b').textContent = it.name;
    el.querySelector('small').textContent = it.val;
    box.appendChild(el);
  });
}

// ===== 日历中心（周历 / 月历 / 农历） =====
const CAL_COLOR = { 工作: '#4d3045', 生活: '#627a67', 家庭: '#a57c45', 健康: '#b65f42' };
const calColorOf = (c) => CAL_COLOR[c] || '#746d63';
const WK = ['日', '一', '二', '三', '四', '五', '六'];

function ymd(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function todayStrLocal() { return ymd(new Date()); }

let calState = { view: 'week', anchor: new Date(), events: [], periods: [], prediction: null };

// 年月选择器：年份可手输/步进，月份下拉
function initCalPicker() {
  const ms = $('#calMonth');
  if (ms && !ms.dataset.filled) {
    ms.innerHTML = Array.from({ length: 12 }, (_, i) => `<option value="${i}">${i + 1}月</option>`).join('');
    ms.dataset.filled = '1';
  }
  syncCalPicker();
}
function syncCalPicker() {
  const y = $('#calYear');
  const ms = $('#calMonth');
  if (!y || !ms) return;
  const a = calState.anchor;
  y.value = a.getFullYear();
  ms.value = String(a.getMonth());
}
function applyCalPicker() {
  const y = $('#calYear');
  const ms = $('#calMonth');
  if (!y || !ms) return;
  const year = Math.min(2100, Math.max(1900, Number(y.value) || 2000));
  const month = Number(ms.value) || 0;
  calState.anchor = new Date(year, month, 1);
  syncCalPicker();
  loadCalEvents();
}

// 加载当前视图范围的事件
async function loadCalEvents() {
  initCalPicker();
  const a = calState.anchor;
  let from, to;
  if (calState.view === 'week') {
    const s = startOfWeek(a);
    from = ymd(s);
    to = ymd(addDays(s, 6));
  } else {
    const s = new Date(a.getFullYear(), a.getMonth(), 1);
    const e = new Date(a.getFullYear(), a.getMonth() + 1, 0);
    from = ymd(s);
    to = ymd(e);
  }
  try {
    const res = await api(`/api/events?from=${from}&to=${to}`);
    const data = await res.json();
    calState.events = data.events || [];
    calState.periods = data.periods || [];       // v0.5.10 经期叠加（隐私开关关闭时后端直接不给）
    calState.prediction = data.prediction || null;
    fillCalendarSel('#eventCalendarSel', data.calendars || Object.keys(CAL_COLOR));
    renderCalLegend(data.calendars || Object.keys(CAL_COLOR));
    // 合并勾选了「在日历中显示」的联系人生日
    await mergeBirthdays(from, to);
    renderCalView();
    markSynced();
  } catch (err) {
    if (!String(err.message).includes('unauthorized')) {
      $('#calViewBox').innerHTML = '<div class="empty-hint">加载日程失败</div>';
    }
  }
}

// 把勾选了日历显示的生日合并进事件列表（作为全天事件）
async function mergeBirthdays(from, to) {
  try {
    const res = await api('/api/contacts');
    const data = await res.json();
    (data.contacts || [])
      .filter((c) => c.birthdayRemind && c.nextBirthday)
      .forEach((c) => {
        if (c.nextBirthday < from || c.nextBirthday > to) return;
        calState.events.push({
          id: 'bday-' + c.id,
          title: `${c.name} 的生日`,
          start: `${c.nextBirthday} 00:00:00`,
          end: null,
          allDay: true,
          calendar: '家庭',
          color: null,
          location: '',
          note: c.age !== null && c.age !== undefined ? `满 ${c.age} 岁` : '',
          isBirthday: true,
        });
      });
  } catch { /* 未登录时忽略 */ }
}

function fillCalendarSel(sel, list) {
  const el = $(sel);
  if (!el || el.dataset.filled === list.join(',')) return;
  el.innerHTML = list.map((c) => `<option value="${c}">${c}</option>`).join('');
  el.dataset.filled = list.join(',');
}

function renderCalLegend(list) {
  const box = $('#calLegend');
  if (!box) return;
  box.innerHTML = list
    .map((c) => `<span class="lg"><i class="dot" style="background:${calColorOf(c)}"></i>${c}</span>`)
    .join('');
}

function startOfWeek(d) {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  s.setDate(s.getDate() - s.getDay());
  return s;
}
function addDays(d, n) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

// 周序：以「含 1 月 1 日的那一周（周日起）」为第 1 周，与日历显示的周日～周六区间保持一致
function weekOfYear(date) {
  const s = startOfWeek(date);
  const firstSunday = startOfWeek(new Date(s.getFullYear(), 0, 1));
  return Math.floor(Math.round((s - firstSunday) / 86400000) / 7) + 1;
}

function renderCalView() {
  const box = $('#calViewBox');
  const title = $('#calTitle');
  const eyebrow = $('#calEyebrow');
  if (!box) return;
  if (calState.view === 'period') {
    title.textContent = '经期记录';
    if (eyebrow) eyebrow.textContent = '日历中心 · 经期';
    box.innerHTML = '<div class="empty-hint">加载中…</div>';
    // fitCalView 给视图定过固定高（周/月历铺满一屏用）；经期页内容更高，
    // 不放开会溢出面板边框——恢复 auto，回到周/月历时 fitCalView 会重新设回。
    const sec = $('#view-calendar');
    if (sec) sec.style.height = 'auto';
    renderPeriodView();
    syncCalNavLabels();
    return;
  }
  if (calState.view === 'week') {
    const s = startOfWeek(calState.anchor);
    const e = addDays(s, 6);
    title.textContent = `当前为${s.getFullYear()}年第${weekOfYear(s)}周`;
    if (eyebrow) eyebrow.textContent = `日历中心 · ${s.getMonth() + 1}月${s.getDate()}日 - ${e.getMonth() + 1}月${e.getDate()}日`;
    box.innerHTML = '';
    box.appendChild(buildWeekView(s));
  } else {
    const a = calState.anchor;
    title.textContent = `${a.getFullYear()}年${a.getMonth() + 1}月`;
    if (eyebrow) eyebrow.textContent = '日历中心';
    box.innerHTML = '';
    box.appendChild(buildMonthView(a));
  }
  syncCalNavLabels();
  fitCalView();
}

// 上/下页按钮语义随视图切换：周历＝上一周/下一周，月历＝上一月/下一月
function syncCalNavLabels() {
  const wk = calState.view === 'week';
  [['#calPrev', wk ? '上一周' : '上一月'], ['#calNext', wk ? '下一周' : '下一月']].forEach(([sel, label]) => {
    const el = $(sel);
    if (!el) return;
    el.title = label;
    el.setAttribute('aria-label', label);
  });
}

// 让日历视图正好铺满一屏：视图高 = 视口高 − 视图距顶距离 − 主内容下内边距，
// 于是页面总高恰好等于视口高，月历方格把剩余空间平均分完且刚好不出现滚动条。
// 用实测值而不是写死 100vh-N：浏览器标题栏/地址栏/收藏栏、手机动态地址栏都能自适应。
function fitCalView() {
  const v = $('#view-calendar');
  if (!v || !v.classList.contains('active')) return;
  const main = v.parentElement;
  const bottom = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0;
  const top = window.scrollY + v.getBoundingClientRect().top;
  v.style.height = Math.round(Math.max(window.innerHeight - top - bottom, 440)) + 'px';
}
let __calFitTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(__calFitTimer);
  __calFitTimer = setTimeout(fitCalView, 120);
});

// 月历：整月 7 列网格，每格带农历与事件
function buildMonthView(anchor) {
  const wrap = document.createElement('div');
  wrap.className = 'cal-month-wrap';
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  const first = new Date(y, m, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const prevDays = new Date(y, m, 0).getDate();
  const today = todayStrLocal();

  const head = document.createElement('div');
  head.className = 'cal-month-head';
  WK.forEach((w, i) => {
    const s = document.createElement('span');
    s.textContent = w;
    if (i === 0 || i === 6) s.className = 'we';
    head.appendChild(s);
  });
  wrap.appendChild(head);

  const grid = document.createElement('div');
  grid.className = 'cal-month-grid';

  // 前置补白（上月）
  for (let i = startPad - 1; i >= 0; i--) {
    grid.appendChild(makeCell(new Date(y, m - 1, prevDays - i), true, today));
  }
  // 本月
  for (let d = 1; d <= daysInMonth; d++) {
    grid.appendChild(makeCell(new Date(y, m, d), false, today));
  }
  // 后置补白（补满整行）
  const rest = (7 - (grid.children.length % 7)) % 7;
  for (let d = 1; d <= rest; d++) {
    grid.appendChild(makeCell(new Date(y, m + 1, d), true, today));
  }
  wrap.appendChild(grid);
  return wrap;
}

function makeCell(date, out, today) {
  const ds = ymd(date);
  const isPeriod = periodOn(ds);
  const isPred = calState.prediction === ds;
  const cell = document.createElement('div');
  cell.className = 'mcell' + (out ? ' out' : '') + (ds === today ? ' today' : '') + (isPeriod ? ' pday' : '') + (isPred ? ' pday-pred' : '');
  const lun = lunarLabel(date);
  const evs = eventsOn(ds);

  const top = document.createElement('div');
  top.className = 'mcell-top';
  top.innerHTML = `<span class="mcell-day">${date.getDate()}</span><span class="mcell-lunar${lun.isFestival ? ' fest' : ''}"></span>`;
  top.querySelector('.mcell-lunar').textContent = lun.text;
  cell.appendChild(top);

  const box = document.createElement('div');
  box.className = 'mcell-evs';
  evs.slice(0, 3).forEach((ev) => {
    const b = document.createElement('div');
    b.className = 'mev';
    b.dataset.evid = ev.id;
    b.style.background = ev.color || calColorOf(ev.calendar);
    b.textContent = (ev.allDay ? '' : ev.start.slice(11, 16) + ' ') + ev.title;
    b.title = ev.title;
    b.addEventListener('click', (e) => { e.stopPropagation(); openEventModal(ev); });
    box.appendChild(b);
  });
  if (evs.length > 3) {
    const more = document.createElement('div');
    more.className = 'mev-more';
    more.textContent = `+${evs.length - 3} 更多`;
    box.appendChild(more);
  }
  cell.appendChild(box);
  // 经期日点击直达经期页（其余日期照常新增日程）
  cell.addEventListener('click', () => {
    if (isPeriod || isPred) switchCalView('period');
    else openEventModal(null, ds);
  });
  return cell;
}

function eventsOn(dateStr) {
  // 按区间匹配：跨天日程出现在 start..end 的每一天（无 end 即当天）
  return calState.events.filter((ev) => {
    const s = String(ev.start || '').slice(0, 10);
    const e = ev.end ? String(ev.end).slice(0, 10) : s;
    return s <= dateStr && dateStr <= e;
  });
}

// ===== v0.5.10 经期叠加：该日是否在经期区间内 / 是否为下次预估日 =====
function periodOn(dateStr) {
  return calState.periods.some((p) => p.start <= dateStr && dateStr <= p.end);
}

// ===== v0.5.10 经期记录页 =====
const PD_FLOWS = ['', '极少', '偏少', '正常', '偏多', '极多'];
const PD_COLORS = ['', '血色浅淡', '血色正常', '血色深红', '血色深黑'];
const PD_TEXTURES = ['', '质地稀薄', '正常血样', '质地粘稠'];
const PD_PAINS = ['胀痛', '刺痛', '冷痛', '绞痛', '坠痛', '不知道啥痛就是痛'];
const PD_SYMPTOMS = ['乳房胀痛', '头痛', '身痛', '失眠', '情绪异常', '泄泻', '浮肿', '口腔溃疡', '吐血/流鼻血', '发热', '起疹子'];
let periodFlow = 3;        // 经量 1-5（默认正常）
let periodColor = 2;       // 血色 1-4（默认血色正常）
let periodTexture = 2;     // 血质 1-3（默认正常血样）
let periodPains = new Set();
let periodSymptoms = new Set();
let periodEditing = null;  // 编辑中的记录 id

function pdFmt(ds) {
  if (!ds) return '—';
  const [, m, d] = ds.split('-');
  return `${Number(m)}月${Number(d)}日`;
}
/** 历史行的详情摘要：血色/血质/痛经分型/症状/其他 */
function pdDetail(l) {
  const bits = [];
  if (l.bloodColor) bits.push(PD_COLORS[l.bloodColor]);
  if (l.bloodTexture) bits.push(PD_TEXTURES[l.bloodTexture]);
  if (l.dysmenorrhea) bits.push('痛经' + (l.painTypes ? '：' + l.painTypes.split(',').join('、') : ''));
  if (l.symptoms) bits.push(l.symptoms.split(',').join('、'));
  if (l.symptomOther) bits.push('其他：' + l.symptomOther);
  return bits.join(' · ');
}
/** 重置表单为默认值（新增态） */
function pdResetForm(box) {
  periodFlow = 3; periodColor = 2; periodTexture = 2;
  periodPains = new Set(); periodSymptoms = new Set();
  $('#pdStartInput').value = ''; $('#pdEndInput').value = '';
  $('#pdNote').value = ''; $('#pdOtherInput').value = '';
  $('#pdDys').checked = false;
  $('#pdPainBox').hidden = true;
  $('#pdOtherInput').hidden = true;
  $('#pdFormTitle').textContent = '补录一次经期';
  $('#pdCancelEdit').hidden = true;
  window.syncDtBtns(box);
  pdSyncChips(box);
}
function pdSyncChips(box) {
  box.querySelectorAll('.pd-chip[data-kind]').forEach((chip) => {
    const k = chip.dataset.kind, v = chip.dataset.val;
    const on = k === 'flow' ? Number(v) === periodFlow
      : k === 'color' ? Number(v) === periodColor
      : k === 'texture' ? Number(v) === periodTexture
      : k === 'pain' ? periodPains.has(v)
      : periodSymptoms.has(v);
    chip.classList.toggle('on', on);
  });
}

async function renderPeriodView() {
  const box = $('#calViewBox');
  if (!box) return;
  let data = { logs: [], stats: {}, visible: true };
  try {
    const res = await api('/api/period');
    data = await res.json();
  } catch (err) {
    if (!String(err.message).includes('unauthorized')) box.innerHTML = '<div class="empty-hint">加载经期数据失败</div>';
    return;
  }
  const st = data.stats || {};
  const logs = data.logs || [];
  const ongoing = logs.find((l) => l.id === st.ongoingId) || null;

  const statsHtml = `
    <div class="pd-stats">
      <div class="pd-stat"><span>当前周期</span><strong>${st.cycleDay ? '第 ' + st.cycleDay + ' 天' : '未在经期'}</strong>
        <small>${ongoing ? pdFmt(ongoing.startDate) + ' 开始' : '点「今天来了」开始记录'}</small></div>
      <div class="pd-stat"><span>平均周期</span><strong>${st.cycleAvg ? st.cycleAvg + ' 天' : '—'}</strong>
        <small>${st.samples ? '近 ' + st.samples + ' 次推算' : '有两次记录后自动算'}</small></div>
      <div class="pd-stat"><span>下次预计</span><strong>${st.nextPredicted ? pdFmt(st.nextPredicted) : '—'}</strong>
        <small>${st.nextPredicted ? '预估，仅供参考' : '记录后自动推算'}</small></div>
    </div>`;

  const historyHtml = logs.length ? logs.map((l) => {
    const detail = pdDetail(l);
    return `
    <div class="pd-row" data-id="${l.id}">
      <div class="pd-row-main">
        <b>${pdFmt(l.startDate)}${l.endDate ? ' ~ ' + pdFmt(l.endDate) + ' · ' + l.days + ' 天' : ' 开始 · 进行中'}</b>
        <span class="pd-flow-badge f${l.flow}">${PD_FLOWS[l.flow] || ''}</span>
        ${detail ? `<small>${escHtml(detail)}</small>` : ''}
        ${l.note ? `<small>${escHtml(l.note)}</small>` : ''}
      </div>
      <div class="pd-ops">
        <button class="icon-btn" data-pd="edit" data-id="${l.id}" title="编辑"><svg><use href="#i-edit"/></svg></button>
        <button class="icon-btn" data-pd="del" data-id="${l.id}" title="删除"><svg><use href="#i-x"/></svg></button>
      </div>
    </div>`;
  }).join('') : '<div class="empty-hint">还没有记录。点上面的「今天来了」，或用下方表单补录过去的经期。</div>';

  const chipRow = (label, kind, values, names) => `
    <div class="field"><span>${label}</span>
      <div class="pd-chip-row">${values.map((v) => `<button type="button" class="pd-chip" data-kind="${kind}" data-val="${v}">${names[v]}</button>`).join('')}</div>
    </div>`;

  box.innerHTML = `
    <div class="pd-wrap">
      ${statsHtml}
      <div class="pd-quick">
        <button class="btn primary" data-pd="start" type="button"${ongoing ? ' disabled title="已有进行中的经期"' : ''}>今天来了</button>
        <button class="btn ghost" data-pd="end" type="button"${ongoing ? '' : ' disabled title="没有进行中的经期"'}>今天结束</button>
        <label class="pd-priv"><input type="checkbox" id="pdVisible"${data.visible ? ' checked' : ''}><span>在周历/月历中显示</span></label>
      </div>
      <p class="ts-hint">隐私开关只控制日历上的显示；关闭后周历/月历完全不留痕迹，这里仍可查看和记录。</p>
      <div class="pd-list-head"><b>历史记录</b><span class="muted">${logs.length} 次</span></div>
      <div class="pd-list">${historyHtml}</div>
      <form class="pd-form" id="pdForm">
        <b class="pd-form-title" id="pdFormTitle">补录一次经期</b>
        <div class="field-row">
          <label class="field"><span>开始日期</span>
            <input type="hidden" id="pdStartInput">
            <button type="button" class="dt-btn" data-dt="pdStart" data-ph="选择开始日期"><svg><use href="#i-calendar"/></svg><span>—</span></button>
          </label>
          <label class="field"><span>结束日期（留空＝进行中）</span>
            <input type="hidden" id="pdEndInput">
            <button type="button" class="dt-btn" data-dt="pdEnd" data-ph="选择结束日期"><svg><use href="#i-calendar"/></svg><span>—</span></button>
          </label>
        </div>
        ${chipRow('经量', 'flow', [1, 2, 3, 4, 5], PD_FLOWS)}
        ${chipRow('血色', 'color', [1, 2, 3, 4], PD_COLORS)}
        ${chipRow('血质', 'texture', [1, 2, 3], PD_TEXTURES)}
        <label class="pd-check-line"><input type="checkbox" id="pdDys"><span>痛经</span></label>
        <div class="field" id="pdPainBox" hidden><span>痛感类型（可多选）</span>
          <div class="pd-chip-row">${PD_PAINS.map((p) => `<button type="button" class="pd-chip" data-kind="pain" data-val="${p}">${p}</button>`).join('')}</div>
        </div>
        <div class="field"><span>其他症状（可多选）</span>
          <div class="pd-chip-row">${PD_SYMPTOMS.map((s) => `<button type="button" class="pd-chip" data-kind="sym" data-val="${s}">${s}</button>`).join('')}<button type="button" class="pd-chip" data-kind="sym" data-val="其他">其他</button></div>
          <input class="inp" id="pdOtherInput" placeholder="请描述其他症状" maxlength="30" style="margin-top:8px" hidden>
        </div>
        <label class="field"><span>备注（选填）</span><input id="pdNote" maxlength="60" placeholder="如：出差、熬夜"></label>
        <div class="settings-actions" style="gap:10px">
          <button class="btn ghost" type="button" id="pdCancelEdit" hidden>取消编辑</button>
          <button class="btn primary" type="submit">保存记录</button>
        </div>
      </form>
    </div>`;

  // 日期按钮接全站统一选择器（动态元素，直接挂 openSitePicker）
  box.querySelectorAll('.dt-btn[data-dt]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const inp = document.getElementById(btn.dataset.dt + 'Input');
      if (!inp) return;
      openSitePicker({
        mode: 'date', date: inp.value || '', title: btn.dataset.dt === 'pdStart' ? '开始日期' : '结束日期',
        allowClear: btn.dataset.dt === 'pdEnd',
        onDone: ({ date }) => { inp.value = date || ''; window.syncDtBtns(box); },
      });
    });
  });
  // 芯片：flow/color/texture 单选；pain/sym 多选；"其他"带出填空
  box.querySelectorAll('.pd-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const kind = chip.dataset.kind, val = chip.dataset.val;
      if (kind === 'flow') periodFlow = Number(val);
      else if (kind === 'color') periodColor = Number(val);
      else if (kind === 'texture') periodTexture = Number(val);
      else if (kind === 'pain') { periodPains.has(val) ? periodPains.delete(val) : periodPains.add(val); }
      else if (kind === 'sym') {
        periodSymptoms.has(val) ? periodSymptoms.delete(val) : periodSymptoms.add(val);
        $('#pdOtherInput').hidden = !periodSymptoms.has('其他');
      }
      pdSyncChips(box);
    });
  });
  // 痛经勾选 → 分型展开
  box.querySelector('#pdDys').addEventListener('change', (e) => {
    $('#pdPainBox').hidden = !e.target.checked;
    if (!e.target.checked) { periodPains = new Set(); pdSyncChips(box); }
  });
  // 快捷 + 隐私开关
  box.querySelector('[data-pd=start]').addEventListener('click', async () => {
    const res = await api('/api/period', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ start_date: todayStrLocal(), flow: periodFlow }) });
    const d = await res.json().catch(() => ({}));
    if (res.ok) { toast('已记录：本次经期开始'); renderPeriodView(); }
    else toast(d.error || '记录失败');
  });
  box.querySelector('[data-pd=end]').addEventListener('click', async () => {
    if (!st.ongoingId) { toast('当前没有进行中的经期'); return; }
    const res = await api('/api/period', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: st.ongoingId, end_date: todayStrLocal() }) });
    const d = await res.json().catch(() => ({}));
    if (res.ok) { toast('已记录：本次经期结束'); renderPeriodView(); }
    else toast(d.error || '记录失败');
  });
  box.querySelector('#pdVisible').addEventListener('change', async (e) => {
    const res = await api('/api/period', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visible: e.target.checked }) });
    if (res.ok) toast(e.target.checked ? '已开启：周历/月历会显示经期' : '已关闭：日历上不留任何痕迹');
    else { e.target.checked = !e.target.checked; toast('设置失败'); }
  });
  // 历史：编辑 / 删除
  box.querySelector('.pd-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-pd]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const log = logs.find((l) => l.id === id);
    if (!log) return;
    if (btn.dataset.pd === 'edit') {
      periodEditing = id;
      $('#pdStartInput').value = log.startDate;
      $('#pdEndInput').value = log.endDate || '';
      periodFlow = log.flow || 3;
      periodColor = log.bloodColor || 2;
      periodTexture = log.bloodTexture || 2;
      periodPains = new Set(log.painTypes ? log.painTypes.split(',') : []);
      periodSymptoms = new Set(log.symptoms ? log.symptoms.split(',') : []);
      $('#pdNote').value = log.note || '';
      $('#pdOtherInput').value = log.symptomOther || '';
      $('#pdDys').checked = !!log.dysmenorrhea;
      $('#pdPainBox').hidden = !log.dysmenorrhea;
      $('#pdOtherInput').hidden = !periodSymptoms.has('其他');
      $('#pdFormTitle').textContent = '编辑这次经期（' + pdFmt(log.startDate) + '）';
      $('#pdCancelEdit').hidden = false;
      window.syncDtBtns(box);
      pdSyncChips(box);
      box.querySelector('.pd-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (btn.dataset.pd === 'del') {
      if (!(await confirmModal(`删除 ${pdFmt(log.startDate)} 开始的这次经期记录？`))) return;
      const res = await api('/api/period?id=' + id, { method: 'DELETE' });
      if (res.ok) { toast('已删除'); renderPeriodView(); }
    }
  });
  // 取消编辑
  $('#pdCancelEdit').addEventListener('click', () => { periodEditing = null; pdResetForm(box); });
  // 提交（新增 / 编辑共用）
  $('#pdForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const start = $('#pdStartInput').value;
    if (!start) { toast('请选择开始日期'); return; }
    const payload = {
      start_date: start,
      end_date: $('#pdEndInput').value || null,
      flow: periodFlow, blood_color: periodColor, blood_texture: periodTexture,
      dysmenorrhea: $('#pdDys').checked ? 1 : 0,
      pain_types: [...periodPains],
      symptoms: [...periodSymptoms],
      symptom_other: $('#pdOtherInput').value.trim(),
      note: $('#pdNote').value.trim(),
    };
    const res = periodEditing
      ? await api('/api/period', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: periodEditing, ...payload }) })
      : await api('/api/period', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      toast(periodEditing ? '已保存修改' : '已记录');
      periodEditing = null;
      renderPeriodView();
    } else toast(d.error || '保存失败');
  });
}

// 周历：7 天 × 全天 0:00-23:00 竖向时间轴；点某个小时格子即在该日该点新增日程
// 结构：.cal-week > .cal-week-scroll > [.cal-allday? , .cal-week-head , .cal-week-grid]
// 注意：.cal-week-grid 必须是「纵向堆叠」的容器，每一行 .cal-hour 才是 8 列网格。
//       早期把 .cal-hour 直接塞进 8 列 grid，导致 15 个整行被当成 15 个格子在
//       外层 8 列里横排换行（时间轴变成横向乱排），这里一并修掉。
const WEEK_H0 = 0;
const WEEK_H1 = 23;

function buildWeekView(start) {
  const wrap = document.createElement('div');
  wrap.className = 'cal-week';
  const today = todayStrLocal();
  const nowHour = new Date().getHours();

  const scroll = document.createElement('div');
  scroll.className = 'cal-week-scroll';

  // —— 全天行（生日 / 全天日程）——
  const allDay = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    eventsOn(ymd(d)).forEach((ev) => { if (ev.allDay) allDay.push({ ev, d }); });
  }
  if (allDay.length) {
    const bar = document.createElement('div');
    bar.className = 'cal-allday';
    const lab = document.createElement('div');
    lab.className = 'hh ad-lab';
    lab.textContent = '全天';
    bar.appendChild(lab);
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      const cell = document.createElement('div');
      cell.className = 'cal-cell ad-cell';
      allDay.forEach((item) => {
        if (item.d.getTime() !== d.getTime()) return;
        const ev = item.ev;
        const b = document.createElement('div');
        b.className = 'wev';
        b.dataset.evid = ev.id;
        b.style.background = ev.color || calColorOf(ev.calendar);
        b.textContent = ev.title;
        b.title = ev.title;
        b.addEventListener('click', (e) => { e.stopPropagation(); openEventModal(ev); });
        cell.appendChild(b);
      });
      cell.addEventListener('click', () => openEventModal(null, ymd(d)));
      bar.appendChild(cell);
    }
    scroll.appendChild(bar);
  }

  // —— 星期表头（滚动时吸附在顶部）——
  const head = document.createElement('div');
  head.className = 'cal-week-head';
  const corner = document.createElement('div');
  corner.className = 'wh-corner';
  head.appendChild(corner);
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    const ds = ymd(d);
    const lun = lunarLabel(d);
    const pDay = periodOn(ds);
    const pPred = calState.prediction === ds;
    const h = document.createElement('div');
    h.className = 'wh' + (ds === today ? ' today' : '') + (pDay ? ' pday' : '') + (pPred ? ' pday-pred' : '');
    h.innerHTML = `<b>周${WK[d.getDay()]}</b><small></small>`;
    h.querySelector('small').textContent = `${d.getMonth() + 1}/${d.getDate()} ${lun.text}`;
    h.addEventListener('click', () => openEventModal(null, ds));
    head.appendChild(h);
  }
  scroll.appendChild(head);

  // —— 0:00 - 23:00 时间轴 ——
  const grid = document.createElement('div');
  grid.className = 'cal-week-grid';
  for (let hh = WEEK_H0; hh <= WEEK_H1; hh++) {
    const row = document.createElement('div');
    row.className = 'cal-hour';
    const lab = document.createElement('div');
    lab.className = 'hh';
    lab.textContent = String(hh).padStart(2, '0') + ':00';
    row.appendChild(lab);
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      const isToday = ymd(d) === today;
      const cell = document.createElement('div');
      cell.className = 'cal-cell' + (isToday ? ' today' : '') + (isToday && hh === nowHour ? ' now' : '');
      // 该小时内的事件
      evsInHour(d, hh).forEach((ev) => {
        const b = document.createElement('div');
        b.className = 'wev';
        b.dataset.evid = ev.id;
        b.style.background = ev.color || calColorOf(ev.calendar);
        b.textContent = ev.title;
        b.title = `${ev.title}${ev.location ? ' @ ' + ev.location : ''}`;
        b.addEventListener('click', (e) => { e.stopPropagation(); openEventModal(ev); });
        cell.appendChild(b);
      });
      cell.title = `${d.getMonth() + 1}月${d.getDate()}日 ${String(hh).padStart(2, '0')}:00 - ${String(hh).padStart(2, '0')}:59`;
      cell.addEventListener('click', () => openEventModal(null, ymd(d), hh));
      row.appendChild(cell);
    }
    grid.appendChild(row);
  }
  scroll.appendChild(grid);

  wrap.appendChild(scroll);
  return wrap;
}

function evsInHour(date, hour) {
  // 区间匹配：14:00-17:00 的日程出现在 14/15/16 点的格子里（无 end 按开始所在小时）
  const ds = ymd(date);
  const cellStart = new Date(ds + 'T' + String(hour).padStart(2, '0') + ':00');
  const cellEnd = new Date(cellStart.getTime() + 3600000);
  return calState.events.filter((ev) => {
    if (ev.allDay) return false;
    const s = new Date(String(ev.start).replace(' ', 'T'));
    let e = ev.end ? new Date(String(ev.end).replace(' ', 'T')) : new Date(s.getTime() + 3600000);
    if (e <= s) e = new Date(s.getTime() + 3600000); // end 早于 start 的脏数据按 1 小时兜底
    return s < cellEnd && e > cellStart;
  });
}

async function switchCalView(v) {
  calState.view = v;
  $$('.cal-view').forEach((b) => b.classList.toggle('active', b.dataset.calview === v));
  // 经期页没有「上/下页 / 今天 / 新增日程」，头部只留标签
  const sec = $('#view-calendar');
  if (sec) sec.classList.toggle('cal-period-mode', v === 'period');
  if (v === 'period') { renderCalView(); return; }  // 经期页不依赖 events
  await loadCalEvents();
}
function calShift(dir) {
  if (calState.view === 'period') return; // 经期页没有上/下页
  const a = calState.anchor;
  if (calState.view === 'week') calState.anchor = addDays(a, dir * 7);
  else calState.anchor = new Date(a.getFullYear(), a.getMonth() + dir, 1);
  syncCalPicker();
  loadCalEvents();
}

// ===== 日程弹窗 =====
let editingEventId = null;
function openEventModal(ev, presetDate, presetHour) {
  // 生日为虚拟事件，不可编辑
  if (ev && ev.isBirthday) {
    toast('生日由联系人资料生成，请在「人际关系」中修改');
    return;
  }
  editingEventId = ev ? ev.id : null;
  const f = $('#eventForm');
  f.reset();
  evClearQuick();   // 清掉上一次的快捷时长高亮
  $('#eventModalTitle').textContent = ev ? '编辑日程' : '新增日程';
  $('#eventFormError').hidden = true;
  $('#eventDeleteBtn').hidden = !ev;

  if (ev) {
    f.title.value = ev.title;
    // 统一存储格式 "YYYY-MM-DD HH:MM"（hidden input），按钮文字由 syncDtBtns 刷新
    f.start.value = (ev.start || '').slice(0, 16);
    f.end.value = (ev.end || '').slice(0, 16);
    f.calendar.value = ev.calendar || '生活';
    f.location.value = ev.location || '';
    f.note.value = ev.note || '';
    f.allDay.checked = !!ev.allDay;
  } else {
    const d = presetDate ? new Date(presetDate + 'T00:00:00') : new Date();
    const h = presetHour === undefined ? new Date().getHours() + 1 : presetHour;
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.min(Math.max(h, 0), 23), 0, 0);
    f.start.value = toLocalInput(start).replace('T', ' ');
    f.end.value = toLocalInput(new Date(start.getTime() + 3600000)).replace('T', ' ');
    f.calendar.value = '生活';
  }
  syncEventDtBtns();
  $('#eventModal').hidden = false;
}
/** 日程开始/结束按钮：全天勾选时只显示日期、弹纯月历 */
function syncEventDtBtns() {
  const ad = $('#eventForm').allDay.checked;
  $('[data-dt=evStart]').dataset.hideTime = ad ? '1' : '';
  $('[data-dt=evEnd]').dataset.hideTime = ad ? '1' : '';
  window.syncDtBtns($('#eventForm'));
}
function toLocalInput(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function closeEventModal() { $('#eventModal').hidden = true; }

// ===== 待办提醒（今日 + P0-P3 优先级筛选） =====
let todoLists = ['生活'];
const PRIO_DESC = { P0: '重要且紧急', P1: '重要不紧急', P2: '紧急不重要', P3: '不重要不紧急' };
let todoFilter = { priority: [], list: '' };

async function renderTodos() {
  const box = $('#todoList');
  if (!box) return;
  box.innerHTML = '<div class="empty-hint">加载中…</div>';
  const qs = new URLSearchParams();
  qs.set('scope', 'today');
  if (todoFilter.priority.length) qs.set('priority', todoFilter.priority.join(','));
  if (todoFilter.list) qs.set('list', todoFilter.list);
  try {
    const res = await api('/api/todos?' + qs.toString());
    const data = await res.json();
    todoLists = data.lists || todoLists;
    fillCalendarSel('#todoListSel', todoLists);
    renderTodoFilters(data.counts || {});
    const list = data.todos || [];
    $('#todoCount').textContent = list.length ? `共 ${list.length} 项` : '';
    box.innerHTML = '';
    if (!list.length) {
      box.innerHTML = '<div class="empty-hint">' +
        (todoFilter.priority.length || todoFilter.list ? '当前筛选条件下没有待办' : '今天没有待办，轻松一天 ☕') +
        '</div>';
      return;
    }
    list.forEach((t) => {
      const row = document.createElement('div');
      row.className = 'todo-row' + (t.overdue ? ' overdue' : '');
      row.innerHTML = `
        <button class="todo-check" title="标记完成"><svg><use href="#i-check"/></svg></button>
        <div class="todo-main"><b></b><div class="todo-meta"></div></div>
        <button class="icon-btn del" title="删除"><svg><use href="#i-x"/></svg></button>`;
      row.querySelector('b').textContent = t.title;
      const meta = row.querySelector('.todo-meta');
      meta.innerHTML =
        `<span class="prio-pill ${t.priority}">${t.priority} ${PRIO_DESC[t.priority] || ''}</span>` +
        `<span class="todo-pill">${escHtml(t.list)}</span>` +
        (t.overdue ? `<span class="todo-pill high">逾期 ${escHtml(t.date)}</span>` : '') +
        (t.note ? `<span>${escHtml(t.note)}</span>` : '');
      if (t.time) {
        const tm = document.createElement('span');
        tm.className = 'todo-time';
        tm.textContent = t.time;
        row.querySelector('.todo-main').appendChild(tm);
      }
      row.querySelector('.todo-check').addEventListener('click', () => finishTodo(t.id));
      row.querySelector('.del').addEventListener('click', () => removeTodo(t.id, t.title));
      if (t.time) {
        const al = document.createElement('button');
        al.className = 'icon-btn alarm';
        al.title = '设为系统闹钟';
        al.innerHTML = '<svg><use href="#i-clock"/></svg>';
        al.addEventListener('click', () => setSystemAlarm(t));
        row.querySelector('.del').before(al);
      }
      box.appendChild(row);
    });
    markSynced();
  } catch (err) {
    if (!String(err.message).includes('unauthorized')) box.innerHTML = '<div class="empty-hint">加载待办失败</div>';
  }
}

// 筛选栏：优先级多选 + 类别单选
function renderTodoFilters(counts) {
  const pBox = $('#tfPriority');
  const lBox = $('#tfList');
  if (!pBox || !lBox) return;
  // 优先级
  pBox.innerHTML = ['P0', 'P1', 'P2', 'P3'].map((p) =>
    `<button class="tf-chip${todoFilter.priority.includes(p) ? ' on' : ''}" data-p="${p}">${p} ${PRIO_DESC[p]}<span class="n">${counts[p] || 0}</span></button>`
  ).join('');
  pBox.querySelectorAll('.tf-chip').forEach((b) =>
    b.addEventListener('click', () => {
      const p = b.dataset.p;
      const i = todoFilter.priority.indexOf(p);
      if (i >= 0) todoFilter.priority.splice(i, 1);
      else todoFilter.priority.push(p);
      renderTodos();
    })
  );
  // 类别
  lBox.innerHTML =
    `<button class="tf-chip${todoFilter.list === '' ? ' on' : ''}" data-l="">全部</button>` +
    todoLists.map((l) =>
      `<button class="tf-chip${todoFilter.list === l ? ' on' : ''}" data-l="${l}">${l}</button>`
    ).join('');
  lBox.querySelectorAll('.tf-chip').forEach((b) =>
    b.addEventListener('click', () => {
      todoFilter.list = b.dataset.l;
      renderTodos();
    })
  );
}

async function finishTodo(id) {
  try {
    const res = await api(`/api/todos/${id}/done`, { method: 'POST' });
    if (res.ok) { toast('已完成，干得漂亮'); markSynced(); await renderTodos(); }
  } catch { /* 401 已处理 */ }
}
async function removeTodo(id, title) {
  if (!(await confirmModal(`确定删除待办「${title}」？`))) return;
  try {
    const res = await api(`/api/todos/${id}/delete`, { method: 'DELETE' });
    if (res.ok) { toast('已删除'); markSynced(); await renderTodos(); }
  } catch { /* 401 已处理 */ }
}

// ===== 待办清单（v0.5.29：自定义清单 + 物品/事项勾选；未备齐的排前面） =====
let ckData = [];
let ckExpanded = new Set();   // 展开的清单 id；默认全部收缩，点清单名展开/收起
async function renderChecklists() {
  const box = $('#ckListBox');
  if (!box) return;
  try {
    const res = await api('/api/checklists');
    ckData = (await res.json()).groups || [];
  } catch (err) {
    if (String(err.message).includes('unauthorized')) return;
    box.innerHTML = '<div class="empty-hint">加载清单失败</div>';
    return;
  }
  const cnt = $('#ckCount');
  const pending = ckData.reduce((s, g) => s + g.items.filter((i) => !i.done).length, 0);
  if (cnt) cnt.textContent = ckData.length ? `${ckData.length} 份清单 · 待备齐 ${pending} 项` : '';
  if (!ckData.length) {
    box.innerHTML = '<div class="empty-hint">还没有清单，点右上角「新建清单」开始（如：徒步出行装备清单）。</div>';
    return;
  }
  box.innerHTML = ckData.map((g) => {
    const doneN = g.items.filter((i) => i.done).length;
    const folded = !ckExpanded.has(g.id);
    return `
    <div class="ck-card${folded ? ' folded' : ''}" data-gid="${g.id}">
      <div class="ck-head">
        <span class="ck-caret">${folded ? '▸' : '▾'}</span>
        <b class="ck-name" title="点击展开 / 收起">${escHtml(g.name)}</b>
        <span class="muted">${doneN}/${g.items.length}</span>
        <span class="ck-ops">
          <button class="icon-btn" data-ck-grename="${g.id}" title="重命名 / 重置" aria-label="重命名清单"><svg><use href="#i-edit"/></svg></button>
          <button class="icon-btn del" data-ck-gdel="${g.id}" title="删除清单" aria-label="删除清单"><svg><use href="#i-x"/></svg></button>
        </span>
      </div>
      <div class="ck-body">
        <div class="ck-items">
        ${g.items.map((i) => `
        <div class="ck-item${i.done ? ' done' : ''}">
          <button class="ck-check" data-ck-toggle="${i.id}" data-done="${i.done ? 1 : 0}" title="${i.done ? '取消勾选' : '标记备齐'}" aria-label="${i.done ? '取消勾选' : '标记备齐'}"><svg><use href="#i-check"/></svg></button>
          <span class="ck-text">${escHtml(i.content)}</span>
          <button class="icon-btn del" data-ck-idel="${i.id}" title="删除" aria-label="删除"><svg><use href="#i-x"/></svg></button>
        </div>`).join('') || '<div class="empty-hint">还没有条目，在下面添加。</div>'}
        </div>
        <div class="ck-add">
          <input class="inp" maxlength="60" placeholder="添加物品或事项，回车确认">
          <button class="btn ghost" data-ck-iadd="${g.id}" type="button">添加</button>
        </div>
      </div>
    </div>`;
  }).join('');
  markSynced();
}

async function ckCall(path, opts) {
  const res = await api(path, opts).catch(() => null);
  if (!res || !res.ok) { toast('操作失败，请重试'); return false; }
  markSynced();
  return true;
}

function bindChecklists() {
  const box = $('#ckListBox');
  if (!box || box.dataset.ckBound) return;
  box.dataset.ckBound = '1';
  box.addEventListener('click', async (e) => {
    // 点清单名（非右侧操作钮）展开 / 收起该清单
    const head = e.target.closest('.ck-head');
    if (head && !e.target.closest('.ck-ops')) {
      const card = head.closest('.ck-card');
      const gid = Number(card.dataset.gid);
      if (ckExpanded.has(gid)) ckExpanded.delete(gid); else ckExpanded.add(gid);
      card.classList.toggle('folded');
      const caret = card.querySelector('.ck-caret');
      if (caret) caret.textContent = card.classList.contains('folded') ? '▸' : '▾';
      return;
    }
    const toggle = e.target.closest('[data-ck-toggle]');
    if (toggle) {
      const done = toggle.dataset.done === '1';
      if (await ckCall('/api/checklists/items', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: Number(toggle.dataset.ckToggle), done: !done }) })) await renderChecklists();
      return;
    }
    const idel = e.target.closest('[data-ck-idel]');
    if (idel) {
      const card = idel.closest('.ck-card');
      const item = ckData.find((g) => String(g.id) === card.dataset.gid)?.items.find((i) => String(i.id) === idel.dataset.ckIdel);
      if (!(await confirmModal(`删除「${item ? item.content : '这条'}」？`))) return;
      if (await ckCall(`/api/checklists/items?id=${idel.dataset.ckIdel}`, { method: 'DELETE' })) await renderChecklists();
      return;
    }
    const iadd = e.target.closest('[data-ck-iadd]');
    if (iadd) {
      const inp = iadd.closest('.ck-add').querySelector('input');
      const content = (inp.value || '').trim();
      if (!content) { toast('请填写内容'); return; }
      if (await ckCall('/api/checklists/items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ group_id: Number(iadd.dataset.ckIadd), content }) })) {
        await renderChecklists();
        const next = box.querySelector(`.ck-card[data-gid="${iadd.dataset.ckIadd}"] .ck-add input`);
        if (next) next.focus();
      }
      return;
    }
    const grename = e.target.closest('[data-ck-grename]');
    if (grename) {
      const g = ckData.find((x) => String(x.id) === grename.dataset.ckGrename);
      const gid = Number(grename.dataset.ckGrename);
      const res = await askText({ title: '重命名清单', value: g ? g.name : '', maxlen: 30, placeholder: '清单名称', alt: '重置' });
      if (res === '__alt__') {   // 一键恢复该清单所有条目为未完成
        if (await ckCall('/api/checklists', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: gid, reset: true }) })) {
          toast('已全部重置为未完成');
          ckExpanded.add(gid);   // 重置后展开方便直接勾选
          await renderChecklists();
        }
        return;
      }
      if (res === null || !res.trim()) return;
      if (await ckCall('/api/checklists', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: gid, name: res.trim() }) })) await renderChecklists();
      return;
    }
    const gdel = e.target.closest('[data-ck-gdel]');
    if (gdel) {
      const g = ckData.find((x) => String(x.id) === gdel.dataset.ckGdel);
      if (!(await confirmModal(`删除清单「${g ? g.name : ''}」？清单下的条目会一并删除。`))) return;
      if (await ckCall(`/api/checklists?id=${gdel.dataset.ckGdel}`, { method: 'DELETE' })) await renderChecklists();
    }
  });
  box.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const inp = e.target.closest('.ck-add input');
    if (!inp) return;
    e.preventDefault();
    inp.closest('.ck-add').querySelector('[data-ck-iadd]').click();
  });
}
bind('#ckNewBtn', 'click', async () => {
  const name = await askText({ title: '新建清单', value: '', maxlen: 30, placeholder: '如：徒步出行装备清单' });
  if (name === null || !name.trim()) return;
  if (await ckCall('/api/checklists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }) })) {
    await renderChecklists();
    const first = $('#ckListBox .ck-card:last-child .ck-add input');
    if (first) first.focus();
  }
});
bindChecklists();

// ===== 通知与提醒 =====
// A 打开即提醒：本地通知汇总今日/逾期待办
// B Web Push：订阅 + 后台到点推送
// C 系统闹钟：Android intent 深链拉起系统时钟（best-effort）
const NOTIFY_KEY = 'szsh_todo_notify';
function nowHHMM() {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
// A：打开 APP 时若有到期/逾期待办，弹一条本地通知
async function maybeNotifyTodos() {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (localStorage.getItem(NOTIFY_KEY) !== '1') return;
    const res = await api('/api/todos?scope=today');
    const data = await res.json();
    const list = (data.todos || []).filter((t) => !t.done);
    if (!list.length) return;
    const due = list.filter((t) => t.overdue || (t.time && t.time <= nowHHMM()));
    if (!due.length) return;
    const body = due.slice(0, 6).map((t) => (t.time ? t.time + ' ' : '') + t.title).join('\n') +
      (due.length > 6 ? `\n…等 ${due.length} 项` : '');
    const title = `待办 ${due.length} 项${list.some((t) => t.overdue) ? '（含逾期）' : ''}`;
    const opts = { body, icon: './icons/icon-512.png', tag: 'szsh-daily', renotify: true };
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg && reg.showNotification) reg.showNotification(title, opts);
    else new Notification(title, opts);
  } catch (_) { /* 通知失败不影响主流程 */ }
}
// A：开启通知（请求权限 + 记住偏好 + 尝试订阅 Push）
async function enableTodoNotify() {
  if (!('Notification' in window)) { toast('当前环境不支持通知'); return; }
  let p = Notification.permission;
  if (p === 'default') p = await Notification.requestPermission();
  if (p === 'granted') {
    localStorage.setItem(NOTIFY_KEY, '1');
    toast('已开启待办通知');
    await subscribePush();
    maybeNotifyTodos();
  } else {
    toast('通知权限被拒绝，请在浏览器/系统设置中开启');
  }
}
// B：订阅 Web Push（VAPID 由后端 /api/push/vapid 提供；失败静默）
async function subscribePush() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
    if (Notification.permission !== 'granted') return false;
    const vres = await fetch('/api/push/vapid');
    if (!vres.ok) return false;
    const { publicKey } = await vres.json();
    if (!publicKey) return false;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKey });
    await api('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub),
    });
    return true;
  } catch (_) { return false; }
}
// C：系统闹钟深链（拉起系统时钟 App 预填闹钟；机型差异大，属 best-effort）
function setSystemAlarm(t) {
  if (!t.time) { toast('该待办没有设定时间'); return; }
  const [h, m] = t.time.split(':').map(Number);
  const msg = encodeURIComponent(t.title || '数字生活待办');
  const uri = 'intent://#Intent;action=android.intent.action.SET_ALARM;package=com.android.deskclock;' +
    `S.android.intent.extra.alarm.MESSAGE=${msg};` +
    `i.android.intent.extra.alarm.HOUR=${h};i.android.intent.extra.alarm.MINUTES=${m};end`;
  toast('正在拉起系统时钟…');
  window.location.href = uri;
}

// ===== 我的账本（v0.5.0：支出/收入/转账 + 两级自定义分类 + 时间/账户/联系人/物品） =====
let ledgerState = { month: todayStrLocal().slice(0, 7), donutMode: 'expense', flow: 'all', cat: '', q: '' };
let ledgerData = {
  catStats: [], incomeCatStats: [], list: [], trend: [],
  accounts: ['默认账户', '现金', '微信', '支付宝', '银行卡', '信用卡', '医保卡', '人情往来'],
  payees: {}, linked: {}, budget: 0, summary: {}, social: { out: 0, in: 0, count: 0 },
};
// 分类树：{ expense: [{name, children:[name]}], income: [...] }（来自 txn_categories，空表回退默认）
let catTree = { expense: [], income: [] };
let editingTxnId = null;
// 记一笔草稿（弹窗内的时间/账户/联系人/物品等不进表单，统一存这里）
let txnDraft = null;

// 旧默认分类 → 调色板槽位（兼容迁移前的历史流水着色）
const LED_CAT_IDX = {
  餐饮: 0, 交通: 1, 购物: 2, 居住: 3, 娱乐: 4, 医疗: 5, 教育: 6, 人情: 7, 借还款: 8, 其他: 9,
  工资: 3, 奖金: 0, 兼职: 2, 理财: 6, 红包: 8,
};
function hashCat(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h;
}
/* ---------- 通用文本输入弹窗（替代 prompt：TWA/WebView 环境不支持 prompt()） ----------
   alt：可选的附加动作按钮文字（如「重置」）；点击后以 '__alt__' 结局返回，由调用方执行对应动作 */
function askText({ title = '输入', value = '', maxlen = 20, placeholder = '', alt = null } = {}) {
  return new Promise((resolve) => {
    const m = $('#askTextModal');
    if (!m) { resolve(null); return; }
    $('#askTextTitle').textContent = title;
    const inp = $('#askTextInput');
    inp.value = value || '';
    inp.setAttribute('maxlength', String(maxlen));
    inp.placeholder = placeholder;
    const altBtn = $('#askTextAlt');
    if (altBtn) {
      altBtn.hidden = !alt;
      altBtn.textContent = alt || '';
    }
    m.hidden = false;
    setTimeout(() => { try { inp.focus(); inp.select(); } catch (_) {} }, 60);
    const done = (val) => {
      m.hidden = true;
      $('#askTextOk').onclick = null; $('#askTextCancel').onclick = null;
      $('#askTextClose').onclick = null; m.onclick = null; inp.onkeydown = null;
      if (altBtn) altBtn.onclick = null;
      resolve(val);
    };
    $('#askTextOk').onclick = () => done(inp.value.trim());
    $('#askTextCancel').onclick = () => done(null);
    $('#askTextClose').onclick = () => done(null);
    if (altBtn) altBtn.onclick = () => done('__alt__');
    m.onclick = (e) => { if (e.target === m) done(null); };
    inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); done(inp.value.trim()); } };
  });
}

/** 分类 → 调色板槽位（与 CSS 的 .dc0~.dc9 对应）：优先取当前分类树中的序号，保证同屏颜色稳定 */
function ledCatClass(name, flow) {
  const flows = flow ? [flow] : ['expense', 'income'];
  for (const f of flows) {
    const i = (catTree[f] || []).findIndex((c) => c.name === name);
    if (i >= 0) return 'dc' + (i % 10);
  }
  if (LED_CAT_IDX[name] !== undefined) return 'dc' + LED_CAT_IDX[name];
  return 'dc' + (name ? hashCat(name) % 10 : 9);
}

async function renderLedger() {
  const box = $('#ledgerStats');
  if (!box) return;
  $('#ledMonth').textContent = ledgerState.month.replace('-', '年') + '月';
  try {
    const res = await api(`/api/transactions?month=${ledgerState.month}`);
    const data = await res.json();
    ledgerData = {
      catStats: data.catStats || [],
      incomeCatStats: data.incomeCatStats || [],
      list: data.list || [],
      trend: data.trend || [],
      accounts: (data.accounts && data.accounts.length) ? data.accounts : ['默认账户'],
      payees: data.payees || {},
      linked: data.linked || {},
      budget: Number(data.budget) || 0,
      budgets: data.budgets || [],
      summary: data.summary || {},
      social: data.social || { out: 0, in: 0, count: 0 },
    };
    if (data.recurringGenerated > 0) toast(`已自动记入 ${data.recurringGenerated} 笔周期账单`);
    if (data.catTree) catTree = data.catTree;
    renderLedgerStats();
    renderBudget();
    renderTrend();
    renderDonut();
    renderTxnList();
    markSynced();
  } catch (err) {
    if (!String(err.message).includes('unauthorized')) box.innerHTML = '<div class="empty-hint">加载账本失败</div>';
  }
}

// 概览 4 格：收入 / 支出 / 结余 / 日均支出（末格顺带露出人情往来小结）
function renderLedgerStats() {
  const box = $('#ledgerStats');
  const s = ledgerData.summary || {};
  const sc = ledgerData.social || { out: 0, in: 0, count: 0 };
  const bal = Number(s.balance) || 0;
  box.innerHTML = `
    <div class="ls income"><span>本月收入</span><strong>${money(s.income)}</strong><small>${Number(s.count) || 0} 笔流水</small></div>
    <div class="ls expense"><span>本月支出</span><strong>${money(s.expense)}</strong><small>最大单笔 ${money(s.maxExpense)}</small></div>
    <div class="ls ${bal >= 0 ? 'income' : 'expense'}"><span>本月结余</span><strong>${money(bal)}</strong><small>${bal >= 0 ? '收入大于支出' : '本月为净支出'}</small></div>
    <div class="ls"><span>日均支出</span><strong>${money(s.avgDaily)}</strong><small>人情往来 ${sc.count} 笔 · 出 ${money(sc.out)}</small></div>`;
}

// 月预算（v0.6.0：总额度条沿用 app_settings.ledger_budget；新增每分类额度进度）
// 面板骨架（标题/周期账单入口/预算入口/总额条/分类列表容器）在 index.html 静态存在
function renderBudget() {
  const bar = $('#lbTotalBar');
  const list = $('#budgetList');
  if (!bar || !list) return;
  const b = ledgerData.budget;
  const spent = Number(ledgerData.summary.expense) || 0;
  const buds = ledgerData.budgets || [];

  if (!b) {
    bar.innerHTML = `
      <div class="lb-head">
        <div><p class="eyebrow">总额度</p><h2>还没有设置预算</h2></div>
        <button class="text-btn" type="button" id="lbSetBtn">设置</button>
      </div>
      <p class="lb-tip">设一个月度预算或下面的分类额度，超支时这里会直接提醒你。</p>`;
  } else {
    const pct = Math.round((spent / b) * 100);
    const cls = pct > 100 ? 'over' : pct >= 80 ? 'warn' : '';
    bar.innerHTML = `
      <div class="lb-head">
        <div><p class="eyebrow">总额度</p><h2>${money(b)} · 已用 ${pct}%</h2></div>
        <button class="text-btn" type="button" id="lbSetBtn">改</button>
      </div>
      <div class="lb-bar"><i class="${cls}" style="width:${Math.min(100, Math.max(pct, 1))}%"></i></div>
      <div class="lb-foot">
        <span>已支出 <b>${money(spent)}</b></span>
        <span class="${pct > 100 ? 'over' : ''}">${pct > 100 ? '已超支 ' + money(spent - b) : '还剩 ' + money(b - spent)}</span>
      </div>`;
  }
  // 幂等绑定（renderBudget 会被反复调用，必须用 onclick 赋值而非 addEventListener）
  const setBtn = $('#lbSetBtn');
  if (setBtn) setBtn.onclick = async () => {
    const v = await promptBudgetTotal(b);   // askText 是 Promise，必须 await，否则拿到的是 Promise 对象永远保存失败
    if (v !== null) saveLedgerBudget(v);
  };

  // 每分类额度进度（点行可改额度）
  list.innerHTML = buds.map((x) => {
    const pct = Math.round((x.pct || 0) * 100);
    const cls = pct > 100 ? 'over' : pct >= 80 ? 'warn' : '';
    return `<button class="bg-row" type="button" data-cat="${escHtml(x.category)}">
      <span class="bg-name"></span>
      <span class="bg-bar"><i class="${cls}" style="width:${Math.min(100, Math.max(pct, 1))}%"></i></span>
      <span class="bg-num">${money(x.used)} / ${money(x.amount)}${pct > 100 ? ' 超了' : ''}</span>
    </button>`;
  }).join('');
  const rows = list.querySelectorAll('.bg-row');
  buds.forEach((x, i) => { if (rows[i]) rows[i].querySelector('.bg-name').textContent = x.category; });
  rows.forEach((r) => { r.onclick = () => openBudgetModal(r.dataset.cat); });
}

/** 总额预算用 askText 弹窗输入（WebView 下 prompt 不可用） */
async function promptBudgetTotal(cur) {
  const v = await askText({ title: '本月总预算（元，填 0 清除）', value: String(cur || ''), maxlen: 8 });
  if (v === null || v === undefined || v === '') return null;
  return Number(v);
}

/** 分类预算编辑弹窗 */
async function openBudgetModal(cat) {
  const m = $('#budgetModal');
  if (!m) return;
  $('#bgCategory').value = cat || '';
  const cur = (ledgerData.budgets || []).find((x) => x.category === cat);
  $('#bgAmount').value = cur ? cur.amount : '';
  $('#budgetModalTitle').textContent = cat ? '调整「' + cat + '」预算' : '设置分类预算';
  openModal(m);
}
async function saveBudgetModal() {
  const cat = String($('#bgCategory').value || '').trim();
  const amount = Number($('#bgAmount').value);
  if (!cat) { toast('请填写分类'); return; }
  if (!Number.isFinite(amount) || amount < 0) { toast('额度无效'); return; }
  try {
    const res = await api('/api/budgets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: cat, month: ledgerState.month, amount }),
    });
    if (res.ok) {
      closeModal($('#budgetModal'));
      toast(amount > 0 ? '预算已保存' : '已取消该分类预算');
      markSynced();
      await renderLedger();
    } else toast('保存失败');
  } catch (_) { /* 401 已处理 */ }
}

/** 周期账单管理弹窗 */
async function openRecurringModal() {
  const m = $('#recurringModal');
  if (!m) return;
  openModal(m);
  await refreshRecurringList();
}
async function refreshRecurringList() {
  const box = $('#rcList');
  if (!box) return;
  try {
    const res = await api('/api/recurring');
    const d = await res.json();
    const list = d.list || [];
    // datalist 供新增表单联想
    const dl = $('#aiCatList');
    if (dl && catTree) dl.innerHTML = [...catTree.expense, ...catTree.income].map((c) => `<option value="${escHtml(c.name)}">`).join('');
    if (!list.length) { box.innerHTML = '<div class="empty-hint">还没有周期账单，加一条试试（如每月房租）。</div>'; return; }
    box.innerHTML = list.map((r) => `
      <div class="rc-row${r.active ? '' : ' off'}">
        <div class="rc-info"><b></b>
          <small>${r.freq === 'monthly' ? '每月' : r.freq === 'weekly' ? '每周' : '每天'} · 下次 ${escHtml(r.next)} · ${money(r.amount)}</small>
        </div>
        <div class="rc-ops">
          <button class="icon-btn" data-rc-toggle="${r.id}" data-active="${r.active ? 0 : 1}" title="${r.active ? '暂停' : '启用'}" aria-label="${r.active ? '暂停' : '启用'}"><svg><use href="#i-${r.active ? 'eye' : 'sun'}"/></svg></button>
          <button class="icon-btn del" data-rc-del="${r.id}" title="删除" aria-label="删除"><svg><use href="#i-x"/></svg></button>
        </div>
      </div>`).join('');
    const names = box.querySelectorAll('.rc-info b');
    list.forEach((r, i) => { names[i].textContent = `${r.flow === 'income' ? '收入' : '支出'} · ${r.note || r.category}`; });
    box.querySelectorAll('[data-rc-toggle]').forEach((b) => {
      b.onclick = async () => {
        await api('/api/recurring/' + b.dataset.rcToggle, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: b.dataset.active === '1' }) }).catch(() => {});
        refreshRecurringList();
      };
    });
    box.querySelectorAll('[data-rc-del]').forEach((b) => {
      b.onclick = async () => {
        if (!(await confirmModal('删除这条周期账单？'))) return;
        await api('/api/recurring/' + b.dataset.rcDel, { method: 'DELETE' }).catch(() => {});
        refreshRecurringList();
      };
    });
  } catch (_) { box.innerHTML = '<div class="empty-hint">加载失败</div>'; }
}
async function addRecurring() {
  const amount = Number($('#rcAmount').value);
  if (!Number.isFinite(amount) || amount <= 0) { toast('请填写有效金额'); return; }
  const next = String($('#rcNext').value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) { toast('下次日期应为 YYYY-MM-DD'); return; }
  try {
    const res = await api('/api/recurring', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        flow: $('#rcFlow').value, amount,
        category: $('#rcCategory').value.trim() || '其他',
        freq: $('#rcFreq').value, next, note: $('#rcNote').value.trim(),
      }),
    });
    if (res.ok) {
      toast('已添加，到期打开账本自动入账');
      $('#rcAmount').value = ''; $('#rcNext').value = ''; $('#rcNote').value = '';
      refreshRecurringList();
    } else {
      const d = await res.json().catch(() => ({}));
      toast(d.error || '添加失败');
    }
  } catch (_) { /* 401 已处理 */ }
}

async function saveLedgerBudget(v) {
  if (v === null || v === undefined) return;
  if (!Number.isFinite(v) || v < 0) { toast('请输入有效金额'); return; }
  try {
    const res = await api('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ledger_budget: String(Math.round(v)) }),
    });
    if (res.ok) {
      toast(v > 0 ? '预算已保存' : '已清除预算');
      markSynced();
      await renderLedger();
    }
  } catch { /* 401 已处理 */ }
}

// 近 6 个月收支趋势 —— 纯 HTML 柱状图（不用 SVG，文字始终是真实字号，手机端也不会缩到看不清）
function renderTrend() {
  const box = $('#ledgerTrend');
  if (!box) return;
  const t = ledgerData.trend || [];
  if (!t.length || !t.some((d) => d.income || d.expense)) {
    box.innerHTML = '<div class="empty-hint">近 6 个月还没有记账数据</div>';
    return;
  }
  const max = Math.max(1, ...t.map((d) => Math.max(Number(d.income) || 0, Number(d.expense) || 0)));
  const bars = t.map((d) => {
    const m = Number(String(d.month).slice(5, 7));
    const cur = d.month === ledgerState.month;
    const inc = Number(d.income) || 0;
    const exp = Number(d.expense) || 0;
    // 有值的最小给 4% 高度，避免 0 值柱完全看不见
    const hi = inc ? Math.max(4, Math.round((inc / max) * 100)) : 1;
    const he = exp ? Math.max(4, Math.round((exp / max) * 100)) : 1;
    return `<div class="tc-col${cur ? ' cur' : ''}" title="${m}月 收入 ${money(inc)} / 支出 ${money(exp)}">
      <div class="tc-bars">
        <span class="tc-bar inc" style="height:${hi}%"><b>${money(inc)}</b></span>
        <span class="tc-bar exp" style="height:${he}%"><b>${money(exp)}</b></span>
      </div>
      <span class="tc-lab">${m}月</span>
    </div>`;
  }).join('');
  const sumIn = t.reduce((a, d) => a + (Number(d.income) || 0), 0);
  const sumEx = t.reduce((a, d) => a + (Number(d.expense) || 0), 0);
  box.innerHTML = `<div class="trend-chart">${bars}</div>
    <p class="lb-tip">近 6 个月合计：收入 <b>${money(sumIn)}</b> · 支出 <b>${money(sumEx)}</b> · 结余 <b>${money(sumIn - sumEx)}</b>，月均支出 ${money(sumEx / t.length)}。</p>`;
}

// 内联 SVG 甜甜圈图（无外部库）
// ⚠️ 尺寸必须由 .donut-svg 的 CSS 给出：全局 `svg{width:20px;height:20px}` 只给图标用，
//    但 CSS 规则优先级高于 SVG 自身的 width/height 表现属性，会把这个环图压成 20×20 的小点。
function renderDonut() {
  const box = $('#ledgerChart');
  if (!box) return;
  const isIncome = ledgerState.donutMode === 'income';
  const cats = isIncome ? (ledgerData.incomeCatStats || []) : (ledgerData.catStats || []);
  const title = $('#ledDonutTitle');
  if (title) title.textContent = isIncome ? '收入构成' : '支出构成';
  $$('.led-donut-seg .seg-item').forEach((b) =>
    b.classList.toggle('active', b.dataset.leddonut === ledgerState.donutMode)
  );

  box.innerHTML = '';
  if (!cats.length) {
    box.innerHTML = `<div class="empty-hint">本月还没有${isIncome ? '收入' : '支出'}记录</div>`;
    return;
  }
  const total = cats.reduce((s, c) => s + c.value, 0) || 1;
  const R = 62;
  const CX = 90;
  const CY = 90;
  const CIRC = 2 * Math.PI * R;
  let offset = 0;
  let paths = '';
  let legend = '<div class="donut-legend">';
  cats.forEach((c, i) => {
    const frac = c.value / total;
    const dash = Math.max(0.5, frac * CIRC - 1.6); // 相邻扇区留 1.6 的缝，看得到分界
    paths += `<circle class="dseg ${ledCatClass(c.name, ledgerState.donutMode)}" cx="${CX}" cy="${CY}" r="${R}"
      transform="rotate(-90 ${CX} ${CY})"
      stroke-dasharray="${dash} ${CIRC - dash}" stroke-dashoffset="${-offset}"/>`;
    offset += frac * CIRC;
    const pct = Math.round(frac * 100);
    legend += `<button class="dl ${ledCatClass(c.name, ledgerState.donutMode)}${ledgerState.cat && ledgerState.cat !== c.name ? ' dim' : ''}" type="button" data-ledcat="${escHtml(c.name)}">
      <i class="dot"></i><span class="nm">${escHtml(c.name)}</span>
      <span class="vl">${money(c.value)}</span><span class="pc">${pct}%</span>
      <span class="dl-bar"><i style="width:${Math.max(pct, 2)}%"></i></span>
    </button>`;
  });
  legend += '</div>';
  box.innerHTML =
    `<svg class="donut-svg" viewBox="0 0 180 180" role="img" aria-label="${isIncome ? '收入' : '支出'}构成环形图">
      ${paths}
      <text class="dt-lab" x="${CX}" y="${CY - 4}" text-anchor="middle">本月${isIncome ? '收入' : '支出'}</text>
      <text class="dt-val" x="${CX}" y="${CY + 18}" text-anchor="middle">${money(total)}</text>
    </svg>` + legend;

  // 点击图例 = 按该分类筛选右侧流水（再点一次取消）
  box.querySelectorAll('.dl').forEach((b) => {
    b.onclick = () => {
      const name = b.dataset.ledcat;
      const same = ledgerState.cat === name;
      ledgerState.cat = same ? '' : name;
      ledgerState.flow = same ? 'all' : ledgerState.donutMode;
      renderDonut();
      renderTxnList();
    };
  });
}

// 流水：筛选（收/支 + 分类 + 关键字）→ 按日期分组
function renderTxnList() {
  const box = $('#ledgerList');
  if (!box) return;
  const all = ledgerData.list || [];
  const q = (ledgerState.q || '').trim().toLowerCase();
  // 按日期倒序（同日按 id 倒序）后再分组——分组依赖「同一天相邻」，不能假定后端顺序永远不变
  const rows = all
    .filter((t) => {
      if (ledgerState.flow !== 'all' && t.flow !== ledgerState.flow) return false;
      if (ledgerState.cat && t.category !== ledgerState.cat) return false;
      if (q && `${t.note} ${t.category} ${t.account}`.toLowerCase().indexOf(q) < 0) return false;
      return true;
    })
    .sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1));

  const cnt = $('#ledCount');
  if (cnt) cnt.textContent = rows.length === all.length ? `${all.length} 笔` : `${rows.length} / ${all.length} 笔`;

  // 筛选按钮联动
  $$('#ledFlowFilter .lf-btn').forEach((b) =>
    b.classList.toggle('active', b.dataset.ledflow === ledgerState.flow)
  );
  const search = $('#ledSearch');
  if (search && search.value !== ledgerState.q) search.value = ledgerState.q;

  box.innerHTML = '';
  if (!rows.length) {
    box.innerHTML = `<div class="empty-hint">${all.length ? '没有符合条件的流水' : '本月还没有流水'}</div>`;
    return;
  }

  const groups = [];
  rows.forEach((t) => {
    const last = groups[groups.length - 1];
    if (last && last.date === t.date) last.items.push(t);
    else groups.push({ date: t.date, items: [t] });
  });

  groups.forEach((g) => {
    const inSum = g.items.filter((t) => t.flow === 'income').reduce((s, t) => s + t.amount, 0);
    const exSum = g.items.filter((t) => t.flow === 'expense').reduce((s, t) => s + t.amount, 0);
    const day = document.createElement('div');
    day.className = 'txn-day';
    day.innerHTML = `<b>${txnDayLabel(g.date)}</b><span>${inSum ? '收 ' + money(inSum) + ' · ' : ''}支 ${money(exSum)}</span>`;
    box.appendChild(day);
    g.items.forEach((t) => box.appendChild(buildTxnRow(t)));
  });
}

function txnDayLabel(s) {
  const d = new Date(s + 'T00:00:00');
  const today = todayStrLocal();
  const yest = ymd(new Date(Date.now() - 864e5));
  const suffix = s === today ? ' · 今天' : s === yest ? ' · 昨天' : '';
  return `${Number(s.slice(5, 7))}月${s.slice(8, 10)}日 周${WK[d.getDay()]}${suffix}`;
}

function buildTxnRow(t) {
  const isExp = t.flow === 'expense';
  const isTrf = t.flow === 'transfer';
  const payee = ledgerData.payees ? ledgerData.payees[t.id] : null;
  const linked = ledgerData.linked ? ledgerData.linked[t.id] : null;
  // 由「人际关系 · 财务人情账」写入的流水：分类与金额以人际关系页为准，账本里只读+可跳转，
  // 避免两端各改一次造成数据不一致。
  const synced = t.account === '人情往来';
  const row = document.createElement('div');
  row.className = 'txn-row' + (synced ? ' locked' : '');
  row.innerHTML = `
    <span class="txn-ic"></span>
    <div class="txn-main">
      <b></b>
      <div class="txn-meta"></div>
    </div>
    <span class="txn-amt ${isTrf ? 'trf' : isExp ? 'exp' : 'inc'}">${isTrf ? '→ ' : isExp ? '-' : '+'}${money(t.amount)}</span>
    ${synced ? '' : '<button class="icon-btn del" title="删除" aria-label="删除"><svg><use href="#i-x"/></svg></button>'}`;
  row.classList.add(ledCatClass(t.category, t.flow));
  const head = row.querySelector('b');
  head.textContent = t.note || (isTrf ? '转账' : t.category);
  const ic = row.querySelector('.txn-ic');
  if (isTrf) ic.innerHTML = '<svg><use href="#i-swap"/></svg>';
  else ic.textContent = String(t.category || '其').slice(0, 1);
  const meta = row.querySelector('.txn-meta');
  meta.innerHTML = isTrf
    ? `<span class="cat-tag">转账</span><span>${escHtml(t.account)} → ${escHtml(t.toAccount || '—')}</span>`
    : `<span class="cat-tag">${escHtml(t.category)}${t.sub ? ' · ' + escHtml(t.sub) : ''}</span><span>${escHtml(t.account)}</span>`;
  if (t.time) {
    const tm = document.createElement('span');
    tm.className = 'txn-time';
    tm.textContent = t.time;
    meta.appendChild(tm);
  }
  if (t.item) {
    const it = document.createElement('span');
    it.className = 'txn-pill item';
    it.textContent = '🛍 ' + t.item;
    meta.appendChild(it);
  }
  if (linked) {
    const p = document.createElement('button');
    p.type = 'button';
    p.className = 'txn-pill';
    p.textContent = '@' + linked.name;
    p.title = '查看人际关系档案';
    p.onclick = (e) => { e.stopPropagation(); jumpToContact(linked.id); };
    meta.appendChild(p);
  }
  if (payee) {
    const p = document.createElement('button');
    p.type = 'button';
    p.className = 'txn-pill';
    p.textContent = '@' + payee.name;
    p.title = '查看人际关系档案';
    p.onclick = (e) => { e.stopPropagation(); jumpToContact(payee.id); };
    meta.appendChild(p);
  }
  if (synced) {
    const s = document.createElement('span');
    s.className = 'txn-pill sync';
    s.textContent = '人际同步';
    meta.appendChild(s);
  }

  if (synced) {
    row.title = payee ? `来自人际关系 · 点此查看 ${payee.name}` : '来自人际关系 · 请到人际关系页修改';
    row.onclick = () => {
      if (payee) jumpToContact(payee.id);
      else toast('该笔由人际关系生成，请到人际关系页修改');
    };
  } else {
    row.title = '点击编辑';
    row.onclick = () => openTxnModal(t);
    const del = row.querySelector('.del');
    if (del) del.addEventListener('click', (e) => { e.stopPropagation(); removeTxn(t.id); });
  }
  return row;
}

async function removeTxn(id) {
  if (!(await confirmModal('确定删除这笔记录？'))) return;
  try {
    const res = await api(`/api/transactions/${id}`, { method: 'DELETE' });
    if (res.ok) { toast('已删除'); markSynced(); await renderLedger(); }
  } catch { /* 401 已处理 */ }
}

// 账本 → 人际关系：跳转到该联系人的档案
function jumpToContact(id) {
  switchView('relations');
  if (window.pfOpenProfile) window.pfOpenProfile(id);
}

// 人际关系档案 → 账本：定位到某笔流水所在月份（联系人财务往来的「去账本看看」）
window.openLedgerMonth = function (date) {
  if (date && /^\d{4}-\d{2}/.test(date)) ledgerState.month = date.slice(0, 7);
  ledgerState.flow = 'all';
  ledgerState.cat = '';
  ledgerState.q = '';
  switchView('ledger');
};

// ===== 记一笔 / 编辑记录 弹窗（v0.5.0 草稿驱动：分类两级 chips + 时间/账户/联系人/物品按钮） =====
const p2 = (n) => String(n).padStart(2, '0');
const nowHM = () => { const d = new Date(); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };

/** 分类 chips：一级 + （父分类有二级时的）二级；hidden 的分类不在「记一笔」中显示（编辑旧账时若正选中则仍显示） */
function renderCatChips() {
  const box = $('#txnCatChips');
  const subBox = $('#txnSubChips');
  if (!box || !txnDraft) return;
  if (txnDraft.flow === 'transfer') { box.innerHTML = ''; if (subBox) subBox.hidden = true; return; }
  const allTops = catTree[txnDraft.flow] || [];
  if (!allTops.some((c) => c.name === txnDraft.category)) txnDraft.category = '';
  const tops = allTops.filter((c) => !c.hidden || c.name === txnDraft.category);
  if (!tops.some((c) => c.name === txnDraft.category)) txnDraft.category = (tops[0] || {}).name || '其他';
  box.innerHTML = '';
  tops.forEach((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cat-chip' + (c.name === txnDraft.category ? ' on' : '');
    b.textContent = c.name;
    b.onclick = () => { txnDraft.category = c.name; txnDraft.sub = ''; renderCatChips(); };
    box.appendChild(b);
  });
  if (!subBox) return;
  const cur = allTops.find((c) => c.name === txnDraft.category);
  const kids = ((cur && cur.children) || []).filter((k) => !k.hidden || k.name === txnDraft.sub);
  subBox.hidden = !kids.length;
  subBox.innerHTML = '';
  kids.forEach((k) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cat-chip sm' + (k.name === txnDraft.sub ? ' on' : '');
    b.textContent = k.name;
    b.onclick = () => { txnDraft.sub = txnDraft.sub === k.name ? '' : k.name; renderCatChips(); };
    subBox.appendChild(b);
  });
}

/** 收支/转账切换后的显隐联动 */
function syncFlowUI() {
  const isTrf = txnDraft.flow === 'transfer';
  const catField = $('#txnCatField');
  if (catField) catField.hidden = isTrf;
  const label = $('#txnAcctLabel');
  if (label) label.textContent = isTrf ? '转出 → 转入' : '账户';
  if (isTrf && !txnDraft.toAccount) {
    // 默认转入账户：取与转出不同的第一个常用账户
    const list = (ledgerData.accounts && ledgerData.accounts.length ? ledgerData.accounts : ['默认账户'])
      .filter((a) => a !== txnDraft.account && a !== '人情往来');
    txnDraft.toAccount = list[0] || '银行卡';
  }
  renderCatChips();
  syncMetaBtns();
}

/** 时间/账户/联系人/物品 四个按钮上的当前值 */
function syncMetaBtns() {
  if (!txnDraft) return;
  const tv = $('#txnTimeVal');
  if (tv) {
    const d = txnDraft.date === todayStrLocal() ? '今天' : `${Number(txnDraft.date.slice(5, 7))}-${txnDraft.date.slice(8, 10)}`;
    tv.textContent = txnDraft.time ? `${d} ${txnDraft.time}` : d;
  }
  const av = $('#txnAcctVal');
  if (av) av.textContent = txnDraft.flow === 'transfer' ? `${txnDraft.account} → ${txnDraft.toAccount}` : (txnDraft.account || '—');
  const cv = $('#txnContactVal');
  if (cv) cv.textContent = txnDraft.contact ? txnDraft.contact.name : '选填';
  const cb = $('#txnContactBtn');
  if (cb) cb.classList.toggle('filled', !!txnDraft.contact);
  const iv = $('#txnItemVal');
  if (iv) iv.textContent = txnDraft.item || '选填';
  const ib = $('#txnItemBtn');
  if (ib) ib.classList.toggle('filled', !!txnDraft.item);
}

function openTxnModal(t) {
  const f = $('#txnForm');
  if (!f) return;
  f.reset();
  editingTxnId = t ? t.id : null;
  $('#txnEditId').value = t ? String(t.id) : '';
  $('#txnModalTitle').textContent = t ? '编辑记录' : '记一笔';
  $('#txnSubmitBtn').textContent = t ? '保存修改' : '保存';
  $('#txnFormError').hidden = true;

  if (t) {
    const linked = (ledgerData.linked || {})[t.id] || null;
    txnDraft = {
      flow: t.flow === 'income' ? 'income' : t.flow === 'transfer' ? 'transfer' : 'expense',
      category: t.category, sub: t.sub || '',
      date: t.date || todayStrLocal(), time: t.time || '',
      account: t.account || '默认账户', toAccount: t.toAccount || '',
      contact: t.contactId ? { id: t.contactId, name: (linked && linked.name) || '联系人' } : null,
      item: t.item || '',
    };
    $('#txnAmount').value = String(t.amount);
    $('#txnNote').value = t.note || '';
  } else {
    txnDraft = {
      flow: 'expense', category: '', sub: '',
      date: todayStrLocal(), time: nowHM(),          // 默认添加时的当前时间
      account: ledgerState.lastAccount || '默认账户', toAccount: '',
      contact: null, item: '',
    };
    $('#txnAmount').value = '';
    $('#txnNote').value = '';
  }
  const radio = f.querySelector(`[name=flow][value="${txnDraft.flow}"]`);
  if (radio) radio.checked = true;
  syncFlowUI();
  syncTxnHint();
  $('#txnModal').hidden = false;
  // 桌面端自动聚焦金额（手机端不聚焦，避免键盘顶起页面）
  if (window.innerWidth > 860) setTimeout(() => { const a = $('#txnAmount'); if (a) a.focus(); }, 40);
}

function closeTxnModal() {
  const m = $('#txnModal');
  if (m) m.hidden = true;
}

// ===== v0.5.23 随手记 AI → 记一笔表单 =====
// 带金额内容不再用简易确认框，而是弹出「记一笔」完整表单并预填 AI 识别内容；
// 多笔时保存一笔后自动弹出下一笔；非账单条目（待办/联系人/药品/备忘）走确认弹窗。
let aiQueue = [];
let aiSaveHook = null;   // 当前 AI 弹窗保存后的续发钩子

/** 用 AI 草稿预填「记一笔」表单（catTree 里没有的分类临时补一枚芯片，仅本次会话） */
function openTxnFromAi(draft) {
  const flow = draft.flow === 'income' ? 'income' : 'expense';
  const cat = String(draft.category || '').trim() || '其他';
  const sub = String(draft.sub || '').trim().slice(0, 20);
  openTxnModal(null);
  txnDraft.flow = flow;
  txnDraft.category = cat;
  txnDraft.sub = sub;
  txnDraft.date = /^\d{4}-\d{2}-\d{2}$/.test(draft.date || '') ? draft.date : todayStrLocal();
  if (draft.time) txnDraft.time = draft.time;
  $('#txnAmount').value = String(draft.amount);
  $('#txnNote').value = String(draft.note || '').slice(0, 100);
  const radio = $('#txnForm').querySelector(`[name=flow][value="${flow}"]`);
  if (radio) radio.checked = true;
  // AI 分类/二级不在分类树时临时补芯片（保存后如需常驻可去分类管理添加），
  // 保证 AI 识别的 sub 在「记一笔」里以选中态可见
  const tree = catTree[flow] || [];
  if (!tree.some((c) => c.name === cat)) tree.push({ name: cat, children: [] });
  if (sub) {
    const cur = tree.find((c) => c.name === cat) || { name: cat, children: [] };
    cur.children = cur.children || [];
    if (!cur.children.some((k) => k.name === sub)) cur.children.push({ name: sub });
    if (!tree.some((c) => c.name === cat)) tree.push(cur);
  }
  catTree[flow] = tree;
  syncFlowUI();
  renderCatChips();
  syncMetaBtns();   // 时间（含时分）/账户/联系人/物品按钮显示一并同步
  syncTxnHint();
  if (window.innerWidth > 860) setTimeout(() => { const a = $('#txnAmount'); if (a) a.focus(); }, 40);
}

/** 保存一笔后消耗 AI 队列：还有账单 → 继续弹记一笔；只剩待办/联系人/药品 → 确认弹窗 */
async function drainAiQueue() {
  if (window.__aiDraining) return;
  window.__aiDraining = true;
  try {
    while (aiQueue.length) {
      const next = aiQueue.shift();
      if (next.module === 'transaction') { aiSaveHook = () => drainAiQueue(); openTxnFromAi(next); return; }          // 记一笔：保存后继续
      if (next.module === 'medicine') { aiSaveHook = () => drainAiQueue(); if (window.medAiFill) window.medAiFill(next); return; }  // 录入药品：保存后继续
      if (next.module === 'todo') {
        if (next.detail) { aiSaveHook = () => drainAiQueue(); openTodoFromAi(next); return; }                        // 详细描述 → 新增待办弹窗
        const okSave = await saveTodoFromAi(next);                                                                    // 简单 → 直接录入
        if (okSave) { toast('待办已添加'); continue; }
        aiSaveHook = () => drainAiQueue(); openTodoFromAi(next); return;                                             // 失败回退弹窗
      }
      if (next.module === 'relation') { aiSaveHook = () => drainAiQueue(); openContactFromAi(next); return; }        // 联系人：保存后继续
      // memo：直接保存
      const res = await api('/api/memos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: String(next.note || '').slice(0, 500) }) });
      if (res.ok) { toast('备忘已保存'); await refreshP3Memos(); }
    }
  } finally { window.__aiDraining = false; }
}
window.drainAiQueue = drainAiQueue;
window.aiQueueCancel = () => { aiQueue = []; aiSaveHook = null; };
window.aiSaveHookRun = () => { const h = aiSaveHook; aiSaveHook = null; if (h) h(); };
/** v0.5.27：AI 识别的详细待办 → 新增待办弹窗预填 */
function openTodoFromAi(d) {
  const f = $('#todoForm');
  if (!f) return;
  f.reset();
  f.title.value = String(d.title || '').slice(0, 30);
  f.date.value = /^\d{4}-\d{2}-\d{2}$/.test(d.date || '') ? d.date : todayStrLocal();
  f.time.value = /^\d{2}:\d{2}$/.test(d.time || '') ? d.time : '';
  window.syncDtBtns(f);
  $('#todoFormError').hidden = true;
  $('#todoModal').hidden = false;
}

function syncTxnHint() {
  const hint = $('#txnSyncHint');
  const note = $('#txnNote') ? $('#txnNote').value.trim() : '';
  if (hint) hint.hidden = !(note && note[0] === '@');
}

async function submitTxn(e) {
  e.preventDefault();
  if (!txnDraft) return;
  const errEl = $('#txnFormError');
  const amount = Number($('#txnAmount').value);
  if (!Number.isFinite(amount) || amount <= 0) {
    errEl.textContent = '请填写有效金额';
    errEl.hidden = false;
    return;
  }
  if (txnDraft.flow === 'transfer' && txnDraft.toAccount === txnDraft.account) {
    errEl.textContent = '转出与转入账户不能相同';
    errEl.hidden = false;
    return;
  }
  const id = $('#txnEditId').value;
  const payload = {
    flow: txnDraft.flow,
    amount,
    category: txnDraft.flow === 'transfer' ? '转账' : (txnDraft.category || '其他'),
    sub_category: txnDraft.flow === 'transfer' ? '' : (txnDraft.sub || ''),
    date: txnDraft.date,
    time: txnDraft.time || '',
    account: txnDraft.account,
    to_account: txnDraft.flow === 'transfer' ? txnDraft.toAccount : '',
    contact_id: txnDraft.contact ? txnDraft.contact.id : null,
    item: txnDraft.item || '',
    note: $('#txnNote').value,
  };
  ledgerState.lastAccount = txnDraft.account;
  const btn = $('#txnSubmitBtn');
  if (btn) btn.disabled = true;
  try {
    const res = await api(id ? `/api/transactions/${id}` : '/api/transactions', {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      closeTxnModal();
      toast(id ? '已保存修改' : '已记账');
      markSynced();
      await renderLedger();
      window.aiSaveHookRun();   // v0.5.27：随手记 AI 多笔时，保存一笔后续笔继续确认
    } else {
      const d = await res.json().catch(() => ({}));
      errEl.textContent = d.error || '保存失败，请稍后重试';
      errEl.hidden = false;
    }
  } catch { /* 401 已处理 */ } finally { if (btn) btn.disabled = false; }
}

/* ---------- 全站统一 时间选择器（v0.5.0，源自「记一笔·选择时间」） ----------
   三种模式：datetime 月历+时间轮 / date 仅月历 / time 仅时间轮。
   全站所有日期、时间输入一律通过 openSitePicker 打开本组件（表单按钮用 attachSitePicker 接入）。 */
let tpState = null;   // { y, m, date, h, mi }
let tpDials = null;   // { h: dialApi, mi: dialApi }
let tpMode = 'datetime';
let tpOnDone = null;  // ({date, time}) => void
let tpAllowClear = false;

function openSitePicker({ mode = 'datetime', date = '', time = '', title, allowClear = false, view, onDone }) {
  const m = $('#timePickModal');
  if (!m) return;
  tpMode = mode === 'date' || mode === 'time' ? mode : 'datetime';
  tpOnDone = onDone || null;
  tpAllowClear = !!allowClear;
  const today = todayStrLocal();
  const [ty, tmo] = (date || today).split('-').map(Number);
  const [th, tmi] = (time || nowHM()).split(':').map(Number);
  tpState = {
    y: ty || new Date().getFullYear(), m: (tmo || 1) - 1,
    date: date || '', h: th || 0, mi: tmi || 0,
  };
  // view：仅定位月历视图（不预选值），用于「已填年份但还没选月日」的生日场景
  if (view && view.y) {
    tpState.y = view.y;
    tpState.m = (view.m || 1) - 1;
    tpState.date = date || '';
  }
  const showCal = tpMode !== 'time';
  $('#tpCalPart').hidden = !showCal;
  $('#tpHeadNav').hidden = !showCal;
  $('#tpYMPanel').hidden = true;
  $('#tpBottom').hidden = false;   // 打开时回到月历/时间轮视图，底部行恢复
  $('#tpDialsBox').hidden = tpMode === 'date';
  $('#tpNow').hidden = tpMode === 'date';
  $('#tpClear').hidden = !tpAllowClear;
  const titleEl = $('#tpTitle');
  titleEl.textContent = title || (showCal ? `${tpState.y}年${tpState.m + 1}月` : '选择时间');
  titleEl.classList.toggle('clickable', showCal);
  $('#tpHint').textContent = tpMode === 'date'
    ? '点日期选择；点顶部年月可快速切换年份与月份。'
    : tpMode === 'time'
      ? '拖动（或滚轮）左侧选小时、右侧选分钟，松手自动吸附。'
      : '点日期选年月日（点顶部年月可切换）；拖动下方选时分，松手自动吸附。';
  tpRenderCal();
  // 先显示弹窗再初始化滚轮：makeDial 依赖 clientHeight 计算居中偏移，隐藏时是 0 会错位
  m.hidden = false;
  if (!tpDials) {
    tpDials = {
      h: makeDial($('#tpHourDial'), 24, tpState.h, (v) => { tpState.h = v; }),
      mi: makeDial($('#tpMinDial'), 60, tpState.mi, (v) => { tpState.mi = v; }),
    };
  } else {
    tpDials.h.set(tpState.h);
    tpDials.mi.set(tpState.mi);
  }
}

function tpApplyNow() {
  const d = new Date();
  tpState.date = todayStrLocal();
  tpState.y = d.getFullYear();
  tpState.m = d.getMonth();
  tpRenderCal();
  if (tpMode !== 'date' && tpDials) {
    tpDials.h.set(d.getHours());
    tpDials.mi.set(d.getMinutes());
  }
}

function tpDone() {
  const out = { date: '', time: '' };
  if (tpMode !== 'time') out.date = tpState.date;
  if (tpMode !== 'date' && tpDials) out.time = `${p2(tpDials.h.get())}:${p2(tpDials.mi.get())}`;
  $('#timePickModal').hidden = true;
  if (tpOnDone) tpOnDone(out);
}

function tpClear() {
  $('#timePickModal').hidden = true;
  if (tpOnDone) tpOnDone({ date: '', time: '' });
}

/* ---------- 统一选择器 × 表单按钮（.dt-btn） ----------
   结构：<button class="dt-btn" data-dt="key" data-ph="占位文本"><svg…/><span>—</span></button>
   对应 hidden input 的 id = key + 'Input'（如 evStart → evStartInput）。
   syncDtBtns 按输入值刷新按钮文字；attachSitePicker 把按钮接成选择器入口并写回。 */
function dtInputOf(btn) { return document.getElementById(btn.dataset.dt + 'Input'); }

window.syncDtBtns = function (root) {
  ((root || document).querySelectorAll('.dt-btn[data-dt]') || []).forEach((btn) => {
    const inp = dtInputOf(btn);
    if (!inp) return;
    let v = inp.value || '';
    if (btn.dataset.hideTime === '1' && v.includes(' ')) v = v.split(' ')[0];
    const span = btn.querySelector('span');
    if (!v) {
      span.textContent = btn.dataset.ph || '—';
      btn.classList.remove('filled');
      return;
    }
    btn.classList.add('filled');
    // data-full="1"：显示完整日期（有效期/开封日期等需要看到年份的场景）
    if (btn.dataset.full === '1') {
      span.textContent = /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : v;
      return;
    }
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(v)) span.textContent = `${Number(v.slice(5, 7))}-${v.slice(8, 10)} ${v.slice(11, 16)}`;
    else if (/^\d{4}-\d{2}-\d{2}$/.test(v)) span.textContent = `${Number(v.slice(5, 7))}-${v.slice(8, 10)}`;
    else span.textContent = v;
  });
};

/** 把 .dt-btn 按钮接成统一选择器入口；opts.modeFn 动态模式（如日程的全天切换），
    opts.serialize 自定义写回格式（默认 datetime→"D T" / date→"D" / time→"T"） */
function attachSitePicker(btnSel, opts = {}) {
  const btn = $(btnSel);
  if (!btn) return;
  btn.addEventListener('click', () => {
    const inp = dtInputOf(btn);
    if (!inp) return;
    const mode = opts.modeFn ? opts.modeFn() : (opts.mode || 'date');
    const v = inp.value || '';
    let date = '', time = '';
    if (mode === 'time') time = v;
    else if (mode === 'datetime') [date, time] = v.split(' ');
    else date = v;
    openSitePicker({
      mode, date, time,
      title: opts.title,
      allowClear: !!opts.allowClear,
      onDone: ({ date: d, time: t }) => {
        if (opts.serialize) inp.value = opts.serialize(d, t);
        else if (mode === 'time') inp.value = t;
        else if (mode === 'datetime') inp.value = d && t ? `${d} ${t}` : '';
        else inp.value = d;
        if (opts.afterSet) opts.afterSet(inp.value);
        window.syncDtBtns();
      },
    });
  });
}

/** 可拖动数字滚轮（小时/分钟/年份/月份通用）：支持指针拖动、滚轮、点选，松手吸附；fmt 自定义条目文本 */
function makeDial(el, count, initVal, onChange, fmt) {
  const ITEM = 36;                 // 与 CSS .tp-item 高度保持一致
  el.innerHTML = '';
  const strip = document.createElement('div');
  strip.className = 'tp-strip';
  const items = [];
  for (let i = 0; i < count; i++) {
    const it = document.createElement('div');
    it.className = 'tp-item';
    it.textContent = fmt ? fmt(i) : p2(i);
    it.dataset.i = i;
    strip.appendChild(it);
    items.push(it);
  }
  el.appendChild(strip);

  let cur = Math.max(0, Math.min(count - 1, initVal));
  let dragging = false, moved = false, startY = 0, startCur = 0;

  const paint = (anim) => {
    strip.style.transition = anim ? 'transform .16s ease' : 'none';
    strip.style.transform = `translateY(${(el.clientHeight - ITEM) / 2 - cur * ITEM}px)`;
    const near = Math.round(cur);
    items.forEach((it, i) => it.classList.toggle('on', i === near));
  };
  const setVal = (v, anim) => {
    cur = Math.max(0, Math.min(count - 1, v));
    paint(anim);
    onChange(Math.round(cur));
  };
  paint(false);

  el.addEventListener('pointerdown', (e) => {
    dragging = true; moved = false;
    startY = e.clientY; startCur = cur;
    el.setPointerCapture(e.pointerId);
    paint(false);
  });
  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dy = e.clientY - startY;
    if (Math.abs(dy) > 3) moved = true;
    if (!moved) return;
    cur = Math.max(0, Math.min(count - 1, startCur - dy / ITEM));
    paint(false);
    onChange(Math.round(cur));
  });
  const finish = (e) => {
    if (!dragging) return;
    dragging = false;
    if (moved) { setVal(Math.round(cur), true); return; }
    // 未拖动 → 视为点选
    const it = e.target && e.target.closest ? e.target.closest('.tp-item') : null;
    if (it) setVal(Number(it.dataset.i), true);
    else setVal(Math.round(cur), true);
  };
  el.addEventListener('pointerup', finish);
  el.addEventListener('pointercancel', () => { dragging = false; setVal(Math.round(cur), true); });
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    setVal(Math.round(cur) + (e.deltaY > 0 ? 1 : -1), true);
  }, { passive: false });

  return { get: () => Math.round(cur), set: (v) => setVal(v, true) };
}

function tpRenderCal() {
  const grid = $('#tpGrid');
  if (!grid || !tpState) return;
  // 标题即年月（随翻月联动；点它弹出年月滚轮）
  if (tpMode !== 'time') $('#tpTitle').textContent = `${tpState.y}年${tpState.m + 1}月`;
  const days = new Date(tpState.y, tpState.m + 1, 0).getDate();
  const first = new Date(tpState.y, tpState.m, 1);
  let html = '';
  for (let i = 0; i < first.getDay(); i++) html += '<i></i>';
  const today = todayStrLocal();
  for (let d = 1; d <= days; d++) {
    const ds = `${tpState.y}-${p2(tpState.m + 1)}-${p2(d)}`;
    const cls = (ds === tpState.date ? ' sel' : '') + (ds === today ? ' today' : '');
    // 公历数字下方带农历（初一显示月份、节气优先），与「日历中心」一致
    let lun = '';
    if (window.lunarLabel) {
      const l = lunarLabel(new Date(tpState.y, tpState.m, d));
      if (l && l.text) lun = `<small class="tp-lun${l.isFestival ? ' fst' : ''}">${escHtml(l.text)}</small>`;
    }
    html += `<button type="button" class="tp-day${cls}" data-d="${d}"><b>${d}</b>${lun}</button>`;
  }
  grid.innerHTML = html;
  grid.querySelectorAll('.tp-day').forEach((b) => {
    b.onclick = () => {
      tpState.date = `${tpState.y}-${p2(tpState.m + 1)}-${p2(Number(b.dataset.d))}`;
      tpRenderCal();
    };
  });
}

/* ---------- 年月滚轮面板（点标题年月弹出；打开时时分滚轮与底部行隐藏，两者不同屏） ---------- */
let tpYMDials = null;

function tpOpenYM() {
  if (tpMode === 'time' || !tpState) return;
  $('#tpCalPart').hidden = true;
  $('#tpHeadNav').hidden = true;
  $('#tpBottom').hidden = true;    // 年月滚轮与时分滚轮互斥，不同屏
  $('#tpYMPanel').hidden = false;
  // 先显示面板再建滚轮（makeDial 依赖 clientHeight）
  if (!tpYMDials) {
    tpYMDials = {
      y: makeDial($('#tpYearDial'), 201, tpState.y - 1900, () => {}, (i) => `${1900 + i}年`),
      m: makeDial($('#tpMonthDial'), 12, tpState.m, () => {}, (i) => `${i + 1}月`),
    };
  } else {
    tpYMDials.y.set(tpState.y - 1900);
    tpYMDials.m.set(tpState.m);
  }
}

function tpCloseYM() {
  $('#tpYMPanel').hidden = true;
  $('#tpHeadNav').hidden = tpMode === 'time';
  $('#tpCalPart').hidden = tpMode === 'time';
  $('#tpBottom').hidden = false;
}

function tpYMDone() {
  if (!tpYMDials) return;
  tpState.y = 1900 + tpYMDials.y.get();
  tpState.m = tpYMDials.m.get();
  tpCloseYM();
  tpRenderCal();
}

function tpShiftMonth(delta) {
  const d = new Date(tpState.y, tpState.m + delta, 1);
  tpState.y = d.getFullYear();
  tpState.m = d.getMonth();
  tpRenderCal();
}

// 随手记直接弹「记一笔」时账本页可能从未加载过，账户清单先轻量预取一次（meta=accounts 只回账户）
let accountsLoaded = false;
async function ensureAccountOptions() {
  if (accountsLoaded) return;
  try {
    const res = await api('/api/transactions?meta=accounts');
    const d = await res.json();
    if (d.accounts && d.accounts.length) { ledgerData.accounts = d.accounts; accountsLoaded = true; }
  } catch (_) { /* 失败时仍可用预置账户列表 */ }
}

/* ---------- 账户选择（转账模式下选转出/转入两组） ---------- */
function renderAcctPick() {
  const body = $('#acctPickBody');
  if (!body || !txnDraft) return;
  const isTrf = txnDraft.flow === 'transfer';
  $('#acctPickTitle').textContent = isTrf ? '选择转账账户' : '选择账户';
  $('#acctPickDone').hidden = !isTrf;
  const list = (ledgerData.accounts && ledgerData.accounts.length ? ledgerData.accounts : ['默认账户']);
  const grp = (title, current, onPick) => {
    const w = document.createElement('div');
    w.className = 'acct-group';
    w.innerHTML = `<span class="acct-t">${title}</span>`;
    const chips = document.createElement('div');
    chips.className = 'cat-chips';
    list.forEach((a) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cat-chip' + (a === current ? ' on' : '');
      b.textContent = a;
      b.onclick = () => { onPick(a); renderAcctPick(); syncMetaBtns(); };
      chips.appendChild(b);
    });
    w.appendChild(chips);
    body.appendChild(w);
  };
  body.innerHTML = '';
  if (isTrf) {
    grp('转出账户', txnDraft.account, (a) => { txnDraft.account = a; });
    grp('转入账户', txnDraft.toAccount, (a) => { txnDraft.toAccount = a; });
  } else {
    grp('付款账户', txnDraft.account, (a) => { txnDraft.account = a; $('#acctPickModal').hidden = true; });
  }
}

/* ---------- 联系人选择（来自人际关系，选中即关联） ---------- */
let contactCache = null;
// profile.js 增删改联系人成功后调用，避免「记一笔→联系人」仍是旧名单
window.invalidateContacts = function () { contactCache = null; };
async function openContactPicker() {
  const m = $('#contactPickModal');
  if (!m) return;
  const list = $('#contactPickList');
  list.innerHTML = '<div class="empty-hint">加载中…</div>';
  $('#contactPickSearch').value = '';
  m.hidden = false;
  if (!contactCache) {
    try {
      const res = await api('/api/contacts');
      contactCache = (await res.json()).contacts || [];
    } catch (_) { contactCache = []; }
  }
  renderContactPick('');
}

function renderContactPick(q) {
  const list = $('#contactPickList');
  if (!list) return;
  const kw = (q || '').trim().toLowerCase();
  const rows = (contactCache || []).filter((c) => !kw || String(c.name || '').toLowerCase().includes(kw) || String(c.phone || '').includes(kw));
  list.innerHTML = '';
  if (txnDraft && txnDraft.contact) {
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'cp-row clear';
    clear.innerHTML = '<span class="cp-av">✕</span><b>不关联联系人</b>';
    clear.onclick = () => { txnDraft.contact = null; $('#contactPickModal').hidden = true; syncMetaBtns(); };
    list.appendChild(clear);
  }
  if (!rows.length) {
    if (!list.children.length) list.innerHTML = '<div class="empty-hint">没有匹配的联系人</div>';
    return;
  }
  rows.forEach((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cp-row';
    b.innerHTML = `<span class="cp-av"></span><div class="cp-main"><b></b><small></small></div>`;
    b.querySelector('.cp-av').textContent = String(c.name || '?')[0];
    b.querySelector('b').textContent = c.name;
    b.querySelector('small').textContent = [c.gender, c.phone].filter(Boolean).join(' · ') || '　';
    b.onclick = () => {
      txnDraft.contact = { id: c.id, name: c.name };
      $('#contactPickModal').hidden = true;
      syncMetaBtns();
    };
    list.appendChild(b);
  });
}

/* ---------- 记账设置 · 分类管理（两级 + 拖动排序） ---------- */
let ledset = { flow: 'expense', tree: null, expanded: new Set() };

async function renderLedgerSet() {
  const box = $('#ledsetList');
  if (!box) return;
  $('#ledsetFlowTitle').textContent = ledset.flow === 'income' ? '收入分类' : '支出分类';
  $$('#view-ledgerset [data-lsflow]').forEach((b) =>
    b.classList.toggle('active', b.dataset.lsflow === ledset.flow)
  );
  box.innerHTML = '<div class="empty-hint">加载中…</div>';
  try {
    const res = await api('/api/txn-categories');
    ledset.tree = await res.json();
  } catch (err) {
    if (String(err.message).includes('unauthorized')) return;
    ledset.tree = null;
  }
  const tops = (ledset.tree && ledset.tree[ledset.flow]) || [];
  box.innerHTML = '';
  if (!tops.length) {
    box.innerHTML = '<div class="empty-hint">还没有分类，在上方输入名称添加一个吧。</div>';
    return;
  }
  tops.forEach((c) => box.appendChild(ledsetItem(c)));
}

/** 一个一级分类块：分类行 + 可展开的二级列表 + 二级添加行 */
function ledsetItem(cat) {
  const wrap = document.createElement('div');
  wrap.className = 'ls-item';
  const row = ledsetRow(cat, 'top', {
    expanded: ledset.expanded.has(cat.id),
    onExpand: () => {
      if (ledset.expanded.has(cat.id)) ledset.expanded.delete(cat.id);
      else ledset.expanded.add(cat.id);
      renderLedgerSet();
    },
  });
  wrap.appendChild(row);

  const kidsBox = document.createElement('div');
  kidsBox.className = 'ls-kids';
  if (!ledset.expanded.has(cat.id)) kidsBox.hidden = true;
  (cat.children || []).forEach((k) => kidsBox.appendChild(ledsetRow(k, 'sub', { parentId: cat.id })));

  const addRow = document.createElement('div');
  addRow.className = 'ledset-add sub';
  addRow.innerHTML = `
    <input class="inp" maxlength="10" placeholder="在「${escHtml(cat.name)}」下新增二级分类">
    <button class="btn ghost" type="button"><svg><use href="#i-plus"/></svg>添加</button>`;
  const addSub = async () => {
    const name = addRow.querySelector('input').value.trim();
    if (!name) { toast('请填写二级分类名称'); return; }
    const res = await api('/api/txn-categories', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flow: ledset.flow, name, parent_id: cat.id }),
    });
    if (res.ok) { toast('已添加'); markSynced(); renderLedgerSet(); }
    else toast((await res.json().catch(() => ({}))).error || '添加失败');
  };
  addRow.querySelector('button').onclick = addSub;
  addRow.querySelector('input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addSub(); } });
  kidsBox.appendChild(addRow);
  wrap.appendChild(kidsBox);
  return wrap;
}

/** 一条可拖动/可编辑的分类行（level: top | sub） */
function ledsetRow(cat, level, opt = {}) {
  const row = document.createElement('div');
  row.className = 'ls-row ' + level + (cat.hidden ? ' off' : '');
  row.dataset.id = cat.id || '';
  row.dataset.name = cat.name;
  const hasId = !!cat.id;
  const kidCount = level === 'top' ? (cat.children || []).length : 0;
  row.innerHTML = `
    <span class="ls-handle" title="拖动排序" aria-hidden="true"><i></i><i></i><i></i></span>
    <span class="ls-name">${escHtml(cat.name)}</span>
    ${level === 'top' ? `<button class="ls-cnt" type="button">${kidCount ? kidCount + ' 个二级' : '无二级'}</button>` : ''}
    <span class="ls-actions">
      <button class="icon-btn vis" title="是否在「记一笔」中显示" aria-label="前端显示开关"><svg><use href="#i-eye"/></svg></button>
      <button class="icon-btn edit" title="重命名" aria-label="重命名"><svg><use href="#i-edit"/></svg></button>
      <button class="icon-btn del" title="删除" aria-label="删除"><svg><use href="#i-trash"/></svg></button>
    </span>`;
  if (!hasId) {
    // 未迁移（分类表为空回退默认）时不可编辑，只展示
    row.querySelector('.ls-handle').style.visibility = 'hidden';
    row.querySelectorAll('.ls-actions .icon-btn').forEach((b) => { b.style.visibility = 'hidden'; });
    return row;
  }

  row.querySelector('.ls-name').onclick = opt.onExpand || null;
  const cntBtn = row.querySelector('.ls-cnt');
  if (cntBtn) cntBtn.onclick = opt.onExpand || null;

  // 前端显示开关：隐藏后该分类不再出现在「记一笔」的选择标签里（历史流水与统计不受影响）
  row.querySelector('.vis').onclick = async () => {
    const res = await api(`/api/txn-categories/${cat.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hidden: !cat.hidden }),
    });
    if (res.ok) {
      toast(cat.hidden ? `「${cat.name}」已恢复显示` : `「${cat.name}」已隐藏，不再出现在记一笔`);
      markSynced();
      renderLedgerSet();
      renderLedger();
    } else toast('设置失败');
  };
  row.querySelector('.edit').onclick = async () => {
    const v = await askText({ title: '修改分类名称', value: cat.name, maxlen: 10 });
    if (v === null) return;
    if (!v) { toast('名称不能为空'); return; }
    const res = await api(`/api/txn-categories/${cat.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: v }),
    });
    if (res.ok) { toast('已重命名'); markSynced(); renderLedgerSet(); }
    else toast((await res.json().catch(() => ({}))).error || '修改失败');
  };
  row.querySelector('.del').onclick = async () => {
    const tip = level === 'top'
      ? `删除「${cat.name}」？其下二级分类一并删除，历史流水会归并到「其他」。`
      : `删除二级分类「${cat.name}」？`;
    if (!(await confirmModal(tip))) return;
    const res = await api(`/api/txn-categories/${cat.id}`, { method: 'DELETE' });
    if (res.ok) { toast('已删除'); markSynced(); renderLedgerSet(); }
    else toast((await res.json().catch(() => ({}))).error || '删除失败');
  };

  // 同级拖动排序：top 层在 .ledset-list 的一级块之间移动，sub 层在 .ls-kids 内移动
  // （行创建时尚未入 DOM，closest() 拿不到容器，因此拖动开始时再解析）
  bindLedgerDrag(row.querySelector('.ls-handle'), row, level, opt.parentId || null);
  return row;
}

/** 指针拖动排序（鼠标 / 触屏通用）：拖起时绝对定位跟随指针，其余行让位，松手写回顺序 */
function bindLedgerDrag(handle, row, level, parentId) {
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { handle.setPointerCapture(e.pointerId); } catch (_) { /* 合成事件无活动指针时忽略 */ }
    const isTop = level === 'top';
    const scope = isTop ? row.closest('.ledset-list') : row.closest('.ls-kids');
    if (!scope) return;
    // 参与排序的行：top 层取每块的 .ls-row.top，sub 层取本 .ls-kids 里的 .ls-row.sub
    const rows = Array.from(scope.children)
      .filter((el) => el.classList.contains(isTop ? 'ls-item' : 'ls-row'))
      .map((b) => (isTop ? b.querySelector('.ls-row.top') : b));

    const ghostEl = isTop ? row.parentElement : row;   // top 层整块跟随（含展开的二级）
    const rect = ghostEl.getBoundingClientRect();
    const holder = document.createElement('div');
    holder.className = 'ls-holder';
    holder.style.height = rect.height + 'px';
    ghostEl.parentElement.insertBefore(holder, ghostEl);
    Object.assign(ghostEl.style, {
      position: 'fixed', left: rect.left + 'px', top: rect.top + 'px',
      width: rect.width + 'px', zIndex: 60, pointerEvents: 'none',
    });
    const grabDy = e.clientY - rect.top;
    document.body.classList.add('ledset-dragging');

    const moveTo = (y) => {
      ghostEl.style.top = (y - grabDy) + 'px';
      for (const r of rows) {
        if (!r || r === row) continue;
        const rr = r.parentElement === scope ? r.getBoundingClientRect() : r.parentElement.getBoundingClientRect();
        const blockEl = isTop ? r.parentElement : r;
        if (y < rr.top + rr.height / 2) {
          if (holder.nextElementSibling !== blockEl) blockEl.parentElement.insertBefore(holder, blockEl);
          return;
        }
      }
      const lastBlock = isTop ? rows[rows.length - 1] && rows[rows.length - 1].parentElement : rows[rows.length - 1];
      if (lastBlock && lastBlock !== ghostEl && lastBlock.nextElementSibling !== holder) {
        lastBlock.parentElement.insertBefore(holder, lastBlock.nextElementSibling);
      }
    };
    moveTo(e.clientY);

    const onMove = (ev) => moveTo(ev.clientY);
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      document.body.classList.remove('ledset-dragging');
      holder.parentElement.insertBefore(ghostEl, holder);
      holder.remove();
      ghostEl.style.cssText = '';
      const ids = Array.from(scope.children)
        .filter((el) => el.classList.contains(isTop ? 'ls-item' : 'ls-row'))
        .map((b) => Number((isTop ? b.querySelector('.ls-row.top') : b).dataset.id))
        .filter(Boolean);
      api('/api/txn-categories', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flow: ledset.flow, parent_id: parentId, ids }),
      }).then((res) => {
        if (res.ok) { toast('排序已保存'); markSynced(); renderLedgerSet(); }
        else toast('排序保存失败');
      }).catch(() => {});
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
  });
}

// ===== 人际关系 =====
// v0.4.0 起列表与档案全部由 profile.js（pfLoadList / pfOpenProfile）负责，
// 添加/编辑走 contactEditModal，此处不再有联系人弹窗。

// ===== 导航切换 =====
// keepTab：从子菜单进入个人中心时，保留已选中的子页，不强制回到默认页
let currentView = 'home';   // hash 路由去重用（HTML 默认激活 view-home）
let routingLock = false;    // switchView 写 hash 时防止 hashchange 回环
function setHash(h) {
  if (location.hash === h) return;
  routingLock = true;
  location.hash = h;
  setTimeout(() => { routingLock = false; }, 0); // 未触发 hashchange（如同值）也能解锁
}
function switchView(name, opts = {}) {
  const target = $('#view-' + name);
  if (!target) return;
  currentView = name;
  $$('.view').forEach((v) => v.classList.remove('active'));
  target.classList.add('active');
  $$('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.nav === name));
  $$('.mobile-nav > button, .mnav-profile > button').forEach((n) =>
    n.classList.toggle('active', n.dataset.nav === name)
  );
  // 地址栏同步为 #/视图名（PWA 返回键 / 刷新恢复 / 深链分享）
  if (!opts.fromHash) setHash('#/' + name);
  if (name === 'growth') renderGrowth();
  if (name === 'settings') {
    renderSettings();
    switchProfileTab(opts.keepTab ? currentProfileTab : 'site');
  }
  if (name === 'calendar') loadCalEvents();
  if (name === 'todos') { renderTodos(); renderChecklists(); }
  if (name === 'ledger') renderLedger();
  if (name === 'ledgerset') renderLedgerSet();
  if (name === 'medicine' && window.medRenderMedicine) window.medRenderMedicine();
  if (name === 'relations') { if (window.pfLoadList) pfLoadList(); }
  if (name === 'relset') { if (window.renderRelSet) window.renderRelSet(); }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
document.addEventListener('click', (e) => {
  const navEl = e.target.closest('[data-nav]');
  // 移动端「我的」按钮只负责弹子菜单，不直接切视图（由它自己的监听器处理）
  if (navEl && navEl.id !== 'profileBtnMobile') {
    switchView(navEl.dataset.nav);
  }
});

// ===== hash 路由（v0.5.5）=====
// #/home #/ledger …（全部视图）+ 深链 #/relations/{id} 与 #/settings/{tab}。
// TWA/PWA 里按系统返回键 = 回上一视图，而不是退出应用。
const ROUTE_VIEWS = ['home', 'growth', 'todos', 'ledger', 'ledgerset', 'medicine', 'calendar', 'relations', 'relset', 'settings'];
function routeFromHash() {
  const h = (location.hash || '').replace(/^#\/?/, '');
  const seg = h.split('/')[0];
  const arg = h.split('/')[1] || '';
  if (!seg) {
    if (currentView !== 'home') switchView('home', { fromHash: true });
    return;
  }
  if (seg === 'relations' && /^\d+$/.test(arg)) {
    // 已在该档案上则不重复加载（pfOpenProfile 写 hash 会触发本函数）
    if (window.pfOpenByHash) {
      switchView('relations', { fromHash: true });
      window.pfOpenByHash(Number(arg));
    }
    return;
  }
  if (seg === 'settings' && arg && typeof PROFILE_TITLES !== 'undefined' && PROFILE_TITLES[arg]) {
    if (currentView === 'settings' && currentProfileTab === arg) return;
    switchProfileTab(arg);
    switchView('settings', { keepTab: true, fromHash: true });
    return;
  }
  if (ROUTE_VIEWS.includes(seg)) {
    if (seg === currentView && !arg) return; // 同视图去重，避免重复拉数据
    switchView(seg, { fromHash: true });
  } else if (currentView !== 'home') {
    switchView('home', { fromHash: true });
  }
}
window.addEventListener('hashchange', () => {
  if (routingLock) { routingLock = false; return; }
  routeFromHash();
});

// ===== 成长打卡 =====
const CAT_COLOR = { plum:'#4d3045', terra:'#b65f42', sage:'#627a67', sand:'#a57c45', clay:'#8f4f3b' };
const CAT_ORDER = ['plum', 'terra', 'sage', 'sand', 'clay'];
const catColor = (c) => CAT_COLOR[c] || '#746d63';
const catTint = (c) => catColor(c) + '1f'; // 半透明底色

// 按时间打卡的单位备选项（用户直接选，无需手输）
const DURATION_UNITS = ['秒', '分钟', '小时'];

// 根据打卡方式填充单位下拉：按次→次；按时间→秒/分钟/小时
function fillUnitOptions(method, preferred) {
  const sel = $('#unitSelect');
  if (!sel) return;
  const options = method === 'duration' ? DURATION_UNITS : ['次'];
  const want = preferred && options.includes(preferred) ? preferred : options[0];
  sel.innerHTML = options.map((u) => `<option value="${u}">${u}</option>`).join('');
  sel.value = want;
}

// 打卡方式切换时，联动单位下拉与提示文案
function syncMethodUI(method, preferred) {
  fillUnitOptions(method, preferred);
  const hint = $('#methodHint');
  if (hint) {
    hint.textContent =
      method === 'duration'
        ? '按时间：一天累计时长，单位可选秒/分钟/小时。'
        : '按次：每打一次卡 +1。';
  }
}

async function renderGrowth() {
  try {
    const [hRes, hmRes] = await Promise.all([
      api('/api/habits'),
      api('/api/habits/heatmap?days=60'),
    ]);
    const habits = (await hRes.json()).habits || [];
    window.__habits = habits;
    const heat = await hmRes.json();
    renderCheckin(habits);
    renderHabitGrid(habits);
    renderHeatmap(heat);
  } catch (err) {
    if (String(err.message).includes('unauthorized')) return;
    $('#growthToday').innerHTML = '<div class="empty-hint">加载失败：' + (err && err.message ? err.message : err) + '</div>';
  }
}

/* ===== v0.6.0：习惯频率目标与坚持强度（Loop Habit Tracker 思路） ===== */
function habitWeekRange() {
  const t = new Date(todayStrLocal() + 'T00:00:00');
  const dow = t.getDay() || 7;
  const mon = new Date(t);
  mon.setDate(t.getDate() - dow + 1);
  const p = (n) => String(n).padStart(2, '0');
  const f = (d) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return [f(mon), f(t)];
}
/** 频率目标进度：weekly → 本周 x/N；interval → 距上次天数。daily/睡眠返回 null */
function habitPeriodInfo(h) {
  if (!h.freqType || h.freqType === 'daily' || h.type === 'sleep') return null;
  const logs = h.logs30 || [];
  const today = todayStrLocal();
  if (h.freqType === 'weekly') {
    const [mon] = habitWeekRange();
    let occ = 0;
    logs.forEach(([d, done]) => {
      if (d >= mon && d <= today) occ += Math.min(1, (Number(done) || 0) / ((Number(h.target) || 1)));
    });
    return { text: `本周 ${Math.min(occ, h.freqValue)}/${h.freqValue}`, met: occ >= h.freqValue };
  }
  let last = null;
  logs.forEach(([d]) => { if (d <= today && (!last || d > last)) last = d; });
  const since = last ? Math.round((Date.parse(today) - Date.parse(last)) / 86400000) : null;
  return {
    text: last ? `上次 ${since} 天前 · 每 ${h.freqValue} 天一次` : `还没打过卡 · 每 ${h.freqValue} 天一次`,
    met: since !== null && since < h.freqValue,
  };
}
/** 坚持强度：近 30 天打卡按 14 天半衰指数加权（一次遗漏不清零，连续中断才快速回落） */
function habitStrength(h) {
  const logs = h.logs30 || [];
  if (!logs.length) return 0;
  const today = todayStrLocal();
  let s = 0;
  logs.forEach(([d, done]) => {
    const age = Math.max(0, Math.round((Date.parse(today) - Date.parse(d)) / 86400000));
    s += (Number(done) || 0) * Math.pow(0.5, age / 14);
  });
  let norm = 0;
  for (let i = 0; i < 30; i++) norm += Math.pow(0.5, i / 14);
  const periodFactor = h.freqType === 'weekly' ? (Number(h.freqValue) || 1) / 7
    : h.freqType === 'interval' ? 1 / (Number(h.freqValue) || 1) : 1;
  return Math.max(0, Math.min(1, s / ((Number(h.target) || 1) * periodFactor * norm)));
}
function habitStrengthBar(h) {
  const pct = Math.round(habitStrength(h) * 100);
  return `<div class="strength" title="坚持强度 ${pct}%"><i style="width:${Math.max(3, pct)}%"></i></div>`;
}

function checkinCard(h) {
  const el = document.createElement('div');
  el.className = 'checkin-card';
  const cat = `<span class="cat-tag" style="background:${catTint(h.color)};color:${catColor(h.color)}">${escHtml(h.category)}</span>`;
  let sub, actions;
  if (h.type === 'sleep') {
    sub = `目标 ${escHtml(h.bed_time || '--:--')} 前睡 / ${escHtml(h.rise_time || '--:--')} 前起 / ${escHtml(h.nap_time || '--:--')} 午睡`;
    const parts = [['bed', '早睡', h.today.done_bed], ['rise', '早起', h.today.done_rise], ['nap', '午睡', h.today.done_nap]];
    actions = parts.map((p) => `<button class="chk-btn ${p[2] ? 'on' : ''}" data-id="${h.id}" data-field="${p[0]}">${p[1]}</button>`).join('');
  } else if (h.method === 'duration') {
    // 按时间打卡：快捷按钮与输入框都跟随所选单位（秒/分钟/小时）
    const UNIT_STEPS = { 秒: [10, 20, 30], 分钟: [15, 30, 60], 小时: [1, 2, 3] };
    const steps = UNIT_STEPS[h.unit] || UNIT_STEPS['分钟'];
    sub = `按时间打卡 · 目标 ${h.target} ${escHtml(h.unit)}`;
    const cur = h.today.done || 0;
    const pct = h.target > 0 ? Math.min(100, Math.round((cur / h.target) * 100)) : 0;
    actions = `
      <div class="dur-control">
        <div class="dur-progress"><i style="width:${pct}%"></i><span>${cur} / ${h.target} ${escHtml(h.unit)}</span></div>
        <div class="dur-quick">
          ${steps.map((s) => `<button class="chip" data-id="${h.id}" data-val="${s}">+${s}</button>`).join('')}
        </div>
        <div class="dur-input">
          <input type="number" min="1" value="10" class="dur-min" data-id="${h.id}" aria-label="${escHtml(h.unit)}">
          <span>${escHtml(h.unit)}</span>
          <button class="chk-btn" data-id="${h.id}" data-field="done" data-input="1">记录</button>
        </div>
      </div>`;
  } else {
    sub = `按次打卡 · 目标 ${h.target} ${escHtml(h.unit)}`;
    actions = `
      <div class="count-control">
        <button class="chk-btn round" data-id="${h.id}" data-field="done" data-dec="1" aria-label="减少">−</button>
        <span class="cnt">${h.today.done || 0}<i> / ${h.target} ${escHtml(h.unit)}</i></span>
        <button class="chk-btn" data-id="${h.id}" data-field="done" data-inc="1">打卡 +1</button>
      </div>`;
  }
  el.innerHTML = `
    <div class="ci-main">
      <span class="ci-icon" style="background:${catTint(h.color)};color:${catColor(h.color)}"><svg><use href="#i-${h.icon}"/></svg></span>
      <div class="ci-text"><b></b><small>${cat} ${sub}${(() => { const p = habitPeriodInfo(h); return p ? ' · ' + p.text : ''; })()}</small>${habitStrengthBar(h)}</div>
    </div>
    <div class="ci-actions${h.type === 'sleep' ? ' tri' : ''}">${actions}</div>`;
  el.querySelector('b').textContent = h.name;

  el.querySelectorAll('.chk-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      if (btn.dataset.input) {
        const inp = btn.parentElement.querySelector('.dur-min');
        const v = Number(inp.value) || 0;
        if (v > 0) checkHabit(id, 'done', v);
      } else if (btn.dataset.dec) {
        checkHabit(id, 'done', -1);
      } else if (btn.dataset.inc) {
        checkHabit(id, 'done', 1);
      } else {
        checkHabit(id, btn.dataset.field); // 睡眠：翻转该项
      }
    });
  });
  el.querySelectorAll('.chip').forEach((c) => {
    c.addEventListener('click', () => checkHabit(Number(c.dataset.id), 'done', Number(c.dataset.val)));
  });
  return el;
}

function renderCheckin(habits) {
  const box = $('#growthToday');
  box.innerHTML = '';
  const pending = habits.filter((h) => !h.today.todayDone);
  $('#growthTodayCount').textContent = pending.length ? `共 ${pending.length} 项待完成` : '';
  if (!pending.length) {
    box.innerHTML = '<div class="empty-hint">今天的习惯都完成啦，继续保持 🎉</div>';
    return;
  }
  pending.forEach((h) => box.appendChild(checkinCard(h)));
}

async function checkHabit(id, field, value) {
  try {
    const body = value === undefined ? { field } : { field, value };
    const res = await api(`/api/habits/${id}/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      toast('已记录 ✓');
      markSynced();
      await renderGrowth();
    }
  } catch { /* 401 已处理 */ }
}

function renderHabitGrid(habits) {
  const box = $('#growthAll');
  box.innerHTML = '';
  if (!habits.length) {
    box.innerHTML = '<div class="empty-hint">还没有习惯，点右上角「新增习惯」开始吧。</div>';
    return;
  }
  habits.forEach((h) => {
    const el = document.createElement('div');
    el.className = 'habit-card';
    let prog;
    if (h.type === 'sleep') {
      prog = `今日 ${h.today.done_bed + h.today.done_rise + h.today.done_nap}/3 完成`;
    } else {
      prog = `今日 ${h.today.done || 0} / ${h.target} ${escHtml(h.unit)}`;
    }
    const typeTag = h.type === 'sleep' ? ' · 睡眠' : (h.method === 'duration' ? ' · 按时长' : ' · 按次');
    el.innerHTML = `
      <div class="hc-top">
        <span class="ci-icon" style="background:${catTint(h.color)};color:${catColor(h.color)}"><svg><use href="#i-${h.icon}"/></svg></span>
        <div class="hc-meta"><b></b><small>${escHtml(h.category)}${typeTag}</small></div>
        <button class="icon-btn edit" data-id="${h.id}" title="编辑" aria-label="编辑"><svg><use href="#i-edit"/></svg></button>
        <button class="icon-btn del" data-id="${h.id}" title="删除" aria-label="删除"><svg><use href="#i-x"/></svg></button>
      </div>
      <div class="hc-prog">${prog}</div>
      <div class="hc-extra">${habitStrengthBar(h)}${(() => { const p = habitPeriodInfo(h); return p ? `<span class="hc-freq${p.met ? ' met' : ''}">${p.text}</span>` : ''; })()}</div>`;
    el.querySelector('b').textContent = h.name;
    el.querySelector('.edit').addEventListener('click', () => editHabit(h.id));
    el.querySelector('.del').addEventListener('click', () => deleteHabit(h.id, h.name));
    box.appendChild(el);
  });
}

async function deleteHabit(id, name) {
  if (!(await confirmModal(`确定删除习惯「${name}」？其打卡记录也会一并清除。`))) return;
  try {
    const res = await api(`/api/habits/${id}`, { method: 'DELETE' });
    if (res.ok) { toast('已删除'); markSynced(); await renderGrowth(); }
  } catch { /* 401 已处理 */ }
}

function renderHeatmap(heat) {
  const box = $('#growthHeatmap');
  box.innerHTML = '';
  const days = heat.days || [];
  const cats = heat.categories || [];
  if (!cats.length) {
    box.innerHTML = '<div class="empty-hint">暂无打卡数据，先去打几次卡吧。</div>';
    return;
  }
  const wrap = document.createElement('div');
  wrap.className = 'heatmap-scroll';
  cats.forEach((c) => {
    const block = document.createElement('div');
    block.className = 'heatmap-block';
    const label = document.createElement('div');
    label.className = 'hm-label';
    label.textContent = c.name;
    label.style.color = catColor(c.color);
    const cells = document.createElement('div');
    cells.className = 'hm-cells';
    c.values.forEach((v) => {
      const cell = document.createElement('span');
      cell.className = 'hm-cell';
      if (v <= 0) {
        cell.style.background = '#ece5db';
      } else {
        const op = v >= 1 ? 1 : v >= 0.5 ? 0.62 : 0.3;
        cell.style.background = catColor(c.color);
        cell.style.opacity = op;
      }
      cell.title = `${c.name}：${Math.round(v * 100)}%`;
      cells.appendChild(cell);
    });
    block.appendChild(label);
    block.appendChild(cells);
    wrap.appendChild(block);
  });
  box.appendChild(wrap);
  const tip = document.createElement('p');
  tip.className = 'hm-tip';
  tip.textContent = `最近 ${days.length} 天 · 颜色越深代表当日完成度越高`;
  box.appendChild(tip);
}

// ===== 新增 / 编辑 习惯弹窗 =====
let editingId = null;

function openHabitModal() {
  editingId = null;
  $('#habitModalTitle').textContent = '新增习惯';
  $('#habitForm').reset();
  const f = $('#habitForm');
  f.querySelector('[name=category]').value = '学习';
  f.querySelector('[name=target]').value = 1;
  $('#customCatField').hidden = true;
  $('#sleepField').hidden = true;
  $('#methodField').hidden = false;
  f.querySelector('[name=method][value=count]').checked = true;
  fillUnitOptions('count');
  // 睡眠时段默认值（hidden input reset 后为空，需显式补上）
  f.querySelector('[name=bed_time]').value = '23:00';
  f.querySelector('[name=rise_time]').value = '07:00';
  f.querySelector('[name=nap_start]').value = '12:30';
  f.querySelector('[name=nap_end]').value = '14:00';
  window.syncDtBtns(f);
  $('#habitFormError').hidden = true;
  $('#habitModal').hidden = false;
}

async function editHabit(id) {
  const habits = window.__habits || [];
  const h = habits.find((x) => x.id === id);
  if (!h) return;
  editingId = id;
  $('#habitModalTitle').textContent = '编辑「' + h.name + '」';
  const f = $('#habitForm');
  f.reset();
  f.querySelector('[name=name]').value = h.name;
  // v0.6.0：频率目标回填
  if (h.freqType) f.querySelector('[name=freqType]').value = h.freqType;
  if (h.freqValue) f.querySelector('[name=freqValue]').value = h.freqValue;
  const preset = ['学习', '锻炼', '睡眠'].includes(h.category);
  const catSel = f.querySelector('[name=category]');
  if (preset) {
    catSel.value = h.category;
    $('#customCatField').hidden = true;
  } else {
    catSel.value = '__custom__';
    $('#customCatField').hidden = false;
    f.querySelector('[name=customCategory]').value = h.category;
  }
  const isSleep = h.type === 'sleep' || h.category === '睡眠';
  $('#sleepField').hidden = !isSleep;
  $('#methodField').hidden = isSleep;
  const method = isSleep ? 'count' : (h.method === 'duration' ? 'duration' : 'count');
  if (isSleep) {
    f.querySelector('[name=bed_time]').value = h.bed_time || '23:00';
    f.querySelector('[name=rise_time]').value = h.rise_time || '07:00';
    const nt = (h.nap_time || '12:30-14:00').split('-');
    f.querySelector('[name=nap_start]').value = nt[0] || '12:30';
    f.querySelector('[name=nap_end]').value = nt[1] || '14:00';
  } else {
    f.querySelector(`[name=method][value="${method}"]`).checked = true;
    f.querySelector('[name=target]').value = h.target || 1;
  }
  f.querySelector('[name=icon]').value = h.icon || 'sprout';
  f.querySelector('[name=color]').value = h.color || 'sage';
  syncMethodUI(method, h.unit);
  window.syncDtBtns(f);
  $('#habitFormError').hidden = true;
  $('#habitModal').hidden = false;
}

function closeHabitModal() { $('#habitModal').hidden = true; }
function showHabitFormError(msg) { const el = $('#habitFormError'); el.textContent = msg; el.hidden = false; }

bind('#addHabitBtn', 'click', openHabitModal);
bind('#habitModalClose', 'click', closeHabitModal);
bind('#habitModal', 'click', (e) => { if (e.target === $('#habitModal')) closeHabitModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeHabitModal(); });

$('#habitForm').querySelector('[name=category]').addEventListener('change', (e) => {
  const v = e.target.value;
  $('#customCatField').hidden = v !== '__custom__';
  $('#sleepField').hidden = v !== '睡眠';
  $('#methodField').hidden = v === '睡眠';
});

// 切换打卡方式时，联动单位下拉（按次→次；按时间→秒/分钟/小时）
$$('#habitForm [name=method]').forEach((r) =>
  r.addEventListener('change', (e) => {
    if (e.target.checked) syncMethodUI(e.target.value);
  })
);

bind('#habitForm', 'submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const catSel = fd.get('category');
  let category, type = 'normal', bed_time = null, rise_time = null, nap_time = null, method = 'count', target = 1, unit = null;
  if (catSel === '__custom__') {
    category = (fd.get('customCategory') || '').trim() || '自定义';
  } else {
    category = catSel;
    if (catSel === '睡眠') {
      type = 'sleep';
      bed_time = fd.get('bed_time');
      rise_time = fd.get('rise_time');
      nap_time = `${fd.get('nap_start') || ''}-${fd.get('nap_end') || ''}`;
    }
  }
  if (type === 'normal') {
    method = fd.get('method') === 'duration' ? 'duration' : 'count';
    target = Number(fd.get('target')) || 1;
    unit = (fd.get('unit') || '').trim() || (method === 'duration' ? '分钟' : '次');
  }
  const name = (fd.get('name') || '').trim();
  if (!name) { showHabitFormError('请填写习惯名称'); return; }
  const payload = {
    name, icon: fd.get('icon') || 'sprout', color: fd.get('color') || 'sage',
    category, type, method, target, unit, bed_time, rise_time, nap_time,
    freqType: fd.get('freqType') || 'daily', freqValue: Number(fd.get('freqValue')) || 1,
  };
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  try {
    const url = editingId ? `/api/habits/${editingId}` : '/api/habits';
    const httpMethod = editingId ? 'PUT' : 'POST';
    const res = await api(url, {
      method: httpMethod,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      closeHabitModal();
      toast(editingId ? '已更新习惯' : '已新增习惯');
      markSynced();
      await renderGrowth();
    } else {
      const d = await res.json().catch(() => ({}));
      showHabitFormError(d.error || '保存失败');
    }
  } catch (err) {
    if (!String(err.message).includes('unauthorized')) showHabitFormError('网络错误：' + (err && err.message ? err.message : err));
  } finally {
    btn.disabled = false;
  }
});

// ===== 个人中心 =====
// 子页名称（站点信息 / 主题风格 / 账户安全 / 系统信息）
const PROFILE_TITLES = { site: '站点信息', style: '主题风格', ai: '智能管理', data: '数据安全', security: '账户安全', sysinfo: '系统信息' };

/** 主题配色：18 张国色色卡 */
function buildThemeGrid() {
  const grid = $('#themeGrid');
  if (!grid) return;
  const cnt = $('#themeCount');
  if (cnt) cnt.textContent = `${CN_COLORS.length} 款国色`;
  grid.innerHTML = CN_COLORS.map((c) => {
    const t = THEMES[c.key];
    return `<button type="button" class="tc${c.key === currentTheme ? ' on' : ''}" data-theme="${c.key}"
        title="${t.label} · 日间 ${t.day.main} · 夜间 ${t.night.main}">
      <span class="tc-swatch" style="background:linear-gradient(135deg,${t.base},${t.day.main})">
        <span class="tc-ck"><svg><use href="#i-check"/></svg></span>
      </span>
      <span class="tc-name">${t.label}</span>
      <span class="tc-hex">${t.base.toUpperCase()}</span>
      <span class="tc-duo">
        <i style="background:${t.day.main}" title="日间主色"></i>
        <i style="background:${t.night.main}" title="夜间主色"></i>
      </span>
    </button>`;
  }).join('');
  grid.querySelectorAll('.tc').forEach((el) => {
    el.addEventListener('click', () => {
      applyTheme(el.dataset.theme);
      buildThemeGrid();
      renderThemePreview();
      pushAppearance({ theme: currentTheme });
      toast('已应用配色：' + THEMES[currentTheme].label);
    });
  });
}

/** 当前配色的「日间 / 夜间」对照预览 */
function renderThemePreview() {
  const box = $('#themePreview');
  if (!box) return;
  const t = THEMES[currentTheme] || THEMES[DEFAULT_THEME];
  const half = (p, tag) => `
    <div class="tsp" style="background:${p.card}">
      <span class="tsp-tag" style="background:${p.soft};color:${p.main}">${tag}</span>
      <div class="tsp-card" style="color:${p.ink}">
        <b>数字生活</b>
        <p style="color:${p.muted}">把日子过成自己喜欢的样子</p>
        <div class="tsp-row">
          <i class="tsp-dot" style="background:${p.accent}"></i>
          <i class="tsp-bar" style="background:${p.main};color:${p.on}">按钮</i>
          <i class="tsp-dot" style="background:${p.main}"></i>
        </div>
      </div>
    </div>`;
  box.innerHTML = half(t.day, '日间预览') + half(t.night, '夜间预览');
}

async function renderSettings() {
  try {
    const res = await api('/api/settings');
    const data = await res.json();
    const s = data.settings || {};
    $('#setBrandName').value = s.brand_name || '';
    $('#setBrandAvatar').value = s.brand_avatar || '';
    $('#setBrandTagline').value = s.brand_tagline || '';
    // 外观（主题 / 字体 / 明暗）以本机为准，这里只负责渲染，不再覆盖用户已选的外观
    buildThemeGrid();
    renderThemePreview();
  } catch (err) {
    if (String(err.message).includes('unauthorized')) return;
  }
}

async function renderSessions() {
  const box = $('#deviceList');
  if (!box) return;
  box.innerHTML = '<div class="empty-hint">加载中…</div>';
  try {
    const res = await api('/api/sessions');
    const data = await res.json();
    setPassHint(!!data.customPass);
    // 当前设备排最前，方便第一时间确认「哪台是本机」
    const devices = (data.devices || []).slice()
      .sort((a, b) => (b.current ? 1 : 0) - (a.current ? 1 : 0));
    if (!devices.length) {
      box.innerHTML = '<div class="empty-hint">暂无登录设备记录。</div>';
      return;
    }
    box.innerHTML = '';
    devices.forEach((d) => {
      const el = document.createElement('div');
      el.className = 'device-item' + (d.current ? ' current' : '');
      el.innerHTML = `
        <div class="dev-icon"><svg><use href="#i-people"/></svg></div>
        <div class="dev-main">
          <b></b>
          <small></small>
          <em></em>
        </div>
        <div class="dev-action"></div>`;
      el.querySelector('b').textContent = d.terminal;
      el.querySelector('small').textContent = `${d.browser} · IP ${d.ip}`;
      el.querySelector('em').textContent = `登录于 ${d.loginAt}${d.lastSeen && d.lastSeen !== d.loginAt ? ' · 最近活跃 ' + d.lastSeen : ''}`;
      const act = el.querySelector('.dev-action');
      if (d.current) {
        const tag = document.createElement('span');
        tag.className = 'dev-current-tag';
        tag.textContent = '当前设备';
        act.appendChild(tag);
      } else {
        const btn = document.createElement('button');
        btn.className = 'chip danger-chip';
        btn.textContent = '登出';
        btn.addEventListener('click', () => revokeSession(d.sid));
        act.appendChild(btn);
      }
      box.appendChild(el);
    });
  } catch (err) {
    if (String(err.message).includes('unauthorized')) return;
    box.innerHTML = '<div class="empty-hint">加载设备失败。</div>';
  }
}

async function revokeSession(sid) {
  if (!(await confirmModal('确定登出该设备？该设备上的登录将立即失效。'))) return;
  try {
    const res = await api(`/api/sessions/${sid}`, { method: 'DELETE' });
    if (res.ok) {
      toast('已登出该设备');
      await renderSessions();
    }
  } catch { /* 401 已处理 */ }
}

// ===== 修改密码 =====
// 密码存在服务端（app_settings.admin_pass_hash，PBKDF2-SHA256 哈希，不存明文），因此多端一致；
// 改密成功后服务端会清掉「除当前设备外」的会话。
const PASS_MIN = 6;

function setPassHint(custom) {
  const el = $('#passStateHint');
  if (!el) return;
  el.textContent = custom
    ? ' 当前使用自定义密码。'
    : ' 当前使用的是初始密码，建议尽快修改。';
}

function passError(msg) {
  const el = $('#passError');
  if (!el) return;
  el.textContent = msg || '';
  el.hidden = !msg;
}

function openPassModal() {
  const m = $('#passModal');
  if (!m) return;
  ['#passOld', '#passNew', '#passConfirm'].forEach((s) => { const i = $(s); if (i) i.value = ''; });
  passError('');
  const btn = $('#passSubmitBtn');
  if (btn) btn.disabled = false;
  m.hidden = false;
  const first = $('#passOld');
  if (first) setTimeout(() => first.focus(), 30);
}

function closePassModal() {
  const m = $('#passModal');
  if (m) m.hidden = true;
}

async function submitPassChange() {
  const oldPass = $('#passOld').value;
  const newPass = $('#passNew').value;
  const confirmPass = $('#passConfirm').value;

  if (!oldPass) return passError('请输入当前密码');
  if (!newPass || newPass.length < PASS_MIN) return passError(`新密码至少 ${PASS_MIN} 位`);
  if (newPass !== confirmPass) return passError('两次输入的新密码不一致');
  if (newPass === oldPass) return passError('新密码不能与当前密码相同');

  passError('');
  const btn = $('#passSubmitBtn');
  btn.disabled = true;
  try {
    const res = await api('/api/auth/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPass, newPass, confirmPass }),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok && d.ok) {
      closePassModal();
      setPassHint(true);
      toast(d.revoked ? `密码已修改，已登出其它 ${d.revoked} 台设备` : '密码已修改');
      await renderSessions();
    } else {
      passError(d.error || '修改失败，请稍后重试');
    }
  } catch (err) {
    if (!String(err.message || '').includes('unauthorized')) passError('网络错误，请稍后重试');
  } finally {
    btn.disabled = false;
  }
}

// ===== 数据处理：备份下载 / 清空所有数据 =====
let dataStatsCache = { total: 0, tables: [] };

async function renderDataPage() {
  const box = $('#dataStats');
  const totalEl = $('#dataTotal');
  if (!box) return;
  box.innerHTML = '<div class="empty-hint">统计中…</div>';
  try {
    const res = await api('/api/data/stats');
    const d = await res.json();
    dataStatsCache = { total: d.total || 0, tables: d.tables || [] };
    if (totalEl) totalEl.textContent = `${dataStatsCache.total} 条数据`;
    if (!dataStatsCache.tables.length) {
      box.innerHTML = '<div class="empty-hint">暂无数据。</div>';
      return;
    }
    box.innerHTML = dataStatsCache.tables.map((t) => `
      <div class="data-stat${t.count ? '' : ' zero'}">
        <span title="${t.label}">${t.label}</span><b>${t.count}</b>
      </div>`).join('');
    const ct = $('#clearCountText');
    if (ct) ct.textContent = `${dataStatsCache.total} 条`;
  } catch (err) {
    if (String(err.message).includes('unauthorized')) return;
    box.innerHTML = '<div class="empty-hint">读取数据统计失败，请稍后重试。</div>';
  }
}

// ===== v0.5.9 智能管理：AI 模型配置 + API/MCP 令牌 =====
const AI_SCOPE_KEYS = [
  ['ledger', '账本'], ['todos', '待办'], ['calendar', '日历'], ['habits', '习惯'],
  ['medicine', '药箱'], ['relations', '人际关系'], ['memos', '随手记'],
];
let aiModelsCache = [];

async function renderAiPage() {
  await Promise.all([renderAiModels(), renderTokens(), renderAiMemory()]);
}

// ---- v0.5.21 AI 记忆（Skill）：长期偏好，注入所有 AI 解析 ----
async function renderAiMemory() {
  const ta = $('#aiMemoryText');
  const hint = $('#aiMemoryHint');
  if (!ta) return;
  try {
    const res = await api('/api/settings/ai-memory');
    const d = await res.json();
    ta.value = d.memory || '';
    if (hint) hint.textContent = d.memory ? `已生效（${d.memory.length} 字）` : '尚未设置';
  } catch (_) { /* 401 已处理 */ }
}

// ---- AI 模型列表 ----
async function renderAiModels() {
  const box = $('#aiModelList');
  if (!box) return;
  box.innerHTML = '<div class="empty-hint">加载中…</div>';
  try {
    const res = await api('/api/settings/ai-models');
    const d = await res.json();
    aiModelsCache = d.models || [];
    box.innerHTML = aiModelsCache.length ? aiModelsCache.map((m) => `
      <div class="ai-model-row" data-id="${escHtml(m.id)}">
        <div class="ai-model-info">
          <b>${escHtml(m.name)}${m.isDefault ? '<span class="ts-badge">默认</span>' : ''}${m.vision ? '<span class="ts-badge">视觉</span>' : ''}</b>
          <small>${escHtml(m.model)} · ${escHtml(m.apiKeyMasked || '无 Key')}</small>
          <small class="muted">${escHtml(m.baseUrl)}</small>
        </div>
        <div class="ai-model-ops">
          ${m.isDefault ? '' : `<button class="btn ghost sm" data-ai="def" data-id="${escHtml(m.id)}">设为默认</button>`}
          <button class="icon-btn" data-ai="edit" data-id="${escHtml(m.id)}" title="编辑"><svg><use href="#i-edit"/></svg></button>
          <button class="icon-btn" data-ai="del" data-id="${escHtml(m.id)}" title="删除"><svg><use href="#i-x"/></svg></button>
        </div>
      </div>`).join('')
      : '<div class="empty-hint">还没有配置模型。添加一个 OpenAI 兼容的大模型，随手记等 AI 功能即可启用。</div>';
  } catch (err) {
    if (!String(err.message).includes('unauthorized')) box.innerHTML = '<div class="empty-hint">加载失败</div>';
  }
}

function openAiModelModal(m) {
  const modal = $('#aiModelModal');
  const form = $('#aiModelForm');
  if (!modal || !form) return;
  form.reset();
  $('#aiModelTitle').textContent = m ? '编辑模型' : '添加模型';
  $('#aiModelError').hidden = true;
  form.name.value = m ? m.name : '';
  form.baseUrl.value = m ? m.baseUrl : 'https://api.bigmodel.cn/api/paas/v4';
  form.apiKey.value = '';                       // 留空＝沿用已保存 Key（后端按掩码/空值回退）
  form.apiKey.placeholder = m ? `留空＝沿用已保存的 Key（${m.apiKeyMasked}）` : 'sk-…';
  form.model.value = m ? m.model : 'glm-4-flash';
  form.isDefault.checked = m ? !!m.isDefault : aiModelsCache.length === 0;
  form.vision.checked = m ? !!m.vision : false;
  modal.dataset.editId = m ? m.id : '';
  openModal(modal);
}

async function submitAiModel(e) {
  e.preventDefault();
  const form = $('#aiModelForm');
  const err = $('#aiModelError');
  const editId = $('#aiModelModal').dataset.editId || '';
  const isNew = !editId;
  const item = {
    id: editId,
    name: form.name.value.trim(),
    baseUrl: form.baseUrl.value.trim(),
    apiKey: form.apiKey.value.trim(),
    model: form.model.value.trim(),
    isDefault: form.isDefault.checked,
    vision: form.vision.checked,
  };
  if (isNew && !item.apiKey) { err.textContent = '新模型需要填写 API Key'; err.hidden = false; return; }
  // 编辑未改 Key：传回掩码标记，后端沿用旧值
  if (!isNew && !item.apiKey) {
    const old = aiModelsCache.find((x) => x.id === editId);
    item.apiKey = (old && old.apiKeyMasked) || '';
  }
  // 勾选默认 → 其他全部让位
  const next = aiModelsCache.filter((x) => x.id !== editId).map((x) => ({ ...x, isDefault: item.isDefault ? false : x.isDefault }));
  next.push(item);
  try {
    const res = await api('/api/settings/ai-models', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ models: next }) });
    const d = await res.json().catch(() => ({}));
    if (res.ok) { closeModal($('#aiModelModal')); toast('模型配置已保存'); renderAiModels(); }
    else { err.textContent = d.error || '保存失败'; err.hidden = false; }
  } catch (_) { err.textContent = '网络错误'; err.hidden = false; }
}

// ---- 令牌列表 + MCP 配置 ----
async function renderTokens() {
  const box = $('#tokenList');
  const mcpBox = $('#mcpConfBox');
  if (!box) return;
  box.innerHTML = '<div class="empty-hint">加载中…</div>';
  let tokens = [];
  try {
    const res = await api('/api/settings/tokens');
    const d = await res.json();
    tokens = d.tokens || [];
  } catch (err) {
    if (!String(err.message).includes('unauthorized')) box.innerHTML = '<div class="empty-hint">加载失败</div>';
    return;
  }
  box.innerHTML = tokens.length ? tokens.map((t) => {
    const sc = Object.entries(t.scopes || {}).map(([k, v]) => {
      const label = (AI_SCOPE_KEYS.find(([kk]) => kk === k) || [])[1] || k;
      return `${label}${v.write ? '读写' : '读'}`;
    }).join(' · ');
    return `
    <div class="token-row" data-id="${t.id}">
      <div class="token-info">
        <b>${escHtml(t.name)} <code>${escHtml(t.prefix)}</code></b>
        <small>${escHtml(sc || '无权限')}</small>
        <small class="muted">创建 ${escHtml(String(t.createdAt || '').slice(0, 16))}${t.lastUsedAt ? ' · 最近使用 ' + escHtml(String(t.lastUsedAt).slice(5, 16)) : ' · 未使用过'}</small>
      </div>
      <div class="ai-model-ops">
        <button class="icon-btn" data-tk="del" data-id="${t.id}" data-name="${escHtml(t.name)}" title="吊销"><svg><use href="#i-x"/></svg></button>
      </div>
    </div>`;
  }).join('') : '<div class="empty-hint">还没有令牌。生成一个，就能让 MCP 客户端或 AI Agent 按你授权的范围访问数据。</div>';

  if (mcpBox) {
    mcpBox.hidden = !tokens.length;
    if (tokens.length) {
      const conf = {
        mcpServers: {
          shuzishenghuo: {
            url: location.origin + '/mcp',
            headers: { Authorization: 'Bearer szsh_你的令牌' },
          },
        },
      };
      $('#mcpConfPre').textContent = JSON.stringify(conf, null, 2);
    }
  }
}

function openTokenModal() {
  const modal = $('#tokenModal');
  const form = $('#tokenForm');
  if (!modal || !form) return;
  form.reset();
  form.hidden = false;
  $('#tokenResult').hidden = true;
  $('#tokenError').hidden = true;
  $('#scopeGrid').innerHTML = AI_SCOPE_KEYS.map(([k, label]) => `
    <div class="scope-row" data-key="${k}">
      <span>${label}</span>
      <label><input type="checkbox" data-sc="read" checked>读</label>
      <label><input type="checkbox" data-sc="write">写</label>
    </div>`).join('');
  openModal(modal);
}

async function submitToken(e) {
  e.preventDefault();
  const form = $('#tokenForm');
  const err = $('#tokenError');
  const scopes = {};
  $('#scopeGrid').querySelectorAll('.scope-row').forEach((row) => {
    const r = row.querySelector('[data-sc=read]').checked;
    const w = row.querySelector('[data-sc=write]').checked;
    if (r || w) scopes[row.dataset.key] = { read: r, write: w };
  });
  try {
    const res = await api('/api/settings/tokens', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: form.name.value.trim(), scopes }) });
    const d = await res.json().catch(() => ({}));
    if (res.status === 201 && d.token) {
      form.hidden = true;
      $('#tokenResultPre').textContent = d.token;
      $('#tokenResult').hidden = false;
      renderTokens();
    } else { err.textContent = d.error || '生成失败'; err.hidden = false; }
  } catch (_) { err.textContent = '网络错误'; err.hidden = false; }
}

async function copyText(txt, tip) {
  try { await navigator.clipboard.writeText(txt); toast(tip || '已复制'); }
  catch (_) {
    const ta = document.createElement('textarea');
    ta.value = txt; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove(); toast(tip || '已复制');
  }
}

/** 下载全部数据备份：走后端附件流，避免把大数据塞进 JS 内存做字符串拼接 */async function exportAllData() {
  const btn = $('#exportDataBtn');
  if (btn) btn.disabled = true;
  try {
    const res = await fetch('/api/data/export', { credentials: 'same-origin' });
    if (res.status === 401) { showLogin(); return; }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const blob = await res.blob();
    const cd = res.headers.get('content-disposition') || '';
    const m = /filename="([^"]+)"/.exec(cd);
    const name = m ? m[1] : `shuzishenghuo-backup-${Date.now()}.json`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('备份已下载：' + name);
  } catch (err) {
    toast('备份下载失败，请检查网络后重试');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function openClearModal() {
  const ack = $('#ackBackup');
  if (ack && !ack.checked) { toast('请先勾选「我已下载备份」'); return; }
  const inp = $('#clearConfirmInput');
  if (inp) inp.value = '';
  const cf = $('#clearConfirmBtn');
  if (cf) cf.disabled = true;
  const err = $('#clearError');
  if (err) { err.hidden = true; err.textContent = ''; }
  const ct = $('#clearCountText');
  if (ct) ct.textContent = `${dataStatsCache.total || 0} 条`;
  const modal = $('#clearModal');
  if (modal) modal.hidden = false;
  setTimeout(() => { if (inp) inp.focus(); }, 60);
}
function closeClearModal() {
  const modal = $('#clearModal');
  if (modal) modal.hidden = true;
}

async function confirmClearData() {
  const btn = $('#clearConfirmBtn');
  const err = $('#clearError');
  if (btn) btn.disabled = true;
  try {
    const res = await api('/api/data/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'CLEAR_ALL_DATA' }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.ok) throw new Error(d.error || ('HTTP ' + res.status));
    closeClearModal();
    const ack = $('#ackBackup');
    if (ack) ack.checked = false;
    const cb = $('#clearDataBtn');
    if (cb) cb.disabled = true;
    toast(`已清空 ${(d.cleared || []).length} 张数据表`);
    await loadHome();         // 首页统计归零
    await renderDataPage();   // 统计数据刷新
  } catch (e) {
    const msg = (e && e.message) ? e.message : String(e);
    if (String(msg).includes('unauthorized')) return;
    if (err) { err.textContent = '清空失败：' + msg; err.hidden = false; }
    if (btn) btn.disabled = false;
  }
}

// ===== 系统信息 =====
// 采集当前客户端（浏览器/设备）信息
function collectClientInfo() {
  const ua = navigator.userAgent || '';
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);

  let browser = '未知浏览器';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
  else if (/MicroMessenger/i.test(ua)) browser = '微信内置浏览器';
  else if (/Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua)) browser = 'Safari';

  let os = '未知系统';
  if (/Windows NT/i.test(ua)) os = 'Windows';
  else if (/iPhone/i.test(ua)) os = 'iOS (iPhone)';
  else if (/iPad/i.test(ua)) os = 'iOS (iPad)';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  // 设备型号：Android 上可从 UA 抽取型号
  let model = isMobile ? (navigator.userAgentData && navigator.userAgentData.model) || '' : '';
  if (!model) {
    const m = /Android[^;)]*;\s*([^;)]+?)\s*(?:Build|\))/i.exec(ua);
    if (m) model = m[1].trim();
  }
  if (!model) {
    if (/iPhone/i.test(ua)) model = 'iPhone';
    else if (/iPad/i.test(ua)) model = 'iPad';
    else model = '桌面设备';
  }

  const arch = /arm|aarch64/i.test(ua) ? 'ARM (64 位)' : 'x86 / x64';
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '未知';
  const lang = navigator.language || '未知';
  const cores = navigator.hardwareConcurrency || '未知';
  const mem = navigator.deviceMemory ? `${navigator.deviceMemory} GB（近似）` : '浏览器未提供';

  return {
    version: 'v' + VERSION,
    releaseTime: __BUILD_TIME__,
    build: __BUILD_ID__,
    client: browser + (isMobile ? '（移动端）' : '（桌面端）'),
    system: os,
    model: model,
    arch: arch,
    engine: browser === 'Chrome' || browser === 'Edge' || browser === 'Opera' ? 'Blink' :
            browser === 'Firefox' ? 'Gecko' : browser === 'Safari' || /iPhone|iPad|Mac OS/.test(ua) ? 'WebKit' : '未知',
    language: lang + ` · ${cores} 核 · ${mem}`,
    screen: `${screen.width} × ${screen.height} 像素 · ${window.devicePixelRatio || 1}x 缩放 · ${window.innerWidth}×${window.innerHeight} 可视区`,
    timezone: tz,
  };
}

// 渲染信息网格（键值对）
function renderInfoGrid(box, rows) {
  box.innerHTML = '';
  rows.forEach(([k, v]) => {
    const el = document.createElement('div');
    el.className = 'info-row';
    el.innerHTML = '<span class="info-k"></span><span class="info-v"></span>';
    el.querySelector('.info-k').textContent = k;
    el.querySelector('.info-v').textContent = v;
    box.appendChild(el);
  });
}

async function renderSysInfo() {
  const instBox = $('#infoInstance');
  const cliBox = $('#infoClient');
  const syncBox = $('#infoSync');
  [instBox, cliBox, syncBox].forEach((b) => { if (b) b.innerHTML = '<div class="empty-hint">加载中…</div>'; });

  // 客户端信息（本地即可采集，先渲染避免等待）
  const cli = collectClientInfo();
  renderInfoGrid(cliBox, [
    ['客户端版本', cli.version],
    ['发版时间', cli.releaseTime],
    ['构建', cli.build],
    ['客户端', cli.client],
    ['系统', cli.system],
    ['设备型号', cli.model],
    ['架构', cli.arch],
    ['运行引擎', cli.engine],
    ['语言', cli.language],
    ['屏幕分辨率', cli.screen],
    ['时区', cli.timezone],
  ]);

  // 云端实例信息
  let inst = {}, health = { ok: false, ms: 0, note: '未检测' };
  try {
    const t0 = performance.now();
    const res = await api('/api/sysinfo');
    const data = await res.json();
    inst = data.instance || {};
    health = data.health || {};
    // 健康检查耗时以浏览器实测+服务端耗时中的较大值展示更贴近真实
    const rtt = Math.round(performance.now() - t0);
    renderInfoGrid(instBox, [
      ['实例版本', inst.version || '未知'],
      ['实例构建', inst.build || '未知'],
      ['实例部署时间', inst.deployTime || '未知'],
      ['数据库版本', inst.dbVersion || '未知'],
      ['数据库后端', inst.dbBackend || '未知'],
      ['对象存储', inst.storage || '未知'],
      ['部署平台', inst.platform || '未知'],
      ['部署来源', inst.source || '未知'],
      ['后端运行时', inst.backend || '未知'],
      ['边缘节点', inst.colo || '未知'],
      ['访问协议', (inst.protocol || 'https').toUpperCase()],
    ]);
    renderInfoGrid(syncBox, [
      ['实例连接状况', health.ok ? '● 正常' : '○ ' + (health.note || '异常')],
      ['健康检查耗时', `${health.ms ?? rtt} ms（服务端） · ${rtt} ms（往返）`],
      ['最近成功同步', __SYNC_TIME__],
      ['待同步', __PENDING__],
      ['失败或冲突', __CONFLICT__],
    ]);
  } catch (err) {
    const msg = String(err.message).includes('unauthorized') ? '未登录' : '加载失败';
    if (instBox) instBox.innerHTML = `<div class="empty-hint">${msg}</div>`;
    if (syncBox) syncBox.innerHTML = `<div class="empty-hint">${msg}</div>`;
  }
}

bind('#saveSettingsBtn', 'click', async () => {
  const payload = {
    brand_name: ($('#setBrandName').value || '').trim() || '数字生活',
    brand_avatar: ($('#setBrandAvatar').value || '').trim() || '数',
    brand_tagline: ($('#setBrandTagline').value || '').trim() || '把日子过成自己喜欢的样子',
    // 一并保存外观，保证多端一致（外观本身在切换时已即时回写，这里作为兜底）
    theme: currentTheme,
    font: currentFont,
    mode: uiMode,
  };
  const btn = $('#saveSettingsBtn');
  btn.disabled = true;
  try {
    const res = await api('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const d = await res.json();
      if (d.settings) {
        applyTheme(d.settings.theme);
        $('#brandAvatar').textContent = d.settings.brand_avatar;
        $('#brandName').textContent = d.settings.brand_name;
        $('#brandTagline').textContent = d.settings.brand_tagline;
      }
      toast('已保存');
      markSynced();
    } else {
      toast('保存失败');
    }
  } catch { /* 401 已处理 */ }
  finally { btn.disabled = false; }
});

bind('#logoutBtn2', 'click', doLogout);

// ===== 修改密码弹窗交互 =====
// 修改密码弹窗交互（bind 为顶部定义的空值保护助手）
bind('#changePassBtn', 'click', openPassModal);
bind('#passModalClose', 'click', closePassModal);
bind('#passCancelBtn', 'click', closePassModal);
bind('#passModal', 'click', (e) => { if (e.target === $('#passModal')) closePassModal(); });
bind('#passSubmitBtn', 'click', submitPassChange);
['#passOld', '#passNew', '#passConfirm'].forEach((s) => {
  bind(s, 'keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submitPassChange(); }
  });
});

// ===== 数据处理页交互 =====
bind('#exportDataBtn', 'click', exportAllData);
bind('#refreshDataBtn', 'click', renderDataPage);

// ===== v0.5.9 智能管理：事件绑定 =====
bind('#aiModelAddBtn', 'click', () => openAiModelModal(null));
bind('#aiModelClose', 'click', () => closeModal($('#aiModelModal')));
bind('#aiModelForm', 'submit', submitAiModel);
// v0.5.21 测试模型连通性（用表单当前值；编辑态 Key 留空按 id 取旧 Key）
bind('#aiTestBtn', 'click', async () => {
  const form = $('#aiModelForm');
  const out = $('#aiTestResult');
  if (!out) return;
  out.hidden = false;
  out.textContent = '测试中…';
  const id = $('#aiModelModal').dataset.editId || '';
  try {
    const res = await api('/api/ai/test', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id, baseUrl: form.baseUrl.value.trim(), model: form.model.value.trim(),
        apiKey: form.apiKey.value.trim(),
      }) });
    const d = await res.json().catch(() => ({}));
    if (d.ok) out.textContent = `✓ 连接成功（${d.ms}ms，模型已应答：${d.reply || 'ping'}）`;
    else out.textContent = '✗ ' + (d.error || `HTTP ${d.status || '?'}`);
  } catch (_) { out.textContent = '✗ 网络错误'; }
});
// v0.5.21 AI 记忆保存
bind('#aiMemorySave', 'click', async () => {
  const ta = $('#aiMemoryText');
  const hint = $('#aiMemoryHint');
  try {
    const res = await api('/api/settings/ai-memory', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memory: ta.value }) });
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      toast(d.memory ? 'AI 记忆已保存' : '已清除 AI 记忆');
      if (hint) hint.textContent = d.memory ? `已生效（${d.memory.length} 字）` : '尚未设置';
      markSynced();
    } else toast(d.error || '保存失败');
  } catch (_) { toast('网络错误'); }
});
// v0.5.21 随手记图片
bind('#qnImageBtn', 'click', () => $('#qnImageInput').click());
bind('#qnImageInput', 'change', (e) => { const f = e.target.files && e.target.files[0]; qnReadImage(f); e.target.value = ''; });
bind('#qnImageRemove', 'click', () => { qnSetImage(null); if (window.aiQueueCancel) window.aiQueueCancel(); });
bind('#aiModelList', 'click', async (e) => {
  const btn = e.target.closest('[data-ai]');
  if (!btn) return;
  const id = btn.dataset.id;
  const m = aiModelsCache.find((x) => x.id === id);
  if (!m) return;
  if (btn.dataset.ai === 'edit') { openAiModelModal(m); return; }
  if (btn.dataset.ai === 'def') {
    const next = aiModelsCache.map((x) => ({ ...x, isDefault: x.id === id }));
    const res = await api('/api/settings/ai-models', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ models: next }) });
    if (res.ok) { toast('已设为默认模型'); renderAiModels(); }
    return;
  }
  if (btn.dataset.ai === 'del') {
    if (!(await confirmModal(`删除模型「${m.name}」？（不影响已保存的其他模型）`))) return;
    const next = aiModelsCache.filter((x) => x.id !== id);
    if (m.isDefault && next.length) next[0].isDefault = true;
    const res = await api('/api/settings/ai-models', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ models: next }) });
    if (res.ok) { toast('已删除'); renderAiModels(); }
  }
});
bind('#tokenAddBtn', 'click', openTokenModal);
bind('#tokenClose', 'click', () => closeModal($('#tokenModal')));
bind('#tokenForm', 'submit', submitToken);
bind('#tokenCopyBtn', 'click', () => copyText($('#tokenResultPre').textContent, '令牌已复制'));
bind('#mcpCopyBtn', 'click', () => copyText($('#mcpConfPre').textContent, 'MCP 配置已复制'));
bind('#tokenList', 'click', async (e) => {
  const btn = e.target.closest('[data-tk=del]');
  if (!btn) return;
  if (!(await confirmModal(`吊销令牌「${btn.dataset.name || ''}」？使用该令牌的 MCP 服务会立即失去访问权。`))) return;
  const res = await api('/api/settings/tokens?id=' + btn.dataset.id, { method: 'DELETE' });
  if (res.ok) { toast('已吊销'); renderTokens(); }
});
bind('#ackBackup', 'change', (e) => {
  const cb = $('#clearDataBtn');
  if (cb) cb.disabled = !e.target.checked;
});
bind('#clearDataBtn', 'click', openClearModal);
bind('#clearModalClose', 'click', closeClearModal);
bind('#clearCancelBtn', 'click', closeClearModal);
bind('#clearModal', 'click', (e) => { if (e.target === $('#clearModal')) closeClearModal(); });
bind('#clearConfirmInput', 'input', (e) => {
  const cb = $('#clearConfirmBtn');
  if (cb) cb.disabled = e.target.value.trim() !== '清空';
});
bind('#clearConfirmBtn', 'click', confirmClearData);

// ===== 个人中心子菜单（唯一入口） =====
// 记住当前选中的子页，从子菜单进入时不被 switchView 重置
let currentProfileTab = 'site';
function switchProfileTab(name) {
  const tab = name && PROFILE_TITLES[name] ? name : 'site';
  currentProfileTab = tab;
  $$('.profile-page').forEach((p) => p.classList.toggle('active', p.id === 'page-' + tab));
  if (tab === 'data') renderDataPage();
  if (tab === 'ai') renderAiPage();
  if (tab === 'security') renderSessions();
  if (tab === 'sysinfo') renderSysInfo();
}

// 从子菜单进入个人中心的指定子页
function openProfileTab(name) {
  switchProfileTab(name);
  switchView('settings', { keepTab: true });
}

// 侧栏与移动端两套「个人中心 / 我的」按钮 + 子菜单
const PROFILE_MENUS = [
  { btn: '#profileBtn', pop: '#profilePopover' },
  { btn: '#profileBtnMobile', pop: '#profilePopoverMobile' },
];
function closeAllProfilePopovers() {
  PROFILE_MENUS.forEach(({ pop }) => { const p = $(pop); if (p) p.hidden = true; });
}
PROFILE_MENUS.forEach(({ btn, pop }) => {
  const b = $(btn);
  const p = $(pop);
  if (!b || !p) return;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = p.hidden;
    closeAllProfilePopovers();
    p.hidden = !willOpen;
  });
});

// 子菜单项点击：进入对应子页并关闭所有子菜单
document.addEventListener('click', (e) => {
  const tabEl = e.target.closest('[data-ptab]');
  if (tabEl) {
    openProfileTab(tabEl.dataset.ptab);
    closeAllProfilePopovers();
    return;
  }
  // 点击页面其他处关闭子菜单
  const inMenu = PROFILE_MENUS.some(({ btn, pop }) =>
    e.target.closest(pop) || e.target.closest(btn)
  );
  if (!inMenu) closeAllProfilePopovers();
});

// ===== 日历中心交互 =====
$$('.cal-view').forEach((b) => b.addEventListener('click', () => switchCalView(b.dataset.calview)));
bind('#calPrev', 'click', () => calShift(-1));
bind('#calNext', 'click', () => calShift(1));
bind('#calToday', 'click', () => { calState.anchor = new Date(); initCalPicker(); loadCalEvents(); });
bind('#calMonth', 'change', applyCalPicker);
bind('#calYear', 'change', applyCalPicker);
bind('#calYear', 'blur', applyCalPicker);
bind('#addEventBtn', 'click', () => openEventModal(null));
bind('#eventModalClose', 'click', closeEventModal);
bind('#eventModal', 'click', (e) => { if (e.target === $('#eventModal')) closeEventModal(); });
bind('#eventForm', 'submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const title = String(fd.get('title') || '').trim();
  if (!title) { const el = $('#eventFormError'); el.textContent = '请填写标题'; el.hidden = false; return; }
  const payload = {
    title,
    start: String(fd.get('start') || '').replace('T', ' '),
    end: String(fd.get('end') || '').replace('T', ' '),
    calendar: fd.get('calendar'),
    location: fd.get('location'),
    note: fd.get('note'),
    allDay: e.target.allDay.checked,
  };
  if (!payload.start) { const el = $('#eventFormError'); el.textContent = '请选择开始时间'; el.hidden = false; return; }
  const btn = e.target.querySelector('button[type=submit]');
  if (btn) btn.disabled = true;
  try {
    const url = editingEventId ? `/api/events?id=${editingEventId}` : '/api/events';
    const method = editingEventId ? 'PUT' : 'POST';
    const res = await api(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingEventId ? { ...payload, id: editingEventId } : payload),
    });
    if (res.ok) {
      closeEventModal();
      toast(editingEventId ? '已更新日程' : '已新增日程');
      markSynced();
      await loadCalEvents();
    }
  } catch (err) {
    if (!String(err.message).includes('unauthorized')) {
      const el = $('#eventFormError'); el.textContent = '保存失败'; el.hidden = false;
    }
  } finally { if (btn) btn.disabled = false; }
});
// 删除事件
bind('#eventDeleteBtn', 'click', async () => {
  if (!editingEventId) return;
  if (!(await confirmModal('确定删除该日程？'))) return;
  const res = await api(`/api/events?id=${editingEventId}`, { method: 'DELETE' }).catch(() => null);
  if (res && res.ok) { closeEventModal(); toast('已删除'); markSynced(); loadCalEvents(); }
});
// 双击事件块也能删除
document.addEventListener('dblclick', async (e) => {
  const ev = e.target.closest('[data-evid]');
  if (!ev) return;
  const id = Number(ev.dataset.evid);
  if (!(await confirmModal('确定删除该日程？'))) return;
  api(`/api/events?id=${id}`, { method: 'DELETE' }).then((r) => {
    if (r.ok) { toast('已删除'); markSynced(); loadCalEvents(); }
  }).catch(() => {});
});

// ===== 待办交互 =====
bind('#addTodoBtn', 'click', () => {
  const f = $('#todoForm');
  f.reset();
  f.date.value = todayStrLocal();
  f.time.value = '';
  window.syncDtBtns(f);
  $('#todoFormError').hidden = true;
  $('#todoModal').hidden = false;
});
bind('#enableNotifyBtn', 'click', enableTodoNotify);
bind('#todoModalClose', 'click', () => { $('#todoModal').hidden = true; if (window.aiQueueCancel) window.aiQueueCancel(); });
bind('#todoModal', 'click', (e) => { if (e.target === $('#todoModal')) { if (window.aiQueueCancel) window.aiQueueCancel(); $('#todoModal').hidden = true; } });
bind('#todoForm', 'submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const title = String(fd.get('title') || '').trim();
  if (!title) { const el = $('#todoFormError'); el.textContent = '请填写内容'; el.hidden = false; return; }
  const btn = e.target.querySelector('button[type=submit]');
  if (btn) btn.disabled = true;
  try {
    const res = await api('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title, date: fd.get('date'), time: fd.get('time'),
        list: fd.get('list'), priority: fd.get('priority'),
        note: fd.get('note'), remind: e.target.remind.checked,
      }),
    });
    if (res.ok) { $('#todoModal').hidden = true; toast('已添加待办'); markSynced(); await renderTodos(); if (window.aiSaveHookRun) window.aiSaveHookRun(); }
  } catch { /* 401 已处理 */ } finally { if (btn) btn.disabled = false; }
});

// ===== 账本交互 =====
function shiftLedgerMonth(delta) {
  const [y, m] = ledgerState.month.split('-').map(Number);
  const d = new Date(y, (m - 1) + delta, 1);
  ledgerState.month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  // 换月后该分类可能不存在，清掉筛选
  ledgerState.cat = '';
  ledgerState.flow = 'all';
  renderLedger();
}

// 供其它页跳转过来时预置筛选（人际关系 → 账本的「人情 / 借还款」）
window.ledgerFocus = function (mode) {
  if (mode === 'social') { ledgerState.flow = 'all'; ledgerState.cat = '人情'; ledgerState.q = ''; }
  else if (mode === 'social-loan') { ledgerState.flow = 'all'; ledgerState.cat = '借还款'; ledgerState.q = ''; }
  else { ledgerState.flow = 'all'; ledgerState.cat = ''; ledgerState.q = ''; }
};
bind('#ledPrev', 'click', () => shiftLedgerMonth(-1));
bind('#ledNext', 'click', () => shiftLedgerMonth(1));
bind('#addTxnBtn', 'click', () => openTxnModal(null));
bind('#txnModalClose', 'click', closeTxnModal);
bind('#txnModal', 'click', (e) => { if (e.target === $('#txnModal')) closeTxnModal(); });
bind('#txnForm', 'submit', submitTxn);

// 支出/收入/转账 切换 → 草稿联动（转账隐藏分类、账户按钮变转出/转入）
$$('#txnForm [name=flow]').forEach((r) =>
  r.addEventListener('change', () => {
    if (!txnDraft) return;
    txnDraft.flow = r.value;
    if (r.value !== 'transfer') txnDraft.toAccount = txnDraft.toAccount || '';
    syncFlowUI();
  })
);
// 备注以 @ 开头 → 提示与「人际关系」联动
bind('#txnForm', 'input', (e) => { if (e.target && e.target.name === 'note') syncTxnHint(); });

// 时间 / 账户 / 联系人 / 物品
// 时间按钮 → 全站统一选择器（datetime 模式：月历 + 拖动时分）
bind('#txnTimeBtn', 'click', () => {
  if (!txnDraft) return;
  openSitePicker({
    mode: 'datetime', date: txnDraft.date, time: txnDraft.time,
    onDone: ({ date, time }) => { txnDraft.date = date; txnDraft.time = time; syncMetaBtns(); },
  });
});
bind('#txnAcctBtn', 'click', async () => {
  if (!txnDraft) return;
  await ensureAccountOptions();
  renderAcctPick();
  $('#acctPickModal').hidden = false;
});
bind('#txnContactBtn', 'click', openContactPicker);
bind('#txnItemBtn', 'click', () => {
  if (!txnDraft) return;
  $('#itemPickInput').value = txnDraft.item || '';
  $('#itemPickModal').hidden = false;
});
// 时间选择器内部
bind('#tpPrev', 'click', () => tpShiftMonth(-1));
bind('#tpNext', 'click', () => tpShiftMonth(1));
bind('#tpNow', 'click', tpApplyNow);
bind('#tpDone', 'click', tpDone);
bind('#tpClear', 'click', tpClear);
bind('#timePickClose', 'click', () => { $('#timePickModal').hidden = true; });
bind('#timePickModal', 'click', (e) => { if (e.target === $('#timePickModal')) $('#timePickModal').hidden = true; });
// 标题年月 → 年月滚轮面板（再点标题或「返回」回月历；「确定」应用）
bind('#tpTitle', 'click', () => {
  if (!$('#tpYMPanel').hidden) tpCloseYM();
  else tpOpenYM();
});
bind('#tpYMDone', 'click', tpYMDone);
bind('#tpYMBack', 'click', tpCloseYM);

// 全站统一选择器：日程（开始/结束；勾选全天 → 纯月历，存 00:00）
attachSitePicker('[data-dt=evStart]', {
  modeFn: () => ($('#eventForm').allDay.checked ? 'date' : 'datetime'),
  serialize: (d, t) => ($('#eventForm').allDay.checked
    ? (d ? `${d} 00:00` : '')
    : (d && t ? `${d} ${t}` : '')),
  afterSet: () => evClearQuick(),   // 开始变了，旧时长高亮失效
});
attachSitePicker('[data-dt=evEnd]', {
  modeFn: () => ($('#eventForm').allDay.checked ? 'date' : 'datetime'),
  allowClear: true,
  serialize: (d, t) => ($('#eventForm').allDay.checked
    ? (d ? `${d} 00:00` : '')
    : (d && t ? `${d} ${t}` : '')),
  afterSet: () => evClearQuick(),   // 手动选结束 = 不再用快捷时长
});
bind('#eventForm', 'change', (e) => { if (e.target && e.target.name === 'allDay') { evClearQuick(); syncEventDtBtns(); } });

// 日程快捷时长（1小时/1天/3天/7天）：结束 = 开始 + 时长；再点一次取消，手动选结束也会取消
const EV_DUR_MS = { '1h': 3600000, '1d': 86400000, '3d': 259200000, '7d': 604800000 };
function evClearQuick() {
  $$('#evQuickRow .ev-q').forEach((b) => b.classList.remove('on'));
}
bind('#evQuickRow', 'click', (e) => {
  const btn = e.target.closest('.ev-q');
  if (!btn) return;
  const f = $('#eventForm');
  if (f.allDay.checked) { f.allDay.checked = false; syncEventDtBtns(); }   // 点时长 = 退出全天
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(f.start.value || '');
  if (!m) { toast('请先选择开始时间'); return; }
  const base = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  f.end.value = toLocalInput(new Date(base.getTime() + (EV_DUR_MS[btn.dataset.dur] || 0))).replace('T', ' ');
  const wasOn = btn.classList.contains('on');
  evClearQuick();                      // 先清掉旧高亮（互斥单选）
  if (!wasOn) btn.classList.add('on'); // 再点同一个 = 取消快捷，回到手动
  window.syncDtBtns(f);
});
// 全站统一选择器：待办（日期 / 时间可留空）
attachSitePicker('[data-dt=tdDate]', { mode: 'date', allowClear: true });
attachSitePicker('[data-dt=tdTime]', { mode: 'time', allowClear: true });
// 全站统一选择器：睡眠时段（必填）
['htBed', 'htRise', 'htNapStart', 'htNapEnd'].forEach((k) =>
  attachSitePicker(`[data-dt=${k}]`, { mode: 'time', allowClear: false })
);
// 全站统一选择器：药品效期 / 开封日期（可留空）
attachSitePicker('[data-dt=medExpiry]', { mode: 'date', allowClear: true });
attachSitePicker('[data-dt=medOpen]', { mode: 'date', allowClear: true });
// 账户 / 联系人 / 物品弹窗
bind('#acctPickClose', 'click', () => { $('#acctPickModal').hidden = true; });
bind('#acctPickModal', 'click', (e) => { if (e.target === $('#acctPickModal')) $('#acctPickModal').hidden = true; });
bind('#acctPickDone', 'click', () => { $('#acctPickModal').hidden = true; });
bind('#contactPickClose', 'click', () => { $('#contactPickModal').hidden = true; });
bind('#contactPickModal', 'click', (e) => { if (e.target === $('#contactPickModal')) $('#contactPickModal').hidden = true; });
bind('#contactPickSearch', 'input', (e) => renderContactPick(e.target.value));
bind('#itemPickClose', 'click', () => { $('#itemPickModal').hidden = true; });
bind('#itemPickModal', 'click', (e) => { if (e.target === $('#itemPickModal')) $('#itemPickModal').hidden = true; });
bind('#itemSaveBtn', 'click', () => {
  if (txnDraft) txnDraft.item = $('#itemPickInput').value.trim();
  $('#itemPickModal').hidden = true;
  syncMetaBtns();
});
bind('#itemClearBtn', 'click', () => {
  if (txnDraft) txnDraft.item = '';
  $('#itemPickInput').value = '';
  $('#itemPickModal').hidden = true;
  syncMetaBtns();
});

// 记账设置：入口（账本页头齿轮）与返回
bind('#ledgerSetBtn', 'click', () => switchView('ledgerset'));
bind('#ledsetBack', 'click', () => switchView('ledger'));
$$('[data-lsflow]').forEach((b) => {
  b.onclick = () => { ledset.flow = b.dataset.lsflow || 'expense'; renderLedgerSet(); };
});
bind('#ledsetAddBtn', 'click', async () => {
  const inp = $('#ledsetName');
  const name = (inp.value || '').trim();
  if (!name) { toast('请填写分类名称'); return; }
  const res = await api('/api/txn-categories', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flow: ledset.flow, name }),
  });
  if (res.ok) { inp.value = ''; toast('已添加'); markSynced(); renderLedgerSet(); }
  else toast((await res.json().catch(() => ({}))).error || '添加失败');
});
bind('#ledsetName', 'keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#ledsetAddBtn').click(); } });

// 快捷金额
$$('#quickAmt button').forEach((b) => {
  b.onclick = () => {
    const a = $('#txnAmount');
    if (!a) return;
    if (b.dataset.amt === 'clear') { a.value = ''; a.focus(); return; }
    const next = (Number(a.value) || 0) + Number(b.dataset.amt);
    a.value = String(Math.round(next * 100) / 100);
  };
});

// 构成环图：支出 / 收入
$$('.led-donut-seg .seg-item').forEach((b) => {
  b.onclick = () => {
    ledgerState.donutMode = b.dataset.leddonut === 'income' ? 'income' : 'expense';
    ledgerState.cat = '';
    ledgerState.flow = 'all';
    renderDonut();
    renderTxnList();
  };
});

// 流水筛选：收/支 + 关键字
$$('#ledFlowFilter .lf-btn').forEach((b) => {
  b.onclick = () => {
    ledgerState.flow = b.dataset.ledflow || 'all';
    ledgerState.cat = '';
    renderDonut();
    renderTxnList();
  };
});
bind('#ledSearch', 'input', (e) => { ledgerState.q = e.target.value || ''; renderTxnList(); });

// ===== v0.6.0 · P3 事件绑定 =====
bind('#qnForm', 'submit', quickNoteSubmit);
bind('#otdRefresh', 'click', renderOnThisDay);
bind('#recurringBtn', 'click', openRecurringModal);
bind('#recurringModalClose', 'click', () => closeModal($('#recurringModal')));
bind('#recurringModal', 'click', (e) => { if (e.target === $('#recurringModal')) closeModal($('#recurringModal')); });
bind('#rcAddBtn', 'click', addRecurring);
bind('#budgetAddBtn', 'click', () => openBudgetModal(''));
bind('#budgetModalClose', 'click', () => closeModal($('#budgetModal')));
bind('#budgetModal', 'click', (e) => { if (e.target === $('#budgetModal')) closeModal($('#budgetModal')); });
bind('#bgSaveBtn', 'click', saveBudgetModal);
bind('#bgCancelBtn', 'click', () => closeModal($('#budgetModal')));

// ===== PWA =====
// sw.js 必须放在站点根目录注册：放在 /js/ 下时默认作用域只有 /js/，
// 整站的离线缓存策略永远不会生效（v0.3.14 及以前的问题）。
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

// 人物档案模块（v0.3.1）事件绑定
if (window.pfBindEvents) window.pfBindEvents();

// 家庭药箱模块（v0.3.7）事件绑定
if (window.medBindEvents) window.medBindEvents();

// 恢复本地外观设置（主题 / 字体 / 日夜模式）
(function restoreAppearance() {
  let th = null, fo = null, mo = null;
  try {
    th = localStorage.getItem('pf_theme');
    fo = localStorage.getItem('pf_font');
    mo = localStorage.getItem('pf_mode');
  } catch (_) { /* 隐私模式忽略 */ }
  applyTheme(th && THEMES[th] ? th : DEFAULT_THEME);
  if (fo && FONTS[fo]) applyFont(fo);
  if (mo) uiMode = mo;
  lastAppliedMode = '';
  applyUIMode();
  buildModeOpts();
  buildFontOpts();
})();

boot();
