import { json } from '../_lib.js';

// ===== 词库缓存（常用词：添加一次，永久备选，点击即用） =====

// GET /api/vocab?kind=trait —— 取某类全部候选词
export async function onRequestGet(context) {
  const { env, request } = context;
  const u = new URL(request.url);
  const kind = (u.searchParams.get('kind') || '').trim();
  if (!kind) {
    const all = (await env.DB.prepare('SELECT kind, word, hits FROM vocab ORDER BY kind, COALESCE(sort_order, 999999), hits DESC, word').all()).results || [];
    const grouped = {};
    all.forEach((r) => { (grouped[r.kind] = grouped[r.kind] || []).push(r); });
    return json({ grouped });
  }
  const rows = (await env.DB.prepare('SELECT id, word, hits FROM vocab WHERE kind=? ORDER BY COALESCE(sort_order, 999999), hits DESC, word').bind(kind).all()).results || [];
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

// PUT /api/vocab —— 三种用途：
//   {id}                 记一次使用（hits+1，旧调用兼容）
//   {id, word}           重命名（同 kind 内判重）
//   {kind, order:[word]} 拖动排序（按数组顺序写 sort_order，未列出的词排最后）
export async function onRequestPut(context) {
  const { env, request } = context;
  let b = {};
  try { b = await request.json(); } catch (_) {}

  // 排序
  if (Array.isArray(b.order)) {
    const kind = String(b.kind || '').trim();
    if (!kind) return json({ error: '缺少 kind' }, 400);
    const listed = b.order.map((w) => String(w || '').trim()).filter(Boolean);
    const rows = (await env.DB.prepare('SELECT word FROM vocab WHERE kind = ?').bind(kind).all()).results || [];
    const rest = rows.map((r) => r.word).filter((w) => !listed.includes(w));
    const all = [...listed, ...rest];
    const stmt = env.DB.prepare('UPDATE vocab SET sort_order = ? WHERE kind = ? AND word = ?');
    await env.DB.batch(all.map((w, i) => stmt.bind(i, kind, w)));
    return json({ ok: true });
  }

  // 重命名
  if (b.word !== undefined && b.id) {
    const id = Number(b.id);
    const word = String(b.word || '').replace(/[,，]/g, '').trim().slice(0, 20);
    if (!word) return json({ error: '请填写名称' }, 400);
    const row = await env.DB.prepare('SELECT kind FROM vocab WHERE id = ?').bind(id).first();
    if (!row) return json({ error: '词条不存在' }, 404);
    const dup = await env.DB.prepare('SELECT id FROM vocab WHERE kind = ? AND word = ? AND id <> ?')
      .bind(row.kind, word, id).first();
    if (dup) return json({ error: '已存在同名词条' }, 400);
    await env.DB.prepare('UPDATE vocab SET word = ? WHERE id = ?').bind(word, id).run();
    return json({ ok: true, id });
  }

  // 记一次使用（旧调用）
  const id = Number(b.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  await env.DB.prepare('UPDATE vocab SET hits = hits + 1 WHERE id=?').bind(id).run();
  return json({ ok: true, id });
}

// DELETE /api/vocab?id= —— 删除词条（联系人上已使用的 CSV 值不受影响，仅移除候选）
export async function onRequestDelete(context) {
  const { env, request } = context;
  const u = new URL(request.url);
  const id = Number(u.searchParams.get('id'));
  if (!id) return json({ error: '缺少 id' }, 400);
  await env.DB.prepare('DELETE FROM vocab WHERE id = ?').bind(id).run();
  return json({ ok: true, id });
}