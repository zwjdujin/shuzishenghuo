import { json } from '../_lib.js';

// ===== v0.5.45 账本账户设置（txn_accounts 表） =====
// GET  /api/txn-accounts           → { accounts: [{id,name,is_default}], default }
// POST /api/txn-accounts {name}    → 新增账户
// PUT  /api/txn-accounts {ids}     → 批量排序（按数组顺序写 sort_order）
// PUT/DELETE /api/txn-accounts/:id → 重命名 / 设默认 / 删除（见 [id].js）

// 未跑迁移（表不存在）时的回退清单
export const FALLBACK_ACCOUNTS = ['默认账户', '现金', '微信', '支付宝', '银行卡', '信用卡', '医保卡', '人情往来'];

/** 全量账户行；表为空或未跑迁移时回退预置清单（id=0 标记回退，不可管理） */
export async function listTxnAccountRows(env) {
  try {
    const rows = (await env.DB.prepare('SELECT id, name, is_default FROM txn_accounts ORDER BY sort_order, id').all()).results || [];
    if (rows.length) return rows;
  } catch (_) { /* 未迁移：回退 */ }
  return FALLBACK_ACCOUNTS.map((name, i) => ({ id: 0, name, is_default: i === 0 ? 1 : 0 }));
}

export async function onRequestGet(context) {
  const rows = await listTxnAccountRows(context.env);
  const def = rows.find((r) => r.is_default) || rows[0] || { name: '默认账户' };
  return json({ accounts: rows, default: def.name });
}

export async function onRequestPost(context) {
  const { env, request } = context;
  let b = {};
  try { b = await request.json(); } catch (_) {}
  const name = String(b.name || '').replace(/[,，]/g, '').trim().slice(0, 12);
  if (!name) return json({ error: '请填写账户名称' }, 400);
  const dup = await env.DB.prepare('SELECT id FROM txn_accounts WHERE name = ?').bind(name).first();
  if (dup) return json({ error: '已有同名账户' }, 409);
  const m = await env.DB.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM txn_accounts').first();
  const res = await env.DB.prepare('INSERT INTO txn_accounts(name, sort_order) VALUES (?, ?)')
    .bind(name, ((m && m.m) || -1) + 1).run();
  return json({ ok: true, id: res.meta && res.meta.last_row_id }, 201);
}

// PUT —— 批量排序 { ids: [id, ...] }（按数组顺序写 sort_order）
export async function onRequestPut(context) {
  const { env, request } = context;
  let b = {};
  try { b = await request.json(); } catch (_) {}
  if (!Array.isArray(b.ids) || !b.ids.length) return json({ error: '没有要排序的账户' }, 400);
  const stmt = env.DB.prepare('UPDATE txn_accounts SET sort_order = ? WHERE id = ?');
  await env.DB.batch(b.ids.map((id, i) => stmt.bind(i, Number(id))));
  return json({ ok: true });
}
