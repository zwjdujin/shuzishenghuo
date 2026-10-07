// 全局中间件：为 /api/* 受保护接口做登录校验（公开接口除外）
import { parseCookie, verifyToken } from './_lib.js';

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
  return next();
}
