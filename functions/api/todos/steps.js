import { json } from '../../_lib.js';

// ===== 步骤单条快捷操作（任务行内展开区的即时勾选/增删；弹窗内编辑走 /api/todos 的 steps 原子保存） =====
// POST   /api/todos/steps {todo_id, content}  → 新增一条
// PUT    /api/todos/steps {id, done}          → 勾选/取消
// DELETE /api/todos/steps?id=1                → 删除一条

const cleanContent = (s) => String(s || '').trim().slice(0, 60);

export async function onRequestPost(context) {
  const { env, request } = context;
  let body = {};
  try { body = await request.json(); } catch (_) { return json({ error: '请求格式不正确' }, 400); }
  const todoId = Number(body.todo_id);
  const content = cleanContent(body.content);
  if (!todoId || !content) return json({ error: '参数不完整' }, 400);
  const exists = await env.DB.prepare('SELECT id FROM todos WHERE id=?').bind(todoId).first();
  if (!exists) return json({ error: '待办不存在' }, 404);
  const ord = (await env.DB.prepare('SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM todo_steps WHERE todo_id=?').bind(todoId).first() || {}).n || 1;
  const res = await env.DB.prepare('INSERT INTO todo_steps(todo_id, content, done, sort_order) VALUES (?,?,0,?)').bind(todoId, content, ord).run();
  return json({ ok: true, id: res.meta && res.meta.last_row_id, content, done: false }, 201);
}

export async function onRequestPut(context) {
  const { env, request } = context;
  let body = {};
  try { body = await request.json(); } catch (_) { return json({ error: '请求格式不正确' }, 400); }
  const id = Number(body.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  const info = await env.DB.prepare('UPDATE todo_steps SET done=? WHERE id=?').bind(body.done ? 1 : 0, id).run();
  return json({ ok: true, changes: info.changes || 0 });
}

export async function onRequestDelete(context) {
  const { env, request } = context;
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!id) return json({ error: '缺少 id' }, 400);
  const info = await env.DB.prepare('DELETE FROM todo_steps WHERE id=?').bind(id).run();
  return json({ ok: true, changes: info.changes || 0 });
}
