// ===== 轻量限流（v0.5.56，审计 P2-1 / P2-17）=====
// 计数落 D1 表 rate_limits（迁移 0017），跨 isolate 生效——Workers 每个 isolate 各有一份内存，
// 此前登录失败计数只存在单 isolate 的 Map 里，多 isolate / 多入口下并不精确。
// 表不存在（迁移还没跑）或查询出错时自动退回进程内存计数：仍能挡住单实例内的刷写，与旧行为一致。
//
// 用法（固定窗口）：
//   await isRateLimited(env, 'login-fail', ip, 10, 900)   // 只读判断：本窗口是否已达上限
//   await hitRateLimit(env, 'login-fail', ip, 10, 900)     // 计数 +1，返回 { count, limited }
//   await clearRateLimit(env, 'login-fail', ip, 900)       // 清零（登录成功等场景）
// 「先读后写」是有意为之：被限流的请求只花 1 次读，不再产生写入——限流的目的之一就是保住 D1 写入配额。

const mem = new Map();   // 迁移未执行时的回退计数：k → cnt

const keyOf = (key, id, windowSec) => `${key}:${id || '-'}:${Math.floor(Date.now() / (windowSec * 1000))}`;

/** 客户端 IP：Cloudflare 边缘写入的 CF-Connecting-IP 优先，其次 X-Forwarded-For 首段 */
export function clientIp(request) {
  const h = request && request.headers;
  const cf = h && h.get('cf-connecting-ip');
  if (cf) return String(cf).slice(0, 64);
  const xff = h && h.get('x-forwarded-for');
  if (xff) return String(xff).split(',')[0].trim().slice(0, 64);
  return '';
}

/** 本窗口是否已达上限（只读，不计数） */
export async function isRateLimited(env, key, id, limit, windowSec) {
  const k = keyOf(key, id, windowSec);
  try {
    const row = await env.DB.prepare('SELECT cnt FROM rate_limits WHERE k = ?').bind(k).first();
    return !!row && Number(row.cnt) >= limit;
  } catch (_) {
    return (mem.get(k) || 0) >= limit;
  }
}

/** 计数 +1；返回 { count, limited }。永不抛错（D1 不可用时退回内存计数） */
export async function hitRateLimit(env, key, id, limit, windowSec) {
  const k = keyOf(key, id, windowSec);
  const exp = Math.floor(Date.now() / 1000) + windowSec;
  let count;
  try {
    const row = await env.DB.prepare(
      'INSERT INTO rate_limits(k, cnt, exp) VALUES (?, 1, ?) ON CONFLICT(k) DO UPDATE SET cnt = cnt + 1 RETURNING cnt'
    ).bind(k, exp).first();
    count = row ? Number(row.cnt) : 1;
  } catch (_) {
    count = (mem.get(k) || 0) + 1;
    if (mem.size > 5000) mem.clear();   // 防内存膨胀（极端情况）
    mem.set(k, count);
  }
  return { count, limited: count > limit };
}

/** 清零本窗口计数 */
export async function clearRateLimit(env, key, id, windowSec) {
  const k = keyOf(key, id, windowSec);
  mem.delete(k);
  try {
    await env.DB.prepare('DELETE FROM rate_limits WHERE k = ?').bind(k).run();
  } catch (_) { /* 表不存在：内存计数已清 */ }
}

/** 清理过期行（业务代码低频顺手调用即可；失败无影响） */
export async function sweepRateLimits(env) {
  try {
    await env.DB.prepare('DELETE FROM rate_limits WHERE exp < ?').bind(Math.floor(Date.now() / 1000)).run();
  } catch (_) { /* 忽略 */ }
}
