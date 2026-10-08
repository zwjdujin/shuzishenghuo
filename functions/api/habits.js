import { json, todayStr } from '../_lib.js';

// 计算某习惯今天的完成进度
function progressOf(habit, log) {
  const needed = habit.type === 'sleep' ? 2 : 1;
  const completed =
    habit.type === 'sleep'
      ? (log ? (log.done_bed || 0) + (log.done_rise || 0) : 0)
      : (log ? log.done || 0 : 0);
  return {
    done: log ? (log.done || 0) : 0,
    done_bed: log ? (log.done_bed || 0) : 0,
    done_rise: log ? (log.done_rise || 0) : 0,
    needed,
    completed,
    todayDone: completed >= needed,
  };
}

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
    bed_time: h.bed_time || '',
    rise_time: h.rise_time || '',
    today: progressOf(h, logMap[h.id]),
  }));
  return json({ habits: list });
}

// POST /api/habits —— 新增习惯（支持自定义分类；sleep 类型可带 bedtime/rise_time）
export async function onRequestPost(context) {
  const { env } = context;
  let body = {};
  try {
    body = await context.request.json();
  } catch (_) {}
  const name = String(body.name || '').trim();
  if (!name) return json({ error: '请填写习惯名称' }, 400);

  const type = body.type === 'sleep' ? 'sleep' : 'normal';
  let category = String(body.category || '自定义').trim() || '自定义';
  if (category === '__custom__') category = String(body.customCategory || '').trim() || '自定义';
  const icon = String(body.icon || 'sprout').trim() || 'sprout';
  const color = String(body.color || 'sage').trim() || 'sage';
  const bed_time = type === 'sleep' ? String(body.bed_time || '' ).trim() : null;
  const rise_time = type === 'sleep' ? String(body.rise_time || '').trim() : null;

  const res = await env.DB.prepare(
    'INSERT INTO habits(name, icon, color, target, unit, category, type, bed_time, rise_time) VALUES (?,?,?,1,?,?,?,?,?)'
  )
    .bind(name, icon, color, '次', category, type, bed_time, rise_time)
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
      bed_time: created.bed_time || '',
      rise_time: created.rise_time || '',
      today: progressOf(created, null),
    },
  }, 201);
}
