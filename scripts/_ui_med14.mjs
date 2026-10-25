// v0.5.14 药箱三处改动 UI 验证
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
// 种子：3 片剂（OTC/OTC/处方）+ 1 外用药
{
  const lr = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: 'admin', pass: 'test-pass-123' }) });
  const cookie = (lr.headers.get('set-cookie') || '').split(';')[0];
  const H = { 'Content-Type': 'application/json', cookie };
  const cur = await (await fetch(BASE + '/api/medicines', { headers: { cookie } })).json();
  for (const m of cur.all || []) await fetch(BASE + '/api/medicines/' + m.id, { method: 'DELETE', headers: { cookie } });
  const mk = (n, x) => fetch(BASE + '/api/medicines', { method: 'POST', headers: H, body: JSON.stringify({ name: n, form: '片剂', category: '无', ...x }) });
  await mk('查看方式甲', {});
  await mk('查看方式乙', {});
  await mk('查看方式丙', { rx: 1 });
  await mk('外用测试软膏', { form: '软膏剂', external: 1 });
}

// ---- 桌面 ----
{
  const { ctx, page } = await newPage(1280, 820, 'med14-d');
  await page.evaluate(() => { localStorage.removeItem('medViewMode'); });
  await page.evaluate(() => document.querySelector('.nav-item[data-nav=medicine]').click());
  await page.waitForTimeout(2200);

  // OTC 红色（随主题令牌 --red）
  let r = await page.evaluate(() => {
    const otc = document.querySelector('.med-tag.otc');
    const red = getComputedStyle(document.documentElement).getPropertyValue('--red').trim();
    const c = otc ? getComputedStyle(otc).color : '';
    const bc = otc ? getComputedStyle(otc).borderColor : '';
    return { n: document.querySelectorAll('.med-tag.otc').length, red, c, bc, match: c === red || bc === red || c === bc };
  });
  check('OTC 标志红色（×3，随主题 --red）', r.n === 3 && r.match, JSON.stringify(r));
  // 详情/列表切换
  r = await page.evaluate(() => ({
    seg: !!document.getElementById('medViewSeg'),
    detailRows: document.querySelectorAll('.med-row').length,
  }));
  check('详情模式默认（4 行卡片 + 切换按钮在标题右侧）', r.seg && r.detailRows === 4);
  await page.evaluate(() => document.querySelector('#medViewSeg [data-mv=list]').click());
  await page.waitForTimeout(500);
  r = await page.evaluate(() => ({
    chips: document.querySelectorAll('.med-chip-item').length,
    cardGone: document.querySelectorAll('.med-row').length === 0,
    names: [...document.querySelectorAll('.med-chip-item')].slice(0, 2).map((c) => c.textContent),
  }));
  check('列表模式：只显药名一行多个（4 药名 chips）', r.chips === 4 && r.cardGone, r.names.join(','));
  await page.screenshot({ path: `${OUT}/med14-list-d.jpg`, type: 'jpeg', quality: 62 });
  console.log('📷 med14-list-d');
  // 点击 chip 直接编辑
  await page.evaluate(() => { [...document.querySelectorAll('.med-chip-item')].find((c) => c.textContent === '查看方式甲').click(); });
  await page.waitForTimeout(600);
  r = await page.evaluate(() => !document.getElementById('medModal').hidden && document.getElementById('medForm').name.value);
  check('点击列表药名直达编辑', r === '查看方式甲', r);
  await page.evaluate(() => document.getElementById('medModalClose').click());
  // 记忆：刷新后仍列表模式
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2200);
  r = await page.evaluate(() => ({ mode: localStorage.getItem('medViewMode'), chips: document.querySelectorAll('.med-chip-item').length }));
  check('查看方式记忆（刷新后仍列表）', r.mode === 'list' && r.chips === 4, JSON.stringify(r));
  // 切回详情
  await page.evaluate(() => document.querySelector('#medViewSeg [data-mv=detail]').click());
  await page.waitForTimeout(400);
  r = await page.evaluate(() => document.querySelectorAll('.med-row').length);
  check('切回详情模式 4 行卡片', r === 4);

  // 设置弹窗：删除只局部刷新（其他组 DOM 节点不变）
  await page.evaluate(() => document.getElementById('medSetBtn').click());
  await page.waitForTimeout(900);
  // 记录「剂型」组第一个 add 输入框节点引用（删除操作不应重建它）
  r = await page.evaluate(async () => {
    window.__probe = document.querySelector('#medDictBody .md-group[data-kind=med_form] [data-md-add]');
    // 新增分类「临时删除测试」
    document.querySelector('#medDictBody .md-group[data-kind=med_category] [data-md-add]').value = '临时删除测试';
    document.querySelector('#medDictBody .md-group[data-kind=med_category] [data-md=add]').click();
    await new Promise((res) => setTimeout(res, 800));
    return document.querySelectorAll('#medDictBody .md-group[data-kind=med_category] .md-row').length;
  });
  check('新增分类（13 行）', r === 13, r);
  // 删除它
  await page.evaluate(() => { [...document.querySelectorAll('#medDictBody .md-group[data-kind=med_category] [data-md=del]')].pop().click(); });
  await page.waitForTimeout(400);
  await page.evaluate(() => document.getElementById('confirmOkBtn').click());
  await page.waitForTimeout(900);
  r = await page.evaluate(() => ({
    catRows: document.querySelectorAll('#medDictBody .md-group[data-kind=med_category] .md-row').length,
    sameNode: window.__probe === document.querySelector('#medDictBody .md-group[data-kind=med_form] [data-md-add]'),
  }));
  check('删除后回到 12 行', r.catRows === 12, r.catRows);
  check('删除只局部刷新（剂型组节点未重建）', r.sameNode);
  await page.evaluate(() => document.getElementById('medDictClose').click());
  await ctx.close();
}

// ---- 手机 390 ----
{
  const { ctx, page } = await newPage(390, 844, 'med14-m');
  await page.goto(BASE + '/#/medicine', { waitUntil: 'load' });
  await page.waitForTimeout(2200);
  let r = await page.evaluate(() => ({
    noH: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    otcRed: (() => {
      const o = document.querySelector('.med-tag.otc');
      if (!o) return '';
      const red = getComputedStyle(document.documentElement).getPropertyValue('--red').trim();
      const c = getComputedStyle(o).borderColor;
      // --red 可能是 #hex 文本，computed 是 rgb()：转成数值比对
      const toRgb = (s) => {
        if (s.startsWith('#')) {
          const h = s.slice(1);
          const f = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
          return `rgb(${parseInt(f.slice(0, 2), 16)}, ${parseInt(f.slice(2, 4), 16)}, ${parseInt(f.slice(4, 6), 16)})`;
        }
        return s;
      };
      return toRgb(red) === c ? 'match' : c;
    })(),
  }));
  check('手机端无横向溢出', r.noH);
  check('手机端 OTC 红色', r.otcRed === 'match', r.otcRed);
  await page.evaluate(() => document.querySelector('#medViewSeg [data-mv=list]').click());
  await page.waitForTimeout(500);
  r = await page.evaluate(() => ({
    chips: document.querySelectorAll('.med-chip-item').length,
    noH: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  }));
  check('手机端列表模式 4 chips 无溢出', r.chips === 4 && r.noH);
  await page.evaluate(() => document.querySelector('#medList').scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/med14-list-m.jpg`, type: 'jpeg', quality: 62 });
  console.log('📷 med14-list-m');
  await page.evaluate(() => { localStorage.setItem('medViewMode', 'detail'); });
  await ctx.close();
}

check('全程无 pageerror', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(ok.join('\n'));
if (fail.length) { console.log('\n' + fail.join('\n')); process.exit(1); }
console.log('\n✅ ' + ok.length + ' 项全部通过');
