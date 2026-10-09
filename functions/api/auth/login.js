import { json, signToken } from '../../_lib.js';

function clientIp(request) {
  // Cloudflare 会把真实 IP 放在 CF-Connecting-IP
  const cf = request.headers.get('cf-connecting-ip');
  if (cf) return cf;
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return '';
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

  // 校验管理员用户名 / 密码（来自后台变量）
  if (user !== env.ADMIN_USER || pass !== env.ADMIN_PASS) {
    return json({ error: '用户名或密码错误' }, 401);
  }

  // 生成唯一会话 ID，写入 token，并持久化到 sessions 表
  const sid = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const token = await signToken(user, env.SESSION_SECRET, 1000 * 60 * 60 * 24 * 7, { sid });
  const ip = clientIp(request);
  const ua = String(request.headers.get('user-agent') || '').slice(0, 400);
  try {
    await env.DB.prepare(
      'INSERT OR REPLACE INTO sessions(sid, user, ip, user_agent, created_at, last_seen_at) VALUES (?,?,?,?,datetime(\'now\'),datetime(\'now\'))'
    )
      .bind(sid, user, ip, ua)
      .run();
  } catch (_) {
    // sessions 表未迁移时不应阻断登录
  }

  const secure = new URL(request.url).protocol === 'https:';
  const cookie =
    `sz_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}` +
    (secure ? '; Secure' : '');

  return json({ ok: true, user }, 200, { 'Set-Cookie': cookie });
}
