// v0.5.19 档案页查看/编辑双模式验证
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

// 种子：确保 Tony Ma(id=8) 有联系方式与身体数据
{
  const lr = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: 'admin', pass: 'test-pass-123' }) });
  const cookie = (lr.headers.get('set-cookie') || '').split(';')[0];
  const H = { 'Content-Type': 'application/json', cookie };
  const d = await (await fetch(BASE + '/api/profile/detail?id=8', { headers: { cookie } })).json();
  if (!(d.methods || {}).phones || !d.methods.phones.length) {
    await fetch(BASE + '/api/profile/contacts', { method: 'POST', headers: H, body: JSON.stringify({ person_id: 8, kind: 'phones', value: '13812345678', label: '个人' }) });
  }
  const bd = await (await fetch(BASE + '/api/profile/body?id=8', { headers: { cookie } })).json();
  if (!(bd.records || []).length) {
    await fetch(BASE + '/api/profile/body', { method: 'POST', headers: H, body: JSON.stringify({ person_id: 8, kind: 'height', value: 176, date: '2026-04-21' }) });
    await fetch(BASE + '/api/profile/body', { method: 'POST', headers: H, body: JSON.stringify({ person_id: 8, kind: 'weight', value: 67.2, date: '2026-10-20' }) });
  }
  if (!(bd.sizes || {}).clothing) {
    await fetch(BASE + '/api/profile/body', { method: 'PUT', headers: H, body: JSON.stringify({ id: 8, sizes: { clothing: 'XL', shoe: '43' } }) });
  }
}

// ---- 桌面：查看模式 ----
{
  const { ctx, page } = await newPage(1280, 820, 'pf19-d');
  await page.evaluate(() => document.querySelector('.nav-item[data-nav=relations]').click());
  await page.waitForTimeout(2000);
  await page.goto(BASE + '/#/relations/8', { waitUntil: 'load' });
  await page.waitForTimeout(2400);
  let r = await page.evaluate(() => {
    const scope = document.getElementById('relProfileView');
    const inputs = scope.querySelectorAll('input:not([type=hidden]):not([hidden]):not(#pfFileInput), select:not([hidden]), textarea');
    const addForms = scope.querySelectorAll('.pm-add, .rep-box form, #workForm');
    const hiddenPanels = ['pfSocialPanel', 'pfMethodsPanel', 'pfRelativesPanel', 'pfWorkPanel', 'pfEduPanel', 'pfPetsPanel', 'pfBodyPanel', 'pfFilesPanel']
      .filter((id) => { const el = document.getElementById(id); return el && el.hidden; });
    const editBtn = document.getElementById('pfEditBtn');
    return {
      inputs: inputs.length,
      addForms: addForms.length,
      hiddenPanels,
      editLabel: editBtn.textContent.trim(),
      methodsText: (document.querySelector('#pfMethodsPanel .pf-vrow b') || {}).textContent,
      visiblePanels: ['pfBasicPanel', 'pfFinancePanel'].filter((id) => !document.getElementById(id).hidden).length,
    };
  });
  check('查看模式零输入控件', r.inputs === 0, r.inputs);
  check('查看模式无添加表单', r.addForms === 0, r.addForms);
  check('编辑按钮文案为「编辑基本信息」', r.editLabel.includes('编辑基本信息'), r.editLabel);
  check('空分区隐藏', r.hiddenPanels.length >= 3, r.hiddenPanels.join(','));
  check('基础身份/财务分区始终可见', r.visiblePanels === 2);
  check('联系方式查看态有展示行', !!r.methodsText, r.methodsText);
  await page.screenshot({ path: `${OUT}/pf19-view-d.jpg`, type: 'jpeg', quality: 62 });
  console.log('📷 pf19-view-d');

  // 进入编辑模式
  await page.evaluate(() => document.getElementById('pfEditBtn').click());
  await page.waitForTimeout(1600);
  r = await page.evaluate(() => {
    const scope = document.getElementById('relProfileView');
    return {
      inputs: scope.querySelectorAll('input:not([type=hidden]):not([hidden]):not(#pfFileInput), select:not([hidden]), textarea').length,
      addForms: scope.querySelectorAll('.pm-add, #workForm, #eduAddForm, #petAddForm').length,
      editLabel: document.getElementById('pfEditBtn').textContent.trim(),
      hiddenPanels: ['pfSocialPanel', 'pfMethodsPanel', 'pfRelativesPanel', 'pfWorkPanel', 'pfEduPanel', 'pfPetsPanel', 'pfBodyPanel', 'pfFilesPanel'].filter((id) => { const el = document.getElementById(id); return el && el.hidden; }),
      basicBtn: !!document.querySelector('#pfBasicPanel [data-act=edit-basic]'),
      uploadShown: document.getElementById('pfFileBtn').style.display !== 'none',
    };
  });
  check('编辑模式出现录入控件（≥10）', r.inputs >= 10, r.inputs);
  check('编辑模式出现添加表单（≥3）', r.addForms >= 3, r.addForms);
  check('编辑按钮变「完成」', r.editLabel.includes('完成'), r.editLabel);
  check('编辑模式分区全展开', r.hiddenPanels.length === 0, JSON.stringify(r.hiddenPanels));
  check('编辑模式显示编辑基本信息入口 + 附件上传', r.basicBtn && r.uploadShown);
  await page.screenshot({ path: `${OUT}/pf19-edit-d.jpg`, type: 'jpeg', quality: 62 });
  console.log('📷 pf19-edit-d');

  // 编辑模式保存一个婚姻 → 数据落库
  await page.evaluate(() => {
    const sel = document.getElementById('pfMarriageSel');
    sel.value = '已婚';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(1800);
  r = await page.evaluate(async () => {
    const d = await (await fetch('/api/profile/detail?id=8', { credentials: 'include' })).json();
    return d.base.marriage;
  });
  check('编辑模式修改婚姻落库', r === '已婚', r);
  // 还原
  await page.evaluate(() => {
    const sel = document.getElementById('pfMarriageSel');
    sel.value = '';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(1600);

  // 退出编辑 → 回到查看
  await page.evaluate(() => document.getElementById('pfEditBtn').click());
  await page.waitForTimeout(1200);
  r = await page.evaluate(() => ({
    inputs: document.getElementById('relProfileView').querySelectorAll('input:not([type=hidden]):not([hidden]):not(#pfFileInput), select:not([hidden]), textarea').length,
    editLabel: document.getElementById('pfEditBtn').textContent.trim(),
  }));
  check('完成后回到查看模式（零输入）', r.inputs === 0 && r.editLabel.includes('编辑基本信息'), JSON.stringify(r));
  await ctx.close();
}

// ---- 手机 390：查看模式 + 编辑按钮 ----
{
  const { ctx, page } = await newPage(390, 844, 'pf19-m');
  await page.goto(BASE + '/#/relations/8', { waitUntil: 'load' });
  await page.waitForTimeout(2600);
  let r = await page.evaluate(() => ({
    inputs: document.getElementById('relProfileView').querySelectorAll('input:not([type=hidden]):not([hidden]):not(#pfFileInput), select:not([hidden]), textarea').length,
    noH: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    nameW: Math.round(document.getElementById('pfName').getBoundingClientRect().width),
  }));
  check('手机端查看模式零输入控件', r.inputs === 0, r.inputs);
  check('手机端无横向溢出', r.noH);
  check('手机端名字完整（≥50px）', r.nameW >= 50, r.nameW);
  await page.screenshot({ path: `${OUT}/pf19-view-m.jpg`, type: 'jpeg', quality: 62 });
  console.log('📷 pf19-view-m');
  await page.evaluate(() => document.getElementById('pfEditBtn').click());
  await page.waitForTimeout(1200);
  r = await page.evaluate(() => ({
    inputs: document.getElementById('relProfileView').querySelectorAll('input:not([type=hidden]):not([hidden]):not(#pfFileInput), select:not([hidden]), textarea').length,
    noH: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    editLabel: document.getElementById('pfEditBtn').textContent.trim(),
  }));
  check('手机端编辑模式控件出现', r.inputs >= 8, r.inputs);
  check('手机端编辑模式无溢出 + 完成按钮', r.noH && r.editLabel.includes('完成'));
  await page.screenshot({ path: `${OUT}/pf19-edit-m.jpg`, type: 'jpeg', quality: 62 });
  console.log('📷 pf19-edit-m');
  await ctx.close();
}

check('全程无 pageerror', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(ok.join('\n'));
if (fail.length) { console.log('\n' + fail.join('\n')); process.exit(1); }
console.log('\n✅ ' + ok.length + ' 项全部通过');
