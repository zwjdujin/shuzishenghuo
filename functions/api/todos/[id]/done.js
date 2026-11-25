import { json, todayStr } from '../../../_lib.js';
import { isYmd } from '../../_validate.js';

// ===== 重复规则 → 下一日期（v0.5.53）====
// 规则：daily | weekdays | weekly:1,3(1=周一…7=周日) | monthly:15 | yearly:0214 | every:14d
function ymdOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function stepOnce(d, rule) {
  if (rule === 'daily') return ymdOf(addDays(d, 1));
  if (rule === 'weekdays') {
    let x = addDays(d, 1);
    while (x.getDay() === 0 || x.getDay() === 6) x = addDays(x, 1);
    return ymdOf(x);
  }
  if (rule.startsWith('weekly:')) {
    const days = rule.slice(7).split(',').map(Number);
    for (let i = 1; i <= 7; i++) {
      const x = addDays(d, i);
      const dow = x.getDay() === 0 ? 7 : x.getDay();
      if (days.includes(dow)) return ymdOf(x);
    }
    return null;
  }
  if (rule.startsWith('monthly:')) {   // 每月 N 日，月末不存在时钳制到最后一天
    const day = Number(rule.slice(8));
    const y = d.getMonth() === 11 ? d.getFullYear() + 1 : d.getFullYear();
    const m = (d.getMonth() + 1) % 12;
    const last = new Date(y, m + 1, 0).getDate();
    return ymdOf(new Date(y, m, Math.min(day, last)));
  }
  if (rule.startsWith('yearly:')) {    // yearly:0214 = 每年 2 月 14 日
    const mm = Number(rule.slice(7, 9));
    const dd = Number(rule.slice(9, 11));
    return ymdOf(new Date(d.getFullYear() + 1, mm - 1, dd));
  }
  if (rule.startsWith('every:')) {     // every:14d = 每 14 天
    return ymdOf(addDays(d, Number(rule.slice(6, -1))));
  }
  return null;
}
// 追赶语义：基准日若已过去，从今天起继续排（完成一次只生成一个下一实例）
// v0.5.56（审计 P2-16）：下一实例「严格晚于今天」。此前条件是 next >= today——逾期的重复任务
// （昨天该做没做）今天一完成，立刻又冒出一条今天到期的同名任务，「完成」看起来没生效。
// 现在以今天为锚点向后排第一个符合规则的日子；提前完成未来日期的任务仍按其自身日期推进。
function nextRepeatDate(from, rule, today) {
  if (!isYmd(from || '')) return null;
  let cursor = new Date((from > today ? from : today) + 'T00:00:00');
  for (let guard = 0; guard < 500; guard++) {
    const next = stepOnce(cursor, rule);
    if (!next) return null;
    if (next > today) return next;
    cursor = new Date(next + 'T00:00:00');
  }
  return null;
}

export async function onRequestPost(context) {
  const { env, params } = context;
  const id = params && params.id;
  if (!id) return json({ error: '缺少 id' }, 400);

  // v0.5.56（审计 P2-16）：先「抢占」再生成。UPDATE 带 AND done=0，只有真正把 done 从 0 改成 1 的
  // 那次请求才负责生成下一实例。此前是「查 done=0 → 插入下一实例 → 无条件 UPDATE」：连点 / 弱网重试时
  // 两个请求都查到未完成、各插一条，重复任务从此每次完成都翻倍。
  const claim = await env.DB.prepare(
    "UPDATE todos SET done=1, completed_at=datetime('now','localtime') WHERE id=? AND done=0"
  ).bind(id).run();
  const changes = (claim.meta && Number(claim.meta.changes)) || 0;
  if (!changes) return json({ ok: true, changes: 0 });   // 已被并发的另一次请求完成，或本就不存在

  // v0.5.53 重复任务：完成时生成下一实例（微软 To Do 行为），步骤一并克隆；新实例不自动进「我的一天」
  const row = await env.DB.prepare(
    'SELECT id, title, todo_date, todo_time, list, priority, important, urgent, note, remind, star, repeat_rule FROM todos WHERE id=?'
  ).bind(id).first();
  if (!row || !row.repeat_rule) return json({ ok: true, changes, nextId: null, nextDate: null });

  const nextDate = nextRepeatDate(row.todo_date, row.repeat_rule, todayStr());
  if (!nextDate) return json({ ok: true, changes, nextId: null, nextDate: null });

  let nextId = null;
  try {
    const ins = await env.DB.prepare(
      'INSERT INTO todos(title, todo_date, todo_time, list, priority, important, urgent, note, remind, done, star, my_day_date, repeat_rule) VALUES (?,?,?,?,?,?,?,?,?,0,?,?,?)'
    )
      .bind(row.title, nextDate, row.todo_time, row.list, row.priority, row.important, row.urgent, row.note, row.remind, row.star, '', row.repeat_rule)
      .run();
    nextId = (ins.meta && ins.meta.last_row_id) || null;
    const steps = (await env.DB.prepare('SELECT content FROM todo_steps WHERE todo_id=? ORDER BY sort_order, id').bind(id).all()).results || [];
    if (nextId && steps.length) {
      await env.DB.batch(steps.map((s, i) => env.DB.prepare('INSERT INTO todo_steps(todo_id, content, done, sort_order) VALUES (?, ?, 0, ?)').bind(nextId, s.content, i)));
    }
  } catch (e) {
    // 下一实例没生成成功 → 撤回「已完成」，让用户可以重试：宁可少标一次完成，也不能把下一期弄丢
    await env.DB.prepare('UPDATE todos SET done=0, completed_at=NULL WHERE id=?').bind(id).run().catch(() => {});
    console.error('repeat next instance failed:', e && e.message);
    return json({ error: '标记完成失败，请重试' }, 500);
  }
  return json({ ok: true, changes, nextId, nextDate });
}
