import { json, parseCookie, decodeToken } from '../../_lib.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  // 若 token 带 sid，删除对应会话记录（登出当前设备）
  const token = parseCookie(request.headers.get('Cookie')).sz_session;
  const payload = decodeToken(token);
  if (payload && payload.sid) {
    try {
      await env.DB.prepare('DELETE FROM sessions WHERE sid = ?').bind(payload.sid).run();
    } catch (_) {}
  }
  const secure = new URL(request.url).protocol === 'https:';
  const cookie =
    `sz_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` + (secure ? '; Secure' : '');
  return json({ ok: true }, 200, { 'Set-Cookie': cookie });
}