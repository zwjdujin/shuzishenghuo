import { json } from '../_lib.js';
import { clientIp, isRateLimited, hitRateLimit, sweepRateLimits } from './_ratelimit.js';

// ===== v0.5.47 前端错误上报（公开接口：登录页也会出错） =====
// POST /api/client-log  body: { level?: 'error'|'warn', message, url? }
// 行数滚动上限 200（每次写入顺带裁剪），消息截断 500 字符，防滥用。
const MAX_ROWS = 200;
const MAX_MSG = 500;

// v0.5.56（审计 P2-1）：这是全站唯一「公开 + 每次两条 D1 写」的接口——匿名刷写可以耗尽
// D1 每日写入配额（连带全天业务写入失败），message/url/ua 还全是攻击者可控的内容，会污染
// 系统信息页的「最近错误」。限流：单 IP 每 10 分钟 30 条 + 全站每天 500 条（个人自用远用不到）；
// 超限直接丢弃（仍回 201，不给刷写方任何重试信号）。跨站的浏览器请求另由中间件的
// Sec-Fetch-Site 校验挡掉。计数落 D1（迁移 0017），表不存在时退回内存计数。
const IP_LIMIT = 30, IP_WIN = 600;
const ALL_LIMIT = 500, ALL_WIN = 86400;

export async function onRequestPost(context) {
  const { env, request } = context;
  let b = {};
  try { b = await request.json(); } catch (_) { return json({ error: '请求格式不正确' }, 400); }
  const level = ['error', 'warn'].includes(b.level) ? b.level : 'error';
  const message = String(b.message || '').slice(0, MAX_MSG);
  if (!message) return json({ error: '缺少 message' }, 400);
  const url = String(b.url || '').slice(0, 200) || null;
  const ua = String(request.headers.get('user-agent') || '').slice(0, 200);

  // 先读后写：被限流的请求不再产生任何 D1 写入
  const ip = clientIp(request);
  if ((await isRateLimited(env, 'clog-ip', ip, IP_LIMIT, IP_WIN))
    || (await isRateLimited(env, 'clog-all', 'all', ALL_LIMIT, ALL_WIN))) {
    return json({ ok: true, limited: true }, 201);
  }
  await hitRateLimit(env, 'clog-ip', ip, IP_LIMIT, IP_WIN);
  await hitRateLimit(env, 'clog-all', 'all', ALL_LIMIT, ALL_WIN);
  if (Math.random() < 0.05) sweepRateLimits(env);   // 顺手清理过期计数行（低频，不等待）

  try {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO client_logs(level, message, url, ua) VALUES (?,?,?,?)')
        .bind(level, message, url, ua),
      // 滚动裁剪：只保留最近 MAX_ROWS 条
      env.DB.prepare(
        `DELETE FROM client_logs WHERE id NOT IN (SELECT id FROM client_logs ORDER BY id DESC LIMIT ${MAX_ROWS})`
      ),
    ]);
    return json({ ok: true }, 201);
  } catch (e) {
    console.error('client-log write', e && e.message);
    return json({ error: '写入失败' }, 500);
  }
}
