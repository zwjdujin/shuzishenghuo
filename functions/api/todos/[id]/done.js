import { json } from '../../../_lib.js';

export async function onRequestPost(context) {
  const { env, params } = context;
  const id = params && params.id;
  if (!id) return json({ error: '缺少 id' }, 400);
  const info = await env.DB.prepare('UPDATE todos SET done=1 WHERE id=? AND done=0')
    .bind(id)
    .run();
  return json({ ok: true, changes: info.changes || 0 });
}
