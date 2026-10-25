// v0.5.13 药箱字典化 UI 双端验证
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

// 种子：清空药箱 → 3 片剂 + 1 颗粒剂 + 1 外用药(片剂, 处方) → 频次排序可验证
{
  const lr = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: 'admin', pass: 'test-pass-123' }) });
  const cookie = (lr.headers.get('set-cookie') || '').split(';')[0];
  const H = { 'Content-Type': 'application/json', cookie };
  const cur = await (await fetch(BASE + '/api/medicines', { headers: { cookie } })).json();
  for (const m of cur.all || []) await fetch(BASE + '/api/medicines/' + m.id, { method: 'DELETE', headers: { cookie } });
  // 清理上一轮可能残留的「示例」词条（幂等）
  const voc = await (await fetch(BASE + '/api/vocab', { headers: { cookie } })).json();
  for (const kind of ['med_category', 'med_form', 'med_location']) {
    for (const w of (voc.grouped || {})[kind] || []) {
      if (w.word.startsWith('示例')) await fetch(BASE + '/api/vocab?id=' + w.id, { method: 'DELETE', headers: { cookie } });
    }
  }
  const mk = (name, extra) => fetch(BASE + '/api/medicines', { method: 'POST', headers: H, body: JSON.stringify({ name, form: '片剂', category: '无', ...extra }) });
  await mk('频次测试片剂甲', {});
  await mk('频次测试片剂乙', {});
  await mk('频次测试片剂丙', { rx: 1 });
  await mk('频次测试颗粒一', { form: '颗粒剂' });
  await mk('外用红霉素软膏', { form: '软膏剂', external: 1, rx: 0 });
}

// ---- 桌面 ----
{
  const { ctx, page } = await newPage(1280, 820, 'med13-d');
  await page.evaluate(() => document.querySelector('.nav-item[data-nav=medicine]').click());
  await page.waitForTimeout(2200);
  let r = await page.evaluate(async () => {
    const d = await (await fetch('/api/medicines', { credentials: 'include' })).json();
    const gear = document.getElementById('medSetBtn');
    return {
      forms: d.options.forms,
      cats: d.options.categories,
      formsLen: d.options.forms.length,
      gearIsIcon: gear && gear.querySelector('use').getAttribute('href') === '#i-gear',
      tipGone: !document.getElementById('medTipBtn'),
    };
  });
  check('剂型 16 种', r.formsLen === 16, r.forms.join(','));
  check('频次排序：片剂(3) 最前 → 颗粒剂(1) 次之', r.forms[0] === '片剂' && r.forms[1] === '颗粒剂', r.forms.slice(0, 3).join(','));
  check('分类 13 项（无 + 12 病类）', r.cats.length === 13 && r.cats[0] === '无' && r.cats.includes('外感呼吸病') && r.cats.includes('外科肛肠病'), r.cats.join(','));
  check('齿轮按钮替换用药常识', r.gearIsIcon && r.tipGone);

  // 徽标：外用药红底白外 + OTC；片剂丙处方
  r = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.med-row')];
    const ext = rows.find((x) => x.textContent.includes('外用红霉素软膏'));
    const otc = rows.find((x) => x.textContent.includes('频次测试片剂乙'));
    const rx = rows.find((x) => x.textContent.includes('频次测试片剂丙'));
    const extTag = ext && ext.querySelector('.med-tag.ext');
    return {
      extBadge: !!extTag && extTag.textContent === '外',
      extBg: extTag ? getComputedStyle(extTag).backgroundColor : '',
      otcBadge: !!otc && !!otc.querySelector('.med-tag.otc'),
      rxNoOtc: !!rx && !rx.querySelector('.med-tag.otc') && !!rx.querySelector('.med-tag.rx'),
      catWu: rows.every((x) => x.querySelector('.med-tag.gray').textContent === '无'),
    };
  });
  check('外用药红底白「外」徽标', r.extBadge && /rgb\(2\d\d, ?,? ?\d+/.test(r.extBg.replace(/\s/g, '')), r.extBg);
  check('未勾处方 → OTC 徽标；勾了 → 处方药', r.otcBadge && r.rxNoOtc);
  check('存量分类已全部置「无」', r.catWu);

  // 打开录入弹窗：有效期完整日期 + external 勾选框
  await page.evaluate(() => document.getElementById('addMedBtn').click());
  await page.waitForTimeout(600);
  r = await page.evaluate(() => {
    const btn = document.querySelector('.dt-btn[data-dt=medExpiry]');
    return {
      fullAttr: btn.dataset.full === '1',
      spanText: btn.querySelector('span').textContent,
      extBox: !!document.querySelector('#medForm input[name=external]'),
      catOptions: [...document.getElementById('medCatSel').options].map((o) => o.value),
      formOptions: [...document.getElementById('medFormSel').options].map((o) => o.value),
    };
  });
  check('有效期按钮显示完整年月日', r.fullAttr && /^\d{4}-\d{2}-\d{2}$/.test(r.spanText), r.spanText);
  check('外用药勾选框在', r.extBox);
  check('分类下拉 13 项默认无', r.catOptions.length === 13 && r.catOptions[0] === '无');
  check('剂型下拉 16 项', r.formOptions.length === 16);
  await page.evaluate(() => { const b = document.querySelector('.dt-btn[data-dt=medExpiry]'); b.click(); });
  await page.waitForTimeout(700);
  const picked = await page.evaluate(() => {
    const done = document.getElementById('tpDone');
    if (done) done.click();
    return document.querySelector('.dt-btn[data-dt=medExpiry] span').textContent;
  });
  await page.waitForTimeout(300);
  r = await page.evaluate(() => document.querySelector('.dt-btn[data-dt=medExpiry] span').textContent);
  check('选择器确认后仍显示完整年月日', /^\d{4}-\d{2}-\d{2}$/.test(r), r);
  await page.evaluate(() => document.getElementById('medModalClose').click());

  // 药箱设置弹窗 CRUD
  await page.evaluate(() => document.getElementById('medSetBtn').click());
  await page.waitForTimeout(900);
  r = await page.evaluate(() => ({
    groups: document.querySelectorAll('#medDictBody .md-group').length,
    catRows: document.querySelectorAll('#medDictBody .md-group[data-kind=med_category] .md-row').length,
    formRows: document.querySelectorAll('#medDictBody .md-group[data-kind=med_form] .md-row').length,
    locRows: document.querySelectorAll('#medDictBody .md-group[data-kind=med_location] .md-row').length,
  }));
  check('设置弹窗三组字典（分类12/剂型16/位置7）', r.groups === 3 && r.catRows === 12 && r.formRows === 16 && r.locRows === 7, JSON.stringify(r));
  // 新增分类「示例新增」→ 出现在列表
  await page.fill('#medDictBody .md-group[data-kind=med_category] [data-md-add]', '示例新增');
  await page.evaluate(() => document.querySelector('#medDictBody .md-group[data-kind=med_category] [data-md=add]').click());
  await page.waitForTimeout(900);
  r = await page.evaluate(() => document.querySelectorAll('#medDictBody .md-group[data-kind=med_category] .md-row').length);
  check('新增分类生效（13 行）', r === 13, r);
  // 重命名「示例新增」→「示例改名」
  await page.evaluate(() => { [...document.querySelectorAll('#medDictBody .md-group[data-kind=med_category] [data-md=edit]')].pop().click(); });
  await page.waitForTimeout(300);
  await page.fill('#medDictBody .md-row [data-md-rename]', '示例改名');
  await page.evaluate(() => { [...document.querySelectorAll('#medDictBody .md-row [data-md=save]')].pop().click(); });
  await page.waitForTimeout(900);
  r = await page.evaluate(() => [...document.querySelectorAll('#medDictBody .md-group[data-kind=med_category] .md-word')].some((s) => s.textContent === '示例改名'));
  check('重命名生效', r);
  // 删除「示例改名」
  await page.evaluate(() => { [...document.querySelectorAll('#medDictBody .md-group[data-kind=med_category] [data-md=del]')].pop().click(); });
  await page.waitForTimeout(400);
  await page.evaluate(() => document.getElementById('confirmOkBtn').click());
  await page.waitForTimeout(900);
  r = await page.evaluate(() => document.querySelectorAll('#medDictBody .md-group[data-kind=med_category] .md-row').length);
  check('删除生效（回到 12 行）', r === 12, r);
  await page.evaluate(() => document.getElementById('medDictClose').click());
  // 服药计划间距
  r = await page.evaluate(() => {
    const b = document.getElementById('mpEnable');
    b.closest('.medplan-box');
    return getComputedStyle(document.querySelector('.medplan-box')).marginBottom;
  });
  check('服药计划与保存按钮间距 ≥14px', parseFloat(r) >= 14, r);
  await page.screenshot({ path: `${OUT}/med13-d.jpg`, type: 'jpeg', quality: 62 });
  console.log('📷 med13-d');
  await ctx.close();
}

// ---- 手机 390 ----
{
  const { ctx, page } = await newPage(390, 844, 'med13-m');
  await page.goto(BASE + '/#/medicine', { waitUntil: 'load' });
  await page.waitForTimeout(2200);
  let r = await page.evaluate(() => ({
    noH: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    extBadge: !!document.querySelector('.med-tag.ext'),
    otcBadge: document.querySelectorAll('.med-tag.otc').length,
  }));
  check('手机端无横向溢出', r.noH);
  check('手机端徽标正常（外 + OTC×4）', r.extBadge && r.otcBadge === 4, r.otcBadge);
  await page.evaluate(() => document.getElementById('medSetBtn').click());
  await page.waitForTimeout(900);
  r = await page.evaluate(() => ({
    modalShown: !document.getElementById('medDictModal').hidden,
    noH: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  }));
  check('手机端设置弹窗打开无溢出', r.modalShown && r.noH);
  await page.screenshot({ path: `${OUT}/med13-m.jpg`, type: 'jpeg', quality: 62 });
  console.log('📷 med13-m');
  await ctx.close();
}

check('全程无 pageerror', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(ok.join('\n'));
if (fail.length) { console.log('\n' + fail.join('\n')); process.exit(1); }
console.log('\n✅ ' + ok.length + ' 项全部通过');
