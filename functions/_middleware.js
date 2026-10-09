// 全局中间件：为 /api/* 受保护接口做登录校验（公开接口除外）
import { parseCookie, verifyToken, decodeToken } from './_lib.js';

const PUBLIC = ['/api/auth/login', '/api/health'];

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // 静态资源 / 页面直接放行
  if (!path.startsWith('/api/')) return next();
  // 公开接口放行
  if (PUBLIC.some((p) => path === p || path.startsWith(p + '/'))) return next();

  const token = parseCookie(request.headers.get('Cookie')).sz_session;
  if (!token || !(await verifyToken(token, env.SESSION_SECRET))) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 若 token 带 sid，校验会话仍存在（被登出的设备其 token 立即失效）
  const payload = decodeToken(token);
  if (payload && payload.sid) {
    try {
      const row = await env.DB.prepare('SELECT sid FROM sessions WHERE sid = ?').bind(payload.sid).first();
      if (!row) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      await env.DB.prepare('UPDATE sessions SET last_seen_at = datetime(\'now\') WHERE sid = ?').bind(payload.sid).run();
    } catch (_) {
      // sessions 表不存在时放行（向后兼容），不做强制校验
    }
  }
  return next();
}