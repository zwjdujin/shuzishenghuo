import { json, todayStr } from '../../_lib.js';
import { toArr, joinArr, nextBirthday, lunarBirthday, birthdayFromIdcard, ageOf } from '../_profile.js';

const LEVELS = ['核心', '重要', '普通', '弱连接'];
const STATUS = ['活跃', '疏远', '失联', '合作中', '已终止'];

// GET /api/profile?id=4 —— 完整档案（13 个模块一次性返回）
export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const id = Number(url.searchParams.get('id'));
  if (!id) return json({ error: '缺少联系人 id' }, 400);

  const c = (await env.DB.prepare('SELECT * FROM contacts WHERE id = ?').bind(id).first());
  if (!c) return json({ error: '联系人不存在' }, 404);

  const g = async (sql, ...b) => (await env.DB.prepare(sql).bind(...b).all()).results || [];
  const one = async (sql, ...b) => (await env.DB.prepare(sql).bind(...b).first()) || {};

  // 多联系方式
  const cs = await g('SELECT id,kind,value,deprecated FROM contact_contacts WHERE person_id = ? ORDER BY kind, deprecated, id', id);
  const pick = (kind) => cs.filter((x) => x.kind === kind).map((x) => ({ id: x.id, v: x.value, ok: x.deprecated ? 0 : 1 }));

  const [edu, rel, work, family, pref, trait, interacts, relatives, promises, files, money, todos] = await Promise.all([
    g('SELECT * FROM contact_edu WHERE person_id = ? ORDER BY sort_order, id', id),
    one('SELECT * FROM contact_rel WHERE person_id = ?', id),
    one('SELECT * FROM contact_work WHERE person_id = ?', id),
    one('SELECT * FROM contact_family WHERE person_id = ?', id),
    one('SELECT * FROM contact_pref WHERE person_id = ?', id),
    one('SELECT * FROM contact_trait WHERE person_id = ?', id),
    g('SELECT * FROM contact_interacts WHERE person_id = ? ORDER BY date DESC, id DESC', id),
    g('SELECT * FROM contact_relatives WHERE person_id = ? AND dead = 0 ORDER BY id', id),
    g('SELECT * FROM contact_promises WHERE person_id = ? ORDER BY done, due', id),
    g('SELECT * FROM contact_files WHERE person_id = ? ORDER BY id DESC', id),
    g('SELECT * FROM contact_money WHERE person_id = ? ORDER BY date DESC, id DESC', id),
    g("SELECT id,title,todo_date,todo_time,list,priority,done FROM todos WHERE person_id = ? AND done = 0 ORDER BY todo_date", id),
  ]);

  const birthday = c.birthday || c.idcard_birthday || '';
  const nb = nextBirthday(birthday);

  return json({
    base: {
      id: c.id, name: c.name, alias: c.alias || '', gender: c.gender || '',
      birthday, age: ageOf(birthday), showLunar: !!c.show_lunar,
      lunar: c.show_lunar ? lunarBirthday(birthday) : null,
      idcard: c.idcard || '', idcardBirthday: c.idcard_birthday || '',
      core: { phone: firstOf(cs, 'phones'), wechat: firstOf(cs, 'wechats') },
      phones: pick('phones'), emails: pick('emails'), wechats: pick('wechats'),
      langs: toArr(pref && pref.langs),
      native: c.native || '', page: c.page || '',
      note: c.note || '', province: c.province || '', city: c.city || '',
      job: c.job || '', company: c.company || '',
      nextBirthday: nb,
    },
    rel: { type: c.relation || '', level: c.level || '普通', status: c.status || '活跃',
      via: rel.via || '', intro: rel.intro || '', since: rel.since || '', scene: rel.scene || '', score: rel.score || '' },
    edus: edu.map((e) => ({ id: e.id, school: e.school || '', major: e.major || '', degree: e.degree || '', start: e.start_year || '', end: e.end_year || '', story: e.story || '' })),
    work: { company: work.company || c.company || '', dept: work.dept || '', title: work.title || c.job || '', rank: work.rank || '', city: work.city || c.city || '', field: work.field || '', give: work.give || '', infl: work.infl || '', bound: work.bound || '' },
    family: { father: family.father || '', mother: family.mother || '', spouse: family.spouse || '', child: family.child || '', sibling: family.sibling || '', live: family.live || '', events: family.events || '', pet: family.pet || '' },
    pref: { foods: toArr(pref.foods), drinks: toArr(pref.drinks), size: pref.size || '', shoes: pref.shoes || '', hobbies: toArr(pref.hobbies), life: pref.life || '', social: pref.social || '' },
    trait: { tags: toArr(trait.tags), style: trait.style || '', reply: trait.reply || '', taboo: trait.taboo || '', value: trait.value || '', comfort: trait.comfort || '' },
    interacts: interacts.map((i) => ({ id: i.id, date: i.date, kind: i.kind || '', place: i.place || '', who: i.who || '', topic: i.topic || '', quality: i.quality || '', summary: i.summary || '' })),
    relatives: relatives.map((r) => ({ id: r.id, name: r.name, kin: r.kin || '', note: r.note || '', refId: r.ref_id || null, linked: !!r.ref_id })),
    promises: promises.map((p) => ({ id: p.id, side: p.side || '对方', what: p.what, due: p.due || '', status: p.status || '未开始', note: p.note || '', todoId: p.todo_id || null, done: !!p.done })),
    files: files.map((f) => ({ id: f.id, name: f.name, size: f.size || '', path: f.r2_path })),
    money: money.map((m) => ({ id: m.id, type: m.type, amount: Number(m.amount), date: m.date, note: m.note || '', txnId: m.txn_id || null })),
    todos,
    meta: { levels: LEVELS, statuses: STATUS, today: todayStr() },
  });
}

// PUT /api/profile —— 保存核心字段（生日/身份证/别名等）
export async function onRequestPut(context) {
  const { env, request } = context;
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const id = Number(body.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  const name = String(body.name || '').trim();
  if (!name) return json({ error: '请填写姓名' }, 400);

  const idcard = String(body.idcard || '').trim();
  let idcardBday = '';
  if (idcard) {
    idcardBday = birthdayFromIdcard(idcard) || '';
    if (!idcardBday) return json({ error: '身份证格式不正确（应为 18 位）' }, 400);
  }
  // 生日优先级：手动填写 > 身份证解析
  const birthday = String(body.birthday || '').trim() || idcardBday || '';

  await env.DB.prepare(
    `UPDATE contacts SET name=?, alias=?, gender=?, birthday=?, province=?, city=?, idcard=?, idcard_birthday=?,
     show_lunar=?, job=?, company=?, relation=?, level=?, status=?, note=?, native=?, page=?
     WHERE id=?`
  ).bind(
    name,
    String(body.alias || '').trim() || null,
    body.gender === '男' || body.gender === '女' ? body.gender : null,
    birthday || null,
    String(body.province || '').trim() || null,
    String(body.city || '').trim() || null,
    idcard || null,
    idcardBday || null,
    body.showLunar ? 1 : 0,
    String(body.job || '').trim() || null,
    String(body.company || '').trim() || null,
    String(body.relation || '').trim() || null,
    LEVELS.includes(body.level) ? body.level : '普通',
    STATUS.includes(body.status) ? body.status : '活跃',
    String(body.note || '').trim() || null,
    String(body.native || '').trim() || null,
    String(body.page || '').trim() || null,
    id
  ).run();

  // 同步多联系方式的主项到 contacts 冗余字段（便于列表搜索）
  const phone = firstArrVal(body.phones) || null;
  await env.DB.prepare('UPDATE contacts SET phone=? WHERE id=?').bind(phone, id).run();

  return json({ ok: true, id, birthday, fromIdcard: !String(body.birthday || '').trim() && !!idcardBday });
}

function firstOf(rows, kind) {
  const r = rows.find((x) => x.kind === kind && !x.deprecated);
  return r ? r.value : '';
}
function firstArrVal(arr) {
  if (!Array.isArray(arr)) return '';
  const ok = arr.find((x) => !x.deprecated && x.value);
  return ok ? ok.value : '';
}