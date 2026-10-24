import { json, signToken, verifyAdminPassword } from '../../_lib.js';

function clientIp(request) {
  // Cloudflare 会把真实 IP 放在 CF-Connecting-IP
  const cf = request.headers.get('cf-connecting-ip');
  if (cf) return cf;
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return '';
}

// ===== 登录失败速率限制（防爆破）=====
// 每 isolate 内存态：单 IP 15 分钟内失败满 10 次即暂时拒绝，成功登录清零。
// Workers 多 isolate 下并非绝对精确，纵深防御建议再在 Cloudflare WAF
// 给 /api/auth/login 加一条限流规则（免费版有 1 条规则额度）。
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const FAIL_MAX = 10;
const loginFails = new Map(); // ip -> [失败时间戳]

function tooManyFails(ip) {
  const now = Date.now();
  const arr = (loginFails.get(ip) || []).filter((t) => now - t < FAIL_WINDOW_MS);
  if (arr.length) loginFails.set(ip, arr);
  else loginFails.delete(ip);
  return arr.length >= FAIL_MAX;
}
function recordFail(ip) {
  const arr = loginFails.get(ip) || [];
  arr.push(Date.now());
  loginFails.set(ip, arr);
  if (loginFails.size > 1000) loginFails.delete(loginFails.keys().next().value); // 防内存膨胀
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求格式不正确' }, 400);
  }
  const user = String(body.user || '');
  const pass = String(body.pass || '');
  const ip = clientIp(request);
  if (tooManyFails(ip)) {
    return json({ error: '尝试次数过多，请 15 分钟后再试' }, 429);
  }

  // 校验管理员用户名 / 密码
  // 密码优先比对库中的自定义密码（在「个人中心 → 账户安全」里改过），否则回退到环境变量初始密码
  const passOk = await verifyAdminPassword(env, pass);
  if (user !== env.ADMIN_USER || !passOk) {
    recordFail(ip);
    return json({ error: '用户名或密码错误' }, 401);
  }
  loginFails.delete(ip);

  // 生成唯一会话 ID，写入 token，并持久化到 sessions 表
  const sid = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const token = await signToken(user, env.SESSION_SECRET, 1000 * 60 * 60 * 24 * 7, { sid });
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
