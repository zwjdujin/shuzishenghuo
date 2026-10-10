import { json, parseCookie, decodeToken, readCustomPassHash } from '../_lib.js';

// 简单识别终端类型与设备名
function parseDevice(ua) {
  ua = (ua || '').toLowerCase();
  if (!ua) return { type: '未知设备', browser: '-' };
  let os = '未知系统';
  if (ua.includes('windows')) os = 'Windows';
  else if (ua.includes('iphone')) os = 'iPhone';
  else if (ua.includes('ipad')) os = 'iPad';
  else if (ua.includes('android')) os = 'Android';
  else if (ua.includes('mac os') || ua.includes('macintosh')) os = 'macOS';
  else if (ua.includes('linux')) os = 'Linux';

  let browser = '浏览器';
  if (ua.includes('edg/')) browser = 'Edge';
  else if (ua.includes('micromessenger')) browser = '微信';
  else if (ua.includes('chrome/')) browser = 'Chrome';
  else if (ua.includes('firefox/')) browser = 'Firefox';
  else if (ua.includes('safari/')) browser = 'Safari';
  else if (/curl|wget|python|node/.test(ua)) browser = '命令行/脚本';

  const mobile = /iphone|android|ipad|mobile/.test(ua);
  return { type: mobile ? `${os} · 移动端` : `${os} · 桌面端`, browser };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const token = parseCookie(request.headers.get('Cookie')).sz_session;
  const current = decodeToken(token);
  const curSid = current ? current.sid : '';

  const rows = (await env.DB.prepare(
    'SELECT sid, user, ip, user_agent, created_at, last_seen_at FROM sessions ORDER BY created_at DESC'
  ).all()).results || [];

  const devices = rows.map((r) => {
    const d = parseDevice(r.user_agent);
    return {
      sid: r.sid,
      user: r.user,
      ip: r.ip || '未知',
      terminal: d.type,
      browser: d.browser,
      loginAt: r.created_at,
      lastSeen: r.last_seen_at || r.created_at,
      current: r.sid === curSid,
    };
  });

  // 是否已设置过自定义密码（供「账户安全」页提示当前用的是初始密码还是自定义密码）
  const customPass = !!(await readCustomPassHash(env));

  return json({ devices, customPass });
}