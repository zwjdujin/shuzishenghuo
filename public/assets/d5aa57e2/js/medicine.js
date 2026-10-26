// 数字生活 · 家庭药箱 v0.3.7
// 非 ES module（<script src> 加载），跨文件调用必须显式挂到 window
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // 常备清单建议（分类 / 建议内容）——通用家庭药箱参考，非医嘱
  const MED_CHECKLIST = [
    { icon: 'i-drop', name: '感冒发热', desc: '退热止痛 + 抗病毒各备一种，换季时补充。', eg: '布洛芬、连花清瘟' },
    { icon: 'i-sprout', name: '肠胃消化', desc: '腹泻、便秘、消化不良是居家高频问题。', eg: '蒙脱石散、开塞露、健胃消食片' },
    { icon: 'i-alert', name: '外伤急救', desc: '碘伏、创可贴、纱布，处理小擦伤烫伤。', eg: '碘伏消毒液、创可贴' },
    { icon: 'i-moon', name: '助眠安神', desc: '短期失眠可备褪黑素，注意用量与依赖。', eg: '褪黑素、酸枣仁' },
    { icon: 'i-eye', name: '五官用品', desc: '眼药水开封后 4 周内用完，过期勿留。', eg: '人工泪液、滴鼻液' },
    { icon: 'i-fire', name: '清热解毒', desc: '上火、口腔溃疡、蚊虫叮咬。', eg: '板蓝根、风油精' },
    { icon: 'i-book', name: '慢性病用药', desc: '长期服用药建议单独记录并定期复查。', eg: '降压药、降糖药' },
    { icon: 'i-plus', name: '个人常用', desc: '按家人实际病史补充，勿盲目囤药。', eg: '抗过敏、退烧贴' },
  ];

  const MED_STATE_LABEL = { expired: '已过期', soon: '临期', safe: '正常', none: '未填效期' };

  const state = {
    all: [],
    expiring: [],
    expired: [],
    plans: [],
    options: null,
    stats: null,
    filter: 'all',
    cat: '',
    kw: '',
    editingId: null,
    loaded: false,
    // v0.5.14：查看方式 detail=完整卡片 / list=只显药名（记忆在本地）
    viewMode: localStorage.getItem('medViewMode') === 'list' ? 'list' : 'detail',
  };

  // ===== 工具 =====
  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }
  function toast(msg) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2200);
  }
  // 401 时走全局 api()（app.js 提供，会弹登录层），会话过期不再卡在“加载中”；
  // app.js 尚未加载的极端场景下退化为仅抛错
  async function api(path, opts = {}) {
    if (typeof window.api === 'function') return window.api(path, opts);
    const res = await fetch(path, { credentials: 'same-origin', ...opts });
    if (res.status === 401) throw new Error('unauthorized');
    return res;
  }
  function markSynced() {
    if (typeof window.markSynced === 'function') window.markSynced();
  }
  // 本地今天（避免 UTC 时差）
  function todayLocal() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  function plusMonths(dateStr, n) {
    const [y, m, d] = String(dateStr).split('-').map(Number);
    const dt = new Date(y, m - 1 + n, d);
    const p = (v) => String(v).padStart(2, '0');
    return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
  }

  // 效期进度条百分比：距失效总时长中已走过的比例（按 2 年为满格估算，超出按满格）
  function expPct(m) {
    if (m.days === null || !m.expiry) return 0;
    const total = 730; // 2 年视为满格
    const left = Math.max(0, Math.min(total, m.days));
    return Math.max(2, Math.round((left / total) * 100));
  }

  // ===== 渲染：单条药品 =====
  function medRow(m) {
    const tags = [];
    tags.push(`<span class="med-tag gray">${esc(m.category)}</span>`);
    // v0.5.13：外用药红底白「外」；处方药 / OTC 按勾选二选一
    if (m.external) tags.push('<span class="med-tag ext">外</span>');
    if (m.rx) tags.push('<span class="med-tag rx">处方药</span>');
    else tags.push('<span class="med-tag otc">OTC</span>');
    if (m.forWhom && m.forWhom !== '通用') tags.push(`<span class="med-tag who">${esc(m.forWhom)}</span>`);
    if (m.lowStock && m.state !== 'expired') tags.push('<span class="med-tag low">需补货</span>');

    const metaBits = [];
    if (m.spec) metaBits.push(`规格 ${esc(m.spec)}`);
    if (m.dosage) metaBits.push(`用量 ${esc(m.dosage)}`);
    if (m.location) metaBits.push(`存放 ${esc(m.location)}`);
    if (m.stock !== null && m.stock !== undefined) metaBits.push(`库存 ${m.stock}`);
    if (m.manufacturer) metaBits.push(esc(m.manufacturer));

    const barCls = m.state === 'expired' ? 'expired' : m.state === 'soon' ? 'soon' : m.state === 'none' ? 'none' : '';
    const pct = expPct(m);
    const expCls = m.state === 'expired' ? 'expired' : m.state === 'soon' ? 'soon' : m.state === 'safe' ? 'safe' : '';

    const warn = m.rx ? '<p class="med-note">⚠ 处方药请遵医嘱使用，不可自行调整剂量。</p>' : '';

    return `
      <div class="med-row state-${esc(m.state)}" data-mid="${m.id}">
        <div class="mr-main">
          <div class="mr-name"><b>${esc(m.name)}</b>${tags.join('')}</div>
          ${m.efficacy ? `<div class="mr-eff">${esc(m.efficacy)}</div>` : ''}
          ${metaBits.length ? `<div class="mr-meta"><span class="med-tag gray">${metaBits.join(' · ')}</span></div>` : ''}
          ${m.note ? `<div class="mr-eff" style="opacity:.8">备注：${esc(m.note)}</div>` : ''}
          ${warn}
        </div>
        <div class="mr-side">
          <div class="med-exp ${expCls}">
            <b>${m.expiry ? esc(m.expiry) : '未填效期'}</b>
            <small>${esc(m.daysText)}</small>
            <div class="med-bar"><i class="${barCls}" style="width:${pct}%"></i></div>
          </div>
          <div class="mr-ops">
            <button type="button" data-med-edit="${m.id}" title="编辑" aria-label="编辑"><svg><use href="#i-edit"/></svg></button>
            <button type="button" data-med-del="${m.id}" title="删除" aria-label="删除"><svg><use href="#i-trash"/></svg></button>
          </div>
        </div>
      </div>`;
  }

  function emptyBox(text, sub, icon) {
    return `<div class="med-empty">
      <svg><use href="#${icon || 'i-pill'}"/></svg>
      <b>${esc(text)}</b>
      ${sub ? `<small>${esc(sub)}</small>` : ''}
    </div>`;
  }

  // ===== 统计卡 =====
  function renderStats(s) {
    const box = $('#medStats');
    if (!box || !s) return;
    box.innerHTML = `
      <div class="ms"><span>药品总数</span><strong>${s.total}</strong><small>${s.kinds} 种药名</small></div>
      <div class="ms soon"><span>临期（6 个月内）</span><strong>${s.soon}</strong><small>${s.soon ? '建议尽快使用' : '暂无临期'}</small></div>
      <div class="ms expired"><span>已过期</span><strong>${s.expired}</strong><small>${s.expired ? '请及时清理' : '暂无过期'}</small></div>
      <div class="ms safe"><span>效期正常</span><strong>${s.safe}</strong><small>${s.noExpiry ? `另有 ${s.noExpiry} 种未填效期` : '暂无未填效期'}</small></div>
      <div class="ms low"><span>库存不足</span><strong>${s.lowStock}</strong><small>低于下限需补货</small></div>`;
  }

  // ===== 主列表（受筛选 / 搜索影响） =====
  function renderMainList() {
    const box = $('#medList');
    if (!box) return;
    let list = state.all.slice();

    if (state.filter === 'soon') list = state.expiring.slice();
    else if (state.filter === 'expired') list = state.expired.slice();
    else if (state.filter === 'low') list = list.filter((m) => m.lowStock && m.state !== 'expired');

    if (state.cat) list = list.filter((m) => m.category === state.cat);

    if (state.kw) {
      const k = state.kw.toLowerCase();
      list = list.filter((m) =>
        [m.name, m.efficacy, m.manufacturer, m.spec, m.dosage, m.note, m.category, m.location]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(k))
      );
    }

    // 排序：已过期最前 → 临期 → 正常 → 未填效期；同组按效期升序
    const rank = { expired: 0, soon: 1, safe: 2, none: 3 };
    list.sort((a, b) => {
      if (rank[a.state] !== rank[b.state]) return rank[a.state] - rank[b.state];
      if (a.days === null) return 1;
      if (b.days === null) return -1;
      return a.days - b.days;
    });

    const titles = { all: ['全部药品', '药品一览'], soon: ['临期药品', '6 个月内到期'], expired: ['过期药品', '超过保质期'], low: ['库存不足', '需要补货'] };
    const [t2, t1] = titles[state.filter] || titles.all;
    $('#medListTitle').textContent = t2;
    $('#medListEyebrow').textContent = t1;
    $('#medCount').textContent = `${list.length} 条`;

    if (!list.length) {
      const msg = state.kw || state.cat
        ? '没有匹配的药品'
        : state.filter === 'soon' ? '暂无临期药品'
        : state.filter === 'expired' ? '暂无过期药品'
        : state.filter === 'low' ? '暂无需要补货的药品'
        : '药品箱还是空的，先录入几味常备药吧';
      box.innerHTML = emptyBox(msg, state.filter === 'all' && !state.kw && !state.cat ? '点击右上角「录入药品」开始' : '试试调整筛选条件', 'i-pill');
      return;
    }
    // v0.5.14：查看方式——详情（完整卡片）/ 列表（只显示药品名，一行多个）
    $$('#medViewSeg .seg-item').forEach((b) => b.classList.toggle('on', b.dataset.mv === state.viewMode));
    if (state.viewMode === 'list') {
      box.innerHTML = `<div class="med-chipgrid">${list.map((m) =>
        `<button type="button" class="med-chip-item${m.lowStock ? ' low' : ''}" data-med-edit="${m.id}" title="点击编辑">${esc(m.name)}</button>`).join('')}</div>`;
      return;
    }
    box.innerHTML = list.map(medRow).join('');
  }

  // ===== 临期 / 过期一览表 =====
  function renderSoon() {
    const box = $('#medSoonList');
    if (!box) return;
    const list = state.expiring.slice().sort((a, b) => (a.days || 0) - (b.days || 0));
    const badge = $('#medSoonBadge');
    if (badge) badge.textContent = `${list.length} 种`;
    box.innerHTML = list.length
      ? list.map(medRow).join('')
      : emptyBox('暂无临期药品', '6 个月内到期的药品会自动出现在这里', 'i-check');
  }

  function renderExpired() {
    const box = $('#medExpiredList');
    if (!box) return;
    const list = state.expired.slice().sort((a, b) => (a.days || 0) - (b.days || 0));
    const badge = $('#medExpiredBadge');
    if (badge) badge.textContent = `${list.length} 种`;
    box.innerHTML = list.length
      ? list.map(medRow).join('')
      : emptyBox('暂无过期药品', '没有超过保质期的药品，保持得不错', 'i-check');
  }

  // ===== 分类统计 =====
  function renderCatChart(categories) {
    const box = $('#medCatChart');
    if (!box) return;
    if (!categories || !categories.length) {
      box.innerHTML = emptyBox('暂无数据', '录入药品后自动统计', 'i-chart');
      return;
    }
    const max = Math.max.apply(null, categories.map((c) => c.total));
    box.innerHTML = categories.map((c) => {
      const pct = Math.max(4, Math.round((c.total / max) * 100));
      const warn = c.expired > 0 ? `<span class="sub">含过期 ${c.expired}</span>` : c.soon > 0 ? `<span class="sub">临期 ${c.soon}</span>` : '';
      const cls = c.expired > 0 ? 'bad' : c.soon > 0 ? 'warn' : '';
      return `<div class="med-cat-item">
        <div class="mc-top"><span class="nm">${esc(c.name)}</span>${warn}<span class="vl">${c.total}</span></div>
        <div class="med-bar"><i class="${cls}" style="width:${pct}%"></i></div>
      </div>`;
    }).join('');
  }

  // ===== 位置分布 =====
  function renderLocList(byLoc) {
    const box = $('#medLocList');
    if (!box) return;
    const entries = Object.keys(byLoc || {}).map((k) => [k, byLoc[k]]).sort((a, b) => b[1] - a[1]);
    if (!entries.length) {
      box.innerHTML = emptyBox('暂无数据', '录入药品后自动统计', 'i-home');
      return;
    }
    box.innerHTML = entries.map(([k, v]) =>
      `<div class="med-loc-item">
        <svg><use href="#i-home"/></svg>
        <span class="nm">${esc(k)}</span>
        <span class="vl">${v}</span>
      </div>`
    ).join('');
  }

  // ===== 常备清单 =====
  function renderChecklist() {
    const box = $('#medChecklist');
    if (!box) return;
    box.innerHTML = MED_CHECKLIST.map((c) => {
      const has = state.all.filter((m) => m.category === c.name || (c.name === '个人常用' && m.category === '其他')).length;
      return `<div class="med-check">
        <div class="mc-h"><svg><use href="#${c.icon}"/></svg><b>${esc(c.name)}</b>${has ? `<span class="mc-done">已备 ${has}</span>` : ''}</div>
        <p>${esc(c.desc)}</p>
        <p style="color:var(--plum)">例如：${esc(c.eg)}</p>
      </div>`;
    }).join('');
  }

  // ===== 筛选栏 =====
  function renderCatChips() {
    const box = $('#mfCat');
    if (!box) return;
    const cats = (state.options && state.options.categories) || [];
    const used = {};
    state.all.forEach((m) => { used[m.category] = (used[m.category] || 0) + 1; });
    const list = cats.filter((c) => used[c]).concat(cats.filter((c) => !used[c]));
    box.innerHTML =
      `<button class="tf-chip${state.cat ? '' : ' on'}" data-cat="" type="button">不限</button>` +
      list.map((c) =>
        `<button class="tf-chip${state.cat === c ? ' on' : ''}" data-cat="${esc(c)}" type="button">${esc(c)}${used[c] ? `<span class="n">${used[c]}</span>` : ''}</button>`
      ).join('');
  }

  // ===== 弹窗 =====
  function fillSelect(sel, opts, cur) {
    if (!sel) return;
    // 当前值不在选项里时追加为选项，避免保存时被静默改写成第一项（如旧数据的自定义剂型）
    const list = cur && !opts.includes(cur) ? opts.concat([cur]) : opts;
    sel.innerHTML = list.map((o) => `<option value="${esc(o)}"${o === cur ? ' selected' : ''}>${esc(o)}</option>`).join('');
  }

  function openMedModal(item) {
    const form = $('#medForm');
    if (!form) return;
    form.reset();
    state.editingId = item ? item.id : null;
    $('#medModalTitle').textContent = item ? '编辑药品' : '录入药品';
    $('#medSubmitBtn').textContent = item ? '保存修改' : '保存入库';
    $('#medFormError').hidden = true;

    const o = state.options || {};
    fillSelect($('#medFormSel'), o.forms || [], '片剂');
    fillSelect($('#medCatSel'), o.categories || ['无'], '无');
    fillSelect($('#medLocSel'), o.locations || [], '客厅药箱');
    fillSelect($('#medWhomSel'), o.forWhom || [], '通用');

    if (item) {
      form.name.value = item.name || '';
      form.efficacy.value = item.efficacy || '';
      form.spec.value = item.spec || '';
      form.form.value = item.form || '片剂';
      form.dosage.value = item.dosage || '';
      form.expiry.value = item.expiry || '';
      form.category.value = item.category || '无';
      form.location.value = item.location || '客厅药箱';
      form.forWhom.value = item.forWhom || '通用';
      form.stock.value = item.stock === null || item.stock === undefined ? 1 : item.stock;
      form.stockMin.value = item.stockMin === null || item.stockMin === undefined ? 1 : item.stockMin;
      form.manufacturer.value = item.manufacturer || '';
      form.openDate.value = item.openDate || '';
      form.price.value = item.price === null || item.price === undefined ? '' : item.price;
      form.rx.checked = !!item.rx;
      form.external.checked = !!item.external;
    } else {
      form.stock.value = 1;
      form.stockMin.value = 1;
      // 默认有效期：两年后（常见药品效期），用户可改
      form.expiry.value = plusMonths(todayLocal(), 24);
    }
    if (window.syncDtBtns) window.syncDtBtns(form);
    prefillMedPlan(item ? item.id : null);   // v0.6.0：回填服药计划
    $('#medModal').hidden = false;
  }

  function closeMedModal() {
    const el = $('#medModal');
    if (el) el.hidden = true;
    state.editingId = null;
    if (window.aiQueueCancel && !window.__aiSavedJustNow) window.aiQueueCancel();   // v0.5.27：非保存关闭取消 AI 队列
  }

  // ===== v0.6.0：服药计划（到点提醒 → 确认服药 → 扣库存） =====
  async function loadMedPlans() {
    try {
      const res = await api('/api/med-plans');
      const d = await res.json();
      state.plans = d.list || [];
    } catch (_) { state.plans = []; }
    renderMedPlans();
  }
  function renderMedPlans() {
    const panel = $('#medTodayPanel');
    if (!panel) return;
    const due = (state.plans || []).filter((p) => p.active && p.today.due);
    const done = (state.plans || []).filter((p) => p.today.status);
    if (!due.length && !done.length) { panel.hidden = true; return; }
    panel.hidden = false;
    const box = $('#medTodayPlanList');
    if (!box) return;
    const all = [...due.sort((a, b) => a.time.localeCompare(b.time)), ...done];
    box.innerHTML = all.map((p) => {
      const st = p.today.status;
      return `<div class="medtoday-row${st ? ' done' : ''}">
        <b>${p.time}</b><span></span>${p.dose ? `<small class="mtd-dose"></small>` : ''}
        ${st ? `<span class="mtd-st">${st === 'taken' ? '已服' : '已跳过'}</span>` : `
          <button class="btn sm" data-mplog="${p.id}" data-st="taken">已服</button>
          <button class="btn ghost sm" data-mplog="${p.id}" data-st="skipped">跳过</button>`}
      </div>`;
    }).join('');
    const rows = box.querySelectorAll('.medtoday-row');
    all.forEach((p, i) => {
      rows[i].querySelector('span').textContent = p.medicine;
      const doseEl = rows[i].querySelector('.mtd-dose');
      if (doseEl) doseEl.textContent = p.dose;
    });
    box.querySelectorAll('[data-mplog]').forEach((b) => {
      b.onclick = async () => {
        try {
          const res = await api('/api/med-plans/' + b.dataset.mplog + '/log', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: b.dataset.st }),
          });
          if (res.ok) {
            toast(b.dataset.st === 'taken' ? '已确认服药，库存 -1' : '已跳过');
            markSynced();
            renderMedicine();
          }
        } catch (_) { /* 401 已处理 */ }
      };
    });
  }
  /** 编辑弹窗回填该药品的现有计划 */
  function prefillMedPlan(medId) {
    const plan = (state.plans || []).find((p) => p.medicineId === medId && p.active);
    const enable = $('#mpEnable');
    const fields = $('#mpFields');
    if (!enable || !fields) return;
    enable.checked = !!plan;
    fields.hidden = !plan;
    $('#mpTime').value = plan ? plan.time : '08:00';
    $('#mpDose').value = plan ? plan.dose : '';
    const days = plan ? plan.days : [1, 2, 3, 4, 5, 6, 7];
    $mpDays().forEach((b) => { b.classList.toggle('on', days.includes(Number(b.dataset.d))); });
  }
  function $mpDays() { return Array.from((document.querySelectorAll('#mpDays .chip') || [])); }
  /** 保存药品后同步计划：勾选→建/重建；未勾选但有旧计划→删除 */
  async function saveMedPlanFlow(medId) {
    const enable = $('#mpEnable');
    if (!enable) return;
    const old = (state.plans || []).find((p) => p.medicineId === medId);
    if (!enable.checked) {
      if (old) await api('/api/med-plans/' + old.id, { method: 'DELETE' }).catch(() => {});
      return;
    }
    const time = String($('#mpTime').value || '').trim();
    if (!/^\d{1,2}:\d{2}$/.test(time)) { toast('服药时间格式应为 HH:MM'); return; }
    const days = $mpDays().filter((b) => b.classList.contains('on')).map((b) => Number(b.dataset.d));
    if (!days.length) { toast('请至少选择一个服药日'); return; }
    if (old) await api('/api/med-plans/' + old.id, { method: 'DELETE' }).catch(() => {});
    const res = await api('/api/med-plans', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ medicineId: medId, dose: $('#mpDose').value.trim(), time, days }),
    }).catch(() => null);
    if (res && res.ok) toast('服药计划已设置，到点会推送提醒');
  }

  // ===== 加载 =====
  async function renderMedicine() {
    const listBox = $('#medList');
    if (!listBox) return;
    try {
      const res = await api('/api/medicines');
      const data = await res.json();
      state.all = data.all || [];
      state.expiring = data.expiring || [];
      state.expired = data.expired || [];
      state.options = data.options || state.options;
      state.stats = data.stats || null;
      state.loaded = true;
      renderStats(data.stats);
      renderCatChips();
      renderMainList();
      renderSoon();
      renderExpired();
      loadMedPlans();
      renderCatChart(data.categories);
      renderLocList(data.byLocation);
      renderChecklist();
      markSynced();
    } catch (err) {
      if (String(err.message).includes('unauthorized')) return;
      const msg = '<div class="empty-hint">药箱数据加载失败，请稍后重试</div>';
      if (listBox.innerHTML !== msg) listBox.innerHTML = msg;
    }
  }

  // ===== v0.5.13 药箱设置：分类 / 剂型 / 存放位置 字典管理（存于词库 vocab） =====
  const MED_DICTS = [
    { kind: 'med_category', title: '分类', ph: '如：外感呼吸病' },
    { kind: 'med_form', title: '剂型', ph: '如：片剂' },
    { kind: 'med_location', title: '存放位置', ph: '如：客厅药箱' },
  ];
  let medDictData = {};

  async function openMedDictModal() {
    const m = $('#medDictModal');
    if (!m) return;
    m.hidden = false;
    await loadMedDict();
  }
  function closeMedDictModal() {
    const m = $('#medDictModal');
    if (m) m.hidden = true;
  }

  async function loadMedDict() {
    const body = $('#medDictBody');
    if (!body) return;
    body.innerHTML = '<div class="empty-hint">加载中…</div>';
    try {
      const res = await api('/api/vocab');
      const d = await res.json();
      MED_DICTS.forEach(({ kind }) => {
        medDictData[kind] = ((d.grouped || {})[kind] || []).map((x) => ({ id: x.id, word: x.word }));
      });
    } catch (_) { /* 401 已处理 */ }
    body.innerHTML = MED_DICTS.map(dictGroupHtml).join('<hr>');
  }

  function dictGroupHtml(def) {
    const { kind, title, ph } = def;
    return `
      <div class="md-group" data-kind="${kind}">
        <b class="md-title">${title}</b>
        <div class="md-list">${(medDictData[kind] || []).map((w) => `
          <div class="md-row" data-id="${w.id}">
            <span class="md-word">${esc(w.word)}</span>
            <span class="pm-ops">
              <button class="icon-btn" data-md="edit" data-id="${w.id}" title="重命名"><svg><use href="#i-edit"/></svg></button>
              <button class="icon-btn" data-md="del" data-id="${w.id}" data-word="${esc(w.word)}" title="删除"><svg><use href="#i-x"/></svg></button>
            </span>
          </div>`).join('') || '<div class="empty-hint">暂无，在下方添加</div>'}</div>
      <div class="pm-add"><input class="inp" data-md-add="${kind}" placeholder="${ph}" maxlength="20"><button class="btn ghost" data-md="add" data-kind="${kind}">添加</button></div>
      </div>`;
  }

  /** v0.5.14：只重渲染单个字典组（此前每次增删改名整弹窗重载，体验很差） */
  async function refreshDictGroup(kind) {
    try {
      const res = await api('/api/vocab?kind=' + kind);
      const d = await res.json();
      medDictData[kind] = (d.words || []).map((x) => ({ id: x.id, word: x.word }));
    } catch (_) { return; }
    const def = MED_DICTS.find((x) => x.kind === kind);
    const el = document.querySelector(`#medDictBody .md-group[data-kind="${kind}"]`);
    if (def && el) {
      el.outerHTML = dictGroupHtml(def);
    } else if (def) {
      loadMedDict();
    }
  }

  // ===== v0.5.25 药典检索 =====
  async function doMedLookup() {
    const name = ($('#medForm input[name=name]').value || '').trim();
    const drop = $('#medLookupDrop');
    if (!drop) return;
    if (name.length < 2) { toast('请先输入至少 2 个字的药品名称'); return; }
    drop.hidden = false;
    drop.innerHTML = '<div class="ml-item ml-static">药典检索中…</div>';
    try {
      const res = await api('/api/medicines/lookup?name=' + encodeURIComponent(name));
      const d = await res.json().catch(() => ({}));
      if (!d.ok) { drop.innerHTML = '<div class="ml-item ml-static ml-fail">' + esc(d.error || '检索失败，请手动填写') + '</div>'; return; }
      if (!(d.results || []).length) { drop.innerHTML = '<div class="ml-item ml-static ml-fail">药典未收录该名称，请手动填写</div>'; return; }
      drop.innerHTML = d.results.map((x) => `
        <button type="button" class="ml-item" data-entry="${x.id}">
          <b>${esc(x.title)}</b>
          <small>${esc(x.bookName)}${x.pageNum ? ' · 第' + x.pageNum + '页' : ''}</small>
        </button>`).join('');
    } catch (_) { drop.innerHTML = '<div class="ml-item ml-static ml-fail">检索失败，请手动填写</div>'; }
  }

  /** 选中药典条目 → 抽取字段预填表单，人工核验后保存 */
  async function pickMedLookup(entryId) {
    const drop = $('#medLookupDrop');
    if (drop) drop.innerHTML = '<div class="ml-item ml-static">获取药典详情…</div>';
    try {
      const res = await api('/api/medicines/lookup?entryId=' + entryId);
      const d = await res.json().catch(() => ({}));
      if (!d.ok) throw new Error(d.error || '获取失败');
      const e = d.entry;
      const form = $('#medForm');
      form.name.value = e.title;
      if (e.efficacy) form.efficacy.value = e.efficacy;
      if (e.dosage) form.dosage.value = e.dosage;
      if (e.spec) form.spec.value = e.spec;
      // 剂型按名称关键词推断（顺序敏感：软膏先于膏，注射液先于注射）
      const title = e.title || '';
      // 剂型推断：优先按「药箱设置」里实际存在的剂型选项做关键词最长匹配（如用户自建了「乳膏剂」），
      // 没有匹配再退回静态对照表（乳膏 → 软膏剂）
      let guessed = '';
      const opts = [...form.form.options].map((o) => o.value).filter((v) => v && v !== '其他');
      for (const v of opts) {
        const kw = v.endsWith('剂') ? v.slice(0, -1) : v;
        if (kw && title.includes(kw) && kw.length > guessed.length) guessed = v;
      }
      if (guessed) {
        form.form.value = guessed;
      } else {
        const FORM_MATCH = [
          ['注射液', '注射剂'], ['胶囊', '胶囊剂'], ['颗粒', '颗粒剂'], ['口服液', '口服液'],
          ['糖浆', '糖浆剂'], ['乳膏', '软膏剂'], ['软膏', '软膏剂'], ['栓', '栓剂'], ['喷雾', '喷雾剂'],
          ['酊', '酊剂'], ['锭', '锭剂'], ['丸', '丸剂'], ['散', '散剂'],
          ['煎膏', '煎膏剂'], ['片', '片剂'],
        ];
        for (const [kw, formName] of FORM_MATCH) {
          if (title.includes(kw) && [...form.form.options].some((o) => o.value === formName)) { form.form.value = formName; break; }
        }
      }
      const hint = $('#medLookupHint');
      // v0.5.28：外用药/处方药按药典+AI 判定预填勾选
      if (e.external === true) form.external.checked = true;
      if (e.rx === true) form.rx.checked = true;
      else if (e.rx === false) form.rx.checked = false;
      if (hint) {
        hint.hidden = false;
        const src = `来源：《${e.bookName}》${e.pageNum ? '第' + e.pageNum + '页' : ''}`;
        const rxNote = e.rx === true ? ' · 处方药' : (e.rx === false ? ' · OTC' : (e.rx === null && e.category ? ' · 请核验处方/OTC' : ''));
        hint.textContent = e.aiSuggested
          ? `${src}${rxNote} · 药典未收录临床用法，功效/用法为 AI 建议仅供参考，请务必核验后再保存`
          : `${src}${rxNote} · 已按药典预填，请人工核验后再保存`;
      }
      if (drop) { drop.hidden = true; drop.innerHTML = ''; }
    } catch (_) {
      if (drop) drop.innerHTML = '<div class="ml-item ml-static ml-fail">获取详情失败，请手动填写</div>';
    }
  }

  // ===== 事件绑定 =====
  function bindEvents() {
    const addBtn = $('#addMedBtn');
    if (addBtn) addBtn.addEventListener('click', () => openMedModal(null));

    // ===== v0.5.25 药典检索：名称输入后点放大镜 → 药典匹配 → 人工核验保存 =====
    const lookupBtn = $('#medLookupBtn');
    if (lookupBtn) lookupBtn.addEventListener('click', () => doMedLookup());
    const lookupDrop = $('#medLookupDrop');
    if (lookupDrop) lookupDrop.addEventListener('click', (e) => {
      const item = e.target.closest('[data-entry]');
      if (item) pickMedLookup(Number(item.dataset.entry));
    });
    // 点弹窗其他区域收起检索结果
    const medModal = $('#medModal');
    if (medModal) medModal.addEventListener('click', (e) => {
      const drop = $('#medLookupDrop');
      if (drop && !drop.hidden && !e.target.closest('.med-name-wrap')) { drop.hidden = true; }
    });

    // v0.5.13：药箱设置（齿轮）
    const setBtn = $('#medSetBtn');
    if (setBtn) setBtn.addEventListener('click', openMedDictModal);
    // v0.5.14：查看方式切换（详情 / 列表）
    const viewSeg = $('#medViewSeg');
    if (viewSeg) viewSeg.addEventListener('click', (e) => {
      const b = e.target.closest('[data-mv]');
      if (!b || state.viewMode === b.dataset.mv) return;
      state.viewMode = b.dataset.mv;
      localStorage.setItem('medViewMode', state.viewMode);
      renderMainList();
    });    const dictClose = $('#medDictClose');
    if (dictClose) dictClose.addEventListener('click', closeMedDictModal);
    const dictOverlay = $('#medDictModal');
    if (dictOverlay) dictOverlay.addEventListener('click', (e) => { if (e.target === dictOverlay) closeMedDictModal(); });
    const dictBody = $('#medDictBody');
    if (dictBody) {
      dictBody.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-md]');
        if (!btn) return;
        const act = btn.dataset.md;
        if (act === 'add') {
          const group = btn.closest('.md-group');
          const kind = btn.dataset.kind;
          const inp = group.querySelector('[data-md-add]');
          const word = (inp.value || '').replace(/[,，]/g, '').trim();
          if (!word) { toast('请填写名称'); return; }
          const res = await api('/api/vocab', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, word }) });
          if (res.ok) { inp.value = ''; refreshDictGroup(kind); } else { const d = await res.json().catch(() => ({})); toast(d.error || '添加失败'); }
        } else if (act === 'del') {
          if (!(await confirmModal(`删除「${btn.dataset.word}」？已保存的药品不受影响。`))) return;
          const res = await api('/api/vocab?id=' + btn.dataset.id, { method: 'DELETE' });
          if (res.ok) refreshDictGroup(btn.closest('.md-group').dataset.kind);
        } else if (act === 'edit') {
          const row = btn.closest('.md-row');
          const old = (row.querySelector('.md-word') || {}).textContent || '';
          const id = btn.dataset.id;
          row.innerHTML = `
            <input class="inp" data-md-rename value="${esc(old)}" maxlength="20">
            <span class="pm-ops">
              <button class="btn ghost sm" data-md="save" data-id="${id}">保存</button>
              <button class="btn ghost sm" data-md="cancel">取消</button>
            </span>`;
        } else if (act === 'save') {
          const row = btn.closest('.md-row');
          const word = (row.querySelector('[data-md-rename]') || {}).value || '';
          const res = await api('/api/vocab', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: Number(btn.dataset.id), word: word.replace(/[,，]/g, '').trim() }) });
          const d = await res.json().catch(() => ({}));
          if (res.ok) refreshDictGroup(btn.closest('.md-group').dataset.kind); else toast(d.error || '保存失败');
        } else if (act === 'cancel') {
          refreshDictGroup(btn.closest('.md-group').dataset.kind);
        }
      });
    }

    const closeBtn = $('#medModalClose');
    if (closeBtn) closeBtn.addEventListener('click', closeMedModal);
    const overlay = $('#medModal');
    if (overlay) overlay.addEventListener('click', (e) => { if (e.target === overlay) closeMedModal(); });

    // 视图 / 分类筛选
    const viewBox = $('#mfView');
    if (viewBox) {
      viewBox.addEventListener('click', (e) => {
        const b = e.target.closest('[data-mf]');
        if (!b) return;
        $$('#mfView .tf-chip').forEach((c) => c.classList.toggle('on', c === b));
        state.filter = b.dataset.mf;
        renderMainList();
      });
    }
    const catBox = $('#mfCat');
    if (catBox) {
      catBox.addEventListener('click', (e) => {
        const b = e.target.closest('[data-cat]');
        if (!b) return;
        state.cat = b.dataset.cat || '';
        $$('#mfCat .tf-chip').forEach((c) => c.classList.toggle('on', c === b));
        renderMainList();
      });
    }

    // 搜索（输入即筛，防抖 200ms）
    const search = $('#medSearch');
    if (search) {
      let t = null;
      search.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => { state.kw = search.value.trim(); renderMainList(); }, 200);
      });
    }

    // 列表内编辑 / 删除（事件委托，三个列表共用）
    ['#medList', '#medSoonList', '#medExpiredList'].forEach((sel) => {
      const box = $(sel);
      if (!box) return;
      box.addEventListener('click', async (e) => {
        const ed = e.target.closest('[data-med-edit]');
        const del = e.target.closest('[data-med-del]');
        if (ed) {
          const id = Number(ed.dataset.medEdit);
          const item = state.all.find((m) => m.id === id);
          if (item) openMedModal(item);
          return;
        }
        if (del) {
          const id = Number(del.dataset.medDel);
          const item = state.all.find((m) => m.id === id);
          if (!item) return;
          if (!(await confirmModal(`确定删除「${item.name}」吗？此操作不可撤销。`))) return;
          try {
            const res = await api(`/api/medicines/${id}`, { method: 'DELETE' });
            if (res.ok) { toast('已删除'); markSynced(); renderMedicine(); }
          } catch (_) { /* 401 已处理 */ }
        }
      });
    });

    // v0.6.0：服药计划开关与星期选择
    const mpEnable = $('#mpEnable');
    if (mpEnable) {
      mpEnable.addEventListener('change', () => { const f = $('#mpFields'); if (f) f.hidden = !mpEnable.checked; });
    }
    const mpDaysBox = $('#mpDays');
    if (mpDaysBox) {
      mpDaysBox.addEventListener('click', (e) => {
        const b = e.target.closest('.chip');
        if (b) b.classList.toggle('on');
      });
    }

    // 表单提交
    const form = $('#medForm');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const name = String(fd.get('name') || '').trim();
        if (!name) {
          const el = $('#medFormError');
          el.textContent = '请填写药品名称';
          el.hidden = false;
          return;
        }
        const payload = {
          name,
          efficacy: fd.get('efficacy'),
          spec: fd.get('spec'),
          form: fd.get('form'),
          dosage: fd.get('dosage'),
          expiry: fd.get('expiry'),
          category: fd.get('category'),
          location: fd.get('location'),
          forWhom: fd.get('forWhom'),
          stock: Number(fd.get('stock') || 0),
          stockMin: Number(fd.get('stockMin') || 0),
          manufacturer: fd.get('manufacturer'),
          openDate: fd.get('openDate'),
          price: fd.get('price') === '' ? null : Number(fd.get('price')),
          rx: form.rx.checked ? 1 : 0,
          external: form.external.checked ? 1 : 0,
        };
        const editing = state.editingId;
        const btn = $('#medSubmitBtn');
        if (btn) btn.disabled = true;
        try {
          const res = editing
            ? await api(`/api/medicines/${editing}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...payload, id: editing }),
              })
            : await api('/api/medicines', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              });
          if (res.ok) {
            const medId = editing ? editing : (await res.json().catch(() => ({}))).id;
            await saveMedPlanFlow(medId);     // v0.6.0：同步服药计划
            window.__aiSavedJustNow = true;   // 保存关闭：不清 AI 队列
            closeMedModal();
            window.__aiSavedJustNow = false;
            toast(editing ? '已更新' : '已入库');
            markSynced();
            renderMedicine();
            if (window.aiSaveHookRun) window.aiSaveHookRun();   // v0.5.27：AI 队列继续
          }
        } catch (_) { /* 401 已处理 */ } finally { if (btn) btn.disabled = false; }
      });
    }
  }

  // 暴露给 app.js
  window.medRenderMedicine = renderMedicine;
  window.medBindEvents = bindEvents;
  // v0.5.27：AI 识别的药品 → 打开录入弹窗，自动药典检索预填，人工核验后保存
  window.medAiFill = async function (draft) {
    openMedModal(null);
    const name = String(draft.mname || '').trim();
    const nameInp = $('#medForm input[name=name]');
    if (nameInp) nameInp.value = name;
    try {
      const res = await api('/api/medicines/lookup?name=' + encodeURIComponent(name));
      const d = await res.json().catch(() => ({}));
      if (d.ok && (d.results || []).length) {
        const key = name.replace(/\s/g, '');
        const hit = d.results.find((x) => x.title.replace(/\s/g, '') === key)
          || d.results.find((x) => x.title.replace(/\s/g, '').includes(key))
          || d.results[0];
        await pickMedLookup(hit.id);
      }
    } catch (_) { /* 检索失败保留 AI 字段 */ }
    // AI 草稿补充：剂型/效期/用量（药典缺失时）
    const form = $('#medForm');
    if (!form) return;
    if (draft.form) { const has = [...form.form.options].some((o) => o.value === draft.form); if (has) form.form.value = draft.form; }
    if (!form.dosage.value && draft.dosage) form.dosage.value = String(draft.dosage).slice(0, 150);
    if (/^\d{4}-\d{2}-\d{2}$/.test(draft.expiry || '')) { form.expiry.value = draft.expiry; window.syncDtBtns(form); }
    const hint = $('#medLookupHint');
    if (hint && hint.hidden) { hint.hidden = false; hint.textContent = '已按 AI 识别预填，请人工核验后再保存'; }
  };
  if (typeof document !== 'undefined' && document.readyState !== 'loading') {
    // app.js 在末尾才调用 medBindEvents()，这里不重复绑定
  }
})();
