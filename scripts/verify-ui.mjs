// v0.5.5 UI 验证脚本（playwright-core + 本地 Edge 无头）：双视口 / hash 路由 / confirmModal / 删除全流程
// 前置：本地 wrangler pages dev :8799 + .dev.vars（admin/test-pass-123）
import { chromium } from 'file:///C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://127.0.0.1:8799/';
const OUT = 'C:/Users/Administrator/.zcode/v2/visualizations/ef406d1159ea31634c951dd707045e06503eae2363f1aeda9a0598f374ecc88e';

const ok = [];
const fail = [];
const check = (name, cond, extra = '') => (cond ? ok : fail).push((cond ? '✓ ' : '✗ ') + name + (extra ? '  → ' + extra : ''));

const log = (m) => console.log('[进度]', m);
const browser = await chromium.launch({ executablePath: EDGE, headless: true });

// ---------- 桌面 1280 ----------
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
log('打开首页');
await page.goto(BASE, { waitUntil: 'load' });
await page.waitForTimeout(1800);

const boot = await page.evaluate(() => ({
  splashHidden: (document.getElementById('bootSplash') || {}).hidden,
  loginHidden: (document.getElementById('loginOverlay') || {}).hidden,
  shellHidden: (document.getElementById('appShell') || {}).hidden,
  fatal: !!document.getElementById('fatalBanner'),
  css: getComputedStyle(document.querySelector('.login-card') || document.body).borderRadius,
}));
check('启动后骨架隐藏', boot.splashHidden === true, JSON.stringify(boot));
check('无会话→显示登录页（而非骨架卡死）', boot.loginHidden === false);
check('无页面错误', errs.length === 0, errs.join(' | '));

log('登录');
await page.fill('#loginForm input[name=user]', 'admin');
await page.fill('#loginForm input[name=pass]', 'test-pass-123');
await page.click('#loginForm button[type=submit]');
await page.waitForTimeout(1800);
const logged = await page.evaluate(() => ({
  shell: !document.getElementById('appShell').hidden,
  ver: (document.getElementById('versionText') || {}).textContent,
  fatal: !!document.getElementById('fatalBanner'),
}));
check('登录成功进入应用', logged.shell === true);
check('版本号 v0.5.5', logged.ver === 'v0.5.5', logged.ver);
check('登录后无页面错误', errs.length === 0, errs.join(' | '));
await page.screenshot({ path: OUT + '/v055-desktop-home.png' });

// hash 路由：点导航 → hash 变化
log('点成长打卡');
await page.click('button.nav-item[data-nav="growth"]');
await page.waitForTimeout(900);
const h1 = await page.evaluate(() => location.hash);
check('点成长打卡 → hash=#/growth', h1 === '#/growth', h1);

// 浏览器返回 → 回首页视图（TWA 返回键不再退出应用的核心验证）
await page.evaluate(() => history.back());
await page.waitForTimeout(900);
log('history.back 完成');
const back = await page.evaluate(() => ({
  hash: location.hash,
  homeActive: document.getElementById('view-home').classList.contains('active'),
  growthActive: document.getElementById('view-growth').classList.contains('active'),
}));
check('浏览器返回 → 回到首页视图', back.homeActive === true && back.growthActive === false, JSON.stringify(back));

// 深链：直接打开 #/todos
log('深链 #/todos');
await page.goto(BASE + '#/todos', { waitUntil: 'load' });
await page.waitForTimeout(1200);
const deep = await page.evaluate(() => ({
  todosActive: document.getElementById('view-todos').classList.contains('active'),
  hash: location.hash,
}));
check('深链 #/todos 直达待办页', deep.todosActive === true, JSON.stringify(deep));

// confirmModal：应弹自绘弹窗而非原生 confirm
log('confirmModal 直接验证');
const confirmRes = await page.evaluate(() => {
  const p = confirmModal('验证确认弹窗');
  const m = document.getElementById('confirmModal');
  const visible = m && !m.hidden;
  document.getElementById('confirmOkBtn').click();
  return p.then((v) => ({ visible, v }));
});
check('confirmModal 自绘弹窗 + 确定返回 true', confirmRes.visible === true && confirmRes.v === true, JSON.stringify(confirmRes));

// 真实删除流程走自绘确认：加一条待办再删
await page.evaluate(() => {
  return fetch('/api/todos', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ title: window.__delTitle = '删除验证' + Date.now(), date: '2026-10-25', list: '生活', priority: 'P2' }) }).then(r => r.json());
});
const delTitle = await page.evaluate(() => window.__delTitle);
log('待删标题: ' + delTitle);
await page.reload({ waitUntil: 'load' });
await page.goto(BASE + '#/todos', { waitUntil: 'load' });
await page.waitForTimeout(1200);
log('删除流程验证');
const delFlow = await page.evaluate(async (t) => {
  const orig = window.fetch;
  window.__reqs = [];
  window.fetch = function (u, o) { window.__reqs.push(String(u) + ' ' + ((o && o.method) || 'GET')); return orig.apply(this, arguments); };
  const rows = Array.from(document.querySelectorAll('#view-todos .todo-row'));
  console.log('找行: t=' + t + ' 共' + rows.length + '行 首行=' + (rows[0] ? rows[0].querySelector('b').textContent : '无'));
  const row = rows.find((r) => (r.querySelector('b') || {}).textContent === t && r.querySelector('.del'));
  if (!row) return { step: 'row-not-found' };
  row.querySelector('.del').click();
  await new Promise((r) => setTimeout(r, 300));
  const m = document.getElementById('confirmModal');
  const shown = m && !m.hidden;
  if (shown) document.getElementById('confirmOkBtn').click();
  await new Promise((r) => setTimeout(r, 1500));
  const still = Array.from(document.querySelectorAll('#view-todos .todo-row b')).some((b) => b.textContent === t);
  return { shown, still, reqs: window.__reqs };
}, delTitle);
check('删除待办走自绘确认且删除成功', delFlow.shown === true && delFlow.still === false, JSON.stringify(delFlow));

// Esc 关闭弹窗
log('Esc 验证');
const esc = await page.evaluate(async () => {
  const p = confirmModal('Esc 测试');
  await new Promise((r) => setTimeout(r, 200));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  const v = await p;
  return { v, hidden: document.getElementById('confirmModal').hidden };
});
check('Esc 关闭确认弹窗（resolve false）', esc.v === false && esc.hidden === true, JSON.stringify(esc));

check('全流程无页面错误', errs.length === 0, errs.slice(0, 3).join(' | '));

// ---------- 手机 390 ----------
console.log('桌面段检查结果：');
console.log(ok.join('\n'));
if (fail.length) console.log(fail.join('\n'));
log('创建手机上下文');
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const mpage = await mctx.newPage();
const merrs = [];
mpage.on('pageerror', (e) => merrs.push('PAGEERROR: ' + e.message));
log('手机端打开首页');
await mpage.goto(BASE, { waitUntil: 'load' });
await mpage.waitForTimeout(1500);
log('手机端登录');
await mpage.fill('#loginForm input[name=user]', 'admin');
await mpage.fill('#loginForm input[name=pass]', 'test-pass-123');
await mpage.click('#loginForm button[type=submit]');
await mpage.waitForTimeout(1800);
log('手机端验证');
const mob = await mpage.evaluate(() => ({
  navVisible: (() => { const n = document.querySelector('.mobile-nav'); return n && getComputedStyle(n).display !== 'none'; })(),
  noHScroll: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  fatal: !!document.getElementById('fatalBanner'),
  ver: (document.getElementById('versionText') || {}).textContent,
}));
check('手机端底部导航显示', mob.navVisible === true);
check('手机端无横向滚动', mob.noHScroll === true);
check('手机端版本 v0.5.5', mob.ver === 'v0.5.5', mob.ver);
check('手机端无页面错误', merrs.length === 0, merrs.join(' | '));
await mpage.screenshot({ path: OUT + '/v055-mobile-home.png' });

// 手机端 hash 路由 + 人际关系页
await mpage.evaluate(() => { const b = document.querySelector('.mobile-nav > button[data-nav=relations]'); if (b) b.click(); });
await mpage.waitForTimeout(1200);
log('手机端人际页');
const mrel = await mpage.evaluate(() => ({
  hash: location.hash,
  relActive: document.getElementById('view-relations').classList.contains('active'),
  noHScroll: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
}));
check('手机端人际页 hash=#/relations 且无横向滚动', mrel.relActive && mrel.hash === '#/relations' && mrel.noHScroll, JSON.stringify(mrel));
await mpage.screenshot({ path: OUT + '/v055-mobile-relations.png' });

await browser.close();
console.log(ok.join('\n'));
if (fail.length) { console.log('\n' + fail.join('\n')); console.log('\n❌ ' + fail.length + ' 项失败'); process.exit(1); }
console.log('\n✅ 全部 ' + ok.length + ' 项通过');
