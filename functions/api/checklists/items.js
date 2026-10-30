import { json } from '../../_lib.js';

// ===== v0.5.29 待办清单：条目（物品 / 事项） =====
// POST   /api/checklists/items {group_id, content} → 添加
// PUT    /api/checklists/items {id, done} / {id, content} → 勾选 / 改名
// DELETE /api/checklists/items?id=1 → 删除条目

const contentOf = (v) => String(v || '').trim().slice(0, 60);

export async function onRequestPost(context) {
  const { env, request } = context;
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const groupId = Number(body.group_id);
  const content = contentOf(body.content);
  if (!groupId || !content) return json({ error: '请填写内容' }, 400);
  const g = await env.DB.prepare('SELECT id FROM checklist_groups WHERE id=?').bind(groupId).first();
  if (!g) return json({ error: '清单不存在' }, 404);
  const res = await env.DB.prepare('INSERT INTO checklist_items(group_id, content) VALUES (?,?)')
    .bind(groupId, content).run();
  const id = res.meta && res.meta.last_row_id;
  return json({ ok: true, id, content }, 201);
}

export async function onRequestPut(context) {
  const { env, request } = context;
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const id = Number(body.id);
  if (!id) return json({ error: '缺少条目 id' }, 400);
  if (body.done !== undefined) {
    await env.DB.prepare('UPDATE checklist_items SET done=? WHERE id=?').bind(body.done ? 1 : 0, id).run();
    return json({ ok: true, id, done: !!body.done });
  }
  const content = contentOf(body.content);
  if (!content) return json({ error: '请填写内容' }, 400);
  await env.DB.prepare('UPDATE checklist_items SET content=? WHERE id=?').bind(content, id).run();
  return json({ ok: true, id, content });
}

export async function onRequestDelete(context) {
  const { env, request } = context;
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!id) return json({ error: '缺少条目 id' }, 400);
  await env.DB.prepare('DELETE FROM checklist_items WHERE id=?').bind(id).run();
  return json({ ok: true, id });
}
