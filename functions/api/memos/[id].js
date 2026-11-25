import { json } from '../../_lib.js';

// DELETE /api/memos/:id
// v0.5.56 安全修复：方法分派——只有 DELETE 才删除，其余方法 405（防跨站 GET 触发删除）
export async function onRequest(context) {
  const { env, request } = context;
  if ((request.method || 'GET') !== 'DELETE') return json({ error: '不支持的请求方法' }, 405);
  const m = new URL(request.url).pathname.match(/\/memos\/(\d+)/);
  const id = Number(m ? m[1] : new URL(request.url).searchParams.get('id'));
  if (!id) return json({ error: '缺少 id' }, 400);
  await env.DB.prepare('DELETE FROM memos WHERE id = ?').bind(id).run();
  return json({ ok: true, id });
}
