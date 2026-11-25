import { json, todayStr } from '../_lib.js';
import { cleanAmount, cleanDate, dateArg } from './_validate.js';

// ===== v0.5.56（审计 P2-15）：月度周期账单的「下一期」改在 JS 里算 =====
// 之前用 SQLite 的 date(next_date,'+1 month')：它是「向上归一化」——1 月 31 日加一个月没有 31 号，
// 直接溢到 3 月 3 日，此后永久停在每月 3 日，整个 2 月被漏掉
// （https://www.sqlite.org/lang_datefunc.html）。现在记住「锚定日」（建单那天的「日」，
// 存 recurring.anchor_day，迁移 0017 回填；列不存在时退回 next_date 自身的「日」），
// 每月钳到当月最后一天：1-31 → 2-28 → 3-31。
const MAX_CATCHUP = 24;   // 单次最多补 24 期（两年的月度账单）：积压太久时不把一个事务撑爆

const pad2 = (n) => String(n).padStart(2, '0');
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** 从 base（YYYY-MM-DD）前进 n 个月，落在 anchor 日（当月没有该日则取最后一天） */
export function addMonthsAnchored(base, n, anchor) {
  const [y, m, d] = base.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ty = Math.floor(total / 12);
  const tm = (total % 12) + 1;
  const day = Math.min(anchor || d, daysInMonth(ty, tm));
  return `${ty}-${pad2(tm)}-${pad2(day)}`;
}

/** 下一期日期（UTC 算术，不受运行时本地时区影响）；脏日期返回 null */
export function nextDateOf(cur, freq, anchor) {
  if (!cleanDate(cur)) return null;
  if (freq === 'weekly' || freq === 'daily') {
    const t = Date.parse(cur + 'T00:00:00Z') + (freq === 'weekly' ? 7 : 1) * 86400000;
    return new Date(t).toISOString().slice(0, 10);
  }
  return addMonthsAnchored(cur, 1, anchor);
}

// 周期账单：账本页打开时懒生成到期账单（幂等：next_date 只前进）
// 供本文件 GET 与 transactions.js GET（打开账本时）共用
export async function generateDue(env) {
  const today = todayStr();
  const due = (await env.DB.prepare(
    'SELECT * FROM recurring WHERE active=1 AND next_date <= ?'
  ).bind(today).all().catch(() => ({ results: [] }))).results || [];
  if (!due.length) return 0;

  // v0.5.56 账户自愈：周期账单按「账户名」引用，账户被改名/删除后旧值会继续生成「幽灵账户」流水
  // （账本账户下拉里没有它，统计却算它）。入账时校验一次：不在账户表里的挂到当前默认账户。
  // 账户表不可用（迁移未跑）时 accountOk 为 null，按原值入账，与旧行为一致。
  let accountOk = null;
  let defaultAccount = '默认账户';
  try {
    const accts = (await env.DB.prepare('SELECT name, is_default FROM txn_accounts').all()).results || [];
    if (accts.length) {
      accountOk = new Set(accts.map((a) => a.name));
      const def = accts.find((a) => a.is_default);
      if (def) defaultAccount = def.name;
    }
  } catch (_) { /* 账户表不存在：保持 null */ }

  const stmts = [];
  let claimed = 0;
  for (const r of due) {
    // v0.5.56：积压多期一次补齐。之前每次请求只推进一期（停用三个月后要点三次才追上），
    // 上限 MAX_CATCHUP 期；遇到脏日期（next_date 不是有效日历日）直接停，不让单个坏行拖垮整批。
    const periods = [];
    let cur = r.next_date;
    for (let i = 0; i < MAX_CATCHUP && cleanDate(cur) && cur <= today; i++) {
      periods.push(cur);
      const next = nextDateOf(cur, r.freq, r.anchor_day);
      if (!next || next <= cur) break;   // 不再前进（脏数据）→ 停，防死循环
      cur = next;
    }
    if (!periods.length) continue;

    // v0.5.46 防双记（保留）：先乐观锁抢占——仅当 next_date 仍是读到的值时才推进，
    // 抢到才算本次生成，两个并发请求只会有一个真正入账。先推进后插入：
    // 若推进与插入之间进程中断，该期跳过（优于双记），下期照常。
    const claim = await env.DB.prepare(
      'UPDATE recurring SET next_date = ? WHERE id = ? AND next_date = ?'
    ).bind(cur, r.id, r.next_date).run();
    if (!claim.meta || !claim.meta.changes) continue;
    claimed += periods.length;

    const want = r.account || '默认账户';
    const account = accountOk && !accountOk.has(want) ? defaultAccount : want;
    for (const d of periods) {
      stmts.push(env.DB.prepare(
        `INSERT INTO transactions(flow, amount, category, sub_category, txn_date, txn_time, account, note)
         VALUES (?,?,?,?,?,NULL,?,?)`
      ).bind(r.flow, r.amount, r.category || '其他', r.sub_category || null, d, account, r.note || ''));
    }
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
  // v0.5.56：金额与日期做语义校验（此前脏日期会让自动入账循环中断、错误被吞）
  const amount = cleanAmount(body.amount);
  if (amount === null) return json({ error: '请填写有效金额' }, 400);
  const freq = ['monthly', 'weekly', 'daily'].includes(body.freq) ? body.freq : 'monthly';
  const d = dateArg(body.next, null, '下次日期');
  if (d.error) return json({ error: d.error }, 400);
  const next = d.date;
  if (!next) return json({ error: '请填写下次日期（YYYY-MM-DD）' }, 400);
  const account = String(body.account || '默认账户').trim().slice(0, 20) || '默认账户';

  const cols = 'flow, amount, category, sub_category, account, note, freq, next_date';
  const vals = [
    flow, amount, String(body.category || '其他').slice(0, 20), String(body.sub || '').slice(0, 20) || null,
    account, String(body.note || '').slice(0, 60) || null, freq, next,
  ];
  let res;
  try {
    // 迁移 0017 已执行：同时记下锚定日（月末账单不漂移）
    res = await env.DB.prepare(`INSERT INTO recurring(${cols}, anchor_day) VALUES (?,?,?,?,?,?,?,?,?)`)
      .bind(...vals, Number(next.slice(8, 10))).run();
  } catch (_) {
    // 迁移还没跑（列不存在）：退回不记锚定日的旧写法，功能不受影响
    res = await env.DB.prepare(`INSERT INTO recurring(${cols}) VALUES (?,?,?,?,?,?,?,?)`).bind(...vals).run();
  }
  return json({ ok: true, id: res.meta ? res.meta.last_row_id : null }, 201);
}
