import { json } from '../../_lib.js';
import { loadAiModels } from '../ai/_config.js';

// ===== v0.5.21 POST /api/ai/test —— 测试大模型连通性（不落库） =====
// {baseUrl, apiKey, model, id?}；apiKey 为空或掩码时按 id 取已存 Key
export async function onRequestPost(context) {
  const { env, request } = context;
  let b = {};
  try { b = await request.json(); } catch (_) { return json({ error: '请求格式不正确' }, 400); }
  const baseUrl = String(b.baseUrl || '').trim().replace(/\/+$/, '');
  const model = String(b.model || '').trim();
  let apiKey = String(b.apiKey || '').trim();
  if (!apiKey || apiKey.includes('••••')) {
    const models = await loadAiModels(env);
    apiKey = (models.find((m) => m.id === b.id) || {}).apiKey || '';
  }
  if (!/^https?:\/\//.test(baseUrl)) return json({ error: '接口地址需以 http(s):// 开头' }, 400);
  if (!model) return json({ error: '请填写模型 ID' }, 400);
  if (!apiKey) return json({ error: '请填写 API Key' }, 400);

  const t0 = Date.now();
  try {
    const res = await fetch(baseUrl + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({ model, max_tokens: 8, messages: [{ role: 'user', content: 'ping' }] }),
    });
    const ms = Date.now() - t0;
    if (!res.ok) {
      const d = await res.text().catch(() => '');
      return json({ ok: false, status: res.status, error: `HTTP ${res.status} ${d.slice(0, 120)}` }, 200);
    }
    const d = await res.json().catch(() => ({}));
    const reply = d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
    return json({ ok: true, ms, reply: String(reply || '').slice(0, 40) });
  } catch (e) {
    return json({ ok: false, error: '连接失败：' + (e && e.message ? e.message : e) }, 200);
  }
}
