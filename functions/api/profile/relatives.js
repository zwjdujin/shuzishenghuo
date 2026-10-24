import { json } from '../../_lib.js';

// ===== 家庭关系："对方是当前联系人的 ___"（称谓存词库 rel_kin，可自定义复用） =====
const clean = (s, max) => String(s || '').trim().slice(0, 30);

/** 填了 ref_id 时自动取对方姓名；把新称谓记入词库（下次可直接选） */
async function resolve(env, b) {
  const kin = clean(b.kin, 20);
  if (!kin) return { error: '请选择关系称谓' };
  let refId = Number(b.ref_id) || null;
  let name = clean(b.name, 30);
  if (refId) {
    const t = await env.DB.prepare('SELECT id, name FROM contacts WHERE id=?').bind(refId).first();
    if (!t) return { error: '关联的联系人不存在' };
    name = t.name;
  }
  if (!name) return { error: '请填写对方姓名或选择关联联系人' };
  await env.DB.prepare('INSERT INTO vocab(kind, word) VALUES (?, ?) ON CONFLICT(kind, word) DO UPDATE SET hits = hits + 1')
    .bind('rel_kin', kin).run();
  return { kin, name, refId };
}

// POST /api/profile/relatives {person_id, kin, name, ref_id}
export async function onRequestPost(context) {
  const { env, request } = context;
  let b = {};
  try { b = await request.json(); } catch (_) {}
  const personId = Number(b.person_id);
  if (!personId) return json({ error: '缺少 person_id' }, 400);
  if (!(await env.DB.prepare('SELECT id FROM contacts WHERE id=?').bind(personId).first())) {
    return json({ error: '联系人不存在' }, 404);
  }
  const r = await resolve(env, b);
  if (r.error) return json({ error: r.error }, 400);
  const res = await env.DB.prepare(
    'INSERT INTO contact_relatives(person_id, kin, name, ref_id) VALUES (?,?,?,?)'
  ).bind(personId, r.kin, r.name, r.refId).run();
  return json({ ok: true, id: res.meta && res.meta.last_row_id }, 201);
}

// PUT /api/profile/relatives {id, kin, name, ref_id}
export async function onRequestPut(context) {
  const { env, request } = context;
  let b = {};
  try { b = await request.json(); } catch (_) {}
  const id = Number(b.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  const row = await env.DB.prepare('SELECT * FROM contact_relatives WHERE id=?').bind(id).first();
  if (!row) return json({ error: '记录不存在' }, 404);
  const r = await resolve(env, b);
  if (r.error) return json({ error: r.error }, 400);
  await env.DB.prepare('UPDATE contact_relatives SET kin=?, name=?, ref_id=? WHERE id=?')
    .bind(r.kin, r.name, r.refId, id).run();
  return json({ ok: true, id });
}

// DELETE /api/profile/relatives?id=3
export async function onRequestDelete(context) {
  const { env, request } = context;
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!id) return json({ error: '缺少 id' }, 400);
  await env.DB.prepare('DELETE FROM contact_relatives WHERE id=?').bind(id).run();
  return json({ ok: true, id });
}
