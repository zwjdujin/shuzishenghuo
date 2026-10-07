import { json, parseCookie, verifyToken } from '../../_lib.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const token = parseCookie(request.headers.get('Cookie')).sz_session;
  if (!token || !(await verifyToken(token, env.SESSION_SECRET))) {
    return json({ authenticated: false }, 401);
  }
  return json({ authenticated: true, user: env.ADMIN_USER });
}
