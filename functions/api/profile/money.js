import { json, todayStr } from '../../_lib.js';

// ===== 人情账（与 transactions 对接：category='人情'，note 自动 @人名） =====

// POST /api/profile/money {person_id, type, amount, date, note}
// type: gift_out送出 / gift_in收到 / lend借出 / repay还款 / aa AA结算
export async function onRequestPost(context) {
  const { env, request } = context;
  let b = {};
  try { b = await request.json(); } catch (_) {}
  const personId = Number(b.person_id);
  const amount = Number(b.amount);
  const type = String(b.type || 'gift_out');
  if (!personId) return json({ error: '缺少 person_id' }, 400);
  if (!Number.isFinite(amount) || amount <= 0) return json({ error: '请填写有效金额' }, 400);

  const date = String(b.date || '').trim() || todayStr();
  const person = await env.DB.prepare('SELECT name FROM contacts WHERE id=?').bind(personId).first();
  const pname = person ? person.name : '';
  const note = String(b.note || '').trim();

  const res = await env.DB.prepare(
    'INSERT INTO contact_money(person_id,type,amount,date,note) VALUES (?,?,?,?,?)'
  ).bind(personId, type, amount, date, note).run();
  const id = res.meta && res.meta.last_row_id;

  // 同步写入账本：支出类记expense，收入类记income；备注 @人物名 便于账本反查
  const isIn = type === 'gift_in';
  const catName = type === 'lend' || type === 'repay' ? '借还款' : '人情';
  const txnNote = `@${pname}${note ? ' ' + note : ''}`;
  const t = await env.DB.prepare(
    `INSERT INTO transactions(flow,amount,category,txn_date,note,account) VALUES (?,?,?,?,?,'人情往来')`
  ).bind(isIn ? 'income' : 'expense', amount, catName, date, txnNote).run();
  await env.DB.prepare('UPDATE contact_money SET txn_id=? WHERE id=?').bind(t.meta && t.meta.last_row_id, id).run();

  return json({ ok: true, id, txnId: t.meta && t.meta.last_row_id }, 201);
}

// DELETE /api/profile/money?id=3
export async function onRequestDelete(context) {
  const { env, request } = context;
  const u = new URL(request.url);
  const id = Number(u.searchParams.get('id'));
  if (!id) return json({ error: '缺少 id' }, 400);
  const row = await env.DB.prepare('SELECT txn_id FROM contact_money WHERE id=?').bind(id).first();
  if (row && row.txn_id) await env.DB.prepare('DELETE FROM transactions WHERE id=?').bind(row.txn_id).run();
  await env.DB.prepare('DELETE FROM contact_money WHERE id=?').bind(id).run();
  return json({ ok: true, id });
}