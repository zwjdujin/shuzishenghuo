import { json } from '../../_lib.js';

// ===== v0.5.33 档案卷宗：自定义段落（19 段 JSON 资料） =====
// GET    /api/profile/sections?contact_id=1        → {sections:[{key,data}]}
// PUT    /api/profile/sections {contact_id,key,data} → 段落载荷整体保存（≤24KB）
// DELETE /api/profile/sections?contact_id=1&key=x  → 清空该段

const MAX_DATA = 24 * 1024;

export async function onRequestGet(context) {
  const { env, request } = context;
  const id = Number(new URL(request.url).searchParams.get('contact_id'));
  if (!id) return json({ error: '缺少联系人 id' }, 400);
  const rows = (await env.DB.prepare(
    'SELECT sec_key, data FROM contact_sections WHERE contact_id=?'
  ).bind(id).all()).results || [];
  const sections = {};
  rows.forEach((r) => { sections[r.sec_key] = safeParse(r.data); });
  return json({ sections });
}

export async function onRequestPut(context) {
  const { env, request } = context;
  let body = {};
  try { body = await request.json(); } catch (_) { return json({ error: '请求格式不正确' }, 400); }
  const contactId = Number(body.contact_id);
  const key = String(body.key || '').trim();
  if (!contactId || !key) return json({ error: '参数不完整' }, 400);
  const exists = await env.DB.prepare('SELECT id FROM contacts WHERE id=?').bind(contactId).first();
  if (!exists) return json({ error: '联系人不存在' }, 404);
  const data = body.data && typeof body.data === 'object' ? body.data : {};
  const dataStr = JSON.stringify(data);
  if (dataStr.length > MAX_DATA) return json({ error: '该段内容过大（上限 24KB）' }, 400);
  await env.DB.prepare(
    `INSERT INTO contact_sections(contact_id, sec_key, data) VALUES (?,?,?)
     ON CONFLICT(contact_id, sec_key) DO UPDATE SET data=excluded.data, updated_at=datetime('now','localtime')`
  ).bind(contactId, key, dataStr).run();
  return json({ ok: true, key });
}

export async function onRequestDelete(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const contactId = Number(url.searchParams.get('contact_id'));
  const key = (url.searchParams.get('key') || '').trim();
  if (!contactId || !key) return json({ error: '参数不完整' }, 400);
  await env.DB.prepare('DELETE FROM contact_sections WHERE contact_id=? AND sec_key=?').bind(contactId, key).run();
  return json({ ok: true });
}

function safeParse(s) {
  try { const v = JSON.parse(s); return v && typeof v === 'object' ? v : {}; } catch (_) { return {}; }
}
