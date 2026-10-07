// 数字生活 · 共享后端工具（非路由文件，下划线前缀不会被当作路由）
export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  });
}

export function parseCookie(header = '') {
  const out = {};
  (header || '').split(';').forEach((c) => {
    const idx = c.indexOf('=');
    if (idx < 0) return;
    const k = c.slice(0, idx).trim();
    const v = c.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function bytesToB64url(bytes) {
  let bin = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function strToBytes(str) {
  return new TextEncoder().encode(str);
}
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey(
    'raw', strToBytes(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, strToBytes(data));
  return bytesToB64url(sig);
}

export async function signToken(user, secret, ttlMs = 1000 * 60 * 60 * 24 * 7) {
  const exp = Date.now() + ttlMs;
  const payload = bytesToB64url(new TextEncoder().encode(JSON.stringify({ user, exp })));
  const sig = await hmac(secret, payload);
  return `${payload}.${sig}`;
}

export async function verifyToken(token, secret) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return false;
  const [payload, sig] = token.split('.');
  const expected = await hmac(secret, payload);
  if (expected !== sig) return false;
  try {
    const jsoned = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    if (!jsoned.exp || Date.now() > jsoned.exp) return false;
    return true;
  } catch {
    return false;
  }
}

// 本地日期 YYYY-MM-DD（避免 toISOString 的 UTC 偏移问题）
export function todayStr(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

export function weekdayCN(d = new Date()) {
  return '日一二三四五六'[d.getDay()];
}
