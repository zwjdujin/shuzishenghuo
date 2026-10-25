import { json, todayStr } from '../_lib.js';

// GET /api/budgets?month=YYYY-MM —— 每分类：额度 + 当月已花 + 剩余
export async function onRequestGet(context) {
  const { env, request } = context;
  const month = (new URL(request.url).searchParams.get('month') || todayStr().slice(0, 7)).slice(0, 7);

  const buds = (await env.DB.prepare(
    'SELECT category, amount FROM budgets WHERE month = ? ORDER BY category'
  ).bind(month).all().catch(() => ({ results: [] }))).results || [];

  const spent = (await env.DB.prepare(
    "SELECT category, COALESCE(SUM(amount),0) s FROM transactions WHERE flow='expense' AND strftime('%Y-%m', txn_date)=? GROUP BY category"
  ).bind(month).all().catch(() => ({ results: [] }))).results || [];
  const spentMap = {};
  spent.forEach((r) => (spentMap[r.category] = r.s));

  const list = buds.map((b) => {
    const used = spentMap[b.category] || 0;
    return { category: b.category, amount: b.amount, used, left: b.amount - used, pct: b.amount > 0 ? used / b.amount : 0 };
  });
  return json({ month, list });
}

// PUT /api/budgets —— 设置某分类当月额度 { category, month?, amount }（amount=0 删除）
export async function onRequestPut(context) {
  const { env, request } = context;
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const category = String(body.category || '').trim().slice(0, 20);
  const month = String(body.month || todayStr().slice(0, 7)).slice(0, 7);
  const amount = Number(body.amount);
  if (!category) return json({ error: '缺少分类' }, 400);
  if (!/^\d{4}-\d{2}$/.test(month)) return json({ error: '月份格式应为 YYYY-MM' }, 400);
  if (!Number.isFinite(amount) || amount < 0) return json({ error: '额度无效' }, 400);
  if (amount === 0) {
    await env.DB.prepare('DELETE FROM budgets WHERE category=? AND month=?').bind(category, month).run();
    return json({ ok: true, removed: true });
  }
  await env.DB.prepare(
    'INSERT INTO budgets(category, month, amount) VALUES (?,?,?) ON CONFLICT(category, month) DO UPDATE SET amount=excluded.amount'
  ).bind(category, month, amount).run();
  return json({ ok: true });
}
