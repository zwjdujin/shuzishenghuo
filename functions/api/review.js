import { json, todayStr } from '../_lib.js';

// GET /api/review?week=YYYY-Www —— 本周回顾（聚合模板版，无 LLM）
// 周以「周一 ~ 周日」计；不传 week 取本周
function weekRange(weekStr) {
  // weekStr: 'YYYY-Www' → [start, end]（YYYY-MM-DD）
  const m = /^(\d{4})-W(\d{2})$/.exec(weekStr || '');
  if (!m) return null;
  const y = Number(m[1]), w = Number(m[2]);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const day = jan4.getUTCDay() || 7;
  const mon1 = new Date(jan4);
  mon1.setUTCDate(jan4.getUTCDate() - day + 1);      // 当年第一个周一
  const start = new Date(mon1);
  start.setUTCDate(mon1.getUTCDate() + (w - 1) * 7);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const f = (d) => d.toISOString().slice(0, 10);
  return [f(start), f(end)];
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const u = new URL(request.url);
  const today = todayStr();
  // 不传 week：以今天推算本周（ISO 周一始）
  let range = weekRange(u.searchParams.get('week') || '');
  if (!range) {
    const t = new Date(today + 'T00:00:00Z');
    const dow = t.getUTCDay() || 7;
    const start = new Date(t); start.setUTCDate(t.getUTCDate() - dow + 1);
    const end = new Date(start); end.setUTCDate(start.getUTCDate() + 6);
    const f = (d) => d.toISOString().slice(0, 10);
    range = [f(start), f(end)];
  }
  const [from, to] = range;

  const one = async (sql, ...p) => (await env.DB.prepare(sql).bind(...p).first().catch(() => null)) || {};
  const all = async (sql, ...p) => (await env.DB.prepare(sql).bind(...p).all().catch(() => ({ results: [] }))).results || [];

  // 打卡：本周完成天数 / 各习惯完成次数
  const habitDone = await one(
    `SELECT COUNT(*) c FROM habit_logs WHERE log_date BETWEEN ? AND ? AND done > 0`, from, to);
  const habitTotals = await one('SELECT COUNT(*) c FROM habits');
  const habitRows = await all(
    `SELECT hb.name, SUM(h.done) s FROM habit_logs h JOIN habits hb ON hb.id=h.habit_id
     WHERE h.log_date BETWEEN ? AND ? GROUP BY hb.id ORDER BY s DESC LIMIT 5`, from, to);

  // 账本：本周支出/收入 + 分类 Top5
  const txn = await one(
    `SELECT COALESCE(SUM(CASE WHEN flow='expense' THEN amount ELSE 0 END),0) e,
            COALESCE(SUM(CASE WHEN flow='income' THEN amount ELSE 0 END),0) i,
            COUNT(*) n
     FROM transactions WHERE txn_date BETWEEN ? AND ?`, from, to);
  const catTop = await all(
    `SELECT category, SUM(amount) s FROM transactions WHERE flow='expense' AND txn_date BETWEEN ? AND ?
     GROUP BY category ORDER BY s DESC LIMIT 5`, from, to);

  // 待办：本周完成数 / 新增数
  const todosDone = await one(
    `SELECT COUNT(*) c FROM todos WHERE done=1 AND todo_date BETWEEN ? AND ?`, from, to);

  // memo / 事件 / 人际互动
  const memoCnt = await one('SELECT COUNT(*) c FROM memos WHERE memo_date BETWEEN ? AND ?', from, to);
  const evCnt = await one('SELECT COUNT(*) c FROM events WHERE date(start) BETWEEN ? AND ?', from, to);

  return json({
    week: { from, to },
    habits: { doneDays: habitDone.c || 0, total: habitTotals.c || 0, top: habitRows.map((r) => ({ name: r.name, times: r.times || r.s })) },
    ledger: {
      expense: txn.e || 0, income: txn.i || 0, count: txn.n || 0,
      topCats: catTop.map((r) => ({ name: r.category, value: r.s })),
    },
    todos: { done: todosDone.c || 0 },
    memos: memoCnt.c || 0,
    events: evCnt.c || 0,
  });
}
