// 数字生活 · 前端逻辑 v0.3.12
const VERSION = '0.3.14';
// 本次发版信息（系统信息页展示）
const __BUILD_ID__ = '我的账本增强：预算 / 趋势 / 构成排行 / 流水筛选与编辑 v0.3.14';
const __BUILD_TIME__ = '2026-10-10 19:46';

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
  const put = (p, v) => document.documentElement.style.setProperty(p, v);
  put('--t-day-plum', d.main);     put('--t-day-accent', d.accent);
  put('--t-day-soft', d.soft);     put('--t-day-card', d.card);
  put('--t-day-paper', d.paper);   put('--t-day-side', d.side);
  put('--t-day-ink', d.ink);       put('--t-day-muted', d.muted);
  put('--t-day-line', d.line);     put('--t-day-deep', d.accent);
  /* 首页 Hero 大模块渐变：日间用主色→突显色（都够深，白字可读），夜间用主题暗色 */
  put('--t-day-hero', `linear-gradient(135deg,${d.main},${d.accent})`);
  put('--t-night-plum', n.main);   put('--t-night-accent', n.accent);
  put('--t-night-soft', n.soft);   put('--t-night-card', n.card);
  put('--t-night-surface', n.surface);
  put('--t-night-hero', `linear-gradient(135deg,${n.soft},${n.card})`);
  put('--t-night-paper', n.paper); put('--t-night-side', n.side);
  put('--t-night-ink', n.ink);     put('--t-night-muted', n.muted);
  put('--t-night-line', n.line);   put('--t-night-deep', n.accent);
  syncThemeColor();
  try { localStorage.setItem('pf_theme', key); } catch (_) {}
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
  const fmt = (x) => `${String(Math.floor(x)).padStart(2, '0')}:${String(Math.round((x % 1) * 60)).padStart(2, '0')}`;
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

function applyFont(name) {
  currentFont = FONTS[name] ? name : 'default';
  const f = FONTS[currentFont];
  const root = document.documentElement;
  // --f-ui / --f-serif 为实际生效变量（配套样式表中的 !important 覆盖层）；另写 --font-* 兼容旧引用
  root.style.setProperty('--f-ui', f.stack);
  root.style.setProperty('--f-serif', f.serif);
  root.style.setProperty('--font-ui', f.stack);
  root.style.setProperty('--font-serif', f.serif);
  try { localStorage.setItem('pf_font', currentFont); } catch (_) {}
}

// ===== 登录 =====
function showLogin() {
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
$('#loginForm').addEventListener('submit', async (e) => {
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
  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (res.ok) {
      $('#loginOverlay').hidden = true;
      $('#appShell').hidden = false;
      await loadHome();
      maybeNotifyTodos();
      document.addEventListener('visibilitychange', () => { if (!document.hidden) maybeNotifyTodos(); });
    } else {
      showLogin();
    }
  } catch {
    showLogin();
  }
}

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
    const cat = h.category ? `<small>${h.category}</small>` : '<small>待打卡</small>';
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

let calState = { view: 'week', anchor: new Date(), events: [] };

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
      .filter((c) => c.showInCalendar && c.nextBirthday)
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
  const cell = document.createElement('div');
  cell.className = 'mcell' + (out ? ' out' : '') + (ymd(date) === today ? ' today' : '');
  const lun = lunarLabel(date);
  const evs = eventsOn(ymd(date));

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
  cell.addEventListener('click', () => openEventModal(null, ymd(date)));
  return cell;
}

function eventsOn(dateStr) {
  return calState.events.filter((ev) => ymd(new Date(ev.start.replace(' ', 'T'))) === dateStr);
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
    const lun = lunarLabel(d);
    const h = document.createElement('div');
    h.className = 'wh' + (ymd(d) === today ? ' today' : '');
    h.innerHTML = `<b>周${WK[d.getDay()]}</b><small></small>`;
    h.querySelector('small').textContent = `${d.getMonth() + 1}/${d.getDate()} ${lun.text}`;
    h.addEventListener('click', () => openEventModal(null, ymd(d)));
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
  const ds = ymd(date);
  return calState.events.filter((ev) => {
    if (ev.allDay) return false;
    const dt = new Date(ev.start.replace(' ', 'T'));
    return ymd(dt) === ds && dt.getHours() === hour;
  });
}

async function switchCalView(v) {
  calState.view = v;
  $$('.cal-view').forEach((b) => b.classList.toggle('active', b.dataset.calview === v));
  await loadCalEvents();
}
function calShift(dir) {
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
  $('#eventModalTitle').textContent = ev ? '编辑日程' : '新增日程';
  $('#eventFormError').hidden = true;
  $('#eventDeleteBtn').hidden = !ev;

  if (ev) {
    f.title.value = ev.title;
    f.start.value = (ev.start || '').replace(' ', 'T').slice(0, 16);
    f.end.value = (ev.end || '').replace(' ', 'T').slice(0, 16);
    f.calendar.value = ev.calendar || '生活';
    f.location.value = ev.location || '';
    f.note.value = ev.note || '';
    f.allDay.checked = !!ev.allDay;
  } else {
    const d = presetDate ? new Date(presetDate + 'T00:00:00') : new Date();
    const h = presetHour === undefined ? new Date().getHours() + 1 : presetHour;
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.min(Math.max(h, 0), 23), 0, 0);
    f.start.value = toLocalInput(start);
    f.end.value = toLocalInput(new Date(start.getTime() + 3600000));
    f.calendar.value = '生活';
  }
  $('#eventModal').hidden = false;
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
        `<span class="todo-pill">${t.list}</span>` +
        (t.overdue ? `<span class="todo-pill high">逾期 ${t.date}</span>` : '') +
        (t.note ? `<span>${t.note}</span>` : '');
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
  if (!confirm(`确定删除待办「${title}」？`)) return;
  try {
    const res = await api(`/api/todos/${id}/delete`, { method: 'DELETE' });
    if (res.ok) { toast('已删除'); markSynced(); await renderTodos(); }
  } catch { /* 401 已处理 */ }
}

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

// ===== 我的账本 =====
let ledgerState = { month: todayStrLocal().slice(0, 7), donutMode: 'expense', flow: 'all', cat: '', q: '' };
let ledgerData = {
  catStats: [], incomeCatStats: [], list: [], trend: [], accounts: ['默认账户'],
  payees: {}, budget: 0, summary: {}, social: { out: 0, in: 0, count: 0 },
};
let txnCats = { expense: ['其他'], income: ['其他'] };
let editingTxnId = null;

// 分类 → 调色板槽位（与 CSS 的 .dc0~.dc9 对应，日/夜自动换色）
const LED_CAT_IDX = {
  餐饮: 0, 交通: 1, 购物: 2, 居住: 3, 娱乐: 4, 医疗: 5, 教育: 6, 人情: 7, 借还款: 8, 其他: 9,
  工资: 3, 奖金: 0, 兼职: 2, 理财: 6, 红包: 8,
};
const ledCatClass = (n) => 'dc' + (LED_CAT_IDX[n] === undefined ? 9 : LED_CAT_IDX[n]);
const escHtml = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

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
      budget: Number(data.budget) || 0,
      summary: data.summary || {},
      social: data.social || { out: 0, in: 0, count: 0 },
    };
    txnCats = data.categories || txnCats;
    renderLedgerStats();
    renderBudget();
    renderTrend();
    renderDonut();
    renderTxnList();
    syncTxnCats();
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

// 月预算：进度条 + 超支提醒（预算存 app_settings.ledger_budget，多端一致）
function renderBudget() {
  const box = $('#ledgerBudget');
  if (!box) return;
  const b = ledgerData.budget;
  const spent = Number(ledgerData.summary.expense) || 0;
  if (!b) {
    box.innerHTML = `
      <div class="lb-head">
        <div><p class="eyebrow">本月预算</p><h2>还没有设置预算</h2></div>
        <button class="text-btn" type="button" id="lbSetBtn">设置</button>
      </div>
      <p class="lb-tip">设一个月度预算，平时能看到已用比例，超支时这里会直接提醒你。</p>
      <div class="lb-edit" id="lbEdit" hidden>
        <input type="number" min="1" step="1" id="lbInput" placeholder="例如 5000" inputmode="decimal" aria-label="月预算金额">
        <button class="btn primary" type="button" id="lbSaveBtn">保存</button>
      </div>`;
  } else {
    const pct = Math.round((spent / b) * 100);
    const cls = pct > 100 ? 'over' : pct >= 80 ? 'warn' : '';
    box.innerHTML = `
      <div class="lb-head">
        <div><p class="eyebrow">本月预算</p><h2>${money(b)} · 已用 ${pct}%</h2></div>
        <button class="text-btn" type="button" id="lbSetBtn">设置</button>
      </div>
      <div class="lb-bar"><i class="${cls}" style="width:${Math.min(100, Math.max(pct, 1))}%"></i></div>
      <div class="lb-foot">
        <span>已支出 <b>${money(spent)}</b></span>
        <span class="${pct > 100 ? 'over' : ''}">${pct > 100 ? '已超支 ' + money(spent - b) : '还剩 ' + money(b - spent)}</span>
      </div>
      <div class="lb-edit" id="lbEdit" hidden>
        <input type="number" min="1" step="1" id="lbInput" value="${b}" inputmode="decimal" aria-label="月预算金额">
        <button class="btn primary" type="button" id="lbSaveBtn">保存</button>
        <button class="btn ghost" type="button" id="lbClearBtn">清除预算</button>
      </div>`;
  }
  // 幂等绑定（renderBudget 会被反复调用，必须用 onclick 赋值而非 addEventListener）
  const setBtn = $('#lbSetBtn');
  if (setBtn) setBtn.onclick = () => {
    const e = $('#lbEdit');
    e.hidden = !e.hidden;
    if (!e.hidden) { const i = $('#lbInput'); if (i) i.focus(); }
  };
  const saveBtn = $('#lbSaveBtn');
  if (saveBtn) saveBtn.onclick = () => saveLedgerBudget();
  const clearBtn = $('#lbClearBtn');
  if (clearBtn) clearBtn.onclick = () => saveLedgerBudget(0);
}

async function saveLedgerBudget(force) {
  const v = force === 0 ? 0 : Number(($('#lbInput') || {}).value);
  if (force !== 0 && (!Number.isFinite(v) || v <= 0)) { toast('请输入大于 0 的金额'); return; }
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
    paths += `<circle class="dseg ${ledCatClass(c.name)}" cx="${CX}" cy="${CY}" r="${R}"
      transform="rotate(-90 ${CX} ${CY})"
      stroke-dasharray="${dash} ${CIRC - dash}" stroke-dashoffset="${-offset}"/>`;
    offset += frac * CIRC;
    const pct = Math.round(frac * 100);
    legend += `<button class="dl ${ledCatClass(c.name)}${ledgerState.cat && ledgerState.cat !== c.name ? ' dim' : ''}" type="button" data-ledcat="${escHtml(c.name)}">
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
  const payee = ledgerData.payees ? ledgerData.payees[t.id] : null;
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
    <span class="txn-amt ${isExp ? 'exp' : 'inc'}">${isExp ? '-' : '+'}${money(t.amount)}</span>
    ${synced ? '' : '<button class="icon-btn del" title="删除" aria-label="删除"><svg><use href="#i-x"/></svg></button>'}`;
  row.classList.add(ledCatClass(t.category));
  const head = row.querySelector('b');
  head.textContent = t.note || t.category;
  row.querySelector('.txn-ic').textContent = String(t.category || '其').slice(0, 1);
  const meta = row.querySelector('.txn-meta');
  meta.innerHTML = `<span class="cat-tag">${escHtml(t.category)}</span><span>${escHtml(t.account)}</span>`;
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
  if (!confirm('确定删除这笔记录？')) return;
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

// ===== 记一笔 / 编辑记录 弹窗 =====
function syncTxnCats(extra) {
  const sel = $('#txnCatSel');
  const flow = ($('#txnForm') && $('#txnForm').flow.value) || 'expense';
  const list = ((txnCats && txnCats[flow]) || ['其他']).slice();
  if (extra && !list.includes(extra)) list.push(extra);
  if (sel) {
    const keep = sel.value;
    sel.innerHTML = list.map((c) => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');
    sel.value = list.includes(keep) ? keep : list[0];
  }
  renderCatChips();
}

function renderCatChips() {
  const box = $('#txnCatChips');
  const sel = $('#txnCatSel');
  if (!box || !sel) return;
  box.innerHTML = '';
  $$('#txnCatSel option').forEach((o) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cat-chip' + (o.value === sel.value ? ' on' : '');
    b.textContent = o.value;
    b.onclick = () => { sel.value = o.value; renderCatChips(); };
    box.appendChild(b);
  });
}

function fillTxnAccounts(current) {
  const sel = $('#txnAcctSel');
  if (!sel) return;
  const list = (ledgerData.accounts && ledgerData.accounts.length) ? ledgerData.accounts.slice() : ['默认账户'];
  if (current && !list.includes(current)) list.push(current);
  sel.innerHTML = list.map((a) => `<option value="${escHtml(a)}">${escHtml(a)}</option>`).join('');
  sel.value = current && list.includes(current) ? current : list[0];
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
    const radio = f.querySelector(`[name=flow][value="${t.flow === 'income' ? 'income' : 'expense'}"]`);
    if (radio) radio.checked = true;
    $('#txnAmount').value = String(t.amount);
    $('#txnDate').value = t.date || todayStrLocal();
    f.note.value = t.note || '';
    fillTxnAccounts(t.account);
    syncTxnCats(t.category);
    $('#txnCatSel').value = t.category;
    renderCatChips();
  } else {
    $('#txnDate').value = todayStrLocal();
    fillTxnAccounts(ledgerState.lastAccount || '默认账户');
    syncTxnCats();
  }
  syncTxnHint();
  $('#txnModal').hidden = false;
  // 桌面端自动聚焦金额（手机端不聚焦，避免键盘顶起页面）
  if (window.innerWidth > 860) setTimeout(() => { const a = $('#txnAmount'); if (a) a.focus(); }, 40);
}

function closeTxnModal() {
  const m = $('#txnModal');
  if (m) m.hidden = true;
}

function syncTxnHint() {
  const hint = $('#txnSyncHint');
  const note = $('#txnForm') && $('#txnForm').note.value.trim();
  if (hint) hint.hidden = !(note && note[0] === '@');
}

async function submitTxn(e) {
  e.preventDefault();
  const f = $('#txnForm');
  const fd = new FormData(f);
  const errEl = $('#txnFormError');
  const amount = Number(fd.get('amount'));
  if (!Number.isFinite(amount) || amount <= 0) {
    errEl.textContent = '请填写有效金额';
    errEl.hidden = false;
    return;
  }
  const id = fd.get('id');
  const account = String(fd.get('account') || '默认账户');
  ledgerState.lastAccount = account;
  try {
    const res = await api(id ? `/api/transactions/${id}` : '/api/transactions', {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        flow: fd.get('flow'), amount, category: fd.get('category'),
        date: fd.get('date'), note: fd.get('note'), account,
      }),
    });
    if (res.ok) {
      closeTxnModal();
      toast(id ? '已保存修改' : '已记账');
      markSynced();
      await renderLedger();
    } else {
      const d = await res.json().catch(() => ({}));
      errEl.textContent = d.error || '保存失败，请稍后重试';
      errEl.hidden = false;
    }
  } catch { /* 401 已处理 */ }
}

// ===== 人际关系（联系人 + 生日） =====
let contactRelations = ['家人', '亲戚', '朋友', '同事', '同学', '其他'];
let editingContactId = null;

async function renderContacts() {
  const listBox = $('#contactList');
  if (!listBox) return;
  listBox.innerHTML = '<div class="empty-hint">加载中…</div>';
  try {
    const res = await api('/api/contacts');
    const data = await res.json();
    contactRelations = data.relations || contactRelations;
    fillCalendarSel('#contactRelSel', contactRelations);
    renderContactsList(data.contacts || []);
    markSynced();
  } catch (err) {
    if (!String(err.message).includes('unauthorized')) listBox.innerHTML = '<div class="empty-hint">加载联系人失败</div>';
  }
}

function renderContactsList(list) {
  const box = $('#contactList');
  $('#contactCount').textContent = list.length ? `共 ${list.length} 人` : '';
  box.innerHTML = '';
  if (!list.length) {
    box.innerHTML = '<div class="empty-hint">还没有联系人，点右上角添加</div>';
    renderBirthdays([]);
    return;
  }
  list.forEach((c) => {
    const row = document.createElement('div');
    row.className = 'contact-row';
    const color = catColor(CAT_ORDER[c.name.length % CAT_ORDER.length]);
    row.innerHTML = `
      <span class="contact-avatar" style="background:${color}"></span>
      <div class="contact-main"><b></b><div class="contact-meta"></div></div>
      ${c.phone ? '<span class="contact-phone"></span>' : ''}`;
    row.querySelector('.contact-avatar').textContent = c.name.slice(0, 1);
    row.querySelector('b').textContent = c.name;
    const meta = row.querySelector('.contact-meta');
    meta.innerHTML =
      (c.relation ? `<span class="contact-badge">${c.relation}</span>` : '') +
      (c.showInCalendar ? '<span class="contact-badge cal">日历显示</span>' : '') +
      (c.note ? `<span>${c.note}</span>` : '');
    if (c.phone) row.querySelector('.contact-phone').textContent = c.phone;
    row.addEventListener('click', () => openContactModal(c));
    box.appendChild(row);
  });
  renderBirthdays(list);
}

// 生日卡片：60 天内 + 已勾选日历显示
function renderBirthdays(list) {
  const box = $('#bdayList');
  if (!box) return;
  const items = list
    .filter((c) => c.daysLeft !== null && (c.daysLeft <= 60 || c.showInCalendar))
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 12);
  if (!items.length) {
    box.innerHTML = '<div class="empty-hint">还没有设置生日的联系人</div>';
    return;
  }
  box.innerHTML = items
    .map((c) => {
      const soon = c.daysLeft <= 7;
      const when = c.daysLeft === 0 ? '就是今天' : `还有 ${c.daysLeft} 天`;
      const ageTxt = c.age !== null && c.age !== undefined ? ` · 满 ${c.age} 岁` : '';
      return `<div class="bday-card${c.showInCalendar ? ' in-cal' : ''}">
        <div class="bday-top"><span class="bday-name">${c.name}</span>
          <span class="bday-days${soon ? ' soon' : ''}">${when}</span></div>
        <div class="bd">下次生日 <b>${c.nextBirthday}</b>${ageTxt}</div>
        ${c.showInCalendar ? '<div class="bd" style="font-size:11px">已同步到日历</div>' : ''}
      </div>`;
    })
    .join('');
}

function openContactModal(c) {
  editingContactId = c ? c.id : null;
  const f = $('#contactForm');
  f.reset();
  $('#contactModalTitle').textContent = c ? '编辑联系人' : '添加联系人';
  $('#contactFormError').hidden = true;
  $('#contactDeleteBtn').hidden = !c;
  if (c) {
    f.name.value = c.name;
    f.relation.value = c.relation || '';
    f.birthday.value = c.birthday || '';
    f.phone.value = c.phone || '';
    f.note.value = c.note || '';
    f.showInCalendar.checked = !!c.showInCalendar;
  }
  $('#contactModal').hidden = false;
}
function closeContactModal() { $('#contactModal').hidden = true; }

// ===== 导航切换 =====
// keepTab：从子菜单进入个人中心时，保留已选中的子页，不强制回到默认页
function switchView(name, opts = {}) {
  const target = $('#view-' + name);
  if (!target) return;
  $$('.view').forEach((v) => v.classList.remove('active'));
  target.classList.add('active');
  $$('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.nav === name));
  $$('.mobile-nav > button, .mnav-profile > button').forEach((n) =>
    n.classList.toggle('active', n.dataset.nav === name)
  );
  if (name === 'growth') renderGrowth();
  if (name === 'settings') {
    renderSettings();
    switchProfileTab(opts.keepTab ? currentProfileTab : 'site');
  }
  if (name === 'calendar') loadCalEvents();
  if (name === 'todos') renderTodos();
  if (name === 'ledger') renderLedger();
  if (name === 'medicine' && window.medRenderMedicine) window.medRenderMedicine();
  if (name === 'relations') { if (window.pfLoadList) pfLoadList(); }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
document.addEventListener('click', (e) => {
  const navEl = e.target.closest('[data-nav]');
  // 移动端「我的」按钮只负责弹子菜单，不直接切视图（由它自己的监听器处理）
  if (navEl && navEl.id !== 'profileBtnMobile') {
    switchView(navEl.dataset.nav);
  }
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

function checkinCard(h) {
  const el = document.createElement('div');
  el.className = 'checkin-card';
  const cat = `<span class="cat-tag" style="background:${catTint(h.color)};color:${catColor(h.color)}">${h.category}</span>`;
  let sub, actions;
  if (h.type === 'sleep') {
    sub = `目标 ${h.bed_time || '--:--'} 前睡 / ${h.rise_time || '--:--'} 前起 / ${h.nap_time || '--:--'} 午睡`;
    const parts = [['bed', '早睡', h.today.done_bed], ['rise', '早起', h.today.done_rise], ['nap', '午睡', h.today.done_nap]];
    actions = parts.map((p) => `<button class="chk-btn ${p[2] ? 'on' : ''}" data-id="${h.id}" data-field="${p[0]}">${p[1]}</button>`).join('');
  } else if (h.method === 'duration') {
    // 按时间打卡：快捷按钮与输入框都跟随所选单位（秒/分钟/小时）
    const UNIT_STEPS = { 秒: [10, 20, 30], 分钟: [15, 30, 60], 小时: [1, 2, 3] };
    const steps = UNIT_STEPS[h.unit] || UNIT_STEPS['分钟'];
    sub = `按时间打卡 · 目标 ${h.target} ${h.unit}`;
    const cur = h.today.done || 0;
    const pct = h.target > 0 ? Math.min(100, Math.round((cur / h.target) * 100)) : 0;
    actions = `
      <div class="dur-control">
        <div class="dur-progress"><i style="width:${pct}%"></i><span>${cur} / ${h.target} ${h.unit}</span></div>
        <div class="dur-quick">
          ${steps.map((s) => `<button class="chip" data-id="${h.id}" data-val="${s}">+${s}</button>`).join('')}
        </div>
        <div class="dur-input">
          <input type="number" min="1" value="10" class="dur-min" data-id="${h.id}" aria-label="${h.unit}">
          <span>${h.unit}</span>
          <button class="chk-btn" data-id="${h.id}" data-field="done" data-input="1">记录</button>
        </div>
      </div>`;
  } else {
    sub = `按次打卡 · 目标 ${h.target} ${h.unit}`;
    actions = `
      <div class="count-control">
        <button class="chk-btn round" data-id="${h.id}" data-field="done" data-dec="1" aria-label="减少">−</button>
        <span class="cnt">${h.today.done || 0}<i> / ${h.target} ${h.unit}</i></span>
        <button class="chk-btn" data-id="${h.id}" data-field="done" data-inc="1">打卡 +1</button>
      </div>`;
  }
  el.innerHTML = `
    <div class="ci-main">
      <span class="ci-icon" style="background:${catTint(h.color)};color:${catColor(h.color)}"><svg><use href="#i-${h.icon}"/></svg></span>
      <div class="ci-text"><b></b><small>${cat} ${sub}</small></div>
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
      prog = `今日 ${h.today.done || 0} / ${h.target} ${h.unit}`;
    }
    const typeTag = h.type === 'sleep' ? ' · 睡眠' : (h.method === 'duration' ? ' · 按时长' : ' · 按次');
    el.innerHTML = `
      <div class="hc-top">
        <span class="ci-icon" style="background:${catTint(h.color)};color:${catColor(h.color)}"><svg><use href="#i-${h.icon}"/></svg></span>
        <div class="hc-meta"><b></b><small>${h.category}${typeTag}</small></div>
        <button class="icon-btn edit" data-id="${h.id}" title="编辑" aria-label="编辑"><svg><use href="#i-edit"/></svg></button>
        <button class="icon-btn del" data-id="${h.id}" title="删除" aria-label="删除"><svg><use href="#i-x"/></svg></button>
      </div>
      <div class="hc-prog">${prog}</div>`;
    el.querySelector('b').textContent = h.name;
    el.querySelector('.edit').addEventListener('click', () => editHabit(h.id));
    el.querySelector('.del').addEventListener('click', () => deleteHabit(h.id, h.name));
    box.appendChild(el);
  });
}

async function deleteHabit(id, name) {
  if (!confirm(`确定删除习惯「${name}」？其打卡记录也会一并清除。`)) return;
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
  $('#habitFormError').hidden = true;
  $('#habitModal').hidden = false;
}

function closeHabitModal() { $('#habitModal').hidden = true; }
function showHabitFormError(msg) { const el = $('#habitFormError'); el.textContent = msg; el.hidden = false; }

$('#addHabitBtn').addEventListener('click', openHabitModal);
$('#habitModalClose').addEventListener('click', closeHabitModal);
$('#habitModal').addEventListener('click', (e) => { if (e.target === $('#habitModal')) closeHabitModal(); });
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

$('#habitForm').addEventListener('submit', async (e) => {
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
const PROFILE_TITLES = { site: '站点信息', style: '主题风格', data: '数据处理', security: '账户安全', sysinfo: '系统信息' };

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
  if (!confirm('确定登出该设备？该设备上的登录将立即失效。')) return;
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

/** 下载全部数据备份：走后端附件流，避免把大数据塞进 JS 内存做字符串拼接 */
async function exportAllData() {
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

$('#saveSettingsBtn').addEventListener('click', async () => {
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

$('#logoutBtn2').addEventListener('click', doLogout);

// ===== 修改密码弹窗交互 =====
// 注意：app.js 末尾的绑定都是直连 DOM，任一元素缺失就会中断后续初始化
// （曾因预览页 HTML 快照早于 index.html，导致 #changePassBtn 为 null 而整段失败），此处统一加空值保护。
function bind(sel, type, fn) {
  const el = $(sel);
  if (el) el.addEventListener(type, fn);
}
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
$('#exportDataBtn').addEventListener('click', exportAllData);
$('#refreshDataBtn').addEventListener('click', renderDataPage);
$('#ackBackup').addEventListener('change', (e) => {
  const cb = $('#clearDataBtn');
  if (cb) cb.disabled = !e.target.checked;
});
$('#clearDataBtn').addEventListener('click', openClearModal);
$('#clearModalClose').addEventListener('click', closeClearModal);
$('#clearCancelBtn').addEventListener('click', closeClearModal);
$('#clearModal').addEventListener('click', (e) => { if (e.target === $('#clearModal')) closeClearModal(); });
$('#clearConfirmInput').addEventListener('input', (e) => {
  const cb = $('#clearConfirmBtn');
  if (cb) cb.disabled = e.target.value.trim() !== '清空';
});
$('#clearConfirmBtn').addEventListener('click', confirmClearData);

// ===== 个人中心子菜单（唯一入口） =====
// 记住当前选中的子页，从子菜单进入时不被 switchView 重置
let currentProfileTab = 'site';
function switchProfileTab(name) {
  const tab = name && PROFILE_TITLES[name] ? name : 'site';
  currentProfileTab = tab;
  $$('.profile-page').forEach((p) => p.classList.toggle('active', p.id === 'page-' + tab));
  if (tab === 'data') renderDataPage();
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
$('#calPrev').addEventListener('click', () => calShift(-1));
$('#calNext').addEventListener('click', () => calShift(1));
$('#calToday').addEventListener('click', () => { calState.anchor = new Date(); initCalPicker(); loadCalEvents(); });
$('#calMonth').addEventListener('change', applyCalPicker);
$('#calYear').addEventListener('change', applyCalPicker);
$('#calYear').addEventListener('blur', applyCalPicker);
$('#addEventBtn').addEventListener('click', () => openEventModal(null));
$('#eventModalClose').addEventListener('click', closeEventModal);
$('#eventModal').addEventListener('click', (e) => { if (e.target === $('#eventModal')) closeEventModal(); });
$('#eventForm').addEventListener('submit', async (e) => {
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
  }
});
// 删除事件
$('#eventDeleteBtn').addEventListener('click', async () => {
  if (!editingEventId) return;
  if (!confirm('确定删除该日程？')) return;
  const res = await api(`/api/events?id=${editingEventId}`, { method: 'DELETE' }).catch(() => null);
  if (res && res.ok) { closeEventModal(); toast('已删除'); markSynced(); loadCalEvents(); }
});
// 双击事件块也能删除
document.addEventListener('dblclick', (e) => {
  const ev = e.target.closest('[data-evid]');
  if (!ev) return;
  const id = Number(ev.dataset.evid);
  if (!confirm('确定删除该日程？')) return;
  api(`/api/events?id=${id}`, { method: 'DELETE' }).then((r) => {
    if (r.ok) { toast('已删除'); markSynced(); loadCalEvents(); }
  }).catch(() => {});
});

// ===== 待办交互 =====
$('#addTodoBtn').addEventListener('click', () => {
  const f = $('#todoForm');
  f.reset();
  f.date.value = todayStrLocal();
  $('#todoFormError').hidden = true;
  $('#todoModal').hidden = false;
});
$('#enableNotifyBtn').addEventListener('click', enableTodoNotify);
$('#todoModalClose').addEventListener('click', () => { $('#todoModal').hidden = true; });
$('#todoModal').addEventListener('click', (e) => { if (e.target === $('#todoModal')) $('#todoModal').hidden = true; });
$('#todoForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const title = String(fd.get('title') || '').trim();
  if (!title) { const el = $('#todoFormError'); el.textContent = '请填写内容'; el.hidden = false; return; }
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
    if (res.ok) { $('#todoModal').hidden = true; toast('已添加待办'); markSynced(); await renderTodos(); }
  } catch { /* 401 已处理 */ }
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

// 支出/收入 切换 → 分类下拉跟着换
$$('#txnForm [name=flow]').forEach((r) =>
  r.addEventListener('change', () => { if (!editingTxnId) syncTxnCats(); else syncTxnCats($('#txnCatSel').value); })
);
// 备注以 @ 开头 → 提示与「人际关系」联动
bind('#txnForm', 'input', (e) => { if (e.target && e.target.name === 'note') syncTxnHint(); });

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

// ===== 人际关系交互 =====
$('#addContactBtn').addEventListener('click', () => openContactModal(null));
$('#contactModalClose').addEventListener('click', closeContactModal);
$('#contactModal').addEventListener('click', (e) => { if (e.target === $('#contactModal')) closeContactModal(); });
$('#contactDeleteBtn').addEventListener('click', async () => {
  if (!editingContactId) return;
  if (!confirm('确定删除该联系人？')) return;
  const res = await api(`/api/contacts/${editingContactId}`, { method: 'DELETE' }).catch(() => null);
  if (res && res.ok) { closeContactModal(); toast('已删除'); markSynced(); pfLoadList(); }
});
$('#contactForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const fd = new FormData(f);
  const name = String(fd.get('name') || '').trim();
  if (!name) { const el = $('#contactFormError'); el.textContent = '请填写姓名'; el.hidden = false; return; }
  const payload = {
    name, relation: fd.get('relation'), birthday: fd.get('birthday'),
    phone: fd.get('phone'), note: fd.get('note'),
    showInCalendar: f.showInCalendar.checked,
  };
  try {
    const url = editingContactId ? '/api/contacts' : '/api/contacts';
    const res = await api(url, {
      method: editingContactId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingContactId ? { ...payload, id: editingContactId } : payload),
    });
    if (res.ok) {
      closeContactModal();
      toast(editingContactId ? '已更新' : '已添加联系人');
      markSynced();
      pfLoadList();
    }
  } catch { /* 401 已处理 */ }
});

// ===== PWA =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./js/sw.js').catch(() => {}));
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
