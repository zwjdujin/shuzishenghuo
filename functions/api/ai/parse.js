import { json, todayStr } from '../../_lib.js';
import { loadCatTree } from '../txn-categories.js';
import { getActiveAi, getAiMemory } from './_config.js';

// POST /api/ai/parse —— 自然语言随手记解析（v0.5.20 多笔 / v0.5.21 图片 + 记忆 + 联系人/药品）
// 输入 { text, image? }（image = dataURL，需默认模型勾选"支持图片"）
// 输出 { ok, drafts }：module ∈ transaction|todo|relation|medicine|memo
export async function onRequestPost(context) {
  const { env, request } = context;
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const text = String(body.text || '').trim().slice(0, 200);
  const image = String(body.image || '');
  if (!text && !image) return json({ error: '请输入内容' }, 400);
  if (image && !/^data:image\/(png|jpe?g|webp);base64,/.test(image)) return json({ error: '图片格式仅支持 PNG / JPG / WebP' }, 400);
  if (image.length > 7 * 1024 * 1024) return json({ error: '图片过大，请压缩后重试（约 5MB 以内）' }, 400);

  const ai = await getActiveAi(env);
  if (!ai) return json({ notConfigured: true, error: 'AI 未配置（在 个人中心 → 智能管理 添加大模型，或设置 AI_API_KEY 环境变量）' }, 200);
  if (image && !ai.vision) return json({ error: '当前默认模型未开启图片支持（智能管理 → 编辑模型 → 勾选「支持图片」）' }, 200);

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
  // v0.5.21：名片/联系人 → relation；药品/说明书/药盒 → medicine
  let system =
    '你是「数字生活」记账/待办/档案助手。把用户的一句话（或图片）解析成 JSON 数组，只输出 JSON 数组，不要任何解释。' +
    '数组每个元素的字段：module（transaction|todo|relation|medicine|memo）、flow（expense|income）、amount（数字）、category、sub（二级分类）、' +
    'date（YYYY-MM-DD，相对日期按今天=' + today + '推算）、time（HH:MM 或空）、contact（联系人名，仅当明确提到且在名单中）、' +
    'title（todo 用）、note、confidence（0-1）。' +
    'relation 额外字段：rname（姓名）、phone、wechat、qq、company（公司）、position（职位）。' +
    'medicine 额外字段：mname（药品名）、spec（规格）、form（剂型如 片剂/胶囊剂）、dosage（用法用量）、expiry（有效期 YYYY-MM-DD 或空）。' +
    '规则：一句话里有几笔金额就输出几条 transaction，每条只含一笔金额；' +
    '金额找不到就 null；category 必须从这个名单里选：' + cats.join('、') + '。' +
    '联系人仅可从名单里选：' + (contactNames.join('、') || '无') + '。' +
    '待办与记账混在一句话时分别各出一条。' +
    '图片或文字是名片/联系人信息（姓名电话微信公司等）时输出 relation；是药品/药盒/说明书时输出 medicine（可再附一条购药 transaction）。' +
    '无法判断为记账/待办/联系人/药品的内容输出一条 module=memo，并把原文放入 note。';

  // v0.5.21：用户长期记忆（智能管理 → AI 记忆）
  const memory = await getAiMemory(env);
  if (memory) system += '\n用户长期记忆与偏好（解析与填值时遵守，如分类习惯/常用称呼/默认行为）：\n' + memory;

  const userContent = image
    ? [
        { type: 'text', text: text || '识别图片里的信息（账单/待办/名片联系人/药品等），按规则输出 JSON 数组。' },
        { type: 'image_url', image_url: { url: image } },
      ]
    : text;

  let drafts = null;
  try {
    const res = await fetch(ai.base + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ai.key },
      body: JSON.stringify({
        model: ai.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userContent },
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
  // 归一：module 合法化；transaction 需正金额、relation/medicine 需名称，否则降级 memo
  const out = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    let module = String(item.module || 'memo');
    if (!['transaction', 'todo', 'relation', 'medicine', 'memo'].includes(module)) module = 'memo';
    if (module === 'transaction' && !(Number(item.amount) > 0)) module = 'memo';
    if ((module === 'relation' || module === 'medicine') && !String(item.rname || item.mname || item.name || '').trim()) module = 'memo';
    out.push({ ...item, module });
  }
  return out.length ? out.slice(0, 10) : null;
}
