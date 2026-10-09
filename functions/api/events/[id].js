import { json } from '../../_lib.js';

// DELETE /api/events/:id —— 删除事件（ID 从路径解析）
export async function onRequest(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  // 兼容两种调用：/api/events/5 与 /api/events?id=5
  const m = url.pathname.match(/\/events\/(\d+)/);
  const id = Number(m ? m[1] : url.searchParams.get('id'));
  if (!id) return json({ error: '缺少事件 ID' }, 400);
  await env.DB.prepare('DELETE FROM events WHERE id = ?').bind(id).run();
  return json({ ok: true, id });
}