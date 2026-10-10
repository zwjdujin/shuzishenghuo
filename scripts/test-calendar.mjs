// 日历交互测试：点小时格是否带上正确日期/小时、上下周切换、标题与按钮语义
import { chromium } from 'file:///C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:8899/_preview/calpreview.html';

const fails = [];
const ok = [];
const check = (name, cond, extra = '') => (cond ? ok : fails).push((cond ? '✓ ' : '✗ ') + name + (extra ? '  → ' + extra : ''));

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));

// ---------- 周历 ----------
await page.goto(BASE + '#week', { waitUntil: 'load' });
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(700);

const st = await page.evaluate(() => {
  const rows = Array.from(document.querySelectorAll('.cal-hour'));
  const t = document.getElementById('calTitle').textContent;
  return {
    rows: rows.length,
    first: rows[0].querySelector('.hh').textContent,
    last: rows[rows.length - 1].querySelector('.hh').textContent,
    cols: getComputedStyle(document.querySelector('.cal-hour')).gridTemplateColumns,
    rowsStacks: rows.every((r) => r.parentElement.classList.contains('cal-week-grid')),
    title: t,
    prev: document.getElementById('calPrev').getAttribute('aria-label'),
    next: document.getElementById('calNext').getAttribute('aria-label'),
    headFmt: document.querySelector('.cal-week-head .wh small').textContent,
    allday: !!document.querySelector('.cal-allday'),
    dayHeads: document.querySelectorAll('.cal-week-head .wh').length,
  };
});
check('周历 0:00-23:00 共 24 行', st.rows === 24, 'rows=' + st.rows);
check('首行 00:00 / 末行 23:00', st.first === '00:00' && st.last === '23:00', st.first + '~' + st.last);
check('小时行竖向堆叠（非 8 列横排）', st.rowsStacks);
check('行内仍是 8 列网格', (st.cols || '').split(' ').length === 8, st.cols);
check('标题为「当前为YYYY年第N周」', /^当前为\d{4}年第\d+周$/.test(st.title), st.title);
check('上一页/下一页语义＝上一周/下一周', st.prev === '上一周' && st.next === '下一周', st.prev + '/' + st.next);
check('7 个星期表头', st.dayHeads === 7);
check('全天行已渲染（样例含生日/全天）', st.allday);

// 点 9:00 的周一格子 → 弹窗应带 09:00 与周一日期
const mondayDate = await page.evaluate(() => {
  const cells = document.querySelectorAll('.cal-hour')[9].querySelectorAll('.cal-cell');
  cells[1].click();  // [0]=周日, [1]=周一
  const f = document.getElementById('eventForm');
  return { start: f.start.value, hidden: document.getElementById('eventModal').hidden, title: document.getElementById('eventModalTitle').textContent };
});
check('点 09:00 周一 → 弹窗打开且预填 09:00', /T09:00$/.test(mondayDate.start), mondayDate.start);
check('新增日程弹窗标题正确', mondayDate.title === '新增日程', mondayDate.title);
check('弹窗可见', mondayDate.hidden === false);
await page.evaluate(() => document.getElementById('eventModalClose').click());

// 下一周 → 标题周序 +1，星期表头日期 +7 天
const before = await page.evaluate(() => document.querySelector('.cal-week-head .wh small').textContent);
await page.click('#calNext');
await page.waitForTimeout(500);
const after = await page.evaluate(() => ({
  head: document.querySelector('.cal-week-head .wh small').textContent,
  title: document.getElementById('calTitle').textContent,
}));
const d = (s) => { const m = s.match(/(\d+)\/(\d+)/); return new Date(2026, Number(m[1]) - 1, Number(m[2])); };
check('下一周：表头日期 +7 天', d(after.head) - d(before) === 7 * 86400000, before + ' → ' + after.head);
check('下一周：周序变为第 42 周', /第42周/.test(after.title), after.title);

// 上一周 / 今天
await page.click('#calPrev');
await page.waitForTimeout(400);
const back = await page.evaluate(() => document.getElementById('calTitle').textContent);
check('上一周回到第 41 周', /第41周/.test(back), back);

// ---------- 月历 ----------
await page.goto(BASE + '#month', { waitUntil: 'load' });
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(700);
const mo = await page.evaluate(() => ({
  title: document.getElementById('calTitle').textContent,
  prev: document.getElementById('calPrev').getAttribute('aria-label'),
  next: document.getElementById('calNext').getAttribute('aria-label'),
  rows: getComputedStyle(document.querySelector('.cal-month-grid')).gridTemplateRows.split(' ').length,
  cells: document.querySelectorAll('.mcell').length,
  noScroll: document.documentElement.scrollHeight <= document.documentElement.clientHeight + 1,
  fill: document.querySelector('.cal-month-grid').getBoundingClientRect().height,
  box: document.getElementById('calViewBox').getBoundingClientRect().height,
}));
check('月历标题为 YYYY年M月', /^\d{4}年\d{1,2}月$/.test(mo.title), mo.title);
check('上一页/下一页语义＝上一月/下一月', mo.prev === '上一月' && mo.next === '下一月', mo.prev + '/' + mo.next);
check('月历无页面滚动条', mo.noScroll);
check('月历网格铺满 calViewBox（差距<40px）', Math.abs(mo.fill - mo.box) < 40, 'grid=' + Math.round(mo.fill) + ' box=' + Math.round(mo.box));
check('月历行数 5~6', mo.rows >= 5 && mo.rows <= 6, 'rows=' + mo.rows);

// 6 行月份（2026-08）也要不溢出
await page.goto(BASE + '#month-2026-8', { waitUntil: 'load' });
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(700);
const aug = await page.evaluate(() => ({
  title: document.getElementById('calTitle').textContent,
  rows: getComputedStyle(document.querySelector('.cal-month-grid')).gridTemplateRows.split(' ').length,
  cellH: document.querySelector('.mcell').getBoundingClientRect().height,
  noScroll: document.documentElement.scrollHeight <= document.documentElement.clientHeight + 1,
}));
check('2026-08 为 6 行月份', aug.rows === 6, 'rows=' + aug.rows + ' title=' + aug.title);
check('2026-08 无页面滚动条', aug.noScroll);
check('2026-08 方格仍够高（≥60px）', aug.cellH >= 60, 'h=' + Math.round(aug.cellH));

// ---------- 夜间模式：日历内不应残留亮底 ----------
const NIGHT_SWEEP = `
  (function(){
    var f = function(v){ v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4); };
    var lum = function(str){
      var m = String(str).match(/rgba?\\(([^)]+)\\)/); if(!m) return 0;
      var p = m[1].split(',').map(Number);
      if (p.length > 3 && p[3] === 0) return 0;
      return 0.2126*f(p[0]) + 0.7152*f(p[1]) + 0.0722*f(p[2]);
    };
    var bad = [];
    var v = document.getElementById('view-calendar');
    Array.prototype.forEach.call(v.querySelectorAll('*'), function(el){
      if (el.offsetParent === null) return;
      var cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') return;
      var L = lum(cs.backgroundColor);
      if (L >= 0.28) bad.push(el.tagName.toLowerCase() + '.' + String(el.className||'(none)') + ' bg=' + cs.backgroundColor + ' L=' + L.toFixed(3));
    });
    return { count: bad.length, list: bad.slice(0, 15) };
  })()
`;
for (const hash of ['#week', '#month']) {
  await page.goto(BASE + hash, { waitUntil: 'load' });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(600);
  await page.evaluate(() => document.documentElement.setAttribute('data-mode', 'night'));
  await page.waitForTimeout(200);
  const sweep = await page.evaluate(NIGHT_SWEEP);
  check('夜间 ' + hash + ' 无亮底残留', sweep.count === 0, sweep.count + ' 个 → ' + sweep.list.join(' | '));
}

// ---------- 缩小窗口后重算高度 ----------
await page.goto(BASE + '#month', { waitUntil: 'load' });
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(600);
await page.setViewportSize({ width: 1440, height: 700 });
await page.waitForTimeout(400);
const resized = await page.evaluate(() => ({
  h: document.getElementById('view-calendar').style.height,
  noScroll: document.documentElement.scrollHeight <= document.documentElement.clientHeight + 1,
}));
check('窗口变矮后高度重算且不溢出', resized.noScroll, 'inlineH=' + resized.h);

console.log([...ok, ...fails].join('\n'));
console.log('\n结果：' + ok.length + ' 通过 / ' + fails.length + ' 失败');
if (errs.length) console.log(errs.join('\n'));
await browser.close();
process.exit(fails.length ? 1 : 0);
