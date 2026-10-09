import { json, todayStr } from '../../../_lib.js';

// POST /api/habits/:id/check
// 睡眠类型：{ field: 'bed'|'rise'|'nap' } —— 对该项做翻转（toggle），或 { field, value:0|1 } 显式设值
// 普通类型：{ field: 'done', value: <数字> } —— 在今日 done 上累加（按次 +1 / 按时长 +分钟）；不给 value 默认 +1
export async function onRequestPost(context) {
  const { env } = context;
  const id = Number(context.params.id);
  if (!id) return json({ error: '无效的习惯 ID' }, 400);

  const habit = await env.DB.prepare('SELECT * FROM habits WHERE id = ?').bind(id).first();
  if (!habit) return json({ error: '习惯不存在' }, 404);

  let body = {};
  try { body = await context.request.json(); } catch (_) {}

  const today = todayStr();
  const existing = await env.DB.prepare(
    'SELECT * FROM habit_logs WHERE habit_id = ? AND log_date = ?'
  )
    .bind(id, today)
    .first();

  const cur = existing || { done: 0, done_bed: 0, done_rise: 0, done_nap: 0 };
  let next;

  if (habit.type === 'sleep') {
    const field = ['bed', 'rise', 'nap'].includes(body.field) ? body.field : 'bed';
    const key = field === 'bed' ? 'done_bed' : field === 'rise' ? 'done_rise' : 'done_nap';
    const v = typeof body.value === 'number' ? body.value : cur[key] ? 0 : 1;
    next = { ...cur, [key]: v ? 1 : 0 };
  } else {
    // 普通类型：累加
    let inc = Number(body.value);
    if (!Number.isFinite(inc)) inc = 1;            // 默认 +1（按次打卡）
    if (inc < 0 && -inc > cur.done) inc = -cur.done; // 不允许减成负数
    const newDone = Math.max(0, cur.done + inc);
    next = { ...cur, done: newDone };
  }

  const doneVal =
    habit.type === 'sleep'
      ? next.done_bed + next.done_rise + next.done_nap
      : next.done;

  await env.DB.prepare(
    `INSERT INTO habit_logs(habit_id, log_date, done, done_bed, done_rise, done_nap)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(habit_id, log_date) DO UPDATE SET
       done = excluded.done, done_bed = excluded.done_bed, done_rise = excluded.done_rise, done_nap = excluded.done_nap`
  )
    .bind(id, today, doneVal, next.done_bed, next.done_rise, next.done_nap)
    .run();

  const needed = habit.type === 'sleep' ? 3 : (Number(habit.target) || 1);
  const completed =
    habit.type === 'sleep' ? next.done_bed + next.done_rise + next.done_nap : next.done;

  return json({
    id,
    field: body.field,
    done: next.done,
    done_bed: next.done_bed,
    done_rise: next.done_rise,
    done_nap: next.done_nap,
    needed,
    completed,
    todayDone: completed >= needed,
  });
}
