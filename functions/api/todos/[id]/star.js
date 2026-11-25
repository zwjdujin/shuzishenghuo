import { json } from '../../../_lib.js';

// POST /api/todos/:id/star —— 切换星标「重要」（微软 To Do 的 Important）
export async function onRequestPost(context) {
  const { env, params } = context;
  const id = params && params.id;
  if (!id) return json({ error: '缺少 id' }, 400);
  const row = await env.DB.prepare('SELECT star FROM todos WHERE id=?').bind(id).first();
  if (!row) return json({ error: '待办不存在' }, 404);
  const star = row.star ? 0 : 1;
  await env.DB.prepare('UPDATE todos SET star=? WHERE id=?').bind(star, id).run();
  return json({ ok: true, id, star: !!star });
}
