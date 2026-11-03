import { json, todayStr } from '../_lib.js';
import { loadCatTree } from './txn-categories.js';
import { generateDue } from './recurring.js';
import { listTxnAccountRows } from './txn-accounts.js';

// 默认账户（v0.5.45 起预置清单只作 txn_accounts 表缺失时的回退）
export const ACCOUNTS = ['默认账户', '现金', '微信', '支付宝', '银行卡', '信用卡', '医保卡', '人情往来'];

// 「YYYY-MM」加减月份
function shiftMonth(month, delta) {
  const [y, m] = String(month).split('-').map(Number);
  const d = new Date(y, (m - 1) + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// 月份 → [月初, 下月初) 半开区间。用列的边界比较替代 strftime('%Y-%m', 列)，
// 后者函数包列会让 idx_txn_date 失效（全表扫描）
function monthRange(month) {
  return [month + '-01', shiftMonth(month, 1) + '-01'];
}

// 记账字段统一清洗（POST / PUT 共用）
// 返回 null 表示金额无效
export function normalizeTxnBody(body) {
  const flow = ['income', 'expense', 'transfer'].includes(body.flow) ? body.flow : 'expense';
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  let account = String(body.account || '').trim() || '默认账户';
  let toAccount = String(body.to_account || '').trim() || null;
  if (flow === 'transfer') {
    // 转账必须有转出/转入两个账户，且不能相同
    if (!toAccount) return { error: '请选择转入账户' };
    if (toAccount === account) return { error: '转出与转入账户不能相同' };
  } else {
    toAccount = null;
  }
  return {
    flow,
    amount,
    category: flow === 'transfer' ? '转账' : (String(body.category || '').trim() || '其他'),
    subCategory: flow === 'transfer' ? null : (String(body.sub_category || '').trim() || null),
    date: String(body.date || '').trim() || todayStr(),
    time: String(body.time || '').trim().slice(0, 5) || null,
    account,
    toAccount,
    contactId: Number(body.contact_id) || null,
    item: String(body.item || '').trim().slice(0, 40) || null,
    note: String(body.note || '').trim().slice(0, 100) || null,
  };
}

// 账户（v0.5.45：txn_accounts 表为准；未跑迁移/表为空时回退「预置 + 实际用过的」）
export async function listAccounts(env) {
  try {
    const rows = await listTxnAccountRows(env);
    if (rows.length && rows[0].id) return rows.map((r) => r.name);
  } catch (_) { /* 忽略，走回退 */ }
  const accounts = [...ACCOUNTS];
  try {
    const aRows = (
      await env.DB.prepare(
        "SELECT DISTINCT account a FROM transactions WHERE account IS NOT NULL AND account <> '' " +
        'UNION SELECT DISTINCT to_account FROM transactions WHERE to_account IS NOT NULL AND to_account <> \'\''
      ).all()
    ).results || [];
    aRows.forEach((r) => { if (r.a && !accounts.includes(r.a)) accounts.push(r.a); });
  } catch (_) { /* 忽略 */ }
  return accounts;
}

// 默认账户名（记一笔缺省选中）；表缺失时回退「默认账户」
export async function defaultAccountName(env) {
  try {
    const rows = await listTxnAccountRows(env);
    const def = rows.find((r) => r.is_default) || rows[0];
    if (def && def.id) return def.name;
  } catch (_) { /* 忽略 */ }
  return '默认账户';
}

// GET /api/transactions?month=YYYY-MM[&contact_id=123]
// 返回：当月明细 + 收支汇总 + 支出/收入分类占比 + 近 6 个月趋势 + 账户 + 预算 + @人名反查 + 分类树
// 传 contact_id 时：返回该联系人名下全部流水（人际关系 · 财务往来用）
// 传 meta=accounts 时：只返回账户清单（随手记弹记一笔前的轻量预取）
export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  if (url.searchParams.get('meta') === 'accounts') {
    return json({ accounts: await listAccounts(env), default_account: await defaultAccountName(env) });
  }
  const contactId = Number(url.searchParams.get('contact_id')) || null;
  let month = url.searchParams.get('month') || todayStr().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) month = todayStr().slice(0, 7);   // 乱值会使日均/趋势变 NaN

  // ---- 周期账单懒生成（房租/工资等到期自动入账，幂等；仅月度明细模式）----
  let recurringGenerated = 0;
  if (!contactId) {
    try { recurringGenerated = await generateDue(env); } catch (_) { /* 忽略 */ }
  }

  // ---- 账本分类树（自定义，含二级；表为空时回退默认）----
  const catTree = await loadCatTree(env);
  const categories = {
    expense: catTree.expense.map((c) => c.name),
    income: catTree.income.map((c) => c.name),
  };

  const where = contactId ? 'contact_id = ?' : 'txn_date >= ? AND txn_date < ?';
  const rows = (
    await env.DB.prepare(
      `SELECT id, flow, amount, category, sub_category, txn_date, txn_time, account, to_account, contact_id, item, note
       FROM transactions WHERE ${where}
       ORDER BY txn_date DESC, id DESC`
    )
      .bind(...(contactId ? [contactId] : monthRange(month)))
      .all()
  ).results || [];

  const list = rows.map((r) => ({
    id: r.id,
    flow: r.flow,
    amount: Number(r.amount),
    category: r.category || '其他',
    sub: r.sub_category || '',
    date: r.txn_date,
    time: r.txn_time || '',
    account: r.account || '默认账户',
    toAccount: r.to_account || '',
    contactId: r.contact_id || null,
    item: r.item || '',
    note: r.note || '',
  }));

  // ---- 汇总（转账不计入收支）----
  let income = 0;
  let expense = 0;
  const byCat = {};
  const byCatIn = {};
  list.forEach((t) => {
    if (t.flow === 'income') {
      income += t.amount;
      byCatIn[t.category] = (byCatIn[t.category] || 0) + t.amount;
    } else if (t.flow === 'expense') {
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

  // ---- 近 6 个月趋势（含当前月；contact_id 模式不需要）----
  let trend = [];
  if (!contactId) {
    try {
      const tRows = (
        await env.DB.prepare(
          `SELECT substr(txn_date, 1, 7) m,
                  COALESCE(SUM(CASE WHEN flow='income'  THEN amount ELSE 0 END),0) inc,
                  COALESCE(SUM(CASE WHEN flow='expense' THEN amount ELSE 0 END),0) exp
           FROM transactions
           WHERE txn_date >= ? AND txn_date < ?
           GROUP BY m`
        )
          .bind(shiftMonth(month, -5) + '-01', shiftMonth(month, 1) + '-01')
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
  }

  // ---- 账户（v0.5.45：txn_accounts 表；预置 + 实际用过的作为回退，含转账转入账户）----
  const accounts = await listAccounts(env);
  const default_account = await defaultAccountName(env);

  // ---- 「@人名」反查 + 关联联系人（两种都跳转人际关系档案）----
  const payees = {};
  const linked = {};
  try {
    const cRows = (await env.DB.prepare('SELECT id, name FROM contacts').all()).results || [];
    const byId = {};
    cRows.forEach((c) => { byId[c.id] = c.name; });
    const named = cRows.filter((c) => c.name).sort((a, b) => b.name.length - a.name.length);
    list.forEach((t) => {
      if (t.contactId && byId[t.contactId]) linked[t.id] = { id: t.contactId, name: byId[t.contactId] };
      if (!t.note || t.note[0] !== '@') return;
      const hit = named.find((c) => t.note.startsWith('@' + c.name));
      if (hit) payees[t.id] = { id: hit.id, name: hit.name };
    });
  } catch (_) { /* 忽略 */ }

  // ---- 月预算（v0.6.0：总额度沿用 app_settings；新增每分类额度 budgets）----
  let budget = 0;
  try {
    const bRow = await env.DB.prepare("SELECT value FROM app_settings WHERE key='ledger_budget'").first();
    budget = bRow ? Number(bRow.value) || 0 : 0;
  } catch (_) { /* 忽略 */ }
  let budgets = [];
  try {
    const bRows = (await env.DB.prepare('SELECT category, amount FROM budgets WHERE month = ?').bind(month).all()).results || [];
    budgets = bRows.map((b) => {
      const used = byCat[b.category] || 0;
      return { category: b.category, amount: b.amount, used, left: b.amount - used, pct: b.amount > 0 ? used / b.amount : 0 };
    });
    if (!budget && budgets.length) budget = budgets.reduce((s, b) => s + b.amount, 0);
  } catch (_) { /* 忽略 */ }

  // ---- 本月人情往来小结（人际关系页联动展示）----
  const social = { out: 0, in: 0, count: 0 };
  list.forEach((t) => {
    if (t.flow === 'transfer') return;
    if (t.account === '人情往来' || t.category === '人情' || t.category === '借还款') {
      social.count += 1;
      if (t.flow === 'income') social.in += t.amount;
      else social.out += t.amount;
    }
  });

  // contact_id 模式：只要明细与合计（人际关系档案 · 财务往来）
  if (contactId) {
    return json({
      contactId,
      list,
      summary: { income, expense, balance: income - expense, count: list.length },
      categories,
    });
  }

  const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  // 日均按「已经过的天数」算才真实：当月取今天几号，历史/未来月份取整月天数
  const todayFull = todayStr();
  const effDays = month === todayFull.slice(0, 7) ? Number(todayFull.slice(8, 10)) : daysInMonth;

  return json({
    month,
    list,
    summary: {
      income,
      expense,
      balance: income - expense,
      count: list.length,
      avgDaily: expense / Math.max(1, effDays),
      maxExpense: list.filter((t) => t.flow === 'expense').reduce((a, t) => Math.max(a, t.amount), 0),
    },
    catStats,
    incomeCatStats,
    trend,
    accounts,
    default_account,
    payees,
    linked,
    budget,
    budgets,
    recurringGenerated,
    social,
    categories,
    catTree,
  });
}

// POST /api/transactions —— 记一笔（支出 / 收入 / 转账）
export async function onRequestPost(context) {
  const { env, request } = context;
  let body = {};
  try { body = await request.json(); } catch (_) {}

  const t = normalizeTxnBody(body);
  if (!t) return json({ error: '请填写有效金额' }, 400);
  if (t.error) return json({ error: t.error }, 400);

  const res = await env.DB.prepare(
    `INSERT INTO transactions(flow, amount, category, sub_category, txn_date, txn_time, account, to_account, contact_id, item, note)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  )
    .bind(t.flow, t.amount, t.category, t.subCategory, t.date, t.time, t.account, t.toAccount, t.contactId, t.item, t.note)
    .run();
  const id = res.meta && res.meta.last_row_id ? res.meta.last_row_id : null;
  return json({ ok: true, id }, 201);
}
