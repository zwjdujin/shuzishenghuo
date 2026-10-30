import { json } from '../../_lib.js';
import { parseBirthdayBody, nextBirthdayOf, ageOfContact, toLunar } from '../_profile.js';

const MARRIAGES = ['已婚', '未婚', '离婚', '丧偶'];
// 名字六字段：任选其一必填
const NAME_FIELDS = [
  ['first_name', 'firstName'],
  ['nickname', 'nickname'],
  ['childhood_name', 'childhoodName'],
  ['former_name', 'formerName'],
  ['english_name', 'englishName'],
  ['alias', 'alias'],
];

// CSV 存储：词/组里不允许出现逗号
const csvOf = (v) => (Array.isArray(v) ? v : String(v || '').split(','))
  .map((x) => String(x).replace(/[,，]/g, '').trim()).filter(Boolean).slice(0, 30)
  .map((x) => x.slice(0, 20)).join(',');

function displayName(b) {
  for (const [, key] of NAME_FIELDS) {
    const v = String(b[key] || '').trim();
    if (v) return v;
  }
  return '';
}

/** 合并请求体中的基础字段（PUT 局部更新：只动传入的字段） */
async function mergeBase(env, body, existing) {
  const cur = existing || {};
  const get = (col, key) => (body[key] !== undefined ? body[key] : cur[col]);
  const merged = {};
  for (const [col, key] of NAME_FIELDS) merged[key] = String(get(col, key) || '').trim();
  const sets = {};

  // 名字字段有任一传入 → 重算显示名，并校验至少留有一个名字
  const nameTouched = NAME_FIELDS.some(([, key]) => body[key] !== undefined);
  if (nameTouched) {
    const display = displayName(merged);
    if (!display) return { error: '姓名、昵称、小名、曾用名、英文名、别名至少填一项' };
    sets.name = display;
    for (const [col, key] of NAME_FIELDS) sets[col] = merged[key] || null;
  }

  if (body.gender !== undefined) {
    const g = String(body.gender || '').trim();
    // 「其他」为旧版取值，保留兼容以便旧记录可编辑保存
    if (!['男', '女', '未知', '其他'].includes(g)) return { error: '请选择性别' };
    sets.gender = g;
  }

  // 生日：传了生日相关任一字段就整体重写生日三元组
  const birthdayTouched = ['birthdayType', 'birthdayCalendar', 'birthYear', 'birthMonth', 'birthDay']
    .some((k) => body[k] !== undefined);
  if (birthdayTouched) {
    const bd = parseBirthdayBody({
      birthdayType: body.birthdayType,
      birthdayCalendar: body.birthdayCalendar,
      birthYear: body.birthYear,
      birthMonth: body.birthMonth,
      birthDay: body.birthDay,
    });
    if (bd.error) return { error: bd.error };
    Object.assign(sets, bd.data);
  }

  if (body.birthdayRemind !== undefined) sets.birthday_remind = body.birthdayRemind ? 1 : 0;
  if (body.isDeceased !== undefined) sets.is_deceased = body.isDeceased ? 1 : 0;
  if (body.tags !== undefined) sets.tags = csvOf(body.tags);
  if (body.groups !== undefined) sets.peer_groups = csvOf(body.groups);
  if (body.marriage !== undefined) sets.marriage = MARRIAGES.includes(body.marriage) ? body.marriage : '';
  if (body.note !== undefined) sets.note = String(body.note || '').trim() || null;

  // v0.6.0 个人信息 · 尺码：PUT {sizes:{clothing,shoe,ring,bracelet}} 局部更新（空串=清除）
  if (body.sizes && typeof body.sizes === 'object') {
    const SZ = [['clothing', 'size_clothing'], ['shoe', 'size_shoe'], ['ring', 'size_ring'], ['bracelet', 'size_bracelet']];
    for (const [key, col] of SZ) {
      if (body.sizes[key] !== undefined) sets[col] = String(body.sizes[key]).trim().slice(0, 20) || null;
    }
  }

  if (body.referrerId !== undefined) {
    const rid = Number(body.referrerId) || null;
    if (rid) {
      if (existing && rid === existing.id) return { error: '引荐人不能是自己' };
      const ref = await env.DB.prepare('SELECT id FROM contacts WHERE id=?').bind(rid).first();
      if (!ref) return { error: '引荐人不存在' };
    }
    sets.referrer_id = rid;
  }
  return { sets };
}

// GET /api/profile/detail?id=4 —— 完整档案
export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const id = Number(url.searchParams.get('id'));
  if (!id) return json({ error: '缺少联系人 id' }, 400);

  const c = await env.DB.prepare('SELECT * FROM contacts WHERE id = ?').bind(id).first();
  if (!c) return json({ error: '联系人不存在' }, 404);

  const g = async (sql, ...b) => (await env.DB.prepare(sql).bind(...b).all()).results || [];

  // 联系方式（电话/邮箱/地址/QQ/微信，带备注标签）
  const cc = await g('SELECT id, kind, value, label FROM contact_contacts WHERE person_id = ? ORDER BY kind, id', id);
  const methods = { phones: [], emails: [], addresses: [], qq: [], wechat: [] };
  cc.forEach((x) => { if (methods[x.kind]) methods[x.kind].push({ id: x.id, value: x.value, label: x.label || '' }); });

  const work = (await env.DB.prepare('SELECT company, position FROM contact_work WHERE person_id = ?').bind(id).first()) || {};
  const edus = await g('SELECT * FROM contact_edu WHERE person_id = ? ORDER BY sort_order, id', id);
  const relatives = await g('SELECT * FROM contact_relatives WHERE person_id = ? ORDER BY id', id);
  const pets = await g('SELECT * FROM rel_pets WHERE person_id = ? ORDER BY id', id);

  // 家庭关系里关联到的联系人姓名
  const refIds = relatives.map((r) => r.ref_id).filter(Boolean);
  let refNames = {};
  if (refIds.length) {
    const ph = refIds.map(() => '?').join(',');
    (await env.DB.prepare(`SELECT id, name FROM contacts WHERE id IN (${ph})`).bind(...refIds).all()).results
      .forEach((x) => { refNames[x.id] = x.name; });
  }
  const referrer = c.referrer_id
    ? (await env.DB.prepare('SELECT id, name FROM contacts WHERE id = ?').bind(c.referrer_id).first()) : null;

  const nb = c.is_deceased ? null : nextBirthdayOf(c);
  // 农历/阳历生日展示
  let birthText = '';
  if (c.birthday_type === 'full') birthText = `${c.birth_year} 年`;
  else if (c.birthday_type === 'monthday') birthText = '每年';
  if (c.birthday_type) {
    const md = c.birthday_calendar === 'lunar'
      ? `农历${c.birth_month} 月 ${c.birth_day} 日`
      : `${c.birth_month} 月 ${c.birth_day} 日`;
    birthText = birthText ? `${birthText} ${md}` : md;
  }
  let lunarText = '';
  if (c.birthday_type && c.birthday_calendar === 'solar') {
    const l = toLunar(new Date(Date.UTC(
      c.birthday_type === 'full' ? c.birth_year : 2001, c.birth_month - 1, c.birth_day)));
    if (l) lunarText = `农历${l.monthName}${l.dayName}`;
  }

  const dict = async (kind) => (await env.DB.prepare('SELECT word FROM vocab WHERE kind=? ORDER BY hits DESC, word').bind(kind).all()).results.map((x) => x.word);

  // v0.5.33 档案卷宗：自定义段落载荷（contact_sections，键 → data）
  let sections = {};
  try {
    const sRows = (await env.DB.prepare('SELECT sec_key, data FROM contact_sections WHERE contact_id=?').bind(id).all()).results || [];
    sRows.forEach((r) => { try { sections[r.sec_key] = JSON.parse(r.data) || {}; } catch (_) { sections[r.sec_key] = {}; } });
  } catch (_) { /* 表未迁移忽略 */ }

  return json({
    base: {
      id: c.id,
      firstName: c.first_name || '', nickname: c.nickname || '', childhoodName: c.childhood_name || '',
      formerName: c.former_name || '', englishName: c.english_name || '', alias: c.alias || '',
      name: c.name, gender: c.gender || '',
      birthdayType: c.birthday_type || '', birthdayCalendar: c.birthday_calendar || 'solar',
      birthYear: c.birth_year, birthMonth: c.birth_month, birthDay: c.birth_day,
      birthText, lunarText,
      birthdayRemind: !!c.birthday_remind, isDeceased: !!c.is_deceased,
      tags: String(c.tags || '').split(',').filter(Boolean),
      groups: String(c.peer_groups || '').split(',').filter(Boolean),
      referrer: referrer ? { id: referrer.id, name: referrer.name } : null,
      marriage: c.marriage || '', note: c.note || '',
      age: ageOfContact(c), nextBirthday: nb,
      // v0.6.0 个人信息 · 尺码（单值随档）
      sizes: {
        clothing: c.size_clothing || '', shoe: c.size_shoe || '',
        ring: c.size_ring || '', bracelet: c.size_bracelet || '',
      },
    },
    methods,
    work: { company: work.company || '', position: work.position || '' },
    edus: edus.map((e) => ({
      id: e.id, school: e.school || '', major: e.major || '', degree: e.degree || '',
      start: e.start_year || '', end: e.end_year || '', story: e.story || '',
    })),
    relatives: relatives.map((r) => ({
      id: r.id, kin: r.kin || '', name: r.name || '',
      refId: r.ref_id || null, refName: r.ref_id ? (refNames[r.ref_id] || '') : '',
    })),
    pets: pets.map((p) => ({ id: p.id, species: p.species || '', name: p.name || '', memorialDate: p.memorial_date || '' })),
    sections,
    meta: {
      genders: ['男', '女', '未知'],
      marriages: MARRIAGES,
      kins: await dict('rel_kin'),
      companies: await dict('rel_company'),
      positions: await dict('rel_position'),
      petSpecies: await dict('pet_species'),
      contactLabels: ['个人', '工作', '家庭', '公司'],
    },
  });
}

// POST /api/profile/detail —— 新建联系人
export async function onRequestPost(context) {
  const { env, request } = context;
  let body = {};
  try { body = await request.json(); } catch (_) { return json({ error: '请求格式不正确' }, 400); }

  const merged = await mergeBase(env, body, null);
  if (merged.error) return json({ error: merged.error }, 400);
  const sets = merged.sets;
  if (!sets.name) return json({ error: '姓名、昵称、小名、曾用名、英文名、别名至少填一项' }, 400);
  if (!sets.gender) return json({ error: '请选择性别' }, 400);

  const cols = ['name', ...NAME_FIELDS.map(([c]) => c), 'gender',
    'birthday_type', 'birthday_calendar', 'birth_year', 'birth_month', 'birth_day',
    'birthday_remind', 'is_deceased', 'tags', 'peer_groups', 'referrer_id', 'marriage', 'note'];
  // 未传字段按列默认值补齐（这些列是 NOT NULL，不能绑 null）
  const DEFAULTS = {
    gender: '', birthday_type: '', birthday_calendar: 'solar',
    birthday_remind: 0, is_deceased: 0, tags: '', peer_groups: '', marriage: '',
  };
  const vals = cols.map((k) => (sets[k] !== undefined ? sets[k] : (k in DEFAULTS ? DEFAULTS[k] : null)));
  const res = await env.DB.prepare(
    `INSERT INTO contacts(${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`
  ).bind(...vals).run();
  const id = res.meta && res.meta.last_row_id;

  // 建档时同步录入的联系方式（可选）
  if (Array.isArray(body.methods)) {
    for (const m of body.methods) {
      const kind = String(m.kind || '');
      const value = String(m.value || '').trim();
      if (!['phones', 'emails', 'addresses'].includes(kind) || !value) continue;
      await env.DB.prepare('INSERT INTO contact_contacts(person_id, kind, value, label) VALUES (?,?,?,?)')
        .bind(id, kind, value.slice(0, 100), String(m.label || '').trim().slice(0, 20) || null).run();
    }
    await syncPrimaryPhone(env, id);
  }
  return json({ ok: true, id }, 201);
}

// PUT /api/profile/detail —— 更新基础信息（只更新传入字段）
export async function onRequestPut(context) {
  const { env, request } = context;
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const id = Number(body.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  const existing = await env.DB.prepare('SELECT * FROM contacts WHERE id = ?').bind(id).first();
  if (!existing) return json({ error: '联系人不存在' }, 404);

  const merged = await mergeBase(env, body, existing);
  if (merged.error) return json({ error: merged.error }, 400);
  const sets = merged.sets;
  const cols = Object.keys(sets);
  if (cols.length) {
    await env.DB.prepare(`UPDATE contacts SET ${cols.map((k) => `${k}=?`).join(', ')} WHERE id=?`)
      .bind(...cols.map((k) => sets[k]), id).run();
  }
  return json({ ok: true, id });
}

/** 主电话冗余同步：取第一个电话写入 contacts.phone（列表/搜索展示用） */
export async function syncPrimaryPhone(env, personId) {
  const row = await env.DB.prepare(
    "SELECT value FROM contact_contacts WHERE person_id=? AND kind='phones' ORDER BY id LIMIT 1"
  ).bind(personId).first();
  await env.DB.prepare('UPDATE contacts SET phone=? WHERE id=?').bind(row ? row.value : null, personId).run();
}
