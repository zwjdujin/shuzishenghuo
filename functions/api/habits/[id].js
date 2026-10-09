import { json, todayStr } from '../../_lib.js';
import { progressOf, parseHabitBody } from '../_helpers.js';

// DELETE /api/habits/:id —— 删除习惯及其全部打卡记录
export async function onRequestDelete(context) {
  const { env } = context;
  const id = Number(context.params.id);
  if (!id) return json({ error: '无效的习惯 ID' }, 400);
  await env.DB.prepare('DELETE FROM habit_logs WHERE habit_id = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM habits WHERE id = ?').bind(id).run();
  return json({ ok: true, id });
}

// PUT /api/habits/:id —— 编辑习惯（名称/分类/类型/方式/目标/睡眠时段）
export async function onRequestPut(context) {
  const { env } = context;
  const id = Number(context.params.id);
  if (!id) return json({ error: '无效的习惯 ID' }, 400);
  const existing = await env.DB.prepare('SELECT * FROM habits WHERE id = ?').bind(id).first();
  if (!existing) return json({ error: '习惯不存在' }, 404);

  let body = {};
  try { body = await context.request.json(); } catch (_) {}
  // 编辑时允许只改部分字段：把已存值作为 current 兜底
  const current = {
    name: existing.name, category: existing.category, type: existing.type,
    icon: existing.icon, color: existing.color, method: existing.method,
    target: existing.target, unit: existing.unit,
    bed_time: existing.bed_time, rise_time: existing.rise_time, nap_time: existing.nap_time,
  };
  const parsed = parseHabitBody(body, current);
  if (parsed.error) return json({ error: parsed.error }, 400);
  const h = parsed.habit;

  await env.DB.prepare(
    `UPDATE habits SET name=?, icon=?, color=?, target=?, unit=?, category=?, type=?, method=?, bed_time=?, rise_time=?, nap_time=? WHERE id=?`
  )
    .bind(h.name, h.icon, h.color, h.target, h.unit, h.category, h.type, h.method, h.bed_time, h.rise_time, h.nap_time, id)
    .run();

  const updated = await env.DB.prepare('SELECT * FROM habits WHERE id = ?').bind(id).first();
  const log = await env.DB.prepare('SELECT * FROM habit_logs WHERE habit_id=? AND log_date=?')
    .bind(id, todayStr()).first();
  return json({
    habit: {
      id: updated.id,
      name: updated.name,
      icon: updated.icon,
      color: updated.color,
      category: updated.category,
      type: updated.type,
      method: updated.method,
      target: Number(updated.target) || 1,
      unit: updated.unit,
      bed_time: updated.bed_time || '',
      rise_time: updated.rise_time || '',
      nap_time: updated.nap_time || '',
      today: progressOf(updated, log),
    },
  });
}
