import { json } from '../../_lib.js';
import { syncPrimaryPhone } from './detail.js';

// ===== 联系方式：电话 / 电子邮件 / 联系地址 / QQ / 微信（可多个，带备注标签） =====
const KINDS = ['phones', 'emails', 'addresses', 'qq', 'wechat'];
const clean = (s, max) => String(s || '').trim().slice(0, max);

// POST /api/profile/contacts {person_id, kind, value, label}
export async function onRequestPost(context) {
  const { env, request } = context;
  let b = {};
  try { b = await request.json(); } catch (_) {}
  const personId = Number(b.person_id);
  const kind = String(b.kind || '');
  const value = clean(b.value, 100);
  if (!personId || !KINDS.includes(kind)) return json({ error: '参数错误' }, 400);
  if (!value) return json({ error: '请填写内容' }, 400);
  if (!(await env.DB.prepare('SELECT id FROM contacts WHERE id=?').bind(personId).first())) {
    return json({ error: '联系人不存在' }, 404);
  }

  const dup = await env.DB.prepare(
    'SELECT id FROM contact_contacts WHERE person_id=? AND kind=? AND value=?'
  ).bind(personId, kind, value).first();
  if (dup) return json({ error: '该内容已存在' }, 409);

  const res = await env.DB.prepare(
    'INSERT INTO contact_contacts(person_id, kind, value, label) VALUES (?,?,?,?)'
  ).bind(personId, kind, value, clean(b.label, 20) || null).run();
  if (kind === 'phones') await syncPrimaryPhone(env, personId);
  return json({ ok: true, id: res.meta && res.meta.last_row_id }, 201);
}

// PUT /api/profile/contacts {id, value, label} —— 修改一条
export async function onRequestPut(context) {
  const { env, request } = context;
  let b = {};
  try { b = await request.json(); } catch (_) {}
  const id = Number(b.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  const row = await env.DB.prepare('SELECT * FROM contact_contacts WHERE id=?').bind(id).first();
  if (!row) return json({ error: '记录不存在' }, 404);
  await env.DB.prepare('UPDATE contact_contacts SET value=?, label=? WHERE id=?')
    .bind(clean(b.value, 100) || row.value, clean(b.label, 20) || null, id).run();
  if (row.kind === 'phones') await syncPrimaryPhone(env, row.person_id);
  return json({ ok: true, id });
}

// DELETE /api/profile/contacts?id=5
export async function onRequestDelete(context) {
  const { env, request } = context;
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!id) return json({ error: '缺少 id' }, 400);
  const row = await env.DB.prepare('SELECT person_id, kind FROM contact_contacts WHERE id=?').bind(id).first();
  if (!row) return json({ error: '记录不存在' }, 404);
  await env.DB.prepare('DELETE FROM contact_contacts WHERE id=?').bind(id).run();
  if (row.kind === 'phones') await syncPrimaryPhone(env, row.person_id);
  return json({ ok: true, id });
}
