import { json } from '../../_lib.js';

// DELETE /api/todos/completed —— 清空已完成记录（已完成视图的操作入口）
// 注意：静态文件路由优先于 [id] 动态段，/api/todos/completed 不会落到 [id]/delete
export async function onRequestDelete(context) {
  const { env } = context;
  const info = await env.DB.prepare('DELETE FROM todos WHERE done=1').run();
  return json({ ok: true, removed: info.meta && info.meta.changes ? info.meta.changes : 0 });
}
