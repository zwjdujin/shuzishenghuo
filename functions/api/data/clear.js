import { json } from '../../_lib.js';
import { listDataTables } from './_tables.js';

// 前端二次确认后携带的标记，防止误调用
const CONFIRM = 'CLEAR_ALL_DATA';

// POST /api/data/clear —— 清空全部业务数据（含演示数据）
// 保留：sessions（否则本人被踢下线）、app_settings（品牌与外观偏好）、管理员账号密码（来自环境变量，本就不在库里）
export async function onRequestPost(context) {
  const { env, request } = context;

  let body = {};
  try { body = await request.json(); } catch (_) { /* 允许空 body，但会因缺少标记被拒 */ }
  if (String(body.confirm || '') !== CONFIRM) {
    return json({ error: '缺少确认标记，操作已取消' }, 400);
  }

  const names = await listDataTables(env);

  // v0.5.47：全部 DELETE 放进同一个 batch 原子执行。此前循环逐表执行且吞错，
  // 中途超时会留下"半清空"的库且无从回滚。要么全清，要么不动。
  try {
    await env.DB.batch(names.map((name) => env.DB.prepare(`DELETE FROM "${name}"`)));
  } catch (e) {
    console.error('clear batch', e && e.message);
    return json({ error: '清空失败（未做任何改动，请重试）：' + (e && e.message ? e.message : '') }, 500);
  }
  const cleared = names;
  const failed = [];

  // 重置自增序列，让新数据从 1 开始（部分环境不允许写 sqlite_sequence，失败不影响结果）
  if (names.length) {
    try {
      const ph = names.map(() => '?').join(',');
      await env.DB.prepare(`DELETE FROM sqlite_sequence WHERE name IN (${ph})`).bind(...names).run();
    } catch (_) { /* 忽略 */ }
  }

  return json({
    ok: true,
    cleared,
    failed,
    kept: ['sessions', 'app_settings'],
    at: new Date().toISOString(),
  });
}
