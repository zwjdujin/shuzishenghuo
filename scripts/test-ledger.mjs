// 我的账本 交互与布局测试（v0.3.14）
import { chromium } from 'file:///C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:8899/_preview/ledgerpreview.html';

const fails = [];
const ok = [];
const check = (name, cond, extra = '') => (cond ? ok : fails).push((cond ? '✓ ' : '✗ ') + name + (extra ? '  → ' + extra : ''));

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));

const load = async (hash = '#ledger') => {
  await page.goto(BASE + hash, { waitUntil: 'load' });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(900);
};
// 记录 api() 发出的请求
const spy = () => page.evaluate(() => {
  if (window.__spied) { window.__calls = []; return; }
  window.__spied = true;
  window.__calls = [];
  const real = window.fetch;
  window.fetch = function (url, opts) {
    window.__calls.push({ url: String(url), method: (opts && opts.method) || 'GET', body: (opts && opts.body) || '' });
    return real.apply(window, arguments);
  };
});

// ================= 概览 / 预算 / 趋势 =================
await load();
const top = await page.evaluate(() => {
  const ls = Array.from(document.querySelectorAll('#ledgerStats .ls'));
  const bar = document.querySelector('.lb-bar i');
  const tcols = Array.from(document.querySelectorAll('#ledgerTrend .tc-col'));
  return {
    lsCount: ls.length,
    lsText: ls.map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
    cols: getComputedStyle(document.getElementById('ledgerStats')).gridTemplateColumns.split(' ').length,
    budText: document.getElementById('ledgerBudget').textContent.replace(/\s+/g, ' ').trim(),
    barClass: bar ? bar.className : '',
    barW: bar ? Math.round(bar.getBoundingClientRect().width) : 0,
    trendCols: tcols.length,
    trendBars: document.querySelectorAll('#ledgerTrend .tc-bar').length,
    lastCur: tcols.length ? tcols[tcols.length - 1].classList.contains('cur') : false,
    lastLab: tcols.length ? tcols[tcols.length - 1].querySelector('.tc-lab').textContent : '',
  };
});
check('概览为 4 格（桌面 4 列）', top.lsCount === 4 && top.cols === 4, 'count=' + top.lsCount + ' cols=' + top.cols);
check('概览含 收入/支出/结余/日均支出', top.lsText.every((t, i) => ['本月收入', '本月支出', '本月结余', '日均支出'][i] === t.slice(0, 4)), top.lsText.join(' | '));
check('第 4 格露出人情往来小结', /人情往来\s*2\s*笔/.test(top.lsText[3]), top.lsText[3]);
check('预算条超支时标 over 且铺满', top.barClass.includes('over') && top.barW > 300, top.barClass + ' w=' + top.barW);
check('预算文案含「已用 %」「已超支」', /已用\s*\d+%/.test(top.budText) && /已超支/.test(top.budText), top.budText.slice(0, 60));
check('趋势 6 个月 × 2 柱', top.trendCols === 6 && top.trendBars === 12, top.trendCols + ' 列 / ' + top.trendBars + ' 柱');
check('趋势末列为当月并高亮', top.lastCur && top.lastLab === '10月', top.lastLab + ' cur=' + top.lastCur);

// ================= 构成环图（重点回归） =================
const donut = await page.evaluate(() => {
  const svg = document.querySelector('#ledgerChart svg.donut-svg');
  const r = svg ? svg.getBoundingClientRect() : { width: 0, height: 0 };
  const segs = Array.from(document.querySelectorAll('#ledgerChart .dseg'));
  const dls = Array.from(document.querySelectorAll('#ledgerChart .dl'));
  return {
    w: Math.round(r.width),
    h: Math.round(r.height),
    viewBox: svg ? svg.getAttribute('viewBox') : '',
    segs: segs.length,
    strokeW: segs.length ? getComputedStyle(segs[0]).strokeWidth : '',
    stroke: segs.length ? getComputedStyle(segs[0]).stroke : '',
    fill: segs.length ? getComputedStyle(segs[0]).fill : '',
    dls: dls.length,
    dlHasBar: dls.every((d) => !!d.querySelector('.dl-bar i')),
    center: svg ? svg.querySelector('.dt-val').textContent : '',
    centerLab: svg ? svg.querySelector('.dt-lab').textContent : '',
    title: document.getElementById('ledDonutTitle').textContent,
  };
});
check('🔴 环图 SVG 尺寸正常（≥120px，非 20px 图标尺寸）', donut.w >= 120 && donut.h >= 120, donut.w + 'x' + donut.h + ' viewBox=' + donut.viewBox);
check('环图扇形数 = 支出分类数（10）', donut.segs === 10, 'segs=' + donut.segs);
check('扇形为描边环（fill:none / stroke-width 22）', donut.fill === 'none' && parseFloat(donut.strokeW) >= 20, donut.fill + ' sw=' + donut.strokeW);
check('图例行数 = 分类数且每行有占比条', donut.dls === 10 && donut.dlHasBar, donut.dls + ' rows');
check('环图中心显示「本月支出 ¥9,397」', donut.centerLab === '本月支出' && /9,397/.test(donut.center), donut.centerLab + ' ' + donut.center);
check('默认标题为「支出构成」', donut.title === '支出构成', donut.title);

// ================= 图例点选 → 筛选流水 =================
await page.evaluate(() => { document.querySelectorAll('#ledgerChart .dl')[1].click(); });
await page.waitForTimeout(300);
const legendFilter = await page.evaluate(() => ({
  cat: document.querySelectorAll('#ledgerChart .dl')[1].querySelector('.nm').textContent,
  dim: document.querySelectorAll('#ledgerChart .dl.dim').length,
  rows: document.querySelectorAll('#ledgerList .txn-row').length,
  cats: Array.from(document.querySelectorAll('#ledgerList .txn-row .cat-tag')).map((c) => c.textContent),
  flow: Array.from(document.querySelectorAll('#ledFlowFilter .lf-btn')).filter((b) => b.classList.contains('active')).map((b) => b.textContent)[0],
}));
check('点图例第 2 项 → 流水只剩该类目', legendFilter.rows > 0 && legendFilter.cats.every((c) => c === legendFilter.cat), legendFilter.cat + ' → ' + legendFilter.rows + ' 行 [' + Array.from(new Set(legendFilter.cats)).join(',') + ']');
check('筛选时其余图例置灰', legendFilter.dim === 9, 'dim=' + legendFilter.dim);
check('筛选同步切到「支出」', legendFilter.flow === '支出', legendFilter.flow);
await page.evaluate(() => { document.querySelectorAll('#ledgerChart .dl')[1].click(); }); // 取消
await page.waitForTimeout(250);

// ================= 收入构成切换 =================
await page.evaluate(() => { document.querySelector('.led-donut-seg [data-leddonut="income"]').click(); });
await page.waitForTimeout(300);
const incomeTab = await page.evaluate(() => ({
  title: document.getElementById('ledDonutTitle').textContent,
  segs: document.querySelectorAll('#ledgerChart .dseg').length,
  act: document.querySelector('.led-donut-seg .seg-item.active').dataset.leddonut,
  center: document.querySelector('#ledgerChart .dt-val').textContent,
}));
check('切到收入构成：标题/扇形/高亮/中心额都跟着变', incomeTab.title === '收入构成' && incomeTab.segs === 2 && incomeTab.act === 'income' && /13,600/.test(incomeTab.center),
  incomeTab.title + ' segs=' + incomeTab.segs + ' center=' + incomeTab.center);
await page.evaluate(() => { document.querySelector('.led-donut-seg [data-leddonut="expense"]').click(); });
await page.waitForTimeout(250);

// ================= 流水分组 / 收付筛选 / 搜索 =================
const list0 = await page.evaluate(() => {
  const days = Array.from(document.querySelectorAll('#ledgerList .txn-day b')).map((b) => b.textContent);
  const rows = Array.from(document.querySelectorAll('#ledgerList .txn-row'));
  return { days: days.length, rows: rows.length, cnt: document.getElementById('ledCount').textContent };
});
check('流水按日期分组（9 天 / 15 笔）', list0.days === 9 && list0.rows === 15, list0.days + ' 组 / ' + list0.rows + ' 行');
check('计数显示总笔数', /15\s*笔/.test(list0.cnt), list0.cnt);

// 同一天的多笔必须落在同一组（分组依赖排序）
const sameDayFirst = await page.evaluate(() => {
  const wrap = document.getElementById('ledgerList');
  const kids = Array.from(wrap.children);
  const idx = kids.findIndex((k) => k.classList.contains('txn-day') && k.textContent.includes('10月09日'));
  const after = [];
  for (let i = idx + 1; i < kids.length && kids[i].classList.contains('txn-row'); i++) after.push(kids[i]);
  return after.length;
});
check('10月09日 4 笔归入同一组', sameDayFirst === 4, 'rows=' + sameDayFirst);

await page.evaluate(() => { document.querySelector('#ledFlowFilter [data-ledflow="income"]').click(); });
await page.waitForTimeout(250);
const onlyIncome = await page.evaluate(() => ({
  amts: Array.from(document.querySelectorAll('#ledgerList .txn-amt')).map((a) => a.textContent),
  rows: document.querySelectorAll('#ledgerList .txn-row').length,
}));
check('「收入」筛选只剩 2 笔且全为 +', onlyIncome.rows === 2 && onlyIncome.amts.every((a) => a.startsWith('+')), onlyIncome.rows + ' → ' + onlyIncome.amts.join(','));
await page.evaluate(() => { document.querySelector('#ledFlowFilter [data-ledflow="all"]').click(); });
await page.waitForTimeout(200);

await page.evaluate(() => {
  const s = document.getElementById('ledSearch');
  s.value = '老陈';
  s.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.waitForTimeout(250);
const searched = await page.evaluate(() => ({
  rows: document.querySelectorAll('#ledgerList .txn-row').length,
  txt: document.querySelector('#ledgerList .txn-row') ? document.querySelector('#ledgerList .txn-row').textContent.replace(/\s+/g, ' ').trim() : '',
}));
check('关键字搜索「老陈」命中 1 条', searched.rows === 1 && searched.txt.includes('老陈'), searched.rows + ' → ' + searched.txt.slice(0, 40));
await page.evaluate(() => {
  const s = document.getElementById('ledSearch');
  s.value = '';
  s.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.waitForTimeout(250);

// ================= 人情往来：只读 + @人名跳转 =================
const social = await page.evaluate(() => {
  const rows = Array.from(document.querySelectorAll('#ledgerList .txn-row'));
  const lock = rows.filter((r) => r.classList.contains('locked'));
  return {
    locked: lock.length,
    noDel: lock.every((r) => !r.querySelector('.icon-btn.del')),
    pills: lock.map((r) => (r.querySelector('.txn-pill') ? r.querySelector('.txn-pill').textContent : '')).filter(Boolean),
    syncBadge: document.querySelectorAll('#ledgerList .txn-pill.sync').length,
    normalHasDel: rows.filter((r) => !r.classList.contains('locked')).every((r) => !!r.querySelector('.icon-btn.del')),
  };
});
check('人情往来流水为只读（无删除按钮）', social.locked === 2 && social.noDel, 'locked=' + social.locked + ' noDel=' + social.noDel);
check('普通流水都有删除按钮', social.normalHasDel);
check('显示 @人名 药丸与「人际同步」标记', social.pills.slice().sort().join(',') === '@张伟,@李娜'.split(',').sort().join(',') && social.syncBadge === 2, social.pills.join(',') + ' / sync=' + social.syncBadge);

const beforeErrs = errs.length;
const jumpPill = await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll('#ledgerList .txn-pill')).find((p) => p.textContent === '@张伟');
  btn.click();
  return document.getElementById('view-relations').classList.contains('active');
});
check('点 @人名 药丸 → 跳到人际关系视图', jumpPill);
const jumpRow = await (async () => { await load(); return page.evaluate(() => {
  const row = document.querySelector('#ledgerList .txn-row.locked');
  row.click();
  return document.getElementById('view-relations').classList.contains('active');
}); })();
check('点人情往来整行 → 也跳到人际关系（而非打开账本编辑）', jumpRow);
if (errs.length > beforeErrs) console.log('（跳转后人际关系桩数据不全导致的异步报错，仅记录）\n' + errs.slice(beforeErrs).join('\n'));

// ================= 编辑弹窗 =================
await load();
await spy();
const editOpen = await page.evaluate(() => {
  const row = document.querySelector('#ledgerList .txn-row:not(.locked)');
  row.click();
  return {
    hidden: document.getElementById('txnModal').hidden,
    title: document.getElementById('txnModalTitle').textContent,
    submit: document.getElementById('txnSubmitBtn').textContent,
    amount: document.getElementById('txnAmount').value,
    date: document.getElementById('txnDate').value,
    acct: document.getElementById('txnAcctSel').value,
    note: document.querySelector('#txnForm [name=note]').value,
    chipOn: document.querySelector('#txnCatChips .cat-chip.on').textContent,
    chipCount: document.querySelectorAll('#txnCatChips .cat-chip').length,
    acctOpts: Array.from(document.querySelectorAll('#txnAcctSel option')).map((o) => o.value),
  };
});
check('点流水行 → 打开编辑弹窗并预填', !editOpen.hidden && editOpen.title === '编辑记录' && editOpen.submit === '保存修改', editOpen.title + '/' + editOpen.submit);
check('编辑预填金额/日期/账户/备注/分类', editOpen.amount === '25' && editOpen.date === '2026-10-09' && editOpen.acct === '支付宝' && editOpen.note === '地铁' && editOpen.chipOn === '交通',
  [editOpen.amount, editOpen.date, editOpen.acct, editOpen.note, editOpen.chipOn].join(' / '));
check('分类芯片 10 个（支出）', editOpen.chipCount === 10, 'n=' + editOpen.chipCount);
check('账户下拉含常用账户', editOpen.acctOpts.includes('微信') && editOpen.acctOpts.includes('人情往来'), editOpen.acctOpts.join(','));

// 快捷金额累加
const quick = await page.evaluate(() => {
  const a = document.getElementById('txnAmount');
  a.value = '0';
  document.querySelector('#quickAmt [data-amt="10"]').click();
  document.querySelector('#quickAmt [data-amt="50"]').click();
  const after = a.value;
  document.querySelector('#quickAmt [data-amt="clear"]').click();
  return { after, cleared: a.value };
});
check('快捷金额 +10 +50 累加 = 60', quick.after === '60', quick.after);
check('「清零」清空金额', quick.cleared === '');

// 编辑保存走 PUT
await page.evaluate(() => {
  document.getElementById('txnAmount').value = '88';
  document.getElementById('txnSubmitBtn').click();
});
await page.waitForTimeout(700);
const putCall = await page.evaluate(() => window.__calls.filter((c) => c.method === 'PUT'));
check('编辑保存 → PUT /api/transactions/:id', putCall.length === 1 && /\/api\/transactions\/\d+$/.test(putCall[0].url) && JSON.parse(putCall[0].body).amount === 88,
  putCall.length ? putCall[0].url + ' amount=' + JSON.parse(putCall[0].body).amount : '无 PUT');
check('保存后弹窗关闭', await page.evaluate(() => document.getElementById('txnModal').hidden));

// ================= 新增弹窗 =================
await spy();
const addOpen = await page.evaluate(() => {
  document.getElementById('addTxnBtn').click();
  return {
    title: document.getElementById('txnModalTitle').textContent,
    submit: document.getElementById('txnSubmitBtn').textContent,
    amount: document.getElementById('txnAmount').value,
    date: document.getElementById('txnDate').value,
    chipCount: document.querySelectorAll('#txnCatChips .cat-chip').length,
  };
});
check('「记一笔」打开空白新增弹窗', addOpen.title === '记一笔' && addOpen.submit === '保存' && addOpen.amount === '' && /^\d{4}-\d{2}-\d{2}$/.test(addOpen.date),
  addOpen.title + '/' + addOpen.submit + ' date=' + addOpen.date);

// 收支切换 → 分类芯片跟着换
const flowSwitch = await page.evaluate(async () => {
  const r = document.querySelector('#txnForm [name=flow][value=income]');
  r.checked = true;
  r.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise((s) => setTimeout(s, 120));
  return {
    chips: Array.from(document.querySelectorAll('#txnCatChips .cat-chip')).map((c) => c.textContent),
    on: document.querySelector('#txnCatChips .cat-chip.on').textContent,
  };
});
check('切「收入」→ 分类芯片变 6 个收入分类', flowSwitch.chips.length === 6 && flowSwitch.chips.includes('工资') && flowSwitch.chips.includes('红包'), flowSwitch.chips.join(','));
check('切换后默认选中第一个分类', flowSwitch.on === flowSwitch.chips[0], flowSwitch.on);

// 新保存走 POST
await page.evaluate(() => {
  document.getElementById('txnAmount').value = '123';
  document.getElementById('txnSubmitBtn').click();
});
await page.waitForTimeout(700);
const postCall = await page.evaluate(() => window.__calls.filter((c) => c.method === 'POST'));
check('新增保存 → POST /api/transactions', postCall.length === 1 && /\/api\/transactions$/.test(postCall[0].url) && JSON.parse(postCall[0].body).amount === 123,
  postCall.length ? postCall[0].url + ' amount=' + JSON.parse(postCall[0].body).amount : '无 POST');
check('新增后弹窗关闭', await page.evaluate(() => document.getElementById('txnModal').hidden));

// ================= 月份切换 =================
const monthNav = await page.evaluate(async () => {
  document.getElementById('ledPrev').click();
  await new Promise((s) => setTimeout(s, 500));
  const prev = document.getElementById('ledMonth').textContent;
  document.getElementById('ledNext').click();
  await new Promise((s) => setTimeout(s, 500));
  return { prev, back: document.getElementById('ledMonth').textContent };
});
check('上月 → 2026年09月，下月回到 2026年10月', monthNav.prev === '2026年09月' && monthNav.back === '2026年10月', monthNav.prev + ' → ' + monthNav.back);

// ================= 手机端 =================
await page.setViewportSize({ width: 390, height: 844 });
await new Promise((s) => setTimeout(s, 300));
const mobile = await page.evaluate(() => {
  const de = document.documentElement;
  return {
    overflow: de.scrollWidth - de.clientWidth,
    lsCols: getComputedStyle(document.getElementById('ledgerStats')).gridTemplateColumns.split(' ').length,
    gridCols: getComputedStyle(document.querySelector('.ledger-grid')).gridTemplateColumns.split(' ').length,
    donutW: Math.round(document.querySelector('#ledgerChart svg.donut-svg').getBoundingClientRect().width),
    // 分段按钮内的单选圆点不能被 .modal-card input{width:100%} 撑开
    segH: (() => {
      document.getElementById('addTxnBtn').click();
      const item = document.querySelectorAll('#txnForm .seg-item')[0];
      const h = Math.round(item.getBoundingClientRect().height);
      document.getElementById('txnModalClose').click();
      return h;
    })(),
  };
});
check('手机端无横向溢出', mobile.overflow <= 1, 'overflow=' + mobile.overflow + 'px');
check('手机端概览 2 列', mobile.lsCols === 2, 'cols=' + mobile.lsCols);
check('手机端图表/流水上下堆叠（1 列）', mobile.gridCols === 1, 'cols=' + mobile.gridCols);
check('手机端环图仍够大（≥140px）', mobile.donutW >= 140, 'w=' + mobile.donutW);
check('🔴 分段按钮单行（radio 未被撑成整行）', mobile.segH > 0 && mobile.segH <= 48, 'h=' + mobile.segH + 'px');
await page.setViewportSize({ width: 1440, height: 900 });

// ================= 夜间模式：无亮底 + 环图换夜间色板 =================
// 巡检目标：容器类元素（面板/行/输入框/按钮）不应在夜间残留亮底。
// 明确豁免「数据标记」——趋势柱、预算进度条、分类色块、图例色点等：它们在深色卡片上
// 本来就该是亮色，靠色相区分，这是图表的正常表现而不是「越界的亮底」。
const NIGHT_SWEEP = `(function(){
  var f = function(v){ v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4); };
  var lum = function(str){
    var m = String(str).match(/rgba?\\(([^)]+)\\)/); if(!m) return 0;
    var p = m[1].split(',').map(Number);
    if (p.length > 3 && p[3] === 0) return 0;
    return 0.2126*f(p[0]) + 0.7152*f(p[1]) + 0.0722*f(p[2]);
  };
  var MARK = '.tc-bar,.lb-bar i,.txn-ic,.dseg,.dl,.cat-tag,.txn-pill,.stat-icon,.med-stats .ms,.led-mini-legend i';
  var bad = [], skipped = 0;
  var v = document.getElementById('view-ledger');
  Array.prototype.forEach.call(v.querySelectorAll('*'), function(el){
    if (el.offsetParent === null) return;
    var cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return;
    var L = lum(cs.backgroundColor);
    if (L < 0.28) return;
    if (el.closest(MARK)) { skipped++; return; }
    bad.push(el.tagName.toLowerCase() + '.' + String(el.className||'(none)') + ' bg=' + cs.backgroundColor + ' L=' + L.toFixed(3));
  });
  return { count: bad.length, list: bad.slice(0, 12), skipped: skipped };
})()`;

const dayStroke = donut.stroke;
await load();
await page.evaluate(() => document.documentElement.setAttribute('data-mode', 'night'));
await page.waitForTimeout(300);
const night = await page.evaluate(NIGHT_SWEEP);
check('夜间账本页无亮底残留（容器类）', night.count === 0, night.count + ' 个 → ' + night.list.join(' | ') + '  [数据标记豁免 ' + night.skipped + ' 个]');
const nightStroke = await page.evaluate(() => {
  const s = document.querySelector('#ledgerChart .dseg');
  const bar = document.querySelector('.lb-bar i');
  return { seg: s ? getComputedStyle(s).stroke : '', bar: bar ? getComputedStyle(bar).backgroundColor : '' };
});
check('夜间环图使用更亮的夜间色板', nightStroke.seg !== dayStroke && /^rgb\((1[5-9]\d|2\d\d),/.test(nightStroke.seg), 'day=' + dayStroke + ' night=' + nightStroke.seg);

console.log(ok.join('\n'));
if (fails.length) console.log('\n' + fails.join('\n'));
console.log('\n通过 ' + ok.length + ' / ' + (ok.length + fails.length) + ' 项');
await browser.close();
process.exit(fails.length ? 1 : 0);
