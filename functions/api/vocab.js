import { json } from '../_lib.js';

// ===== 词库缓存（常用词：添加一次，永久备选，点击即用） =====

// GET /api/vocab?kind=trait —— 取某类全部候选词
export async function onRequestGet(context) {
  const { env, request } = context;
  const u = new URL(request.url);
  const kind = (u.searchParams.get('kind') || '').trim();
  if (!kind) {
    const all = (await env.DB.prepare('SELECT kind, word, hits FROM vocab ORDER BY kind, hits DESC').all()).results || [];
    const grouped = {};
    all.forEach((r) => { (grouped[r.kind] = grouped[r.kind] || []).push(r); });
    return json({ grouped });
  }
  const rows = (await env.DB.prepare('SELECT id, word, hits FROM vocab WHERE kind=? ORDER BY hits DESC, word').bind(kind).all()).results || [];
  return json({ kind, words: rows });
}

// POST /api/vocab {kind, word} —— 添加（已存在则累加命中次数）
export async function onRequestPost(context) {
  const { env, request } = context;
  let b = {};
  try { b = await request.json(); } catch (_) {}
  const kind = String(b.kind || '').trim();
  const word = String(b.word || '').trim();
  if (!kind || !word) return json({ error: '参数错误' }, 400);

  const exist = await env.DB.prepare('SELECT id FROM vocab WHERE kind=? AND word=?').bind(kind, word).first();
  if (exist) {
    await env.DB.prepare('UPDATE vocab SET hits = hits + 1 WHERE id=?').bind(exist.id).run();
    return json({ ok: true, existed: true });
  }
  await env.DB.prepare('INSERT INTO vocab(kind,word) VALUES (?,?)').bind(kind, word).run();
  return json({ ok: true, existed: false }, 201);
}

// PUT /api/vocab {id} —— 记一次使用
export async function onRequestPut(context) {
  const { env, request } = context;
  let b = {};
  try { b = await request.json(); } catch (_) {}
  const id = Number(b.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  await env.DB.prepare('UPDATE vocab SET hits = hits + 1 WHERE id=?').bind(id).run();
  return json({ ok: true, id });
}