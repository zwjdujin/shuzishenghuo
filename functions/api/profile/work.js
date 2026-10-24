import { json } from '../../_lib.js';

// ===== 公司/组织与职位（值可多人共用；候选词存词库 rel_company / rel_position） =====
const clean = (s, max) => String(s || '').trim().slice(0, 40);

// PUT /api/profile/work {person_id, company, position} —— UPSERT
export async function onRequestPut(context) {
  const { env, request } = context;
  let b = {};
  try { b = await request.json(); } catch (_) {}
  const personId = Number(b.person_id);
  if (!personId) return json({ error: '缺少 person_id' }, 400);
  if (!(await env.DB.prepare('SELECT id FROM contacts WHERE id=?').bind(personId).first())) {
    return json({ error: '联系人不存在' }, 404);
  }

  const company = clean(b.company, 40);
  const position = clean(b.position, 40);
  if (company) {
    await env.DB.prepare('INSERT INTO vocab(kind, word) VALUES (?, ?) ON CONFLICT(kind, word) DO UPDATE SET hits = hits + 1')
      .bind('rel_company', company).run();
  }
  if (position) {
    await env.DB.prepare('INSERT INTO vocab(kind, word) VALUES (?, ?) ON CONFLICT(kind, word) DO UPDATE SET hits = hits + 1')
      .bind('rel_position', position).run();
  }

  const exists = await env.DB.prepare('SELECT person_id FROM contact_work WHERE person_id = ?').bind(personId).first();
  if (exists) {
    await env.DB.prepare('UPDATE contact_work SET company=?, position=? WHERE person_id=?')
      .bind(company || null, position || null, personId).run();
  } else {
    await env.DB.prepare('INSERT INTO contact_work(person_id, company, position) VALUES (?,?,?)')
      .bind(personId, company || null, position || null).run();
  }
  return json({ ok: true, person_id: personId });
}
