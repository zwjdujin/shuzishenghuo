import { json, todayStr } from '../_lib.js';

// 账本分类（支出 / 收入）
export const CATEGORIES = {
  expense: ['餐饮', '交通', '购物', '居住', '娱乐', '医疗', '教育', '人情', '借还款', '其他'],
  income: ['工资', '奖金', '兼职', '理财', '红包', '其他'],
};

// 常用账户
export const ACCOUNTS = ['默认账户', '现金', '微信', '支付宝', '银行卡', '信用卡', '医保卡', '人情往来'];

// 「YYYY-MM」加减月份
function shiftMonth(month, delta) {
  const [y, m] = String(month).split('-').map(Number);
  const d = new Date(y, (m - 1) + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// GET /api/transactions?month=YYYY-MM
// 返回：当月明细 + 收支汇总 + 支出/收入分类占比 + 近 6 个月趋势 + 账户 + 预算 + @人名反查
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
  const byCatIn = {};
  list.forEach((t) => {
    if (t.flow === 'income') {
      income += t.amount;
      byCatIn[t.category] = (byCatIn[t.category] || 0) + t.amount;
    } else {
      expense += t.amount;
      byCat[t.category] = (byCat[t.category] || 0) + t.amount;
    }
  });

  const toStats = (obj, base) =>
    Object.keys(obj)
      .map((name) => ({ name, value: obj[name], pct: base > 0 ? obj[name] / base : 0 }))
      .sort((a, b) => b.value - a.value);

  const catStats = toStats(byCat, expense);
  const incomeCatStats = toStats(byCatIn, income);

  // ---- 近 6 个月趋势（含当前月）----
  const from = shiftMonth(month, -5);
  let trend = [];
  try {
    const tRows = (
      await env.DB.prepare(
        `SELECT strftime('%Y-%m', txn_date) m,
                COALESCE(SUM(CASE WHEN flow='income'  THEN amount ELSE 0 END),0) inc,
                COALESCE(SUM(CASE WHEN flow='expense' THEN amount ELSE 0 END),0) exp
         FROM transactions
         WHERE strftime('%Y-%m', txn_date) >= ? AND strftime('%Y-%m', txn_date) <= ?
         GROUP BY m`
      )
        .bind(from, month)
        .all()
    ).results || [];
    const map = {};
    tRows.forEach((r) => { map[r.m] = { income: Number(r.inc), expense: Number(r.exp) }; });
    for (let i = 5; i >= 0; i--) {
      const k = shiftMonth(month, -i);
      const v = map[k] || { income: 0, expense: 0 };
      trend.push({ month: k, income: v.income, expense: v.expense, balance: v.income - v.expense });
    }
  } catch (_) {
    trend = [];
  }

  // ---- 账户（预置 + 实际用过的）----
  const accounts = [...ACCOUNTS];
  try {
    const aRows = (
      await env.DB.prepare(
        "SELECT DISTINCT account FROM transactions WHERE account IS NOT NULL AND account <> ''"
      ).all()
    ).results || [];
    aRows.forEach((r) => { if (!accounts.includes(r.account)) accounts.push(r.account); });
  } catch (_) { /* 忽略 */ }

  // ---- 「@人名」反查联系人 id（人情 / 借还款流水可跳转人际关系档案）----
  const payees = {};
  try {
    const cRows = (await env.DB.prepare('SELECT id, name FROM contacts').all()).results || [];
    const named = cRows.filter((c) => c.name).sort((a, b) => b.name.length - a.name.length);
    list.forEach((t) => {
      if (!t.note || t.note[0] !== '@') return;
      const hit = named.find((c) => t.note.startsWith('@' + c.name));
      if (hit) payees[t.id] = { id: hit.id, name: hit.name };
    });
  } catch (_) { /* 忽略 */ }

  // ---- 月预算 ----
  let budget = 0;
  try {
    const bRow = await env.DB.prepare("SELECT value FROM app_settings WHERE key='ledger_budget'").first();
    budget = bRow ? Number(bRow.value) || 0 : 0;
  } catch (_) { /* 忽略 */ }

  // ---- 本月人情往来小结（人际关系页联动展示）----
  const social = { out: 0, in: 0, count: 0 };
  list.forEach((t) => {
    if (t.account === '人情往来' || t.category === '人情' || t.category === '借还款') {
      social.count += 1;
      if (t.flow === 'income') social.in += t.amount;
      else social.out += t.amount;
    }
  });

  const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();

  return json({
    month,
    list,
    summary: {
      income,
      expense,
      balance: income - expense,
      count: list.length,
      avgDaily: expense / daysInMonth,
      maxExpense: list.filter((t) => t.flow === 'expense').reduce((a, t) => Math.max(a, t.amount), 0),
    },
    catStats,
    incomeCatStats,
    trend,
    accounts,
    payees,
    budget,
    social,
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
