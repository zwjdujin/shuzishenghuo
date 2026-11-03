import { json } from '../../_lib.js';

// /api/txn-accounts/:id —— 重命名（PUT name）/ 设默认（PUT is_default）/ 删除（DELETE）
// 必须导出 onRequest 并用 pathname 解析 id（Pages Functions 的 [id].js 取不到 context.params.id）
// 「人情往来」为人际归并专用账户（统计与前端按名判断），禁止重命名与删除。

const PROTECTED = '人情往来';

export async function onRequest(context) {
  const method = (context.request && context.request.method) || 'GET';
  const url = new URL(context.request.url);
  const m = url.pathname.match(/\/txn-accounts\/(\d+)/);
  const id = Number(m ? m[1] : url.searchParams.get('id'));
  if (!id) return json({ error: '缺少账户 ID' }, 400);
  if (method === 'PUT') return update(context.env, id, context.request);
  if (method === 'DELETE') return remove(context.env, id);
  return json({ error: '不支持的请求方法' }, 405);
}

// PUT —— 局部更新：可传 name（重命名，联动历史流水）和/或 is_default（设为默认账户）
async function update(env, id, request) {
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const hasName = body.name !== undefined;
  const hasDef = body.is_default !== undefined;
  if (!hasName && !hasDef) return json({ error: '没有要更新的字段' }, 400);
  const row = await env.DB.prepare('SELECT id, name FROM txn_accounts WHERE id = ?').bind(id).first();
  if (!row) return json({ error: '账户不存在' }, 404);

  if (hasName && String(body.name).trim() !== row.name) {
    if (row.name === PROTECTED) return json({ error: '「人情往来」为人际归并专用账户，不可重命名' }, 400);
    const name = String(body.name || '').replace(/[,，]/g, '').trim().slice(0, 12);
    if (!name) return json({ error: '请填写账户名称' }, 400);
    const dup = await env.DB.prepare('SELECT id FROM txn_accounts WHERE name = ? AND id <> ?').bind(name, id).first();
    if (dup) return json({ error: '已有同名账户' }, 409);
    // 重命名同步历史流水（付款账户与转账转入账户两列）
    await env.DB.batch([
      env.DB.prepare('UPDATE txn_accounts SET name = ? WHERE id = ?').bind(name, id),
      env.DB.prepare('UPDATE transactions SET account = ? WHERE account = ?').bind(name, row.name),
      env.DB.prepare('UPDATE transactions SET to_account = ? WHERE to_account = ?').bind(name, row.name),
    ]);
  }
  if (hasDef && body.is_default) {
    await env.DB.batch([
      env.DB.prepare('UPDATE txn_accounts SET is_default = 0'),
      env.DB.prepare('UPDATE txn_accounts SET is_default = 1 WHERE id = ?').bind(id),
    ]);
    return json({ ok: true, default: row.name });
  }
  return json({ ok: true });
}

// DELETE —— 删除账户；历史流水（付款与转账转入）归并到默认账户；
// 删除的若是默认账户，则默认先移交给排位最靠前的其他账户，流水归并到新默认。
async function remove(env, id) {
  const row = await env.DB.prepare('SELECT id, name, is_default FROM txn_accounts WHERE id = ?').bind(id).first();
  if (!row) return json({ error: '账户不存在' }, 404);
  if (row.name === PROTECTED) return json({ error: '「人情往来」为人际归并专用账户，不可删除' }, 400);

  const others = (await env.DB.prepare('SELECT name FROM txn_accounts WHERE id <> ? ORDER BY sort_order, id').bind(id).all()).results || [];
  if (!others.length) return json({ error: '至少保留一个账户' }, 400);
  const mergeTo = row.is_default ? others[0].name : (others.find((o) => o.name === '默认账户') || others[0]).name;

  await env.DB.batch([
    env.DB.prepare('UPDATE transactions SET account = ? WHERE account = ?').bind(mergeTo, row.name),
    env.DB.prepare('UPDATE transactions SET to_account = ? WHERE to_account = ?').bind(mergeTo, row.name),
    env.DB.prepare('DELETE FROM txn_accounts WHERE id = ?').bind(id),
    ...(row.is_default ? [env.DB.prepare('UPDATE txn_accounts SET is_default = 1 WHERE name = ?').bind(mergeTo)] : []),
  ]);
  return json({ ok: true, merged_to: mergeTo });
}
