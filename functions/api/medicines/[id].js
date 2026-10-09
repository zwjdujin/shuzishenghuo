// 药品单条路由：PUT / DELETE /api/medicines/:id
// 坑：Pages Functions 的 [id].js 拿不到 context.params.id，
// 因此用 request.url.pathname.match(/\/medicines\/(\d+)/) 解析（与 events/[id].js、transactions/[id].js 一致）。
import { json } from '../../_lib.js';
import { parseMedBody } from '../medicines.js';

// PUT /api/medicines/:id —— 更新药品
export async function onRequestPut(context) {
  const { env, request } = context;
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const url = new URL(request.url);
  const m = url.pathname.match(/\/medicines\/(\d+)/);
  const id = Number(m ? m[1] : body.id || url.searchParams.get('id'));
  if (!id) return json({ error: '缺少药品 ID' }, 400);
  const { data, error } = parseMedBody(body);
  if (error) return json({ error }, 400);

  await env.DB.prepare(
    `UPDATE medicines SET
      name=?, efficacy=?, spec=?, dosage=?, form=?, expiry=?, category=?, location=?,
      manufacturer=?, stock=?, stock_min=?, for_whom=?, rx=?, open_date=?, price=?, quantity=?, note=?
     WHERE id=?`
  )
    .bind(
      data.name, data.efficacy, data.spec, data.dosage, data.form, data.expiry,
      data.category, data.location, data.manufacturer, data.stock, data.stockMin,
      data.forWhom, data.rx, data.openDate, data.price, data.dosage, data.note, id
    )
    .run();
  return json({ ok: true, id });
}

// DELETE /api/medicines/:id —— 删除药品
export async function onRequestDelete(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const m = url.pathname.match(/\/medicines\/(\d+)/);
  const id = Number(m ? m[1] : url.searchParams.get('id'));
  if (!id) return json({ error: '缺少药品 ID' }, 400);
  await env.DB.prepare('DELETE FROM medicines WHERE id = ?').bind(id).run();
  return json({ ok: true, id });
}
