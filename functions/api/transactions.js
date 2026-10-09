import { json, todayStr } from '../_lib.js';

const CATEGORIES = {
  expense: ['餐饮', '交通', '购物', '居住', '娱乐', '医疗', '教育', '人情', '其他'],
  income: ['工资', '奖金', '兼职', '理财', '红包', '其他'],
};

// GET /api/transactions?month=YYYY-MM
// 返回当月明细 + 收支汇总 + 分类占比（用于 SVG 环图）
export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const month = url.searchParams.get('month') || todayStr().slice(0, 7);

  const rows = (
    await env.DB.prepare(
      `SELECT id, flow, amount, category, txn_date, note, account
       FROM transactions WHERE strftime('%Y-%m', txn_date) = ?
       ORDER BY txn_date DESC, id DESC`
    )
      .bind(month)
      .all()
  ).results || [];

  const list = rows.map((r) => ({
    id: r.id,
    flow: r.flow,
    amount: Number(r.amount),
    category: r.category || '其他',
    date: r.txn_date,
    note: r.note || '',
    account: r.account || '默认账户',
  }));

  let income = 0;
  let expense = 0;
  const byCat = {};
  list.forEach((t) => {
    if (t.flow === 'income') income += t.amount;
    else {
      expense += t.amount;
      byCat[t.category] = (byCat[t.category] || 0) + t.amount;
    }
  });

  // 分类占比（降序），附占比百分比
  const catStats = Object.keys(byCat)
    .map((name) => ({ name, value: byCat[name], pct: expense > 0 ? byCat[name] / expense : 0 }))
    .sort((a, b) => b.value - a.value);

  return json({
    month,
    list,
    summary: { income, expense, balance: income - expense, count: list.length },
    catStats,
    categories: CATEGORIES,
  });
}

// POST /api/transactions —— 记一笔
export async function onRequestPost(context) {
  const { env, request } = context;
  let body = {};
  try { body = await request.json(); } catch (_) {}

  const flow = body.flow === 'income' ? 'income' : 'expense';
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) return json({ error: '请填写有效金额' }, 400);
  const date = String(body.date || '').trim() || todayStr();
  const category = String(body.category || '').trim() || '其他';
  const note = String(body.note || '').trim() || null;
  const account = String(body.account || '').trim() || '默认账户';

  const res = await env.DB.prepare(
    'INSERT INTO transactions(flow, amount, category, txn_date, note, account) VALUES (?,?,?,?,?,?)'
  )
    .bind(flow, amount, category, date, note, account)
    .run();
  const id = res.meta && res.meta.last_row_id ? res.meta.last_row_id : null;
  return json({ ok: true, id }, 201);
}