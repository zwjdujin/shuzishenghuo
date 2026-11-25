import { json } from '../../_lib.js';
import { TABLE_LABELS, EXCLUDE } from './_tables.js';
import { reseedData } from './_seed.js';

// 前端二次确认后携带的标记，防止误调用
const CONFIRM = 'CLEAR_ALL_DATA';

// v0.5.56（审计 P2-2）：清空用显式白名单（TABLE_LABELS 的键——项目约定「新表必须补映射」，
// 等价于「新业务表必须登记」，避免未来新增的系统表被默认放行的动态清单误清）。
// 清空后重放默认种子（见 _seed.js），避免药箱剂型/分类/位置下拉变空、账本没有默认分类/账户、
// 待办没有「生活」清单。推送订阅不再被清——此前清掉后 Worker 无订阅可推，浏览器侧的本地订阅
// 要等用户再点「开启通知」才会重报，定时推送就此静默失效。R2 里的联系人附件（rjgx/ 前缀）
// 一并删除：此前只清 D1 行，照片/证件等附件会永远留在对象存储里（应用内已不可达也无法清理）。
const SKIP_CLEAR = new Set(['push_subscriptions']);

// 返回真实存在且应被清空的业务表名
async function tablesToClear(env) {
  const rows = (await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).results || [];
  const present = new Set(rows.map((r) => r.name));
  return Object.keys(TABLE_LABELS).filter((n) => present.has(n) && !SKIP_CLEAR.has(n));
}

// 删除 R2 里 rjgx/ 前缀的全部对象（尽力而为；失败不影响清空结果，会在响应里说明）
async function clearR2Attachments(env) {
  if (!env.BUCKET || typeof env.BUCKET.list !== 'function') return { deleted: 0, error: '' };
  let deleted = 0;
  try {
    let cursor;
    do {
      const page = await env.BUCKET.list({ prefix: 'rjgx/', cursor });
      await Promise.all((page.objects || []).map((o) => env.BUCKET.delete(o.key).then(() => { deleted += 1; }).catch(() => {})));
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
  } catch (e) {
    return { deleted, error: e && e.message ? String(e.message) : String(e) };
  }
  return { deleted, error: '' };
}

// POST /api/data/clear —— 清空全部业务数据（含演示数据），随后重放默认种子
// 保留：sessions（否则本人被踢下线）、app_settings（品牌与外观偏好）、管理员账号密码
//（来自环境变量，本就不在库里）、api_tokens / client_logs / rate_limits（非业务数据）
export async function onRequestPost(context) {
  const { env, request } = context;

  let body = {};
  try { body = await request.json(); } catch (_) { /* 允许空 body，但会因缺少标记被拒 */ }
  if (String(body.confirm || '') !== CONFIRM) {
    return json({ error: '缺少确认标记，操作已取消' }, 400);
  }

  const names = await tablesToClear(env);

  // v0.5.47：全部 DELETE 放进同一个 batch 原子执行。此前循环逐表执行且吞错，
  // 中途超时会留下「半清空」的库且无从回滚。要么全清，要么不动。
  try {
    await env.DB.batch(names.map((name) => env.DB.prepare(`DELETE FROM "${name}"`)));
  } catch (e) {
    console.error('clear batch', e && e.message);
    return json({ error: '清空失败（未做任何改动，请重试）：' + (e && e.message ? e.message : '') }, 500);
  }

  // v0.5.56：重放默认种子（迁移播种过的默认值），失败不回滚清空（清空已成功，种子可再补）
  let seeded = [];
  try {
    seeded = await reseedData(env);
  } catch (e) {
    console.error('reseed after clear', e && e.message);
  }

  // 重置自增序列，让新数据从 1 开始（部分环境不允许写 sqlite_sequence，失败不影响结果）
  if (names.length) {
    try {
      const ph = names.map(() => '?').join(',');
      await env.DB.prepare(`DELETE FROM sqlite_sequence WHERE name IN (${ph})`).bind(...names).run();
    } catch (_) { /* 忽略 */ }
  }

  // v0.5.56：联系人附件（R2）一并清理（尽力而为）
  const r2 = await clearR2Attachments(env);

  // kept 由排除名单推导（此前硬编码只报 2 项，与实际不符）
  const kept = [...EXCLUDE].filter((n) => n !== 'd1_migrations' && n !== '_cf_KV');

  return json({
    ok: true,
    cleared: names,
    failed: [],
    kept,
    keptAlso: ['push_subscriptions（设备推送订阅，清了定时推送会静默失效）'],
    seeded,
    r2,
    at: new Date().toISOString(),
  });
}
