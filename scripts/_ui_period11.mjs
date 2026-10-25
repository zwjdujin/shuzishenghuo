// v0.5.11 经期扩展 UI 双端验证（含纵向溢出断言 + 新表单全流程）
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

// 幂等种子：2 条闭合经期
{
  const lr = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: 'admin', pass: 'test-pass-123' }) });
  const cookie = (lr.headers.get('set-cookie') || '').split(';')[0];
  const H = { 'Content-Type': 'application/json', cookie };
  const cur = await (await fetch(BASE + '/api/period', { headers: { cookie } })).json();
  for (const l of cur.logs || []) await fetch(BASE + '/api/period?id=' + l.id, { method: 'DELETE', headers: { cookie } });
  await fetch(BASE + '/api/period', { method: 'POST', headers: H, body: JSON.stringify({ start_date: '2026-09-03', end_date: '2026-09-07', flow: 2 }) });
  await fetch(BASE + '/api/period', { method: 'POST', headers: H, body: JSON.stringify({ start_date: '2026-10-01', end_date: '2026-10-05', flow: 3, blood_color: 3, blood_texture: 1, dysmenorrhea: 1, pain_types: ['胀痛'], symptoms: ['头痛', '其他'], symptom_other: '腰酸' }) });
}

// ---- 桌面 ----
{
  const { ctx, page } = await newPage(1280, 820, 'pd11-d');
  await page.evaluate(() => document.querySelector('.nav-item[data-nav=calendar]').click());
  await page.waitForTimeout(1800);
  await page.evaluate(() => document.querySelector('.cal-view[data-calview=period]').click());
  await page.waitForTimeout(1500);
  let r = await page.evaluate(() => {
    const panel = document.querySelector('.cal-panel');
    const pr = panel.getBoundingClientRect();
    const out = [];
    document.querySelectorAll('.pd-form, .pd-form *, .pd-stats, .pd-list').forEach((el) => {
      const er = el.getBoundingClientRect();
      if (er.width && er.height && (er.right > pr.right + 1 || er.bottom > pr.bottom + 1 || er.left < pr.left - 1)) {
        out.push(el.tagName + '.' + String(el.className).split(' ')[0]);
      }
    });
    const view = document.getElementById('view-calendar');
    return {
      flowChips: document.querySelectorAll('.pd-chip[data-kind=flow]').length,
      colorChips: document.querySelectorAll('.pd-chip[data-kind=color]').length,
      textureChips: document.querySelectorAll('.pd-chip[data-kind=texture]').length,
      painHidden: document.getElementById('pdPainBox').hidden,
      symChips: document.querySelectorAll('.pd-chip[data-kind=sym]').length,
      otherHidden: document.getElementById('pdOtherInput').hidden,
      detailLine: (document.querySelector('.pd-row small') || {}).textContent || '',
      overflow: out.slice(0, 5),
      viewH: view.style.height,
    };
  });
  check('经量5/血色4/血质3 芯片齐全', r.flowChips === 5 && r.colorChips === 4 && r.textureChips === 3, `${r.flowChips}/${r.colorChips}/${r.textureChips}`);
  check('痛经分型默认收起 + 其他填空默认收起', r.painHidden && r.otherHidden);
  check('症状 12 芯片（11+其他）', r.symChips === 12, r.symChips);
  check('历史详情行（血色/痛经/症状）', r.detailLine.includes('血色深红') && r.detailLine.includes('痛经：胀痛') && r.detailLine.includes('腰酸'), r.detailLine);
  check('补录表单/概览/历史无越界面板', r.overflow.length === 0, r.overflow.join(','));
  await page.screenshot({ path: `${OUT}/period11-tab-d.jpg`, type: 'jpeg', quality: 62 });
  console.log('📷 period11-tab-d');

  // 交互：勾痛经 → 分型出现并多选；选其他 → 填空出现
  await page.evaluate(() => { document.getElementById('pdDys').click(); });
  await page.waitForTimeout(300);
  await page.evaluate(() => { document.querySelector('.pd-chip[data-kind=pain][data-val=胀痛]').click(); document.querySelector('.pd-chip[data-kind=pain][data-val=坠痛]').click(); });
  await page.evaluate(() => { document.querySelector('.pd-chip[data-kind=sym][data-val=其他]').click(); document.querySelector('.pd-chip[data-kind=sym][data-val=发热]').click(); });
  await page.waitForTimeout(300);
  r = await page.evaluate(() => ({
    painShown: !document.getElementById('pdPainBox').hidden,
    painOn: document.querySelectorAll('.pd-chip[data-kind=pain].on').length,
    otherShown: !document.getElementById('pdOtherInput').hidden,
  }));
  check('勾痛经展开分型并多选 2 项', r.painShown && r.painOn === 2);
  check('选其他 → 填空出现', r.otherShown);
  await page.fill('#pdOtherInput', '手脚冰凉');

  // 保存一条全量记录（日期直接写 hidden input）
  await page.evaluate(() => {
    document.getElementById('pdStartInput').value = '2026-10-25';
    document.getElementById('pdEndInput').value = '';
    window.syncDtBtns();
    document.getElementById('pdForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  });
  await page.waitForTimeout(1400);
  r = await page.evaluate(() => {
    const row = [...document.querySelectorAll('.pd-row')].find((x) => x.textContent.includes('10月25日'));
    return {
      saved: !!row,
      badge: row ? (row.querySelector('.pd-flow-badge') || {}).className : '',
      detail: row ? (row.querySelector('small') || {}).textContent : '',
      rows: document.querySelectorAll('.pd-row').length,
    };
  });
  check('全量保存 → 历史新行（f3 徽标 + 详情）', r.saved && r.badge.includes('f3') && r.detail.includes('血色正常') && r.detail.includes('发热'), (r.badge || '') + ' ' + r.detail);
  check('保存后共 3 条', r.rows === 3);

  // 编辑回填
  await page.evaluate(() => { [...document.querySelectorAll('[data-pd=edit]')][0].click(); });
  await page.waitForTimeout(600);
  r = await page.evaluate(() => ({
    title: document.getElementById('pdFormTitle').textContent,
    dys: document.getElementById('pdDys').checked,
    painShown: !document.getElementById('pdPainBox').hidden,
    painOn: document.querySelectorAll('.pd-chip[data-kind=pain].on').length,
    flowOn: document.querySelector('.pd-chip[data-kind=flow].on').dataset.val,
  }));
  check('编辑回填（标题/痛经/分型/经量）', r.title.includes('10月25日') && r.dys && r.painShown && r.painOn === 2 && r.flowOn === '3', JSON.stringify(r));

  // 取消编辑 → 默认态
  await page.evaluate(() => document.getElementById('pdCancelEdit').click());
  await page.waitForTimeout(400);
  r = await page.evaluate(() => ({
    title: document.getElementById('pdFormTitle').textContent,
    dys: document.getElementById('pdDys').checked,
    otherHidden: document.getElementById('pdOtherInput').hidden,
  }));
  check('取消编辑回默认（痛经收起/填空收起）', r.title === '补录一次经期' && !r.dys && r.otherHidden);

  // 纵向：视图高度已放开（auto），页面自然滚动，无内容被面板裁切
  r = await page.evaluate(() => {
    const v = document.getElementById('view-calendar');
    return { h: v.style.height, clip: v.scrollHeight > v.clientHeight + 2 };
  });
  check('经期视图高度 auto（不被 fitCalView 定死）', r.h === 'auto', r.h);
  check('视图内无纵向裁切', !r.clip);
  await ctx.close();
}

// ---- 手机 390 ----
{
  const { ctx, page } = await newPage(390, 844, 'pd11-m');
  await page.goto(BASE + '/#/calendar', { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  await page.evaluate(() => document.querySelector('.cal-view[data-calview=period]').click());
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const panel = document.querySelector('.cal-panel');
    const pr = panel.getBoundingClientRect();
    const out = [];
    document.querySelectorAll('.pd-form, .pd-form *, .pd-stats, .pd-list').forEach((el) => {
      const er = el.getBoundingClientRect();
      if (er.width && er.height && (er.right > pr.right + 1 || er.bottom > pr.bottom + 1)) out.push(el.className.split(' ')[0]);
    });
    return {
      overflow: out.slice(0, 5),
      noH: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      chips: document.querySelectorAll('.pd-chip').length,
    };
  });
  check('手机端表单/历史无越界面板（横向+纵向）', r.overflow.length === 0, r.overflow.join(','));
  check('手机端无横向滚动', r.noH);
  check('手机端芯片齐全 30（5+4+3+6+12）', r.chips === 30, r.chips);
  await page.evaluate(() => { document.querySelector('.pd-form').scrollIntoView({ block: 'start' }); window.scrollBy(0, -60); });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/period11-form-m.jpg`, type: 'jpeg', quality: 62 });
  console.log('📷 period11-form-m');
  await ctx.close();
}

check('全程无 pageerror', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(ok.join('\n'));
if (fail.length) { console.log('\n' + fail.join('\n')); process.exit(1); }
console.log('\n✅ ' + ok.length + ' 项全部通过');
