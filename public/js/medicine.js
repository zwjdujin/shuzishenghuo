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
    options: null,
    stats: null,
    filter: 'all',
    cat: '',
    kw: '',
    editingId: null,
    loaded: false,
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
  async function api(path, opts = {}) {
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
    if (m.rx) tags.push('<span class="med-tag rx">处方药</span>');
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
    sel.innerHTML = opts.map((o) => `<option value="${esc(o)}"${o === cur ? ' selected' : ''}>${esc(o)}</option>`).join('');
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
    fillSelect($('#medCatSel'), o.categories || [], '感冒发热');
    fillSelect($('#medLocSel'), o.locations || [], '客厅药箱');
    fillSelect($('#medWhomSel'), o.forWhom || [], '通用');

    if (item) {
      form.name.value = item.name || '';
      form.efficacy.value = item.efficacy || '';
      form.spec.value = item.spec || '';
      form.form.value = item.form || '片剂';
      form.dosage.value = item.dosage || '';
      form.expiry.value = item.expiry || '';
      form.category.value = item.category || '感冒发热';
      form.location.value = item.location || '客厅药箱';
      form.forWhom.value = item.forWhom || '通用';
      form.stock.value = item.stock === null || item.stock === undefined ? 1 : item.stock;
      form.stockMin.value = item.stockMin === null || item.stockMin === undefined ? 1 : item.stockMin;
      form.manufacturer.value = item.manufacturer || '';
      form.openDate.value = item.openDate || '';
      form.price.value = item.price === null || item.price === undefined ? '' : item.price;
      form.rx.checked = !!item.rx;
    } else {
      form.stock.value = 1;
      form.stockMin.value = 1;
      // 默认有效期：两年后（常见药品效期），用户可改
      form.expiry.value = plusMonths(todayLocal(), 24);
    }
    $('#medModal').hidden = false;
  }

  function closeMedModal() {
    const el = $('#medModal');
    if (el) el.hidden = true;
    state.editingId = null;
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

  // ===== 事件绑定 =====
  function bindEvents() {
    const addBtn = $('#addMedBtn');
    if (addBtn) addBtn.addEventListener('click', () => openMedModal(null));

    const tipBtn = $('#medTipBtn');
    if (tipBtn) {
      tipBtn.addEventListener('click', () => {
        document.getElementById('medChecklist').scrollIntoView({ behavior: 'smooth', block: 'center' });
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
          if (!confirm(`确定删除「${item.name}」吗？此操作不可撤销。`)) return;
          try {
            const res = await api(`/api/medicines/${id}`, { method: 'DELETE' });
            if (res.ok) { toast('已删除'); markSynced(); renderMedicine(); }
          } catch (_) { /* 401 已处理 */ }
        }
      });
    });

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
        };
        const editing = state.editingId;
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
            closeMedModal();
            toast(editing ? '已更新' : '已入库');
            markSynced();
            renderMedicine();
          }
        } catch (_) { /* 401 已处理 */ }
      });
    }
  }

  // 暴露给 app.js
  window.medRenderMedicine = renderMedicine;
  window.medBindEvents = bindEvents;
  if (typeof document !== 'undefined' && document.readyState !== 'loading') {
    // app.js 在末尾才调用 medBindEvents()，这里不重复绑定
  }
})();
