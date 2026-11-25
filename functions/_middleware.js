// 全局中间件：为 /api/* 受保护接口做登录校验（公开接口除外）
import { parseCookie, verifyToken, decodeToken, sessionSecretOf } from './_lib.js';

const PUBLIC = ['/api/auth/login', '/api/health', '/api/client-log'];

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // 静态资源 / 页面直接放行
  if (!path.startsWith('/api/')) return next();

  // ===== 写请求的跨站防护（v0.5.56，纵深防御） =====
  // 会话 Cookie 是 SameSite=Lax：跨站的「顶层导航 GET」仍会带上 Cookie，仅凭 Cookie 无法区分
  // 「用户自己发起」和「被第三方页面带过来」。浏览器（Chromium 76+ / Firefox 90+ / Safari 16.4+）
  // 对每个请求都带 Sec-Fetch-Site，这里把非同源发起的写请求（POST/PUT/PATCH/DELETE…）一律拒绝，
  // 一次覆盖全部 /api/*（含公开的登录与错误上报，顺带防「登录 CSRF」）。
  // 不带该头的是非浏览器客户端（curl / MCP / 安卓壳原生请求），没有 Cookie 环境，不在此列；
  // GET/HEAD 只读，不限制。放在 PUBLIC 放行之前，公开接口同样受保护。
  const method = String(request.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const site = request.headers.get('Sec-Fetch-Site');
    if (site && site !== 'same-origin' && site !== 'none') {
      return new Response(JSON.stringify({ error: 'cross_site_request_rejected', message: '跨站发起的写请求已被拒绝' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }
  // 公开接口放行
  if (PUBLIC.some((p) => path === p || path.startsWith(p + '/'))) return next();
  // /api/ext/*：外部访问接口，由其自身用 Bearer 令牌鉴权（见 api/ext/[resource].js），
  // 不走管理员会话——MCP 服务 / AI Agent 只带 Authorization 头，没有登录 Cookie
  if (path.startsWith('/api/ext/')) return next();

  // SESSION_SECRET 未配置时拒绝所有受保护请求（fail-closed）：
  // 缺失时会退化为可预测密钥签名，放行等同认证形同虚设
  const secret = sessionSecretOf(env);
  if (!secret) {
    console.error('SESSION_SECRET 未配置：拒绝处理受保护 API 请求');
    return new Response(JSON.stringify({ error: 'server_misconfigured', message: '服务器未配置 SESSION_SECRET（Pages 设置 → 环境变量），请联系管理员' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const token = parseCookie(request.headers.get('Cookie')).sz_session;
  if (!token || !(await verifyToken(token, secret))) {
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
      // last_seen 每过 5 分钟才写一次：既保活会话清理逻辑，又不放大 D1 写入（此前每个请求都 UPDATE）
      await env.DB.prepare(
        "UPDATE sessions SET last_seen_at = datetime('now') WHERE sid = ?" +
        " AND (last_seen_at IS NULL OR last_seen_at < datetime('now', '-5 minutes'))"
      ).bind(payload.sid).run();
    } catch (_) {
      // sessions 表不存在时放行（向后兼容），不做强制校验
    }
  }
  return next();
}