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

export async function signToken(user, secret, ttlMs = 1000 * 60 * 60 * 24 * 7, extra = {}) {
  const exp = Date.now() + ttlMs;
  const payload = bytesToB64url(new TextEncoder().encode(JSON.stringify({ user, exp, ...extra })));
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

// 解码 token（不校验签名，供已知合法 token 读取字段用，如 sid）
export function decodeToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload] = token.split('.');
  try {
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
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

// ===== 管理员密码 =====
// 密码来源优先级：数据库里的自定义密码 > 环境变量 ADMIN_PASS（初始密码）。
// 原因：Cloudflare 的环境变量无法在运行时改写，若只认环境变量，「修改密码」就无处落库。
// 清空所有数据时 app_settings 会被保留，因此自定义密码不会因为「清空数据」而丢失。

export const ADMIN_PASS_KEY = 'admin_pass_hash'; // app_settings 中的键名（不在 /api/settings 白名单内，不可通过接口读出）
const PBKDF2_ITER = 100000;

function bytesToB64(bytes) {
  let bin = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}
function b64ToBytes(s) {
  const bin = atob(s);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}
async function pbkdf2(pass, salt, iter) {
  const key = await crypto.subtle.importKey('raw', strToBytes(pass), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, key, 256
  );
  return new Uint8Array(bits);
}

/** 生成 PBKDF2-SHA256 密码哈希，格式：pbkdf2$迭代次数$盐(base64)$摘要(base64) */
export async function hashPassword(pass) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(String(pass), salt, PBKDF2_ITER);
  return `pbkdf2$${PBKDF2_ITER}$${bytesToB64(salt)}$${bytesToB64(hash)}`;
}

/** 校验密码是否匹配已存储的哈希（恒定时间比较） */
export async function verifyPassword(pass, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iter = parseInt(parts[1], 10) || PBKDF2_ITER;
  let salt, expect;
  try {
    salt = b64ToBytes(parts[2]);
    expect = parts[3];
  } catch (_) {
    return false;
  }
  const got = bytesToB64(await pbkdf2(String(pass), salt, iter));
  if (got.length !== expect.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expect.charCodeAt(i);
  return diff === 0;
}

/** 读取库中的自定义密码哈希；未设置过则返回 ''（此时用环境变量初始密码） */
export async function readCustomPassHash(env) {
  try {
    const row = await env.DB.prepare('SELECT value FROM app_settings WHERE key = ?')
      .bind(ADMIN_PASS_KEY).first();
    return row && row.value ? String(row.value) : '';
  } catch (_) {
    return '';
  }
}

/** 校验管理员密码：优先比对库中的自定义密码，否则回退环境变量 ADMIN_PASS */
export async function verifyAdminPassword(env, pass) {
  const custom = await readCustomPassHash(env);
  if (custom) return verifyPassword(pass, custom);
  const initial = env.ADMIN_PASS;
  return typeof initial === 'string' && initial.length > 0 && String(pass) === initial;
}

/** 写入自定义密码（覆盖式） */
export async function saveCustomPassHash(env, hash) {
  await env.DB.prepare(
    'INSERT INTO app_settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).bind(ADMIN_PASS_KEY, hash).run();
}
