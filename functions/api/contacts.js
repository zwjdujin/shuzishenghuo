import { json, todayStr } from '../_lib.js';

const RELATIONS = ['家人', '亲戚', '朋友', '同事', '同学', '其他'];

// 计算生日的下一次发生日期（今年若已过则取明年）
function nextBirthday(birthday) {
  if (!birthday) return null;
  const b = String(birthday);
  // 兼容 YYYY-MM-DD 与 MM-DD 两种写法
  let md = null;
  let birthYear = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(b)) {
    md = b.slice(5);
    birthYear = Number(b.slice(0, 4));
  } else if (/^\d{2}-\d{2}$/.test(b)) {
    md = b;
  } else if (/^\d{4}-\d{2}$/.test(b)) {
    md = b.slice(5) + '-01';
  }
  if (!md) return null;

  const now = new Date();
  const y = now.getFullYear();
  const mk = (year) => {
    const [mm, dd] = md.split('-').map(Number);
    return new Date(year, mm - 1, dd);
  };
  let nxt = mk(y);
  if (nxt < new Date(y, now.getMonth(), now.getDate())) nxt = mk(y + 1);

  // 距今天数
  const today = new Date(y, now.getMonth(), now.getDate());
  const days = Math.round((nxt - today) / 86400000);

  let age = null;
  if (birthYear) {
    age = nxt.getFullYear() - birthYear;
    // 若今年生日还没到，明年的年龄应为今年年龄
    if (nxt.getFullYear() === y && nxt < today) age = y - birthYear;
  }
  return { date: `${nxt.getFullYear()}-${String(nxt.getMonth() + 1).padStart(2, '0')}-${String(nxt.getDate()).padStart(2, '0')}`, days, age, md };
}

// GET /api/contacts —— 联系人列表（含生日倒计时），或?birthdays=1 只返回近期生日
export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const rows = (
    await env.DB.prepare(
      'SELECT id,name,relation,birthday,phone,note,show_in_calendar FROM contacts ORDER BY (birthday IS NULL), name ASC'
    ).all()
  ).results || [];

  const contacts = rows.map((r) => {
    const nb = nextBirthday(r.birthday);
    return {
      id: r.id,
      name: r.name,
      relation: r.relation || '',
      birthday: r.birthday || '',
      phone: r.phone || '',
      note: r.note || '',
      showInCalendar: !!r.show_in_calendar,
      nextBirthday: nb ? nb.date : '',
      daysLeft: nb ? nb.days : null,
      age: nb ? nb.age : null,
    };
  });

  if (url.searchParams.get('birthdays') === '1') {
    const upcoming = contacts
      .filter((c) => c.daysLeft !== null && c.daysLeft <= 60)
      .sort((a, b) => a.daysLeft - b.daysLeft);
    return json({ upcoming, relations: RELATIONS });
  }

  return json({ contacts, relations: RELATIONS, today: todayStr() });
}

function parseBody(body) {
  return {
    name: String(body.name || '').trim(),
    relation: RELATIONS.includes(body.relation) ? body.relation : '',
    birthday: String(body.birthday || '').trim() || null,
    phone: String(body.phone || '').trim() || null,
    note: String(body.note || '').trim() || null,
    show: body.showInCalendar ? 1 : 0,
  };
}

// POST /api/contacts —— 新增联系人
export async function onRequestPost(context) {
  const { env, request } = context;
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const d = parseBody(body);
  if (!d.name) return json({ error: '请填写姓名' }, 400);

  const res = await env.DB.prepare(
    'INSERT INTO contacts(name, relation, birthday, phone, note, show_in_calendar) VALUES (?,?,?,?,?,?)'
  )
    .bind(d.name, d.relation, d.birthday, d.phone, d.note, d.show)
    .run();
  const id = res.meta && res.meta.last_row_id ? res.meta.last_row_id : null;
  return json({ ok: true, id, contact: { id, ...d } }, 201);
}

// PUT /api/contacts —— 编辑联系人
export async function onRequestPut(context) {
  const { env, request } = context;
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const id = Number(body.id);
  if (!id) return json({ error: '缺少联系人 ID' }, 400);
  const d = parseBody(body);
  if (!d.name) return json({ error: '请填写姓名' }, 400);

  await env.DB.prepare(
    'UPDATE contacts SET name=?, relation=?, birthday=?, phone=?, note=?, show_in_calendar=? WHERE id=?'
  )
    .bind(d.name, d.relation, d.birthday, d.phone, d.note, d.show, id)
    .run();
  return json({ ok: true, id });
}