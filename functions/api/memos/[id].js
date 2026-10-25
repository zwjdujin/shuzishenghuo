import { json } from '../../_lib.js';

// DELETE /api/memos/:id
export async function onRequest(context) {
  const { env, request } = context;
  const m = new URL(request.url).pathname.match(/\/memos\/(\d+)/);
  const id = Number(m ? m[1] : new URL(request.url).searchParams.get('id'));
  if (!id) return json({ error: '缺少 id' }, 400);
  await env.DB.prepare('DELETE FROM memos WHERE id = ?').bind(id).run();
  return json({ ok: true, id });
}
