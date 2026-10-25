import { json } from '../../_lib.js';
import { getActiveAi } from '../ai/_config.js';

// ===== v0.5.25/v0.5.26 药典检索（中国药典 ydz.chp.org.cn，人工核验后入库） =====
// GET /api/medicines/lookup?name=X        → 搜索药典，返回匹配条目列表
// GET /api/medicines/lookup?entryId=Y     → 取条目详情，抽取【功能与主治】【用法与用量】【规格】
//   西药制剂条目药典只收标准（无临床用法段落）时，默认模型可用则由 AI 补建议（aiSuggested 标注）。
// 数据来源为国家药典委员会公开查询平台，仅作检索参考，字段由人工核验后保存。

const CHP = 'https://ydz.chp.org.cn/front-api';
const stripTags = (h) => String(h || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const stripTagsTight = (h) => String(h || '').replace(/<[^>]*>/g, '').trim(); // 标题去红字高亮标签但不加空格

async function chpFetch(url, body) {
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json;charset=UTF-8', Referer: 'https://ydz.chp.org.cn/', 'User-Agent': 'Mozilla/5.0 (shuzishenghuo)' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error('药典接口 HTTP ' + res.status);
  const d = await res.json().catch(() => null);
  if (!d || d.code !== 200) throw new Error('药典接口返回异常');
  return d.data;
}

/** 药典未收录临床用法时，由默认 AI 模型补建议（名称 + 类别 + 原文摘录） */
async function aiSuggest(env, title, category, excerpt) {
  const ai = await getActiveAi(env);
  if (!ai) return {};
  try {
    const res = await fetch(ai.base + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ai.key },
      body: JSON.stringify({
        model: ai.model,
        messages: [
          { role: 'system', content: '你是医药信息助手。根据药品名称与药典类别给出该药品在国内的适应症（或功能主治）与用法用量。只输出 JSON：{"efficacy":"...","dosage":"..."}，每项不超过 120 字，外用药注明外用方法。' },
          { role: 'user', content: `药品：${title}\n药典类别：${category}\n药典原文摘录：${excerpt}` },
        ],
        temperature: 0.2,
        max_tokens: 400,
      }),
      signal: AbortSignal.timeout(20000),
    });
    const d = await res.json().catch(() => null);
    const raw = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '';
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return {};
    const s = JSON.parse(m[0]);
    return { efficacy: String(s.efficacy || '').slice(0, 500), dosage: String(s.dosage || '').slice(0, 500) };
  } catch (_) { return {}; }
}

// GET 搜索：{keyword, pageSize, pageNum} → data.list[{id,title,bookName,pageNum}]
export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const entryId = Number(url.searchParams.get('entryId')) || 0;
  const name = String(url.searchParams.get('name') || '').trim();

  try {
    if (entryId) {
      const e = await chpFetch(`${CHP}/entry/${entryId}`);
      const text = stripTags(e.htmlContent);
      const pick = (label) => {
        const m = text.match(new RegExp('【' + label + '】([^【]*)'));
        return m ? m[1].trim().slice(0, 500) : '';
      };
      const title = stripTagsTight(e.title);
      let efficacy = pick('功能与主治') || pick('作用与用途');
      let dosage = pick('用法与用量');
      const spec = pick('规格');
      const category = pick('类别');
      // 西药制剂条目药典只收标准、常无临床用法段落——默认模型可用时由 AI 补建议
      let aiSuggested = false;
      if ((!efficacy || !dosage) && category) {
        const sug = await aiSuggest(env, title, category, text.slice(0, 700));
        if (!efficacy && sug.efficacy) { efficacy = sug.efficacy; aiSuggested = true; }
        if (!dosage && sug.dosage) { dosage = sug.dosage; aiSuggested = true; }
      }
      return json({
        ok: true,
        entry: {
          title,
          bookName: e.bookName || '中国药典（2020年版）',
          pageNum: e.pageNum || '',
          efficacy,
          dosage,
          spec,
          category,
          aiSuggested,
        },
      });
    }

    if (!name) return json({ error: '请输入药品名称' }, 400);
    const d = await chpFetch(`${CHP}/search`, { keyword: name, pageSize: 8, pageNum: 1 });
    const results = (d.list || []).map((x) => ({
      id: x.id,
      title: stripTagsTight(x.title),
      bookName: x.bookName || '',
      pageNum: x.pageNum || '',
    }));
    return json({ ok: true, results, total: d.total || 0 });
  } catch (e) {
    return json({ ok: false, error: '药典检索失败：' + (e && e.message ? e.message : e) }, 200);
  }
}
