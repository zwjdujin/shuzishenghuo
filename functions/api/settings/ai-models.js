import { json } from '../../_lib.js';
import { loadAiModels, saveAiModels } from '../ai/_config.js';

// ===== v0.5.9 AI 模型管理（智能管理 · AI 智能） =====
// GET /api/settings/ai-models  → {models:[{id,name,baseUrl,apiKeyMasked,model,isDefault}]}
//    apiKeyMasked：打码显示（sk-12••••••ab）；前端编辑时把掩码原样传回即视为"不改 Key"
// PUT /api/settings/ai-models  → {models:[...]}（apiKey 等于掩码串时沿用旧值）

const mask = (k) => {
  const s = String(k || '');
  if (s.length <= 8) return s ? '••••' : '';
  return s.slice(0, 4) + '••••' + s.slice(-4);
};

export async function onRequestGet(context) {
  const { env } = context;
  const models = await loadAiModels(env);
  return json({
    models: models.map((m) => ({
      id: m.id, name: m.name || '', baseUrl: m.baseUrl || '',
      apiKeyMasked: mask(m.apiKey), model: m.model || '', isDefault: !!m.isDefault,
    })),
  });
}

export async function onRequestPut(context) {
  const { env, request } = context;
  let body = {};
  try { body = await request.json(); } catch (_) { return json({ error: '请求格式不正确' }, 400); }
  const incoming = Array.isArray(body.models) ? body.models : null;
  if (!incoming) return json({ error: '缺少 models' }, 400);
  if (incoming.length > 10) return json({ error: '最多 10 个模型' }, 400);

  const old = await loadAiModels(env);
  const oldById = new Map(old.map((m) => [m.id, m]));

  const clean = [];
  for (const m of incoming) {
    const name = String(m.name || '').trim().slice(0, 20);
    const baseUrl = String(m.baseUrl || '').trim().replace(/\/+$/, '').slice(0, 120);
    const model = String(m.model || '').trim().slice(0, 60);
    if (!name || !baseUrl || !model) return json({ error: '名称 / 接口地址 / 模型 ID 均不能为空' }, 400);
    if (!/^https?:\/\//.test(baseUrl)) return json({ error: `「${name}」接口地址需以 http(s):// 开头` }, 400);
    // apiKey 为空或为掩码（含 ••••）→ 沿用旧值；新模型必须给 Key
    let apiKey = String(m.apiKey || '').trim();
    if (!apiKey || apiKey.includes('••••')) {
      apiKey = (oldById.get(m.id) || {}).apiKey || '';
    }
    if (!apiKey) return json({ error: `「${name}」缺少 API Key` }, 400);
    clean.push({ id: m.id || ('m' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)), name, baseUrl, apiKey, model, isDefault: !!m.isDefault });
  }

  // 默认模型恰好一个：勾了多个取第一个；一个没勾且有模型则取第一个
  const di = clean.findIndex((m) => m.isDefault);
  clean.forEach((m, i) => { m.isDefault = i === (di >= 0 ? di : (clean.length ? 0 : -1)); });

  await saveAiModels(env, clean);
  return json({ ok: true });
}
