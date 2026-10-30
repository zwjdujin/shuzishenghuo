import { json } from '../_lib.js';

// ===== v0.5.29 待办清单：清单（组）管理 =====
// GET    /api/checklists            → 全部清单 + 条目（未完成在前）
// POST   /api/checklists {name}     → 新建清单
// PUT    /api/checklists {id,name}  → 重命名清单
// DELETE /api/checklists?id=1       → 删除清单（条目级联）

const nameOf = (v) => String(v || '').replace(/[,，]/g, '').trim().slice(0, 30);

export async function onRequestGet(context) {
  const { env } = context;
  const groups = (await env.DB.prepare('SELECT id, name FROM checklist_groups ORDER BY id').all()).results || [];
  const items = (await env.DB.prepare(
    'SELECT id, group_id gid, content, done FROM checklist_items ORDER BY done ASC, id ASC'
  ).all()).results || [];
  const byGroup = {};
  groups.forEach((g) => { byGroup[g.id] = { id: g.id, name: g.name, items: [] }; });
  items.forEach((it) => {
    const g = byGroup[it.gid];
    if (g) g.items.push({ id: it.id, content: it.content, done: !!it.done });
  });
  return json({ groups: Object.values(byGroup) });
}

export async function onRequestPost(context) {
  const { env, request } = context;
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const name = nameOf(body.name);
  if (!name) return json({ error: '请填写清单名称' }, 400);
  const res = await env.DB.prepare('INSERT INTO checklist_groups(name) VALUES (?)').bind(name).run();
  const id = res.meta && res.meta.last_row_id;
  return json({ ok: true, id, name }, 201);
}

export async function onRequestPut(context) {
  const { env, request } = context;
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const id = Number(body.id);
  const name = nameOf(body.name);
  if (!id || !name) return json({ error: '参数不完整' }, 400);
  const row = await env.DB.prepare('SELECT id FROM checklist_groups WHERE id=?').bind(id).first();
  if (!row) return json({ error: '清单不存在' }, 404);
  await env.DB.prepare('UPDATE checklist_groups SET name=? WHERE id=?').bind(name, id).run();
  return json({ ok: true, id, name });
}

export async function onRequestDelete(context) {
  const { env, request } = context;
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!id) return json({ error: '缺少清单 id' }, 400);
  // 条目显式先删，不依赖会话级 FK 开关
  await env.DB.batch([
    env.DB.prepare('DELETE FROM checklist_items WHERE group_id=?').bind(id),
    env.DB.prepare('DELETE FROM checklist_groups WHERE id=?').bind(id),
  ]);
  return json({ ok: true, id });
}
