import { json } from '../_lib.js';

// ===== v0.5.47 前端错误上报（公开接口：登录页也会出错） =====
// POST /api/client-log  body: { level?: 'error'|'warn', message, url? }
// 行数滚动上限 200（每次写入顺带裁剪），消息截断 500 字符，防滥用。
const MAX_ROWS = 200;
const MAX_MSG = 500;

export async function onRequestPost(context) {
  const { env, request } = context;
  let b = {};
  try { b = await request.json(); } catch (_) { return json({ error: '请求格式不正确' }, 400); }
  const level = ['error', 'warn'].includes(b.level) ? b.level : 'error';
  const message = String(b.message || '').slice(0, MAX_MSG);
  if (!message) return json({ error: '缺少 message' }, 400);
  const url = String(b.url || '').slice(0, 200) || null;
  const ua = String(request.headers.get('user-agent') || '').slice(0, 200);

  try {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO client_logs(level, message, url, ua) VALUES (?,?,?,?)')
        .bind(level, message, url, ua),
      // 滚动裁剪：只保留最近 MAX_ROWS 条
      env.DB.prepare(
        `DELETE FROM client_logs WHERE id NOT IN (SELECT id FROM client_logs ORDER BY id DESC LIMIT ${MAX_ROWS})`
      ),
    ]);
    return json({ ok: true }, 201);
  } catch (e) {
    console.error('client-log write', e && e.message);
    return json({ error: '写入失败' }, 500);
  }
}
