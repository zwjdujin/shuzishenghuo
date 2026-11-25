import { json, signToken, verifyAdminPassword, sessionSecretOf } from '../../_lib.js';
import { clientIp, isRateLimited, hitRateLimit, clearRateLimit, sweepRateLimits } from '../_ratelimit.js';

// ===== 登录失败速率限制（防爆破） =====
// 单 IP 15 分钟内失败满 10 次即暂时拒绝，成功登录清零。
// v0.5.56（审计 P2-17）：计数从「单 isolate 内存 Map」改为落 D1（rate_limits 表，跨 isolate 生效）。
// 此前免费计划 10 万请求/天的额度下，分布式爆破每天可尝试 10 万次；现在每个 IP 每 15 分钟只有 10 次机会，
// 且被限流的请求在做 PBKDF2 之前就被挡掉。迁移未执行时 _ratelimit 自动退回内存计数。
// 纵深防御仍建议在 Cloudflare WAF 给 /api/auth/login 加一条限流规则（免费版有 1 条规则额度）。
const FAIL_WINDOW_SEC = 15 * 60;
const FAIL_MAX = 10;
const RATE_KEY = 'login-fail';

export async function onRequestPost(context) {
  const { request, env } = context;
  // 密钥守卫：不配置就拒绝签发（否则会用可预测密钥 "undefined" 签出可伪造的会话）
  const secret = sessionSecretOf(env);
  if (!secret) {
    return json({ error: '服务器未配置 SESSION_SECRET（Pages 设置 → 环境变量），登录已停用' }, 500);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求格式不正确' }, 400);
  }
  const user = String(body.user || '');
  const pass = String(body.pass || '');
  const ip = clientIp(request);
  if (await isRateLimited(env, RATE_KEY, ip, FAIL_MAX, FAIL_WINDOW_SEC)) {
    console.warn('login rate-limited:', ip);
    return json({ error: '尝试次数过多，请 15 分钟后再试' }, 429);
  }

  // 校验管理员用户名 / 密码
  // 密码优先比对库中的自定义密码（在「个人中心 → 账户安全」里改过），否则回退到环境变量初始密码
  const passOk = await verifyAdminPassword(env, pass);
  if (user !== env.ADMIN_USER || !passOk) {
    await hitRateLimit(env, RATE_KEY, ip, FAIL_MAX, FAIL_WINDOW_SEC);
    console.warn('login failed:', ip, user ? `user=${user.slice(0, 20)}` : '(空用户名)');
    return json({ error: '用户名或密码错误' }, 401);
  }
  await clearRateLimit(env, RATE_KEY, ip, FAIL_WINDOW_SEC);
  sweepRateLimits(env);   // 顺手清理过期计数行（低频，不等待）

  // 生成唯一会话 ID，写入 token，并持久化到 sessions 表
  const sid = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const token = await signToken(user, secret, 1000 * 60 * 60 * 24 * 7, { sid });
  const ua = String(request.headers.get('user-agent') || '').slice(0, 400);
  try {
    await env.DB.prepare(
      'INSERT OR REPLACE INTO sessions(sid, user, ip, user_agent, created_at, last_seen_at) VALUES (?,?,?,?,datetime(\'now\'),datetime(\'now\'))'
    )
      .bind(sid, user, ip, ua)
      .run();
    // 顺手清理 30 天未活跃的会话（token 本身 7 天过期，这些行已无意义），避免表无限增长
    await env.DB.prepare(
      "DELETE FROM sessions WHERE COALESCE(last_seen_at, created_at) < datetime('now', '-30 days')"
    ).run();
  } catch (_) {
    // sessions 表未迁移时不应阻断登录
  }

  const secure = new URL(request.url).protocol === 'https:';
  const cookie =
    `sz_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}` +
    (secure ? '; Secure' : '');

  return json({ ok: true, user }, 200, { 'Set-Cookie': cookie });
}
