// v0.5.8 三处界面修复验证（双视口 + pageerror 监听）
import { chromium } from 'file:///C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = 'http://127.0.0.1:8799/';
const OUT = 'C:/Users/Administrator/.zcode/v2/visualizations/ef406d1159ea31634c951dd707045e06503eae2363f1aeda9a0598f374ecc88e/_p3img';
const ok = [], fail = [];
const check = (n, c, e = '') => (c ? ok : fail).push((c ? '✓ ' : '✗ ') + n + (e ? ' → ' + e : ''));

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const errors = [];
async function newPage(w, h, tag) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(tag + ': ' + e.message.slice(0, 100)));
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  if (await page.evaluate(() => !document.getElementById('loginOverlay').hidden)) {
    await page.fill('#loginForm input[name=user]', 'admin');
    await page.fill('#loginForm input[name=pass]', 'test-pass-123');
    await page.click('#loginForm button[type=submit]');
    await page.waitForTimeout(2000);
  }
  return { ctx, page };
}

// ---- 1. 档案页：rel-two 两列 + 间隔 ----
{
  const { ctx, page } = await newPage(1280, 820, 'rel-d');
  await page.goto(BASE + '#/relations/8', { waitUntil: 'load' });
  await page.waitForTimeout(2600);
  const r = await page.evaluate(() => {
    const two = document.querySelector('#relProfileView .rel-two');
    const panels = [...two.querySelectorAll(':scope > .panel')];
    const a = panels[0].getBoundingClientRect(), b = panels[1].getBoundingClientRect();
    const cs = getComputedStyle(two);
    return { cols: cs.gridTemplateColumns.split(' ').length, gap: parseFloat(cs.columnGap) || 0, side: Math.abs(a.top - b.top) < 2, sameRow: a.right <= b.left + 1 };
  });
  check('档案页双模块并排两列', r.cols === 2 && r.side, 'cols=' + r.cols);
  check('两模块列间距 ≥14px', r.gap >= 14, r.gap + 'px');
  await page.screenshot({ path: `${OUT}/fix-rel-two.jpg`, type: 'jpeg', quality: 62 });
  await ctx.close();
}
// 手机端：单列且垂直有间隔
{
  const { ctx, page } = await newPage(390, 844, 'rel-m');
  await page.goto(BASE + '#/relations/8', { waitUntil: 'load' });
  await page.waitForTimeout(2600);
  const r = await page.evaluate(() => {
    const two = document.querySelector('#relProfileView .rel-two');
    const panels = [...two.querySelectorAll(':scope > .panel')];
    const a = panels[0].getBoundingClientRect(), b = panels[1].getBoundingClientRect();
    return { cols: getComputedStyle(two).gridTemplateColumns.split(' ').length, vgap: b.top - a.bottom };
  });
  check('手机端档案双模块单列 + 垂直间隔 ≥14px', r.cols === 1 && r.vgap >= 14, `cols=${r.cols} vgap=${Math.round(r.vgap)}px`);
  await ctx.close();
}

// ---- 2. 账本预算：容器不再被裁 ----
{
  const { ctx, page } = await newPage(1280, 820, 'led-d');
  await page.evaluate(() => document.querySelector('.nav-item[data-nav=ledger]').click());
  await page.waitForTimeout(2400);
  const r = await page.evaluate(() => {
    const t = document.getElementById('lbTotalBar');
    const head = t.querySelector('.lb-head h2');
    const bar = t.querySelector('.lb-bar');
    const foot = t.querySelector('.lb-foot');
    const rows = [...document.querySelectorAll('#budgetList .bg-row')];
    return {
      h: t.getBoundingClientRect().height,
      text: head ? head.textContent : '',
      barVisible: bar ? bar.getBoundingClientRect().height >= 8 : false,
      footVisible: foot ? foot.getBoundingClientRect().height > 10 : false,
      rows: rows.length,
      rowH: rows.length ? Math.round(rows[0].getBoundingClientRect().height) : 0,
      overflow: t.scrollHeight > t.clientHeight + 2,
    };
  });
  check('总额度块高度正常（>50px，不再 10px 裁切）', r.h > 50, Math.round(r.h) + 'px');
  check('总额度文字完整', /已用|预算/.test(r.text), r.text);
  check('进度条 + 结余行可见', r.barVisible && r.footVisible);
  check('无垂直溢出裁切', !r.overflow);
  check('分类预算行完整显示', r.rows === 3 && r.rowH >= 30, `rows=${r.rows} h=${r.rowH}px`);
  await page.evaluate(() => { const el = document.getElementById('ledgerBudget'); if (el) el.scrollIntoView({ block: 'center' }); window.scrollBy(0, -30); });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/fix-budget-d.jpg`, type: 'jpeg', quality: 62 });
  await ctx.close();
}
// 手机端预算
{
  const { ctx, page } = await newPage(390, 844, 'led-m');
  await page.evaluate(() => document.querySelector('.mobile-nav > button[data-nav=ledger]').click());
  await page.waitForTimeout(2400);
  const r = await page.evaluate(() => {
    const t = document.getElementById('lbTotalBar');
    return { h: t.getBoundingClientRect().height, overflow: t.scrollHeight > t.clientHeight + 2, noH: document.documentElement.scrollWidth <= document.documentElement.clientWidth };
  });
  check('手机端预算块完整（>50px 无裁切无横向溢出）', r.h > 50 && !r.overflow && r.noH, Math.round(r.h) + 'px');
  await page.evaluate(() => { const el = document.getElementById('ledgerBudget'); if (el) el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -60); });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/fix-budget-m.jpg`, type: 'jpeg', quality: 62 });
  await ctx.close();
}

// ---- 3. 待办页头：按钮组 ----
{
  const { ctx, page } = await newPage(1280, 820, 'todo-d');
  await page.evaluate(() => document.querySelector('.nav-item[data-nav=todos]').click());
  await page.waitForTimeout(1800);
  const r = await page.evaluate(() => {
    const head = document.querySelector('#view-todos .growth-head');
    const gh = head.querySelector('.gh-actions');
    const notify = document.getElementById('enableNotifyBtn');
    const add = document.getElementById('addTodoBtn');
    const inHead = head.contains(notify) && head.contains(add);
    const order = notify.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING;
    const nb = notify.getBoundingClientRect(), ab = add.getBoundingClientRect();
    const rightOf = nb.right <= ab.left + 1 && Math.abs(nb.top - ab.top) < 5;
    const filterGone = ![...document.querySelectorAll('#view-todos .tf-row')].some((x) => x.textContent.includes('提醒'));
    const title = head.querySelector('h2').getBoundingClientRect();
    const sameRow = Math.abs(title.top - nb.top) < 40;
    return { inHead, order, rightOf, filterGone, sameRow };
  });
  check('两按钮都在页头 gh-actions 内', r.inHead);
  check('顺序：开启通知 在 新增待办 左侧', r.order && r.rightOf);
  check('筛选面板已无「提醒」行', r.filterGone);
  check('桌面：标题与按钮同行', r.sameRow);
  await page.evaluate(() => { const el = document.querySelector('#view-todos .growth-head'); if (el) el.scrollIntoView({ block: 'center' }); });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/fix-todo-d.jpg`, type: 'jpeg', quality: 62 });
  await ctx.close();
}
// 手机端待办页头
{
  const { ctx, page } = await newPage(390, 844, 'todo-m');
  await page.evaluate(() => document.querySelector('.mobile-nav > button[data-nav=todos]').click());
  await page.waitForTimeout(1800);
  const r = await page.evaluate(() => {
    const head = document.querySelector('#view-todos .growth-head');
    const gh = head.querySelector('.gh-actions');
    const notify = document.getElementById('enableNotifyBtn');
    const add = document.getElementById('addTodoBtn');
    const nb = notify.getBoundingClientRect(), ab = add.getBoundingClientRect();
    return {
      visible: nb.width > 0 && ab.width > 0,
      order: (notify.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING) && nb.right <= ab.left + 1,
      noH: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ghRight: getComputedStyle(gh).marginLeft === 'auto' || gh.getBoundingClientRect().left > head.getBoundingClientRect().width * 0.3,
      noOverlap: nb.right <= ab.left + 1,
    };
  });
  check('手机端两按钮可见且顺序正确', r.visible && r.order);
  check('手机端无横向溢出', r.noH);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/fix-todo-m.jpg`, type: 'jpeg', quality: 62 });
  await ctx.close();
}

check('全程无 pageerror', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(ok.join('\n'));
if (fail.length) { console.log('\n' + fail.join('\n')); process.exit(1); }
console.log('\n✅ ' + ok.length + ' 项全部通过');
