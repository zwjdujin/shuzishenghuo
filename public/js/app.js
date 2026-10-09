// 数字生活 · 前端逻辑 v0.2.3
const VERSION = '0.2.3';

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
    row.querySelector('.main small').textContent = [t.list, t.priority === 'high' ? '高优先' : ''].filter(Boolean).join(' · ');
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

// ===== 导航切换 =====
function switchView(name) {
  const target = $('#view-' + name);
  if (!target) return;
  $$('.view').forEach((v) => v.classList.remove('active'));
  target.classList.add('active');
  $$('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.nav === name));
  $$('.mobile-nav button').forEach((n) => n.classList.toggle('active', n.dataset.nav === name));
  if (name === 'growth') renderGrowth();
  if (name === 'settings') { renderSettings(); switchProfileTab('site'); }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
document.addEventListener('click', (e) => {
  const navEl = e.target.closest('[data-nav]');
  if (navEl) {
    switchView(navEl.dataset.nav);
  }
});

// ===== 成长打卡 =====
const CAT_COLOR = { plum:'#4d3045', terra:'#b65f42', sage:'#627a67', sand:'#a57c45', clay:'#8f4f3b' };
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
    <div class="ci-actions">${actions}</div>`;
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
    if (res.ok) { toast('已删除'); await renderGrowth(); }
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
  if (isSleep) {
    f.querySelector('[name=bed_time]').value = h.bed_time || '23:00';
    f.querySelector('[name=rise_time]').value = h.rise_time || '07:00';
    const nt = (h.nap_time || '12:30-14:00').split('-');
    f.querySelector('[name=nap_start]').value = nt[0] || '12:30';
    f.querySelector('[name=nap_end]').value = nt[1] || '14:00';
  } else {
    const method = h.method === 'duration' ? 'duration' : 'count';
    f.querySelector(`[name=method][value="${method}"]`).checked = true;
    f.querySelector('[name=target]').value = h.target || 1;
    fillUnitOptions(method, h.unit);
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
// 页签切换（站点信息 / 风格字体 / 账户安全）
const PROFILE_TITLES = { site: '站点信息', style: '风格字体', security: '账户安全' };
function switchProfileTab(name) {
  const tab = name && PROFILE_TITLES[name] ? name : 'site';
  $$('.ptab').forEach((t) => t.classList.toggle('active', t.dataset.ptab === tab));
  $$('.profile-page').forEach((p) => p.classList.toggle('active', p.id === 'page-' + tab));
  const title = $('#profilePageTitle');
  if (title) title.textContent = PROFILE_TITLES[tab];
  if (tab === 'security') renderSessions();
}

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
    } else {
      toast('保存失败');
    }
  } catch { /* 401 已处理 */ }
  finally { btn.disabled = false; }
});

$('#logoutBtn2').addEventListener('click', doLogout);

// 页签点击
document.addEventListener('click', (e) => {
  const tabEl = e.target.closest('[data-ptab]');
  if (!tabEl) return;
  switchProfileTab(tabEl.dataset.ptab);
  // 若在侧栏 popover 里点击，切到个人中心视图并关闭 popover
  if (tabEl.classList.contains('pp-item')) {
    switchView('settings');
    closeProfilePopover();
  }
});

// 侧栏「个人中心」按钮：弹出子菜单
function toggleProfilePopover() {
  const p = $('#profilePopover');
  p.hidden = !p.hidden;
}
function closeProfilePopover() {
  $('#profilePopover').hidden = true;
}
$('#profileBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  toggleProfilePopover();
});
document.addEventListener('click', (e) => {
  const p = $('#profilePopover');
  if (!p.hidden && !e.target.closest('#profilePopover') && !e.target.closest('#profileBtn')) {
    p.hidden = true;
  }
});

// ===== PWA =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./js/sw.js').catch(() => {}));
}

boot();
