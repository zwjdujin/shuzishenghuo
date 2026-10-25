// v0.5.16 三处界面修复验证
import { chromium } from 'file:///C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = 'http://127.0.0.1:8799';
const OUT = 'C:/Users/Administrator/.zcode/v2/visualizations/ef406d1159ea31634c951dd707045e06503eae2363f1aeda9a0598f374ecc88e/_p3img';
const ok = [], fail = [];
const check = (n, c, e = '') => (c ? ok : fail).push((c ? '✓ ' : '✗ ') + n + (e ? ' → ' + e : ''));

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const errors = [];
async function newPage(w, h, tag) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(tag + ': ' + e.message.slice(0, 100)));
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  if (await page.evaluate(() => !document.getElementById('loginOverlay').hidden)) {
    await page.fill('#loginForm input[name=user]', 'admin');
    await page.fill('#loginForm input[name=pass]', 'test-pass-123');
    await page.click('#loginForm button[type=submit]');
    await page.waitForTimeout(2000);
  }
  return { ctx, page };
}

// ---- 手机 390：档案尺码 + 首页速览 + 待办标题 ----
{
  const { ctx, page } = await newPage(390, 844, 'fix16-m');
  // 1. 档案页尺码无越界
  await page.goto(BASE + '/#/relations/8', { waitUntil: 'load' });
  await page.waitForTimeout(2600);
  let r = await page.evaluate(() => {
    const panel = document.getElementById('pfBody').closest('.panel');
    const pr = panel.getBoundingClientRect();
    const out = [];
    document.querySelectorAll('.pf-size-grid, .pf-size-grid *').forEach((el) => {
      const er = el.getBoundingClientRect();
      if (er.width && er.height && er.right > pr.right + 1) out.push(el.tagName + ' 越界' + Math.round(er.right - pr.right) + 'px');
    });
    const inp = document.querySelector('.pf-size-grid input');
    return { out: out.slice(0, 4), inpW: inp ? Math.round(inp.getBoundingClientRect().width) : 0, noH: document.documentElement.scrollWidth <= document.documentElement.clientWidth };
  });
  check('尺码输入框无越界（4 输入框宽度 ≤ 列宽）', r.out.length === 0 && r.inpW <= 200, `inp=${r.inpW}px ${r.out.join(',')}`);
  check('档案页无横向滚动', r.noH);
  await page.evaluate(() => { const el = document.querySelector('.pf-size-grid'); if (el) el.scrollIntoView({ block: 'center' }); });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/fix16-size-m.jpg`, type: 'jpeg', quality: 62 });
  console.log('📷 fix16-size-m');

  // 2. 首页模块速览：2 列 + 每项单行
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  r = await page.evaluate(() => {
    const grid = document.getElementById('moduleGlance');
    const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
    const items = [...grid.querySelectorAll('.glance-item b')];
    const lh = items.length ? parseFloat(getComputedStyle(items[0]).lineHeight) : 18;
    return { cols, names: items.map((b) => b.textContent), twoLine: items.filter((b) => b.offsetHeight > lh * 1.6).length };
  });
  check('模块速览手机端 2 列', r.cols === 2, r.cols);
  check('模块名称全部单行', r.twoLine === 0, r.names.join(',') + ' | 折行 ' + r.twoLine + ' 个');

  // 3. 今日总览金额防折行（长金额模拟）
  r = await page.evaluate(() => {
    const led = document.getElementById('stLedger');
    const old = led.textContent;
    led.textContent = '¥123,456';
    const lh = parseFloat(getComputedStyle(led).lineHeight) || 20;
    const two = led.offsetHeight > lh * 1.6;
    led.textContent = old;
    return { h: led.offsetHeight, two };
  });
  check('长金额不折行（¥123,456）', !r.two, 'h=' + r.h);

  // 4. 待办标题
  await page.goto(BASE + '/#/todos', { waitUntil: 'load' });
  await page.waitForTimeout(1600);
  r = await page.evaluate(() => document.querySelector('#view-todos .growth-head h2').textContent);
  check('待办页标题为「今日待办」', r === '今日待办', r);
  await page.screenshot({ path: `${OUT}/fix16-todos-m.jpg`, type: 'jpeg', quality: 62 });
  console.log('📷 fix16-todos-m');
  await ctx.close();
}

// ---- 桌面 1280：确认未破坏 ----
{
  const { ctx, page } = await newPage(1280, 820, 'fix16-d');
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  let r = await page.evaluate(() => {
    const grid = document.getElementById('moduleGlance');
    return { cols: getComputedStyle(grid).gridTemplateColumns.split(' ').length, names: grid.querySelectorAll('.glance-item b').length };
  });
  check('桌面速览仍 3 列', r.cols === 3 && r.names >= 6, r.cols);
  await page.goto(BASE + '/#/relations/8', { waitUntil: 'load' });
  await page.waitForTimeout(2400);
  r = await page.evaluate(() => {
    const panel = document.getElementById('pfBody').closest('.panel');
    const pr = panel.getBoundingClientRect();
    let out = 0;
    document.querySelectorAll('.pf-size-grid input').forEach((el) => { if (el.getBoundingClientRect().right > pr.right + 1) out++; });
    return out;
  });
  check('桌面尺码输入框无越界', r === 0, r);
  await ctx.close();
}

check('全程无 pageerror', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(ok.join('\n'));
if (fail.length) { console.log('\n' + fail.join('\n')); process.exit(1); }
console.log('\n✅ ' + ok.length + ' 项全部通过');
