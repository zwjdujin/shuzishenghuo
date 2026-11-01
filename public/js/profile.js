// 数字生活 · 人际关系 v0.4.0（A-Z 拼音分组列表 + 模块化档案）
// 依赖 app.js 的 api() / $ / $$ / toast / markSynced（运行时全局可用）

const PF = {
  view: 'list',
  editMode: false,       // v0.5.19 档案页查看/编辑模式（默认查看）
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
  dossierOrder: [],      // v0.5.32 档案页模块顺序（人际关系相关设置里拖动配置）
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
    await pfLoadListFields();   // 列表行小字字段随设置走
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

// ===== v0.5.31 列表显示字段（人际关系相关设置） =====
async function pfLoadListFields() {
  try {
    const res = await api('/api/settings');
    const csv = res.ok ? ((await res.json()).settings.rel_list_fields || '') : '';
    const arr = csv.split(',').map((x) => x.trim()).filter((x) => REL_FIELD_META.some(([k]) => k === x));
    PF.listFields = arr.length ? arr : ['gender', 'phone'];
  } catch (_) { /* 拉不到就用默认 */ }
}

function pfRenderListFields() {
  const box = pfEl('relFieldChips');
  if (!box) return;
  box.innerHTML = REL_FIELD_META.map(([k, label]) =>
    `<button type="button" class="tf-chip${PF.listFields.includes(k) ? ' on' : ''}" data-rf="${k}">${label}</button>`
  ).join('');
  box.querySelectorAll('[data-rf]').forEach((b) => {
    b.addEventListener('click', async () => {
      const set = new Set(PF.listFields);
      if (set.has(b.dataset.rf)) set.delete(b.dataset.rf); else set.add(b.dataset.rf);
      const fields = REL_FIELD_META.map(([k]) => k).filter((k) => set.has(k));
      const res = await api('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rel_list_fields: fields.join(',') }) });
      if (res.ok) {
        PF.listFields = fields;
        pfRenderListFields();
        toast('已保存，列表即时生效');
        markSynced();
        if (PF.view === 'list') pfRenderList();
      } else toast('保存失败');
    });
  });
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
  const sampleRow = '<div class="sample-row" id="pfSampleRow" role="button" tabindex="0"><span class="sample-ico">📖</span><div class="sample-main"><b>示例档案 · 陈默</b><small>示范资料页 · 19 个模块全展开，可试编辑（仅本页生效，刷新还原）</small></div><span class="sample-go">查看 →</span></div>';
  if (!PF.list.length) {
    box.innerHTML = sampleRow + '<div class="empty-hint">还没有联系人。可以先看看下面的示例档案，或点右上角「添加联系人」开始</div>';
    return;
  }
  // v0.5.31：列表行样式与「记一笔 → 选择联系人」一致（头像 + 名字 + 字段小字行），A-Z 分组保留
  box.innerHTML = sampleRow + pfGroupByLetter(PF.list).map((g) => `
    <div class="az-group">
      <div class="az-letter">${pfEsc(g.letter)}<span>${g.rows.length}</span></div>
      ${g.rows.map((p) => `
        <div class="cp-row rel-cp-row${p.isDeceased ? ' deceased' : ''}" data-pf-id="${p.id}" role="button" tabindex="0">
          <span class="cp-av">${pfEsc((p.name || '?')[0])}</span>
          <div class="cp-main">
            <b>${pfEsc(p.name)}${p.isDeceased ? ' <span class="contact-badge">已逝</span>' : ''}</b>
            <small>${pfListSubtitle(p)}</small>
          </div>
        </div>`).join('')}
    </div>`).join('');
}

/** 列表小字行：按「人际关系相关设置」勾选的字段拼接，· 隔离（姓名固定在标题行，不在这里） */
const REL_FIELD_META = [
  ['gender', '性别'], ['phone', '电话'], ['group', '人脉群组'], ['marriage', '婚姻状况'],
  ['company', '公司/组织'], ['position', '职位'], ['school', '学校'],
];
function pfListSubtitle(p) {
  const f = (PF.listFields && PF.listFields.length) ? PF.listFields : ['gender', 'phone'];
  const parts = [];
  if (f.includes('gender') && p.gender) parts.push(p.gender);
  if (f.includes('phone') && p.phone) parts.push(p.phone);
  if (f.includes('group') && (p.groups || []).length) parts.push(p.groups.join('、'));
  if (f.includes('marriage') && p.marriage) parts.push(p.marriage);
  if (f.includes('company') && p.company) parts.push(p.company);
  if (f.includes('position') && p.position) parts.push(p.position);
  if (f.includes('school') && p.school) parts.push(p.school);
  return parts.map(pfEsc).join(' · ') || '&nbsp;';
}

// ===== 档案视图 =====
async function pfOpenProfile(id) {
  PF.pid = Number(id);
  PF.view = 'profile';
  PF.isSample = false;
  document.body.classList.remove('pf-sample');
  // 深链：#/relations/{id}（hash 路由回环由 pfOpenByHash 去重）
  if (location.hash !== '#/relations/' + PF.pid) location.hash = '#/relations/' + PF.pid;
  pfEl('relListView').hidden = true;
  pfEl('relProfileView').hidden = false;
  ['pfHero', 'pfBasic', 'pfSocial', 'pfMethods', 'pfRelatives', 'pfWork', 'pfEdu', 'pfPets', 'pfBody', 'pfFiles']
    .forEach((k) => { const el = pfEl(k); if (el) el.innerHTML = '<div class="empty-hint">加载中…</div>'; });
  if (pfEl('pfFinance')) pfEl('pfFinance').innerHTML = '<div class="empty-hint">加载中…</div>';
  pfRenderFinance();
  try {
    const namesP = pfLoadNames();   // 姓名自动链接需要名单，与详情并行
    const filesP = pfEnsureFiles(); // 头像从附件图片引用
    const res = await api('/api/profile/detail?id=' + PF.pid);
    PF.data = await res.json();
    await Promise.all([namesP, filesP]);
    pfRenderAll();
    markSynced();
    pfLoadDossierOrder().then(() => { pfApplyOrder(); pfRenderIndex(); });   // 设置可能中途改过，回填一次
  } catch (err) {
    if (!String(err.message).includes('unauthorized')) {
      const el = pfEl('pfHero');
      if (el) el.innerHTML = '<div class="empty-hint">加载档案失败</div>';
    }
  }
}

function pfBackToList() {
  PF.isSample = false;
  document.body.classList.remove('pf-sample');
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
  pfRenderIdentity();   // 身份标识（原基础身份 + 社会关系折叠）
  pfRenderBody();       // 体测与尺码（身高/体重/BMI/尺码 + 附加资料）
  pfRenderMethods();    // 联络方式
  pfRenderWork();       // 职务与授权
  pfRenderEdu();        // 教育与能力
  pfRenderHome();       // 居住与家庭（家庭关系 + 宠物）
  pfRenderFinance();    // 财务往来（账本联动）
  pfRenderFiles();      // 附件（R2）
  pfRenderJsonSections();
  pfSyncEditMode();     // 查看/编辑模式的面板可见性与按钮态 + 排序 + 目录
}

// ===== v0.5.19 查看/编辑模式 =====
function pfSyncEditMode() {
  // 按钮：查看模式显示「编辑」（铅笔），编辑模式显示「完成」（对勾）
  const btn = pfEl('pfEditBtn');
  if (btn) {
    btn.innerHTML = PF.editMode
      ? '<svg><use href="#i-check"/></svg><span class="btn-long">完成</span><span class="btn-short">完成</span>'
      : '<svg class="btn-ico-long"><use href="#i-edit"/></svg><span class="btn-long">编辑基本信息</span><span class="btn-short">编辑</span>';
  }
  // 查看模式隐藏空分区；编辑模式全部展开
  // v0.5.32：异步模块（财务往来/个人信息/附件）的数据到达晚于本函数，
  // 它们的显隐由各自渲染完成时自管（pfRenderFinance/pfRenderBody/pfRenderFiles 尾部），
  // 这里只处理同步渲染的模块，避免「先隐藏、后无再同步」的时序竞态。
  const b = PF.data || {};
  const methods = b.methods || {};
  const methodsAny = METHOD_META.some(([k]) => (methods[k] || []).length);
  const secData = (k) => (b.sections || {})[k] || {};
  const hasCustom = (k) => pfSecHasData(pfSecDef(k), secData(k));
  const hideIfEmpty = !PF.editMode;
  const visibility = {
    pfPanel_identity: true,
    pfPanel_methods: !hideIfEmpty || methodsAny || hasCustom('methods'),
    pfPanel_clearance: !hideIfEmpty || !!(b.work && (b.work.company || b.work.position)) || hasCustom('clearance'),
    pfPanel_edu: !hideIfEmpty || (b.edus || []).length > 0 || hasCustom('edu'),
    pfPanel_home: !hideIfEmpty || (b.relatives || []).length > 0 || (b.pets || []).length > 0 || hasCustom('home'),
  };
  Object.entries(visibility).forEach(([id, show]) => {
    const el = pfEl(id);
    if (el) el.hidden = hideIfEmpty && !show;
  });
  document.body.classList.toggle('edit', PF.editMode);   // v0.5.35：编辑模式下每段显示「编辑本段」
  pfApplyOrder();    // v0.5.32：按设置排序并写标题序号
  pfRenderIndex();   // v0.5.32：目录只列当前可见（有资料）的模块
}

// ===== v0.5.33 档案卷宗：段落模板（结构化模块 + JSON 自由段落 + 应用联动） =====
// kind: struct=原结构化模块（原表直读，编辑走全局「编辑」/弹窗）| json=自由段落（contact_sections 载荷）
//       app=应用联动（账本流水 / R2 附件）
const PF_SECTIONS = [
  { key: 'identity',  t: '身份标识', kind: 'struct', r: 1, editor: 'identity' },
  { key: 'body',      t: '体测与尺码', badge: '量体记录', kind: 'struct', r: 1, tb: 1, list: 1, editor: 'body' },
  { key: 'methods',   t: '联络方式', kind: 'struct', r: 1, editor: 'methods' },
  { key: 'clearance', t: '职务与授权', kind: 'struct', r: 1, chips: 1, editor: 'clearance' },
  { key: 'edu',       t: '教育与能力', kind: 'struct', bars: 1, editor: 'edu' },
  { key: 'vehicle',   t: '交通工具', badge: '可附车照', kind: 'json', cards: 1, r: 1 },
  { key: 'interest',  t: '兴趣爱好', kind: 'json', list: 1 },
  { key: 'network',   t: '网络资产', kind: 'json', r: 1, tb: 1 },
  { key: 'lifecycle', t: '生活数据', kind: 'json', r: 1 },
  { key: 'food',      t: '饮食与偏好', kind: 'json', r: 1, list: 1 },
  { key: 'health',    t: '健康档案', badge: '隐私档案', badgeClay: 1, kind: 'json', r: 1 },
  { key: 'home',      t: '居住与家庭', kind: 'struct', r: 1, list: 1, link: 1, editor: 'home' },
  { key: 'finview',   t: '财务概览', badge: '财务概览', badgeClay: 1, kind: 'json', r: 1 },
  { key: 'finance',   t: '财务往来', kind: 'app' },
  { key: 'docs',      t: '证件与证照', badge: '敏感信息', kind: 'json', r: 1 },
  { key: 'background',t: '背景与语言', kind: 'json', r: 1 },
  { key: 'emergency', t: '授权与应急', badge: '仅自己可见', badgeClay: 1, kind: 'json', r: 1, link: 1 },
  { key: 'devices',   t: '设备与凭据', badge: '仅存指纹', badgeClay: 1, kind: 'json', tb: 1 },
  { key: 'travel',    t: '出行与目标', kind: 'json', r: 1, list: 1 },
  { key: 'timeline',  t: '大事记', kind: 'json', tl: 1 },
  { key: 'files',     t: '附件', kind: 'app' },
];
const pfSecDef = (k) => PF_SECTIONS.find((s) => s.key === k) || { key: k, t: k, kind: 'json', r: 1 };

/** 面板壳：一次性生成（boot 时），渲染函数只往里填内容 */
function pfBuildPanels() {
  const main = pfEl('pfMain');
  if (!main || main.dataset.built) return;
  main.dataset.built = '1';
  const STRUCT_BODY = {
    identity: '<div id="pfBasic"></div>',
    body: '<div id="pfBody"></div>',
    methods: '<div id="pfMethods"></div>',
    clearance: '<div id="pfWork"></div>',
    edu: '<div id="pfEdu"></div>',
    home: '<div id="pfRelatives"></div><div id="pfPets"></div>',
  };
  main.innerHTML = PF_SECTIONS.map((s) => {
    let headExtra = '';
    let body = '';
    if (s.key === 'finance') {
      headExtra = '<span class="muted" id="pfFinSum"></span>';
      body = '<p class="ts-hint">在「记一笔」时选择该联系人，账目会自动关联到这里。</p><div id="pfFinance" class="txn-stack"></div>';
    } else if (s.key === 'files') {
      headExtra = '<div class="cal-actions"><span class="muted" id="pfFilesHint"></span>'
        + '<button class="btn ghost" id="pfFileBtn" type="button"><svg><use href="#i-upload"/></svg>上传附件</button>'
        + '<input type="file" id="pfFileInput" multiple hidden></div>';
      body = '<div id="pfFiles" class="pf-files"></div>';
    } else if (s.kind === 'struct') {
      body = STRUCT_BODY[s.key] || '';
    } else {
      body = '<div class="pf-sec-body" data-secbody="' + s.key + '"></div>';
    }
    const editBtn = s.kind === 'app'
      ? ''
      : '<button class="btn sec-edit" data-sec-edit="' + s.key + '" style="padding:5px 11px;font-size:11.5px">编辑本段</button>';
    const badge = s.badge ? '<span class="badge' + (s.badgeClay ? ' clay' : '') + '">' + pfEsc(s.badge) + '</span>' : '';
    const initHidden = (s.kind === 'json' || s.key === 'finance' || s.key === 'files') ? ' hidden' : '';
    return '<article class="panel" id="pfPanel_' + s.key + '" data-mod="' + s.key + '"' + initHidden + '>'
      + '<div class="panel-head"><div><h2 data-base="' + s.t + '">' + pfEsc(s.t) + '</h2></div><span class="sp"></span>'
      + badge + headExtra + editBtn + '</div>' + body + '</article>';
  }).join('');
}

/* ---- 段落载荷渲染（与确认的预览稿同一套渲染器，纯文本转义） ---- */
/** 姓名自动超链接：文本里出现的联系人姓名（≥2 字、非自己）包成可点击链接，长名优先 */
function pfLinkify(text) {
  const out = pfEsc(String(text || ''));
  const seen = new Set();
  const names = (PF.allNames || []).filter((n) => n.id !== PF.pid && String(n.name || '').length >= 2 && !seen.has(n.name) && seen.add(n.name))
    .sort((a, b) => b.name.length - a.name.length);
  let res = out;
  names.forEach((n) => {
    const name = pfEsc(n.name);
    if (res.includes(name)) res = res.split(name).join('<a class="person" data-pf-link="' + n.id + '">' + name + '</a>');
  });
  return res;
}
function pfSecVrows(def, rows) {
  let h = '';
  (rows || []).forEach((r) => {
    if (!String(r[1] || '').trim()) return;   // 空字段不渲染
    const vHtml = def.link ? pfLinkify(r[1]) : pfEsc(r[1]);
    h += '<div class="sec-vrow"><span class="k">' + pfEsc(r[0]) + '</span><span class="v">' + vHtml + '</span></div>';
  });
  return h;
}
// v0.5.40：列表行改为与键值行一致（.sec-vrow），左侧对齐，不再右对齐
function pfSecList(def, list) {
  let h = '';
  (list || []).forEach((it) => {
    if (!String(it[0] || '').trim() && !String(it[1] || '').trim()) return;
    const kHtml = def.link ? pfLinkify(it[0]) : pfEsc(it[0]);
    const vHtml = def.link ? pfLinkify(it[1] || '') : pfEsc(it[1] || '');
    h += '<div class="sec-vrow"><span class="k">' + kHtml + '</span><span class="v">' + vHtml + '</span></div>';
  });
  return h;
}
function pfSecTb(tb) {
  if (!tb || !tb.length) return '';
  let t = '<div class="sec-tbwrap"><table><tr>';
  (tb[0] || []).forEach((c) => { t += '<th>' + pfEsc(c) + '</th>'; });
  t += '</tr>';
  for (let m = 1; m < tb.length; m++) {
    t += '<tr>';
    (tb[m] || []).forEach((c) => { t += '<td>' + pfEsc(c) + '</td>'; });
    t += '</tr>';
  }
  t += '</table></div>';
  let c = '<div class="sec-tb-cards">';
  for (let p = 1; p < tb.length; p++) {
    for (let q = 0; q + 1 < (tb[p] || []).length; q += 2) {
      c += '<div class="sec-tb-kv"><span>' + pfEsc(tb[p][q]) + '</span><b>' + pfEsc(tb[p][q + 1]) + '</b></div>';
    }
  }
  return t + c + '</div>';
}
function pfSecBars(bars) {
  let h = '';
  (bars || []).forEach((b) => {
    const pct = Math.max(0, Math.min(100, Number(b[1]) || 0));
    h += '<div class="sec-bar"><div class="t"><span>' + pfEsc(b[0]) + '</span><span>' + pct + '%</span></div><div class="tr"><i style="width:' + pct + '%"></i></div></div>';
  });
  return h;
}
function pfSecChips(tags) {
  let h = '<div class="sec-chips">';
  (tags || []).forEach((t) => { if (String(t || '').trim()) h += '<span class="sec-chip">' + pfEsc(t) + '</span>'; });
  return h + '</div>';
}
function pfSecTl(tl) { return pfSecList({ list: 1 }, tl); }
function pfSecBodyHtml(def, d) {
  let h = '';
  if (def.cards) h += pfSecCards(d.cards);
  if (def.r) h += pfSecVrows(def, d.r);
  if (def.list) h += pfSecList(def, d.list);
  if (def.tb) h += pfSecTb(d.tb);
  if (def.tl) h += pfSecTl(d.tl);
  return h;
}
function pfSecHasData(def, d) {
  if (def.cards && (d || {}).cards && d.cards.length) return true;
  return !!pfSecBodyHtml(def, d || {}).replace(/\s|<[^>]*>/g, '').length;
}
/** 车辆卡片（照片取自该联系人附件库 image/*） */
function pfSecCards(cards) {
  let h = '<div class="sec-vgrid">';
  (cards || []).forEach((c) => {
    const img = c.fid
      ? '<img src="/api/profile/files?id=' + PF.pid + '&fid=' + Number(c.fid) + '" alt="' + pfEsc(c.name || '车照') + '" loading="lazy">'
      : '<span class="ph">暂无照片 · 编辑本段可从附件选择</span>';
    h += '<div class="sec-vcard"><div class="sec-vimg">' + img
      + (c.name ? '<span class="cap">' + pfEsc(c.name) + '</span>' : '')
      + '</div><div class="sec-vb">' + pfSecVrows({ r: 1 }, c.rows) + '</div></div>';
  });
  return h + '</div>';
}
/** 渲染单个 JSON 段落（含空段隐藏） */
function pfRenderJsonSection(key) {
  const def = pfSecDef(key);
  if (def.kind !== 'json') return;
  const el = document.querySelector('#pfMain .pf-sec-body[data-secbody="' + key + '"]');
  const panel = pfEl('pfPanel_' + key);
  if (!el || !panel) return;
  const d = (PF.data && PF.data.sections) || {};
  const payload = pfSecCleanCustom(key, d[key] || {});
  el.innerHTML = pfSecBodyHtml(def, payload);
  panel.hidden = !PF.editMode && !pfSecHasData(def, payload);
}
function pfRenderJsonSections() {
  PF_SECTIONS.filter((s) => s.kind === 'json').forEach((s) => pfRenderJsonSection(s.key));
}

/* ---- JSON 段落编辑器（侧滑，一次一段） ---- */
let pfSecEdit = null;   // {key, pid, data, isStruct}
async function pfOpenSectionEditor(key, opts = {}) {
  const def = pfSecDef(key);
  const pid = Number(opts.pid || PF.pid);
  if ((!pid && !PF.isSample) || def.kind === 'app') return;
  pfSecEdit = { key, pid, def, editor: def.editor || 'json' };
  pfSeHead(key, opts.pname);
  if (def.editor === 'identity') pfEditIdentity();
  else if (def.editor === 'body') pfEditBody();
  else if (def.editor === 'methods') pfEditMethods();
  else if (def.editor === 'clearance') pfEditClearance();
  else if (def.editor === 'edu') pfEditEdu();
  else if (def.editor === 'home') pfEditHome();
  else {
    if (def.cards && !PF.filesData) await pfEnsureFiles();
    const src = ((PF.data && PF.data.sections) || {})[key] || {};
    pfSecEdit.data = pfSecCleanCustom(key, JSON.parse(JSON.stringify(src)));
    (opts.appendRows || []).forEach((r) => {
      if (def.list || def.tl) {
        if (!pfSecEdit.data.list) pfSecEdit.data.list = [];
        if (!pfSecEdit.data.list.some((x) => x[0] === r[0] && x[1] === r[1])) pfSecEdit.data.list.push(r);
      } else {
        if (!pfSecEdit.data.r) pfSecEdit.data.r = [];
        if (!pfSecEdit.data.r.some((x) => x[0] === r[0] && x[1] === r[1])) pfSecEdit.data.r.push(r);
      }
    });
    const wrap = pfSecBuildEditorBody(def, pfSecEdit.data);
    pfEl('secEditBody').innerHTML = '';
    pfEl('secEditBody').appendChild(wrap);
  }
  openModal(pfEl('secEditor'), { onEsc: () => pfCloseSectionEditor() });
}
function pfSecRow(inputs, extraHtml, del) {
  const div = document.createElement('div');
  div.className = 'secrow';
  div.innerHTML = inputs.map((inp) => inp).join('') + (extraHtml || '') + (del ? '<button type="button" class="sec-row-del" title="删除此行">✕</button>' : '');
  return div;
}
function pfSecBuildEditorBody(def, data) {
  const body = document.createElement('div');
  body.className = 'sec-custom';
  const mk = (cls, ph, val) => `<input type="text" class="${cls || ''}" placeholder="${pfEsc(ph || '')}" value="${pfEsc(val || '')}">`;
  // v0.5.42：r/list/tb 各自独立成组（此前 else-if 串行，键值行+清单/表格并存的段落只能编辑到第一种）
  const addRowBtn = (wrap, buildRow) => {
    const btn = document.createElement('button');
    btn.className = 'sec-add';
    btn.type = 'button';
    btn.textContent = '＋ 添加一行';
    btn.onclick = () => wrap.insertBefore(buildRow(), btn);
    wrap.appendChild(btn);
  };
  if (def.cards) {
    body.insertAdjacentHTML('beforeend', '<p class="sec-hint">每张卡片 = 一辆交通工具；照片从该联系人的附件（图片）中选择，保存后显示在卡片上。</p>');
    const cards = (data.cards && data.cards.length) ? data.cards : [{}];
    cards.forEach((c) => body.appendChild(pfSecCardBlock(c)));
    const addC = document.createElement('button');
    addC.className = 'sec-add';
    addC.type = 'button';
    addC.textContent = '＋ 添加一辆车';
    addC.onclick = () => body.insertBefore(pfSecCardBlock({}), body.querySelector('.sec-addc'));
    body.appendChild(addC);
    const gap = document.createElement('div');
    gap.className = 'sec-addc';
    body.appendChild(gap);
  }
  if (def.r) {
    body.insertAdjacentHTML('beforeend', '<p class="sec-hint">键值行：左侧为资料名称（如 血型 / 过敏史），右侧为内容。</p>');
    const wrap = document.createElement('div');
    wrap.className = 'sec-rwrap';
    wrap.dataset.kind = 'r';
    const rows = (data.r && data.r.length) ? data.r : [['', '']];
    rows.forEach((r) => wrap.appendChild(pfSecRow([mk('sk', '名称', r[0]), mk('', '内容', r[1])], '', true)));
    addRowBtn(wrap, () => pfSecRow([mk('sk', '名称'), mk('', '内容')], '', true));
    body.appendChild(wrap);
  }
  if (def.list || def.tl) {
    body.insertAdjacentHTML('beforeend', '<p class="sec-hint">两列行：左侧为条目名称' + (def.tl ? '（时间）' : '') + '，右侧为说明。</p>');
    const wrap = document.createElement('div');
    wrap.className = 'sec-rwrap';
    wrap.dataset.kind = 'list';
    const rows = (data.list && data.list.length) ? data.list : [['', '']];
    rows.forEach((r) => wrap.appendChild(pfSecRow([mk('sk', def.tl ? '时间' : '条目', r[0]), mk('', '说明', r[1])], '', true)));
    addRowBtn(wrap, () => pfSecRow([mk('sk', def.tl ? '时间' : '条目'), mk('', '说明')], '', true));
    body.appendChild(wrap);
  }
  if (def.tb) {
    body.insertAdjacentHTML('beforeend', '<p class="sec-hint">四列表格：每行两组「名称 + 数值」，手机端会自动转为卡片展示。</p>');
    const wrap = document.createElement('div');
    wrap.className = 'sec-rwrap';
    wrap.dataset.kind = 'tb';
    const rows = (data.tb && data.tb.length) ? data.tb : [['', '', '', '']];
    rows.forEach((row) => wrap.appendChild(pfSecRow([mk('', '名称', row[0]), mk('', '数值', row[1]), mk('', '名称', row[2]), mk('', '数值', row[3])], '', true)));
    addRowBtn(wrap, () => pfSecRow([mk('', '名称'), mk('', '数值'), mk('', '名称'), mk('', '数值')], '', true));
    body.appendChild(wrap);
  }
  if (def.bars) {
    body.insertAdjacentHTML('beforeend', '<p class="sec-hint">能力条：每行「名称 + 百分比」（0—100 的整数，如 88）。</p>');
    const wrap = document.createElement('div');
    wrap.className = 'sec-rwrap';
    wrap.dataset.kind = 'bars';
    const rows = (data.bars && data.bars.length) ? data.bars : [['', '']];
    rows.forEach((r) => wrap.appendChild(pfSecRow([mk('sk', '名称', r[0]), mk('', '百分比', r[1])], '', true)));
    addRowBtn(wrap, () => pfSecRow([mk('sk', '名称'), mk('', '百分比')], '', true));
    body.appendChild(wrap);
  }
  if (def.chips) {
    body.insertAdjacentHTML('beforeend', '<p class="sec-hint">标签组：用逗号分隔多个标签，留空则不显示。</p>');
    body.insertAdjacentHTML('beforeend', '<div class="sec-rwrap" data-kind="tags"><div class="secrow"><input type="text" data-tags-inp placeholder="标签（用逗号分隔，如：服务器运维, 容器编排）" value="' + pfEsc((data.tags || []).join(', ')) + '"></div></div>');
  }
  return body;
}
function pfCollectSectionData() {
  const { def } = pfSecEdit;
  const body = pfEl('secEditBody');
  const val = (inp) => String(inp.value || '').trim();
  const data = {};
  if (def.cards) {
    data.cards = [];
    body.querySelectorAll('.sec-card').forEach((card) => {
      const name = card.querySelector('.cname').value.trim();
      const fid = Number(card.querySelector('.fidsel').value) || null;
      const rows = [];
      card.querySelectorAll('.sec-crows .secrow').forEach((row) => {
        const ins = row.querySelectorAll('input[type=text]');
        if (ins.length >= 2 && ins[0].value.trim() && ins[1].value.trim()) rows.push([ins[0].value.trim(), ins[1].value.trim()]);
      });
      if (name || rows.length) data.cards.push({ name, fid, rows });
    });
    if (!data.cards.length) delete data.cards;
  }
  if (def.r) {
    data.r = [];
    // v0.5.41：必须圈定在自定义行容器内——居住与家庭等编辑器同屏还有家庭成员/宠物行，全量查询会把它们误收进自定义数据
    // v0.5.42：r/list/tb 三种行组并存（data-kind 区分），各收各的
    body.querySelectorAll('.sec-rwrap[data-kind="r"] .secrow').forEach((row) => {
      if (row.dataset.del) return;
      const ins = row.querySelectorAll('input[type=text]');
      if (ins.length >= 2 && val(ins[0]) && val(ins[1])) data.r.push([val(ins[0]), val(ins[1])]);
    });
  }
  if (def.list || def.tl) {
    data.list = [];
    body.querySelectorAll('.sec-rwrap[data-kind="list"] .secrow').forEach((row) => {
      if (row.dataset.del) return;
      const ins = row.querySelectorAll('input[type=text]');
      if (ins.length >= 2 && val(ins[0])) data.list.push([val(ins[0]), val(ins[1])]);
    });
  }
  if (def.tb) {
    data.tb = [['部位', '数值', '部位', '数值']];
    body.querySelectorAll('.sec-rwrap[data-kind="tb"] .secrow').forEach((row) => {
      const ins = row.querySelectorAll('input[type=text]');
      if (ins.length >= 4 && [0, 1, 2, 3].some((k) => val(ins[k]))) {
        data.tb.push([0, 1, 2, 3].map((k) => val(ins[k])));
      }
    });
    if (data.tb.length === 1) delete data.tb;
  }
  if (def.bars) {
    data.bars = [];
    body.querySelectorAll('.sec-rwrap[data-kind="bars"] .secrow').forEach((row) => {
      if (row.dataset.del) return;
      const ins = row.querySelectorAll('input[type=text]');
      const pct = parseInt(val(ins[1]), 10);
      if (val(ins[0]) && !isNaN(pct)) data.bars.push([val(ins[0]), Math.max(0, Math.min(100, pct))]);
    });
    if (!data.bars.length) delete data.bars;
  }
  if (def.chips) {
    const inp = body.querySelector('[data-tags-inp]');
    const tags = inp ? inp.value.split(/[,，、]/).map((s) => s.trim()).filter(Boolean) : [];
    if (tags.length) data.tags = tags;
  }
  return data;
}

/** 示例档案：段落写回内存示例并整体重渲染（不落库，刷新后还原） */
function pfSampleSaveSection(key, custom) {
  if (!PF.data.sections) PF.data.sections = {};
  PF.data.sections[key] = custom || {};
  toast('示例已更新（仅本页生效，刷新后还原）');
  pfRenderAll();
  pfApplyOrder(); pfRenderIndex();
  return true;
}

async function pfRefreshDetail() {
  if (PF.isSample) { pfRenderAll(); pfApplyOrder(); pfRenderIndex(); return; }
  if (!PF.pid) return;
  try {
    const res = await api('/api/profile/detail?id=' + PF.pid);
    PF.data = await res.json();
  } catch (_) { return; }
  pfRenderAll();
}

/* ===== v0.5.38 内置示例档案（纯前端示范，不占数据库） ===== */
const PF_SAMPLE = {
  base: {
    name: '陈默', firstName: '陈默', formerName: '陈小满', englishName: 'NIGHTJAR',
    gender: '男', marriage: '已婚',
    birthdayType: 'full', birthdayCalendar: 'solar', birthYear: 1991, birthMonth: 8, birthDay: 12,
    birthText: '1991-08-12', lunarText: '辛未年八月十二', age: 35, nextBirthday: null,
    birthdayRemind: false, isDeceased: false, referrer: null,
    tags: ['示例', 'INTJ', 'A 型 RH+', '178 cm / 72 kg', '上衣 L · 裤 32'], groups: ['示范档案'], note: '这是一份内置示例档案，可试编辑各模块（修改仅保存在本页，刷新后还原）。',
  },
  methods: {
    phones: [{ value: '138****0000', label: '个人' }],
    emails: [{ value: 'nightjar@example.com', label: '个人' }],
    qq: [], wechat: [{ value: 'nightjar_0812', label: '个人' }], addresses: [{ value: '浙江省丽水市缙云县 ×××', label: '家庭' }],
  },
  work: { company: '某科技有限公司', position: '信息安全负责人' },
  edus: [{ school: '××大学', major: '计算机科学与技术', degree: '学士', start: '2010', end: '2014', story: 'GPA 3.6 / 校级奖学金' }, { school: '××研究所', major: '信息安全', degree: '硕士', start: '2014', end: '2017', story: '方向：入侵检测与日志审计' }],
  relatives: [{ kin: '父亲', name: '陈某（退休教师）' }, { kin: '配偶', name: '李某（教师）' }],
  pets: [{ species: '中华田园犬', name: '豆豆', memorialDate: '' }],
  meta: { marriages: ['已婚'] },
  sections: {
    // v0.5.42：内容对齐 1.html 原稿（19 段全量：键值/两列/四列表/能力条/标签组）
    identity: { r: [['姓名 / 拼音', '陈默 / Chen Mo'], ['代号', 'NIGHTJAR'], ['生肖 / 星座', '辛未年 羊 / 狮子座'], ['血型', 'A 型 RH+'], ['国籍 / 民族', '中国 / 汉族'], ['籍贯 / 出生地', '浙江 缙云 / 浙江 丽水'], ['发色 / 瞳色 / 惯用手', '黑短发 / 深棕 / 右手'], ['外貌特征', '左耳后小痣；右手食指旧疤；无纹身'], ['声音特征', '中低音，语速偏慢'], ['证件号码', '3301**********1234'], ['指纹编码', 'FBI-9A3F-C21B'], ['虹膜编码', 'IRIS-77D0-4E9A'], ['生物样本编号', 'DNA-CN-2291-8840'], ['性格类型', 'INTJ / 九型 5w4'], ['行为评估', '内敛、系统化思维、长期主义，偏好书面沟通与流程化协作']] },
    body: {
      r: [['身高', '178 cm'], ['体重', '72.4 kg（季度波动 ±2 kg）'], ['BMI', '22.9（自动计算）'], ['体型', '偏瘦 / 肩宽 / 腰腹平坦'], ['测量日期', '2026-10-28 / 晨起空腹'], ['测量方式', '软尺贴身测量，单位 cm']],
      tb: [['部位', '数值', '部位', '数值'], ['胸围', '96（放松）/ 100（吸气）', '腰围', '82（脐上 1 cm）'], ['臀围', '98（最宽处）', '肩宽', '46（肩峰至肩峰）'], ['臂长 / 袖长', '62（肩峰至腕）', '上臂围', '34'], ['衣长（上衣）', '72（肩颈点至下摆）', '下摆围', '104'], ['腿长（内长）', '84（裆至脚踝）', '腿长（外长）', '108'], ['大腿围 / 小腿围', '58 / 38', '颈围', '38'], ['头围', '57', '手长 / 指距', '19 / 178'], ['脚长', '26.5', '身高体重指数', 'BMI 22.8']],
      list: [['上衣 / 衬衫', 'L（欧码 50）｜衬衫领围 40、袖长 62'], ['外套 / 卫衣', 'L｜偏好略宽松，落肩款'], ['裤装', '32 / 82A｜直筒，腰围 82、内长 84'], ['鞋履', 'EU 42 / US 8.5｜脚长 26.5，偏窄'], ['内衣 / 袜子', '内裤 L｜袜 26—28'], ['常购品牌', '优衣库、迪卡侬、亚瑟士（鞋）'], ['尺码备注', '上衣袖长偏短需选长款；裤装需改短 2 cm'], ['复测提醒', '每半年复测一次，体重变化超 3 kg 即时更新']],
    },
    methods: { r: [['备用手机', '139****0000（工作）'], ['备用邮箱', 'cm.work@example.com'], ['通讯地址', '浙江省丽水市缙云县 ××× 街道 ××× 号'], ['户籍地址', '浙江省丽水市缙云县 ×××'], ['紧急联系人', '李某（配偶）/ 139****0000'], ['备用联系人', '陈某（父）/ 137****0000'], ['PGP 指纹', '4F7A 9C21 88D0 7E3B'], ['个人站点', '110011.best']] },
    clearance: { r: [['行业', '制造业 / 信息技术'], ['部门', 'IT 与安全部'], ['职级', 'L4 / 主管'], ['任职时间', '2019-04-08（7 年 6 个月）'], ['汇报对象', 'CTO'], ['办公地点', '缙云总部 · 3F 机房区'], ['工作模式', '驻场为主 / 每周 1 天远程'], ['保密协议编号', 'NDA-2019-0412-SEC']], tags: ['服务器运维', '云资源管理', '容器编排', '数据防泄漏 DLP', '密钥与证书管理', '备份与容灾', '安全审计'] },
    vehicle: { cards: [{ name: '大众 速腾 1.4T 舒适型', rows: [['号牌', '浙K×××××'], ['车身颜色 / 燃油', '极地白 / 95 号'], ['购置日期', '2021-05-20'], ['行驶里程', '68,420 km'], ['保险有效期', '交强险+商业险 至 2027-05-19'], ['年检有效期', '至 2027-05'], ['保养记录', '每 10,000 km / 上次 2026-09-12'], ['固定车位', '小区 B2 车位 077']] }, { name: '捷安特 ATX 660', rows: [['类型', '山地车（通勤与周末骑行）'], ['购置', '2019-03']] }], r: [['通勤方式', '自驾 12 km；雨天电动车；出差高铁'], ['驾驶执照', 'C1 / 初领 2010-11-05 / 有效至 2026-11-04'], ['飞行记录', '近 12 个月 6 次 · 约 18,600 里程']] },
    interest: { list: [['中医古籍阅读', '每日 30—60 分钟｜《黄帝内经》《伤寒论》精读并做批注'], ['技术书籍', '每月 1—2 本｜安全架构、分布式系统'], ['写作与建站', '每周 2 篇｜科普专栏与自建站点维护'], ['书法（楷书）', '每周 3 次｜临《九成宫》'], ['摄影', '周末｜富士 X-T30，风光与街拍'], ['徒步登山', '每月 1 次｜仙都、括苍山 10—15 km'], ['骑行', '每周 1 次｜环壶镇 40 km'], ['烹饪', '每周 4 次｜江浙家常菜'], ['古典与影视配乐', '常听｜巴赫、久石让'], ['模型与硬件', '季度｜键盘改造、NAS 与服务器折腾']] },
    network: { r: [['主域名', '110011.best'], ['二级域名', 'cal / health / learn / books.110011.best'], ['站点', '中医古籍阅读站；LifeOS 个人数字生活系统'], ['代码仓库', 'private/lifeos · private/legacy-cms · public/tcm-notes'], ['基础设施', 'Cloudflare DNS+CDN / Let\'s Encrypt / 对象存储异地备份'], ['备份策略', '每日增量+每周全量，3-2-1 策略，离线冷备一份'], ['安全基线', '全站 2FA、密码管理器、SSH 仅密钥登录、失败封禁']], tb: [['资产', '规格', '用途', '系统'], ['HP Z1 G1i 工作站', 'Ultra 7 / 64G / RTX 2000 Ada 16G', '本地大模型与开发', 'Ubuntu 24.04'], ['VPS（华东）', '2C4G / 80G SSD', '站点与反向代理', 'Debian 12 / 续费 2027-03-11'], ['NAS 4 盘位', '32T RAID5', '备份与离线归档', 'OpenWrt + OMV']] },
    lifecycle: { r: [['睡眠', '23:30—07:00，平均 7.2 小时，深睡约 1.4 小时'], ['周末作息', '08:30 起床，补觉不超过 1.5 小时'], ['运动', '力量训练 3 次/周 + 有氧 1 次/周，日均 7,800 步'], ['屏幕使用', '工作日 8.5 h，娱乐 1.5 h，22:00 后护眼模式'], ['媒体消费', '播客《科技》《历史》各 1 档，通勤听有声书'], ['订阅服务', 'iCloud 200G、JetBrains、云主机、音乐与视频会员'], ['智能家居', '智能门锁、温湿度传感器、扫地机器人、NAS 自动备份'], ['月度预算', '固定 ¥6,800 / 弹性 ¥2,500，储蓄率约 42%'], ['习惯', '晨间 10 分钟复盘、周日做周计划、月度财务对账']] },
    food: { r: [['口味', '清淡偏咸鲜，少辣，喜醋'], ['忌口', '不吃动物内脏、香菜少量'], ['过敏食物', '海鲜（轻度皮疹）、芒果'], ['咖啡因', '上午美式 1 杯，14:00 后不饮'], ['酒精', '啤酒偶尔，白酒不耐'], ['常喝饮品', '绿茶、气泡水、无糖豆浆'], ['主食偏好', '米饭为主，面食每周 2 次'], ['烹饪擅长', '红烧、炖汤、江浙家常'], ['餐厅偏好', '本帮菜、面馆、咖啡馆'], ['购物偏好', '线上为主，重参数与评测，冲动消费低'], ['娱乐偏好', '悬疑与科幻影视、策略类游戏'], ['宠物偏好', '犬类，偏好中小型']], list: [['固定餐单', '早餐：豆浆+包子｜午餐：公司食堂｜晚餐：家常'], ['戒断目标', '减少夜宵与含糖饮料，2027 年前达成']] },
    health: { r: [['血型', 'A 型 RH+'], ['过敏史', '青霉素、海鲜（轻度皮疹）'], ['慢性病', '无'], ['长期用药', '维生素 D 每日 1 次；季节性鼻炎按需'], ['手术史', '2018 年阑尾切除术'], ['视力', '右 -3.25 / 左 -3.50，散光 0.75'], ['口腔', '洁牙每年 1 次，无龋齿'], ['体检结论', '2026-03 指标基本正常，颈椎曲度变直、干眼倾向'], ['疫苗接种', '乙肝、流感（年度）、新冠全程'], ['心理状态', '压力自评 6/10，通过运动与写作调节'], ['医嘱备注', '长期伏案，每小时起身活动；避免熬夜与高盐']] },
    home: { r: [['居住形态', '自有住房（婚房）'], ['建筑面积 / 户型', '118 m² / 三室两厅两卫'], ['楼层 / 朝向', '12 / 18 层 · 南北通透'], ['入住时间', '2022-08'], ['贷款', '商贷至 2050-07，月供 ¥4,300'], ['家财险', '至 2027-02'], ['家居概况', '书房 1 间（工作站+NAS 机柜）、阳台绿植 12 盆']], list: [['母亲 王某', '1968-11｜随子女居住，健康良好'], ['子女 陈屿', '2021-09｜幼儿园在读'], ['挚友 周某', '1992-01｜技术同行，季度聚会']] },
    finview: { r: [['收入结构', '薪资为主 + 少量项目与稿酬'], ['资产分布', '理财 60% / 现金 25% / 数字资产 15%'], ['负债', '房贷（月供 ¥4,300）'], ['保险', '重疾、医疗、意外、寿险（家庭支柱）'], ['月度支出', '固定 ¥6,800 / 弹性 ¥2,500'], ['储蓄目标', '储蓄率约 42%，年度目标 ¥120,000'], ['税务', '个税年度汇算已办理'], ['备注', '明细见 LifeOS 账本模块，本页仅存概览']] },
    docs: { r: [['居民身份证', '3301**********1234｜有效至 2030-08-11'], ['护照', 'E1234****｜有效至 2030-04-18'], ['驾驶证', 'C1｜有效至 2026-11-04（需换证）'], ['社保卡', '6222********0001｜正常参保'], ['公积金', '账号 8800****77｜月缴 ¥1,200'], ['学历证书', '本科 / 硕士毕业证与学位证｜原件在保险箱 B'], ['职业资格', 'CISP、CISSP（有效期内）'], ['银行卡', '招商 6214****8899｜工商 6222****3311'], ['存放位置', '书房保险箱 A（证件）/ 文件柜第 2 格（房产）'], ['复印限制', '复印件须注明用途，禁止二次流转']] },
    background: { r: [['政治面貌', '群众'], ['兵役状况', '未服兵役（免役）'], ['宗教信仰', '无'], ['方言', '缙云话（母语级）、吴语通行'], ['普通话', '标准，一级乙等水平'], ['英语', 'CET-6 550｜可阅读技术文献与会议沟通'], ['日语', 'N4 基础｜日常会话吃力'], ['编程语言', 'Python、Shell、Go（读）、SQL'], ['专业术语', '网络安全、云原生、中医古籍训诂'], ['教学能力', '内部培训讲师，年均 6 场']] },
    emergency: { r: [['医疗决策代理人', '李某（配偶）｜授权书 2025-06 签署'], ['紧急联系人 1', '李某（配偶）/ 139****0000'], ['紧急联系人 2', '陈某（父）/ 137****0000'], ['保险受益人', '法定（配偶与子女）'], ['遗嘱状态', '已立草稿，2027 年复核'], ['身后意愿', '器官捐献登记：否；安葬意愿：本地'], ['数字遗产', '密码管理器主密钥交由配偶保管（信封封存）'], ['重要提醒', '出差携带：身份证、少量现金、常用药、充电宝']] },
    devices: { tb: [['设备 / 平台', '配置或账号', '指纹或序列号', '状态'], ['HP Z1 G1i 工作站', 'Ultra 7 / 64G / RTX 2000 Ada', 'SN-77D0-4E9A', '在线'], ['ThinkPad X1 Carbon', 'i7 / 32G / 1T SSD', 'SN-1BC8-0F72', '在线'], ['MacBook Air 13', 'M3 / 16G / 512G', 'SN-9A3F-C21B', '在线'], ['iPhone 15', '256G', 'IMEI 3567…', '在线'], ['家用 NAS', '4 盘位 / 32T', 'SN-55AA-77C1', '离线'], ['GitHub', 'nightjar', 'sha256:9a3f…c21b', '2FA 已启用'], ['VPN 网关', 'cm01', 'sha256:1bc8…0f72', '证书 90 天轮换'], ['密码管理器', 'master-vault', 'sha256:2291…8840', '明文不入库']] },
    travel: { r: [['护照号码', 'E1234****'], ['护照有效期', '至 2030-04-18'], ['签证', '日本单次（已用）；新加坡电子签至 2027-01'], ['出行偏好', '高铁出行、山地与古镇、淡季错峰'], ['后续计划', '2027 春 敦煌或川西']], list: [['完成中医古籍站点 v1.0', '进度 70%｜截止 2027-03'], ['LifeOS 五模块上线', '进度 55%｜截止 2027-06'], ['体重降至 70 kg 并保持', '进度 40%｜截止 2027-02'], ['CISSP 续证与云安全进阶', '进度 80%｜截止 2026-12'], ['完成 24 篇科普专栏', '进度 50%｜截止 2027-12']] },
    timeline: { tl: [['1991-08', '出生于浙江丽水'], ['2014-06', '本科毕业，进入信息安全领域'], ['2017-06', '硕士毕业，入职首家公司'], ['2019-04', '入职现公司，负责终端与网络安全'], ['2021-09', '主导数据防泄漏（DLP）方案上线'], ['2022-08', '入住新居，家庭结构变化'], ['2023-06', '完成核心服务容器化迁移'], ['2025-11', '启动 LifeOS 个人数字生活系统'], ['2026-08', '中医古籍阅读站点原型完成'], ['2026-10', '本档案系统建档并归档']] },
    edu: { bars: [['网络安全与应急', 88], ['系统运维', 82], ['云与容器', 78], ['建站与前端', 70], ['技术写作', 76], ['项目管理', 68]] },
  },
};

/** 打开内置示例档案（纯前端渲染，不占数据库） */
function pfOpenSample() {
  PF.isSample = true;
  PF.pid = null;
  PF.view = 'profile';
  if (location.hash !== '#/relations/sample') location.hash = '#/relations/sample';
  pfEl('relListView').hidden = true;
  pfEl('relProfileView').hidden = false;
  PF.data = JSON.parse(JSON.stringify(PF_SAMPLE));
  document.body.classList.add('pf-sample');
  pfRenderAll();
  window.scrollTo({ top: 0 });
}

/* ===== v0.5.35 各段侧滑编辑器（保存写回原数据表） ===== */
function pfSeHead(key, pname) {
  pfEl('secEditTitle').textContent = '编辑 - ' + pfSecDef(key).t;
  pfEl('secEditSub').textContent = (pname || ((PF.data && PF.data.base && PF.data.base.name) || '')) + ' · 档案段落';
  pfEl('secEditHint').textContent = '一次只编辑一段，保存后仅本段刷新；留空的行自动忽略。' + (PF.isSample ? ' 示例修改仅保存在本页，刷新后还原。' : '');
}
function pfSeRow(html) { const d = document.createElement('div'); d.className = 'secrow'; d.innerHTML = html; return d; }
function pfSeInput(label, val, cls) { return '<input type="text" class="' + (cls || '') + '" placeholder="' + pfEsc(label) + '" value="' + pfEsc(val || '') + '">'; }

function pfEditIdentity() {
  const b = PF.data.base;
  const body = pfEl('secEditBody');
  body.innerHTML = '<p class="sec-hint">姓名/生日/标签/群组/引荐人等完整资料请用下方「完整资料」按钮维护。</p>';
  [['姓名', 'firstName'], ['昵称', 'nickname'], ['曾用名', 'formerName'], ['英文名', 'englishName'], ['别名', 'alias']].forEach(([label, f]) => {
    body.appendChild(pfSeRow('<input type="text" class="sk" data-f="' + f + '" placeholder="' + pfEsc(label) + '" value="' + pfEsc(b[f] || '') + '">'));
  });
  const g = pfSeRow('<select data-f="gender"><option value="">未知</option><option>男</option><option>女</option></select>');
  g.querySelector('select').value = ['男', '女'].includes(b.gender) ? b.gender : '';
  body.appendChild(g);
  let bdayDate = b.birthdayType === 'full' ? b.birthYear + '-' + String(b.birthMonth).padStart(2, '0') + '-' + String(b.birthDay).padStart(2, '0') : '';
  if (b.birthdayType === 'monthday') bdayDate = new Date().getFullYear() + '-' + String(b.birthMonth).padStart(2, '0') + '-' + String(b.birthDay).padStart(2, '0');
  const bd = pfSeRow('<span class="sk" style="align-self:center;font-size:12px;color:var(--muted)">生日</span>'
    + '<button type="button" class="btn ghost" data-se="bday" style="flex:1;text-align:left">' + pfEsc(b.birthdayType ? b.birthText : '点击选择生日') + '</button>'
    + '<label><input type="checkbox" data-se="lunar"' + (b.birthdayCalendar === 'lunar' ? ' checked' : '') + '>农历</label>');
  body.appendChild(bd);
  body.appendChild(pfSeRow('<input type="text" class="sk" data-f="marriage" placeholder="婚姻状况" value="' + pfEsc(b.marriage || '') + '">'));
  body.appendChild(pfSeRow('<input type="text" data-f="note" placeholder="备注" value="' + pfEsc(b.note || '') + '">'));
  const more = pfSeRow('<button type="button" class="btn ghost" data-se="full" style="flex:1">完整资料（生日提醒 / 标签 / 群组 / 引荐人 / 已逝）</button>');
  if (!PF.isSample) body.appendChild(more);
  // v0.5.43：身份标识补上附加键值行（生肖/血型/籍贯/证件号码等自定义资料），与示例页内容对齐
  const customWrap = pfSecBuildEditorBody(pfSecDef('identity'), (PF.data?.sections || {}).identity || {});
  body.appendChild(customWrap);
  const bdBtn = bd.querySelector('[data-se=bday]');
  const lunarChk = bd.querySelector('[data-se=lunar]');
  let bdayLunar = b.birthdayCalendar === 'lunar';
  const syncBday = () => { bdBtn.textContent = bdayDate || '点击选择生日'; };
  syncBday();
  bdBtn.addEventListener('click', () => {
    openSitePicker({ mode: 'date', date: bdayDate, allowClear: true, title: '选择生日',
      onDone: ({ date }) => { bdayDate = date || ''; syncBday(); } });
  });
  lunarChk.addEventListener('change', () => { bdayLunar = lunarChk.checked; });
  more.querySelector('[data-se=full]').addEventListener('click', () => { pfCloseSectionEditor(); pfLoadNames().then(() => pfOpenEditModal()); });
  pfSecEdit.save = async () => {
    const get = (f) => { const el = pfEl('secEditBody').querySelector('[data-f="' + f + '"]'); return el ? el.value.trim() : ''; };
    const payload = { id: PF.pid,
      firstName: get('firstName'), nickname: get('nickname'), formerName: get('formerName'),
      englishName: get('englishName'), alias: get('alias'),
      gender: pfEl('secEditBody').querySelector('[data-f=gender]').value || '未知',
      marriage: get('marriage'), note: get('note') };
    if (bdayDate) {
      const parts = bdayDate.split('-').map(Number);
      if (bdayLunar) {
        const lf = window.lunarFull ? lunarFull(new Date(parts[0], parts[1] - 1, parts[2])) : null;
        if (!lf) { toast('生日超出农历换算范围'); return false; }
        payload.birthdayType = 'full'; payload.birthdayCalendar = 'lunar';
        payload.birthYear = lf.year; payload.birthMonth = lf.month; payload.birthDay = lf.day;
      } else {
        payload.birthdayType = 'full'; payload.birthdayCalendar = 'solar';
        payload.birthYear = parts[0]; payload.birthMonth = parts[1]; payload.birthDay = parts[2];
      }
    } else {
      payload.birthdayType = ''; payload.birthdayCalendar = 'solar';
      payload.birthYear = null; payload.birthMonth = null; payload.birthDay = null;
    }
    const custom2 = pfCollectSectionData();
    if (PF.isSample) {
      const b = PF.data.base;
      b.firstName = payload.firstName; b.nickname = payload.nickname; b.formerName = payload.formerName;
      b.englishName = payload.englishName; b.alias = payload.alias;
      b.gender = payload.gender; b.marriage = payload.marriage; b.note = payload.note;
      if (bdayDate) {
        const p = bdayDate.split('-').map(Number);
        b.birthdayType = 'full'; b.birthdayCalendar = 'solar';
        b.birthYear = p[0]; b.birthMonth = p[1]; b.birthDay = p[2];
        b.birthText = bdayDate; b.lunarText = '';
        b.age = new Date().getFullYear() - p[0];
      } else {
        b.birthdayType = ''; b.birthdayCalendar = 'solar';
        b.birthYear = null; b.birthMonth = null; b.birthDay = null;
        b.birthText = ''; b.lunarText = ''; b.age = null;
      }
      b.name = payload.firstName || payload.nickname || payload.formerName || payload.englishName || payload.alias || b.name;
      return pfSampleSaveSection('identity', custom2);
    }
    const res = await api('/api/profile/detail', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) { const d2 = await res.json().catch(() => ({})); toast(d2.error || '保存失败'); return false; }
    const rSec = await api('/api/profile/sections', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact_id: PF.pid, key: 'identity', data: custom2 }) });
    if (!rSec.ok) { toast('附加资料保存失败'); return false; }
    if (!PF.data.sections) PF.data.sections = {};
    PF.data.sections.identity = custom2;
    toast('身份标识已保存'); markSynced();
    await pfRefreshDetail();
    return true;
  };
}

function pfEditBody() {
  const bd = PF.bodyData || { heights: [], weights: [], sizes: {} };
  let latestH = bd.heights.length ? bd.heights[0].value : '';
  let latestW = bd.weights.length ? bd.weights[bd.weights.length - 1].value : '';
  let sz = bd.sizes || {};
  // v0.5.43：示例档案从 sections.body 行反推当前值（身高/体重/尺码），编辑后可回显
  if (PF.isSample) {
    const srows = (((PF.data.sections || {}).body || {}).r) || [];
    const num = (name) => { const row = srows.find(([k]) => k === name); return row ? String(row[1]).replace(/[^\d.]/g, '') : ''; };
    const lrows = (((PF.data.sections || {}).body || {}).list) || [];
    const lv = (name) => { const row = lrows.find(([k]) => k === name); return row ? row[1] : ''; };
    latestH = num('身高');
    latestW = num('体重');
    sz = { clothing: lv('衣裤尺码'), shoe: lv('鞋子尺码'), ring: lv('戒指尺码'), bracelet: lv('手镯尺码') };
  }
  const body = pfEl('secEditBody');
  body.innerHTML = '<p class="sec-hint">身高/体重保存后按今天新增一条测量记录（同日覆盖），BMI 自动重算；尺码随档保存。</p>';
  body.appendChild(pfSeRow(pfSeInput('身高（cm）', latestH)));
  body.appendChild(pfSeRow(pfSeInput('体重（kg）', latestW)));
  body.appendChild(pfSeRow(pfSeInput('衣裤尺码', sz.clothing, 'sk')));
  body.appendChild(pfSeRow(pfSeInput('鞋子尺码', sz.shoe, 'sk')));
  body.appendChild(pfSeRow(pfSeInput('戒指尺码', sz.ring, 'sk')));
  body.appendChild(pfSeRow(pfSeInput('手镯尺码', sz.bracelet, 'sk')));
  // v0.5.43：补上附加键值行 / 四列表格 / 尺码清单编辑组
  const customWrap = pfSecBuildEditorBody(pfSecDef('body'), (PF.data?.sections || {}).body || {});
  body.appendChild(customWrap);
  pfSecEdit.save = async () => {
    const get = (i) => { const el = pfEl('secEditBody').querySelectorAll('.secrow input[type=text]')[i]; return el ? el.value.trim() : ''; };
    const hV = get(0), wV = get(1);
    const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    if (PF.isSample) {
      // 示例：把身高/体重/尺码映射进 sections.body 的行，整体写回内存
      const bdSave = pfCollectSectionData();
      bdSave.r = (bdSave.r || []).filter(([k]) => !['身高', '体重', 'BMI', '测量日期'].includes(k));
      const hn = parseFloat(hV), wn = parseFloat(wV);
      const head = [];
      if (hn > 0) head.push(['身高', hV + ' cm']);
      if (wn > 0) head.push(['体重', wV + ' kg']);
      if (hn > 0 && wn > 0) head.push(['BMI', (wn / Math.pow(hn / 100, 2)).toFixed(1) + '（自动计算）']);
      if (head.length) head.push(['测量日期', today + ' / 晨起空腹']);
      bdSave.r = head.concat(bdSave.r);
      bdSave.list = (bdSave.list || []).filter(([k]) => !['衣裤尺码', '鞋子尺码', '戒指尺码', '手镯尺码'].includes(k));
      [['衣裤尺码', get(2)], ['鞋子尺码', get(3)], ['戒指尺码', get(4)], ['手镯尺码', get(5)]].forEach(([k, v]) => { if (v) bdSave.list.push([k, v]); });
      return pfSampleSaveSection('body', bdSave);
    }
    if (hV && Number(hV) > 0 && String(latestH) !== hV) {
      const r1 = await api('/api/profile/body', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_id: PF.pid, kind: 'height', value: Number(hV), date: today }) });
      if (!r1.ok) { toast('身高保存失败'); return false; }
    }
    if (wV && Number(wV) > 0 && String(latestW) !== wV) {
      const r2 = await api('/api/profile/body', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_id: PF.pid, kind: 'weight', value: Number(wV), date: today }) });
      if (!r2.ok) { toast('体重保存失败'); return false; }
    }
    const sizes = { clothing: get(2), shoe: get(3), ring: get(4), bracelet: get(5) };
    const r3 = await api('/api/profile/body', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: PF.pid, sizes }) });
    if (!r3.ok) { toast('尺码保存失败'); return false; }
    // 附加键值行 / 表格 / 清单（contact_sections.body）
    const custom = pfCollectSectionData();
    const rSec = await api('/api/profile/sections', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact_id: PF.pid, key: 'body', data: custom }) });
    if (!rSec.ok) { toast('附加资料保存失败'); return false; }
    if (!PF.data.sections) PF.data.sections = {};
    PF.data.sections.body = custom;
    toast('体测与尺码已保存'); markSynced();
    await pfRefreshDetail();
    return true;
  };
}

function pfEditMethods() {
  const body = pfEl('secEditBody');
  body.innerHTML = '<p class="sec-hint">每行 = 类型 + 内容 + 备注；保存时按此表整体重建联系方式（电话会同步为主号码）。</p>';
  const KINDS = METHOD_META.map(([k, t]) => [k, t]);
  const kindSel = (sel) => '<select data-f="kind">' + KINDS.map(([k, t]) => '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + t + '</option>').join('') + '</select>';
  const rowsEl = document.createElement('div');
  const addRow = (kind, value, label) => rowsEl.appendChild(pfSeRow(kindSel(kind) + pfSeInput('内容', value) + pfSeInput('备注', label, 'sk')));
  METHOD_META.forEach(([kind]) => (PF.data.methods || {})[kind] && PF.data.methods[kind].forEach((x) => addRow(kind, x.value, x.label)));
  if (!rowsEl.children.length) addRow('phones', '', '');
  const addBtn = document.createElement('button');
  addBtn.className = 'sec-add';
  addBtn.type = 'button';
  addBtn.textContent = '＋ 添加一行';
  addBtn.onclick = () => addRow('phones', '', '');
  body.appendChild(rowsEl);
  body.appendChild(addBtn);
  // v0.5.43：补上附加键值行（PGP 指纹 / 个人站点 / 紧急联系人等）
  const customWrap = pfSecBuildEditorBody(pfSecDef('methods'), (PF.data?.sections || {}).methods || {});
  body.appendChild(customWrap);
  pfSecEdit.save = async () => {
    const want = [];
    rowsEl.querySelectorAll('.secrow').forEach((row) => {
      const kind = row.querySelector('select').value;
      const ins = row.querySelectorAll('input[type=text]');
      const value = ins[0] ? ins[0].value.trim() : '';
      const label = ins[1] ? ins[1].value.trim() : '';
      if (value) want.push({ kind, value, label });
    });
    const custom2 = pfCollectSectionData();
    if (PF.isSample) {
      const m = {};
      want.forEach((w) => { (m[w.kind] = m[w.kind] || []).push({ value: w.value, label: w.label }); });
      PF.data.methods = m;
      return pfSampleSaveSection('methods', custom2);
    }
    for (const kind of Object.keys(PF.data.methods || {})) {
      for (const x of PF.data.methods[kind]) {
        await api('/api/profile/contacts?id=' + x.id, { method: 'DELETE' });
      }
    }
    for (const w of want) {
      const r = await api('/api/profile/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_id: PF.pid, kind: w.kind, value: w.value, label: w.label }) });
      if (!r.ok) { toast('联系方式保存失败'); return false; }
    }
    const rc = await api('/api/profile/sections', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact_id: PF.pid, key: 'methods', data: custom2 }) });
    if (!rc.ok) { toast('附加资料保存失败'); return false; }
    if (!PF.data.sections) PF.data.sections = {};
    PF.data.sections.methods = custom2;
    toast('联络方式已保存'); markSynced();
    await pfRefreshDetail();
    return true;
  };
}

function pfEditClearance() {
  const w = PF.data.work || {};
  const body = pfEl('secEditBody');
  body.innerHTML = '<p class="sec-hint">公司/职位保存到职业信息表；下方键值行保存为本段附加资料（部门/职级/汇报对象等）。</p>';
  body.appendChild(pfSeRow(pfSeInput('公司/组织', w.company, 'sk')));
  body.appendChild(pfSeRow(pfSeInput('职位', w.position, 'sk')));
  const custom = pfSecBuildEditorBody(pfSecDef('clearance'), (PF.data?.sections || {}).clearance || {});
  body.appendChild(custom);
  pfSecEdit.save = async () => {
    const ins = body.querySelectorAll('.secrow input[type=text]');
    const company = ins[0] ? ins[0].value.trim() : '';
    const position = ins[1] ? ins[1].value.trim() : '';
    const custom2 = pfCollectSectionData();
    if (PF.isSample) {
      PF.data.work = { company, position };
      return pfSampleSaveSection('clearance', custom2);
    }
    const r1 = await api('/api/profile/work', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ person_id: PF.pid, company, position }) });
    if (!r1.ok) { toast('职业信息保存失败'); return false; }
    const r2 = await api('/api/profile/sections', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact_id: PF.pid, key: 'clearance', data: custom2 }) });
    if (!r2.ok) { toast('附加资料保存失败'); return false; }
    if (!PF.data.sections) PF.data.sections = {};
    PF.data.sections.clearance = custom2;
    toast('职务与授权已保存'); markSynced();
    await pfRefreshDetail();
    return true;
  };
}

function pfEditEdu() {
  const body = pfEl('secEditBody');
  body.innerHTML = '<p class="sec-hint">每行 = 学校 / 专业 / 学位 / 入学 / 毕业 / 重要经历；保存时按此表整体重建教育经历。</p>';
  const degrees = ['高中', '大专', '本科', '硕士', '博士'];
  const degreeSel = (sel) => '<select data-f="degree">' + degrees.map((o) => '<option' + (o === sel ? ' selected' : '') + '>' + o + '</option>').join('') + '</select>';
  const rowsEl = document.createElement('div');
  const addRow = (e) => rowsEl.appendChild(pfSeRow(
    pfSeInput('学校', e.school) + pfSeInput('专业', e.major) + degreeSel(e.degree) + pfSeInput('入学', e.start, 'sk') + pfSeInput('毕业', e.end, 'sk') + pfSeInput('经历', e.story)));
  (PF.data.edus || []).forEach(addRow);
  if (!(PF.data.edus || []).length) addRow({ school: '', major: '', degree: '本科', start: '', end: '', story: '' });
  const addBtn = document.createElement('button');
  addBtn.className = 'sec-add';
  addBtn.type = 'button';
  addBtn.textContent = '＋ 添加一行';
  addBtn.onclick = () => addRow({ school: '', major: '', degree: '本科', start: '', end: '', story: '' });
  body.appendChild(rowsEl);
  body.appendChild(addBtn);
  const customWrap = pfSecBuildEditorBody(pfSecDef('edu'), (PF.data?.sections || {}).edu || {});
  body.appendChild(customWrap);
  pfSecEdit.save = async () => {
    if (PF.isSample) {
      const edus = [];
      rowsEl.querySelectorAll('.secrow').forEach((row) => {
        const ins = row.querySelectorAll('input[type=text], select');
        const school = ins[0] ? ins[0].value.trim() : '';
        if (!school) return;
        edus.push({ school, major: ins[1] ? ins[1].value.trim() : '', degree: ins[2] ? ins[2].value.trim() : '本科', start: ins[3] ? ins[3].value.trim() : '', end: ins[4] ? ins[4].value.trim() : '', story: ins[5] ? ins[5].value.trim() : '' });
      });
      PF.data.edus = edus;
      return pfSampleSaveSection('edu', pfCollectSectionData());
    }
    for (const e of (PF.data.edus || [])) {
      await api('/api/profile/edu?id=' + e.id, { method: 'DELETE' });
    }
    const rows = [...rowsEl.querySelectorAll('.secrow')];
    for (const row of rows) {
      const ins = row.querySelectorAll('input[type=text], select');
      const school = ins[0] ? ins[0].value.trim() : '';
      if (!school) continue;
      const r = await api('/api/profile/edu', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_id: PF.pid, school, major: ins[1] ? ins[1].value.trim() : '', degree: ins[2] ? ins[2].value.trim() : '', start: ins[3] ? ins[3].value.trim() : '', end: ins[4] ? ins[4].value.trim() : '', story: ins[5] ? ins[5].value.trim() : '' }) });
      if (!r.ok) { toast('教育经历保存失败'); return false; }
    }
    const custom2 = pfCollectSectionData();
    const r2 = await api('/api/profile/sections', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact_id: PF.pid, key: 'edu', data: custom2 }) });
    if (!r2.ok) { toast('附加资料保存失败'); return false; }
    if (!PF.data.sections) PF.data.sections = {};
    PF.data.sections.edu = custom2;
    toast('教育与能力已保存'); markSynced();
    await pfRefreshDetail();
    return true;
  };
}

function pfEditHome() {
  const d = PF.data;
  const body = pfEl('secEditBody');
  body.innerHTML = '<p class="sec-hint">家庭成员：称谓 + 姓名（姓名命中联系人会自动建立跳转）；宠物：种类 + 名字 + 纪念日。保存时按此表整体重建。</p>';
  body.insertAdjacentHTML('beforeend', '<div class="sec-grp">家庭成员</div>');
  const relEl = document.createElement('div');
  const addRel = (kin, name) => relEl.appendChild(pfSecRow([pfSeInput('称谓', kin, 'sk'), pfSeInput('姓名', name)], '', true));
  (d.relatives || []).forEach((r) => addRel(r.kin, r.name));
  if (!(d.relatives || []).length) addRel('', '');
  body.appendChild(relEl);
  const relAddBtn = document.createElement('button');
  relAddBtn.className = 'sec-add';
  relAddBtn.type = 'button';
  relAddBtn.textContent = '＋ 添加家庭成员';
  relAddBtn.onclick = () => addRel('', '');
  body.appendChild(relAddBtn);
  body.insertAdjacentHTML('beforeend', '<div class="sec-grp">宠物</div>');
  const petEl = document.createElement('div');
  const addPet = (p) => petEl.appendChild(pfSecRow([pfSeInput('种类', p.species, 'sk'), pfSeInput('名字', p.name), pfSeInput('纪念日', p.memorialDate)], '', true));
  (d.pets || []).forEach(addPet);
  if (!(d.pets || []).length) addPet({ species: '', name: '', memorialDate: '' });
  body.appendChild(petEl);
  const petAddBtn = document.createElement('button');
  petAddBtn.className = 'sec-add';
  petAddBtn.type = 'button';
  petAddBtn.textContent = '＋ 添加宠物';
  petAddBtn.onclick = () => addPet({ species: '', name: '', memorialDate: '' });
  body.appendChild(petAddBtn);
  const customWrap = pfSecBuildEditorBody(pfSecDef('home'), pfSecCleanCustom('home', ((PF.data?.sections) || {}).home || {}));
  body.appendChild(customWrap);
  pfSecEdit.save = async () => {
    if (PF.isSample) {
      const rels = [], petsS = [];
      [...relEl.querySelectorAll('.secrow')].forEach((row) => {
        const ins = row.querySelectorAll('input[type=text]');
        const kin = ins[0] ? ins[0].value.trim() : '';
        const name = ins[1] ? ins[1].value.trim() : '';
        if (kin && name) rels.push({ kin, name });
      });
      [...petEl.querySelectorAll('.secrow')].forEach((row) => {
        const ins = row.querySelectorAll('input[type=text]');
        const species = ins[0] ? ins[0].value.trim() : '';
        const name = ins[1] ? ins[1].value.trim() : '';
        if (species && name) petsS.push({ species, name, memorialDate: ins[2] ? ins[2].value.trim() : '' });
      });
      PF.data.relatives = rels;
      PF.data.pets = petsS;
      return pfSampleSaveSection('home', pfCollectSectionData());
    }
    for (const r of (d.relatives || [])) await api('/api/profile/relatives?id=' + r.id, { method: 'DELETE' });
    for (const p of (d.pets || [])) await api('/api/profile/pets?id=' + p.id, { method: 'DELETE' });
    const relRows = [...relEl.querySelectorAll('.secrow')];
    for (const row of relRows) {
      const ins = row.querySelectorAll('input[type=text]');
      const kin = ins[0] ? ins[0].value.trim() : '';
      const name = ins[1] ? ins[1].value.trim() : '';
      if (!kin || !name) continue;
      const hit = (PF.allNames || []).find((x) => x.name === name && x.id !== PF.pid);
      const r = await api('/api/profile/relatives', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_id: PF.pid, kin, name, ref_id: hit ? hit.id : null }) });
      if (!r.ok) { toast('家庭成员保存失败'); return false; }
    }
    const petRows = [...petEl.querySelectorAll('.secrow')];
    for (const row of petRows) {
      const ins = row.querySelectorAll('input[type=text]');
      const species = ins[0] ? ins[0].value.trim() : '';
      const name = ins[1] ? ins[1].value.trim() : '';
      const memorial = ins[2] ? ins[2].value.trim() : '';
      if (!species || !name) continue;
      const r = await api('/api/profile/pets', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_id: PF.pid, species, name, memorial_date: memorial || null }) });
      if (!r.ok) { toast('宠物保存失败'); return false; }
    }
    const custom2 = pfCollectSectionData();
    const r2 = await api('/api/profile/sections', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact_id: PF.pid, key: 'home', data: custom2 }) });
    if (!r2.ok) { toast('附加资料保存失败'); return false; }
    if (!PF.data.sections) PF.data.sections = {};
    PF.data.sections.home = custom2;
    toast('居住与家庭已保存'); markSynced();
    await pfRefreshDetail();
    return true;
  };
}

function pfCloseSectionEditor() { closeModal(pfEl('secEditor')); pfSecEdit = null; }
/** 车辆卡片编辑块：名称 + 附件照片下拉 + 键值属性行 */
function pfSecCardBlock(c) {
  const files = (PF.filesData || []).filter((f) => String(f.mime || '').startsWith('image/'));
  const div = document.createElement('div');
  div.className = 'sec-card';
  const opts = ['<option value="">不使用照片</option>'].concat(files.map((f) =>
    `<option value="${f.id}"${Number(c.fid) === f.id ? ' selected' : ''}>${pfEsc(f.name)}</option>`)).join('');
  div.innerHTML = '<input type="text" class="inp cname" placeholder="车辆名称（如 大众 速腾 1.4T）" value="' + pfEsc(c.name || '') + '">'
    + '<select class="fidsel">' + opts + '</select>'
    + '<div class="sec-crows"></div>';
  const rowsWrap = div.querySelector('.sec-crows');
  const addRow = (r) => rowsWrap.insertAdjacentHTML('beforeend',
    '<div class="secrow"><input type="text" class="sk" placeholder="名称" value="' + pfEsc(r[0] || '') + '">'
    + '<input type="text" placeholder="内容" value="' + pfEsc(r[1] || '') + '"></div>');
  (c.rows && c.rows.length ? c.rows : [['', '']]).forEach(addRow);
  const ops = document.createElement('div');
  ops.className = 'sec-cardops';
  const addProp = document.createElement('button');
  addProp.type = 'button';
  addProp.className = 'sec-add';
  addProp.textContent = '＋ 添加属性';
  addProp.onclick = () => addRow(['', '']);
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'sec-del';
  del.textContent = '删除本辆车';
  del.onclick = () => div.remove();
  ops.appendChild(addProp);
  ops.appendChild(del);
  div.appendChild(ops);
  return div;
}
async function pfEnsureFiles() {
  if (PF.filesData) return;
  try {
    const res = await api('/api/profile/files?id=' + PF.pid);
    if (res.ok) PF.filesData = (await res.json()).files || [];
  } catch (_) { PF.filesData = []; }
}
async function pfSaveSection() {
  if (!pfSecEdit) return;
  const btn = pfEl('secEditSave');
  if (btn) btn.disabled = true;
  try {
    if (pfSecEdit.save) {
      const okSave = await pfSecEdit.save();
      if (okSave !== false) pfCloseSectionEditor();
      return;
    }
    const key = pfSecEdit.key;
    const data = pfCollectSectionData();
    if (PF.isSample) {
      pfCloseSectionEditor();
      pfSampleSaveSection(key, data);
      return;
    }
    const res = await api('/api/profile/sections', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact_id: pfSecEdit.pid, key, data }) });
    if (!res.ok) { const d = await res.json().catch(() => ({})); toast(d.error || '保存失败'); return; }
    if (!PF.data.sections) PF.data.sections = {};
    PF.data.sections[key] = data;
    pfCloseSectionEditor();
    toast('本段已保存');
    markSynced();
    pfRenderJsonSection(key);
    pfApplyOrder(); pfRenderIndex();
  } finally {
    if (btn) btn.disabled = false;
  }
}

/** v0.5.33 随手记 AI：把识别到的资料行合并进某联系人的某段（确认后保存） */
window.pfOpenSectionAppend = function (pid, skey, rows, pname) {
  const clean = (rows || []).filter((r) => Array.isArray(r) && String(r[0] || '').trim() && String(r[1] || '').trim())
    .map((r) => [String(r[0]).slice(0, 20), String(r[1]).slice(0, 60)]);
  if (!clean.length) return false;
  let applied = false;
  const apply = () => {   // 幂等：散列触发多次也只开一次
    if (applied) return;
    applied = true;
    pfOpenSectionEditor(skey, { pid, appendRows: clean, pname });
  };
  if (PF.view === 'profile' && PF.pid === pid) apply();
  else Promise.resolve(pfOpenProfile(pid)).then(() => setTimeout(apply, 300));
  return true;
};

async function pfLoadDossierOrder() {
  try {
    const res = await api('/api/settings');
    const csv = res.ok ? ((await res.json()).settings.dossier_order || '') : '';
    PF.dossierOrder = csv.split(',').map((x) => x.trim()).filter((x) => PF_SECTIONS.some((m) => m.key === x));
  } catch (_) { /* 拉不到就用默认顺序 */ }
}

/** 按「人际关系相关设置」的顺序排列模块，并把序号缀到标题右侧（名称 - 01） */
function pfApplyOrder() {
  const main = pfEl('pfMain');
  if (!main) return;
  const order = PF.dossierOrder.slice();
  PF_SECTIONS.forEach((m) => { if (!order.includes(m.key)) order.push(m.key); });   // 未配置/新增模块兜底追加
  let seq = 0;
  order.forEach((k) => {
    const el = main.querySelector(`.panel[data-mod="${k}"]`);
    if (!el) return;
    main.appendChild(el);
    const h = el.querySelector('.panel-head h2');
    if (el.hidden) {   // 查看模式下无资料的模块：只排序，不编号不进目录
      delete el.dataset.seq;
      if (h && h.dataset.base) h.textContent = h.dataset.base;
      return;
    }
    seq += 1;
    el.dataset.seq = String(seq).padStart(2, '0');
    if (h && h.dataset.base) h.textContent = h.dataset.base + ' - ' + el.dataset.seq;
  });
}

/** 档案目录：只列当前可见（查看模式下有资料）的模块；移动端吸顶横滑 */
function pfRenderIndex() {
  const idx = pfEl('pfIdx');
  const main = pfEl('pfMain');
  if (!idx || !main) return;
  const panels = [...main.querySelectorAll('.panel[data-mod]')].filter((p) => !p.hidden);
  const toggle = pfEl('pfIdxToggle');
  if (toggle) toggle.classList.toggle('on', !PF.idxHidden && !!panels.length);
  if (PF.idxHidden || !panels.length) {
    idx.hidden = true;
    document.body.classList.toggle('pf-idx-off', !!PF.idxHidden);   // 隐藏时栅格收起为单列
    return;
  }
  document.body.classList.remove('pf-idx-off');
  idx.hidden = false;
  idx.innerHTML = '<div class="panel-head"><h3>档案目录</h3><span class="sp"></span>'
    + '<button class="idx-hide" id="pfIdxHide" title="隐藏目录" aria-label="隐藏目录">»</button></div>'
    + '<button class="idx-arrow l" aria-label="向左拖动">‹</button><button class="idx-arrow r" aria-label="向右拖动">›</button>'
    + panels.map((p) => `<a data-pfidx="${p.id}">${pfEsc(pfSecDef(p.dataset.mod).t)}<span>${p.dataset.seq || ''}</span></a>`).join('');
  idx.querySelectorAll('a[data-pfidx]').forEach((a) => {
    a.addEventListener('click', () => {
      const el = pfEl(a.dataset.pfidx);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
  const prev = idx.querySelector('.idx-arrow.l');
  const next = idx.querySelector('.idx-arrow.r');
  if (prev) prev.onclick = () => idx.scrollBy({ left: -160, behavior: 'smooth' });
  if (next) next.onclick = () => idx.scrollBy({ left: 160, behavior: 'smooth' });
  const hideBtn = idx.querySelector('#pfIdxHide');
  if (hideBtn) hideBtn.onclick = () => {
    PF.idxHidden = true;
    try { localStorage.setItem('pf_idx_hidden', '1'); } catch (_) {}
    pfRenderIndex();
    toast('目录已隐藏，点页头「目录」可恢复');
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
  if (PF.isSample) {
    const bd = (PF.data.sections || {}).body || {};
    // v0.5.42：示例体测补齐 1.html 的部位表格与尺码清单
    box.innerHTML = pfSecVrows({ r: 1 }, bd.r || []) + pfSecTb(bd.tb) + pfSecList({ list: 1 }, bd.list);
    if (pfEl('pfPanel_body')) pfEl('pfPanel_body').hidden = false;
    pfApplyOrder(); pfRenderIndex();
    return;
  }
  if (!box || !PF.pid) return;
  let data = { records: [], sizes: {} };
  try {
    const res = await api('/api/profile/body?id=' + PF.pid);
    if (res.ok) data = await res.json();
  } catch (_) { /* 401 已处理 */ }
  const heights = (data.records || []).filter((r) => r.kind === 'height').reverse(); // 新记录在前
  const weights = (data.records || []).filter((r) => r.kind === 'weight');
  const sz = data.sizes || {};
  PF.bodyData = { heights, weights, sizes: sz };
  let bmi = '';
  if (heights.length && weights.length) {
    const hCm = Number(heights[0].value);
    const wKg = Number(weights[weights.length - 1].value);
    if (hCm > 0 && wKg > 0) bmi = (wKg / Math.pow(hCm / 100, 2)).toFixed(1);
  }
  const rows = [];
  if (heights.length) rows.push(['身高', heights[0].value + ' cm']);
  if (weights.length) rows.push(['体重', weights[weights.length - 1].value + ' kg']);
  if (bmi) rows.push(['BMI', bmi + '（自动计算）']);
  const lastDate = heights.length ? heights[0].date : (weights.length ? weights[0].date : '');
  if (lastDate) rows.push(['最近测量', lastDate]);
  [['衣裤尺码', sz.clothing], ['鞋子尺码', sz.shoe], ['戒指尺码', sz.ring], ['手镯尺码', sz.bracelet]].forEach(([k, v]) => { if (v) rows.push([k, v]); });
  let h = pfSecVrows({ r: 1 }, rows);
  const hist = heights.map((r) => ['身高 ' + r.value + ' cm', r.date]).concat(weights.map((r) => ['体重 ' + r.value + ' kg', r.date]));
  if (hist.length > 1) h += '<div class="subhead">测量历史</div>' + pfSecList({ list: 1 }, hist);
  h += pfSecCustomHtml('body');
  box.innerHTML = h;
  const hasAny = heights.length || weights.length || Object.values(sz).some(Boolean);
  const sectionsSnap = (PF.data || {}).sections || {};
  if (pfEl('pfPanel_body')) pfEl('pfPanel_body').hidden = !PF.editMode && !hasAny && !pfSecHasData(pfSecDef('body'), sectionsSnap.body);
  pfApplyOrder(); pfRenderIndex();
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
  if (PF.isSample) {
    box.innerHTML = '<div class="empty-hint">示例：附件（照片 / 视频 / 文档）存放在你自己的对象存储 rjgx/姓名+手机号/ 目录，可在真实联系人档案中上传。</div>';
    if (pfEl('pfPanel_files')) pfEl('pfPanel_files').hidden = false;
    if (hint) hint.textContent = '';
    return;
  }
  if (!box || !PF.pid) return;
  let data = { files: [] };
  try {
    const res = await api('/api/profile/files?id=' + PF.pid);
    if (res.ok) data = await res.json();
  } catch (_) { /* 401 已处理 */ }
  if (hint) hint.textContent = data.folder ? `rjgx/${data.folder}/` : '';
  PF.filesData = data.files || [];
  // 查看模式：上传入口隐藏，文件只读预览/下载
  const uploadBtn = pfEl('pfFileBtn');
  if (uploadBtn) uploadBtn.style.display = PF.editMode ? '' : 'none';
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
        ${PF.editMode ? `<button class="icon-btn" data-act="fdel" data-id="${f.id}" data-name="${pfEsc(f.name)}" title="删除"><svg><use href="#i-x"/></svg></button>` : ''}
      </div>
    </div>`;
  }).join('') : (PF.editMode ? '<div class="empty-hint">暂无附件。照片、视频、文档都可上传，存在你自己的对象存储里。</div>' : '<div class="empty-hint">暂无附件</div>');
  if (pfEl('pfPanel_files')) pfEl('pfPanel_files').hidden = !PF.editMode && !fs.length;   // v0.5.32：无附件隐藏（自管显隐）
  pfSyncEditMode(); // 异步渲染完成后重新同步面板可见性
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
  const photo = (PF.filesData || []).find((f) => String(f.mime || '').startsWith('image/'));
  const avInner = photo
    ? '<img src="/api/profile/files?id=' + PF.pid + '&fid=' + photo.id + '" alt="' + pfEsc(b.name || '') + '">'
    : pfEsc((b.name || '?')[0]);
  pfEl('pfHero').innerHTML = `
    <div class="pf-hero">
      <span class="pf-hero-av">${avInner}</span>
      <div style="min-width:0">
        <h2>${pfEsc(b.name)}${b.alias && b.alias !== b.name ? ` <small>${pfEsc(b.alias)}</small>` : ''}</h2>
        <div class="pf-hero-tags">${bits.join('')}</div>
      </div>
    </div>
    ${bd.length ? `<div class="note info" style="margin-top:10px">${bd.map(pfEsc).join(' · ')}</div>` : ''}`;
}

/** 结构化模块的「附加资料」（contact_sections 自定义行/清单/能力条），home 支持姓名链接 */
function pfSecCustomHtml(key) {
  const def = pfSecDef(key);
  const d = (PF.data && PF.data.sections) || {};
  const h = (def.r ? pfSecVrows(def, (d[key] || {}).r) : '') + (def.list ? pfSecList(def, (d[key] || {}).list) : '') + (def.bars ? pfSecBars((d[key] || {}).bars) : '') + (def.chips ? pfSecChips((d[key] || {}).tags) : '');
  return h ? '<div class="pf-sec-append">' + h + '</div>' : '';
}
function pfRenderIdentity() {
  const b = PF.data.base;
  const rows = [
    ['姓名', b.firstName], ['昵称', b.nickname], ['曾用名', b.formerName], ['英文名', b.englishName], ['别名', b.alias],
    ['性别', b.gender], ['出生日期', b.birthdayType ? (b.birthText + (b.lunarText ? '（' + b.lunarText + '）' : '')) : ''],
    ['婚姻状况', b.marriage], ['引荐人', b.referrer ? b.referrer.name : ''], ['备注', b.note],
  ];
  pfEl('pfBasic').innerHTML = pfSecVrows({ r: 1 }, rows) + pfSecCustomHtml('identity');
}

// v0.5.41：自定义段落历史脏数据自愈——旧版收集未圈定容器，居住与家庭的保存曾把家庭成员/宠物行
// 误收进 sections.home.r、交通工具保存把车辆属性行误收进 sections.vehicle.r；渲染/编辑前过滤掉这些重复行
function pfSecCleanCustom(key, data) {
  const src = data || {};
  const rowsOf = (x) => (Array.isArray(x) ? x : []);
  if (key === 'home') {
    const isDup = (k, v) => {
      const kk = String(k || '').trim(), vv = String(v || '').trim();
      if (!kk || !vv) return false;
      if (rowsOf(PF.data && PF.data.relatives).some((r) => r.kin === kk && r.name === vv)) return true;
      if (rowsOf(PF.data && PF.data.pets).some((p) => p.species === kk && p.name === vv)) return true;
      return false;
    };
    return {
      r: rowsOf(src.r).filter((row) => !isDup(row[0], row[1])),
      list: rowsOf(src.list).filter((row) => !isDup(row[0], row[1])),
    };
  }
  if (key === 'vehicle') {
    const pairs = new Set();
    rowsOf(src.cards).forEach((c) => rowsOf(c && c.rows).forEach((r) => {
      if (String(r[0] || '').trim() && String(r[1] || '').trim()) pairs.add(String(r[0]).trim() + '\u0001' + String(r[1]).trim());
    }));
    return {
      cards: rowsOf(src.cards),
      r: rowsOf(src.r).filter((row) => !pairs.has(String(row[0] || '').trim() + '\u0001' + String(row[1] || '').trim())),
    };
  }
  return src;
}

function pfRenderHome() {
  pfRenderRelatives();
  pfRenderPets();
  const def = pfSecDef('home');
  const hc = pfSecCleanCustom('home', ((PF.data && PF.data.sections) || {}).home || {});
  const h = pfSecVrows(def, hc.r) + pfSecList(def, hc.list);
  if (h) pfEl('pfPets').insertAdjacentHTML('beforeend', '<div class="pf-sec-append">' + h + '</div>');
}

// ===== 联系方式 =====
const METHOD_META = [
  ['phones', '电话号码', '如：13800000000', ['个人', '工作', '家庭'], '📞'],
  ['emails', '电子邮件', '如：name@example.com', ['个人', '工作'], '✉️'],
  ['qq', 'QQ 号', '如：123456789', ['个人', '工作'], '🐧'],
  ['wechat', '微信号', '如：wxid_xxx 或手机号', ['个人', '工作'], '💬'],
  ['addresses', '联系地址', '如：江苏省南京市××路×号', ['家庭', '公司'], '🏠'],
];
const METHOD_ICON = Object.fromEntries(METHOD_META.map(([k, , , , ico]) => [k, ico]));
function pfRenderMethods() {
  const m = PF.data.methods || {};
  const rows = [];
  METHOD_META.forEach(([kind, title]) => {
    (m[kind] || []).forEach((x) => rows.push([title + (x.label ? ' · ' + x.label : ''), x.value]));
  });
  pfEl('pfMethods').innerHTML = pfSecVrows({ r: 1 }, rows) + pfSecCustomHtml('methods');
}

// ===== 家庭关系 =====
// v0.5.40：家庭成员改为键值行样式（左称谓右姓名，靠左对齐）
function pfRenderRelatives() {
  const d = PF.data;
  let h = '';
  (d.relatives || []).forEach((r) => {
    const vHtml = r.refId ? '<a class="person" data-pf-link="' + r.refId + '">' + pfEsc(r.name) + '</a>' : pfEsc(r.name);
    h += '<div class="sec-vrow"><span class="k">' + pfEsc(r.kin || '亲属') + '</span><span class="v">' + vHtml + '</span></div>';
  });
  pfEl('pfRelatives').innerHTML = h;
}

// ===== 公司/组织与职位 =====
function pfRenderWork() {
  const w = PF.data.work || {};
  pfEl('pfWork').innerHTML = pfSecVrows({ r: 1 }, [['公司/组织', w.company], ['职位', w.position]]) + pfSecCustomHtml('clearance');
}

// ===== 教育与成长 =====
function pfRenderEdu() {
  const list = PF.data.edus || [];
  const rows = list.map((e) => [
    e.school + (e.degree ? ' · ' + e.degree : ''),
    [e.major ? '专业 ' + e.major : '', (e.start || e.end) ? (e.start || '?') + ' ~ ' + (e.end || '现在') : '', e.story].filter(Boolean).join('｜'),
  ]);
  pfEl('pfEdu').innerHTML = pfSecList({ list: 1 }, rows) + pfSecCustomHtml('edu');
}

// ===== 宠物 =====
// v0.5.40：宠物同样改为键值行样式
function pfRenderPets() {
  const list = PF.data.pets || [];
  let h = '';
  list.forEach((p) => {
    const v = pfEsc(p.name) + (p.memorialDate ? '（纪念日 ' + pfEsc(p.memorialDate) + '）' : '');
    h += '<div class="sec-vrow"><span class="k">' + pfEsc(p.species || '宠物') + '</span><span class="v">' + v + '</span></div>';
  });
  pfEl('pfPets').innerHTML = h;
}

// ===== 财务往来（v0.5.0：账本流水按联系人自动关联） =====
async function pfRenderFinance() {
  const el = pfEl('pfFinance');
  if (!el) return;
  if (PF.isSample) {
    el.innerHTML = '<ul class="dlist">' +
      [['团队聚餐', '10/30 · 餐饮 · 微信', '-¥268.00'], ['代收设备款', '09-12 · 其他 · 支付宝', '+¥1,200.00'], ['生日礼物', '06-18 · 人情 · 微信', '-¥520.00']].map((f) =>
        '<li><b>' + pfEsc(f[0]) + '</b><span class="n">' + pfEsc(f[1]) + '</span></li>').join('') + '</ul>' +
      '<p class="ts-hint">示例内容：真实使用时，在「记一笔」时选择该联系人，账目会自动关联到这里。</p>';
    if (pfEl('pfFinSum')) pfEl('pfFinSum').textContent = '';
    return;
  }
  el.innerHTML = '<div class="empty-hint">加载中…</div>';
  pfEl('pfFinSum').textContent = '';
  try {
    const res = await api('/api/transactions?contact_id=' + PF.pid);
    const data = await res.json();
    PF.finData = data;   // v0.5.32：供空模块隐藏判断
    const list = data.list || [];
    if (pfEl('pfPanel_finance')) pfEl('pfPanel_finance').hidden = !PF.editMode && !list.length;   // v0.5.33：无往来隐藏（自管显隐，须在空列表提前返回前）
    pfApplyOrder(); pfRenderIndex();
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

function pfCloseEditModal() { pfEl('contactEditModal').hidden = true; if (window.aiQueueCancel && !window.__aiSavedJustNow) window.aiQueueCancel(); }   // v0.5.27：非保存关闭取消 AI 队列

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
    window.__aiSavedJustNow = true;   // 保存关闭：不清 AI 队列
    pfCloseEditModal();
    toast(PF.editingId ? '已保存' : '已添加联系人');
    markSynced();
    if (window.invalidateContacts) window.invalidateContacts(); // 「记一笔→联系人」名单同步失效
    if (PF.editingId) await pfOpenProfile(PF.editingId);
    else { PF.view = 'list'; await pfLoadList(); }
    window.__aiSavedJustNow = false;
    if (!PF.editingId && window.aiSaveHookRun) window.aiSaveHookRun();   // v0.5.27：AI 队列继续
    if (!PF.editingId && window.aiSaveHookRun) window.aiSaveHookRun();   // v0.5.27：AI 队列继续
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
  pfBuildPanels();   // v0.5.33：先生成面板壳，绑定才找得到容器
  try { PF.idxHidden = localStorage.getItem('pf_idx_hidden') === '1'; } catch (_) { PF.idxHidden = false; }
  const idxToggle = pfEl('pfIdxToggle');
  if (idxToggle) idxToggle.addEventListener('click', () => {
    PF.idxHidden = !PF.idxHidden;
    try { localStorage.setItem('pf_idx_hidden', PF.idxHidden ? '1' : '0'); } catch (_) {}
    pfRenderIndex();
  });
  // 段落编辑器（v0.5.33）
  const secOverlay = pfEl('secEditor');
  if (secOverlay) {
    pfEl('secEditClose').addEventListener('click', pfCloseSectionEditor);
    pfEl('secEditCancel').addEventListener('click', pfCloseSectionEditor);
    pfEl('secEditSave').addEventListener('click', pfSaveSection);
    secOverlay.addEventListener('click', (e) => { if (e.target === secOverlay) pfCloseSectionEditor(); });
    secOverlay.addEventListener('click', (e) => {
      const del = e.target.closest('.sec-row-del');
      if (del) { const row = del.closest('.secrow'); if (row) row.remove(); }
    });
  }
  document.addEventListener('click', (e) => {
    const ed = e.target.closest('[data-sec-edit]');
    if (ed && window.PF && (PF.pid || PF.isSample)) { pfOpenSectionEditor(ed.dataset.secEdit); return; }
    const pl = e.target.closest('a.person[data-pf-link]');
    if (pl) { e.preventDefault(); pfOpenProfile(Number(pl.dataset.pfLink)); window.scrollTo({ top: 0 }); return; }
    const eb = e.target.closest('[data-act=edit-basic]');
    if (eb) pfLoadNames().then(() => pfOpenEditModal());
  });
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
  // v0.5.32：档案目录排序保存
  const dossSave = pfEl('dossierOrderSave');
  if (dossSave) dossSave.addEventListener('click', async () => {
    const list = pfEl('dossierOrderList');
    if (!list) return;
    const order = [...list.querySelectorAll('.ls-row')].map((r) => r.dataset.mod).filter(Boolean).join(',');
    const res = await api('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dossier_order: order }) });
    if (res.ok) {
      PF.dossierOrder = order.split(',').filter(Boolean);
      pfApplyOrder();
      pfRenderIndex();
      toast('排序已保存，资料页即刻生效');
      markSynced();
    } else toast('保存失败');
  });
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
    if (e.target.closest('#pfSampleRow')) { pfOpenSample(); return; }
    const row = e.target.closest('[data-pf-id]');
    if (row) pfOpenProfile(Number(row.dataset.pfId));
  });
  const addBtn = pfEl('relAddBtn');
  if (addBtn) addBtn.addEventListener('click', () => { pfLoadNames().then(() => pfOpenEditModal()); });

  // 档案视图
  const back = pfEl('pfBack'); if (back) back.addEventListener('click', pfBackToList);
  const del = pfEl('pfDelete'); if (del) del.addEventListener('click', pfDeletePerson);
  const edit = pfEl('pfEditBtn'); if (edit) edit.addEventListener('click', () => {
    PF.editMode = !PF.editMode;
    pfRenderAll();
  });

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


// 交给 app.js
window.PF = PF;
/* ---------- 人脉词库设置（v0.5.2：标签/群组 增删改 + 拖动排序） ---------- */
let relset = { kind: 'rel_tag', words: [] };

async function renderRelSet() {
  const box = pfEl('relsetList');
  if (!box) return;
  await pfLoadListFields();   // v0.5.31：列表显示字段勾选随设置页加载
  pfRenderListFields();
  pfLoadDossierOrder().then(renderDossierOrder);   // v0.5.32：档案目录排序
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

/* ---------- v0.5.32 档案目录排序（拖动 → 保存到 app_settings.dossier_order） ---------- */
function renderDossierOrder() {
  const box = pfEl('dossierOrderList');
  if (!box) return;
  const order = PF.dossierOrder.slice();
  PF_SECTIONS.forEach((m) => { if (!order.includes(m.key)) order.push(m.key); });   // 兜底：新模块排最后
  box.innerHTML = '';
  order.forEach((k) => {
    const row = document.createElement('div');
    row.className = 'ls-row';
    row.dataset.mod = k;
    row.innerHTML = '<span class="ls-handle" title="拖动排序"><i></i><i></i><i></i></span>'
      + '<span class="ls-name">' + pfEsc(pfSecDef(k).t) + '</span>';
    box.appendChild(row);
  });
  pfBindDossierDrag();
}
function pfBindDossierDrag() {
  const scope = pfEl('dossierOrderList');
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
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
  });
}

}

window.pfLoadList = pfLoadList;
window.pfOpenProfile = pfOpenProfile;
window.pfBindEvents = pfBindEvents;
window.pfEsc = pfEsc;
