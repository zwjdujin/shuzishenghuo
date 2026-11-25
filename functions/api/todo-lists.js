import { json } from '../_lib.js';

// ===== v0.5.52 正式待办清单（微软 To Do 式：图标/颜色/排序） =====
// GET    /api/todo-lists                            → 全部清单
// POST   /api/todo-lists {name,icon?,color?}        → 新建清单
// PUT    /api/todo-lists {id,name?,icon?,color?}    → 更新清单（传哪个改哪个）
// DELETE /api/todo-lists?id=1                       → 删除清单，其下待办归并「生活」；默认清单不可删

const DEFAULT_LIST = '生活';
const COLOR_NAMES = ['', 'red', 'orange', 'green', 'teal', 'blue', 'purple', 'pink'];

const nameOf = (v) => String(v || '').replace(/[,，]/g, '').trim().slice(0, 20);
const iconOf = (v) => String(v || '').trim().slice(0, 4);   // 单个 emoji/字符，防超长
const colorOf = (v) => (COLOR_NAMES.includes(v) ? v : '');

export async function onRequestGet(context) {
  const { env } = context;
  const rows = (await env.DB.prepare(
    'SELECT id, name, icon, color, sort_order FROM todo_lists ORDER BY sort_order ASC, id ASC'
  ).all()).results || [];
  return json({ lists: rows });
}

export async function onRequestPost(context) {
  const { env, request } = context;
  let body = {};
  try { body = await request.json(); } catch (_) { return json({ error: '请求格式不正确' }, 400); }
  const name = nameOf(body.name);
  if (!name) return json({ error: '请填写清单名称' }, 400);
  const dup = await env.DB.prepare('SELECT id FROM todo_lists WHERE name=?').bind(name).first();
  if (dup) return json({ error: '已有同名清单' }, 400);
  const res = await env.DB.prepare('INSERT INTO todo_lists(name, icon, color, sort_order) VALUES (?,?,?,(SELECT COALESCE(MAX(sort_order),0)+1 FROM todo_lists))')
    .bind(name, iconOf(body.icon), colorOf(body.color))
    .run();
  const id = res.meta && res.meta.last_row_id;
  return json({ ok: true, id, name, icon: iconOf(body.icon), color: colorOf(body.color) }, 201);
}

export async function onRequestPut(context) {
  const { env, request } = context;
  let body = {};
  try { body = await request.json(); } catch (_) { return json({ error: '请求格式不正确' }, 400); }
  const id = Number(body.id);
  if (!id) return json({ error: '缺少清单 id' }, 400);
  const row = await env.DB.prepare('SELECT id, name FROM todo_lists WHERE id=?').bind(id).first();
  if (!row) return json({ error: '清单不存在' }, 404);

  // 逐字段可选更新（patch 语义：只改传了的字段）
  const sets = [];
  const params = [];
  let newName = null;
  if (body.name !== undefined) {
    const name = nameOf(body.name);
    if (!name) return json({ error: '请填写清单名称' }, 400);
    const dup = await env.DB.prepare('SELECT id FROM todo_lists WHERE name=? AND id!=?').bind(name, id).first();
    if (dup) return json({ error: '已有同名清单' }, 400);
    sets.push('name=?');
    params.push(name);
    newName = name;
  }
  if (body.icon !== undefined) { sets.push('icon=?'); params.push(iconOf(body.icon)); }
  if (body.color !== undefined) { sets.push('color=?'); params.push(colorOf(body.color)); }
  if (!sets.length) return json({ error: '没有要更新的字段' }, 400);
  params.push(id);
  // 重命名要联动 todos.list 的旧值（否则删除清单时按新名归并会漏掉旧名待办）
  if (newName && newName !== row.name) {
    await env.DB.batch([
      env.DB.prepare(`UPDATE todo_lists SET ${sets.join(', ')} WHERE id=?`).bind(...params),
      env.DB.prepare('UPDATE todos SET list=? WHERE list=?').bind(newName, row.name),
    ]);
  } else {
    await env.DB.prepare(`UPDATE todo_lists SET ${sets.join(', ')} WHERE id=?`).bind(...params).run();
  }
  return json({ ok: true, id });
}

export async function onRequestDelete(context) {
  const { env, request } = context;
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!id) return json({ error: '缺少清单 id' }, 400);
  const row = await env.DB.prepare('SELECT id, name FROM todo_lists WHERE id=?').bind(id).first();
  if (!row) return json({ error: '清单不存在' }, 404);
  if (row.name === DEFAULT_LIST) return json({ error: `「${DEFAULT_LIST}」是默认清单，不能删除` }, 400);
  // 待办归并默认清单（参照账本删账户归并默认账户的先例），清单行再删；不依赖会话级 FK 开关
  await env.DB.batch([
    env.DB.prepare('UPDATE todos SET list=? WHERE list=?').bind(DEFAULT_LIST, row.name),
    env.DB.prepare('DELETE FROM todo_lists WHERE id=?').bind(id),
  ]);
  return json({ ok: true, id, mergedTo: DEFAULT_LIST });
}
