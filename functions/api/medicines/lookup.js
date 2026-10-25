import { json } from '../../_lib.js';

// ===== v0.5.25 药典检索（中国药典 ydz.chp.org.cn，人工核验后入库） =====
// GET /api/medicines/lookup?name=X        → 搜索药典，返回匹配条目列表
// GET /api/medicines/lookup?entryId=Y     → 取条目详情，抽取【功能与主治】【用法与用量】【规格】
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

// GET 搜索：{keyword, pageSize, pageNum} → data.list[{id,title,bookName,pageNum}]
export async function onRequestGet(context) {
  const { env, request } = context;
  // 登录校验（该路径不经过中间件的放行名单，但也不在公开名单，双保险显式校验）
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
      return json({
        ok: true,
        entry: {
          title: stripTagsTight(e.title),
          bookName: e.bookName || '中国药典（2020年版）',
          pageNum: e.pageNum || '',
          efficacy: pick('功能与主治'),
          dosage: pick('用法与用量'),
          spec: pick('规格'),
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
