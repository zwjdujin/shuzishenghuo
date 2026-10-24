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
  } catch (err) {
    if (!String(err.message).includes('unauthorized') && box) box.innerHTML = '<div class="empty-hint">加载联系人失败</div>';
  }
  pfLoadNames();
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
  pfEl('relListView').hidden = true;
  pfEl('relProfileView').hidden = false;
  ['pfHero', 'pfBasic', 'pfSocial', 'pfMethods', 'pfRelatives', 'pfWork', 'pfEdu', 'pfPets']
    .forEach((k) => { const el = pfEl(k); if (el) el.innerHTML = '<div class="empty-hint">加载中…</div>'; });
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
  pfEl('relProfileView').hidden = true;
  pfEl('relListView').hidden = false;
  pfLoadList();
}

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
    ['姓名', b.firstName], ['昵称', b.nickname], ['小名', b.childhoodName],
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

// ===== 添加 / 编辑联系人弹窗 =====
function pfSyncWizard() {
  const f = pfEl('contactEditForm');
  const type = f.querySelector('[name=bdayOpt]:checked').value;
  pfEl('bdayBody').hidden = type === 'unknown';
  pfEl('bdayYearRow').hidden = type !== 'full';
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
  ['firstName', 'nickname', 'childhoodName', 'formerName', 'englishName', 'alias']
    .forEach((k) => { f[k].value = b ? (b[k] || '') : ''; });
  f.gender.value = b ? (b.gender || '') : '';
  const type = b ? (b.birthdayType || 'unknown') : 'unknown';
  f.querySelector(`[name=bdayOpt][value="${type}"]`).checked = true;
  f.birthYear.value = b && b.birthYear ? b.birthYear : '';
  f.birthMonth.value = b && b.birthMonth ? b.birthMonth : '';
  f.birthDay.value = b && b.birthDay ? b.birthDay : '';
  f.querySelector(`[name=birthdayCalendar][value="${b ? (b.birthdayCalendar || 'solar') : 'solar'}"]`).checked = true;
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
  pfSyncWizard();
  pfEl('contactEditModal').hidden = false;
  setTimeout(() => { try { f.firstName.focus(); } catch (_) {} }, 40);
}

function pfCloseEditModal() { pfEl('contactEditModal').hidden = true; }

async function pfSubmitEdit(e) {
  e.preventDefault();
  const f = pfEl('contactEditForm');
  const errEl = pfEl('contactEditError');
  const err = (m) => { errEl.textContent = m; errEl.hidden = false; };
  const val = (k) => String(f[k].value || '').trim();

  const names = ['firstName', 'nickname', 'childhoodName', 'formerName', 'englishName', 'alias'].map(val).filter(Boolean);
  if (!names.length) return err('姓名、昵称、小名、曾用名、英文名、别名至少填一项');
  if (!f.gender.value) return err('请选择性别');

  const type = f.querySelector('[name=bdayOpt]:checked').value;
  const payload = {
    firstName: val('firstName'), nickname: val('nickname'), childhoodName: val('childhoodName'),
    formerName: val('formerName'), englishName: val('englishName'), alias: val('alias'),
    gender: f.gender.value,
    birthdayType: type,
    birthdayCalendar: f.querySelector('[name=birthdayCalendar]:checked').value,
    birthdayRemind: f.birthdayRemind.checked,
    isDeceased: f.isDeceased.checked,
    tags: PF.editTags.slice(),
    groups: PF.editGroups.slice(),
    note: val('note'),
  };
  if (type !== 'unknown') {
    payload.birthMonth = Number(f.birthMonth.value);
    payload.birthDay = Number(f.birthDay.value);
    if (!payload.birthMonth || payload.birthMonth < 1 || payload.birthMonth > 12) return err('请填写正确的出生月份');
    if (!payload.birthDay || payload.birthDay < 1 || payload.birthDay > 31) return err('请填写正确的出生日期');
    if (type === 'full') {
      payload.birthYear = Number(f.birthYear.value);
      if (!payload.birthYear || payload.birthYear < 1900 || payload.birthYear > 2100) return err('请填写正确的出生年份（1900-2100）');
    }
  } else {
    payload.birthMonth = null; payload.birthDay = null; payload.birthYear = null;
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
  if (!confirm(`确定删除「${PF.data.base.name}」？其联系方式、家庭关系、教育与宠物记录会一并删除，且不可恢复。`)) return;
  const res = await api(`/api/profile/delete?id=${PF.pid}`, { method: 'DELETE' }).catch(() => null);
  if (res && res.ok) {
    const d = await res.json().catch(() => ({}));
    toast(`已删除「${d.name || ''}」`);
    markSynced();
    pfBackToList();
  } else {
    toast('删除失败，请重试');
  }
}

// ===== 模块事件委托 =====
function pfBindEvents() {
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
  if (form) {
    form.addEventListener('submit', pfSubmitEdit);
    form.addEventListener('change', (e) => { if (e.target.name === 'bdayOpt') pfSyncWizard(); });
  }
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
        if (!confirm('确定删除这条联系方式？')) return;
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
        if (!confirm('确定删除这条家庭关系？')) return;
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

  // —— 教育 ——
  const eBox = pfEl('pfEdu');
  if (eBox) {
    eBox.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act=edel]');
      if (!btn) return;
      if (!confirm('确定删除这段教育经历？')) return;
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
      if (!confirm('确定删除这条宠物记录？')) return;
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
window.pfLoadList = pfLoadList;
window.pfOpenProfile = pfOpenProfile;
window.pfBindEvents = pfBindEvents;
window.pfEsc = pfEsc;
