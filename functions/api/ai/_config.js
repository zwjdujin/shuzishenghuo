// v0.5.9 AI 模型配置（存 app_settings.ai_models，JSON 数组）：
//   [{id, name, baseUrl, apiKey, model, isDefault}]
// 优先级：库内默认模型 > 环境变量 AI_API_KEY/AI_BASE_URL/AI_MODEL。
// 下划线前缀不会被 Pages Functions 当作路由。

const DEFAULT_BASE = 'https://api.bigmodel.cn/api/paas/v4';
const DEFAULT_MODEL = 'glm-4-flash';

export async function loadAiModels(env) {
  try {
    const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key='ai_models'").first();
    if (!row) return [];
    const arr = JSON.parse(row.value);
    return Array.isArray(arr) ? arr.filter((m) => m && m.baseUrl && m.model) : [];
  } catch (_) { return []; }
}

export async function saveAiModels(env, models) {
  await env.DB.prepare(
    "INSERT INTO app_settings(key, value) VALUES ('ai_models', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
  ).bind(JSON.stringify(models)).run();
}

/** 站点 AI 实际生效的配置：库内默认模型 → 环境变量 → null(未配置) */
export async function getActiveAi(env) {
  const models = await loadAiModels(env);
  const def = models.find((m) => m.isDefault && m.apiKey) || models.find((m) => m.apiKey);
  if (def) {
    return {
      key: def.apiKey,
      base: String(def.baseUrl || DEFAULT_BASE).replace(/\/+$/, ''),
      model: def.model || DEFAULT_MODEL,
      vision: !!def.vision,
      source: 'db:' + (def.name || def.model),
    };
  }
  if (env.AI_API_KEY) {
    return {
      key: env.AI_API_KEY,
      base: String(env.AI_BASE_URL || DEFAULT_BASE).replace(/\/+$/, ''),
      model: String(env.AI_MODEL || DEFAULT_MODEL),
      vision: true, // 环境变量路线无法声明能力，按可发送处理（失败由上游报错）
      source: 'env',
    };
  }
  return null;
}

/** 用户长期记忆（智能管理 → AI 记忆），注入解析 system 提示词 */
export async function getAiMemory(env) {
  try {
    const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key='ai_memory'").first();
    return row ? String(row.value || '').slice(0, 2000) : '';
  } catch (_) { return ''; }
}
