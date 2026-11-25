import { json } from '../../../_lib.js';

// DELETE /api/todos/:id/delete —— 删除待办（ID 从路径解析）
// v0.5.56 安全修复：方法分派——只有 DELETE 才删除，其余方法 405（防跨站 GET 触发删除）
export async function onRequest(context) {
  const { request, env } = context;
  if ((request.method || 'GET') !== 'DELETE') return json({ error: '不支持的请求方法' }, 405);
  const url = new URL(request.url);
  const m = url.pathname.match(/\/todos\/(\d+)\//);
  const id = Number(m ? m[1] : url.searchParams.get('id'));
  if (!id) return json({ error: '缺少 id' }, 400);
  await env.DB.prepare('DELETE FROM todos WHERE id = ?').bind(id).run();
  return json({ ok: true, id });
}