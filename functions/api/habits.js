import { json, todayStr } from '../_lib.js';
import { progressOf, parseHabitBody } from './_helpers.js';

// GET /api/habits —— 列出全部习惯，并附上今日打卡状态
export async function onRequestGet(context) {
  const { env } = context;
  const today = todayStr();
  const habits = await env.DB.prepare('SELECT * FROM habits ORDER BY id ASC').all();
  const rows = habits.results || [];
  const ids = rows.map((h) => h.id);
  let logs = [];
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(',');
    const res = await env.DB.prepare(
      `SELECT * FROM habit_logs WHERE habit_id IN (${placeholders}) AND log_date = ?`
    )
      .bind(...ids, today)
      .all();
    logs = res.results || [];
  }
  const logMap = {};
  logs.forEach((l) => (logMap[l.habit_id] = l));

  const list = rows.map((h) => ({
    id: h.id,
    name: h.name,
    icon: h.icon || 'sprout',
    color: h.color || 'sage',
    category: h.category || '自定义',
    type: h.type || 'normal',
    method: h.method || 'count',
    target: Number(h.target) || 1,
    unit: h.unit || '次',
    bed_time: h.bed_time || '',
    rise_time: h.rise_time || '',
    nap_time: h.nap_time || '',
    today: progressOf(h, logMap[h.id]),
  }));
  return json({ habits: list });
}

// POST /api/habits —— 新增习惯
export async function onRequestPost(context) {
  const { env } = context;
  let body = {};
  try { body = await context.request.json(); } catch (_) {}
  const parsed = parseHabitBody(body);
  if (parsed.error) return json({ error: parsed.error }, 400);
  const h = parsed.habit;

  const res = await env.DB.prepare(
    `INSERT INTO habits(name, icon, color, target, unit, category, type, method, bed_time, rise_time, nap_time)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  )
    .bind(h.name, h.icon, h.color, h.target, h.unit, h.category, h.type, h.method, h.bed_time, h.rise_time, h.nap_time)
    .run();
  const id = res.meta && res.meta.last_row_id ? res.meta.last_row_id : null;
  const created = await env.DB.prepare('SELECT * FROM habits WHERE id = ?').bind(id).first();
  return json({
    habit: {
      id: created.id,
      name: created.name,
      icon: created.icon,
      color: created.color,
      category: created.category,
      type: created.type,
      method: created.method,
      target: Number(created.target) || 1,
      unit: created.unit,
      bed_time: created.bed_time || '',
      rise_time: created.rise_time || '',
      nap_time: created.nap_time || '',
      today: progressOf(created, null),
    },
  }, 201);
}
