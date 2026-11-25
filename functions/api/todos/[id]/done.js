import { json } from '../../../_lib.js';

export async function onRequestPost(context) {
  const { env, params } = context;
  const id = params && params.id;
  if (!id) return json({ error: '缺少 id' }, 400);
  // v0.5.52：记完成时间（已完成视图排序用）；重复生成在第二批接入
  const info = await env.DB.prepare(
    "UPDATE todos SET done=1, completed_at=datetime('now','localtime') WHERE id=? AND done=0"
  )
    .bind(id)
    .run();
  return json({ ok: true, changes: info.changes || 0 });
}
