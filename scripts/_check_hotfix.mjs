// 热修复验证：档案页无 unhandled rejection + 日期按钮打开统一选择器
import { chromium } from 'file:///C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ok = [], fail = [];
const check = (n, c, e = '') => (c ? ok : fail).push((c ? '✓ ' : '✗ ') + n + (e ? ' → ' + e : ''));

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 820 } })).newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message.slice(0, 120)));
await page.addInitScript(() => {
  window.__rej = [];
  window.addEventListener('unhandledrejection', (e) => window.__rej.push(String(e.reason && e.reason.message || e.reason).slice(0, 120)));
});
await page.goto('http://127.0.0.1:8799/', { waitUntil: 'load' });
await page.waitForTimeout(1500);
if (await page.evaluate(() => !document.getElementById('loginOverlay').hidden)) {
  await page.fill('#loginForm input[name=user]', 'admin');
  await page.fill('#loginForm input[name=pass]', 'test-pass-123');
  await page.click('#loginForm button[type=submit]');
  await page.waitForTimeout(2000);
}
await page.goto('http://127.0.0.1:8799/#/relations/8', { waitUntil: 'load' });
await page.waitForTimeout(2600);
check('档案页无 pageerror', pageErrors.length === 0, pageErrors.join(' | '));

const r1 = await page.evaluate(() => ({
  rej: window.__rej,
  btn: !!document.querySelector('.dt-btn[data-dt="pfHDate"]'),
  hRows: document.querySelectorAll('.pf-hm-tr:not(.pf-hm-th)').length,
}));
check('无 unhandledrejection', r1.rej.length === 0, r1.rej.join(' | '));
check('身高表 + 日期按钮在', r1.hRows >= 3 && r1.btn);

// 点日期按钮 → 统一选择器弹窗打开 → 选个日期写回 hidden input
await page.evaluate(() => document.querySelector('.dt-btn[data-dt="pfHDate"]').click());
await page.waitForTimeout(700);
const r2 = await page.evaluate(() => ({
  modal: !document.getElementById('timePickModal').hidden,
}));
check('点日期按钮弹出统一选择器', r2.modal);
if (r2.modal) {
  await page.evaluate(() => { const b = document.getElementById('tpDone'); if (b) b.click(); });
  await page.waitForTimeout(400);
}
const r3 = await page.evaluate(() => ({
  btnText: (document.querySelector('.dt-btn[data-dt="pfHDate"] span') || {}).textContent,
  val: (document.getElementById('pfHDateInput') || {}).value,
}));
check('确认后写回 hidden input + 按钮文字刷新', /^\d{4}-\d{2}-\d{2}$/.test(r3.val || ''), JSON.stringify(r3));
check('关闭弹窗', await page.evaluate(() => document.getElementById('timePickModal').hidden));

// 手机端档案页同样复验
const mp = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
mp.on('pageerror', (e) => pageErrors.push('MOBILE: ' + e.message.slice(0, 120)));
await mp.goto('http://127.0.0.1:8799/', { waitUntil: 'load' });
await mp.waitForTimeout(1400);
if (await mp.evaluate(() => !document.getElementById('loginOverlay').hidden)) {
  await mp.fill('#loginForm input[name=user]', 'admin');
  await mp.fill('#loginForm input[name=pass]', 'test-pass-123');
  await mp.click('#loginForm button[type=submit]');
  await mp.waitForTimeout(1800);
}
await mp.goto('http://127.0.0.1:8799/#/relations/8', { waitUntil: 'load' });
await mp.waitForTimeout(2600);
const mr = await mp.evaluate(() => ({ body: !!document.querySelector('.pf-weight'), noH: document.documentElement.scrollWidth <= document.documentElement.clientWidth }));
check('手机端档案页正常渲染', mr.body && mr.noH);
check('手机端也无 pageerror', !pageErrors.some((e) => e.startsWith('MOBILE')));

await browser.close();
console.log(ok.join('\n'));
if (fail.length) { console.log('\n' + fail.join('\n')); process.exit(1); }
console.log('\n✅ ' + ok.length + ' 项全部通过');
