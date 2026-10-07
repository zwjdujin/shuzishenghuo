import { json } from '../../_lib.js';

export async function onRequestPost(context) {
  const secure = new URL(context.request.url).protocol === 'https:';
  const cookie =
    `sz_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` + (secure ? '; Secure' : '');
  return json({ ok: true }, 200, { 'Set-Cookie': cookie });
}
