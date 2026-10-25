import { json } from '../../_lib.js';

// ===== v0.5.21 AI 记忆（skill）：注入解析提示词的长期偏好 =====
// GET /api/settings/ai-memory        → {memory}
// PUT /api/settings/ai-memory        → {memory}（≤2000 字，空串=清除）
export async function onRequestGet(context) {
  const { env } = context;
  let memory = '';
  try {
    const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key='ai_memory'").first();
    memory = row ? String(row.value || '') : '';
  } catch (_) { /* 未建表时按空 */ }
  return json({ memory });
}

export async function onRequestPut(context) {
  const { env, request } = context;
  let b = {};
  try { b = await request.json(); } catch (_) { return json({ error: '请求格式不正确' }, 400); }
  const memory = String(b.memory || '').trim().slice(0, 2000);
  await env.DB.prepare(
    "INSERT INTO app_settings(key, value) VALUES ('ai_memory', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
  ).bind(memory).run();
  return json({ ok: true, memory });
}
