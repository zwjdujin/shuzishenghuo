import { json, parseCookie, decodeToken } from '../../_lib.js';

// DELETE /api/sessions/:sid —— 登出指定设备（删除其会话）
export async function onRequestDelete(context) {
  const { request, env } = context;
  const sid = String(context.params.sid || '');
  if (!sid) return json({ error: '缺少会话 ID' }, 400);

  const token = parseCookie(request.headers.get('Cookie')).sz_session;
  const current = decodeToken(token);
  const curSid = current ? current.sid : '';

  // 允许登出其他设备；登出自己则前端随后走完整登出流程
  await env.DB.prepare('DELETE FROM sessions WHERE sid = ?').bind(sid).run();

  return json({ ok: true, sid, self: sid === curSid });
}