import { json } from '../../_lib.js';

// DELETE /api/habits/:id —— 删除习惯及其全部打卡记录
export async function onRequestDelete(context) {
  const { env } = context;
  const id = Number(context.params.id);
  if (!id) return json({ error: '无效的习惯 ID' }, 400);
  await env.DB.prepare('DELETE FROM habit_logs WHERE habit_id = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM habits WHERE id = ?').bind(id).run();
  return json({ ok: true, id });
}
