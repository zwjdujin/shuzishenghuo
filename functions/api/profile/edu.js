import { json } from '../../_lib.js';

// ===== 教育经历（可多段） =====
// POST /api/profile/edu  新增一段
export async function onRequestPost(context) {
  const { env, request } = context;
  let b = {};
  try { b = await request.json(); } catch (_) {}
  const personId = Number(b.person_id);
  if (!personId) return json({ error: '缺少 person_id' }, 400);
  const max = await env.DB.prepare('SELECT IFNULL(MAX(sort_order),0) m FROM contact_edu WHERE person_id=?').bind(personId).first();
  const res = await env.DB.prepare(
    'INSERT INTO contact_edu(person_id,school,major,degree,start_year,end_year,story,sort_order) VALUES (?,?,?,?,?,?,?,?)'
  ).bind(personId, b.school || null, b.major || null, b.degree || null,
         b.start || null, b.end || null, b.story || null, (max && max.m ? max.m : 0) + 1).run();
  return json({ ok: true, id: res.meta && res.meta.last_row_id }, 201);
}

// PUT /api/profile/edu  更新某段
export async function onRequestPut(context) {
  const { env, request } = context;
  let b = {};
  try { b = await request.json(); } catch (_) {}
  const id = Number(b.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  await env.DB.prepare(
    'UPDATE contact_edu SET school=?,major=?,degree=?,start_year=?,end_year=?,story=? WHERE id=?'
  ).bind(b.school || null, b.major || null, b.degree || null, b.start || null, b.end || null, b.story || null, id).run();
  return json({ ok: true, id });
}

// DELETE /api/profile/edu?id=3
export async function onRequestDelete(context) {
  const { env, request } = context;
  const u = new URL(request.url);
  const id = Number(u.searchParams.get('id'));
  if (!id) return json({ error: '缺少 id' }, 400);
  await env.DB.prepare('DELETE FROM contact_edu WHERE id=?').bind(id).run();
  return json({ ok: true, id });
}