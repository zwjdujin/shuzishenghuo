import { json, signToken } from '../../_lib.js';

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

  const token = await signToken(user, env.SESSION_SECRET);
  const secure = new URL(request.url).protocol === 'https:';
  const cookie =
    `sz_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}` +
    (secure ? '; Secure' : '');

  return json({ ok: true, user }, 200, { 'Set-Cookie': cookie });
}
