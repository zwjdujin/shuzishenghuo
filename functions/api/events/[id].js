import { json } from '../../_lib.js';

// DELETE /api/events/:id —— 删除事件（ID 从路径解析）
// v0.5.56 安全修复：方法分派——只有 DELETE 才删除，其余方法 405。
// 此前导出的是不判断方法的 onRequest：GET /api/events/5 同样会删，而跨站顶层导航的 GET
// 会携带 SameSite=Lax 的会话 Cookie，等于一个外部链接就能让已登录用户删数据。
export async function onRequest(context) {
  const { env, request } = context;
  if ((request.method || 'GET') !== 'DELETE') return json({ error: '不支持的请求方法' }, 405);
  const url = new URL(request.url);
  // 兼容两种调用：/api/events/5 与 /api/events?id=5
  const m = url.pathname.match(/\/events\/(\d+)/);
  const id = Number(m ? m[1] : url.searchParams.get('id'));
  if (!id) return json({ error: '缺少事件 ID' }, 400);
  await env.DB.prepare('DELETE FROM events WHERE id = ?').bind(id).run();
  return json({ ok: true, id });
}