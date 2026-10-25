import { json } from '../../_lib.js';

// /api/recurring/:id —— 启停（PUT {active}）与删除（DELETE）
export async function onRequest(context) {
  const { env, request } = context;
  const m = new URL(request.url).pathname.match(/\/recurring\/(\d+)/);
  const id = Number(m ? m[1] : 0);
  if (!id) return json({ error: '缺少 id' }, 400);

  if (request.method === 'PUT') {
    let body = {};
    try { body = await request.json(); } catch (_) {}
    await env.DB.prepare('UPDATE recurring SET active=? WHERE id=?').bind(body.active ? 1 : 0, id).run();
    return json({ ok: true });
  }
  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM recurring WHERE id=?').bind(id).run();
    return json({ ok: true, id });
  }
  return json({ error: '不支持的请求方法' }, 405);
}
