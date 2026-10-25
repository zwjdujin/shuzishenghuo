// v0.5.17 保持联系迁列表 + 档案页头精简 UI 验证
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
// 种子：清空所有人联系节奏（隔离历史演示数据）
{
  const lr = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: 'admin', pass: 'test-pass-123' }) });
  const cookie = (lr.headers.get('set-cookie') || '').split(';')[0];
  const list = await (await fetch(BASE + '/api/profile/list', { headers: { cookie } })).json();
  for (const p of (list.list || []).filter((x) => x.touchCadence > 0)) {
    await fetch(BASE + '/api/profile/touch', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ id: p.id, cadence: 0 }) });
  }
}

// ---- 桌面 ----
{
  const { ctx, page } = await newPage(1280, 820, 'rel17-d');
  await page.evaluate(() => document.querySelector('.nav-item[data-nav=relations]').click());
  await page.waitForTimeout(2200);
  let r = await page.evaluate(() => ({
    ctls: document.querySelectorAll('.rel-touch').length,
    sels: document.querySelectorAll('.rel-touch-sel').length,
    nows: document.querySelectorAll('[data-pf-now]').length,
  }));
  check('列表行内出现节奏下拉 + 打卡按钮', r.ctls >= 3 && r.sels === r.ctls && r.nows === r.ctls, JSON.stringify(r));

  // 设节奏：第一行选「7天」→ 本地持久化
  await page.evaluate(() => { const s = document.querySelector('.rel-touch-sel'); s.value = '7'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(900);
  r = await page.evaluate(async () => {
    const list = await (await fetch('/api/profile/list', { credentials: 'include' })).json();
    return (list.list || []).filter((x) => x.touchCadence === 7).length;
  });
  check('节奏下拉生效（7 天持久化）', r === 1, r);

  // 打卡：点「✓今天联系过」→ lastTouched = 今天
  await page.evaluate(() => { document.querySelector('[data-pf-now]').click(); });
  await page.waitForTimeout(900);
  r = await page.evaluate(async () => {
    const list = await (await fetch('/api/profile/list', { credentials: 'include' })).json();
    const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    return (list.list || []).filter((x) => x.touchCadence === 7 && x.lastTouched === today).length;
  });
  check('打卡生效（lastTouched=今天）', r === 1, r);

  // 行内点击控件不会误开档案：点下拉本身
  await page.evaluate(() => document.querySelector('.rel-touch-sel').click());
  await page.waitForTimeout(500);
  r = await page.evaluate(() => document.getElementById('relProfileView').hidden);
  check('点下拉不跳转档案页', r === true);

  // 点行其他区域 → 档案页；页头 3 按钮、无 pfTouchBox
  await page.evaluate(() => { document.querySelector('.rel-row .rel-row-main').click(); });
  await page.waitForTimeout(1600);
  r = await page.evaluate(() => ({
    profileShown: !document.getElementById('relProfileView').hidden,
    headerBtns: [...document.querySelectorAll('#relProfileView .growth-head .cal-actions .btn')].map((b) => b.id || b.textContent.trim()),
    touchGone: !document.getElementById('pfTouchBox'),
  }));
  check('点行打开档案', r.profileShown);
  check('档案页头仅 3 按钮（返回/删除/编辑）', r.headerBtns.length === 3 && r.headerBtns.includes('pfBack') && r.headerBtns.includes('pfDelete') && r.headerBtns.includes('pfEditBtn'), r.headerBtns.join(','));
  check('页头无联系节奏控件', r.touchGone);
  // 长文案在桌面（可见性断言，textContent 含隐藏元素文本不作数）
  r = await page.evaluate(() => {
    const back = document.getElementById('pfBack');
    return {
      longShown: getComputedStyle(back.querySelector('.btn-long')).display !== 'none',
      shortHidden: getComputedStyle(back.querySelector('.btn-short')).display === 'none',
    };
  });
  check('桌面显示「← 返回列表」长文案', r.longShown && r.shortHidden);
  await page.screenshot({ path: `${OUT}/rel17-profile-d.jpg`, type: 'jpeg', quality: 62 });
  console.log('📷 rel17-profile-d');
  await ctx.close();

  // 清理节奏设置
  const lr = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: 'admin', pass: 'test-pass-123' }) });
  const cookie = (lr.headers.get('set-cookie') || '').split(';')[0];
  const list = await (await fetch(BASE + '/api/profile/list', { headers: { cookie } })).json();
  for (const p of (list.list || []).filter((x) => x.touchCadence === 7)) {
    await fetch(BASE + '/api/profile/touch', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ id: p.id, cadence: 0 }) });
  }
}

// ---- 手机 390 ----
{
  const { ctx, page } = await newPage(390, 844, 'rel17-m');
  await page.goto(BASE + '/#/relations', { waitUntil: 'load' });
  await page.waitForTimeout(2200);
  let r = await page.evaluate(() => ({
    noH: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ctls: document.querySelectorAll('.rel-touch').length,
  }));
  check('手机端列表行控件渲染无溢出', r.noH && r.ctls >= 3, r.ctls);
  // 打开档案 → 按钮精简
  await page.evaluate(() => { document.querySelector('.rel-row .rel-row-main').click(); });
  await page.waitForTimeout(1600);
  r = await page.evaluate(() => {
    const back = document.getElementById('pfBack');
    const edit = document.getElementById('pfEditBtn');
    const ico = edit.querySelector('svg.btn-ico-long');
    const headBtns = [...document.querySelectorAll('#relProfileView .growth-head .cal-actions .btn')];
    return {
      backLongHidden: getComputedStyle(back.querySelector('.btn-long')).display === 'none',
      backShortShown: getComputedStyle(back.querySelector('.btn-short')).display !== 'none',
      editLongHidden: getComputedStyle(edit.querySelector('.btn-long')).display === 'none',
      editShortShown: getComputedStyle(edit.querySelector('.btn-short')).display !== 'none',
      icoHidden: ico ? getComputedStyle(ico).display === 'none' : true,
      threeBtns: headBtns.length === 3,
      touchGone: !document.getElementById('pfTouchBox'),
    };
  });
  check('手机端「返回」短文案显示', r.backShortShown && r.backLongHidden);
  check('手机端「编辑」短文案显示 + 去图标', r.editShortShown && r.editLongHidden && r.icoHidden);
  check('手机端页头 3 按钮且无节奏控件', r.threeBtns && r.touchGone);
  await page.screenshot({ path: `${OUT}/rel17-profile-m.jpg`, type: 'jpeg', quality: 62 });
  console.log('📷 rel17-profile-m');
  await ctx.close();
}

check('全程无 pageerror', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(ok.join('\n'));
if (fail.length) { console.log('\n' + fail.join('\n')); process.exit(1); }
console.log('\n✅ ' + ok.length + ' 项全部通过');
