// 日历中心（周历 / 月历）体检预览页
// 复用真实 index.html + 真实 lunar.js/profile.js/medicine.js/app.js，
// 只把 window.fetch 换成样例数据，跑的是线上同一套渲染逻辑。
// hash: #week | #month
// ⚠️ 输出到仓库根 _preview/（**不能**放 public/）——wrangler pages deploy ./public
//    会把 public 下所有文件原样上传，放进去就等于把验证页发布到线上。
import fs from 'fs';
import path from 'path';

const root = process.cwd();
let html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');

// 资源路径改为相对 _preview/ 目录
html = html.replace('href="./css/style.css"', 'href="../public/css/style.css"');
html = html.replace(/\s*<script src="\.\/js\/[^"]+"><\/script>/g, '');

const pad = (n) => String(n).padStart(2, '0');
const D = (y, m, d, hh, mm) => `${y}-${pad(m)}-${pad(d)} ${pad(hh)}:${pad(mm)}:00`;

const now = new Date();
const y = now.getFullYear();
const mo = now.getMonth() + 1;
const dd = now.getDate();

const EVENTS = [
  { id: 1, title: '周例会', start: D(y, mo, dd - 5, 9, 0), end: D(y, mo, dd - 5, 10, 0), allDay: false, calendar: '工作', color: null, location: '线上', note: '' },
  { id: 2, title: '需求评审', start: D(y, mo, dd - 5, 9, 30), end: D(y, mo, dd - 5, 11, 0), allDay: false, calendar: '工作', color: null, location: '', note: '' },
  { id: 3, title: '牙医复诊', start: D(y, mo, dd - 4, 14, 0), end: D(y, mo, dd - 4, 15, 0), allDay: false, calendar: '健康', color: null, location: '口腔医院', note: '' },
  { id: 4, title: '晨跑 5km', start: D(y, mo, dd - 3, 7, 0), end: D(y, mo, dd - 3, 8, 0), allDay: false, calendar: '健康', color: null, location: '滨江绿道', note: '' },
  { id: 5, title: '家庭聚餐', start: D(y, mo, dd - 2, 20, 0), end: D(y, mo, dd - 2, 22, 0), allDay: false, calendar: '家庭', color: null, location: '', note: '' },
  { id: 6, title: '拍摄外景', start: D(y, mo, dd - 1, 10, 0), end: D(y, mo, dd - 1, 18, 0), allDay: false, calendar: '生活', color: null, location: '西湖', note: '' },
  { id: 7, title: '咖啡约谈', start: D(y, mo, dd, 15, 0), end: D(y, mo, dd, 16, 30), allDay: false, calendar: '生活', color: null, location: 'Manner', note: '' },
  { id: 8, title: '整理照片', start: D(y, mo, dd, 0, 30), end: D(y, mo, dd, 1, 30), allDay: false, calendar: '生活', color: null, location: '', note: '' },
  { id: 9, title: '晨读', start: D(y, mo, dd + 1, 6, 0), end: D(y, mo, dd + 1, 7, 0), allDay: false, calendar: '生活', color: null, location: '', note: '' },
  { id: 10, title: '季度总结', start: D(y, mo, dd + 1, 13, 0), end: D(y, mo, dd + 1, 17, 0), allDay: false, calendar: '工作', color: null, location: '', note: '' },
  // 全天事件（含生日）
  { id: 'bday-1', title: '欧阳娜娜 的生日', start: D(y, mo, dd - 1, 0, 0), end: null, allDay: true, calendar: '家庭', color: null, location: '', note: '满 28 岁', isBirthday: true },
  { id: 11, title: '出差（北京）', start: D(y, mo, dd + 2, 0, 0), end: null, allDay: true, calendar: '工作', color: null, location: '', note: '' },
];

const HOME = {
  brand: { name: '数字生活', avatar: '数', tagline: '把日子过成自己喜欢的样子' },
  stats: {
    todos: { today: 3, overdue: 1, week: 8 },
    habits: { done: 2, total: 5 },
    ledger: { balance: 12345, income: 20000, expense: 7655 },
    medicines: { total: 18, expiring: 2 },
    events: { today: 2 },
    relations: { upcoming: 1 },
  },
  todayTasks: [], pendingHabits: [],
  appearance: { theme: 'zhiyin', font: 'default', mode: 'light' },
};

const inject = `
<style>
/* 只关掉过渡/动画，便于取计算样式；.view 的显示交给真实 CSS（勿加 !important，否则会盖掉
   #view-calendar.active 的 display:flex，导致整屏自适应失效、误判为「没生效」） */
*,*::before,*::after{transition:none!important;animation:none!important}
#report2{position:fixed;left:-99999px;top:0;width:760px}
</style>
<script>
(function(){
  var json = function(o){ return new Response(JSON.stringify(o), { status:200, headers:{'Content-Type':'application/json'} }); };
  var HOME = ${JSON.stringify(HOME)};
  var EVENTS = ${JSON.stringify(EVENTS)};
  window.fetch = function(url, opts){
    var u = String(url);
    if (u.indexOf('/api/auth/me') === 0) return Promise.resolve(json({ ok:true, user:'admin' }));
    if (u.indexOf('/api/home') === 0) return Promise.resolve(json(HOME));
    if (u.indexOf('/api/events') === 0) return Promise.resolve(json({ events: EVENTS, calendars: ['工作','生活','家庭','健康'] }));
    if (u.indexOf('/api/contacts') === 0) return Promise.resolve(json({ contacts: [] }));
    if (u.indexOf('/api/vocab') === 0) return Promise.resolve(json({ grouped:{} }));
    if (u.indexOf('/api/notifications') === 0) return Promise.resolve(json({}));
    return Promise.resolve(json({}));
  };
})();
</script>
<script src="../public/js/lunar.js"></script>
<script src="../public/js/profile.js"></script>
<script src="../public/js/medicine.js"></script>
<script src="../public/js/app.js"></script>
<script>
(async function(){
 try{
  var $ = function(s){ return document.querySelector(s); };
  var $$ = function(s){ return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var g = function(el, p){ return el ? getComputedStyle(el).getPropertyValue(p).trim() : 'N/A'; };
  var rect = function(el, label){ if(!el) return label + ' = N/A';
    var r = el.getBoundingClientRect();
    return label + ' = ' + Math.round(r.width) + 'x' + Math.round(r.height)
      + ' @x' + Math.round(r.left) + ',y' + Math.round(r.top); };

  var hash = location.hash || '#week';
  switchView('calendar');
  // #week | #month | #week-2026-10 | #month-2026-8（指定年月，用于验证 6 行月份）
  // ⚠️ 模板字符串里 \\d 必须双反斜杠：单个 \\d 会被当成「未识别转义」直接吞成 d
  var mm = hash.match(/^#(week|month)(?:-(\\d{4})-(\\d{1,2}))?/);
  calState.view = mm && mm[1] === 'month' ? 'month' : 'week';
  if (mm && mm[2]) calState.anchor = new Date(Number(mm[2]), Number(mm[3]) - 1, 1);
  $$('.cal-view').forEach(function(b){ b.classList.toggle('active', b.dataset.calview === calState.view); });
  await loadCalEvents();
  await new Promise(function(r){ setTimeout(r, 300); });

  var out = [];
  var de = document.documentElement;
  out.push('=== hash=' + hash + ' viewport=' + window.innerWidth + 'x' + window.innerHeight
    + ' docScrollH=' + de.scrollHeight + ' clientH=' + de.clientHeight
    + (de.scrollHeight > de.clientHeight + 1 ? '  <<< 竖向滚动 ' + (de.scrollHeight - de.clientHeight) + 'px' : '  (无竖向滚动)'));
  out.push(rect($('#calTitle'), 'calTitle'));
  out.push('calTitle.text = ' + ($('#calTitle') ? $('#calTitle').textContent : 'N/A'));
  var vc = $('#view-calendar');
  out.push('view-calendar display=' + g(vc, 'display') + ' inlineH=' + (vc ? vc.style.height || '(未设置)' : 'N/A'));
  out.push('hash=' + location.hash + ' anchor=' + calState.anchor.toDateString() + ' view=' + calState.view);
  out.push(rect(vc, 'view-calendar'));
  out.push(rect($('#calEyebrow'), 'eyebrow'));
  out.push(rect($('#view-calendar .growth-head'), 'growth-head'));
  out.push(rect($('.cal-panel'), 'cal-panel'));
  out.push(rect($('#calViewBox'), 'calViewBox'));

  if (calState.view === 'week') {
    var sc = $('.cal-week-scroll');
    out.push('week-scroll client=' + (sc ? sc.clientWidth + 'x' + sc.clientHeight : 'N/A')
      + ' scroll=' + (sc ? sc.scrollWidth + 'x' + sc.scrollHeight : 'N/A'));
    out.push(rect($('.cal-week-head'), 'cal-week-head'));
    out.push(rect($('.cal-week-grid'), 'cal-week-grid'));
    var rows = $$('.cal-hour');
    out.push('cal-hour rows = ' + rows.length + (rows.length ? '  first=' + Math.round(rows[0].getBoundingClientRect().height) + 'px' : ''));
    out.push(rect($('.cal-hour .hh'), '.hh'));
    out.push(rect($('.cal-hour .cal-cell'), '.cal-cell'));
    // 找到含有事件的行，看会不会被撑高
    var hs = rows.map(function(r){ return Math.round(r.getBoundingClientRect().height); });
    out.push('row heights = ' + hs.join(','));
    // 最后一小时是否在滚动区内可达
    var last = rows[rows.length - 1];
    if (last && sc) {
      out.push('last hour label=' + last.querySelector('.hh').textContent
        + ' bottom-in-scroll=' + Math.round(last.getBoundingClientRect().bottom - sc.getBoundingClientRect().top)
        + ' / scrollable=' + sc.scrollHeight);
    }
    out.push('docScrollW/clientW = ' + de.scrollWidth + '/' + de.clientWidth + (de.scrollWidth > de.clientWidth + 1 ? '  <<< 横向溢出' : ''));
  } else {
    out.push(rect($('.cal-month-head'), 'cal-month-head'));
    out.push(rect($('.cal-month-grid'), 'cal-month-grid'));
    var cells = $$('.mcell');
    out.push('mcell count = ' + cells.length + (cells.length ? '  cell=' + Math.round(cells[0].getBoundingClientRect().width) + 'x' + Math.round(cells[0].getBoundingClientRect().height) : ''));
    out.push('grid rows = ' + g($('.cal-month-grid'), 'grid-template-rows'));
    out.push(rect($('.cal-month-grid .mcell:nth-child(7)'), '7th cell'));
  }

  var pre = document.createElement('pre'); pre.id = 'report2';
  pre.style.cssText = 'position:fixed;left:-99999px;top:0;width:760px;background:#fff;color:#111;font:12px/1.5 monospace;padding:10px;white-space:pre-wrap';
  pre.textContent = out.join('\\n');
  document.body.insertBefore(pre, document.body.firstChild);
  document.title = 'REPORT_READY';
 }catch(e){
  var pe = document.createElement('pre'); pe.id = 'report2';
  pe.style.cssText = 'background:#fff;color:#900;font:12px monospace;padding:10px';
  pe.textContent = 'SCRIPT ERROR: ' + (e && e.stack ? e.stack : e);
  document.body.insertBefore(pe, document.body.firstChild);
  document.title = 'REPORT_ERROR';
 }
})();
</script>
`;

html = html.replace('</body>', () => inject + '</body>');
fs.mkdirSync(path.join(root, '_preview'), { recursive: true });
fs.writeFileSync(path.join(root, '_preview/calpreview.html'), html);
console.log('written _preview/calpreview.html');
