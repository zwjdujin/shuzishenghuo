import { json, todayStr } from '../../_lib.js';

// /api/transactions/:id —— 编辑（PUT/PATCH）与删除（DELETE）
// ⚠️ 必须导出 onRequest 并用 pathname 解析 id（Pages Functions 的 [id].js 取不到 context.params.id）
export async function onRequest(context) {
  const method = (context.request && context.request.method) || 'GET';
  if (method === 'PUT' || method === 'PATCH') return onRequestPut(context);
  if (method === 'DELETE') return onRequestDelete(context);
  return json({ error: '不支持的请求方法' }, 405);
}

function idOf(request) {
  const url = new URL(request.url);
  const m = url.pathname.match(/\/transactions\/(\d+)/);
  return Number(m ? m[1] : url.searchParams.get('id'));
}

async function onRequestDelete(context) {
  const { env, request } = context;
  const id = idOf(request);
  if (!id) return json({ error: '缺少记录 ID' }, 400);
  await env.DB.prepare('DELETE FROM transactions WHERE id = ?').bind(id).run();
  return json({ ok: true, id });
}

// PUT /api/transactions/:id —— 修改一笔账
async function onRequestPut(context) {
  const { env, request } = context;
  const id = idOf(request);
  if (!id) return json({ error: '缺少记录 ID' }, 400);

  let body = {};
  try { body = await request.json(); } catch (_) {}

  const flow = body.flow === 'income' ? 'income' : 'expense';
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) return json({ error: '请填写有效金额' }, 400);
  const date = String(body.date || '').trim() || todayStr();
  const category = String(body.category || '').trim() || '其他';
  const note = String(body.note || '').trim() || null;
  const account = String(body.account || '').trim() || '默认账户';

  const exists = await env.DB.prepare('SELECT id FROM transactions WHERE id = ?').bind(id).first();
  if (!exists) return json({ error: '记录不存在' }, 404);

  await env.DB.prepare(
    'UPDATE transactions SET flow=?, amount=?, category=?, txn_date=?, note=?, account=? WHERE id=?'
  )
    .bind(flow, amount, category, date, note, account, id)
    .run();
  return json({ ok: true, id });
}
