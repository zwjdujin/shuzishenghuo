import { json } from '../_lib.js';

// 允许在「个人中心」中修改的设置项
const ALLOWED = ['brand_name', 'brand_avatar', 'brand_tagline', 'theme'];
const DEFAULTS = {
  brand_name: '数字生活',
  brand_avatar: '数',
  brand_tagline: '把日子过成自己喜欢的样子',
  theme: 'plum',
};

// GET /api/settings —— 读取当前设置
export async function onRequestGet(context) {
  const { env } = context;
  const rows = (await env.DB.prepare('SELECT key, value FROM app_settings').all()).results || [];
  const settings = { ...DEFAULTS };
  rows.forEach((r) => { if (ALLOWED.includes(r.key)) settings[r.key] = r.value; });
  return json({ settings });
}

// PUT/POST /api/settings —— 更新设置（仅接受白名单内的键）
export async function onRequestPut(context) {
  return update(context);
}
export async function onRequestPost(context) {
  return update(context);
}

async function update(context) {
  const { env, request } = context;
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const sets = [];
  ALLOWED.forEach((k) => {
    if (body[k] !== undefined && body[k] !== null) {
      sets.push([k, String(body[k]).slice(0, 200)]);
    }
  });
  if (!sets.length) return json({ error: '没有可保存的设置' }, 400);
  for (const [k, v] of sets) {
    await env.DB.prepare(
      'INSERT INTO app_settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    )
      .bind(k, v)
      .run();
  }
  const rows = (await env.DB.prepare('SELECT key, value FROM app_settings').all()).results || [];
  const settings = { ...DEFAULTS };
  rows.forEach((r) => { if (ALLOWED.includes(r.key)) settings[r.key] = r.value; });
  return json({ settings });
}
