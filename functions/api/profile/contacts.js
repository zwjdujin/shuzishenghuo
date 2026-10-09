import { json } from '../../_lib.js';

// ===== 多联系方式（手机号/邮箱/微信），支持弃用标记 =====
const KINDS = ['phones', 'emails', 'wechats'];

// POST /api/profile/contacts {person_id, kind, value}
export async function onRequestPost(context) {
  const { env, request } = context;
  let b = {};
  try { b = await request.json(); } catch (_) {}
  const personId = Number(b.person_id);
  const kind = String(b.kind || '');
  const value = String(b.value || '').trim();
  if (!personId || !KINDS.includes(kind)) return json({ error: '参数错误' }, 400);
  if (!value) return json({ error: '请填写内容' }, 400);

  const dup = await env.DB.prepare(
    'SELECT id FROM contact_contacts WHERE person_id=? AND kind=? AND value=? AND deprecated=0'
  ).bind(personId, kind, value).first();
  if (dup) return json({ error: '该内容已存在' }, 409);

  const res = await env.DB.prepare('INSERT INTO contact_contacts(person_id,kind,value) VALUES (?,?,?)')
    .bind(personId, kind, value).run();
  return json({ ok: true, id: res.meta && res.meta.last_row_id }, 201);
}

// PUT /api/profile/contacts {id, action:'deprecated'|'restore'}
export async function onRequestPut(context) {
  const { env, request } = context;
  let b = {};
  try { b = await request.json(); } catch (_) {}
  const id = Number(b.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  const dep = b.action === 'deprecated' ? 1 : 0;
  await env.DB.prepare('UPDATE contact_contacts SET deprecated=? WHERE id=?').bind(dep, id).run();
  return json({ ok: true, id, deprecated: dep });
}

// DELETE /api/profile/contacts?id=5
export async function onRequestDelete(context) {
  const { env, request } = context;
  const u = new URL(request.url);
  const id = Number(u.searchParams.get('id'));
  if (!id) return json({ error: '缺少 id' }, 400);
  await env.DB.prepare('DELETE FROM contact_contacts WHERE id=?').bind(id).run();
  return json({ ok: true, id });
}