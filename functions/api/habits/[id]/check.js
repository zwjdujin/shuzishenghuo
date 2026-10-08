import { json, todayStr } from '../../../_lib.js';

// POST /api/habits/:id/check
// body: { field: 'done'|'bed'|'rise', value: 0|1 }
// 不给 value 时对该字段做翻转（toggle）
export async function onRequestPost(context) {
  const { env } = context;
  const id = Number(context.params.id);
  if (!id) return json({ error: '无效的习惯 ID' }, 400);

  const habit = await env.DB.prepare('SELECT * FROM habits WHERE id = ?').bind(id).first();
  if (!habit) return json({ error: '习惯不存在' }, 404);

  let body = {};
  try {
    body = await context.request.json();
  } catch (_) {}
  const field = ['done', 'bed', 'rise'].includes(body.field) ? body.field : 'done';

  const today = todayStr();
  const existing = await env.DB.prepare(
    'SELECT * FROM habit_logs WHERE habit_id = ? AND log_date = ?'
  )
    .bind(id, today)
    .first();

  const cur = existing || { done: 0, done_bed: 0, done_rise: 0 };
  let next;
  if (field === 'done') {
    const v = typeof body.value === 'number' ? body.value : cur.done ? 0 : 1;
    next = { ...cur, done: v ? 1 : 0 };
  } else if (field === 'bed') {
    const v = typeof body.value === 'number' ? body.value : cur.done_bed ? 0 : 1;
    next = { ...cur, done_bed: v ? 1 : 0 };
  } else {
    const v = typeof body.value === 'number' ? body.value : cur.done_rise ? 0 : 1;
    next = { ...cur, done_rise: v ? 1 : 0 };
  }

  // sleep 类型的 done 记为完成项数（0~2），normal 直接沿用
  const doneVal = habit.type === 'sleep' ? next.done_bed + next.done_rise : next.done;

  await env.DB.prepare(
    `INSERT INTO habit_logs(habit_id, log_date, done, done_bed, done_rise)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(habit_id, log_date) DO UPDATE SET
       done = excluded.done, done_bed = excluded.done_bed, done_rise = excluded.done_rise`
  )
    .bind(id, today, doneVal, next.done_bed, next.done_rise)
    .run();

  const needed = habit.type === 'sleep' ? 2 : 1;
  const completed =
    habit.type === 'sleep' ? next.done_bed + next.done_rise : next.done;
  return json({
    id,
    field,
    done: next.done,
    done_bed: next.done_bed,
    done_rise: next.done_rise,
    needed,
    completed,
    todayDone: completed >= needed,
  });
}
