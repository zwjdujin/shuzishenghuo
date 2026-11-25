import { json } from '../../_lib.js';

// PUT /api/todos/sort {ids:[...]} —— 清单视图手动拖拽排序（按传入顺序写 sort_order 1..N）
export async function onRequestPut(context) {
  const { env, request } = context;
  let body = {};
  try { body = await request.json(); } catch (_) { return json({ error: '请求格式不正确' }, 400); }
  const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Boolean) : [];
  if (!ids.length) return json({ error: '缺少排序数据' }, 400);
  await env.DB.batch(ids.map((tid, i) => env.DB.prepare('UPDATE todos SET sort_order=? WHERE id=?').bind(i + 1, tid)));
  return json({ ok: true, count: ids.length });
}
