import {
  json, parseCookie, decodeToken, verifyAdminPassword, hashPassword, saveCustomPassHash,
} from '../../_lib.js';

// 密码长度区间（与前端提示保持一致）
const MIN_LEN = 6;
const MAX_LEN = 64;

// POST /api/auth/password —— 修改管理员密码
// body: { oldPass, newPass }
// 成功后：写入 app_settings.admin_pass_hash，并踢除「除当前设备外」的所有登录会话。
export async function onRequestPost(context) {
  const { request, env } = context;

  let body = {};
  try { body = await request.json(); } catch (_) {
    return json({ error: '请求格式不正确' }, 400);
  }
  const oldPass = String(body.oldPass || '');
  const newPass = String(body.newPass || '');
  const confirm = String(body.confirmPass === undefined ? newPass : body.confirmPass || '');

  if (!oldPass) return json({ error: '请输入当前密码' }, 400);
  if (!newPass) return json({ error: '请输入新密码' }, 400);
  if (newPass.length < MIN_LEN) return json({ error: `新密码至少 ${MIN_LEN} 位` }, 400);
  if (newPass.length > MAX_LEN) return json({ error: `新密码不能超过 ${MAX_LEN} 位` }, 400);
  if (newPass !== confirm) return json({ error: '两次输入的新密码不一致' }, 400);

  // 当前密码必须正确（防止拿到会话后直接改密码）
  if (!(await verifyAdminPassword(env, oldPass))) {
    return json({ error: '当前密码不正确' }, 400);
  }
  if (newPass === oldPass) {
    return json({ error: '新密码不能与当前密码相同' }, 400);
  }

  // 落库：PBKDF2-SHA256 哈希，绝不存明文
  try {
    await saveCustomPassHash(env, await hashPassword(newPass));
  } catch (_) {
    return json({ error: '密码保存失败，请稍后重试' }, 500);
  }

  // 改密后让其它设备上的登录失效（当前设备保留，避免自己也被踢出去）
  let revoked = 0;
  const token = parseCookie(request.headers.get('Cookie')).sz_session;
  const payload = decodeToken(token);
  const keepSid = payload && payload.sid ? String(payload.sid) : '';
  try {
    const r = await env.DB.prepare(
      keepSid ? 'DELETE FROM sessions WHERE sid != ?' : 'DELETE FROM sessions'
    ).bind(...(keepSid ? [keepSid] : [])).run();
    revoked = (r && r.meta && Number(r.meta.changes)) || 0;
  } catch (_) {
    // 会话表异常不应影响改密结果
  }

  return json({ ok: true, revoked, minLen: MIN_LEN });
}
