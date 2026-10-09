import { json } from '../../_lib.js';

// DELETE /api/transactions/:id —— 删除一笔账（ID 从路径解析）
export async function onRequest(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const m = url.pathname.match(/\/transactions\/(\d+)/);
  const id = Number(m ? m[1] : url.searchParams.get('id'));
  if (!id) return json({ error: '缺少记录 ID' }, 400);
  await env.DB.prepare('DELETE FROM transactions WHERE id = ?').bind(id).run();
  return json({ ok: true, id });
}