// v0.5.9 外部访问令牌：生成 / 校验（/api/settings/tokens、/api/ext/*、/mcp 共用）
// 明文令牌形如 szsh_<64hex>，只在生成响应里出现一次；库里存 sha256。
// v0.5.46：expires_at（YYYY-MM-DD，NULL=永不过期）过期即拒，与生成/列表/改密吊销共同构成令牌生命周期。
// 下划线前缀不会被当作路由。
import { todayStr } from '../_lib.js';

export const SCOPE_KEYS = [
  ['ledger', '账本'], ['todos', '待办'], ['calendar', '日历'], ['habits', '习惯'],
  ['medicine', '药箱'], ['relations', '人际关系'], ['memos', '随手记'],
];

export function sha256Hex(s) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
    .then((buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join(''));
}

export function newPlainToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return 'szsh_' + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 清洗 scopes：{ledger:{read,write},...}，只留合法键与布尔值 */
export function cleanScopes(input) {
  const out = {};
  for (const [k] of SCOPE_KEYS) {
    const s = (input && input[k]) || {};
    const read = !!s.read;
    const write = !!s.write;
    if (read || write) out[k] = { read, write };
  }
  return out;
}

/** 从请求解析 Bearer 令牌 → 数据库行（含 scopes 对象）；无效返回 null */
export async function resolveToken(env, request) {
  const h = String(request.headers.get('authorization') || '');
  const m = /^Bearer\s+(szsh_[0-9a-f]{64})$/i.exec(h);
  if (!m) return null;
  const hash = await sha256Hex(m[1].toLowerCase());
  let row = null;
  try {
    row = await env.DB.prepare('SELECT * FROM api_tokens WHERE token_hash=?').bind(hash).first();
  } catch (_) { return null; }
  if (!row) return null;
  // v0.5.46 生命周期：已过期的令牌视同不存在（不改名不删行，便于列表里看到它已过期）
  if (row.expires_at && todayStr() > String(row.expires_at)) return null;
  // 异步刷新最后使用时间（失败不影响请求）
  env.DB.prepare("UPDATE api_tokens SET last_used_at=datetime('now','localtime') WHERE id=?").bind(row.id).run().catch(() => {});
  let scopes = {};
  try { scopes = JSON.parse(row.scopes || '{}'); } catch (_) {}
  return { id: row.id, name: row.name, scopes: cleanScopes(scopes) };
}

/** scope 校验：无权限返回错误 Response，否则返回 null 放行 */
export function scopeDenied(scopes, key, write) {
  const s = scopes[key];
  const has = write ? (s && s.write) : (s && s.read);
  return has ? null : new Response(
    JSON.stringify({ error: `令牌无「${(SCOPE_KEYS.find(([k]) => k === key) || [])[1] || key}」${write ? '写' : '读'}权限` }),
    { status: 403, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
  );
}
