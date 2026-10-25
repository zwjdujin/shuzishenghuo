import { json, todayStr } from '../_lib.js';
import { progressOf, parseHabitBody } from './_helpers.js';

// 习惯 → 响应对象（v0.6.0 增加频率目标字段）
function habitOut(h, log, logs30) {
  return {
    id: h.id,
    name: h.name,
    icon: h.icon || 'sprout',
    color: h.color || 'sage',
    category: h.category || '自定义',
    type: h.type || 'normal',
    method: h.method || 'count',
    target: Number(h.target) || 1,
    unit: h.unit || '次',
    freqType: h.freq_type || 'daily',
    freqValue: Number(h.freq_value) || 1,
    bed_time: h.bed_time || '',
    rise_time: h.rise_time || '',
    nap_time: h.nap_time || '',
    today: progressOf(h, log),
    logs30: logs30 || [],   // [[date, done], ...] 近 30 天，前端算周期进度与强度条
  };
}

// GET /api/habits —— 全部习惯 + 今日打卡状态 + 近 30 天日志
export async function onRequestGet(context) {
  const { env } = context;
  const today = todayStr();
  const habits = await env.DB.prepare('SELECT * FROM habits ORDER BY id ASC').all();
  const rows = habits.results || [];
  const ids = rows.map((h) => h.id);
  let logs = [];
  let logs30 = [];
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(',');
    const from30 = new Date(Date.parse(today + 'T00:00:00Z') - 29 * 86400000).toISOString().slice(0, 10);
    logs = ((await env.DB.prepare(
      `SELECT * FROM habit_logs WHERE habit_id IN (${placeholders}) AND log_date = ?`
    ).bind(...ids, today).all()).results) || [];
    logs30 = ((await env.DB.prepare(
      `SELECT habit_id, log_date, done FROM habit_logs WHERE habit_id IN (${placeholders}) AND log_date >= ? ORDER BY log_date`
    ).bind(...ids, from30).all()).results) || [];
  }
  const logMap = {};
  logs.forEach((l) => (logMap[l.habit_id] = l));
  const logs30Map = {};
  logs30.forEach((l) => {
    if (!logs30Map[l.habit_id]) logs30Map[l.habit_id] = [];
    logs30Map[l.habit_id].push([l.log_date, l.done]);
  });
  return json({ habits: rows.map((h) => habitOut(h, logMap[h.id], logs30Map[h.id])) });
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
    `INSERT INTO habits(name, icon, color, target, unit, category, type, method, bed_time, rise_time, nap_time, freq_type, freq_value)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  )
    .bind(h.name, h.icon, h.color, h.target, h.unit, h.category, h.type, h.method,
      h.bed_time, h.rise_time, h.nap_time, h.freqType, h.freqValue)
    .run();
  const id = res.meta && res.meta.last_row_id ? res.meta.last_row_id : null;
  const created = await env.DB.prepare('SELECT * FROM habits WHERE id = ?').bind(id).first();
  return json({ habit: habitOut(created, null, []) }, 201);
}
