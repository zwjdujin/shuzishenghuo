import { json } from '../../../_lib.js';

// DELETE /api/todos/:id/delete —— 删除待办（ID 从路径解析）
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const m = url.pathname.match(/\/todos\/(\d+)\//);
  const id = Number(m ? m[1] : url.searchParams.get('id'));
  if (!id) return json({ error: '缺少 id' }, 400);
  await env.DB.prepare('DELETE FROM todos WHERE id = ?').bind(id).run();
  return json({ ok: true, id });
}