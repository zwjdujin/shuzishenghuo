import { json, todayStr } from '../_lib.js';

// 周期账单：账本页打开时懒生成到期账单（幂等：next_date 只前进）
// 供本文件 GET 与 transactions.js GET（打开账本时）共用
export async function generateDue(env) {
  const today = todayStr();
  const due = (await env.DB.prepare(
    'SELECT * FROM recurring WHERE active=1 AND next_date <= ?'
  ).bind(today).all().catch(() => ({ results: [] }))).results || [];
  if (!due.length) return 0;

  // v0.5.46 防双记：先乐观锁抢占（仅当 next_date 仍是读到的值时才推进），
  // 抢到才算本次生成——两个并发 GET 只会有一个真正入账。先推进后插入：
  // 若推进与插入之间进程中断，该期跳过（优于双记），下期照常。
  const stmts = [];
  let claimed = 0;
  for (const r of due) {
    const mod = r.freq === 'weekly' ? "'+7 days'" : r.freq === 'daily' ? "'+1 day'" : "'+1 month'";
    const claim = await env.DB.prepare(
      `UPDATE recurring SET next_date = date(next_date, ${mod}) WHERE id = ? AND next_date = ?`
    ).bind(r.id, r.next_date).run();
    if (!claim.meta || !claim.meta.changes) continue;
    claimed++;
    stmts.push(env.DB.prepare(
      `INSERT INTO transactions(flow, amount, category, sub_category, txn_date, txn_time, account, note)
       VALUES (?,?,?,?,?,NULL,?,?)`
    ).bind(r.flow, r.amount, r.category || '其他', r.sub_category || null, r.next_date, r.account || '默认账户', r.note || ''));
  }
  if (stmts.length) await env.DB.batch(stmts);
  return claimed;
}

// GET /api/recurring —— 清单（顺带懒生成到期账单，返回本次自动记了几笔）
export async function onRequestGet(context) {
  const { env } = context;
  const generated = await generateDue(env);
  const rows = (await env.DB.prepare(
    'SELECT id, flow, amount, category, sub_category, account, note, freq, next_date, active FROM recurring ORDER BY active DESC, next_date'
  ).all().catch(() => ({ results: [] }))).results || [];
  return json({
    generated,
    list: rows.map((r) => ({
      id: r.id, flow: r.flow, amount: r.amount, category: r.category || '',
      sub: r.sub_category || '', account: r.account || '默认账户', note: r.note || '',
      freq: r.freq, next: r.next_date, active: !!r.active,
    })),
  });
}

// POST /api/recurring —— 新建周期账单
export async function onRequestPost(context) {
  const { env, request } = context;
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const flow = body.flow === 'income' ? 'income' : 'expense';
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) return json({ error: '请填写有效金额' }, 400);
  const freq = ['monthly', 'weekly', 'daily'].includes(body.freq) ? body.freq : 'monthly';
  let next = String(body.next || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) return json({ error: '下次日期格式应为 YYYY-MM-DD' }, 400);
  if (next > todayStr()) { /* 允许未来起算 */ }
  const res = await env.DB.prepare(
    `INSERT INTO recurring(flow, amount, category, sub_category, account, note, freq, next_date)
     VALUES (?,?,?,?,?,?,?,?)`
  ).bind(flow, amount, String(body.category || '其他').slice(0, 20), String(body.sub || '').slice(0, 20) || null,
    String(body.account || '默认账户'), String(body.note || '').slice(0, 60) || null, freq, next).run();
  return json({ ok: true, id: res.meta ? res.meta.last_row_id : null }, 201);
}
