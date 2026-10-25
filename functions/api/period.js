import { json, todayStr } from '../_lib.js';

// ===== v0.5.10 经期记录（日历中心 · 经期标签页） =====
// GET    /api/period                  → {logs, stats, visible}
// POST   /api/period                  → {start_date, end_date?, flow?, note?}（新建；进行中的上一条自动补结束）
// PUT    /api/period                  → {id, start_date?, end_date?, flow?, note?} 编辑；{visible} 切换月历显示
// DELETE /api/period?id=1
// 预测不落库：取最近 ≤6 个周期天数的平均推算下次开始，前端渲染。

const cleanDate = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? String(s) : '');
const diffDays = (a, b) => Math.round((new Date(b + 'T00:00') - new Date(a + 'T00:00')) / 86400000);

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

export async function onRequestGet(context) {
  const { env } = context;
  const logs = await allLogs(env);
  return json({
    visible: await getVisible(env),
    stats: computeStats(logs),
    logs: logs.reverse().map((l) => ({ // 新的在前
      id: l.id, startDate: l.start_date, endDate: l.end_date || '',
      flow: l.flow, note: l.note || '',
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
  const flow = [1, 2, 3].includes(Number(b.flow)) ? Number(b.flow) : 2;
  const end = cleanDate(b.end_date);
  if (end && end < start) return json({ error: '结束日期不能早于开始日期' }, 400);
  if (end && diffDays(start, end) > 30) return json({ error: '一次经期不会超过 30 天，请检查日期' }, 400);
  const note = String(b.note || '').trim().slice(0, 60) || null;

  const dup = await env.DB.prepare('SELECT id FROM period_logs WHERE start_date=?').bind(start).first();
  if (dup) return json({ error: '该日期已有经期记录，可在历史里编辑' }, 409);
  // 上一次经期还开着 → 自动补结束（新周期开始即上次已结束）
  const open = await env.DB.prepare('SELECT id, start_date FROM period_logs WHERE end_date IS NULL ORDER BY start_date DESC LIMIT 1').first();
  const batch = [];
  if (open && open.start_date < start) {
    const autoEnd = addDaysStr(start, -1);
    batch.push(env.DB.prepare('UPDATE period_logs SET end_date=? WHERE id=?').bind(autoEnd, open.id));
  }
  batch.push(env.DB.prepare('INSERT INTO period_logs(start_date, end_date, flow, note) VALUES (?,?,?,?)').bind(start, end || null, flow, note));
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
  const flow = b.flow !== undefined ? (Number(b.flow) || 2) : row.flow;
  if (![1, 2, 3].includes(Number(flow))) return json({ error: '量取值无效' }, 400);
  const note = b.note !== undefined ? (String(b.note).trim().slice(0, 60) || null) : row.note;
  // 改开始日期时撞上别的记录的唯一键 → 提示
  if (start !== row.start_date) {
    const dup = await env.DB.prepare('SELECT id FROM period_logs WHERE start_date=? AND id<>?').bind(start, id).first();
    if (dup) return json({ error: '该日期已有经期记录' }, 409);
  }
  await env.DB.prepare('UPDATE period_logs SET start_date=?, end_date=?, flow=?, note=? WHERE id=?')
    .bind(start, end, flow, note, id).run();
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
