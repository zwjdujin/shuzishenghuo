import { json, todayStr } from '../../../_lib.js';

// POST /api/todos/:id/myday —— 加入 / 移出「我的一天」
// 加入写当天日期（my_day_date），过夜自然失效，无需每日清理任务
export async function onRequestPost(context) {
  const { env, params, request } = context;
  const id = params && params.id;
  if (!id) return json({ error: '缺少 id' }, 400);
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const row = await env.DB.prepare('SELECT my_day_date, done FROM todos WHERE id=?').bind(id).first();
  if (!row) return json({ error: '待办不存在' }, 404);
  // 不传 on = 翻转当前状态（当前不在今天 → 视为加入）
  const on = body.on !== undefined ? !!body.on : row.my_day_date !== todayStr();
  await env.DB.prepare('UPDATE todos SET my_day_date=? WHERE id=?')
    .bind(on ? todayStr() : '', id)
    .run();
  return json({ ok: true, id, myDay: on });
}
