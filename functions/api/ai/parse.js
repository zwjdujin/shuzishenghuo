import { json, todayStr } from '../../_lib.js';
import { loadCatTree } from '../txn-categories.js';
import { getActiveAi } from './_config.js';

// POST /api/ai/parse —— 自然语言随手记解析
// 输入 { text: '昨天午饭花了35' }，输出结构化草稿（前端弹出可编辑预览，人确认后才入库）
// 模型配置（v0.5.9）：优先「智能管理」里配置的默认模型（app_settings.ai_models），
// 回退环境变量 AI_API_KEY / AI_BASE_URL / AI_MODEL；都没有则 notConfigured（前端降级存 memo）
export async function onRequestPost(context) {
  const { env, request } = context;
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const text = String(body.text || '').trim().slice(0, 200);
  if (!text) return json({ error: '请输入内容' }, 400);
  const ai = await getActiveAi(env);
  if (!ai) return json({ notConfigured: true, error: 'AI 未配置（在 个人中心 → 智能管理 添加大模型，或设置 AI_API_KEY 环境变量）' }, 200);

  // 把真实的分类清单与常用联系人喂给模型，减少幻觉
  const catTree = await loadCatTree(env);
  const cats = [...catTree.expense.map((c) => c.name), ...catTree.income.map((c) => c.name)];
  let contactNames = [];
  try {
    contactNames = ((await env.DB.prepare('SELECT name FROM contacts ORDER BY id DESC LIMIT 30').all()).results || [])
      .map((r) => r.name).filter(Boolean);
  } catch (_) {}

  const today = todayStr();
  // v0.5.20：多笔解析——一句话可含多笔账/待办（"吃饭20，买菜44"→两笔支出）
  const system =
    '你是「数字生活」记账/待办助手。把用户的一句话解析成 JSON 数组，只输出 JSON 数组，不要任何解释。' +
    '数组每个元素的字段：module（transaction|todo|memo）、flow（expense|income）、amount（数字）、category、sub（二级分类）、' +
    'date（YYYY-MM-DD，相对日期按今天=' + today + '推算）、time（HH:MM 或空）、contact（联系人名，仅当明确提到且在名单中）、' +
    'title（todo 用）、note、confidence（0-1）。' +
    '规则：一句话里有几笔金额就输出几条 transaction，每条只含一笔金额；' +
    '金额找不到就 null；category 必须从这个名单里选：' + cats.join('、') + '。' +
    '联系人仅可从名单里选：' + (contactNames.join('、') || '无') + '。' +
    '待办与记账混在一句话时分别各出一条。无法判断为记账或待办的内容输出一条 module=memo，并把原文放入 note。';

  let drafts = null;
  try {
    const res = await fetch(ai.base + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ai.key },
      body: JSON.stringify({
        model: ai.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: text },
        ],
        temperature: 0.1,
      }),
    });
    const d = await res.json();
    const raw = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '';
    drafts = extractDrafts(raw);
  } catch (e) {
    return json({ error: '解析失败：' + (e && e.message ? e.message : e) }, 200);
  }
  if (!drafts) return json({ error: '模型未返回有效结果' }, 200);
  return json({ ok: true, drafts });
}

/** 从模型输出提取记录数组：兼容 JSON 数组 / 单对象 / 包裹在文字里的 JSON（```json 围栏等） */
function extractDrafts(raw) {
  const tryParse = (s) => { try { return JSON.parse(s); } catch (_) { return undefined; } };
  let v = tryParse(String(raw).trim());
  if (v === undefined) {
    const fence = String(raw).match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) v = tryParse(fence[1].trim());
  }
  if (v === undefined) {
    const arr = String(raw).match(/\[[\s\S]*\]/);
    if (arr) v = tryParse(arr[0]);
  }
  if (v === undefined) {
    const obj = String(raw).match(/\{[\s\S]*\}/);
    if (obj) v = tryParse(obj[0]);
  }
  if (v === undefined) return null;
  const list = Array.isArray(v) ? v : [v];
  // 归一：module 合法化；transaction 必须有正金额（没有的降级为 memo）
  const out = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    let module = String(item.module || 'memo');
    if (!['transaction', 'todo', 'memo'].includes(module)) module = 'memo';
    if (module === 'transaction' && !(Number(item.amount) > 0)) module = 'memo';
    out.push({ ...item, module });
  }
  return out.length ? out.slice(0, 10) : null;
}
