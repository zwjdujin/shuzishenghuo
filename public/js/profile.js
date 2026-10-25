// 数字生活 · 人际关系 v0.4.0（A-Z 拼音分组列表 + 模块化档案）
// 依赖 app.js 的 api() / $ / $$ / toast / markSynced（运行时全局可用）

const PF = {
  view: 'list',
  pid: null,
  data: null,            // 当前档案
  list: [],              // 列表（当前筛选结果）
  options: {},           // 筛选项（genders/groups/tags/marriages）
  filters: { q: '', gender: '', group: '', tag: '' },
  allNames: [],          // 全部联系人 [{id,name}]（引荐人/家庭关系搜索用）
  vocab: {},             // 词库 kind -> words
  editTags: [],          // 编辑弹窗：已选标签
  editGroups: [],        // 编辑弹窗：已选群组
  editingId: null,       // 编辑弹窗：null=新建
};

function pfEl(id) { return document.getElementById(id); }
function pfEsc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function pfTodayLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ===== 拼音首字母分组（Intl 中文拼音排序，无第三方库） =====
const PF_COLL = (() => { try { return new Intl.Collator('zh-Hans-CN-u-co-pinyin'); } catch (_) { return null; } })();
// 每个字母的边界汉字（拼音序），跳过 I/U/V（汉语拼音无声母）
const AZ_BOUNDS = [['阿', 'A'], ['八', 'B'], ['擦', 'C'], ['搭', 'D'], ['蛾', 'E'], ['发', 'F'], ['噶', 'G'], ['哈', 'H'],
  ['击', 'J'], ['喀', 'K'], ['垃', 'L'], ['妈', 'M'], ['拿', 'N'], ['哦', 'O'], ['啪', 'P'], ['七', 'Q'], ['然', 'R'],
  ['撒', 'S'], ['塌', 'T'], ['挖', 'W'], ['昔', 'X'], ['压', 'Y'], ['匝', 'Z']];
function pfFirstLetter(str) {
  const ch = String(str || '').trim()[0];
  if (!ch) return '#';
  if (/[a-zA-Z]/.test(ch)) return ch.toUpperCase();
  if (PF_COLL) {
    let letter = '#';
    for (const [bound, L] of AZ_BOUNDS) if (PF_COLL.compare(bound, ch) <= 0) letter = L;
    return letter;
  }
  return '#';
}
function pfGroupByLetter(list) {
  const cmp = PF_COLL || { compare: (a, b) => a.localeCompare(b, 'zh') };
  const sorted = list.slice().sort((x, y) => cmp.compare(x.name || '', y.name || '') || (x.id - y.id));
  const groups = [];
  sorted.forEach((p) => {
    const L = pfFirstLetter(p.name);
    const last = groups[groups.length - 1];
    if (last && last.letter === L) last.rows.push(p);
    else groups.push({ letter: L, rows: [p] });
  });
  groups.sort((a, b) => (a.letter === '#' ? 1 : 0) - (b.letter === '#' ? 1 : 0));
  return groups;
}

// ===== 词库 =====
async function pfLoadVocab() {
  try {
    const res = await api('/api/vocab');
    const d = await res.json();
    PF.vocab = {};
    Object.keys(d.grouped || {}).forEach((k) => { PF.vocab[k] = d.grouped[k].map((x) => x.word); });
  } catch (_) { /* 未登录忽略 */ }
}
/** 新词登记入词库（失败静默） */
function pfRememberVocab(kind, word) {
  api('/api/vocab', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, word }) }).catch(() => {});
}

// ===== 列表视图 =====
async function pfLoadList() {
  const box = pfEl('relList');
  if (box) box.innerHTML = '<div class="empty-hint">加载中…</div>';
  const f = PF.filters;
  const qs = new URLSearchParams();
  Object.keys(f).forEach((k) => { if (f[k]) qs.set(k, f[k]); });
  try {
    const res = await api('/api/profile/list?' + qs.toString());
    const d = await res.json();
    PF.list = d.list || [];
    PF.options = d.options || {};
    pfRenderFilters();
    pfRenderList();
    markSynced();
    // 无筛选时列表接口返回的已是全量，直接复用，省一次相同请求（v0.5.5 前这里会重复拉一遍）
    if (!qs.toString()) {
      PF.allNames = PF.list.map((p) => ({ id: p.id, name: p.name }));
    } else {
      pfLoadNames();
    }
  } catch (err) {
    if (!String(err.message).includes('unauthorized') && box) box.innerHTML = '<div class="empty-hint">加载联系人失败</div>';
    pfLoadNames();
  }
}

async function pfLoadNames() {
  try {
    const res = await api('/api/profile/list');
    const d = await res.json();
    PF.allNames = (d.list || []).map((p) => ({ id: p.id, name: p.name }));
  } catch (_) { /* 忽略 */ }
}

function pfChipRow(boxId, items, key) {
  const box = pfEl(boxId);
  if (!box) return;
  const cur = PF.filters[key];
  box.innerHTML =
    `<button class="tf-chip${cur === '' ? ' on' : ''}" data-fv="">全部</button>` +
    items.map((x) => `<button class="tf-chip${cur === x ? ' on' : ''}" data-fv="${pfEsc(x)}">${pfEsc(x)}</button>`).join('');
  box.querySelectorAll('.tf-chip').forEach((b) =>
    b.addEventListener('click', () => {
      PF.filters[key] = b.dataset.fv;
      pfLoadList();
    }));
}

function pfRenderFilters() {
  pfChipRow('relGenderChips', PF.options.genders || [], 'gender');
  pfChipRow('relGroupChips', PF.options.groups || [], 'group');
  pfChipRow('relTagChips', PF.options.tags || [], 'tag');
}

function pfRenderList() {
  const box = pfEl('relList');
  if (!box) return;
  const cnt = pfEl('relCount');
  if (cnt) cnt.textContent = PF.list.length ? `共 ${PF.list.length} 人` : '';
  if (!PF.list.length) {
    box.innerHTML = '<div class="empty-hint">没有符合条件的联系人，点右上角「添加联系人」开始</div>';
    return;
  }
  box.innerHTML = pfGroupByLetter(PF.list).map((g) => `
    <div class="az-group">
      <div class="az-letter">${pfEsc(g.letter)}<span>${g.rows.length}</span></div>
      ${g.rows.map((p) => `
        <button class="rel-row${p.isDeceased ? ' deceased' : ''}" data-pf-id="${p.id}">
          <span class="contact-avatar">${pfEsc((p.name || '?')[0])}</span>
          <div class="rel-row-main">
            <b>${pfEsc(p.name)}${p.isDeceased ? ' <span class="contact-badge">已逝</span>' : ''}</b>
            <small>${[p.nickname && '昵称 ' + p.nickname, p.englishName, p.alias].filter(Boolean).map(pfEsc).join(' · ') || '&nbsp;'}</small>
          </div>
          <div class="rel-row-right">
            ${p.gender ? `<span class="contact-badge">${pfEsc(p.gender)}</span>` : ''}
            ${p.phone ? `<span class="contact-phone">${pfEsc(p.phone)}</span>` : ''}
          </div>
        </button>`).join('')}
    </div>`).join('');
}

// ===== 档案视图 =====
async function pfOpenProfile(id) {
  PF.pid = Number(id);
  PF.view = 'profile';
  // 深链：#/relations/{id}（hash 路由回环由 pfOpenByHash 去重）
  if (location.hash !== '#/relations/' + PF.pid) location.hash = '#/relations/' + PF.pid;
  pfEl('relListView').hidden = true;
  pfEl('relProfileView').hidden = false;
  ['pfHero', 'pfBasic', 'pfSocial', 'pfMethods', 'pfRelatives', 'pfWork', 'pfEdu', 'pfPets', 'pfBody', 'pfFiles']
    .forEach((k) => { const el = pfEl(k); if (el) el.innerHTML = '<div class="empty-hint">加载中…</div>'; });
  if (pfEl('pfFinance')) pfEl('pfFinance').innerHTML = '<div class="empty-hint">加载中…</div>';
  pfRenderFinance();
  try {
    const res = await api('/api/profile/detail?id=' + PF.pid);
    PF.data = await res.json();
    pfRenderAll();
    markSynced();
  } catch (err) {
    if (!String(err.message).includes('unauthorized')) {
      const el = pfEl('pfHero');
      if (el) el.innerHTML = '<div class="empty-hint">加载档案失败</div>';
    }
  }
}

function pfBackToList() {
  PF.view = 'list';
  PF.pid = null;
  PF.data = null;
  if (location.hash !== '#/relations') location.hash = '#/relations';
  pfEl('relProfileView').hidden = true;
  pfEl('relListView').hidden = false;
  pfLoadList();
}

// hash 路由入口（app.js 的 routeFromHash 调用）：已在当前档案上则不重复加载
window.pfOpenByHash = function (id) {
  if (PF.view === 'profile' && PF.pid === Number(id)) return;
  pfOpenProfile(id);
};

function pfRenderAll() {
  const d = PF.data;
  if (!d) return;
  pfEl('pfName').textContent = d.base.name;
  pfRenderHero();
  pfRenderBasic();
  pfRenderSocial();
  pfRenderMethods();
  pfRenderRelatives();
  pfRenderWork();
  pfRenderEdu();
  pfRenderPets();
  pfRenderTouch();   // v0.6.0：保持联系（节奏 + 今天联系过）
  pfRenderBody();    // v0.6.0：个人信息（尺码 + 身高表 + 体重折线）
  pfRenderFiles();   // v0.6.0：附件（R2）
}

// ===== v0.6.0：keep-in-touch（联系节奏设置 + 一键记录今天联系过） =====
async function pfRenderTouch() {
  const box = pfEl('pfTouchBox');
  if (!box || !PF.data || !PF.data.base) return;
  let cadence = 0;
  try {
    const res = await api('/api/profile/touch?id=' + PF.pid);
    if (res.ok) cadence = Number((await res.json()).cadence) || 0;
  } catch (_) { /* 忽略 */ }
  const b = PF.data.base;
  box.innerHTML = `
    <select class="pf-touch-sel" id="pfTouchSel" aria-label="联系节奏">
      <option value="0"${cadence ? '' : ' selected'}>不提醒</option>
      <option value="3"${cadence === 3 ? ' selected' : ''}>每 3 天</option>
      <option value="7"${cadence === 7 ? ' selected' : ''}>每 7 天</option>
      <option value="14"${cadence === 14 ? ' selected' : ''}>每 14 天</option>
      <option value="30"${cadence === 30 ? ' selected' : ''}>每 30 天</option>
      <option value="90"${cadence === 90 ? ' selected' : ''}>每 90 天</option>
    </select>
    <button class="btn ghost sm" type="button" id="pfTouchNow" title="记录今天联系过">今天联系过</button>`;
  const sel = box.querySelector('#pfTouchSel');
  sel.onchange = async () => {
    try {
      const res = await api('/api/profile/touch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: PF.pid, cadence: Number(sel.value) }),
      });
      if (res.ok) { toast(Number(sel.value) ? '已设置联系节奏' : '已关闭提醒'); markSynced(); }
    } catch (_) { /* 401 已处理 */ }
  };
  box.querySelector('#pfTouchNow').onclick = async () => {
    try {
      const res = await api('/api/profile/touch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: PF.pid, touched: true }),
      });
      if (res.ok) { toast('已记录：今天联系过'); markSynced(); }
    } catch (_) { /* 401 已处理 */ }
  };
}

// ===== v0.6.0：个人信息（尺码单值 + 身高表格 + 体重折线图） =====
function pfToday() { return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10); }

/** 体重折线：纯 SVG，min/max 参考线 + 末值标注；单点/空数据有兜底 */
function pfWeightSvg(recs) {
  if (!recs.length) return '';
  const W = 640, H = 190, L = 46, R = 16, T = 14, B = 30;
  const vs = recs.map((r) => r.value);
  let min = Math.min(...vs), max = Math.max(...vs);
  if (min === max) { min -= 2; max += 2; }
  const pad = (max - min) * 0.12;
  min -= pad; max += pad;
  const x = (i) => (recs.length === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (recs.length - 1));
  const y = (v) => T + ((max - v) / (max - min)) * (H - T - B);
  const pts = recs.map((r, i) => `${x(i).toFixed(1)},${y(r.value).toFixed(1)}`).join(' ');
  const last = recs[recs.length - 1];
  const grid = (v) => `
    <line x1="${L}" y1="${y(v)}" x2="${W - R}" y2="${y(v)}" stroke="var(--line)" stroke-dasharray="3 4" stroke-width="1"/>
    <text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" class="pf-wc-lab">${v % 1 ? v.toFixed(1) : v}kg</text>`;
  return `
    <svg class="pf-weight" viewBox="0 0 ${W} ${H}" role="img" aria-label="体重趋势折线图，共 ${recs.length} 次记录">
      ${grid(Math.max(...vs))}${grid(Math.min(...vs))}
      ${recs.length > 1 ? `<polyline points="${pts}" fill="none" stroke="var(--terra)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
      ${recs.map((r, i) => `<circle cx="${x(i)}" cy="${y(r.value)}" r="4" fill="var(--terra)" stroke="var(--card)" stroke-width="2"><title>${r.date} · ${r.value}kg</title></circle>`).join('')}
      <text x="${x(recs.length - 1)}" y="${y(last.value) - 10}" text-anchor="middle" class="pf-wc-last">${last.value}kg</text>
      <text x="${x(0)}" y="${H - 8}" text-anchor="middle" class="pf-wc-lab">${recs[0].date.slice(5)}</text>
      ${recs.length > 1 ? `<text x="${x(recs.length - 1)}" y="${H - 8}" text-anchor="middle" class="pf-wc-lab">${last.date.slice(5)}</text>` : ''}
    </svg>`;
}

async function pfRenderBody() {
  const box = pfEl('pfBody');
  if (!box || !PF.pid) return;
  let data = { records: [], sizes: {} };
  try {
    const res = await api('/api/profile/body?id=' + PF.pid);
    if (res.ok) data = await res.json();
  } catch (_) { /* 401 已处理 */ }
  const heights = (data.records || []).filter((r) => r.kind === 'height').reverse(); // 新记录在前
  const weights = (data.records || []).filter((r) => r.kind === 'weight');
  const sz = data.sizes || {};
  const t = pfToday();

  box.innerHTML = `
    <div class="pf-hm">
      <div class="pf-hm-block">
        <b class="pm-block-title">身高记录 <span class="muted">cm</span></b>
        <div class="pf-hm-add">
          <input class="inp" id="pfHVal" type="number" inputmode="decimal" step="0.1" min="30" max="260" placeholder="如 175">
          <input type="hidden" id="pfHDateInput" value="${t}">
          <button type="button" class="dt-btn" data-dt="pfHDate" data-ph="今天"><svg><use href="#i-calendar"/></svg><span>今天</span></button>
          <button class="btn ghost" data-act="hadd">记录</button>
        </div>
        ${heights.length ? `
        <div class="pf-hm-table">
          <div class="pf-hm-tr pf-hm-th"><span>日期</span><span>身高</span><span></span></div>
          ${heights.map((r) => `
          <div class="pf-hm-tr"><span>${pfEsc(r.date)}</span><b>${r.value} cm</b>
            <button class="icon-btn" data-act="hdel" data-id="${r.id}" title="删除"><svg><use href="#i-x"/></svg></button></div>`).join('')}
        </div>` : '<div class="empty-hint">还没有身高记录；22 岁前可随成长多次记录，之后基本定型。</div>'}
      </div>
      <div class="pf-hm-block">
        <b class="pm-block-title">体重趋势 <span class="muted">kg</span></b>
        <div class="pf-hm-add">
          <input class="inp" id="pfWVal" type="number" inputmode="decimal" step="0.1" min="1" max="500" placeholder="如 62.5">
          <input type="hidden" id="pfWDateInput" value="${t}">
          <button type="button" class="dt-btn" data-dt="pfWDate" data-ph="今天"><svg><use href="#i-calendar"/></svg><span>今天</span></button>
          <button class="btn ghost" data-act="wadd">记录</button>
        </div>
        ${weights.length ? pfWeightSvg(weights) : '<div class="empty-hint">记录两次及以上体重，这里会画出趋势折线。</div>'}
      </div>
    </div>
    <div class="pf-sizes">
      <b class="pm-block-title">尺码 <span class="muted">买衣服鞋子前翻这里</span></b>
      <div class="pf-size-grid">
        <label>衣裤<input class="inp" id="szClothing" value="${pfEsc(sz.clothing || '')}" placeholder="如 XL / 175/96A" maxlength="20"></label>
        <label>鞋子<input class="inp" id="szShoe" value="${pfEsc(sz.shoe || '')}" placeholder="如 42" maxlength="20"></label>
        <label>戒指<input class="inp" id="szRing" value="${pfEsc(sz.ring || '')}" placeholder="如 17 号" maxlength="20"></label>
        <label>手镯<input class="inp" id="szBracelet" value="${pfEsc(sz.bracelet || '')}" placeholder="如 58mm" maxlength="20"></label>
      </div>
      <button class="btn ghost" data-act="szsave">保存尺码</button>
    </div>`;
  // 日期按钮接全站统一选择器（补录用）。attachSitePicker 只收选择器字符串，
  // 这里按钮是动态渲染的元素，直接挂 openSitePicker（与 attachSitePicker 内部等价）。
  ['pfHDate', 'pfWDate'].forEach((k) => {
    const btn = box.querySelector(`.dt-btn[data-dt="${k}"]`);
    if (!btn) return;
    btn.addEventListener('click', () => {
      const inp = document.getElementById(k + 'Input');
      if (!inp) return;
      openSitePicker({
        mode: 'date', date: inp.value || '', title: '记录日期',
        onDone: ({ date }) => { inp.value = date || ''; window.syncDtBtns(); },
      });
    });
  });
  box.querySelectorAll('.pf-hm-add .inp').forEach((i) => { if (i.type === 'number') i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); box.querySelector(i.id === 'pfHVal' ? '[data-act=hadd]' : '[data-act=wadd]').click(); } }); });
}

// ===== v0.6.0：附件（照片 / 视频 / 文档，R2 桶 rjgx/姓名+手机号/） =====
function pfFileIcon(mime, name) {
  const m = String(mime || '');
  if (m.startsWith('image/')) return '🖼️';
  if (m.startsWith('video/')) return '🎬';
  if (m.startsWith('audio/')) return '🎵';
  if (m.includes('pdf')) return '📕';
  if (/\.(docx?|pptx?|xlsx?|txt|csv)$/i.test(name || '')) return '📄';
  return '📎';
}
function pfFileSize(n) {
  if (!n) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}

async function pfRenderFiles() {
  const box = pfEl('pfFiles');
  const hint = pfEl('pfFilesHint');
  if (!box || !PF.pid) return;
  let data = { files: [] };
  try {
    const res = await api('/api/profile/files?id=' + PF.pid);
    if (res.ok) data = await res.json();
  } catch (_) { /* 401 已处理 */ }
  if (hint) hint.textContent = data.folder ? `rjgx/${data.folder}/` : '';
  const fs = data.files || [];
  box.innerHTML = fs.length ? fs.map((f) => {
    const url = `/api/profile/files?id=${PF.pid}&fid=${f.id}`;
    const isImg = String(f.mime || '').startsWith('image/');
    return `
    <div class="pf-file">
      ${isImg ? `<a href="${url}" target="_blank" rel="noopener" class="pf-file-thumb"><img src="${url}" alt="${pfEsc(f.name)}" loading="lazy"></a>`
        : `<a href="${url}" target="_blank" rel="noopener" class="pf-file-icon">${pfFileIcon(f.mime, f.name)}</a>`}
      <div class="pf-file-meta">
        <a href="${url}" target="_blank" rel="noopener" class="pf-file-name" title="${pfEsc(f.name)}">${pfEsc(f.name)}</a>
        <span class="muted">${pfFileSize(f.size)}${f.date ? ' · ' + String(f.date).slice(5, 16) : ''}</span>
      </div>
      <div class="pf-file-ops">
        <a class="icon-btn" href="${url}&dl=1" title="下载"><svg><use href="#i-upload"/></svg></a>
        <button class="icon-btn" data-act="fdel" data-id="${f.id}" data-name="${pfEsc(f.name)}" title="删除"><svg><use href="#i-x"/></svg></button>
      </div>
    </div>`;
  }).join('') : '<div class="empty-hint">暂无附件。照片、视频、文档都可上传，存在你自己的对象存储里。</div>';
}

function pfRenderHero() {
  const b = PF.data.base;
  const bits = [];
  if (b.gender) bits.push(`<span class="contact-badge">${pfEsc(b.gender)}</span>`);
  if (b.age !== null && b.age !== undefined) bits.push(`<span class="contact-badge">${b.age} 岁</span>`);
  if (b.marriage) bits.push(`<span class="contact-badge">${pfEsc(b.marriage)}</span>`);
  if (b.isDeceased) bits.push('<span class="contact-badge">已逝</span>');
  (b.groups || []).forEach((g) => bits.push(`<span class="contact-badge">${pfEsc(g)}</span>`));
  (b.tags || []).forEach((t) => bits.push(`<span class="contact-badge">${pfEsc(t)}</span>`));
  const bd = [];
  if (b.isDeceased) bd.push('已逝者，不再生成生日提醒');
  else if (b.nextBirthday) {
    bd.push(`${b.nextBirthday.text}${b.birthdayCalendar === 'lunar' ? '（农历）' : ''} · 还有 ${b.nextBirthday.days} 天`);
    if (b.birthdayRemind) bd.push('年度生日提醒已开启');
  }
  if (b.referrer) bd.push(`引荐人：${b.referrer.name}`);
  pfEl('pfHero').innerHTML = `
    <div class="pf-hero">
      <span class="pf-hero-av">${pfEsc((b.name || '?')[0])}</span>
      <div style="min-width:0">
        <h2>${pfEsc(b.name)}${b.alias && b.alias !== b.name ? ` <small>${pfEsc(b.alias)}</small>` : ''}</h2>
        <div class="pf-hero-tags">${bits.join('')}</div>
      </div>
    </div>
    ${bd.length ? `<div class="note info" style="margin-top:10px">${bd.map(pfEsc).join(' · ')}</div>` : ''}`;
}

function pfRenderBasic() {
  const b = PF.data.base;
  const nameRows = [
    ['姓名', b.firstName], ['昵称', b.nickname],
    ['曾用名', b.formerName], ['英文名', b.englishName], ['别名', b.alias],
  ].filter(([, v]) => v);
  const bdLine = b.birthdayType
    ? `${b.birthText}${b.lunarText ? `（${b.lunarText}）` : ''}${b.birthdayRemind ? ' · 年度提醒已开启' : ' · 未开提醒'}`
    : '不知道具体年龄';
  pfEl('pfBasic').innerHTML = `
    <div class="pm-grid">
      ${nameRows.map(([k, v]) => `<div class="pm-item"><span>${k}</span><b>${pfEsc(v)}</b></div>`).join('')}
      <div class="pm-item"><span>性别</span><b>${pfEsc(b.gender || '—')}</b></div>
      <div class="pm-item"><span>生日</span><b>${pfEsc(bdLine)}</b></div>
    </div>
    <div class="form-actions"><button class="btn ghost" type="button" data-act="edit-basic">编辑基本信息</button></div>`;
}

function pfRenderSocial() {
  const b = PF.data.base;
  pfEl('pfSocial').innerHTML = `
    <label class="field"><span>婚姻状况</span>
      <select id="pfMarriageSel">
        <option value="">未填写</option>
        ${(PF.data.meta.marriages || []).map((m) => `<option value="${pfEsc(m)}"${m === b.marriage ? ' selected' : ''}>${pfEsc(m)}</option>`).join('')}
      </select>
    </label>
    <div class="pm-grid">
      <div class="pm-item"><span>引荐人</span><b>${b.referrer ? pfEsc(b.referrer.name) : '—'}</b></div>
      <div class="pm-item"><span>备注</span><b>${pfEsc(b.note || '—')}</b></div>
    </div>`;
  const sel = pfEl('pfMarriageSel');
  sel.addEventListener('change', async () => {
    const res = await api('/api/profile/detail', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: PF.pid, marriage: sel.value }) });
    if (res.ok) { toast('已保存'); pfOpenProfile(PF.pid); }
  });
}

// ===== 联系方式 =====
const METHOD_META = [
  ['phones', '电话号码', '如：13800000000', ['个人', '工作', '家庭']],
  ['emails', '电子邮件', '如：name@example.com', ['个人', '工作']],
  ['qq', 'QQ 号', '如：123456789', ['个人', '工作']],
  ['wechat', '微信号', '如：wxid_xxx 或手机号', ['个人', '工作']],
  ['addresses', '联系地址', '如：江苏省南京市××路×号', ['家庭', '公司']],
];
function pfRenderMethods() {
  const m = PF.data.methods;
  pfEl('pfMethods').innerHTML = METHOD_META.map(([kind, title, ph, labels]) => `
    <div class="pm-block" data-kind="${kind}">
      <b class="pm-block-title">${title}</b>
      ${(m[kind] || []).map((x) => `
        <div class="pm-row" data-id="${x.id}">
          <b>${pfEsc(x.value)}</b>
          ${x.label ? `<span class="contact-badge">${pfEsc(x.label)}</span>` : ''}
          <span class="pm-ops">
            <button class="icon-btn" data-act="medit" data-id="${x.id}" title="编辑"><svg><use href="#i-edit"/></svg></button>
            <button class="icon-btn" data-act="mdel" data-id="${x.id}" title="删除"><svg><use href="#i-x"/></svg></button>
          </span>
        </div>`).join('') || '<div class="empty-hint">暂无</div>'}
      <div class="pm-add" data-kind="${kind}">
        <input class="inp" data-k="value" placeholder="${ph}" maxlength="100">
        <input class="inp" data-k="label" list="labelList_${kind}" placeholder="备注" maxlength="20">
        <datalist id="labelList_${kind}">${labels.map((l) => `<option value="${l}">`).join('')}</datalist>
        <button class="btn ghost" data-act="madd" data-kind="${kind}">添加</button>
      </div>
    </div>`).join('');
}

// ===== 家庭关系 =====
function pfRenderRelatives() {
  const d = PF.data;
  pfEl('pfKinTitle').textContent = `「${d.base.name}」的家庭关系`;
  const kinOpts = d.meta.kins || [];
  const nameOpts = PF.allNames.filter((x) => x.id !== PF.pid);
  pfEl('pfRelatives').innerHTML = `
    ${(d.relatives || []).map((r) => `
      <div class="pm-row" data-id="${r.id}">
        <b>${r.refId ? `<a class="rel-link" data-act="ropen" data-id="${r.refId}">${pfEsc(r.name)} 🔗</a>` : pfEsc(r.name)}</b>
        <span class="contact-badge">是${pfEsc(d.base.name)}的${pfEsc(r.kin)}</span>
        <span class="pm-ops">
          <button class="icon-btn" data-act="redit" data-id="${r.id}" title="编辑"><svg><use href="#i-edit"/></svg></button>
          <button class="icon-btn" data-act="rdel" data-id="${r.id}" title="删除"><svg><use href="#i-x"/></svg></button>
        </span>
      </div>`).join('') || '<div class="empty-hint">暂无家庭关系，在下方添加</div>'}
    <form class="pm-add" id="relAddForm">
      <span class="pm-add-label">___ 是「${pfEsc(d.base.name)}」的</span>
      <input class="inp" data-k="kin" list="kinList" placeholder="关系：母亲 / 父亲…" maxlength="20" required>
      <datalist id="kinList">${kinOpts.map((k) => `<option value="${pfEsc(k)}">`).join('')}</datalist>
      <input class="inp" data-k="name" list="relNameList" placeholder="对方姓名（可搜索联系人）" maxlength="30" required>
      <datalist id="relNameList">${nameOpts.map((x) => `<option value="${pfEsc(x.name)}">`).join('')}</datalist>
      <button class="btn ghost" type="submit">添加</button>
    </form>
    <p class="field-hint">关系不在列表里？直接输入新称谓，保存后下次可直接选择。</p>`;
}

// ===== 公司/组织与职位 =====
function pfRenderWork() {
  const w = PF.data.work;
  const m = PF.data.meta;
  pfEl('pfWork').innerHTML = `
    <form class="pm-add" id="workForm">
      <label class="field"><span>公司/组织</span>
        <input class="inp" data-k="company" list="companyList" placeholder="如：阿里巴巴" maxlength="40" value="${pfEsc(w.company)}">
        <datalist id="companyList">${(m.companies || []).map((c) => `<option value="${pfEsc(c)}">`).join('')}</datalist>
      </label>
      <label class="field"><span>职位</span>
        <input class="inp" data-k="position" list="positionList" placeholder="如：后端工程师" maxlength="40" value="${pfEsc(w.position)}">
        <datalist id="positionList">${(m.positions || []).map((c) => `<option value="${pfEsc(c)}">`).join('')}</datalist>
      </label>
      <button class="btn primary" type="submit">保存</button>
    </form>
    <p class="field-hint">公司与职位可多人共用：同一家公司的其他联系人可直接选择相同值。</p>`;
}

// ===== 教育与成长 =====
function pfRenderEdu() {
  const list = PF.data.edus || [];
  const degrees = PF.vocab.edu || ['高中', '大专', '本科', '硕士', '博士'];
  pfEl('pfEdu').innerHTML = `
    ${(list || []).map((e, i) => `
      <form class="rep-box" data-edu-id="${e.id}">
        <div class="rep-h"><b>教育经历 ${i + 1}</b>
          <button class="icon-btn" data-act="edel" data-id="${e.id}" title="删除"><svg><use href="#i-x"/></svg></button></div>
        <div class="field-grid">
          <label class="field"><span>学校</span><input data-k="school" value="${pfEsc(e.school)}"></label>
          <label class="field"><span>专业</span><input data-k="major" value="${pfEsc(e.major)}"></label>
          <label class="field"><span>学历</span>
            <select data-k="degree">${degrees.concat(e.degree && !degrees.includes(e.degree) ? [e.degree] : [])
              .map((o) => `<option value="${pfEsc(o)}"${o === e.degree ? ' selected' : ''}>${pfEsc(o)}</option>`).join('')}</select>
          </label>
          <label class="field"><span>入学年份</span><input data-k="start" value="${pfEsc(e.start)}"></label>
          <label class="field"><span>毕业年份</span><input data-k="end" value="${pfEsc(e.end)}"></label>
        </div>
        <label class="field"><span>重要经历（交换 / 留学 / 培训）</span><input data-k="story" value="${pfEsc(e.story)}"></label>
        <button class="btn ghost" type="submit">保存这段经历</button>
      </form>`).join('') || ''}
    <form class="rep-box" id="eduAddForm">
      <div class="rep-h"><b>新增教育经历</b></div>
      <div class="field-grid">
        <label class="field"><span>学校</span><input data-k="school"></label>
        <label class="field"><span>专业</span><input data-k="major"></label>
        <label class="field"><span>学历</span><select data-k="degree">${degrees.map((o) => `<option value="${pfEsc(o)}">${pfEsc(o)}</option>`).join('')}</select></label>
        <label class="field"><span>入学年份</span><input data-k="start"></label>
        <label class="field"><span>毕业年份</span><input data-k="end"></label>
      </div>
      <label class="field"><span>重要经历（交换 / 留学 / 培训）</span><input data-k="story"></label>
      <button class="btn" type="submit">+ 添加这段教育</button>
    </form>`;
}

// ===== 宠物 =====
function pfRenderPets() {
  const list = PF.data.pets || [];
  pfEl('pfPets').innerHTML = `
    ${(list || []).map((p) => `
      <form class="pm-row" data-pet-id="${p.id}">
        <b>🐾 ${pfEsc(p.species)} · ${pfEsc(p.name)}</b>
        ${p.memorialDate ? `<span class="contact-badge">纪念日 ${pfEsc(p.memorialDate)}</span>` : ''}
        <span class="pm-ops"><button class="icon-btn" type="button" data-act="pdel" data-id="${p.id}" title="删除"><svg><use href="#i-x"/></svg></button></span>
      </form>`).join('') || '<div class="empty-hint">暂无宠物记录</div>'}
    <form class="pm-add" id="petAddForm">
      <input class="inp" data-k="species" list="speciesList" placeholder="种类：猫 / 狗 / 仓鼠…" maxlength="20" required>
      <datalist id="speciesList">${(PF.data.meta.petSpecies || []).map((s) => `<option value="${pfEsc(s)}">`).join('')}</datalist>
      <input class="inp" data-k="name" placeholder="名字" maxlength="20" required>
      <input class="inp" data-k="memorial_date" type="date" aria-label="纪念日（选填）">
      <button class="btn ghost" type="submit">添加</button>
    </form>
    <p class="field-hint">纪念日选填，可用于纪念离开的毛孩子；种类输入一次后会自动成为备选。</p>`;
}

// ===== 财务往来（v0.5.0：账本流水按联系人自动关联） =====
async function pfRenderFinance() {
  const el = pfEl('pfFinance');
  if (!el) return;
  el.innerHTML = '<div class="empty-hint">加载中…</div>';
  pfEl('pfFinSum').textContent = '';
  try {
    const res = await api('/api/transactions?contact_id=' + PF.pid);
    const data = await res.json();
    const list = data.list || [];
    const s = data.summary || {};
    pfEl('pfFinSum').textContent = list.length
      ? `${s.count} 笔 · 收 ¥${Math.round(s.income).toLocaleString('zh-CN')} · 支 ¥${Math.round(s.expense).toLocaleString('zh-CN')}`
      : '';
    if (!list.length) {
      el.innerHTML = '<div class="empty-hint">暂无往来流水。在「记一笔」时选择该联系人，账目会自动关联到这里。</div>';
      return;
    }
    el.innerHTML = '';
    list.forEach((t) => {
      const isTrf = t.flow === 'transfer';
      const row = document.createElement('div');
      row.className = 'txn-row';
      row.innerHTML = `
        <span class="txn-ic">${isTrf ? '⇄' : pfEsc(String(t.category || '其').slice(0, 1))}</span>
        <div class="txn-main"><b></b><div class="txn-meta"></div></div>
        <span class="txn-amt ${isTrf ? 'trf' : t.flow === 'expense' ? 'exp' : 'inc'}">${isTrf ? '→ ' : t.flow === 'expense' ? '-' : '+'}¥${Math.round(t.amount).toLocaleString('zh-CN')}</span>`;
      row.querySelector('b').textContent = t.note || (isTrf ? '转账' : t.category);
      row.querySelector('.txn-meta').innerHTML =
        `<span>${pfEsc(String(t.date).slice(5).replace('-', '/'))}${t.time ? ' ' + pfEsc(t.time) : ''}</span>` +
        (isTrf
          ? `<span>${pfEsc(t.account)} → ${pfEsc(t.toAccount || '')}</span>`
          : `<span class="cat-tag">${pfEsc(t.category)}${t.sub ? ' · ' + pfEsc(t.sub) : ''}</span><span>${pfEsc(t.account)}</span>`);
      row.title = '去账本查看当月流水';
      row.onclick = () => { if (window.openLedgerMonth) window.openLedgerMonth(t.date); };
      el.appendChild(row);
    });
  } catch (err) {
    if (!String(err.message).includes('unauthorized')) el.innerHTML = '<div class="empty-hint">加载财务往来失败</div>';
  }
}

// ===== 添加 / 编辑联系人弹窗 =====
// 生日：统一月历日期 + 年份 + 农历按钮（v0.5.1）
// 存储：bday_date 存公历参考日（年份 = 年份输入或当前年）；年份填了 → full，没填 → monthday；
//       农历激活时换算成农历月/日存库（calendar='lunar'），生日提醒因此按农历计算。
const P2 = (n) => String(n).padStart(2, '0');

/** 农历月日 + 农历年 → 公历日期反查（农历年腊月可能跨到次年公历年初，扫描前后各一年） */
function pfLunarToSolar(lMonth, lDay, lunarYear) {
  if (!window.lunarFull) return null;
  const y = lunarYear || new Date().getFullYear();
  const end = new Date(y + 1, 11, 31);
  for (const d = new Date(y - 1, 0, 1); d <= end; d.setDate(d.getDate() + 1)) {
    const l = lunarFull(d);
    if (l && l.year === y && l.month === lMonth && l.day === lDay) return new Date(d);
  }
  return null;
}

/** 农历按钮 / 农历文本联动（年份取换算出的农历年，带干支生肖） */
function pfSyncBdayLunar() {
  const f = pfEl('contactEditForm');
  const btn = pfEl('bdayLunarBtn');
  const textEl = pfEl('bdayLunarText');
  if (!f || !btn || !textEl) return;
  btn.classList.toggle('on', PF.bdayLunar);
  const raw = String(f.bday_date.value || '');
  if (!raw || !PF.bdayLunar || !window.lunarFull) { textEl.hidden = true; return; }
  const [y, mo, d] = raw.split('-').map(Number);
  const l = lunarFull(new Date(y, mo - 1, d));
  if (!l) { textEl.hidden = true; return; }
  textEl.textContent = `${l.year}年（${l.ganzhi}年/${l.animal}）${l.monthName}${l.dayName}，生日提醒将按农历计算。`;
  textEl.hidden = false;
}

function pfRenderChipPicker(boxId, words, selected, key) {
  const box = pfEl(boxId);
  const all = [...new Set([...words, ...selected])];
  box.innerHTML = all.length
    ? all.map((w) => `<button type="button" class="tf-chip${selected.includes(w) ? ' on' : ''}" data-pick="${pfEsc(w)}">${pfEsc(w)}</button>`).join('')
    : '<span class="field-hint">还没有可选项，在下方输入添加</span>';
  box.querySelectorAll('[data-pick]').forEach((b) =>
    b.addEventListener('click', () => {
      const arr = key === 'tag' ? PF.editTags : PF.editGroups;
      const w = b.dataset.pick;
      const i = arr.indexOf(w);
      if (i >= 0) arr.splice(i, 1); else arr.push(w);
      pfRenderChipPicker(boxId, words, arr, key);
    }));
}

function pfFillReferrers() {
  const dl = pfEl('pfReferrerList');
  if (dl) dl.innerHTML = PF.allNames
    .filter((x) => x.id !== PF.pid)
    .map((x) => `<option value="${pfEsc(x.name)}">`).join('');
}

async function pfOpenEditModal() {
  const editing = !!(PF.view === 'profile' && PF.data);
  const b = editing ? PF.data.base : null;
  PF.editingId = b ? b.id : null;
  const f = pfEl('contactEditForm');
  f.reset();
  pfEl('contactEditTitle').textContent = b ? `编辑「${b.name}」` : '添加联系人';
  pfEl('contactEditError').hidden = true;
  pfBuildNameFields();
  ['firstName', 'nickname', 'formerName', 'englishName', 'alias']
    .forEach((k) => { f[k].value = b ? (b[k] || '') : ''; });
  // 名字标签行：默认显示「姓名」标签页（其余字段值保留，靠标签上的「·」提示）
  pfShowNameField('firstName');
  pfSyncNameChips();
  // 性别：三个按钮（未知/男/女），默认未知；旧数据「其他」归为未知
  const g = b && ['男', '女', '未知'].includes(b.gender) ? b.gender : '未知';
  const gRadio = f.querySelector(`[name=gender][value="${g}"]`);
  if (gRadio) gRadio.checked = true;
  // 生日：换算成公历参考日填入统一月历按钮；记录初始快照用于提交时识别「未改动的旧 monthday 数据」
  PF.bdayLunar = b ? b.birthdayCalendar === 'lunar' : false;
  let bdayDate = '';
  PF.bdayInit = null;
  if (b && b.birthMonth) {
    if (b.birthdayCalendar === 'lunar') {
      // 农历生日：按出生农历年反查当年的公历对应日，月历直接定位到出生年
      const solar = pfLunarToSolar(b.birthMonth, b.birthDay, b.birthYear || null);
      if (solar) bdayDate = `${solar.getFullYear()}-${P2(solar.getMonth() + 1)}-${P2(solar.getDate())}`;
    } else {
      bdayDate = `${b.birthYear || new Date().getFullYear()}-${P2(b.birthMonth)}-${P2(b.birthDay)}`;
    }
    PF.bdayInit = {
      date: bdayDate,
      lunar: PF.bdayLunar,
      type: b.birthYear ? 'full' : 'monthday',
      month: b.birthMonth,
      day: b.birthDay,
    };
  }
  f.bday_date.value = bdayDate;
  pfSyncBdayLunar();
  if (window.syncDtBtns) window.syncDtBtns(f);   // 刷新生日按钮上的日期文字
  f.birthdayRemind.checked = b ? !!b.birthdayRemind : false;
  f.isDeceased.checked = b ? !!b.isDeceased : false;
  PF.editTags = b ? (b.tags || []).slice() : [];
  PF.editGroups = b ? (b.groups || []).slice() : [];
  f.referrerName.value = b && b.referrer ? b.referrer.name : '';
  f.note.value = b ? (b.note || '') : '';

  await pfLoadVocab();
  pfRenderChipPicker('tagChips', PF.vocab.rel_tag || [], PF.editTags, 'tag');
  pfRenderChipPicker('groupChips', PF.vocab.rel_group || [], PF.editGroups, 'group');
  pfFillReferrers();
  pfEl('contactEditModal').hidden = false;
  setTimeout(() => { try { f.firstName.focus(); } catch (_) {} }, 40);
}

function pfCloseEditModal() { pfEl('contactEditModal').hidden = true; }

// ===== 名字标签行（v0.5.1 改版）：6 个标签单选切换，默认显示「姓名」 =====
// 输入框常驻表单（hidden 切换），切走不清值、提交照常携带；有值的非激活标签带「·」提示
const NM_FIELDS = [
  ['firstName', '姓名', 20, '姓名，如：张三'],
  ['nickname', '昵称', 20, '昵称'],
  ['formerName', '曾用名', 20, '曾用名'],
  ['alias', '别名', 20, '别名'],
  ['englishName', '英文名', 30, '英文名'],
];
let nmActive = 'firstName';
function pfBuildNameFields() {
  const extra = pfEl('nameExtra');
  if (!extra || extra.dataset.built) return;
  extra.dataset.built = '1';
  extra.innerHTML = NM_FIELDS
    .map(([k, label, max, ph]) => `<input name="${k}" maxlength="${max}" data-nm="${k}" placeholder="${ph}" hidden>`)
    .join('');
}
function pfShowNameField(key) {
  const f = pfEl('contactEditForm');
  if (!f.querySelector(`input[data-nm="${key}"]`)) return;
  nmActive = key;
  NM_FIELDS.forEach(([k]) => {
    const el = f.querySelector(`input[data-nm="${k}"]`);
    if (el) el.hidden = k !== key;
  });
  pfSyncNameChips();
  const cur = f.querySelector(`input[data-nm="${key}"]`);
  if (cur && !cur.hidden) setTimeout(() => cur.focus(), 30);
}
function pfSyncNameChips() {
  const f = pfEl('contactEditForm');
  const box = pfEl('nameChips');
  if (!f || !box) return;
  box.querySelectorAll('[data-nm]').forEach((btn) => {
    const inp = f.querySelector(`input[data-nm="${btn.dataset.nm}"]`);
    if (!inp) return;
    const label = (NM_FIELDS.find(([k]) => k === btn.dataset.nm) || [])[1] || btn.dataset.nm;
    const hasVal = !!inp.value.trim();
    btn.classList.toggle('on', btn.dataset.nm === nmActive);
    btn.textContent = label + (hasVal && btn.dataset.nm !== nmActive ? ' ·' : '');
  });
}
function pfBindNameChips() {
  const box = pfEl('nameChips');
  if (!box || box.dataset.bound) return;
  box.dataset.bound = '1';
  box.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-nm]');
    if (btn) pfShowNameField(btn.dataset.nm);
  });
}

async function pfSubmitEdit(e) {
  e.preventDefault();
  const f = pfEl('contactEditForm');
  const errEl = pfEl('contactEditError');
  const err = (m) => { errEl.textContent = m; errEl.hidden = false; };
  const val = (k) => String(f[k].value || '').trim();

  const names = ['firstName', 'nickname', 'formerName', 'englishName', 'alias'].map(val).filter(Boolean);
  if (!names.length) return err('姓名、昵称、曾用名、英文名、别名至少填一项');
  const genderEl = f.querySelector('[name=gender]:checked');
  const gender = genderEl ? genderEl.value : '未知';

  const payload = {
    firstName: val('firstName'), nickname: val('nickname'),
    formerName: val('formerName'), englishName: val('englishName'), alias: val('alias'),
    gender,
    birthdayRemind: f.birthdayRemind.checked,
    isDeceased: f.isDeceased.checked,
    tags: PF.editTags.slice(),
    groups: PF.editGroups.slice(),
    note: val('note'),
  };
  // 生日：统一月历日期 + 农历标记 → 生日三元组（农历激活时按农历月/日存库，年份取换算农历年）
  const bdayRaw = String(f.bday_date.value || '');
  const unchangedMonthday = PF.bdayInit && PF.bdayInit.type === 'monthday'
    && bdayRaw === PF.bdayInit.date && PF.bdayLunar === PF.bdayInit.lunar;
  if (!bdayRaw) {
    payload.birthdayType = 'unknown';
    payload.birthdayCalendar = 'solar';
    payload.birthYear = null; payload.birthMonth = null; payload.birthDay = null;
  } else if (unchangedMonthday) {
    // 未改动的旧「只知月日」数据：保持原类型与月日
    payload.birthdayType = 'monthday';
    payload.birthdayCalendar = PF.bdayLunar ? 'lunar' : 'solar';
    payload.birthYear = null;
    payload.birthMonth = PF.bdayInit.month;
    payload.birthDay = PF.bdayInit.day;
  } else {
    const [refY, mo, d] = bdayRaw.split('-').map(Number);
    payload.birthdayType = 'full';
    if (PF.bdayLunar) {
      const lf = window.lunarFull ? lunarFull(new Date(refY, mo - 1, d)) : null;
      if (!lf) return err('生日日期超出农历换算范围（1900-2100）');
      payload.birthYear = lf.year; payload.birthMonth = lf.month; payload.birthDay = lf.day;
      payload.birthdayCalendar = 'lunar';
    } else {
      payload.birthYear = refY; payload.birthMonth = mo; payload.birthDay = d;
      payload.birthdayCalendar = 'solar';
    }
  }

  // 引荐人：按姓名匹配已有联系人
  const refName = val('referrerName');
  if (refName) {
    const hit = PF.allNames.find((x) => x.name === refName && x.id !== PF.pid);
    if (!hit) return err(`未找到引荐人「${refName}」，请从列表选择已有联系人`);
    payload.referrerId = hit.id;
  } else if (PF.editingId && PF.data && PF.data.base.referrer) {
    payload.referrerId = null; // 编辑时清空
  }

  // 新标签/群组登记入词库（下次可直接选）
  PF.editTags.forEach((w) => { if (!(PF.vocab.rel_tag || []).includes(w)) pfRememberVocab('rel_tag', w); });
  PF.editGroups.forEach((w) => { if (!(PF.vocab.rel_group || []).includes(w)) pfRememberVocab('rel_group', w); });

  const btn = pfEl('contactEditSubmit');
  btn.disabled = true;
  try {
    const res = PF.editingId
      ? await api('/api/profile/detail', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: PF.editingId, ...payload }) })
      : await api('/api/profile/detail', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return err(d.error || '保存失败，请稍后重试');
    pfCloseEditModal();
    toast(PF.editingId ? '已保存' : '已添加联系人');
    markSynced();
    if (window.invalidateContacts) window.invalidateContacts(); // 「记一笔→联系人」名单同步失效
    if (PF.editingId) await pfOpenProfile(PF.editingId);
    else { PF.view = 'list'; await pfLoadList(); }
  } catch (e2) {
    if (!String(e2.message).includes('unauthorized')) err('网络错误，请稍后重试');
  } finally {
    btn.disabled = false;
  }
}

// ===== 删除联系人 =====
async function pfDeletePerson() {
  if (!PF.pid || !PF.data) return;
  if (!(await confirmModal(`确定删除「${PF.data.base.name}」？其联系方式、家庭关系、教育与宠物记录会一并删除，且不可恢复。`))) return;
  const res = await api(`/api/profile/delete?id=${PF.pid}`, { method: 'DELETE' }).catch(() => null);
  if (res && res.ok) {
    const d = await res.json().catch(() => ({}));
    toast(`已删除「${d.name || ''}」`);
    markSynced();
    if (window.invalidateContacts) window.invalidateContacts();
    pfBackToList();
  } else {
    toast('删除失败，请重试');
  }
}

// ===== 模块事件委托 =====
function pfBindEvents() {
  // 名字标签行（一次性绑定）
  pfBindNameChips();
  // 筛选按钮：默认只显示联系人列表 + 搜索框，点按才展开筛选条件
  const filterBtn = pfEl('relFilterBtn');
  if (filterBtn) {
    filterBtn.addEventListener('click', () => {
      const panel = pfEl('relFilterPanel');
      if (!panel) return;
      panel.hidden = !panel.hidden;
      filterBtn.classList.toggle('on', !panel.hidden);
    });
  }
  // 人脉词库设置页（标签/群组：增删改+拖动排序）
  const setBtn = pfEl('relSetBtn');
  if (setBtn) setBtn.addEventListener('click', () => switchView('relset'));
  const setBack = pfEl('relsetBack');
  if (setBack) setBack.addEventListener('click', () => switchView('relations'));
  $$('#view-relset [data-rsflow]').forEach((b) => {
    b.addEventListener('click', () => { relset.kind = b.dataset.rsflow || 'rel_tag'; renderRelSet(); });
  });
  const setAdd = pfEl('relsetAddBtn');
  if (setAdd) setAdd.addEventListener('click', relsetAdd);
  const setName = pfEl('relsetName');
  if (setName) setName.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); relsetAdd(); } });
  // 生日：统一月历（date 模式，可清除 = 不知道年龄；点标题年月可换年份）+ 农历按钮
  const bdayDtBtn = document.querySelector('[data-dt=bdayDate]');
  if (bdayDtBtn) {
    bdayDtBtn.addEventListener('click', () => {
      const f = pfEl('contactEditForm');
      openSitePicker({
        mode: 'date', date: String(f.bday_date.value || ''), allowClear: true,
        onDone: ({ date: d }) => {
          f.bday_date.value = d || '';
          pfSyncBdayLunar();
          if (window.syncDtBtns) window.syncDtBtns(f);
        },
      });
    });
  }
  const lunarBtn = pfEl('bdayLunarBtn');
  if (lunarBtn) {
    lunarBtn.addEventListener('click', () => {
      PF.bdayLunar = !PF.bdayLunar;
      pfSyncBdayLunar();
    });
  }
  // 列表
  const search = pfEl('relSearch');
  if (search) {
    let t = null;
    search.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => { PF.filters.q = search.value.trim(); pfLoadList(); }, 260);
    });
  }
  const listBox = pfEl('relList');
  if (listBox) listBox.addEventListener('click', (e) => {
    const row = e.target.closest('[data-pf-id]');
    if (row) pfOpenProfile(Number(row.dataset.pfId));
  });
  const addBtn = pfEl('relAddBtn');
  if (addBtn) addBtn.addEventListener('click', () => { pfLoadNames().then(() => pfOpenEditModal()); });

  // 档案视图
  const back = pfEl('pfBack'); if (back) back.addEventListener('click', pfBackToList);
  const del = pfEl('pfDelete'); if (del) del.addEventListener('click', pfDeletePerson);
  const edit = pfEl('pfEditBtn'); if (edit) edit.addEventListener('click', pfOpenEditModal);

  // 编辑弹窗
  const modal = pfEl('contactEditModal');
  const close = pfEl('contactEditClose'); if (close) close.addEventListener('click', pfCloseEditModal);
  if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) pfCloseEditModal(); });
  const form = pfEl('contactEditForm');
  if (form) form.addEventListener('submit', pfSubmitEdit);
  const addTag = pfEl('addTagBtn');
  if (addTag) addTag.addEventListener('click', () => {
    const inp = pfEl('newTagInput');
    const w = (inp.value || '').replace(/[,，]/g, '').trim();
    if (w && !PF.editTags.includes(w)) {
      PF.editTags.push(w);
      pfRememberVocab('rel_tag', w);
      pfRenderChipPicker('tagChips', PF.vocab.rel_tag || [], PF.editTags, 'tag');
    }
    inp.value = '';
  });
  const addGroup = pfEl('addGroupBtn');
  if (addGroup) addGroup.addEventListener('click', () => {
    const inp = pfEl('newGroupInput');
    const w = (inp.value || '').replace(/[,，]/g, '').trim();
    if (w && !PF.editGroups.includes(w)) {
      PF.editGroups.push(w);
      pfRememberVocab('rel_group', w);
      pfRenderChipPicker('groupChips', PF.vocab.rel_group || [], PF.editGroups, 'group');
    }
    inp.value = '';
  });

  // —— 联系方式（事件委托）——
  const mBox = pfEl('pfMethods');
  if (mBox) {
    mBox.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'madd') {
        const add = btn.closest('.pm-add');
        const value = add.querySelector('[data-k=value]').value.trim();
        const label = add.querySelector('[data-k=label]').value.trim();
        if (!value) { toast('请填写内容'); return; }
        const res = await api('/api/profile/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ person_id: PF.pid, kind: btn.dataset.kind, value, label }) });
        const d = await res.json().catch(() => ({}));
        if (res.ok) { toast('已添加'); pfOpenProfile(PF.pid); } else toast(d.error || '添加失败');
      } else if (act === 'mdel') {
        if (!(await confirmModal('确定删除这条联系方式？'))) return;
        const res = await api(`/api/profile/contacts?id=${btn.dataset.id}`, { method: 'DELETE' });
        if (res.ok) { toast('已删除'); pfOpenProfile(PF.pid); }
      } else if (act === 'medit') {
        const row = btn.closest('.pm-row');
        const bEl = row.querySelector('b');
        const old = bEl.textContent;
        const badge = row.querySelector('.contact-badge');
        row.innerHTML = `
          <input class="inp" data-k="value" value="${pfEsc(old)}" maxlength="100">
          <input class="inp" data-k="label" value="${pfEsc(badge ? badge.textContent : '')}" placeholder="备注" maxlength="20">
          <span class="pm-ops">
            <button class="btn ghost" data-act="msave" data-id="${btn.dataset.id}">保存</button>
            <button class="btn ghost" data-act="mcancel">取消</button>
          </span>`;
      } else if (act === 'msave') {
        const row = btn.closest('.pm-row');
        const value = row.querySelector('[data-k=value]').value.trim();
        const label = row.querySelector('[data-k=label]').value.trim();
        if (!value) { toast('内容不能为空'); return; }
        const res = await api('/api/profile/contacts', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: Number(btn.dataset.id), value, label }) });
        if (res.ok) { toast('已保存'); pfOpenProfile(PF.pid); }
      } else if (act === 'mcancel') {
        pfOpenProfile(PF.pid);
      }
    });
  }

  // —— 家庭关系 ——
  const rBox = pfEl('pfRelatives');
  if (rBox) {
    rBox.addEventListener('click', async (e) => {
      const link = e.target.closest('[data-act=ropen]');
      if (link) { pfOpenProfile(Number(link.dataset.id)); return; }
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      if (btn.dataset.act === 'rdel') {
        if (!(await confirmModal('确定删除这条家庭关系？'))) return;
        const res = await api(`/api/profile/relatives?id=${btn.dataset.id}`, { method: 'DELETE' });
        if (res.ok) { toast('已删除'); pfOpenProfile(PF.pid); }
      } else if (btn.dataset.act === 'redit') {
        toast('请删除后重新添加以修改关系');
      }
    });
    rBox.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fm = e.target;
      const kin = fm.querySelector('[data-k=kin]').value.trim();
      const name = fm.querySelector('[data-k=name]').value.trim();
      if (!kin || !name) { toast('请填写关系与对方姓名'); return; }
      // 对方姓名若命中已有联系人则自动关联
      const hit = PF.allNames.find((x) => x.name === name && x.id !== PF.pid);
      const res = await api('/api/profile/relatives', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_id: PF.pid, kin, name, ref_id: hit ? hit.id : null }) });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { toast('已添加家庭关系'); pfOpenProfile(PF.pid); } else toast(d.error || '添加失败');
    });
  }

  // —— 公司/职位 ——
  const wBox = pfEl('pfWork');
  if (wBox) wBox.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fm = e.target;
    const res = await api('/api/profile/work', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ person_id: PF.pid,
        company: fm.querySelector('[data-k=company]').value.trim(),
        position: fm.querySelector('[data-k=position]').value.trim() }) });
    if (res.ok) { toast('已保存'); pfOpenProfile(PF.pid); }
  });

  // —— v0.6.0 个人信息：身高/体重记录 + 尺码（事件委托）——
  const bodyBox = pfEl('pfBody');
  if (bodyBox) bodyBox.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'hadd' || act === 'wadd') {
      const kind = act === 'hadd' ? 'height' : 'weight';
      const val = pfEl(act === 'hadd' ? 'pfHVal' : 'pfWVal');
      const date = pfEl(act === 'hadd' ? 'pfHDateInput' : 'pfWDateInput');
      const value = Number(val && val.value);
      if (!Number.isFinite(value) || value <= 0) { toast(kind === 'height' ? '请输入身高（cm）' : '请输入体重（kg）'); return; }
      const res = await api('/api/profile/body', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_id: PF.pid, kind, value, date: date ? date.value : '' }) });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { toast('已记录'); pfRenderBody(); markSynced(); } else toast(d.error || '保存失败');
    } else if (act === 'hdel') {
      if (!(await confirmModal('删除这条身高记录？'))) return;
      const res = await api(`/api/profile/body?rid=${btn.dataset.id}`, { method: 'DELETE' });
      if (res.ok) { toast('已删除'); pfRenderBody(); }
    } else if (act === 'szsave') {
      const g = (id) => { const el = pfEl(id); return el ? el.value.trim() : ''; };
      const res = await api('/api/profile/body', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: PF.pid, sizes: { clothing: g('szClothing'), shoe: g('szShoe'), ring: g('szRing'), bracelet: g('szBracelet') } }) });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { toast('尺码已保存'); markSynced(); } else toast(d.error || '保存失败');
    }
  });

  // —— v0.6.0 附件：上传 + 删除 ——
  const fileBtn = pfEl('pfFileBtn');
  const fileInput = pfEl('pfFileInput');
  if (fileBtn && fileInput) {
    fileBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const files = [...fileInput.files];
      fileInput.value = '';
      if (!files.length || !PF.pid) return;
      if (files.some((f) => f.size > 50 * 1024 * 1024)) { toast('单个文件不能超过 50MB'); return; }
      const fd = new FormData();
      fd.append('id', PF.pid);
      files.forEach((f) => fd.append('file', f));
      toast(`正在上传 ${files.length} 个文件…`);
      try {
        const res = await api('/api/profile/files', { method: 'POST', body: fd });
        const d = await res.json().catch(() => ({}));
        if (res.ok) { toast(`已上传 ${d.saved.length} 个文件` + (d.skipped && d.skipped.length ? `，${d.skipped.length} 个超限跳过` : '')); pfRenderFiles(); markSynced(); }
        else toast(d.error || '上传失败');
      } catch (err) { toast('上传失败：' + (err && err.message)); }
    });
  }
  const filesBox = pfEl('pfFiles');
  if (filesBox) filesBox.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act=fdel]');
    if (!btn) return;
    if (!(await confirmModal(`删除附件「${btn.dataset.name || ''}」？对象存储里的文件也会一并删除。`))) return;
    const res = await api(`/api/profile/files?id=${PF.pid}&fid=${btn.dataset.id}`, { method: 'DELETE' });
    if (res.ok) { toast('已删除'); pfRenderFiles(); }
  });

  // —— 教育 ——
  const eBox = pfEl('pfEdu');
  if (eBox) {
    eBox.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act=edel]');
      if (!btn) return;
      if (!(await confirmModal('确定删除这段教育经历？'))) return;
      const res = await api(`/api/profile/edu?id=${btn.dataset.id}`, { method: 'DELETE' });
      if (res.ok) { toast('已删除'); pfOpenProfile(PF.pid); }
    });
    eBox.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fm = e.target;
      const g = (k) => { const el = fm.querySelector(`[data-k="${k}"]`); return el ? el.value.trim() : ''; };
      const editId = fm.dataset.eduId;
      const payload = { school: g('school'), major: g('major'), degree: g('degree'),
        start: g('start'), end: g('end'), story: g('story') };
      const res = editId
        ? await api('/api/profile/edu', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: Number(editId), ...payload }) })
        : await api('/api/profile/edu', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ person_id: PF.pid, ...payload }) });
      if (res.ok) { toast('已保存'); pfOpenProfile(PF.pid); }
    });
  }

  // —— 宠物 ——
  const pBox = pfEl('pfPets');
  if (pBox) {
    pBox.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act=pdel]');
      if (!btn) return;
      if (!(await confirmModal('确定删除这条宠物记录？'))) return;
      const res = await api(`/api/profile/pets?id=${btn.dataset.id}`, { method: 'DELETE' });
      if (res.ok) { toast('已删除'); pfOpenProfile(PF.pid); }
    });
    pBox.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fm = e.target;
      const g = (k) => { const el = fm.querySelector(`[data-k="${k}"]`); return el ? el.value.trim() : ''; };
      const res = await api('/api/profile/pets', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_id: PF.pid, species: g('species'), name: g('name'), memorial_date: g('memorial_date') }) });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { toast('已添加'); pfOpenProfile(PF.pid); } else toast(d.error || '添加失败');
    });
  }
}

// 交给 app.js
window.PF = PF;
/* ---------- 人脉词库设置（v0.5.2：标签/群组 增删改 + 拖动排序） ---------- */
let relset = { kind: 'rel_tag', words: [] };

async function renderRelSet() {
  const box = pfEl('relsetList');
  if (!box) return;
  const isTag = relset.kind === 'rel_tag';
  pfEl('relsetKindTitle').textContent = isTag ? '人脉标签' : '人脉群组';
  $$('#view-relset [data-rsflow]').forEach((b) => b.classList.toggle('active', b.dataset.rsflow === relset.kind));
  const nameInput = pfEl('relsetName');
  if (nameInput) nameInput.placeholder = isTag ? '新增标签，如：跑步' : '新增群组，如：球友';
  box.innerHTML = '<div class="empty-hint">加载中…</div>';
  try {
    const res = await api('/api/vocab?kind=' + relset.kind);
    const d = await res.json();
    relset.words = d.words || [];
  } catch (err) {
    if (String(err.message).includes('unauthorized')) return;
    relset.words = [];
  }
  box.innerHTML = '';
  if (!relset.words.length) {
    box.innerHTML = '<div class="empty-hint">还没有内容，在上方输入添加。</div>';
    return;
  }
  relset.words.forEach((w) => box.appendChild(relsetRow(w)));
  bindRelsetDrag();
}

function relsetRow(w) {
  const row = document.createElement('div');
  row.className = 'ls-row sub';
  row.dataset.word = w.word;
  row.innerHTML = `
    <span class="ls-handle" title="拖动排序"><i></i><i></i><i></i></span>
    <span class="ls-name">${pfEsc(w.word)}</span>
    <span class="ls-actions">
      <button class="icon-btn edit" title="重命名" aria-label="重命名"><svg><use href="#i-edit"/></svg></button>
      <button class="icon-btn del" title="删除" aria-label="删除"><svg><use href="#i-trash"/></svg></button>
    </span>`;
  row.querySelector('.edit').onclick = async () => {
    const v = await askText({ title: '修改名称', value: w.word, maxlen: 20 });
    if (v === null) return;
    if (!v) { toast('名称不能为空'); return; }
    const res = await api('/api/vocab', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: w.id, word: v }),
    });
    if (res.ok) { toast('已重命名'); markSynced(); renderRelSet(); }
    else toast((await res.json().catch(() => ({}))).error || '修改失败');
  };
  row.querySelector('.del').onclick = async () => {
    if (!confirm(`删除「${w.word}」？已保存到联系人身上的该${relset.kind === 'rel_tag' ? '标签' : '群组'}不受影响。`)) return;
    const res = await api('/api/vocab?id=' + w.id, { method: 'DELETE' });
    if (res.ok) { toast('已删除'); markSynced(); renderRelSet(); }
    else toast('删除失败');
  };
  return row;
}

async function relsetAdd() {
  const inp = pfEl('relsetName');
  const word = (inp.value || '').replace(/[,，]/g, '').trim();
  if (!word) { toast('请填写名称'); return; }
  const res = await api('/api/vocab', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: relset.kind, word }),
  });
  if (res.ok) { inp.value = ''; toast('已添加'); markSynced(); renderRelSet(); }
  else toast((await res.json().catch(() => ({}))).error || '添加失败');
}

/** 同级拖动排序（与账本分类管理同一套交互）：松手写回 sort_order */
function bindRelsetDrag() {
  const scope = pfEl('relsetList');
  if (!scope || scope.dataset.dragBound) return;
  scope.dataset.dragBound = '1';
  scope.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.ls-handle');
    if (!handle) return;
    e.preventDefault();
    try { handle.setPointerCapture(e.pointerId); } catch (_) {}
    const row = handle.closest('.ls-row');
    if (!row) return;
    const rows = Array.from(scope.children).filter((el) => el.classList.contains('ls-row'));
    const rect = row.getBoundingClientRect();
    const holder = document.createElement('div');
    holder.className = 'ls-holder';
    holder.style.height = rect.height + 'px';
    row.parentElement.insertBefore(holder, row);
    Object.assign(row.style, {
      position: 'fixed', left: rect.left + 'px', top: rect.top + 'px',
      width: rect.width + 'px', zIndex: 60, pointerEvents: 'none',
    });
    const grabDy = e.clientY - rect.top;
    const moveTo = (y) => {
      row.style.top = (y - grabDy) + 'px';
      for (const r of rows) {
        if (r === row) continue;
        const rr = r.getBoundingClientRect();
        if (y < rr.top + rr.height / 2) {
          if (holder.nextElementSibling !== r) r.parentElement.insertBefore(holder, r);
          return;
        }
      }
      const last = rows[rows.length - 1];
      if (last !== row && last.nextElementSibling !== holder) last.parentElement.insertBefore(holder, last.nextElementSibling);
    };
    moveTo(e.clientY);
    const onMove = (ev) => moveTo(ev.clientY);
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      holder.parentElement.insertBefore(row, holder);
      holder.remove();
      row.style.cssText = '';
      const order = Array.from(scope.querySelectorAll('.ls-row')).map((r) => r.dataset.word);
      api('/api/vocab', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: relset.kind, order }),
      }).then((res) => {
        if (res.ok) { toast('排序已保存'); markSynced(); }
        else toast('排序保存失败');
      }).catch(() => {});
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
  });
}
window.renderRelSet = renderRelSet;

window.pfLoadList = pfLoadList;
window.pfOpenProfile = pfOpenProfile;
window.pfBindEvents = pfBindEvents;
window.pfEsc = pfEsc;
