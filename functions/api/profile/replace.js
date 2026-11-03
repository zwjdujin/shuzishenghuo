import { json } from '../../_lib.js';
import { syncPrimaryPhone, mergeBase } from './detail.js';

// ===== 编辑器整段保存（v0.5.44；v0.5.47 扩展）=====
// PUT /api/profile/replace  body: { person_id, contacts?, edus?, relatives?, pets?, base?, work?, sections? }
// 数组字段提供即整表替换：先清后建放在同一个 DB.batch 内原子完成，
// 任一步失败整体回滚 —— 替代旧版「逐条 DELETE 再逐条 POST」的多次请求
// （中途失败会留下半清空状态，造成该段资料丢失）。
// v0.5.47 扩展（同批原子）：
//   base     —— 身份标识字段（复用 detail.js mergeBase 的同一套校验，contacts UPDATE）
//   work     —— {company, position}（contact_work UPSERT）
//   sections —— [{key, data}]（contact_sections UPSERT，每段 ≤24KB，与 /api/profile/sections 同规则）
//   五个编辑器（身份/职务/联络/教育/居住）由此全部收敛为单请求保存。
// 未提供的字段不动对应数据。响应 counts 为实际写入行数。
const clean = (s, max) => String(s || '').trim().slice(0, max);
const METHOD_KINDS = ['phones', 'emails', 'addresses', 'qq', 'wechat'];
const MAX_SECTION = 24 * 1024;

export async function onRequestPut(context) {
  const { env, request } = context;
  let b = {};
  try { b = await request.json(); } catch (_) { return json({ error: '请求格式不正确' }, 400); }
  const personId = Number(b.person_id);
  if (!personId) return json({ error: '缺少 person_id' }, 400);
  if (!(await env.DB.prepare('SELECT id FROM contacts WHERE id=?').bind(personId).first())) {
    return json({ error: '联系人不存在' }, 404);
  }

  // ---- 先全部清洗校验，通过后才执行替换 ----
  let contacts = null, edus = null, relatives = null, pets = null;

  // v0.5.47 base：身份标识（mergeBase 校验失败整体 400，不影响已存数据）
  let baseSets = null;
  if (b.base && typeof b.base === 'object' && !Array.isArray(b.base)) {
    const existing = await env.DB.prepare('SELECT * FROM contacts WHERE id=?').bind(personId).first();
    const merged = await mergeBase(env, b.base, existing);
    if (merged.error) return json({ error: merged.error }, 400);
    if (merged.sets && Object.keys(merged.sets).length) baseSets = merged.sets;
  }

  // v0.5.47 work：公司/职位
  let work = null;
  if (b.work && typeof b.work === 'object' && !Array.isArray(b.work)) {
    work = { company: clean(b.work.company, 40) || null, position: clean(b.work.position, 40) || null };
  }

  // v0.5.47 sections：自定义段落（与 /api/profile/sections 同规则）
  let sections = null;
  if (Array.isArray(b.sections)) {
    sections = [];
    for (const s of b.sections) {
      const key = String((s && s.key) || '').trim();
      const data = s && s.data && typeof s.data === 'object' ? s.data : {};
      const dataStr = JSON.stringify(data);
      if (!key) return json({ error: '段落缺少 key' }, 400);
      if (dataStr.length > MAX_SECTION) return json({ error: '段落「' + key + '」内容过大（上限 24KB）' }, 400);
      sections.push({ key, dataStr });
    }
  }

  if (Array.isArray(b.contacts)) {
    contacts = [];
    const seen = new Set();
    for (const r of b.contacts) {
      const kind = String((r && r.kind) || '');
      const value = clean(r && r.value, 100);
      if (!value) continue;
      if (!METHOD_KINDS.includes(kind)) return json({ error: '未知的联络方式类型：' + kind }, 400);
      const dedupe = kind + '\u0000' + value;
      if (seen.has(dedupe)) continue;   // 同类型同内容去重（与单条 POST 的唯一性约定一致）
      seen.add(dedupe);
      contacts.push({ kind, value, label: clean(r && r.label, 20) || null });
    }
  }

  if (Array.isArray(b.edus)) {
    edus = [];
    b.edus.forEach((e, i) => {
      const school = clean(e && e.school, 60);
      if (!school) return;
      edus.push({
        school,
        major: clean(e && e.major, 60) || null,
        degree: clean(e && e.degree, 20) || null,
        start: clean(e && e.start, 10) || null,
        end: clean(e && e.end, 10) || null,
        story: clean(e && e.story, 500) || null,
        sort: i + 1,
      });
    });
  }

  if (Array.isArray(b.relatives)) {
    relatives = [];
    for (const r of b.relatives) {
      const kin = clean(r && r.kin, 20);
      const name = clean(r && r.name, 30);
      let refId = Number(r && r.ref_id) || null;
      if (!kin) continue;
      if (refId) {
        // 与单条 POST 的 resolve() 行为一致：关联了联系人就以对方档案姓名为准
        const t = await env.DB.prepare('SELECT id, name FROM contacts WHERE id=?').bind(refId).first();
        if (!t) return json({ error: '家庭成员关联的联系人不存在' }, 400);
        refId = t.id;
        relatives.push({ kin, name: t.name || name, refId });
        continue;
      }
      if (!name) continue;
      relatives.push({ kin, name, refId: null });
    }
  }

  if (Array.isArray(b.pets)) {
    pets = [];
    for (const p of b.pets) {
      const species = clean(p && p.species, 20);
      const name = clean(p && p.name, 20);
      if (!species || !name) continue;
      pets.push({ species, name, memorial: clean(p && p.memorial_date, 10) || null });
    }
  }

  if (!contacts && !edus && !relatives && !pets && !baseSets && !work && !sections) {
    return json({ error: '没有需要保存的数据' }, 400);
  }

  // ---- batch 原子保存：要么全部成功，要么全部不动 ----
  const stmts = [];
  if (baseSets) {
    const cols = Object.keys(baseSets);
    stmts.push(env.DB.prepare(
      `UPDATE contacts SET ${cols.map((k) => `${k}=?`).join(', ')} WHERE id=?`
    ).bind(...cols.map((k) => baseSets[k]), personId));
  }
  if (work) {
    stmts.push(env.DB.prepare(
      `INSERT INTO contact_work(person_id, company, position) VALUES (?,?,?)
       ON CONFLICT(person_id) DO UPDATE SET company=excluded.company, position=excluded.position`
    ).bind(personId, work.company, work.position));
  }
  if (contacts) {
    stmts.push(env.DB.prepare('DELETE FROM contact_contacts WHERE person_id=?').bind(personId));
    contacts.forEach((r) => stmts.push(env.DB.prepare(
      'INSERT INTO contact_contacts(person_id, kind, value, label) VALUES (?,?,?,?)'
    ).bind(personId, r.kind, r.value, r.label)));
  }
  if (edus) {
    stmts.push(env.DB.prepare('DELETE FROM contact_edu WHERE person_id=?').bind(personId));
    edus.forEach((r) => stmts.push(env.DB.prepare(
      'INSERT INTO contact_edu(person_id, school, major, degree, start_year, end_year, story, sort_order) VALUES (?,?,?,?,?,?,?,?)'
    ).bind(personId, r.school, r.major, r.degree, r.start, r.end, r.story, r.sort)));
  }
  if (relatives) {
    stmts.push(env.DB.prepare('DELETE FROM contact_relatives WHERE person_id=?').bind(personId));
    relatives.forEach((r) => stmts.push(env.DB.prepare(
      'INSERT INTO contact_relatives(person_id, kin, name, ref_id) VALUES (?,?,?,?)'
    ).bind(personId, r.kin, r.name, r.refId)));
  }
  if (pets) {
    stmts.push(env.DB.prepare('DELETE FROM rel_pets WHERE person_id=?').bind(personId));
    pets.forEach((r) => stmts.push(env.DB.prepare(
      'INSERT INTO rel_pets(person_id, species, name, memorial_date) VALUES (?,?,?,?)'
    ).bind(personId, r.species, r.name, r.memorial)));
  }
  if (sections) {
    sections.forEach((s) => stmts.push(env.DB.prepare(
      `INSERT INTO contact_sections(contact_id, sec_key, data) VALUES (?,?,?)
       ON CONFLICT(contact_id, sec_key) DO UPDATE SET data=excluded.data, updated_at=datetime('now','localtime')`
    ).bind(personId, s.key, s.dataStr)));
  }
  await env.DB.batch(stmts);

  // 词库沉淀与主电话同步（与单条接口行为一致；失败不影响已完成的保存）
  try {
    if (work) {
      if (work.company) {
        await env.DB.prepare('INSERT INTO vocab(kind, word) VALUES (?, ?) ON CONFLICT(kind, word) DO UPDATE SET hits = hits + 1')
          .bind('rel_company', work.company).run();
      }
      if (work.position) {
        await env.DB.prepare('INSERT INTO vocab(kind, word) VALUES (?, ?) ON CONFLICT(kind, word) DO UPDATE SET hits = hits + 1')
          .bind('rel_position', work.position).run();
      }
    }
    if (relatives && relatives.length) {
      const seen = new Set();
      for (const r of relatives) {
        if (seen.has(r.kin)) continue;
        seen.add(r.kin);
        await env.DB.prepare('INSERT INTO vocab(kind, word) VALUES (?, ?) ON CONFLICT(kind, word) DO UPDATE SET hits = hits + 1')
          .bind('rel_kin', r.kin).run();
      }
    }
    if (pets && pets.length) {
      const seen = new Set();
      for (const r of pets) {
        if (seen.has(r.species)) continue;
        seen.add(r.species);
        await env.DB.prepare('INSERT INTO vocab(kind, word) VALUES (?, ?) ON CONFLICT(kind, word) DO UPDATE SET hits = hits + 1')
          .bind('pet_species', r.species).run();
      }
    }
  } catch (_) { /* 词库失败忽略 */ }
  if (contacts) { try { await syncPrimaryPhone(env, personId); } catch (_) {} }

  return json({
    ok: true,
    counts: {
      contacts: contacts ? contacts.length : null,
      edus: edus ? edus.length : null,
      relatives: relatives ? relatives.length : null,
      pets: pets ? pets.length : null,
      base: baseSets ? Object.keys(baseSets).length : null,
      work: work ? 1 : null,
      sections: sections ? sections.length : null,
    },
  });
}
