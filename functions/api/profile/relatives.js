import { json } from '../../_lib.js';

// ===== 人物关联（父亲/母亲/配偶/子女…，ref_id 可跳转） =====

// POST /api/profile/relatives {person_id, name, kin, note, ref_id}
export async function onRequestPost(context) {
  const { env, request } = context;
  let b = {};
  try { b = await request.json(); } catch (_) {}
  const personId = Number(b.person_id);
  const name = String(b.name || '').trim();
  if (!personId || !name) return json({ error: '请填写姓名' }, 400);
  const refId = Number(b.ref_id) || null;
  // 关联他人时，取对方真实姓名，避免不同步
  let finalName = name;
  if (refId) {
    const t = await env.DB.prepare('SELECT name FROM contacts WHERE id=?').bind(refId).first();
    if (t) finalName = t.name;
  }
  const res = await env.DB.prepare(
    'INSERT INTO contact_relatives(person_id,name,kin,note,ref_id) VALUES (?,?,?,?,?)'
  ).bind(personId, finalName, b.kin || null, b.note || null, refId).run();
  return json({ ok: true, id: res.meta && res.meta.last_row_id, name: finalName }, 201);
}

// PUT /api/profile/relatives {id, name, kin, note, ref_id}
export async function onRequestPut(context) {
  const { env, request } = context;
  let b = {};
  try { b = await request.json(); } catch (_) {}
  const id = Number(b.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  const refId = Number(b.ref_id) || null;
  let finalName = String(b.name || '').trim();
  if (refId) {
    const t = await env.DB.prepare('SELECT name FROM contacts WHERE id=?').bind(refId).first();
    if (t) finalName = t.name;
  }
  await env.DB.prepare('UPDATE contact_relatives SET name=?,kin=?,note=?,ref_id=? WHERE id=?')
    .bind(finalName || '未命名', b.kin || null, b.note || null, refId, id).run();
  return json({ ok: true, id });
}

// DELETE /api/profile/relatives?id=3&action=delete|deprecate
export async function onRequestDelete(context) {
  const { env, request } = context;
  const u = new URL(request.url);
  const id = Number(u.searchParams.get('id'));
  const action = u.searchParams.get('action') || 'delete';
  if (!id) return json({ error: '缺少 id' }, 400);
  if (action === 'deprecate') {
    await env.DB.prepare('UPDATE contact_relatives SET dead=1 WHERE id=?').bind(id).run();
  } else {
    await env.DB.prepare('DELETE FROM contact_relatives WHERE id=?').bind(id).run();
  }
  return json({ ok: true, id, action });
}