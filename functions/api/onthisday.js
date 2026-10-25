import { json, todayStr } from '../_lib.js';

// GET /api/onthisday —— 「那年今天」：历史上同月同日的数据回顾
// 返回按年分组的打卡 / 流水 / 待办（当年完成）/ 事件 / memo
export async function onRequestGet(context) {
  const { env } = context;
  const today = todayStr();                       // YYYY-MM-DD
  const md = today.slice(5);                      // MM-DD
  const y = Number(today.slice(0, 4));

  const rows = async (sql, ...params) =>
    (await env.DB.prepare(sql).bind(...params).all().catch(() => ({ results: [] }))).results || [];

  // 打卡（含习惯名）：habit_logs.log_date LIKE '%-MM-DD'
  const habits = await rows(
    `SELECT h.log_date d, h.done, h.note, hb.name habit, hb.unit
     FROM habit_logs h JOIN habits hb ON hb.id = h.habit_id
     WHERE h.log_date LIKE ? AND h.done > 0 ORDER BY h.log_date DESC LIMIT 40`,
    `%-${md}`
  );
  // 流水：当年同日的支出/收入合计 + 笔数 + Top 明细
  const txns = await rows(
    `SELECT txn_date d, COUNT(*) n,
       COALESCE(SUM(CASE WHEN flow='expense' THEN amount ELSE 0 END),0) exp,
       COALESCE(SUM(CASE WHEN flow='income'  THEN amount ELSE 0 END),0) inc
     FROM transactions WHERE txn_date LIKE ? GROUP BY txn_date ORDER BY txn_date DESC`,
    `%-${md}`
  );
  const txnItems = await rows(
    `SELECT txn_date d, flow, amount, category, note, item FROM transactions
     WHERE txn_date LIKE ? ORDER BY txn_date DESC, id DESC LIMIT 20`,
    `%-${md}`
  );
  // 完成的待办
  const todos = await rows(
    `SELECT todo_date d, title FROM todos WHERE done=1 AND todo_date LIKE ? ORDER BY todo_date DESC LIMIT 20`,
    `%-${md}`
  );
  // 事件
  const events = await rows(
    `SELECT start d, title, calendar FROM events WHERE start LIKE ? ORDER BY start DESC LIMIT 20`,
    `%-${md}%`
  );
  // memo
  const memos = await rows(
    `SELECT memo_date d, content FROM memos WHERE memo_date LIKE ? ORDER BY id DESC LIMIT 20`,
    `%-${md}`
  );

  // 按年分组（排除今年：今天还没过完）
  const byYear = {};
  const push = (year, kind, item) => {
    if (!byYear[year]) byYear[year] = { year, habits: [], txns: [], txnItems: [], todos: [], events: [], memos: [] };
    byYear[year][kind].push(item);
  };
  habits.forEach((r) => push(r.d.slice(0, 4), 'habits', { date: r.d, habit: r.habit, done: r.done, unit: r.unit, note: r.note || '' }));
  txns.forEach((r) => push(r.d.slice(0, 4), 'txns', { date: r.d, count: r.n, expense: r.exp, income: r.inc }));
  txnItems.forEach((r) => push(r.d.slice(0, 4), 'txnItems', { date: r.d, flow: r.flow, amount: r.amount, category: r.category, note: r.note || r.item || '' }));
  todos.forEach((r) => push(r.d.slice(0, 4), 'todos', { date: r.d, title: r.title }));
  events.forEach((r) => push(r.d.slice(0, 4), 'events', { date: r.d.slice(0, 10), title: r.title, calendar: r.calendar }));
  memos.forEach((r) => push(r.d.slice(0, 4), 'memos', { date: r.d, content: r.content }));

  const years = Object.values(byYear)
    .filter((g) => Number(g.year) < y || g.habits.length || g.txns.length || g.todos.length || g.events.length || g.memos.length)
    .sort((a, b) => b.year - a.year);

  return json({ today, years });
}
