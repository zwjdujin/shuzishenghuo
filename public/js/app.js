// 数字生活 · 前端逻辑 v0.3.2
const VERSION = '0.3.2';
// 本次发版信息（系统信息页展示）
const __BUILD_ID__ = '待更新 · 提交 71a49ac';
const __BUILD_TIME__ = '2026-10-09 14:15';

// 同步状态（数据实时写入云端 D1，无待同步队列）
let __SYNC_TIME__ = '尚未同步';
let __PENDING__ = '0 项';
let __CONFLICT__ = '0 项';
// 每次成功调用写接口后更新「最近成功同步」
function markSynced() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  __SYNC_TIME__ = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  __PENDING__ = '0 项';
}

// 全局错误兜底：任何未捕获错误都在页面顶部显示红条，避免“点了没反应”却毫无提示
function fatal(msg) {
  let b = document.getElementById('fatalBanner');
  if (!b) {
    b = document.createElement('div');
    b.id = 'fatalBanner';
    b.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:9999;background:#b00020;color:#fff;font:13px/1.5 -apple-system,system-ui,sans-serif;padding:10px 14px;white-space:pre-wrap;box-shadow:0 2px 8px rgba(0,0,0,.3)';
    (document.body || document.documentElement).appendChild(b);
  }
  b.textContent = '⚠ 页面出错：' + msg;
}
window.addEventListener('error', (e) => fatal(e.message + (e.filename ? ` @ ${e.filename}:${e.lineno}` : '')));
window.addEventListener('unhandledrejection', (e) => fatal('Promise: ' + (e.reason && e.reason.message ? e.reason.message : e.reason)));

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function money(n) {
  return '¥' + Math.round(Number(n || 0)).toLocaleString('zh-CN');
}
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2200);
}
async function api(path, opts = {}) {
  const res = await fetch(path, { credentials: 'same-origin', ...opts });
  if (res.status === 401) {
    showLogin();
    throw new Error('unauthorized');
  }
  return res;
}

// ===== 主题配色 =====
const THEMES = {
  plum:  { base: '#4d3045', soft: '#e8dfe5', label: '绛紫' },
  terra: { base: '#b65f42', soft: '#f3dfd6', label: '赤陶' },
  sage:  { base: '#627a67', soft: '#dfe8df', label: '青绿' },
  sand:  { base: '#a57c45', soft: '#eee2ce', label: '砂金' },
  clay:  { base: '#8f4f3b', soft: '#ecd9d0', label: '陶土' },
};
let currentTheme = 'plum';
function applyTheme(name) {
  const t = THEMES[name] || THEMES.plum;
  currentTheme = name in THEMES ? name : 'plum';
  const root = document.documentElement;
  root.style.setProperty('--plum', t.base);
  root.style.setProperty('--plum-soft', t.soft);
}

// ===== 登录 =====
function showLogin() {
  $('#appShell').hidden = true;
  $('#loginOverlay').hidden = false;
  $('#loginError').hidden = true;
}
function showLoginError(msg) {
  const err = $('#loginError');
  err.textContent = msg;
  err.hidden = false;
}
// 登录：直接用 fetch，不要把 401 交给 api() 包装函数（否则会被静默吞掉、毫无提示）
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const btn = e.target.querySelector('button');
  const user = String(fd.get('user') || '').trim();
  const pass = String(fd.get('pass') || '');
  if (!user || !pass) { showLoginError('请输入用户名和密码'); return; }
  btn.disabled = true;
  showLoginError('');
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ user, pass }),
    });
    let data = {};
    try { data = await res.json(); } catch (_) {}
    if (!res.ok) {
      showLoginError(data.error || ('登录失败（HTTP ' + res.status + '）'));
      return;
    }
    // 登录成功：进入主界面
    $('#loginOverlay').hidden = true;
    $('#appShell').hidden = false;
    try {
      await loadHome();
    } catch (err) {
      showLoginError('已登录，但加载首页失败：' + (err && err.message ? err.message : err));
      $('#loginOverlay').hidden = false;
      $('#appShell').hidden = true;
    }
  } catch (err) {
    showLoginError('网络错误，无法连接服务器：' + (err && err.message ? err.message : err));
  } finally {
    btn.disabled = false;
  }
});

// 退出登录（入口在「个人中心」）
async function doLogout() {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  showLogin();
}

// ===== 启动：检查登录状态 =====
async function boot() {
  $('#versionText').textContent = 'v' + VERSION;
  const lv = $('#loginVersion');
  if (lv) lv.textContent = '当前版本：v' + VERSION;
  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (res.ok) {
      $('#loginOverlay').hidden = true;
      $('#appShell').hidden = false;
      await loadHome();
      maybeNotifyTodos();
      document.addEventListener('visibilitychange', () => { if (!document.hidden) maybeNotifyTodos(); });
    } else {
      showLogin();
    }
  } catch {
    showLogin();
  }
}

// ===== 加载首页数据 =====
async function loadHome() {
  const res = await api('/api/home');
  const data = await res.json();
  markSynced();
  renderHome(data);
}

// 十二时辰 → 循行经络（子午流注）
const SHICHEN = [
  { name: '子时', range: '23:00-01:00', meridian: '足少阳胆经', tip: '子时睡得足，黑眼圈不露' },
  { name: '丑时', range: '01:00-03:00', meridian: '足厥阴肝经', tip: '丑时不睡晚，脸上不长斑' },
  { name: '寅时', range: '03:00-05:00', meridian: '手太阴肺经', tip: '寅时睡得熟，色红精气足' },
  { name: '卯时', range: '05:00-07:00', meridian: '手阳明大肠经', tip: '卯时大肠蠕，排毒渣滓出' },
  { name: '辰时', range: '07:00-09:00', meridian: '足阳明胃经', tip: '辰时吃早餐，营养身体安' },
  { name: '巳时', range: '09:00-11:00', meridian: '足太阴脾经', tip: '巳时脾经旺，造血身体壮' },
  { name: '午时', range: '11:00-13:00', meridian: '手少阴心经', tip: '午时一小憩，安神养精气' },
  { name: '未时', range: '13:00-15:00', meridian: '手太阳小肠经', tip: '未时分清浊，饮水能降火' },
  { name: '申时', range: '15:00-17:00', meridian: '足太阳膀胱经', tip: '申时津液足，养阴身体舒' },
  { name: '酉时', range: '17:00-19:00', meridian: '足少阴肾经', tip: '酉时肾藏精，纳华元气清' },
  { name: '戌时', range: '19:00-21:00', meridian: '手厥阴心包经', tip: '戌时护心脏，减压心舒畅' },
  { name: '亥时', range: '21:00-23:00', meridian: '手少阳三焦经', tip: '亥时百脉通，养身养娇容' },
];
function shichenOf(hour) {
  // 每个时辰占 2 小时：子 23-1, 丑 1-3, ... 亥 21-23
  const idx = Math.floor(((hour + 1) % 24) / 2);
  return SHICHEN[idx];
}
function renderShichen(hour) {
  const sc = shichenOf(hour);
  const orbit = $('.score-orbit');
  // 时辰名写进中间徽标，时间段写在下方小字
  const badge = $('#dayBadge');
  if (badge) badge.textContent = sc.name;
  if (orbit) {
    let small = orbit.querySelector('.shichen-range');
    if (!small) {
      small = document.createElement('small');
      small.className = 'shichen-range';
      orbit.appendChild(small);
    }
    small.textContent = sc.range;
  }
  const g = $('#heroGreeting');
  if (g) g.textContent = sc.meridian;
  const s = $('#heroSummary');
  if (s) s.textContent = sc.tip;
}

function renderHome(d) {
  // 品牌
  $('#brandAvatar').textContent = (d.brand && d.brand.avatar) || '数';
  $('#brandName').textContent = (d.brand && d.brand.name) || '数字生活';
  $('#brandTagline').textContent = (d.brand && d.brand.tagline) || '把日子过成自己喜欢的样子';
  if (d.brand && d.brand.theme) applyTheme(d.brand.theme);

  // Hero 问候：按十二时辰显示时辰 + 对应循行经络
  const h = new Date().getHours();
  renderShichen(h);

  // 统计卡
  const s = d.stats;
  $('#stTodos').textContent = s.todos.today;
  $('#stTodosHint').textContent = `逾期 ${s.todos.overdue} · 本周 ${s.todos.week}`;
  $('#card-todos').querySelector('.stat-icon').style.background = s.todos.overdue > 0 ? '#fdf0ee' : '';
  $('#stHabits').textContent = `${s.habits.done} / ${s.habits.total}`;
  $('#stHabitsHint').textContent = '今日完成';
  $('#stLedger').textContent = money(s.ledger.balance);
  $('#stLedgerHint').textContent = `收 ${money(s.ledger.income)} · 支 ${money(s.ledger.expense)}`;
  $('#stMedicine').textContent = s.medicines.total;
  $('#stMedicineHint').textContent = `临期 ${s.medicines.expiring}`;
  $('#stCalendar').textContent = s.events.today;
  $('#stCalendarHint').textContent = '今日事件';
  $('#stRelations').textContent = s.relations.upcoming;
  $('#stRelationsHint').textContent = '近期生日';

  renderTodayTasks(d.todayTasks || []);
  renderPendingHabits(d.pendingHabits || []);
  renderGlance(d);
}

function summaryLine(s) {
  if (s.todos.overdue > 0) return `有 ${s.todos.overdue} 件待办已逾期，先处理一下吧。`;
  if (s.todos.today > 0) return `今天有 ${s.todos.today} 件待办，挑最要紧的先做完。`;
  if (s.habits.total > 0 && s.habits.done < s.habits.total) return '习惯还差一点点，顺手打个卡？';
  if (s.medicines.expiring > 0) return `药箱有 ${s.medicines.expiring} 件临期，留意一下。`;
  return '今天节奏不错，慢慢来，先把要处理的事看一眼。';
}

function renderTodayTasks(list) {
  const box = $('#todayTasks');
  box.innerHTML = '';
  if (!list.length) {
    box.innerHTML = '<div class="empty-hint">今天没有要处理的事，真好。</div>';
    return;
  }
  list.forEach((t) => {
    const row = document.createElement('div');
    row.className = 'todo-row' + (t.overdue ? ' overdue' : '');
    row.innerHTML = `
      <span class="dot"></span>
      <div class="main"><b></b><small></small></div>
      <span class="when"></span>`;
    row.querySelector('.main b').textContent = t.title;
    row.querySelector('.main small').textContent = [t.list, t.priority && t.priority.startsWith('P') ? t.priority : ''].filter(Boolean).join(' · ');
    row.querySelector('.when').textContent = t.when || '';
    if (t.actionable) {
      const btn = document.createElement('button');
      btn.className = 'done-btn';
      btn.title = '标记完成';
      btn.innerHTML = '<svg><use href="#i-check"/></svg>';
      btn.addEventListener('click', () => markDone(t.id, row));
      row.appendChild(btn);
    }
    box.appendChild(row);
  });
}

async function markDone(id, rowEl) {
  try {
    const res = await api(`/api/todos/${id}/done`, { method: 'POST' });
    if (res.ok) {
      rowEl.style.opacity = '.5';
      setTimeout(async () => {
        toast('已完成，干得漂亮');
        await loadHome();
      }, 200);
    }
  } catch {
    /* 401 已处理 */
  }
}

function renderPendingHabits(list) {
  const box = $('#pendingHabits');
  box.innerHTML = '';
  if (!list.length) {
    box.innerHTML = '<div class="empty-hint">今天的习惯都完成啦，继续保持。</div>';
    return;
  }
  list.forEach((h) => {
    const el = document.createElement('div');
    el.className = 'habit-pill';
    const cat = h.category ? `<small>${h.category}</small>` : '<small>待打卡</small>';
    el.innerHTML = `<svg><use href="#i-${h.icon || 'sprout'}"/></svg><b></b>${cat}`;
    el.querySelector('b').textContent = h.name;
    box.appendChild(el);
  });
}

function renderGlance(d) {
  const s = d.stats;
  const items = [
    { icon: 'sprout', name: '成长打卡', val: `${s.habits.done}/${s.habits.total} 完成` },
    { icon: 'bell', name: '待办提醒', val: `今日 ${s.todos.today} · 逾期 ${s.todos.overdue}` },
    { icon: 'wallet', name: '我的账本', val: `结余 ${money(s.ledger.balance)}` },
    { icon: 'pill', name: '家庭药箱', val: `共 ${s.medicines.total} · 临期 ${s.medicines.expiring}` },
    { icon: 'calendar', name: '日历中心', val: `今日 ${s.events.today} 件` },
    { icon: 'people', name: '人际关系', val: `近期生日 ${s.relations.upcoming}` },
  ];
  const box = $('#moduleGlance');
  box.innerHTML = '';
  items.forEach((it) => {
    const el = document.createElement('div');
    el.className = 'glance-item';
    el.innerHTML = `<svg><use href="#i-${it.icon}"/></svg><div><b></b><small></small></div>`;
    el.querySelector('b').textContent = it.name;
    el.querySelector('small').textContent = it.val;
    box.appendChild(el);
  });
}

// ===== 日历中心（周历 / 月历 / 农历） =====
const CAL_COLOR = { 工作: '#4d3045', 生活: '#627a67', 家庭: '#a57c45', 健康: '#b65f42' };
const calColorOf = (c) => CAL_COLOR[c] || '#746d63';
const WK = ['日', '一', '二', '三', '四', '五', '六'];

function ymd(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function todayStrLocal() { return ymd(new Date()); }

let calState = { view: 'week', anchor: new Date(), events: [] };

// 年月选择器：年份可手输/步进，月份下拉
function initCalPicker() {
  const ms = $('#calMonth');
  if (ms && !ms.dataset.filled) {
    ms.innerHTML = Array.from({ length: 12 }, (_, i) => `<option value="${i}">${i + 1}月</option>`).join('');
    ms.dataset.filled = '1';
  }
  syncCalPicker();
}
function syncCalPicker() {
  const y = $('#calYear');
  const ms = $('#calMonth');
  if (!y || !ms) return;
  const a = calState.anchor;
  y.value = a.getFullYear();
  ms.value = String(a.getMonth());
}
function applyCalPicker() {
  const y = $('#calYear');
  const ms = $('#calMonth');
  if (!y || !ms) return;
  const year = Math.min(2100, Math.max(1900, Number(y.value) || 2000));
  const month = Number(ms.value) || 0;
  calState.anchor = new Date(year, month, 1);
  syncCalPicker();
  loadCalEvents();
}

// 加载当前视图范围的事件
async function loadCalEvents() {
  initCalPicker();
  const a = calState.anchor;
  let from, to;
  if (calState.view === 'week') {
    const s = startOfWeek(a);
    from = ymd(s);
    to = ymd(addDays(s, 6));
  } else {
    const s = new Date(a.getFullYear(), a.getMonth(), 1);
    const e = new Date(a.getFullYear(), a.getMonth() + 1, 0);
    from = ymd(s);
    to = ymd(e);
  }
  try {
    const res = await api(`/api/events?from=${from}&to=${to}`);
    const data = await res.json();
    calState.events = data.events || [];
    fillCalendarSel('#eventCalendarSel', data.calendars || Object.keys(CAL_COLOR));
    renderCalLegend(data.calendars || Object.keys(CAL_COLOR));
    // 合并勾选了「在日历中显示」的联系人生日
    await mergeBirthdays(from, to);
    renderCalView();
    markSynced();
  } catch (err) {
    if (!String(err.message).includes('unauthorized')) {
      $('#calViewBox').innerHTML = '<div class="empty-hint">加载日程失败</div>';
    }
  }
}

// 把勾选了日历显示的生日合并进事件列表（作为全天事件）
async function mergeBirthdays(from, to) {
  try {
    const res = await api('/api/contacts');
    const data = await res.json();
    (data.contacts || [])
      .filter((c) => c.showInCalendar && c.nextBirthday)
      .forEach((c) => {
        if (c.nextBirthday < from || c.nextBirthday > to) return;
        calState.events.push({
          id: 'bday-' + c.id,
          title: `${c.name} 的生日`,
          start: `${c.nextBirthday} 00:00:00`,
          end: null,
          allDay: true,
          calendar: '家庭',
          color: null,
          location: '',
          note: c.age !== null && c.age !== undefined ? `满 ${c.age} 岁` : '',
          isBirthday: true,
        });
      });
  } catch { /* 未登录时忽略 */ }
}

function fillCalendarSel(sel, list) {
  const el = $(sel);
  if (!el || el.dataset.filled === list.join(',')) return;
  el.innerHTML = list.map((c) => `<option value="${c}">${c}</option>`).join('');
  el.dataset.filled = list.join(',');
}

function renderCalLegend(list) {
  const box = $('#calLegend');
  if (!box) return;
  box.innerHTML = list
    .map((c) => `<span class="lg"><i class="dot" style="background:${calColorOf(c)}"></i>${c}</span>`)
    .join('');
}

function startOfWeek(d) {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  s.setDate(s.getDate() - s.getDay());
  return s;
}
function addDays(d, n) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

function renderCalView() {
  const box = $('#calViewBox');
  const title = $('#calTitle');
  if (!box) return;
  if (calState.view === 'week') {
    const s = startOfWeek(calState.anchor);
    const e = addDays(s, 6);
    title.textContent = `${s.getMonth() + 1}月${s.getDate()}日 - ${e.getMonth() + 1}月${e.getDate()}日 · 第${s.getFullYear()}年`;
    box.innerHTML = '';
    box.appendChild(buildWeekView(s));
  } else {
    const a = calState.anchor;
    title.textContent = `${a.getFullYear()}年${a.getMonth() + 1}月`;
    box.innerHTML = '';
    box.appendChild(buildMonthView(a));
  }
}

// 月历：整月 7 列网格，每格带农历与事件
function buildMonthView(anchor) {
  const wrap = document.createElement('div');
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  const first = new Date(y, m, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const prevDays = new Date(y, m, 0).getDate();
  const today = todayStrLocal();

  const head = document.createElement('div');
  head.className = 'cal-month-head';
  WK.forEach((w, i) => {
    const s = document.createElement('span');
    s.textContent = w;
    if (i === 0 || i === 6) s.className = 'we';
    head.appendChild(s);
  });
  wrap.appendChild(head);

  const grid = document.createElement('div');
  grid.className = 'cal-month-grid';

  // 前置补白（上月）
  for (let i = startPad - 1; i >= 0; i--) {
    grid.appendChild(makeCell(new Date(y, m - 1, prevDays - i), true, today));
  }
  // 本月
  for (let d = 1; d <= daysInMonth; d++) {
    grid.appendChild(makeCell(new Date(y, m, d), false, today));
  }
  // 后置补白（补满整行）
  const rest = (7 - (grid.children.length % 7)) % 7;
  for (let d = 1; d <= rest; d++) {
    grid.appendChild(makeCell(new Date(y, m + 1, d), true, today));
  }
  wrap.appendChild(grid);
  return wrap;
}

function makeCell(date, out, today) {
  const cell = document.createElement('div');
  cell.className = 'mcell' + (out ? ' out' : '') + (ymd(date) === today ? ' today' : '');
  const lun = lunarLabel(date);
  const evs = eventsOn(ymd(date));

  const top = document.createElement('div');
  top.className = 'mcell-top';
  top.innerHTML = `<span class="mcell-day">${date.getDate()}</span><span class="mcell-lunar${lun.isFestival ? ' fest' : ''}"></span>`;
  top.querySelector('.mcell-lunar').textContent = lun.text;
  cell.appendChild(top);

  const box = document.createElement('div');
  box.className = 'mcell-evs';
  evs.slice(0, 3).forEach((ev) => {
    const b = document.createElement('div');
    b.className = 'mev';
    b.dataset.evid = ev.id;
    b.style.background = ev.color || calColorOf(ev.calendar);
    b.textContent = (ev.allDay ? '' : ev.start.slice(11, 16) + ' ') + ev.title;
    b.title = ev.title;
    b.addEventListener('click', (e) => { e.stopPropagation(); openEventModal(ev); });
    box.appendChild(b);
  });
  if (evs.length > 3) {
    const more = document.createElement('div');
    more.className = 'mev-more';
    more.textContent = `+${evs.length - 3} 更多`;
    box.appendChild(more);
  }
  cell.appendChild(box);
  cell.addEventListener('click', () => openEventModal(null, ymd(date)));
  return cell;
}

function eventsOn(dateStr) {
  return calState.events.filter((ev) => ymd(new Date(ev.start.replace(' ', 'T'))) === dateStr);
}

// 周历：7 天 × 时间轴（8:00-22:00）
function buildWeekView(start) {
  const wrap = document.createElement('div');
  const today = todayStrLocal();
  const H0 = 8;
  const H1 = 22;

  const head = document.createElement('div');
  head.className = 'cal-week-head';
  head.appendChild(document.createElement('div'));
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    const lun = lunarLabel(d);
    const h = document.createElement('div');
    h.className = 'wh' + (ymd(d) === today ? ' today' : '');
    h.innerHTML = `<b>周${WK[d.getDay()]}</b><small></small>`;
    h.querySelector('small').textContent = `${d.getMonth() + 1}/${d.getDate()} ${lun.text}`;
    h.addEventListener('click', () => openEventModal(null, ymd(d)));
    head.appendChild(h);
  }
  wrap.appendChild(head);

  const grid = document.createElement('div');
  grid.className = 'cal-week-grid';

  for (let hh = H0; hh <= H1; hh++) {
    const row = document.createElement('div');
    row.className = 'cal-hour';
    const lab = document.createElement('div');
    lab.className = 'hh';
    lab.textContent = String(hh).padStart(2, '0') + ':00';
    row.appendChild(lab);
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      const cell = document.createElement('div');
      cell.className = 'cal-cell';
      // 该小时内的事件
      evsInHour(d, hh).forEach((ev) => {
        const b = document.createElement('div');
        b.className = 'wev';
        b.dataset.evid = ev.id;
        b.style.background = ev.color || calColorOf(ev.calendar);
        b.textContent = ev.title;
        b.title = `${ev.title}${ev.location ? ' @ ' + ev.location : ''}`;
        b.addEventListener('click', (e) => { e.stopPropagation(); openEventModal(ev); });
        cell.appendChild(b);
      });
      cell.addEventListener('click', () => openEventModal(null, ymd(d), hh));
      row.appendChild(cell);
    }
    grid.appendChild(row);
  }
  wrap.appendChild(grid);
  return wrap;
}

function evsInHour(date, hour) {
  const ds = ymd(date);
  return calState.events.filter((ev) => {
    if (ev.allDay) return false;
    const dt = new Date(ev.start.replace(' ', 'T'));
    return ymd(dt) === ds && dt.getHours() === hour;
  });
}

async function switchCalView(v) {
  calState.view = v;
  $$('.cal-view').forEach((b) => b.classList.toggle('active', b.dataset.calview === v));
  await loadCalEvents();
}
function calShift(dir) {
  const a = calState.anchor;
  if (calState.view === 'week') calState.anchor = addDays(a, dir * 7);
  else calState.anchor = new Date(a.getFullYear(), a.getMonth() + dir, 1);
  syncCalPicker();
  loadCalEvents();
}

// ===== 日程弹窗 =====
let editingEventId = null;
function openEventModal(ev, presetDate, presetHour) {
  // 生日为虚拟事件，不可编辑
  if (ev && ev.isBirthday) {
    toast('生日由联系人资料生成，请在「人际关系」中修改');
    return;
  }
  editingEventId = ev ? ev.id : null;
  const f = $('#eventForm');
  f.reset();
  $('#eventModalTitle').textContent = ev ? '编辑日程' : '新增日程';
  $('#eventFormError').hidden = true;
  $('#eventDeleteBtn').hidden = !ev;

  if (ev) {
    f.title.value = ev.title;
    f.start.value = (ev.start || '').replace(' ', 'T').slice(0, 16);
    f.end.value = (ev.end || '').replace(' ', 'T').slice(0, 16);
    f.calendar.value = ev.calendar || '生活';
    f.location.value = ev.location || '';
    f.note.value = ev.note || '';
    f.allDay.checked = !!ev.allDay;
  } else {
    const d = presetDate ? new Date(presetDate + 'T00:00:00') : new Date();
    const h = presetHour === undefined ? new Date().getHours() + 1 : presetHour;
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.min(Math.max(h, 0), 23), 0, 0);
    f.start.value = toLocalInput(start);
    f.end.value = toLocalInput(new Date(start.getTime() + 3600000));
    f.calendar.value = '生活';
  }
  $('#eventModal').hidden = false;
}
function toLocalInput(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function closeEventModal() { $('#eventModal').hidden = true; }

// ===== 待办提醒（今日 + P0-P3 优先级筛选） =====
let todoLists = ['生活'];
const PRIO_DESC = { P0: '重要且紧急', P1: '重要不紧急', P2: '紧急不重要', P3: '不重要不紧急' };
let todoFilter = { priority: [], list: '' };

async function renderTodos() {
  const box = $('#todoList');
  if (!box) return;
  box.innerHTML = '<div class="empty-hint">加载中…</div>';
  const qs = new URLSearchParams();
  qs.set('scope', 'today');
  if (todoFilter.priority.length) qs.set('priority', todoFilter.priority.join(','));
  if (todoFilter.list) qs.set('list', todoFilter.list);
  try {
    const res = await api('/api/todos?' + qs.toString());
    const data = await res.json();
    todoLists = data.lists || todoLists;
    fillCalendarSel('#todoListSel', todoLists);
    renderTodoFilters(data.counts || {});
    const list = data.todos || [];
    $('#todoCount').textContent = list.length ? `共 ${list.length} 项` : '';
    box.innerHTML = '';
    if (!list.length) {
      box.innerHTML = '<div class="empty-hint">' +
        (todoFilter.priority.length || todoFilter.list ? '当前筛选条件下没有待办' : '今天没有待办，轻松一天 ☕') +
        '</div>';
      return;
    }
    list.forEach((t) => {
      const row = document.createElement('div');
      row.className = 'todo-row' + (t.overdue ? ' overdue' : '');
      row.innerHTML = `
        <button class="todo-check" title="标记完成"><svg><use href="#i-check"/></svg></button>
        <div class="todo-main"><b></b><div class="todo-meta"></div></div>
        <button class="icon-btn del" title="删除"><svg><use href="#i-x"/></svg></button>`;
      row.querySelector('b').textContent = t.title;
      const meta = row.querySelector('.todo-meta');
      meta.innerHTML =
        `<span class="prio-pill ${t.priority}">${t.priority} ${PRIO_DESC[t.priority] || ''}</span>` +
        `<span class="todo-pill">${t.list}</span>` +
        (t.overdue ? `<span class="todo-pill high">逾期 ${t.date}</span>` : '') +
        (t.note ? `<span>${t.note}</span>` : '');
      if (t.time) {
        const tm = document.createElement('span');
        tm.className = 'todo-time';
        tm.textContent = t.time;
        row.querySelector('.todo-main').appendChild(tm);
      }
      row.querySelector('.todo-check').addEventListener('click', () => finishTodo(t.id));
      row.querySelector('.del').addEventListener('click', () => removeTodo(t.id, t.title));
      if (t.time) {
        const al = document.createElement('button');
        al.className = 'icon-btn alarm';
        al.title = '设为系统闹钟';
        al.innerHTML = '<svg><use href="#i-clock"/></svg>';
        al.addEventListener('click', () => setSystemAlarm(t));
        row.querySelector('.del').before(al);
      }
      box.appendChild(row);
    });
    markSynced();
  } catch (err) {
    if (!String(err.message).includes('unauthorized')) box.innerHTML = '<div class="empty-hint">加载待办失败</div>';
  }
}

// 筛选栏：优先级多选 + 类别单选
function renderTodoFilters(counts) {
  const pBox = $('#tfPriority');
  const lBox = $('#tfList');
  if (!pBox || !lBox) return;
  // 优先级
  pBox.innerHTML = ['P0', 'P1', 'P2', 'P3'].map((p) =>
    `<button class="tf-chip${todoFilter.priority.includes(p) ? ' on' : ''}" data-p="${p}">${p} ${PRIO_DESC[p]}<span class="n">${counts[p] || 0}</span></button>`
  ).join('');
  pBox.querySelectorAll('.tf-chip').forEach((b) =>
    b.addEventListener('click', () => {
      const p = b.dataset.p;
      const i = todoFilter.priority.indexOf(p);
      if (i >= 0) todoFilter.priority.splice(i, 1);
      else todoFilter.priority.push(p);
      renderTodos();
    })
  );
  // 类别
  lBox.innerHTML =
    `<button class="tf-chip${todoFilter.list === '' ? ' on' : ''}" data-l="">全部</button>` +
    todoLists.map((l) =>
      `<button class="tf-chip${todoFilter.list === l ? ' on' : ''}" data-l="${l}">${l}</button>`
    ).join('');
  lBox.querySelectorAll('.tf-chip').forEach((b) =>
    b.addEventListener('click', () => {
      todoFilter.list = b.dataset.l;
      renderTodos();
    })
  );
}

async function finishTodo(id) {
  try {
    const res = await api(`/api/todos/${id}/done`, { method: 'POST' });
    if (res.ok) { toast('已完成，干得漂亮'); markSynced(); await renderTodos(); }
  } catch { /* 401 已处理 */ }
}
async function removeTodo(id, title) {
  if (!confirm(`确定删除待办「${title}」？`)) return;
  try {
    const res = await api(`/api/todos/${id}/delete`, { method: 'DELETE' });
    if (res.ok) { toast('已删除'); markSynced(); await renderTodos(); }
  } catch { /* 401 已处理 */ }
}

// ===== 通知与提醒 =====
// A 打开即提醒：本地通知汇总今日/逾期待办
// B Web Push：订阅 + 后台到点推送
// C 系统闹钟：Android intent 深链拉起系统时钟（best-effort）
const NOTIFY_KEY = 'szsh_todo_notify';
function nowHHMM() {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
// A：打开 APP 时若有到期/逾期待办，弹一条本地通知
async function maybeNotifyTodos() {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (localStorage.getItem(NOTIFY_KEY) !== '1') return;
    const res = await api('/api/todos?scope=today');
    const data = await res.json();
    const list = (data.todos || []).filter((t) => !t.done);
    if (!list.length) return;
    const due = list.filter((t) => t.overdue || (t.time && t.time <= nowHHMM()));
    if (!due.length) return;
    const body = due.slice(0, 6).map((t) => (t.time ? t.time + ' ' : '') + t.title).join('\n') +
      (due.length > 6 ? `\n…等 ${due.length} 项` : '');
    const title = `待办 ${due.length} 项${list.some((t) => t.overdue) ? '（含逾期）' : ''}`;
    const opts = { body, icon: './icons/icon-512.png', tag: 'szsh-daily', renotify: true };
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg && reg.showNotification) reg.showNotification(title, opts);
    else new Notification(title, opts);
  } catch (_) { /* 通知失败不影响主流程 */ }
}
// A：开启通知（请求权限 + 记住偏好 + 尝试订阅 Push）
async function enableTodoNotify() {
  if (!('Notification' in window)) { toast('当前环境不支持通知'); return; }
  let p = Notification.permission;
  if (p === 'default') p = await Notification.requestPermission();
  if (p === 'granted') {
    localStorage.setItem(NOTIFY_KEY, '1');
    toast('已开启待办通知');
    await subscribePush();
    maybeNotifyTodos();
  } else {
    toast('通知权限被拒绝，请在浏览器/系统设置中开启');
  }
}
// B：订阅 Web Push（VAPID 由后端 /api/push/vapid 提供；失败静默）
async function subscribePush() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
    if (Notification.permission !== 'granted') return false;
    const vres = await fetch('/api/push/vapid');
    if (!vres.ok) return false;
    const { publicKey } = await vres.json();
    if (!publicKey) return false;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKey });
    await api('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub),
    });
    return true;
  } catch (_) { return false; }
}
// C：系统闹钟深链（拉起系统时钟 App 预填闹钟；机型差异大，属 best-effort）
function setSystemAlarm(t) {
  if (!t.time) { toast('该待办没有设定时间'); return; }
  const [h, m] = t.time.split(':').map(Number);
  const msg = encodeURIComponent(t.title || '数字生活待办');
  const uri = 'intent://#Intent;action=android.intent.action.SET_ALARM;package=com.android.deskclock;' +
    `S.android.intent.extra.alarm.MESSAGE=${msg};` +
    `i.android.intent.extra.alarm.HOUR=${h};i.android.intent.extra.alarm.MINUTES=${m};end`;
  toast('正在拉起系统时钟…');
  window.location.href = uri;
}

// ===== 我的账本 =====
let ledgerState = { month: todayStrLocal().slice(0, 7) };
const DONUT_COLORS = ['#4d3045', '#b65f42', '#627a67', '#a57c45', '#8f4f3b', '#7a6a8f', '#4a7a8c', '#8a7a4a'];

async function renderLedger() {
  const box = $('#ledgerStats');
  if (!box) return;
  $('#ledMonth').textContent = ledgerState.month.replace('-', '年') + '月';
  try {
    const res = await api(`/api/transactions?month=${ledgerState.month}`);
    const data = await res.json();
    renderLedgerStats(data.summary || {});
    renderDonut(data.catStats || []);
    renderTxnList(data.list || []);
    // 分类下拉按收入/支出切换
    $('#txnCatSel') && fillTxnCats(data.categories || {});
    markSynced();
  } catch (err) {
    if (!String(err.message).includes('unauthorized')) box.innerHTML = '<div class="empty-hint">加载账本失败</div>';
  }
}

function renderLedgerStats(s) {
  const box = $('#ledgerStats');
  box.innerHTML = `
    <div class="ls"><span>本月收入</span><strong style="color:var(--green)">${money(s.income)}</strong></div>
    <div class="ls"><span>本月支出</span><strong style="color:var(--red)">${money(s.expense)}</strong></div>
    <div class="ls"><span>本月结余</span><strong>${money(s.balance)}</strong></div>`;
}

// 内联 SVG 甜甜圈图（无外部库）
function renderDonut(cats) {
  const box = $('#ledgerChart');
  box.innerHTML = '';
  if (!cats.length) {
    box.innerHTML = '<div class="empty-hint">本月还没有支出记录</div>';
    return;
  }
  const total = cats.reduce((s, c) => s + c.value, 0) || 1;
  const R = 60;
  const CX = 80;
  const CY = 80;
  const CIRC = 2 * Math.PI * R;
  let offset = 0;
  let paths = '';
  let legend = '<div class="donut-legend">';
  cats.forEach((c, i) => {
    const frac = c.value / total;
    const color = DONUT_COLORS[i % DONUT_COLORS.length];
    const dash = frac * CIRC;
    paths += `<circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="${color}" stroke-width="22"
      stroke-dasharray="${dash} ${CIRC - dash}" stroke-dashoffset="${-offset}"
      transform="rotate(-90 ${CX} ${CY})"/>`;
    offset += dash;
    legend += `<div class="dl"><i class="dot" style="background:${color}"></i><span class="nm">${c.name}</span>
      <span class="vl">${money(c.value)}</span><span class="pc">${Math.round(frac * 100)}%</span></div>`;
  });
  legend += '</div>';
  box.innerHTML =
    `<svg viewBox="0 0 160 160" width="160" height="160" style="max-width:100%">
      ${paths}
      <text x="${CX}" y="${CY - 2}" text-anchor="middle" font-size="11" fill="#746d63">本月支出</text>
      <text x="${CX}" y="${CY + 16}" text-anchor="middle" font-size="15" font-weight="700" fill="#29251f">${money(total)}</text>
    </svg>` + legend;
}

function renderTxnList(list) {
  const box = $('#ledgerList');
  box.innerHTML = '';
  if (!list.length) {
    box.innerHTML = '<div class="empty-hint">本月还没有流水</div>';
    return;
  }
  list.forEach((t) => {
    const row = document.createElement('div');
    row.className = 'txn-row';
    const isExp = t.flow === 'expense';
    row.innerHTML = `
      <span class="cat-tag" style="background:${catTint(t.category === '餐饮' ? 'terra' : 'plum')};color:${catColor(t.category === '餐饮' ? 'terra' : 'plum')}">${t.category}</span>
      <div class="todo-main"><b style="font-size:13px">${t.note || t.category}</b><div class="todo-meta"><span>${t.date}</span></div></div>
      <span class="txn-amt ${isExp ? 'exp' : 'inc'}">${isExp ? '-' : '+'}${money(t.amount)}</span>
      <button class="icon-btn del" title="删除"><svg><use href="#i-x"/></svg></button>`;
    row.querySelector('.del').addEventListener('click', () => removeTxn(t.id));
    box.appendChild(row);
  });
}

async function removeTxn(id) {
  if (!confirm('确定删除这笔记录？')) return;
  try {
    const res = await api(`/api/transactions?id=${id}`, { method: 'DELETE' });
    if (res.ok) { toast('已删除'); markSynced(); await renderLedger(); }
  } catch { /* 401 已处理 */ }
}

let txnCats = { expense: ['其他'], income: ['其他'] };
function fillTxnCats(cats) {
  txnCats = cats;
  syncTxnCats();
}
function syncTxnCats() {
  const sel = $('#txnCatSel');
  if (!sel) return;
  const flow = ($('#txnForm') && $('#txnForm').flow.value) || 'expense';
  const list = (txnCats && txnCats[flow]) || ['其他'];
  sel.innerHTML = list.map((c) => `<option value="${c}">${c}</option>`).join('');
}

// ===== 人际关系（联系人 + 生日） =====
let contactRelations = ['家人', '亲戚', '朋友', '同事', '同学', '其他'];
let editingContactId = null;

async function renderContacts() {
  const listBox = $('#contactList');
  if (!listBox) return;
  listBox.innerHTML = '<div class="empty-hint">加载中…</div>';
  try {
    const res = await api('/api/contacts');
    const data = await res.json();
    contactRelations = data.relations || contactRelations;
    fillCalendarSel('#contactRelSel', contactRelations);
    renderContactsList(data.contacts || []);
    markSynced();
  } catch (err) {
    if (!String(err.message).includes('unauthorized')) listBox.innerHTML = '<div class="empty-hint">加载联系人失败</div>';
  }
}

function renderContactsList(list) {
  const box = $('#contactList');
  $('#contactCount').textContent = list.length ? `共 ${list.length} 人` : '';
  box.innerHTML = '';
  if (!list.length) {
    box.innerHTML = '<div class="empty-hint">还没有联系人，点右上角添加</div>';
    renderBirthdays([]);
    return;
  }
  list.forEach((c) => {
    const row = document.createElement('div');
    row.className = 'contact-row';
    const color = catColor(CAT_ORDER[c.name.length % CAT_ORDER.length]);
    row.innerHTML = `
      <span class="contact-avatar" style="background:${color}"></span>
      <div class="contact-main"><b></b><div class="contact-meta"></div></div>
      ${c.phone ? '<span class="contact-phone"></span>' : ''}`;
    row.querySelector('.contact-avatar').textContent = c.name.slice(0, 1);
    row.querySelector('b').textContent = c.name;
    const meta = row.querySelector('.contact-meta');
    meta.innerHTML =
      (c.relation ? `<span class="contact-badge">${c.relation}</span>` : '') +
      (c.showInCalendar ? '<span class="contact-badge cal">日历显示</span>' : '') +
      (c.note ? `<span>${c.note}</span>` : '');
    if (c.phone) row.querySelector('.contact-phone').textContent = c.phone;
    row.addEventListener('click', () => openContactModal(c));
    box.appendChild(row);
  });
  renderBirthdays(list);
}

// 生日卡片：60 天内 + 已勾选日历显示
function renderBirthdays(list) {
  const box = $('#bdayList');
  if (!box) return;
  const items = list
    .filter((c) => c.daysLeft !== null && (c.daysLeft <= 60 || c.showInCalendar))
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 12);
  if (!items.length) {
    box.innerHTML = '<div class="empty-hint">还没有设置生日的联系人</div>';
    return;
  }
  box.innerHTML = items
    .map((c) => {
      const soon = c.daysLeft <= 7;
      const when = c.daysLeft === 0 ? '就是今天' : `还有 ${c.daysLeft} 天`;
      const ageTxt = c.age !== null && c.age !== undefined ? ` · 满 ${c.age} 岁` : '';
      return `<div class="bday-card${c.showInCalendar ? ' in-cal' : ''}">
        <div class="bday-top"><span class="bday-name">${c.name}</span>
          <span class="bday-days${soon ? ' soon' : ''}">${when}</span></div>
        <div class="bd">下次生日 <b>${c.nextBirthday}</b>${ageTxt}</div>
        ${c.showInCalendar ? '<div class="bd" style="font-size:11px">已同步到日历</div>' : ''}
      </div>`;
    })
    .join('');
}

function openContactModal(c) {
  editingContactId = c ? c.id : null;
  const f = $('#contactForm');
  f.reset();
  $('#contactModalTitle').textContent = c ? '编辑联系人' : '添加联系人';
  $('#contactFormError').hidden = true;
  $('#contactDeleteBtn').hidden = !c;
  if (c) {
    f.name.value = c.name;
    f.relation.value = c.relation || '';
    f.birthday.value = c.birthday || '';
    f.phone.value = c.phone || '';
    f.note.value = c.note || '';
    f.showInCalendar.checked = !!c.showInCalendar;
  }
  $('#contactModal').hidden = false;
}
function closeContactModal() { $('#contactModal').hidden = true; }

// ===== 导航切换 =====
// keepTab：从子菜单进入个人中心时，保留已选中的子页，不强制回到默认页
function switchView(name, opts = {}) {
  const target = $('#view-' + name);
  if (!target) return;
  $$('.view').forEach((v) => v.classList.remove('active'));
  target.classList.add('active');
  $$('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.nav === name));
  $$('.mobile-nav > button, .mnav-profile > button').forEach((n) =>
    n.classList.toggle('active', n.dataset.nav === name)
  );
  if (name === 'growth') renderGrowth();
  if (name === 'settings') {
    renderSettings();
    switchProfileTab(opts.keepTab ? currentProfileTab : 'site');
  }
  if (name === 'calendar') loadCalEvents();
  if (name === 'todos') renderTodos();
  if (name === 'ledger') renderLedger();
  if (name === 'relations') { if (window.pfLoadList) pfLoadList(); }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
document.addEventListener('click', (e) => {
  const navEl = e.target.closest('[data-nav]');
  // 移动端「我的」按钮只负责弹子菜单，不直接切视图（由它自己的监听器处理）
  if (navEl && navEl.id !== 'profileBtnMobile') {
    switchView(navEl.dataset.nav);
  }
});

// ===== 成长打卡 =====
const CAT_COLOR = { plum:'#4d3045', terra:'#b65f42', sage:'#627a67', sand:'#a57c45', clay:'#8f4f3b' };
const CAT_ORDER = ['plum', 'terra', 'sage', 'sand', 'clay'];
const catColor = (c) => CAT_COLOR[c] || '#746d63';
const catTint = (c) => catColor(c) + '1f'; // 半透明底色

// 按时间打卡的单位备选项（用户直接选，无需手输）
const DURATION_UNITS = ['秒', '分钟', '小时'];

// 根据打卡方式填充单位下拉：按次→次；按时间→秒/分钟/小时
function fillUnitOptions(method, preferred) {
  const sel = $('#unitSelect');
  if (!sel) return;
  const options = method === 'duration' ? DURATION_UNITS : ['次'];
  const want = preferred && options.includes(preferred) ? preferred : options[0];
  sel.innerHTML = options.map((u) => `<option value="${u}">${u}</option>`).join('');
  sel.value = want;
}

// 打卡方式切换时，联动单位下拉与提示文案
function syncMethodUI(method, preferred) {
  fillUnitOptions(method, preferred);
  const hint = $('#methodHint');
  if (hint) {
    hint.textContent =
      method === 'duration'
        ? '按时间：一天累计时长，单位可选秒/分钟/小时。'
        : '按次：每打一次卡 +1。';
  }
}

async function renderGrowth() {
  try {
    const [hRes, hmRes] = await Promise.all([
      api('/api/habits'),
      api('/api/habits/heatmap?days=60'),
    ]);
    const habits = (await hRes.json()).habits || [];
    window.__habits = habits;
    const heat = await hmRes.json();
    renderCheckin(habits);
    renderHabitGrid(habits);
    renderHeatmap(heat);
  } catch (err) {
    if (String(err.message).includes('unauthorized')) return;
    $('#growthToday').innerHTML = '<div class="empty-hint">加载失败：' + (err && err.message ? err.message : err) + '</div>';
  }
}

function checkinCard(h) {
  const el = document.createElement('div');
  el.className = 'checkin-card';
  const cat = `<span class="cat-tag" style="background:${catTint(h.color)};color:${catColor(h.color)}">${h.category}</span>`;
  let sub, actions;
  if (h.type === 'sleep') {
    sub = `目标 ${h.bed_time || '--:--'} 前睡 / ${h.rise_time || '--:--'} 前起 / ${h.nap_time || '--:--'} 午睡`;
    const parts = [['bed', '早睡', h.today.done_bed], ['rise', '早起', h.today.done_rise], ['nap', '午睡', h.today.done_nap]];
    actions = parts.map((p) => `<button class="chk-btn ${p[2] ? 'on' : ''}" data-id="${h.id}" data-field="${p[0]}">${p[1]}</button>`).join('');
  } else if (h.method === 'duration') {
    // 按时间打卡：快捷按钮与输入框都跟随所选单位（秒/分钟/小时）
    const UNIT_STEPS = { 秒: [10, 20, 30], 分钟: [15, 30, 60], 小时: [1, 2, 3] };
    const steps = UNIT_STEPS[h.unit] || UNIT_STEPS['分钟'];
    sub = `按时间打卡 · 目标 ${h.target} ${h.unit}`;
    const cur = h.today.done || 0;
    const pct = h.target > 0 ? Math.min(100, Math.round((cur / h.target) * 100)) : 0;
    actions = `
      <div class="dur-control">
        <div class="dur-progress"><i style="width:${pct}%"></i><span>${cur} / ${h.target} ${h.unit}</span></div>
        <div class="dur-quick">
          ${steps.map((s) => `<button class="chip" data-id="${h.id}" data-val="${s}">+${s}</button>`).join('')}
        </div>
        <div class="dur-input">
          <input type="number" min="1" value="10" class="dur-min" data-id="${h.id}" aria-label="${h.unit}">
          <span>${h.unit}</span>
          <button class="chk-btn" data-id="${h.id}" data-field="done" data-input="1">记录</button>
        </div>
      </div>`;
  } else {
    sub = `按次打卡 · 目标 ${h.target} ${h.unit}`;
    actions = `
      <div class="count-control">
        <button class="chk-btn round" data-id="${h.id}" data-field="done" data-dec="1" aria-label="减少">−</button>
        <span class="cnt">${h.today.done || 0}<i> / ${h.target} ${h.unit}</i></span>
        <button class="chk-btn" data-id="${h.id}" data-field="done" data-inc="1">打卡 +1</button>
      </div>`;
  }
  el.innerHTML = `
    <div class="ci-main">
      <span class="ci-icon" style="background:${catTint(h.color)};color:${catColor(h.color)}"><svg><use href="#i-${h.icon}"/></svg></span>
      <div class="ci-text"><b></b><small>${cat} ${sub}</small></div>
    </div>
    <div class="ci-actions${h.type === 'sleep' ? ' tri' : ''}">${actions}</div>`;
  el.querySelector('b').textContent = h.name;

  el.querySelectorAll('.chk-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      if (btn.dataset.input) {
        const inp = btn.parentElement.querySelector('.dur-min');
        const v = Number(inp.value) || 0;
        if (v > 0) checkHabit(id, 'done', v);
      } else if (btn.dataset.dec) {
        checkHabit(id, 'done', -1);
      } else if (btn.dataset.inc) {
        checkHabit(id, 'done', 1);
      } else {
        checkHabit(id, btn.dataset.field); // 睡眠：翻转该项
      }
    });
  });
  el.querySelectorAll('.chip').forEach((c) => {
    c.addEventListener('click', () => checkHabit(Number(c.dataset.id), 'done', Number(c.dataset.val)));
  });
  return el;
}

function renderCheckin(habits) {
  const box = $('#growthToday');
  box.innerHTML = '';
  const pending = habits.filter((h) => !h.today.todayDone);
  $('#growthTodayCount').textContent = pending.length ? `共 ${pending.length} 项待完成` : '';
  if (!pending.length) {
    box.innerHTML = '<div class="empty-hint">今天的习惯都完成啦，继续保持 🎉</div>';
    return;
  }
  pending.forEach((h) => box.appendChild(checkinCard(h)));
}

async function checkHabit(id, field, value) {
  try {
    const body = value === undefined ? { field } : { field, value };
    const res = await api(`/api/habits/${id}/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      toast('已记录 ✓');
      markSynced();
      await renderGrowth();
    }
  } catch { /* 401 已处理 */ }
}

function renderHabitGrid(habits) {
  const box = $('#growthAll');
  box.innerHTML = '';
  if (!habits.length) {
    box.innerHTML = '<div class="empty-hint">还没有习惯，点右上角「新增习惯」开始吧。</div>';
    return;
  }
  habits.forEach((h) => {
    const el = document.createElement('div');
    el.className = 'habit-card';
    let prog;
    if (h.type === 'sleep') {
      prog = `今日 ${h.today.done_bed + h.today.done_rise + h.today.done_nap}/3 完成`;
    } else {
      prog = `今日 ${h.today.done || 0} / ${h.target} ${h.unit}`;
    }
    const typeTag = h.type === 'sleep' ? ' · 睡眠' : (h.method === 'duration' ? ' · 按时长' : ' · 按次');
    el.innerHTML = `
      <div class="hc-top">
        <span class="ci-icon" style="background:${catTint(h.color)};color:${catColor(h.color)}"><svg><use href="#i-${h.icon}"/></svg></span>
        <div class="hc-meta"><b></b><small>${h.category}${typeTag}</small></div>
        <button class="icon-btn edit" data-id="${h.id}" title="编辑" aria-label="编辑"><svg><use href="#i-edit"/></svg></button>
        <button class="icon-btn del" data-id="${h.id}" title="删除" aria-label="删除"><svg><use href="#i-x"/></svg></button>
      </div>
      <div class="hc-prog">${prog}</div>`;
    el.querySelector('b').textContent = h.name;
    el.querySelector('.edit').addEventListener('click', () => editHabit(h.id));
    el.querySelector('.del').addEventListener('click', () => deleteHabit(h.id, h.name));
    box.appendChild(el);
  });
}

async function deleteHabit(id, name) {
  if (!confirm(`确定删除习惯「${name}」？其打卡记录也会一并清除。`)) return;
  try {
    const res = await api(`/api/habits/${id}`, { method: 'DELETE' });
    if (res.ok) { toast('已删除'); markSynced(); await renderGrowth(); }
  } catch { /* 401 已处理 */ }
}

function renderHeatmap(heat) {
  const box = $('#growthHeatmap');
  box.innerHTML = '';
  const days = heat.days || [];
  const cats = heat.categories || [];
  if (!cats.length) {
    box.innerHTML = '<div class="empty-hint">暂无打卡数据，先去打几次卡吧。</div>';
    return;
  }
  const wrap = document.createElement('div');
  wrap.className = 'heatmap-scroll';
  cats.forEach((c) => {
    const block = document.createElement('div');
    block.className = 'heatmap-block';
    const label = document.createElement('div');
    label.className = 'hm-label';
    label.textContent = c.name;
    label.style.color = catColor(c.color);
    const cells = document.createElement('div');
    cells.className = 'hm-cells';
    c.values.forEach((v) => {
      const cell = document.createElement('span');
      cell.className = 'hm-cell';
      if (v <= 0) {
        cell.style.background = '#ece5db';
      } else {
        const op = v >= 1 ? 1 : v >= 0.5 ? 0.62 : 0.3;
        cell.style.background = catColor(c.color);
        cell.style.opacity = op;
      }
      cell.title = `${c.name}：${Math.round(v * 100)}%`;
      cells.appendChild(cell);
    });
    block.appendChild(label);
    block.appendChild(cells);
    wrap.appendChild(block);
  });
  box.appendChild(wrap);
  const tip = document.createElement('p');
  tip.className = 'hm-tip';
  tip.textContent = `最近 ${days.length} 天 · 颜色越深代表当日完成度越高`;
  box.appendChild(tip);
}

// ===== 新增 / 编辑 习惯弹窗 =====
let editingId = null;

function openHabitModal() {
  editingId = null;
  $('#habitModalTitle').textContent = '新增习惯';
  $('#habitForm').reset();
  const f = $('#habitForm');
  f.querySelector('[name=category]').value = '学习';
  f.querySelector('[name=target]').value = 1;
  $('#customCatField').hidden = true;
  $('#sleepField').hidden = true;
  $('#methodField').hidden = false;
  f.querySelector('[name=method][value=count]').checked = true;
  fillUnitOptions('count');
  $('#habitFormError').hidden = true;
  $('#habitModal').hidden = false;
}

async function editHabit(id) {
  const habits = window.__habits || [];
  const h = habits.find((x) => x.id === id);
  if (!h) return;
  editingId = id;
  $('#habitModalTitle').textContent = '编辑「' + h.name + '」';
  const f = $('#habitForm');
  f.reset();
  f.querySelector('[name=name]').value = h.name;
  const preset = ['学习', '锻炼', '睡眠'].includes(h.category);
  const catSel = f.querySelector('[name=category]');
  if (preset) {
    catSel.value = h.category;
    $('#customCatField').hidden = true;
  } else {
    catSel.value = '__custom__';
    $('#customCatField').hidden = false;
    f.querySelector('[name=customCategory]').value = h.category;
  }
  const isSleep = h.type === 'sleep' || h.category === '睡眠';
  $('#sleepField').hidden = !isSleep;
  $('#methodField').hidden = isSleep;
  const method = isSleep ? 'count' : (h.method === 'duration' ? 'duration' : 'count');
  if (isSleep) {
    f.querySelector('[name=bed_time]').value = h.bed_time || '23:00';
    f.querySelector('[name=rise_time]').value = h.rise_time || '07:00';
    const nt = (h.nap_time || '12:30-14:00').split('-');
    f.querySelector('[name=nap_start]').value = nt[0] || '12:30';
    f.querySelector('[name=nap_end]').value = nt[1] || '14:00';
  } else {
    f.querySelector(`[name=method][value="${method}"]`).checked = true;
    f.querySelector('[name=target]').value = h.target || 1;
  }
  f.querySelector('[name=icon]').value = h.icon || 'sprout';
  f.querySelector('[name=color]').value = h.color || 'sage';
  syncMethodUI(method, h.unit);
  $('#habitFormError').hidden = true;
  $('#habitModal').hidden = false;
}

function closeHabitModal() { $('#habitModal').hidden = true; }
function showHabitFormError(msg) { const el = $('#habitFormError'); el.textContent = msg; el.hidden = false; }

$('#addHabitBtn').addEventListener('click', openHabitModal);
$('#habitModalClose').addEventListener('click', closeHabitModal);
$('#habitModal').addEventListener('click', (e) => { if (e.target === $('#habitModal')) closeHabitModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeHabitModal(); });

$('#habitForm').querySelector('[name=category]').addEventListener('change', (e) => {
  const v = e.target.value;
  $('#customCatField').hidden = v !== '__custom__';
  $('#sleepField').hidden = v !== '睡眠';
  $('#methodField').hidden = v === '睡眠';
});

// 切换打卡方式时，联动单位下拉（按次→次；按时间→秒/分钟/小时）
$$('#habitForm [name=method]').forEach((r) =>
  r.addEventListener('change', (e) => {
    if (e.target.checked) syncMethodUI(e.target.value);
  })
);

$('#habitForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const catSel = fd.get('category');
  let category, type = 'normal', bed_time = null, rise_time = null, nap_time = null, method = 'count', target = 1, unit = null;
  if (catSel === '__custom__') {
    category = (fd.get('customCategory') || '').trim() || '自定义';
  } else {
    category = catSel;
    if (catSel === '睡眠') {
      type = 'sleep';
      bed_time = fd.get('bed_time');
      rise_time = fd.get('rise_time');
      nap_time = `${fd.get('nap_start') || ''}-${fd.get('nap_end') || ''}`;
    }
  }
  if (type === 'normal') {
    method = fd.get('method') === 'duration' ? 'duration' : 'count';
    target = Number(fd.get('target')) || 1;
    unit = (fd.get('unit') || '').trim() || (method === 'duration' ? '分钟' : '次');
  }
  const name = (fd.get('name') || '').trim();
  if (!name) { showHabitFormError('请填写习惯名称'); return; }
  const payload = {
    name, icon: fd.get('icon') || 'sprout', color: fd.get('color') || 'sage',
    category, type, method, target, unit, bed_time, rise_time, nap_time,
  };
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  try {
    const url = editingId ? `/api/habits/${editingId}` : '/api/habits';
    const httpMethod = editingId ? 'PUT' : 'POST';
    const res = await api(url, {
      method: httpMethod,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      closeHabitModal();
      toast(editingId ? '已更新习惯' : '已新增习惯');
      markSynced();
      await renderGrowth();
    } else {
      const d = await res.json().catch(() => ({}));
      showHabitFormError(d.error || '保存失败');
    }
  } catch (err) {
    if (!String(err.message).includes('unauthorized')) showHabitFormError('网络错误：' + (err && err.message ? err.message : err));
  } finally {
    btn.disabled = false;
  }
});

// ===== 个人中心 =====
// 子页名称（站点信息 / 风格字体 / 账户安全）
const PROFILE_TITLES = { site: '站点信息', style: '风格字体', security: '账户安全', sysinfo: '系统信息' };

function buildThemeGrid() {
  const grid = $('#themeGrid');
  if (!grid) return;
  grid.innerHTML = '';
  Object.keys(THEMES).forEach((k) => {
    const t = THEMES[k];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'theme-swatch' + (k === currentTheme ? ' active' : '');
    b.style.background = t.base;
    b.innerHTML = `<span>${t.label}</span>`;
    b.addEventListener('click', () => {
      currentTheme = k;
      applyTheme(k);
      buildThemeGrid();
    });
    grid.appendChild(b);
  });
}

async function renderSettings() {
  try {
    const res = await api('/api/settings');
    const data = await res.json();
    const s = data.settings || {};
    $('#setBrandName').value = s.brand_name || '';
    $('#setBrandAvatar').value = s.brand_avatar || '';
    $('#setBrandTagline').value = s.brand_tagline || '';
    currentTheme = s.theme && THEMES[s.theme] ? s.theme : 'plum';
    applyTheme(currentTheme);
    buildThemeGrid();
  } catch (err) {
    if (String(err.message).includes('unauthorized')) return;
  }
}

async function renderSessions() {
  const box = $('#deviceList');
  if (!box) return;
  box.innerHTML = '<div class="empty-hint">加载中…</div>';
  try {
    const res = await api('/api/sessions');
    const data = await res.json();
    const devices = data.devices || [];
    if (!devices.length) {
      box.innerHTML = '<div class="empty-hint">暂无登录设备记录。</div>';
      return;
    }
    box.innerHTML = '';
    devices.forEach((d) => {
      const el = document.createElement('div');
      el.className = 'device-item' + (d.current ? ' current' : '');
      el.innerHTML = `
        <div class="dev-icon"><svg><use href="#i-people"/></svg></div>
        <div class="dev-main">
          <b></b>
          <small></small>
          <em></em>
        </div>
        <div class="dev-action"></div>`;
      el.querySelector('b').textContent = d.terminal;
      el.querySelector('small').textContent = `${d.browser} · IP ${d.ip}`;
      el.querySelector('em').textContent = `登录于 ${d.loginAt}${d.lastSeen && d.lastSeen !== d.loginAt ? ' · 最近活跃 ' + d.lastSeen : ''}`;
      const act = el.querySelector('.dev-action');
      if (d.current) {
        const tag = document.createElement('span');
        tag.className = 'dev-current-tag';
        tag.textContent = '当前设备';
        act.appendChild(tag);
      } else {
        const btn = document.createElement('button');
        btn.className = 'chip danger-chip';
        btn.textContent = '登出';
        btn.addEventListener('click', () => revokeSession(d.sid));
        act.appendChild(btn);
      }
      box.appendChild(el);
    });
  } catch (err) {
    if (String(err.message).includes('unauthorized')) return;
    box.innerHTML = '<div class="empty-hint">加载设备失败。</div>';
  }
}

async function revokeSession(sid) {
  if (!confirm('确定登出该设备？该设备上的登录将立即失效。')) return;
  try {
    const res = await api(`/api/sessions/${sid}`, { method: 'DELETE' });
    if (res.ok) {
      toast('已登出该设备');
      await renderSessions();
    }
  } catch { /* 401 已处理 */ }
}

// ===== 系统信息 =====
// 采集当前客户端（浏览器/设备）信息
function collectClientInfo() {
  const ua = navigator.userAgent || '';
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);

  let browser = '未知浏览器';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
  else if (/MicroMessenger/i.test(ua)) browser = '微信内置浏览器';
  else if (/Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua)) browser = 'Safari';

  let os = '未知系统';
  if (/Windows NT/i.test(ua)) os = 'Windows';
  else if (/iPhone/i.test(ua)) os = 'iOS (iPhone)';
  else if (/iPad/i.test(ua)) os = 'iOS (iPad)';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  // 设备型号：Android 上可从 UA 抽取型号
  let model = isMobile ? (navigator.userAgentData && navigator.userAgentData.model) || '' : '';
  if (!model) {
    const m = /Android[^;)]*;\s*([^;)]+?)\s*(?:Build|\))/i.exec(ua);
    if (m) model = m[1].trim();
  }
  if (!model) {
    if (/iPhone/i.test(ua)) model = 'iPhone';
    else if (/iPad/i.test(ua)) model = 'iPad';
    else model = '桌面设备';
  }

  const arch = /arm|aarch64/i.test(ua) ? 'ARM (64 位)' : 'x86 / x64';
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '未知';
  const lang = navigator.language || '未知';
  const cores = navigator.hardwareConcurrency || '未知';
  const mem = navigator.deviceMemory ? `${navigator.deviceMemory} GB（近似）` : '浏览器未提供';

  return {
    version: 'v' + VERSION,
    releaseTime: __BUILD_TIME__,
    build: __BUILD_ID__,
    client: browser + (isMobile ? '（移动端）' : '（桌面端）'),
    system: os,
    model: model,
    arch: arch,
    engine: browser === 'Chrome' || browser === 'Edge' || browser === 'Opera' ? 'Blink' :
            browser === 'Firefox' ? 'Gecko' : browser === 'Safari' || /iPhone|iPad|Mac OS/.test(ua) ? 'WebKit' : '未知',
    language: lang + ` · ${cores} 核 · ${mem}`,
    screen: `${screen.width} × ${screen.height} 像素 · ${window.devicePixelRatio || 1}x 缩放 · ${window.innerWidth}×${window.innerHeight} 可视区`,
    timezone: tz,
  };
}

// 渲染信息网格（键值对）
function renderInfoGrid(box, rows) {
  box.innerHTML = '';
  rows.forEach(([k, v]) => {
    const el = document.createElement('div');
    el.className = 'info-row';
    el.innerHTML = '<span class="info-k"></span><span class="info-v"></span>';
    el.querySelector('.info-k').textContent = k;
    el.querySelector('.info-v').textContent = v;
    box.appendChild(el);
  });
}

async function renderSysInfo() {
  const instBox = $('#infoInstance');
  const cliBox = $('#infoClient');
  const syncBox = $('#infoSync');
  [instBox, cliBox, syncBox].forEach((b) => { if (b) b.innerHTML = '<div class="empty-hint">加载中…</div>'; });

  // 客户端信息（本地即可采集，先渲染避免等待）
  const cli = collectClientInfo();
  renderInfoGrid(cliBox, [
    ['客户端版本', cli.version],
    ['发版时间', cli.releaseTime],
    ['构建', cli.build],
    ['客户端', cli.client],
    ['系统', cli.system],
    ['设备型号', cli.model],
    ['架构', cli.arch],
    ['运行引擎', cli.engine],
    ['语言', cli.language],
    ['屏幕分辨率', cli.screen],
    ['时区', cli.timezone],
  ]);

  // 云端实例信息
  let inst = {}, health = { ok: false, ms: 0, note: '未检测' };
  try {
    const t0 = performance.now();
    const res = await api('/api/sysinfo');
    const data = await res.json();
    inst = data.instance || {};
    health = data.health || {};
    // 健康检查耗时以浏览器实测+服务端耗时中的较大值展示更贴近真实
    const rtt = Math.round(performance.now() - t0);
    renderInfoGrid(instBox, [
      ['实例版本', inst.version || '未知'],
      ['实例构建', inst.build || '未知'],
      ['实例部署时间', inst.deployTime || '未知'],
      ['数据库版本', inst.dbVersion || '未知'],
      ['数据库后端', inst.dbBackend || '未知'],
      ['对象存储', inst.storage || '未知'],
      ['部署平台', inst.platform || '未知'],
      ['部署来源', inst.source || '未知'],
      ['后端运行时', inst.backend || '未知'],
      ['边缘节点', inst.colo || '未知'],
      ['访问协议', (inst.protocol || 'https').toUpperCase()],
    ]);
    renderInfoGrid(syncBox, [
      ['实例连接状况', health.ok ? '● 正常' : '○ ' + (health.note || '异常')],
      ['健康检查耗时', `${health.ms ?? rtt} ms（服务端） · ${rtt} ms（往返）`],
      ['最近成功同步', __SYNC_TIME__],
      ['待同步', __PENDING__],
      ['失败或冲突', __CONFLICT__],
    ]);
  } catch (err) {
    const msg = String(err.message).includes('unauthorized') ? '未登录' : '加载失败';
    if (instBox) instBox.innerHTML = `<div class="empty-hint">${msg}</div>`;
    if (syncBox) syncBox.innerHTML = `<div class="empty-hint">${msg}</div>`;
  }
}

$('#saveSettingsBtn').addEventListener('click', async () => {
  const payload = {
    brand_name: ($('#setBrandName').value || '').trim() || '数字生活',
    brand_avatar: ($('#setBrandAvatar').value || '').trim() || '数',
    brand_tagline: ($('#setBrandTagline').value || '').trim() || '把日子过成自己喜欢的样子',
    theme: currentTheme,
  };
  const btn = $('#saveSettingsBtn');
  btn.disabled = true;
  try {
    const res = await api('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const d = await res.json();
      if (d.settings) {
        applyTheme(d.settings.theme);
        $('#brandAvatar').textContent = d.settings.brand_avatar;
        $('#brandName').textContent = d.settings.brand_name;
        $('#brandTagline').textContent = d.settings.brand_tagline;
      }
      toast('已保存');
      markSynced();
    } else {
      toast('保存失败');
    }
  } catch { /* 401 已处理 */ }
  finally { btn.disabled = false; }
});

$('#logoutBtn2').addEventListener('click', doLogout);

// ===== 个人中心子菜单（唯一入口） =====
// 记住当前选中的子页，从子菜单进入时不被 switchView 重置
let currentProfileTab = 'site';
function switchProfileTab(name) {
  const tab = name && PROFILE_TITLES[name] ? name : 'site';
  currentProfileTab = tab;
  $$('.profile-page').forEach((p) => p.classList.toggle('active', p.id === 'page-' + tab));
  if (tab === 'security') renderSessions();
  if (tab === 'sysinfo') renderSysInfo();
}

// 从子菜单进入个人中心的指定子页
function openProfileTab(name) {
  switchProfileTab(name);
  switchView('settings', { keepTab: true });
}

// 侧栏与移动端两套「个人中心 / 我的」按钮 + 子菜单
const PROFILE_MENUS = [
  { btn: '#profileBtn', pop: '#profilePopover' },
  { btn: '#profileBtnMobile', pop: '#profilePopoverMobile' },
];
function closeAllProfilePopovers() {
  PROFILE_MENUS.forEach(({ pop }) => { const p = $(pop); if (p) p.hidden = true; });
}
PROFILE_MENUS.forEach(({ btn, pop }) => {
  const b = $(btn);
  const p = $(pop);
  if (!b || !p) return;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = p.hidden;
    closeAllProfilePopovers();
    p.hidden = !willOpen;
  });
});

// 子菜单项点击：进入对应子页并关闭所有子菜单
document.addEventListener('click', (e) => {
  const tabEl = e.target.closest('[data-ptab]');
  if (tabEl) {
    openProfileTab(tabEl.dataset.ptab);
    closeAllProfilePopovers();
    return;
  }
  // 点击页面其他处关闭子菜单
  const inMenu = PROFILE_MENUS.some(({ btn, pop }) =>
    e.target.closest(pop) || e.target.closest(btn)
  );
  if (!inMenu) closeAllProfilePopovers();
});

// ===== 日历中心交互 =====
$$('.cal-view').forEach((b) => b.addEventListener('click', () => switchCalView(b.dataset.calview)));
$('#calPrev').addEventListener('click', () => calShift(-1));
$('#calNext').addEventListener('click', () => calShift(1));
$('#calToday').addEventListener('click', () => { calState.anchor = new Date(); initCalPicker(); loadCalEvents(); });
$('#calMonth').addEventListener('change', applyCalPicker);
$('#calYear').addEventListener('change', applyCalPicker);
$('#calYear').addEventListener('blur', applyCalPicker);
$('#addEventBtn').addEventListener('click', () => openEventModal(null));
$('#eventModalClose').addEventListener('click', closeEventModal);
$('#eventModal').addEventListener('click', (e) => { if (e.target === $('#eventModal')) closeEventModal(); });
$('#eventForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const title = String(fd.get('title') || '').trim();
  if (!title) { const el = $('#eventFormError'); el.textContent = '请填写标题'; el.hidden = false; return; }
  const payload = {
    title,
    start: String(fd.get('start') || '').replace('T', ' '),
    end: String(fd.get('end') || '').replace('T', ' '),
    calendar: fd.get('calendar'),
    location: fd.get('location'),
    note: fd.get('note'),
    allDay: e.target.allDay.checked,
  };
  if (!payload.start) { const el = $('#eventFormError'); el.textContent = '请选择开始时间'; el.hidden = false; return; }
  try {
    const url = editingEventId ? `/api/events?id=${editingEventId}` : '/api/events';
    const method = editingEventId ? 'PUT' : 'POST';
    const res = await api(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingEventId ? { ...payload, id: editingEventId } : payload),
    });
    if (res.ok) {
      closeEventModal();
      toast(editingEventId ? '已更新日程' : '已新增日程');
      markSynced();
      await loadCalEvents();
    }
  } catch (err) {
    if (!String(err.message).includes('unauthorized')) {
      const el = $('#eventFormError'); el.textContent = '保存失败'; el.hidden = false;
    }
  }
});
// 删除事件
$('#eventDeleteBtn').addEventListener('click', async () => {
  if (!editingEventId) return;
  if (!confirm('确定删除该日程？')) return;
  const res = await api(`/api/events?id=${editingEventId}`, { method: 'DELETE' }).catch(() => null);
  if (res && res.ok) { closeEventModal(); toast('已删除'); markSynced(); loadCalEvents(); }
});
// 双击事件块也能删除
document.addEventListener('dblclick', (e) => {
  const ev = e.target.closest('[data-evid]');
  if (!ev) return;
  const id = Number(ev.dataset.evid);
  if (!confirm('确定删除该日程？')) return;
  api(`/api/events?id=${id}`, { method: 'DELETE' }).then((r) => {
    if (r.ok) { toast('已删除'); markSynced(); loadCalEvents(); }
  }).catch(() => {});
});

// ===== 待办交互 =====
$('#addTodoBtn').addEventListener('click', () => {
  const f = $('#todoForm');
  f.reset();
  f.date.value = todayStrLocal();
  $('#todoFormError').hidden = true;
  $('#todoModal').hidden = false;
});
$('#enableNotifyBtn').addEventListener('click', enableTodoNotify);
$('#todoModalClose').addEventListener('click', () => { $('#todoModal').hidden = true; });
$('#todoModal').addEventListener('click', (e) => { if (e.target === $('#todoModal')) $('#todoModal').hidden = true; });
$('#todoForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const title = String(fd.get('title') || '').trim();
  if (!title) { const el = $('#todoFormError'); el.textContent = '请填写内容'; el.hidden = false; return; }
  try {
    const res = await api('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title, date: fd.get('date'), time: fd.get('time'),
        list: fd.get('list'), priority: fd.get('priority'),
        note: fd.get('note'), remind: e.target.remind.checked,
      }),
    });
    if (res.ok) { $('#todoModal').hidden = true; toast('已添加待办'); markSynced(); await renderTodos(); }
  } catch { /* 401 已处理 */ }
});

// ===== 账本交互 =====
$('#ledPrev').addEventListener('click', () => {
  const [y, m] = ledgerState.month.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  ledgerState.month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  renderLedger();
});
$('#ledNext').addEventListener('click', () => {
  const [y, m] = ledgerState.month.split('-').map(Number);
  const d = new Date(y, m, 1);
  ledgerState.month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  renderLedger();
});
$('#addTxnBtn').addEventListener('click', () => {
  const f = $('#txnForm');
  f.reset();
  f.date.value = todayStrLocal();
  $('#txnFormError').hidden = true;
  syncTxnCats();
  $('#txnModal').hidden = false;
});
$('#txnModalClose').addEventListener('click', () => { $('#txnModal').hidden = true; });
$('#txnModal').addEventListener('click', (e) => { if (e.target === $('#txnModal')) $('#txnModal').hidden = true; });
$$('#txnForm [name=flow]').forEach((r) => r.addEventListener('change', syncTxnCats));
$('#txnForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const amount = Number(fd.get('amount'));
  if (!Number.isFinite(amount) || amount <= 0) { const el = $('#txnFormError'); el.textContent = '请填写有效金额'; el.hidden = false; return; }
  try {
    const res = await api('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        flow: fd.get('flow'), amount, category: fd.get('category'),
        date: fd.get('date'), note: fd.get('note'),
      }),
    });
    if (res.ok) { $('#txnModal').hidden = true; toast('已记账'); markSynced(); await renderLedger(); }
  } catch { /* 401 已处理 */ }
});

// ===== 人际关系交互 =====
$('#addContactBtn').addEventListener('click', () => openContactModal(null));
$('#contactModalClose').addEventListener('click', closeContactModal);
$('#contactModal').addEventListener('click', (e) => { if (e.target === $('#contactModal')) closeContactModal(); });
$('#contactDeleteBtn').addEventListener('click', async () => {
  if (!editingContactId) return;
  if (!confirm('确定删除该联系人？')) return;
  const res = await api(`/api/contacts/${editingContactId}`, { method: 'DELETE' }).catch(() => null);
  if (res && res.ok) { closeContactModal(); toast('已删除'); markSynced(); pfLoadList(); }
});
$('#contactForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const fd = new FormData(f);
  const name = String(fd.get('name') || '').trim();
  if (!name) { const el = $('#contactFormError'); el.textContent = '请填写姓名'; el.hidden = false; return; }
  const payload = {
    name, relation: fd.get('relation'), birthday: fd.get('birthday'),
    phone: fd.get('phone'), note: fd.get('note'),
    showInCalendar: f.showInCalendar.checked,
  };
  try {
    const url = editingContactId ? '/api/contacts' : '/api/contacts';
    const res = await api(url, {
      method: editingContactId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingContactId ? { ...payload, id: editingContactId } : payload),
    });
    if (res.ok) {
      closeContactModal();
      toast(editingContactId ? '已更新' : '已添加联系人');
      markSynced();
      pfLoadList();
    }
  } catch { /* 401 已处理 */ }
});

// ===== PWA =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./js/sw.js').catch(() => {}));
}

// 人物档案模块（v0.3.1）事件绑定
if (window.pfBindEvents) window.pfBindEvents();

boot();
