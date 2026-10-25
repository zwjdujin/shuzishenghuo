import { json, todayStr } from '../_lib.js';

// ===== v0.5.11 经期记录（日历中心 · 经期标签页） =====
// GET    /api/period                  → {logs, stats, visible}
// POST   /api/period                  → {start_date, end_date?, flow?, blood_color?, blood_texture?,
//                                        dysmenorrhea?, pain_types?, symptoms?, symptom_other?, note?}
// PUT    /api/period                  → {id, ...同上局部更新}；{visible} 切换月历显示
// DELETE /api/period?id=1
// 预测不落库：取最近 ≤6 个周期天数的平均推算下次开始，前端渲染。

const FLOWS = [1, 2, 3, 4, 5];                 // 极少/偏少/正常/偏多/极多
const BLOOD_COLORS = [1, 2, 3, 4];             // 浅淡/正常/深红/深黑
const BLOOD_TEXTURES = [1, 2, 3];              // 稀薄/正常/粘稠
export const PAIN_TYPES = ['胀痛', '刺痛', '冷痛', '绞痛', '坠痛', '不知道啥痛就是痛'];
export const SYMPTOMS = ['乳房胀痛', '头痛', '身痛', '失眠', '情绪异常', '泄泻', '浮肿', '口腔溃疡', '吐血/流鼻血', '发热', '起疹子'];

const cleanDate = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? String(s) : '');
const diffDays = (a, b) => Math.round((new Date(b + 'T00:00') - new Date(a + 'T00:00')) / 86400000);
/** 多选清洗：只留允许值（词内不会出现逗号），CSV 存储 */
const csvPick = (input, allowed) => {
  const arr = Array.isArray(input) ? input : String(input || '').split(',');
  const out = arr.map((x) => String(x).replace(/[,，]/g, '').trim()).filter((x) => allowed.includes(x));
  return [...new Set(out)].slice(0, allowed.length).join(',') || null;
};
const pickLevel = (v, allowed) => (allowed.includes(Number(v)) ? Number(v) : null);

async function getVisible(env) {
  try {
    const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key='period_visible'").first();
    return row ? row.value !== '0' : true;
  } catch (_) { return true; }
}

async function allLogs(env) {
  return (await env.DB.prepare('SELECT * FROM period_logs ORDER BY start_date').all()).results || [];
}

/** 统计与预测：周期取最近 ≤6 次相邻开始日之差的平均；经期天数取有结束日的平均 */
function computeStats(logs) {
  const starts = logs.map((l) => l.start_date);
  const cycles = [];
  for (let i = 1; i < starts.length; i++) {
    const d = diffDays(starts[i - 1], starts[i]);
    if (d >= 15 && d <= 60) cycles.push(d); // 15~60 天外的差值视为漏记/脏数据，不进平均
  }
  const recentCycles = cycles.slice(-6);
  const cycleAvg = recentCycles.length ? Math.round(recentCycles.reduce((s, x) => s + x, 0) / recentCycles.length) : null;
  const periodLens = logs.filter((l) => l.end_date).map((l) => diffDays(l.start_date, l.end_date) + 1).slice(-6);
  const periodAvg = periodLens.length ? Math.round(periodLens.reduce((s, x) => s + x, 0) / periodLens.length) : null;
  const last = logs[logs.length - 1] || null;
  const ongoing = last && !last.end_date ? last : null;
  let cycleDay = null;
  if (ongoing) cycleDay = diffDays(ongoing.start_date, todayStr()) + 1;
  const nextPredicted = cycleAvg && last ? addDaysStr(last.start_date, cycleAvg) : null;
  return { cycleAvg, periodAvg, cycleDay, ongoingId: ongoing ? ongoing.id : null, ongoingStart: ongoing ? ongoing.start_date : null, nextPredicted, samples: recentCycles.length };
}
function addDaysStr(ds, n) {
  const d = new Date(ds + 'T00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 请求体 → 列值（POST 全量默认 / PUT 局部 undefined=不动） */
function bodyFields(b, base) {
  const get = (k, dflt) => (b[k] !== undefined ? b[k] : (base ? base[k] : dflt));
  const flow = Number(get('flow', 3));
  if (!FLOWS.includes(flow)) return { error: '经量取值无效' };
  const blood_color = get('blood_color', null);
  const blood_texture = get('blood_texture', null);
  const dysmenorrhea = Number(get('dysmenorrhea', 0)) ? 1 : 0;
  // 痛经分型只在勾选痛经时保留
  const pain_types = dysmenorrhea ? csvPick(get('pain_types', null), PAIN_TYPES) : null;
  const symptoms = csvPick(get('symptoms', null), SYMPTOMS);
  const symptom_other = String(get('symptom_other', '') || '').replace(/[,，]/g, '').trim().slice(0, 30) || null;
  return {
    values: {
      flow,
      blood_color: pickLevel(blood_color, BLOOD_COLORS),
      blood_texture: pickLevel(blood_texture, BLOOD_TEXTURES),
      dysmenorrhea,
      pain_types,
      symptoms,
      symptom_other,
      note: String(get('note', '') || '').trim().slice(0, 60) || null,
    },
  };
}

export async function onRequestGet(context) {
  const { env } = context;
  const logs = await allLogs(env);
  return json({
    visible: await getVisible(env),
    stats: computeStats(logs),
    logs: logs.reverse().map((l) => ({ // 新的在前
      id: l.id, startDate: l.start_date, endDate: l.end_date || '',
      flow: l.flow, bloodColor: l.blood_color, bloodTexture: l.blood_texture,
      dysmenorrhea: !!l.dysmenorrhea, painTypes: l.pain_types || '', symptoms: l.symptoms || '',
      symptomOther: l.symptom_other || '', note: l.note || '',
      days: l.end_date ? diffDays(l.start_date, l.end_date) + 1 : null,
    })),
  });
}

export async function onRequestPost(context) {
  const { env, request } = context;
  let b = {};
  try { b = await request.json(); } catch (_) { return json({ error: '请求格式不正确' }, 400); }
  const start = cleanDate(b.start_date);
  if (!start) return json({ error: '请选择开始日期' }, 400);
  const end = cleanDate(b.end_date);
  if (end && end < start) return json({ error: '结束日期不能早于开始日期' }, 400);
  if (end && diffDays(start, end) > 30) return json({ error: '一次经期不会超过 30 天，请检查日期' }, 400);

  const f = bodyFields(b, null);
  if (f.error) return json({ error: f.error }, 400);

  const dup = await env.DB.prepare('SELECT id FROM period_logs WHERE start_date=?').bind(start).first();
  if (dup) return json({ error: '该日期已有经期记录，可在历史里编辑' }, 409);
  // 上一次经期还开着 → 自动补结束（新周期开始即上次已结束）
  const open = await env.DB.prepare('SELECT id, start_date FROM period_logs WHERE end_date IS NULL ORDER BY start_date DESC LIMIT 1').first();
  const batch = [];
  if (open && open.start_date < start) {
    batch.push(env.DB.prepare('UPDATE period_logs SET end_date=? WHERE id=?').bind(addDaysStr(start, -1), open.id));
  }
  const v = f.values;
  batch.push(env.DB.prepare(
    'INSERT INTO period_logs(start_date, end_date, flow, blood_color, blood_texture, dysmenorrhea, pain_types, symptoms, symptom_other, note) VALUES (?,?,?,?,?,?,?,?,?,?)'
  ).bind(start, end || null, v.flow, v.blood_color, v.blood_texture, v.dysmenorrhea, v.pain_types, v.symptoms, v.symptom_other, v.note));
  await env.DB.batch(batch);
  return json({ ok: true }, 201);
}

export async function onRequestPut(context) {
  const { env, request } = context;
  let b = {};
  try { b = await request.json(); } catch (_) { return json({ error: '请求格式不正确' }, 400); }

  // 隐私开关：{visible:true|false}
  if (b.visible !== undefined) {
    const v = b.visible ? '1' : '0';
    await env.DB.prepare(
      "INSERT INTO app_settings(key, value) VALUES ('period_visible', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
    ).bind(v).run();
    return json({ ok: true, visible: b.visible ? true : false });
  }

  const id = Number(b.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  const row = await env.DB.prepare('SELECT * FROM period_logs WHERE id=?').bind(id).first();
  if (!row) return json({ error: '记录不存在' }, 404);
  const start = b.start_date !== undefined ? cleanDate(b.start_date) : row.start_date;
  const end = b.end_date !== undefined ? (cleanDate(b.end_date) || null) : row.end_date;
  if (!start) return json({ error: '开始日期无效' }, 400);
  if (end && end < start) return json({ error: '结束日期不能早于开始日期' }, 400);
  if (start !== row.start_date) {
    const dup = await env.DB.prepare('SELECT id FROM period_logs WHERE start_date=? AND id<>?').bind(start, id).first();
    if (dup) return json({ error: '该日期已有经期记录' }, 409);
  }
  const f = bodyFields(b, {
    flow: row.flow, blood_color: row.blood_color, blood_texture: row.blood_texture,
    dysmenorrhea: row.dysmenorrhea, pain_types: row.pain_types, symptoms: row.symptoms,
    symptom_other: row.symptom_other, note: row.note,
  });
  if (f.error) return json({ error: f.error }, 400);
  const v = f.values;
  await env.DB.prepare(
    'UPDATE period_logs SET start_date=?, end_date=?, flow=?, blood_color=?, blood_texture=?, dysmenorrhea=?, pain_types=?, symptoms=?, symptom_other=?, note=? WHERE id=?'
  ).bind(start, end, v.flow, v.blood_color, v.blood_texture, v.dysmenorrhea, v.pain_types, v.symptoms, v.symptom_other, v.note, id).run();
  return json({ ok: true });
}

export async function onRequestDelete(context) {
  const { env, request } = context;
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!id) return json({ error: '缺少 id' }, 400);
  const row = await env.DB.prepare('SELECT id FROM period_logs WHERE id=?').bind(id).first();
  if (!row) return json({ error: '记录不存在' }, 404);
  await env.DB.prepare('DELETE FROM period_logs WHERE id=?').bind(id).run();
  return json({ ok: true, id });
}
