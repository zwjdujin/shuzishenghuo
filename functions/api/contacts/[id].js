import { json } from '../../_lib.js';

// DELETE /api/contacts/:id —— 删除联系人
export async function onRequest(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const m = url.pathname.match(/\/contacts\/(\d+)/);
  const id = Number(m ? m[1] : url.searchParams.get('id'));
  if (!id) return json({ error: '缺少联系人 ID' }, 400);
  await env.DB.prepare('DELETE FROM contacts WHERE id = ?').bind(id).run();
  return json({ ok: true, id });
}