// 数字生活 · 人物档案模块 v0.3.1
// 依赖：app.js 的 api() / $ / $$ / toast / markSynced / money()等全局

// ===== 模块定义 =====
const PF_MODULES = [
  { id: 'base',    n: '基础身份',   ic: '👤', layer: '静态档案', color: '#4d3045' },
  { id: 'rel',     n: '关系属性',   ic: '🔗', layer: '静态档案', color: '#b65f42' },
  { id: 'edu',     n: '教育与成长', ic: '🎓', layer: '静态档案', color: '#627a67' },
  { id: 'work',    n: '职业与资源', ic: '💼', layer: '静态档案', color: '#a57c45' },
  { id: 'family',  n: '家庭与亲密', ic: '🏠', layer: '静态档案', color: '#8f4f3b' },
  { id: 'pref',    n: '偏好与习惯', ic: '☕', layer: '静态档案', color: '#b65f42' },
  { id: 'trait',   n: '性格与沟通', ic: '🧭', layer: '静态档案', color: '#4d3045' },
  { id: 'interact',n: '互动时间轴', ic: '📅', layer: '动态记录', color: '#627a67' },
  { id: 'promise', n: '承诺与待办', ic: '✓',  layer: '价值交换', color: '#a57c45' },
  { id: 'money',   n: '财务人情账', ic: '¥',  layer: '价值交换', color: '#b65f42' },
  { id: 'dates',   n: '重要日期',   ic: '🔔', layer: '动态记录', color: '#8f4f3b' },
  { id: 'files',   n: '附件(R2)',   ic: '📎', layer: '安全隐私', color: '#4d3045' },
];

// 词库：内置常用词 + 用户自建（vocab 表）
const PF_VOCAB_DEFAULT = {
  trait: ['内向', '外向', '理性', '感性', '慢热', '热情', '守时', '随和', '严谨', '幽默', '务实', '乐观', '谨慎', '果断'],
  hobby: ['跑步', '健身', '游泳', '瑜伽', '篮球', '羽毛球', '登山', '徒步', '摄影', '唱歌', '听播客', '读书', '看剧', '电影', '手工', '种花', '养猫', '养狗', '桌游'],
  lang:  ['普通话', '粤语', '英语', '日语', '韩语', '法语', '德语', '闽南话', '四川话', '上海话'],
  food:  ['清淡', '重辣', '微辣', '不辣', '忌香菜', '忌海鲜', '海鲜过敏', '素食', '不吃牛', '乳糖不耐', '喜欢粤菜', '喜欢川菜', '喜欢淮扬菜', '喜欢日料'],
  drink: ['美式', '拿铁', '手冲', '龙井', '普洱', '茉莉', '柠檬水', '不喝咖啡', '不喝酒', '啤酒', '红酒'],
  size:  ['XS', 'S', 'M', 'L', 'XL', 'XXL', '36', '37', '38', '39', '40', '41', '42', '43', '44'],
  kind:  ['见面', '电话', '微信', '邮件', '视频', '聚餐', '活动', '会议', '咖啡', '生日', '礼物'],
  topic: ['工作', '生活', '求助', '合作', '闲聊', '家庭', '学习', '旅行'],
  quality: ['愉快', '一般', '紧张', '有收获', '轻松'],
  kin:   ['父亲', '母亲', '配偶', '妻子', '丈夫', '儿子', '女儿', '兄弟姐妹', '朋友', '同事', '其他'],
  edu:   ['高中', '大专', '本科', '硕士', '博士', 'MBA', '交换生', '公开课'],
};

let PF = {
  view: 'list',        // list | profile
  pid: null,           // 当前人物 id
  data: null,          // 档案数据
  mod: 'base',         // 当前模块
  filters: { q: '', surname: '', gender: '', ageBand: '', relation: '', province: '', city: '', level: '' },
  options: null,
  vocab: {},           // kind -> words
  modalCtx: null,
};

// ===== 工具 =====
function pfEl(id) { return document.getElementById(id); }
function pfNameOf(id) {
  const row = (window.__PF_NAMES || {})[id];
  return row || '';
}
function money(n) {
  n = Number(n) || 0;
  return '¥' + n.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}
// 生日每次都有：取今年或明年
function pfNextBday(bd) {
  if (!bd) return null;
  const [, M, D] = String(bd).split('-').map(Number);
  if (!M || !D) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let n = new Date(now.getFullYear(), M - 1, D);
  if (n < today) n = new Date(now.getFullYear() + 1, M - 1, D);
  const p2 = (x) => String(x).padStart(2, '0');
  return { days: Math.round((n - today) / 86400000), date: `${n.getFullYear()}-${p2(M)}-${p2(D)}` };
}

// ===== 列表视图 =====
async function pfLoadOptions() {
  try {
    const res = await api('/api/vocab');
    const d = await res.json();
    PF.vocab = {};
    Object.keys(d.grouped || {}).forEach((k) => { PF.vocab[k] = d.grouped[k].map((x) => x.word); });
  } catch { /* 未登录忽略 */ }
  // 合并内置词库（用户自建优先置后）
  Object.keys(PF_VOCAB_DEFAULT).forEach((k) => {
    const mine = PF.vocab[k] || [];
    const base = PF_VOCAB_DEFAULT[k].filter((w) => !mine.includes(w));
    PF.vocab[k] = mine.concat(base);
  });
}

async function pfLoadList() {
  const box = pfEl('contactList');
  if (box) box.innerHTML = '<div class="empty-hint">加载中…</div>';
  await pfLoadOptions();
  const f = PF.filters;
  const qs = new URLSearchParams();
  Object.keys(f).forEach((k) => { if (f[k]) qs.set(k, f[k]); });
  try {
    const res = await api('/api/profile/list?' + qs.toString());
    const d = await res.json();
    PF.options = d.options || {};
    window.__PF_NAMES = {};
    (d.list || []).forEach((p) => { window.__PF_NAMES[p.id] = p.name; });
    pfRenderFilters();
    pfRenderChips();
    pfRenderList(d.list || []);
    // 生日提醒卡片
    const bdays = (d.list || [])
      .filter((p) => p.nextBirthday && p.nextBirthday.days <= 60)
      .sort((a, b) => a.nextBirthday.days - b.nextBirthday.days)
      .slice(0, 12);
    pfRenderBdays(bdays);
    markSynced();
  } catch (err) {
    if (!String(err.message).includes('unauthorized') && box) box.innerHTML = '<div class="empty-hint">加载联系人失败</div>';
  }
}

function pfRenderFilters() {
  const box = pfEl('relFilters');
  if (!box || !PF.options) return;
  const o = PF.options;
  const mk = (label, key, opts) =>
    `<label class="field"><span>${label}</span><select data-pf-filter="${key}"><option value="">全部</option>${
      (opts || []).map((x) => `<option value="${x}"${PF.filters[key] === x ? ' selected' : ''}>${x}</option>`).join('')}</select></label>`;
  box.innerHTML =
    mk('姓氏', 'surname', o.surnames) + mk('性别', 'gender', o.genders) +
    mk('年龄段', 'ageBand', o.ageBands) + mk('关系', 'relation', o.relations) +
    mk('省份', 'province', o.provinces) + mk('城市', 'city', o.cities) +
    mk('亲疏关系', 'level', o.levels);
  box.querySelectorAll('[data-pf-filter]').forEach((s) =>
    s.addEventListener('change', () => { PF.filters[s.dataset.pfFilter] = s.value; pfLoadList(); })
  );
}

function pfRenderChips() {
  const box = pfEl('filterChips');
  if (!box) return;
  const L = [];
  const f = PF.filters;
  if (f.surname) L.push('姓:' + f.surname);
  if (f.gender) L.push(f.gender);
  if (f.ageBand) L.push(f.ageBand);
  if (f.relation) L.push(f.relation);
  if (f.province) L.push(f.province);
  if (f.city) L.push(f.city);
  if (f.level) L.push('亲疏:' + f.level);
  box.innerHTML = L.length
    ? L.map((x) => `<span class="tf-chip on">${x}</span>`).join('') + `<button class="tf-chip" id="pfResetFilter">清空筛选</button>`
    : '';
  const rs = pfEl('pfResetFilter');
  if (rs) rs.addEventListener('click', () => {
    PF.filters = { q: '', surname: '', gender: '', ageBand: '', relation: '', province: '', city: '', level: '' };
    const s = pfEl('relSearch'); if (s) s.value = '';
    pfLoadList();
  });
}

function pfRenderList(list) {
  const box = pfEl('contactList');
  const cnt = pfEl('contactCount');
  if (cnt) cnt.textContent = list.length ? `共 ${list.length} 人` : '';
  if (!box) return;
  if (!list.length) {
    box.innerHTML = '<div class="empty-hint">没有符合条件的人物，试试放宽筛选</div>';
    return;
  }
  box.innerHTML = list.map((p) => {
    const b = p.nextBirthday;
    return `<button class="contact-row" onclick="pfOpenProfile(${p.id})">
      <span class="contact-avatar" style="background:${pfColorOf(p.id)}">${p.name[0]}</span>
      <div class="contact-main">
        <b>${pfEsc(p.name)}${p.alias ? ' <small style="font-weight:400;color:var(--muted)">（' + pfEsc(p.alias) + '）</small>' : ''}</b>
        <div class="contact-meta">
          <span class="contact-badge">${p.relation || '—'}</span>
          ${p.gender ? `<span class="contact-badge">${p.gender}</span>` : ''}
          ${p.age !== null ? `<span class="contact-badge">${p.age} 岁</span>` : ''}
          ${p.province || p.city ? `<span class="contact-badge">${[p.province, p.city].filter(Boolean).join(' ')}</span>` : ''}
          ${p.level ? `<span class="contact-badge">${p.level}</span>` : ''}
          ${p.job ? `<span>${pfEsc(p.job)}</span>` : ''}
        </div>
      </div>
      <span class="contact-phone">${b ? (b.days === 0 ? '生日就是今天' : `${b.days} 天后生日`) : '未填生日'}</span>
    </button>`;
  }).join('');
}

function pfRenderBdays(list) {
  const box = pfEl('bdayList');
  if (!box) return;
  if (!list.length) { box.innerHTML = '<div class="empty-hint">近期没有生日</div>'; return; }
  box.innerHTML = list.map((p) => {
    const b = p.nextBirthday;
    const soon = b.days <= 7;
    const lunar = p.showLunar && b.lunar ? `<div class="bd">农历 ${b.lunar.short} · 属${b.lunar.animal}</div>` : '';
    return `<button class="bday-card" onclick="pfOpenProfile(${p.id})">
      <div class="bday-top"><span class="bday-name">${pfEsc(p.name)}</span>
        <span class="bday-days${soon ? ' soon' : ''}">${b.days === 0 ? '就是今天' : b.days + ' 天'}</span></div>
      <div class="bd">下次生日 <b>${b.date}</b></div>
      ${lunar}
    </button>`;
  }).join('');
}

function pfColorOf(id) {
  const arr = ['#4d3045', '#b65f42', '#627a67', '#a57c45', '#8f4f3b', '#7a6a8f'];
  return arr[Number(id || 0) % arr.length];
}
function pfEsc(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ===== 档案视图 =====
async function pfOpenProfile(id) {
  PF.pid = Number(id);
  PF.mod = 'base';
  PF.view = 'profile';
  pfEl('relListView').hidden = true;
  pfEl('relProfileView').hidden = false;
  pfEl('pfModulePanel').hidden = true;
  pfEl('pfModBody').innerHTML = '<div class="empty-hint">加载中…</div>';
  pfEl('pfHero').innerHTML = '<div class="empty-hint">加载档案中…</div>';
  try {
    const res = await api('/api/profile/detail?id=' + PF.pid);
    PF.data = await res.json();
    pfRenderAll();
    markSynced();
  } catch (err) {
    if (!String(err.message).includes('unauthorized')) {
      pfEl('pfHero').innerHTML = '<div class="empty-hint">加载档案失败</div>';
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
  pfRenderHero();
  pfRenderScore();
  pfRenderNodes();
  pfRenderRelatives();
  pfRenderModNav();
  pfRenderPromises();
  pfRenderMoney();
  pfRenderInteracts();
  if (pfEl('pfModulePanel').hidden === false) pfRenderModule();
}

function pfRenderHero() {
  const b = PF.data.base;
  const box = pfEl('pfHero');
  const nb = b.nextBirthday;
  box.innerHTML = `<div class="pf-hero">
    <span class="pf-hero-av" style="background:${pfColorOf(PF.pid)}">${pfEsc(b.name[0])}</span>
    <div style="min-width:0">
      <h2>${pfEsc(b.name)}${b.alias ? ' <small>' + pfEsc(b.alias) + '</small>' : ''}</h2>
      <div class="pf-hero-tags">
        <span class="contact-badge">${pfEsc(PF.data.rel.type || '—')}</span>
        ${b.age !== null ? `<span class="contact-badge">${b.age} 岁</span>` : ''}
        ${b.birthday ? `<span class="contact-badge">${b.birthday}</span>` : ''}
        ${b.showLunar && b.lunar ? `<span class="contact-badge">农历${b.lunar.short}</span>` : ''}
        ${b.city ? `<span class="contact-badge">${pfEsc(b.province || '')} ${pfEsc(b.city)}</span>` : ''}
        ${b.job ? `<span class="contact-badge">${pfEsc(b.job)}</span>` : ''}
        <span class="contact-badge">${pfEsc(PF.data.rel.level || '')}</span>
        <span class="contact-badge">${pfEsc(PF.data.rel.status || '')}</span>
      </div>
    </div>
    <div class="cal-actions" style="margin-left:auto">
      ${nb ? `<span class="bday-days${nb.days <= 30 ? ' soon' : ''}">${nb.days === 0 ? '今天生日' : nb.days + ' 天后生日'}</span>` : ''}
    </div>
  </div>`;
}

function pfRenderScore() {
  const d = PF.data, b = d.base;
  const fill = (o, keys) => keys.filter((k) => o[k] && o[k] !== '—' && o[k] !== '').length + '/' + keys.length;
  const parts = {
    base: fill(b, ['name', 'alias', 'gender', 'birthday', 'province', 'city', 'job', 'company']),
    rel: fill(d.rel, ['type', 'level', 'via', 'since', 'scene', 'status']),
    edu: d.edus.length + '段',
    work: fill(d.work, ['company', 'dept', 'title', 'field', 'give']),
    family: fill(d.family, ['father', 'mother', 'spouse', 'child', 'live']),
    pref: fill(d.pref, ['foods', 'drinks', 'hobbies', 'life']),
    trait: fill(d.trait, ['tags', 'style', 'reply', 'value', 'taboo']),
    interact: d.interacts.length + '条',
    promise: d.promises.length + '条',
    money: d.money.length + '笔',
    files: d.files.length + '件',
  };
  // 总分：静态档案 60% + 动态记录 40%
  let got = 0, all = 0;
  Object.entries(parts).forEach(([k, v]) => {
    if (k === 'rel' && v === '0/0') return;
    all++;
    if (k === 'edu') got += Math.min(1, d.edus.length / 2);
    else if (k === 'interact') got += Math.min(1, d.interacts.length / 5);
    else if (k === 'promise') got += Math.min(1, d.promises.length / 3);
    else if (k === 'money') got += Math.min(1, d.money.length / 3);
    else if (k === 'files') got += Math.min(1, d.files.length / 3);
    else {
      const [a, t] = String(v).split('/').map(Number);
      got += t ? a / t : 0;
    }
  });
  const pct = Math.round((got / all) * 100);
  const ring = pfEl('pfRing');
  if (ring) {
    ring.setAttribute('stroke-dasharray', `${(pct * 2.638).toFixed(1)} 264`);
    ring.setAttribute('stroke', pct > 70 ? '#627a67' : pct > 40 ? '#a57c45' : '#b65f42');
  }
  pfEl('pfScore').textContent = pct + '%';
  pfEl('pfScoreTip').textContent = pct >= 80 ? '画像已经很立体了，继续补充互动与近况会让它更鲜活'
    : pct >= 50 ? '基础信息较全，建议补充互动时间轴与承诺事项'
    : '基础信息还比较少，先把核心字段填上吧';
  pfEl('pfMods').innerHTML = PF_MODULES.map((m) => {
    const on = parts[m.id] && parts[m.id] !== '0/0' && parts[m.id] !== '0段' && parts[m.id] !== '0条' && parts[m.id] !== '0笔' && parts[m.id] !== '0件';
    return `<span class="tf-chip${on ? '' : ' '}" data-pf-mod="${m.id}" style="${on ? '' : 'opacity:.45'}">${m.ic} ${m.n} ${parts[m.id]}</span>`;
  }).join('');
  pfEl('pfMods').querySelectorAll('[data-pf-mod]').forEach((b2) =>
    b2.addEventListener('click', () => pfPickMod(b2.dataset.pfMod))
  );

  // 画像标签云
  const cloud = [];
  (d.trait.tags || []).forEach((t) => cloud.push(['p', t]));
  (d.pref.hobbies || []).forEach((t) => cloud.push(['s', t]));
  (d.pref.foods || []).forEach((t) => cloud.push(['t', t]));
  if (d.trait.style) cloud.push(['d', d.trait.style]);
  if (d.rel.level) cloud.push(['d', d.rel.level]);
  if (d.rel.status) cloud.push(['d', d.rel.status]);
  pfEl('pfCloud').innerHTML = cloud.length
    ? cloud.map(([c, t]) => `<span class="tf-chip ${c === 'on' ? 'on' : ''}" style="${c === 'p' ? 'background:var(--plum-soft);color:var(--plum)' : c === 's' ? 'background:var(--sage-soft);color:var(--sage)' : c === 't' ? 'background:var(--terra-soft);color:var(--terra)' : 'background:var(--sand-soft);color:var(--sand)'}">${pfEsc(t)}</span>`).join('')
    : '<div class="empty-hint">还没有画像标签，补充性格与兴趣后会显示在这里</div>';
}

function pfRenderNodes() {
  const d = PF.data, b = d.base, nb = b.nextBirthday;
  const stale = pfDaysSince(d.dates && d.dates.stale);
  const nodes = [];
  if (nb) {
    nodes.push({ s: '距离生日', v: nb.days === 0 ? '就是今天' : nb.days + ' 天', e: `${nb.full} · 明年 ${nb.age} 岁`, hot: nb.days <= 30 });
    if (b.showLunar && b.lunar) nodes.push({ s: '农历生日', v: b.lunar.short, e: `属${b.lunar.animal} · 每年农历同一天` });
  } else {
    nodes.push({ s: '距离生日', v: '未填写', e: '可在基础身份中补充' });
  }
  if (d.dates && d.dates.birth) nodes.push({ s: '公历生日', v: d.dates.birth, e: b.showLunar ? '已开启农历显示' : '未开启农历显示' });
  if (stale !== null) nodes.push({ s: '最近联系', v: d.dates.stale, e: stale > 30 ? `已 ${stale} 天未联系` : '关系活跃', hot: stale > 30 });
  if (d.dates && d.dates.cycle) nodes.push({ s: '联系频率', v: d.dates.cycle, e: '建议保持' });
  pfEl('pfNodes').innerHTML = nodes.map((n) =>
    `<div class="bday-card"${n.hot ? ' style="border-color:var(--terra)"' : ''}>
      <div class="bd">${n.s}</div>
      <div class="bday-name" style="color:${n.hot ? 'var(--terra)' : 'var(--ink)'}">${pfEsc(n.v)}</div>
      <div class="bd">${pfEsc(n.e || '')}</div>
    </div>`).join('');
}

function pfDaysSince(s) {
  if (!s || s === '—') return null;
  const d = new Date(String(s).replace(/-/g, '/'));
  if (isNaN(d.getTime())) return null;
  return Math.round((Date.now() - d.getTime()) / 86400000);
}

function pfRenderRelatives() {
  const box = pfEl('pfRelatives');
  const list = PF.data.relatives || [];
  if (!list.length) { box.innerHTML = '<div class="empty-hint">还没有关联人物</div>'; return; }
  box.innerHTML = list.map((r) => `
    <div class="bday-card" style="text-align:left">
      <div style="display:flex;align-items:center;gap:9px">
        <span class="contact-avatar" style="background:${r.linked ? pfColorOf(r.refId) : '#b9b0a4'};width:32px;height:32px;font-size:13px">${pfEsc(r.name[0])}</span>
        <div style="min-width:0;flex:1">
          <b class="bday-name" style="cursor:${r.linked ? 'pointer' : 'default'}"
             ${r.linked ? `onclick="pfOpenProfile(${r.refId})"` : ''}>${r.linked ? '<i class="link-mark" title="该人物在你的联系人中，点击可查看档案">🔗</i>' : ''}${pfEsc(r.name)}</b>
          <div class="bd">${pfEsc(r.kin || '')}${r.note ? ' · ' + pfEsc(r.note) : ''}</div>
        </div>
        <button class="icon-btn" title="编辑" onclick="pfEditRel(${r.id})"><svg><use href="#i-edit"/></svg></button>
        <button class="icon-btn" title="删除" onclick="pfAskDelRel(${r.id})"><svg><use href="#i-x"/></svg></button>
      </div>
    </div>`).join('');
}

function pfRenderModNav() {
  const box = pfEl('pfModNav');
  box.innerHTML = PF_MODULES.map((m) =>
    `<button class="tf-chip${PF.mod === m.id ? ' on' : ''}" onclick="pfPickMod('${m.id}')">${m.ic} ${m.n}</button>`
  ).join('');
}

function pfRenderPromises() {
  const box = pfEl('pfPromises');
  const list = PF.data.promises || [];
  if (!list.length) { box.innerHTML = '<div class="empty-hint">暂无承诺事项</div>'; return; }
  box.innerHTML = list.map((p) => `
    <div class="contact-row" style="cursor:default">
      <span class="contact-badge">${pfEsc(p.side)}方</span>
      <div class="contact-main"><b>${pfEsc(p.what)}</b>
        <div class="contact-meta"><span>截止 ${pfEsc(p.due || '—')}</span>${p.todoId ? '<span class="contact-badge">已在待办</span>' : ''}${p.note ? `<span>${pfEsc(p.note)}</span>` : ''}</div>
      </div>
      <span class="contact-badge">${pfEsc(p.status)}</span>
      ${p.done ? '' : `<button class="btn xs" onclick="pfDonePromise(${p.id})">完成</button>`}
    </div>`).join('');
}

function pfRenderMoney() {
  const box = pfEl('pfMoney');
  const list = PF.data.money || [];
  const TN = { gift_out: '送出', gift_in: '收到', lend: '借出', repay: '还款', aa: 'AA结算' };
  const out = list.filter((x) => x.type !== 'gift_in').reduce((s, x) => s + x.amount, 0);
  const inc = list.filter((x) => x.type === 'gift_in').reduce((s, x) => s + x.amount, 0);
  let head = `<div class="money-bar">
      <div class="money"><span>送出/借出</span><b style="color:var(--red)">${money(out)}</b></div>
      <div class="money"><span>收到</span><b style="color:var(--green)">${money(inc)}</b></div>
    </div>
    <div class="note info" style="margin-bottom:12px">🔗 已同步「我的账本」（分类：人情/借还款，备注 @${pfEsc(PF.data.base.name)}）</div>`;
  if (!list.length) { box.innerHTML = head + '<div class="empty-hint">暂无往来记录</div>'; return; }
  box.innerHTML = head + list.map((m) => `
    <div class="contact-row" style="cursor:default">
      <span class="contact-badge">${TN[m.type] || m.type}</span>
      <div class="contact-main"><b>${pfEsc(m.note || TN[m.type])}</b><div class="contact-meta"><span>${m.date}</span></div></div>
      <span class="amt ${m.type === 'gift_in' ? 'in' : 'out'}">${m.type === 'gift_in' ? '+' : '-'}${money(m.amount)}</span>
      <button class="icon-btn" title="删除" onclick="pfDelMoney(${m.id})"><svg><use href="#i-x"/></svg></button>
    </div>`).join('');
}

function pfRenderInteracts() {
  const box = pfEl('pfInteracts');
  const list = PF.data.interacts || [];
  if (!list.length) { box.innerHTML = '<div class="empty-hint">还没有互动记录，点上方按钮添加</div>'; return; }
  box.innerHTML = list.map((i) => `
    <div class="tl-row">
      <div class="tl-h"><b>${pfEsc(i.kind || '互动')}</b><span>${i.date} · ${pfEsc(i.place || '')}</span>
        <button class="icon-btn" title="删除" onclick="pfDelInteract(${i.id})" style="margin-left:auto"><svg><use href="#i-x"/></svg></button></div>
      <div class="tl-m">参与人：${pfEsc(i.who || '—')} · 主题：${pfEsc(i.topic || '—')} · 质量：<b style="color:var(--green)">${pfEsc(i.quality || '')}</b></div>
      <div class="tl-s">${pfEsc(i.summary || '')}</div>
    </div>`).join('');
}

// ===== 事件绑定（由 app.js 在初始化时调用） =====
function pfBindEvents() {
  // 列表筛选
  const s = pfEl('relSearch');
  if (s) {
    let t = null;
    s.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => { PF.filters.q = s.value.trim(); pfLoadList(); }, 260);
    });
  }
  const tg = pfEl('relFilterToggle');
  if (tg) tg.addEventListener('click', () => {
    const f = pfEl('relFilters');
    f.hidden = !f.hidden;
    tg.textContent = f.hidden ? '筛选' : '收起筛选';
  });
  const ab = pfEl('addContactBtn');
  if (ab) ab.addEventListener('click', () => openContactModal(null));

  // 档案视图
  const bk = pfEl('pfBack'); if (bk) bk.addEventListener('click', pfBackToList);
  const eb = pfEl('pfEditBtn'); if (eb) eb.addEventListener('click', () => pfPickMod('base'));
  const del = pfEl('pfDelete');
  if (del) del.addEventListener('click', pfAskDelPerson);
  const ar = pfEl('pfAddRel'); if (ar) ar.addEventListener('click', () => pfOpenRelModal(null));
  const ap = pfEl('pfAddPromise'); if (ap) ap.addEventListener('click', pfOpenPromiseModal);
  const am = pfEl('pfAddMoney'); if (am) am.addEventListener('click', pfOpenMoneyModal);
  const ai = pfEl('pfAddInteract'); if (ai) ai.addEventListener('click', pfOpenInteractModal);

  // 弹窗：互动
  const ic = pfEl('interactClose'); if (ic) ic.addEventListener('click', () => pfEl('interactModal').hidden = true);
  const if_ = pfEl('interactForm');
  if (if_) {
    pfFillSelect('interactKindSel', PF.vocab.kind);
    pfFillSelect('interactTopicSel', PF.vocab.topic);
    pfFillSelect('interactQualitySel', PF.vocab.quality);
    if_.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(if_);
      const res = await api('/api/profile/interacts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_id: PF.pid, date: fd.get('date'), kind: fd.get('kind'),
          place: fd.get('place'), who: fd.get('who'), topic: fd.get('topic'),
          quality: fd.get('quality'), summary: fd.get('summary'), remind: fd.get('remind') === 'on' }),
      });
      if (res.ok) { pfEl('interactModal').hidden = true; toast('已记录'); await pfOpenProfile(PF.pid); }
    });
  }
  // 弹窗：承诺
  const pc = pfEl('promiseClose'); if (pc) pc.addEventListener('click', () => pfEl('promiseModal').hidden = true);
  const pf2 = pfEl('promiseForm');
  if (pf2) pf2.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(pf2);
    const res = await api('/api/profile/promises', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ person_id: PF.pid, side: fd.get('side'), what: fd.get('what'),
        due: fd.get('due'), status: fd.get('status'), priority: fd.get('priority'),
        note: fd.get('note'), pushTodo: fd.get('pushTodo') === 'on' }),
    });
    if (res.ok) { pfEl('promiseModal').hidden = true; toast('已保存'); await pfOpenProfile(PF.pid); }
  });
  // 弹窗：人情账
  const mc = pfEl('moneyClose'); if (mc) mc.addEventListener('click', () => pfEl('moneyModal').hidden = true);
  const mf = pfEl('moneyForm');
  if (mf) mf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(mf);
    const res = await api('/api/profile/money', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ person_id: PF.pid, type: fd.get('type'),
        amount: Number(fd.get('amount')), date: fd.get('date'), note: fd.get('note') }),
    });
    if (res.ok) { pfEl('moneyModal').hidden = true; toast('已记账并同步账本'); await pfOpenProfile(PF.pid); }
  });
  // 弹窗：人物关联
  const rc = pfEl('relClose'); if (rc) rc.addEventListener('click', () => pfEl('relModal').hidden = true);
  const rf = pfEl('relForm');
  if (rf) {
    pfFillSelect('relKinSel', PF.vocab.kin);
    rf.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(rf);
      const payload = { person_id: PF.pid, name: fd.get('name'), kin: fd.get('kin'),
        note: fd.get('note'), ref_id: Number(fd.get('refId')) || null };
      const editing = PF.modalCtx && PF.modalCtx.editingId;
      const res = await api('/api/profile/relatives', {
        method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing ? { ...payload, id: editing } : payload),
      });
      if (res.ok) { pfEl('relModal').hidden = true; toast('已保存'); await pfOpenProfile(PF.pid); }
    });
  }
  // 通用处理弹窗
  const hc = pfEl('handleClose'); if (hc) hc.addEventListener('click', pfCloseHandle);
  const hcan = pfEl('handleCancel'); if (hcan) hcan.addEventListener('click', pfCloseHandle);
}

function pfFillSelect(id, words) {
  const el = pfEl(id);
  if (!el) return;
  el.innerHTML = (words || []).map((w) => `<option>${pfEsc(w)}</option>`).join('');
}

function pfOpenInteractModal() {
  const f = pfEl('interactForm');
  f.reset();
  f.date.value = new Date().toISOString().slice(0, 10);
  pfEl('interactModal').hidden = false;
}
function pfOpenPromiseModal() {
  const f = pfEl('promiseForm');
  f.reset(); f.due.value = ''; f.pushTodo.checked = true;
  pfEl('promiseModal').hidden = false;
}
function pfOpenMoneyModal() {
  const f = pfEl('moneyForm');
  f.reset(); f.date.value = new Date().toISOString().slice(0, 10);
  pfEl('moneyModal').hidden = false;
}

// 关联弹窗
async function pfOpenRelModal(rel) {
  const f = pfEl('relForm');
  f.reset();
  PF.modalCtx = { editingId: rel ? rel.id : null };
  pfEl('relModalTitle').textContent = rel ? '编辑关联人物' : '添加人物关联';
  pfEl('relDelete').hidden = !rel;
  if (rel) {
    f.name.value = rel.name; f.kin.value = rel.kin || ''; f.note.value = rel.note || '';
    f.refId.value = rel.refId || '';
  }
  // 关联下拉：本人 + 全部联系人
  const sel = pfEl('relRefSel');
  const opts = ['<option value="">（不关联，仅文字）</option>'];
  try {
    const res = await api('/api/profile/list');
    const d = await res.json();
    (d.list || []).filter((x) => x.id !== PF.pid).forEach((x) =>
      opts.push(`<option value="${x.id}">${pfEsc(x.name)}${x.alias ? '（' + pfEsc(x.alias) + '）' : ''}</option>`));
  } catch { /* 忽略 */ }
  sel.innerHTML = opts.join('');
  if (rel && rel.refId) sel.value = rel.refId;
  pfEl('relModal').hidden = false;
}
function pfEditRel(id) {
  const r = (PF.data.relatives || []).find((x) => x.id === Number(id));
  if (r) pfOpenRelModal(r);
}
function pfAskDelRel(id) {
  const r = (PF.data.relatives || []).find((x) => x.id === Number(id));
  if (!r) return;
  pfEl('handleTitle').textContent = '处理关联人物';
  pfEl('handleBody').innerHTML = `
    <div class="note info" style="margin-bottom:14px"><b>${pfEsc(r.name)}</b> · ${pfEsc(r.kin || '')}<br>
      <span style="font-size:11.5px">${r.linked ? '当前为可跳转关联' : '当前为纯文字关联'}</span></div>
    <div class="handle-opts">
      <button class="handle-opt" onclick="pfDoDelRel(${r.id},'delete')"><b>删除关联</b><small>仅解除此关系，不影响该联系人本身</small></button>
      <button class="handle-opt" onclick="pfDoDelRel(${r.id},'deprecate')"><b>标记失效，但保留记录</b><small>保留痕迹，不再显示在关联列表中</small></button>
      <button class="handle-opt cancel" onclick="pfCloseHandle()"><b>放弃操作</b><small>不做任何修改，关闭当前弹窗</small></button>
    </div>`;
  pfEl('handleModal').hidden = false;
}
async function pfDoDelRel(id, act) {
  await api('/api/profile/relatives?id=' + id + '&action=' + act, { method: 'DELETE' });
  pfCloseHandle();
  toast(act === 'delete' ? '已删除关联' : '已标记失效');
  await pfOpenProfile(PF.pid);
}
function pfCloseHandle() { pfEl('handleModal').hidden = true; }

// 删除联系人（三选项确认）
function pfAskDelPerson() {
  if (!PF.data) return;
  const b = PF.data.base;
  const n = PF.data;
  pfEl('handleTitle').textContent = '删除联系人';
  pfEl('handleBody').innerHTML = `
    <div class="note info" style="margin-bottom:14px">
      <b>${pfEsc(b.name)}</b>${b.alias ? '（' + pfEsc(b.alias) + '）' : ''}<br>
      <span style="font-size:11.5px">
        档案 ${n.edus.length} 段教育 · ${n.interacts.length} 条互动 · ${n.promises.length} 条承诺 ·
        ${n.money.length} 笔人情 · ${n.relatives.length} 位关联 · ${n.files.length} 个附件
      </span>
    </div>
    <div class="handle-opts">
      <button class="handle-opt" onclick="pfDoDelPerson()"><b>确认删除该联系人</b>
        <small>将同时清除其全部档案数据、关联记录、承诺生成的待办与人情账目、R2 附件，且不可恢复</small></button>
      <button class="handle-opt cancel" onclick="pfCloseHandle()"><b>放弃操作</b>
        <small>不做任何修改，关闭当前弹窗</small></button>
    </div>`;
  pfEl('handleModal').hidden = false;
}
async function pfDoDelPerson() {
  if (!PF.pid) return;
  const res = await api(`/api/profile/delete?id=${PF.pid}`, { method: 'DELETE' });
  pfCloseHandle();
  if (res.ok) {
    toast(`已删除「${res.name}」及关联数据`);
    await pfBackToList();
  } else {
    toast('删除失败，请重试');
  }
}

async function pfDonePromise(id) {
  await api('/api/profile/promises', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: Number(id), status: '已完成', action: 'done' }),
  });
  toast('已完成，待办已同步');
  await pfOpenProfile(PF.pid);
}
async function pfDelMoney(id) {
  if (!confirm('确定删除这笔往来记录？账本中的对应流水也会删除。')) return;
  await api(`/api/profile/money?id=${id}`, { method: 'DELETE' });
  toast('已删除');
  await pfOpenProfile(PF.pid);
}
async function pfDelInteract(id) {
  if (!confirm('确定删除这条互动记录？')) return;
  await api(`/api/profile/interacts?id=${id}`, { method: 'DELETE' });
  toast('已删除');
  await pfOpenProfile(PF.pid);
}

// 交给 app.js
window.PF = PF;
window.pfLoadList = pfLoadList;
window.pfOpenProfile = pfOpenProfile;
window.pfBindEvents = pfBindEvents;
window.pfPickMod = pfPickMod;
window.pfOpenRelModal = pfOpenRelModal;
window.pfEditRel = pfEditRel;
window.pfAskDelRel = pfAskDelRel;
window.pfDoDelRel = pfDoDelRel;
window.pfCloseHandle = pfCloseHandle;
window.pfAskDelPerson = pfAskDelPerson;
window.pfDoDelPerson = pfDoDelPerson;
window.pfDonePromise = pfDonePromise;
window.pfDelMoney = pfDelMoney;
window.pfDelInteract = pfDelInteract;
window.pfOpenInteractModal = pfOpenInteractModal;
window.pfOpenPromiseModal = pfOpenPromiseModal;
window.pfOpenMoneyModal = pfOpenMoneyModal;
window.pfEsc = pfEsc;

/* ============================================================
   模块编辑区：核心字段 + 展开更多、词库缓存点击即用
   ============================================================ */
let pfMoreOpen = {};   // 各模块「展开更多」状态
let pfVocabSel = {};   // 本次会话中已选的词（按 kind:pid 维度）

function pfPickMod(id) {
  PF.mod = id;
  pfEl('pfModNav').querySelectorAll('[data-pf-mod]').forEach((b) =>
    b.classList.toggle('on', b.dataset.pfMod === id));
  pfRenderModNav();
  pfEl('pfModulePanel').hidden = false;
  pfRenderModule();
  pfEl('pfModulePanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// 字段助手
const pfF = (label, val, ph, ta) => `<label class="field"><span>${label}</span>${
  ta ? `<textarea name="${label}" rows="2" maxlength="300" placeholder="${ph || ''}">${pfEsc(val || '')}</textarea>`
     : `<input name="${label}" value="${pfEsc(val || '')}" placeholder="${ph || ''}">`}</label>`;
const pfS = (label, val, opts) => `<label class="field"><span>${label}</span><select name="${label}">${
  opts.map((o) => `<option${o === val ? ' selected' : ''}>${o}</option>`).join('')}</select></label>`;

// 核心/更多折叠
function pfCoreMore(id, coreHtml, moreHtml) {
  const open = pfMoreOpen[id];
  return `${coreHtml}
    <button class="more-btn${open ? ' open' : ''}" onclick="pfToggleMore('${id}')">
      <svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>
      ${open ? '收起更多字段' : '展开更多字段（完整档案）'}
    </button>
    ${open ? `<div class="field-divider"><b>更多字段</b><span>可多选 / 多次填写，用词库快速录入</span></div>${moreHtml}` : ''}`;
}
function pfToggleMore(id) { pfMoreOpen[id] = !pfMoreOpen[id]; pfRenderModule(); }

// 词库组件：已选标签 + 常用词点击即用
function pfVocabBox(kind, selected, label) {
  const words = PF.vocab[kind] || [];
  const sel = selected || [];
  const key = kind + ':' + PF.pid;
  pfVocabSel[key] = pfVocabSel[key] || sel.slice();
  return `<div class="pf-vocab">
    <span class="pf-vocab-l">${label}</span>
    <div class="tf-chips" id="vsel_${kind}">${pfVocabSel[key].map((w, i) =>
      `<span class="tf-chip on">${pfEsc(w)}<button class="x" onclick="pfRmVocab('${kind}',${i})">×</button></span>`).join('')}</div>
    <div class="add-row">
      <input class="inp" id="vin_${kind}" placeholder="输入新词，回车添加并记入词库">
      <button class="btn ghost" onclick="pfAddVocab('${kind}')">添加</button>
    </div>
    <div class="vocab">
      <span class="vocab-l">📌 常用词（点击即用）</span>
      ${words.map((w) => `<button class="vc" onclick="pfQuickVocab('${kind}','${pfEsc(w)}')">${pfEsc(w)}</button>`).join('')}
    </div>
  </div>`;
}
function pfQuickVocab(kind, w) {
  const key = kind + ':' + PF.pid;
  const arr = pfVocabSel[key] = pfVocabSel[key] || [];
  if (!arr.includes(w)) arr.push(w);
  pfRenderModule();
  api('/api/vocab', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, word: w }) }).catch(() => {});
}
function pfAddVocab(kind) {
  const el = document.getElementById('vin_' + kind);
  const v = (el && el.value || '').trim();
  if (v) pfQuickVocab(kind, v);
}
function pfRmVocab(kind, i) {
  const key = kind + ':' + PF.pid;
  if (pfVocabSel[key]) pfVocabSel[key].splice(i, 1);
  pfRenderModule();
}
function pfGetVocab(kind, fallback) {
  const key = kind + ':' + PF.pid;
  return pfVocabSel[key] || fallback || [];
}

// 收集表单值
function pfVals(form) {
  const o = {};
  form.querySelectorAll('[name]').forEach((el) => { o[el.name] = el.value; });
  return o;
}
// 收集词库值
function pfVocabVals() {
  const o = {};
  Object.keys(PF.vocab).forEach((k) => {
    const key = k + ':' + PF.pid;
    if (pfVocabSel[key]) o[k] = pfVocabSel[key];
  });
  return o;
}

function pfRenderModule() {
  const m = PF_MODULES.find((x) => x.id === PF.mod);
  if (!m) return;
  pfEl('pfModLayer').textContent = m.layer;
  pfEl('pfModTitle').textContent = m.n;
  const box = pfEl('pfModBody');
  const fn = { base: pfModBase, rel: pfModRel, edu: pfModEdu, work: pfModWork, family: pfModFamily,
    pref: pfModPref, trait: pfModTrait, interact: pfModInteract, promise: pfModPromise,
    money: pfModMoney, dates: pfModDates, files: pfModFiles }[m.id];
  box.innerHTML = fn ? fn() : '';
  const f = box.querySelector('form[data-pf-form]');
  if (f) f.addEventListener('submit', (e) => { e.preventDefault(); pfSaveModule(m.id, f); });
}

// ===== 各模块表单 =====
function pfModBase() {
  const b = PF.data.base, m = PF.data;
  const lb = b.lunar;
  return `<form data-pf-form="base">
    <div class="note info" style="margin-bottom:14px">💡 核心字段速填；展开更多可填多个手机号 / 邮箱 / 微信号、身份证、语言等。</div>
    <div class="field-grid">
      ${pfF('姓名', b.name, '', false)}
      ${pfF('别名 / 昵称', b.alias)}
      ${pfS('性别', b.gender || '未填', ['未填', '男', '女', '其他'])}
      <label class="field"><span>生日（公历）</span><input name="birthday" type="date" value="${b.birthday || ''}"></label>
    </div>
    <div class="bday-box">
      <div><span class="bb-l">公历生日</span><b>${b.birthday || '未填写'}</b></div>
      <div class="bb-arrow">→</div>
      <div class="${b.birthday && lb ? '' : 'off'}"><span class="bb-l">农历生日</span><b>${b.birthday && lb ? lb.full : '—'}</b>
        <small>${b.birthday && lb ? '属' + lb.animal + ' · 每年农历同一天' : '填写生日后自动换算'}</small></div>
      <label class="check-line" style="margin:0"><input type="checkbox" name="showLunar" ${b.showLunar ? 'checked' : ''}><span>显示农历生日</span></label>
    </div>
    <div class="field-grid">
      ${pfF('省份', b.province)}
      ${pfF('城市', b.city)}
      ${pfF('职业', b.job)}
      ${pfF('公司', b.company)}
      ${pfF('关系', m.rel.type)}
      ${pfS('亲疏层级', m.rel.level, ['核心', '重要', '普通', '弱连接'])}
      ${pfS('关系状态', m.rel.status, ['活跃', '疏远', '失联', '合作中', '已终止'])}
    </div>
    ${pfCoreMore('base', '', `<div class="field-grid">
      ${pfF('籍贯', b.native)}${pfF('主页 / 名片链接', b.page)}
      <label class="field"><span>身份证号码</span><input name="idcard" value="${b.idcard || ''}" placeholder="18 位，可自动识别生日" maxlength="18"></label>
    </div>
    ${b.idcard ? `<div class="note info">${b.birthday
      ? `ℹ 当前生日为手动填写或已存在，<b>优先于</b>身份证识别结果（身份证生日：${b.idcardBirthday || '—'}）。`
      : `✅ 已从身份证自动识别生日：<b>${b.idcardBirthday}</b>`}</div>` : ''}
    <div class="field-divider"><b>联系方式（可多个）</b><span>点 × 可选择删除 / 标记弃用 / 取消</span></div>
    ${['phones:手机号', 'emails:邮箱', 'wechats:微信号'].map((x) => {
      const [k, lb2] = x.split(':');
      const arr = b[k] || [];
      const act = arr.filter((v) => v.ok).length;
      return `<div class="fld" style="margin-bottom:12px">
        <span>${lb2}（有效 ${act} / 共 ${arr.length}）</span>
        <div class="tf-chips">${arr.map((v, i) => `<span class="tf-chip on${v.ok ? '' : ' deprecated'}">${pfEsc(v.v)}${v.ok ? '' : ' (已弃用)'}
          <button class="x" onclick="pfAskDelContact('${k}',${v.id},${i})">×</button></span>`).join('')}</div>
        <div class="add-row"><input class="inp" id="cc_${k}" placeholder="输入${lb2}">
          <button class="btn ghost" onclick="pfAddContact('${k}')">添加</button></div>
      </div>`;
    }).join('')}
    <div class="field-divider"><b>语言能力</b></div>
    ${pfVocabBox('lang', b.langs, '语言（点常用词快速添加）')}
    `)}
    <div class="form-actions"><button class="btn primary" type="submit">保存基础信息</button></div>
  </form>`;
}

function pfModRel() {
  const r = PF.data.rel;
  return `<form data-pf-form="rel"><div class="field-grid">
    ${pfS('关系类型', r.type || '朋友', ['家人', '亲戚', '朋友', '同学', '同事', '客户', '导师', '邻居', '合作伙伴', '配偶'])}
    ${pfS('亲疏层级', r.level, ['核心', '重要', '普通', '弱连接'])}
    ${pfS('认识渠道', r.via || '朋友介绍', ['活动', '朋友介绍', '工作', '学校', '线上社群', '血缘'])}
    ${pfS('相处舒适度', r.score || '3', ['5', '4', '3', '2', '1'])}
    ${pfF('介绍人 / 共同联系人', r.intro)}
    ${pfF('相识时间', r.since)}
    ${pfF('相识场景', r.scene)}
    ${pfS('当前状态', r.status, ['活跃', '疏远', '失联', '合作中', '已终止'])}
  </div><div class="form-actions"><button class="btn primary" type="submit">保存</button></div></form>`;
}

function pfModEdu() {
  const list = PF.data.edus || [];
  return `<div class="note info" style="margin-bottom:14px">💡 除最高学历外，可添加多段教育与经历（在职攻读、进修、培训等）。</div>
    ${list.map((e, i) => `<div class="rep-box">
      <div class="rep-h"><b>教育经历 ${i + 1}</b><button class="icon-btn" onclick="pfDelEdu(${e.id})"><svg><use href="#i-x"/></svg></button></div>
      <div class="field-grid">
        ${pfF('学校', e.school)}${pfF('专业', e.major)}${pfS('学历', e.degree, PF.vocab.edu)}
        ${pfF('入学年份', e.start)}${pfF('毕业年份', e.end)}
        <label class="field" style="grid-column:1/-1"><span>重要经历</span><input data-edu="${e.id}" data-k="school" value="${pfEsc(e.school || '')}" style="display:none"></label>
      </div>
      <label class="field"><span>重要经历（交换 / 留学 / 培训）</span><input data-edu="${e.id}" data-k="story" value="${pfEsc(e.story || '')}"></label>
    </div>`).join('')}
    <div class="rep-box">
      <div class="rep-h"><b>新增教育经历</b></div>
      <div class="field-grid">
        ${pfF('学校', '')}${pfF('专业', '')}${pfS('学历', '本科', PF.vocab.edu)}
        ${pfF('入学年份', '')}${pfF('毕业年份', '')}
      </div>
      <label class="field"><span>重要经历</span><input id="eduStory" placeholder="选填"></label>
      <button class="btn" onclick="pfAddEdu()">+ 添加这段教育</button>
    </div>`;
}

function pfModWork() {
  const w = PF.data.work;
  return `<form data-pf-form="work"><div class="field-grid">
    ${pfF('公司', w.company)}${pfF('部门', w.dept)}${pfF('职位', w.title)}${pfF('职级', w.rank)}${pfF('工作城市', w.city)}
    ${pfF('擅长领域', w.field)}
  </div>
  <div class="field-divider"><b>可提供的资源</b><span>价值交换</span></div>
  <label class="field"><span>资源清单</span><textarea name="give" rows="2" placeholder="例：技术方案评审、内推资源、行业人脉">${pfEsc(w.give || '')}</textarea></label>
  <div class="field-divider"><b>行业影响力</b></div>
  <label class="field"><span>公众号 / 作品 / 演讲 / 专利</span><input name="infl" value="${pfEsc(w.infl || '')}"></label>
  <div class="field-divider"><b>合作边界</b></div>
  <label class="field"><span>哪些事可以合作，哪些不方便</span><textarea name="bound" rows="2">${pfEsc(w.bound || '')}</textarea></label>
  <div class="form-actions"><button class="btn primary" type="submit">保存</button></div></form>`;
}

function pfModFamily() {
  const f = PF.data.family;
  return `<form data-pf-form="family"><div class="field-grid">
    ${pfF('父亲', f.father)}${pfF('母亲', f.mother)}${pfF('配偶', f.spouse)}
    ${pfF('子女', f.child)}${pfF('兄弟姐妹', f.sibling)}${pfF('家庭居住地', f.live)}
  </div>
  <div class="field-divider"><b>家庭重要事件</b><span>结婚 / 生子 / 乔迁 / 生病 / 离世</span></div>
  <label class="field"><span>记录</span><textarea name="events" rows="2" placeholder="例：2019年乔迁、2024年孩子入学">${pfEsc(f.events || '')}</textarea></label>
  <div class="field-divider"><b>宠物</b></div>
  <label class="field"><span>名字 · 品种 · 生日 · 喜好</span><input name="pet" value="${pfEsc(f.pet || '')}" placeholder="例：猫「豆豆」· 英短 · 2021-04"></label>
  <div class="form-actions"><button class="btn primary" type="submit">保存</button></div></form>`;
}

function pfModPref() {
  const p = PF.data.pref;
  return `<form data-pf-form="pref">
    ${pfVocabBox('food', pfGetVocab('food', p.foods), '饮食偏好 / 忌口 / 过敏')}
    ${pfVocabBox('drink', pfGetVocab('drink', p.drinks), '饮品偏好')}
    ${pfVocabBox('size', pfGetVocab('size', p.size ? [p.size] : []), '穿衣尺码')}
    ${pfVocabBox('size', pfGetVocab('size2', p.shoes ? [p.shoes] : []), '鞋子尺码')}
    ${pfVocabBox('hobby', pfGetVocab('hobby', p.hobbies), '兴趣爱好')}
    <div class="field-divider"><b>生活方式与社交</b></div>
    ${pfF('作息与健康注意事项', p.life, '例：每周三晚跑步；23:30 前睡')}
    ${pfF('社交偏好', p.social, '例：偏好小聚，超过 5 人会累')}
    <div class="form-actions"><button class="btn primary" type="submit">保存</button></div></form>`;
}

function pfModTrait() {
  const t = PF.data.trait;
  return `<form data-pf-form="trait">
    ${pfVocabBox('trait', pfGetVocab('trait', t.tags), '性格标签')}
    <div class="field-divider"><b>沟通方式</b></div>
    <div class="field-grid">
      ${pfF('沟通风格', t.style, '例：直接，邮件优先')}
      ${pfF('回复习惯', t.reply)}
      ${pfF('价值观倾向', t.value)}
      ${pfS('相处舒适度', t.comfort || '3', ['5', '4', '3', '2', '1'])}
    </div>
    <div class="field-divider"><b>敏感话题或禁忌</b></div>
    <label class="field"><span>禁忌话题</span><textarea name="taboo" rows="2">${pfEsc(t.taboo || '')}</textarea></label>
    <div class="form-actions"><button class="btn primary" type="submit">保存</button></div></form>`;
}

function pfModInteract() {
  return `<div class="note info" style="margin-bottom:14px">💡 用<b>弹窗</b>追加记录，便于一次填完多项内容；保存后计入档案完整度与人物画像。</div>
    <button class="btn" onclick="pfOpenInteractModal()">+ 记一次互动</button>
    <div style="margin-top:14px">${PF.data.interacts.length} 条记录</div>`;
}
function pfModPromise() {
  return `<div class="note info" style="margin-bottom:14px">🔗 与「待办提醒」双向同步：在待办页可按人物筛选，日历中也可查看。下方可勾选同步。</div>
    <button class="btn" onclick="pfOpenPromiseModal()">+ 新增承诺</button>`;
}
function pfModMoney() {
  return `<div class="note info" style="margin-bottom:14px">🔗 与「我的账本」双向同步：记一笔即写一条账本流水（分类人情/借还款，备注 @姓名）。</div>
    <button class="btn" onclick="pfOpenMoneyModal()">+ 记一笔</button>`;
}
function pfModDates() {
  const d = PF.data.dates || {};
  return `<div class="note info" style="margin-bottom:14px">🔗 生日等关键日期会同步到「日历中心」显示（需在基础身份开启）。</div>
    <div class="field-grid">
      ${pfF('生日（月-日）', d.birth)}${pfF('纪念日', d.anniv)}
      ${pfF('入职日', d.work)}${pfF('相识日', d.meet)}
      ${pfF('节日问候', d.greet)}${pfF('定期联系频率', d.cycle)}
      ${pfF('最近联系', d.stale)}
    </div>
    <label class="field"><span>重要节点提醒</span><textarea id="dtNode" rows="2" placeholder="例：2026-11 面试节点">${pfEsc(d.node || '')}</textarea></label>
    <div class="form-actions"><button class="btn" onclick="toast('演示：日期已随档案保存')">保存</button></div>`;
}
function pfModFiles() {
  const files = PF.data.files || [];
  return `<div class="note info" style="margin-bottom:14px">💡 文件按人物文件夹存于 R2：<span class="r2-path">contacts/${PF.pid}/&lt;日期&gt;_&lt;随机&gt;_&lt;文件名&gt;</span></div>
    <div class="tf-chips" style="margin-bottom:12px"><span class="tf-chip on">contacts/${PF.pid}/</span><span class="tf-chip on">共 ${files.length} 个文件</span></div>
    <div class="file-grid">${files.map((f) => `<div class="file-box" onclick="pfOpenFile(${f.id})">
      <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
      <b>${pfEsc(f.name)}</b><small>${pfEsc(f.size || '')}</small>
      <div class="r2-path">${pfEsc(f.path)}</div>
      <button class="icon-btn" onclick="event.stopPropagation();pfDelFile(${f.id})"><svg><use href="#i-x"/></svg></button>
    </div>`).join('')}</div>
    <div class="drop" onclick="pfEl('pfFileInput').click()">点击选择文件上传（按人物文件夹自动归档到 R2）</div>
    <input type="file" id="pfFileInput" hidden>`;
}

// ===== 保存 =====
async function pfSaveModule(id, form) {
  const v = pfVals(form);
  const vv = pfVocabVals();
  if (id === 'base') {
    const payload = {
      id: PF.pid, name: v['姓名'], alias: v['别名 / 昵称'], gender: v['性别'],
      birthday: v['生日（公历）'], province: v['省份'], city: v['城市'], job: v['职业'],
      company: v['公司'], relation: v['关系'], level: v['亲疏层级'], status: v['关系状态'],
      showLunar: v['showLunar'] === 'on', native: v['籍贯'], page: v['主页 / 名片链接'],
      idcard: v['身份证号码'],
    };
    const res = await api('/api/profile/detail', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    if (res.ok) {
      if (vv.lang) await pfSaveVocab('lang', vv.lang);
      toast(res.fromIdcard ? `已保存，生日从身份证自动识别：${res.birthday}` : '已保存');
      await pfOpenProfile(PF.pid);
      await pfLoadOptions();
    }
    return;
  }
  if (id === 'pref') {
    const data = { foods: pfGetVocab('food'), drinks: pfGetVocab('drink'), hobbies: pfGetVocab('hobby'),
      size: pfGetVocab('size')[0] || '', shoes: pfGetVocab('size2')[0] || '', life: v['作息与健康注意事项'], social: v['社交偏好'] };
    await api('/api/profile/sections', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ person_id: PF.pid, section: 'pref', data }) });
    toast('已保存'); await pfOpenProfile(PF.pid); return;
  }
  if (id === 'trait') {
    const data = { tags: pfGetVocab('trait'), style: v['沟通风格'], reply: v['回复习惯'], value: v['价值观倾向'], comfort: v['相处舒适度'], taboo: v['taboo'] };
    await api('/api/profile/sections', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ person_id: PF.pid, section: 'trait', data }) });
    toast('已保存'); await pfOpenProfile(PF.pid); return;
  }
  const secMap = { rel: 'rel', work: 'work', family: 'family' };
  if (secMap[id]) {
    await api('/api/profile/sections', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ person_id: PF.pid, section: secMap[id], data: v }) });
    // rel 模块的部分字段同时写contacts 主表
    if (id === 'rel') {
      await api('/api/profile/detail', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: PF.pid, name: PF.data.base.name, relation: v['关系类型'], level: v['亲疏层级'], status: v['当前状态'] }) });
    }
    toast('已保存'); await pfOpenProfile(PF.pid); return;
  }
}

async function pfSaveVocab(kind, words) {
  for (const w of words) {
    await api('/api/vocab', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, word: w }) }).catch(() => {});
  }
}

// 联系方式
async function pfAddContact(kind) {
  const el = document.getElementById('cc_' + kind);
  const v = (el && el.value || '').trim();
  if (!v) return;
  const res = await api('/api/profile/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ person_id: PF.pid, kind, value: v }) });
  if (res.ok) { toast('已添加'); await pfOpenProfile(PF.pid); }
}
async function pfAskDelContact(kind, id, idx) {
  const arr = PF.data.base[kind] || [];
  const item = arr[idx] || arr.find((x) => String(x.id) === String(id));
  pfEl('handleTitle').textContent = '处理联系方式';
  pfEl('handleBody').innerHTML = `
    <div class="note info" style="margin-bottom:14px"><b>${pfEsc(item ? item.v : '')}</b><br>
      <span style="font-size:11.5px">当前状态：${item && item.ok ? '使用中' : '已弃用'}</span></div>
    <div class="handle-opts">
      <button class="handle-opt" onclick="pfDoDelContact('${kind}',${id},'delete')"><b>删除该项数据</b><small>适合填错了，此条记录将彻底移除</small></button>
      <button class="handle-opt" onclick="pfDoDelContact('${kind}',${id},'deprecate')"><b>已弃用，但保留记录</b><small>保留历史痕迹，后续显示为「(已弃用)」</small></button>
      ${item && item.ok ? '' : `<button class="handle-opt" onclick="pfDoDelContact('${kind}',${id},'restore')"><b>恢复使用</b><small>取消弃用标记</small></button>`}
      <button class="handle-opt cancel" onclick="pfCloseHandle()"><b>放弃操作</b><small>不做任何修改，关闭当前弹窗</small></button>
    </div>`;
  pfEl('handleModal').hidden = false;
}
async function pfDoDelContact(kind, id, act) {
  if (act === 'delete') {
    await api(`/api/profile/contacts?id=${id}`, { method: 'DELETE' });
    toast('已删除');
  } else {
    await api('/api/profile/contacts', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: Number(id), action: act }) });
    toast(act === 'deprecate' ? '已标记弃用，保留记录' : '已恢复使用');
  }
  pfCloseHandle();
  await pfOpenProfile(PF.pid);
}

// 教育
async function pfAddEdu() {
  const g = (n) => { const e = document.querySelector('#pfModBody [name="' + n + '"]:not([data-edu])'); return e ? e.value.trim() : ''; };
  const res = await api('/api/profile/edu', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ person_id: PF.pid, school: g('学校'), major: g('专业'),
      degree: g('学历'), start: g('入学年份'), end: g('毕业年份'),
      story: (document.getElementById('eduStory') || {}).value || '' }) });
  if (res.ok) { toast('已添加'); await pfOpenProfile(PF.pid); pfMod = 'edu'; pfRenderModule(); }
}
async function pfDelEdu(id) {
  if (!confirm('确定删除这段教育经历？')) return;
  await api(`/api/profile/edu?id=${id}`, { method: 'DELETE' });
  toast('已删除'); await pfOpenProfile(PF.pid); pfMod = 'edu'; pfRenderModule();
}

// 附件
function pfOpenFile(id) { window.open(`/api/profile/files?person_id=${PF.pid}&id=${id}`, '_blank'); }
async function pfDelFile(id) {
  if (!confirm('确定删除该附件？R2 中的文件也会一并删除。')) return;
  await api(`/api/profile/files?id=${id}`, { method: 'DELETE' });
  toast('已删除'); await pfOpenProfile(PF.pid);
}

window.pfPickMod = pfPickMod;
window.pfToggleMore = pfToggleMore;
window.pfQuickVocab = pfQuickVocab;
window.pfAddVocab = pfAddVocab;
window.pfRmVocab = pfRmVocab;
window.pfAddContact = pfAddContact;
window.pfAskDelContact = pfAskDelContact;
window.pfDoDelContact = pfDoDelContact;
window.pfAddEdu = pfAddEdu;
window.pfDelEdu = pfDelEdu;
window.pfOpenFile = pfOpenFile;
window.pfDelFile = pfDelFile;
window.pfEl = pfEl;
window.pfSaveModule = pfSaveModule;