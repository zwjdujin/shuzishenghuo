// 数字生活 · 前端逻辑 v0.0.1
const VERSION = '0.0.1';

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

// ===== 登录 =====
function showLogin() {
  $('#appShell').hidden = true;
  $('#loginOverlay').hidden = false;
  $('#loginError').hidden = true;
}
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const btn = e.target.querySelector('button');
  btn.disabled = true;
  try {
    const res = await api('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: fd.get('user'), pass: fd.get('pass') }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const err = $('#loginError');
      err.textContent = data.error || '登录失败，请重试';
      err.hidden = false;
    } else {
      $('#loginOverlay').hidden = true;
      $('#appShell').hidden = false;
      await loadHome();
    }
  } catch {
    /* 401 已处理 */
  } finally {
    btn.disabled = false;
  }
});

$('#logoutBtn').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  showLogin();
});

// ===== 启动：检查登录状态 =====
async function boot() {
  $('#versionText').textContent = 'v' + VERSION;
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

function renderHome(d) {
  // 品牌
  $('#brandAvatar').textContent = (d.brand && d.brand.avatar) || '数';
  $('#brandName').textContent = (d.brand && d.brand.name) || '数字生活';
  $('#brandTagline').textContent = (d.brand && d.brand.tagline) || '把日子过成自己喜欢的样子';

  // 顶部日期
  $('#todayLabel').textContent = d.todayLabel || d.today;

  // Hero 问候
  const h = new Date().getHours();
  const greet = h < 6 ? '夜深了，早点休息' : h < 11 ? '早上好' : h < 13 ? '中午好' : h < 18 ? '下午好' : '晚上好';
  $('#heroGreeting').textContent = `${greet}，今天也辛苦了`;
  $('#heroSummary').textContent = summaryLine(d.stats);

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
    el.innerHTML = `<svg><use href="#i-${h.icon || 'sprout'}"/></svg><b></b><small>待打卡</small>`;
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
  $('#viewTitle').textContent = target.dataset.title || '数字生活';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
document.addEventListener('click', (e) => {
  const navEl = e.target.closest('[data-nav]');
  if (navEl) {
    switchView(navEl.dataset.nav);
  }
});

// ===== PWA =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./js/sw.js').catch(() => {}));
}

boot();
