import { json } from '../../_lib.js';
import { sha256Hex, newPlainToken, cleanScopes } from '../_tokens.js';

// ===== v0.5.9 访问令牌管理（智能管理 · API/MCP） =====
// GET    /api/settings/tokens        → {tokens:[{id,name,prefix,scopes,createdAt,lastUsedAt}]}
// POST   /api/settings/tokens        → {name, scopes} → 一次性返回明文 {token}
// DELETE /api/settings/tokens?id=1

export async function onRequestGet(context) {
  const { env } = context;
  let rows = [];
  try {
    rows = (await env.DB.prepare('SELECT id,name,prefix,scopes,created_at,last_used_at FROM api_tokens ORDER BY id DESC').all()).results || [];
  } catch (e) {
    return json({ error: '令牌表未创建（迁移未执行）' }, 500);
  }
  return json({
    tokens: rows.map((r) => ({
      id: r.id, name: r.name, prefix: r.prefix,
      scopes: cleanScopes(JSON.parse(r.scopes || '{}')),
      createdAt: r.created_at, lastUsedAt: r.last_used_at || '',
    })),
  });
}

export async function onRequestPost(context) {
  const { env, request } = context;
  let b = {};
  try { b = await request.json(); } catch (_) { return json({ error: '请求格式不正确' }, 400); }
  const name = String(b.name || '').trim().slice(0, 20);
  if (!name) return json({ error: '请填写令牌名称' }, 400);
  const scopes = cleanScopes(b.scopes);
  if (!Object.keys(scopes).length) return json({ error: '请至少勾选一项权限' }, 400);

  const token = newPlainToken();
  const hash = await sha256Hex(token);
  const res = await env.DB.prepare(
    'INSERT INTO api_tokens(name, token_hash, prefix, scopes) VALUES (?,?,?,?)'
  ).bind(name, hash, token.slice(0, 10) + '…', JSON.stringify(scopes)).run();
  return json({ ok: true, id: res.meta && res.meta.last_row_id, token, scopes }, 201);
}

export async function onRequestDelete(context) {
  const { env, request } = context;
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!id) return json({ error: '缺少 id' }, 400);
  const row = await env.DB.prepare('SELECT id FROM api_tokens WHERE id=?').bind(id).first();
  if (!row) return json({ error: '令牌不存在' }, 404);
  await env.DB.prepare('DELETE FROM api_tokens WHERE id=?').bind(id).run();
  return json({ ok: true, id });
}
