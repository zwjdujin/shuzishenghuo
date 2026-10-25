import { json, todayStr } from '../_lib.js';

// GET /api/memos?limit=30 —— 一句话 memo 时间线（新→旧）
export async function onRequestGet(context) {
  const { env, request } = context;
  const limit = Math.min(200, Math.max(1, Number(new URL(request.url).searchParams.get('limit')) || 30));
  const rows = (await env.DB.prepare(
    'SELECT id, content, tags, memo_date, created_at FROM memos ORDER BY id DESC LIMIT ?'
  ).bind(limit).all().catch(() => ({ results: [] }))).results || [];
  return json({
    list: rows.map((r) => ({
      id: r.id,
      content: r.content,
      tags: String(r.tags || '').split(',').filter(Boolean),
      date: r.memo_date,
      createdAt: r.created_at,
    })),
  });
}

// POST /api/memos —— 记一句 { content }，'#标签' 自动提取
export async function onRequestPost(context) {
  const { env, request } = context;
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const content = String(body.content || '').trim().slice(0, 500);
  if (!content) return json({ error: '写点什么吧' }, 400);
  const tags = (content.match(/#[^\s#，。,]+/g) || []).map((t) => t.slice(1).slice(0, 12)).filter(Boolean);
  const res = await env.DB.prepare(
    'INSERT INTO memos(content, tags, memo_date) VALUES (?,?,?)'
  ).bind(content, tags.join(','), todayStr()).run();
  return json({ ok: true, id: res.meta ? res.meta.last_row_id : null, tags }, 201);
}
