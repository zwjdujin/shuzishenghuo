import { json, todayStr } from '../_lib.js';

const CALENDARS = ['工作', '生活', '家庭', '健康'];

// GET /api/events?from=YYYY-MM-DD&to=YYYY-MM-DD
// 返回该日期范围内的事件（用于周历/月历渲染）
export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const from = url.searchParams.get('from') || '';
  const to = url.searchParams.get('to') || '';
  if (!from || !to) return json({ error: '缺少 from / to 参数' }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return json({ error: 'from / to 需为 YYYY-MM-DD' }, 400);
  }
  // start 存的是 'YYYY-MM-DD HH:MM'，用列边界比较（可走 idx_events_start）替代 date(start) 包列；
  // 上界取「to 的次日 0 点」即字符串 to+1day，含 to 当天全部时刻
  const toNext = new Date(Date.parse(to + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);

  const rows = (
    await env.DB.prepare(
      `SELECT id, title, start, "end", all_day, calendar, color, location, note
       FROM events WHERE start >= ? AND start < ? ORDER BY start ASC`
    )
      .bind(from, toNext)
      .all()
  ).results || [];

  const events = rows.map((r) => ({
    id: r.id,
    title: r.title,
    start: r.start,
    end: r.end,
    allDay: !!r.all_day,
    calendar: r.calendar || '生活',
    color: r.color || null,
    location: r.location || '',
    note: r.note || '',
  }));

  // ---- v0.5.10 经期叠加（隐私开关 period_visible，关=日历完全不留痕迹）----
  // periods：与范围重叠的经期区间；prediction：下次开始预估日（不落库，纯推算）
  let periods = [];
  let prediction = null;
  let periodVisible = false;
  try {
    const vis = await env.DB.prepare("SELECT value FROM app_settings WHERE key='period_visible'").first();
    periodVisible = vis ? vis.value !== '0' : true;
    if (periodVisible) {
      const prows = (await env.DB.prepare(
        `SELECT start_date, end_date FROM period_logs
         WHERE start_date <= ? AND (end_date IS NULL OR end_date = '' OR end_date >= ?)
         ORDER BY start_date`
      ).bind(to, from).all()).results || [];
      periods = prows.map((p) => ({ start: p.start_date, end: p.end_date || todayStr() }));
      const all = (await env.DB.prepare('SELECT start_date FROM period_logs ORDER BY start_date').all()).results || [];
      const starts = all.map((r) => r.start_date);
      const diffs = [];
      for (let i = 1; i < starts.length; i++) {
        const d = Math.round((new Date(starts[i] + 'T00:00') - new Date(starts[i - 1] + 'T00:00')) / 86400000);
        if (d >= 15 && d <= 60) diffs.push(d);
      }
      if (starts.length && diffs.length) {
        const avg = Math.round(diffs.slice(-6).reduce((s, x) => s + x, 0) / Math.min(diffs.length, 6));
        const last = starts[starts.length - 1];
        const pd = new Date(last + 'T00:00');
        pd.setDate(pd.getDate() + avg);
        prediction = `${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, '0')}-${String(pd.getDate()).padStart(2, '0')}`;
      }
    }
  } catch (_) { /* 表未建/未迁移时静默 */ }

  return json({ events, calendars: CALENDARS, periods, prediction, periodVisible });
}

// 写入字段统一清洗（v0.5.48：长度与时间格式收口）
const cleanTitle = (s) => String(s || '').trim().slice(0, 80);
const cleanText = (s, max) => String(s || '').trim().slice(0, max) || null;
// events.start 存 'YYYY-MM-DD HH:MM'（历史数据兼容可带秒/带 T）
const cleanStart = (s) => {
  const m = /^(\d{4}-\d{2}-\d{2})([ T](\d{1,2}:\d{2})(:\d{2})?)?$/.exec(String(s || '').trim());
  if (!m) return null;
  return m[3] ? `${m[1]} ${m[3].padStart(5, '0')}` : m[1];
};

// POST /api/events —— 新增事件
export async function onRequestPost(context) {
  const { env, request } = context;
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: '请求格式不正确' }, 400); }

  const title = cleanTitle(body.title);
  if (!title) return json({ error: '请填写事件标题' }, 400);
  const start = cleanStart(body.start);
  if (!start) return json({ error: '开始时间需为 YYYY-MM-DD 或 YYYY-MM-DD HH:MM' }, 400);

  const end = cleanStart(body.end);
  const allDay = body.allDay ? 1 : 0;
  const calendar = CALENDARS.includes(body.calendar) ? body.calendar : '生活';
  const color = cleanText(body.color, 20);
  const location = cleanText(body.location, 60);
  const note = cleanText(body.note, 200);

  const res = await env.DB.prepare(
    `INSERT INTO events(title, start, "end", all_day, calendar, color, location, note)
     VALUES (?,?,?,?,?,?,?,?)`
  )
    .bind(title, start, end, allDay, calendar, color, location, note)
    .run();
  const id = res.meta && res.meta.last_row_id ? res.meta.last_row_id : null;
  return json({ ok: true, id, event: { id, title, start, end, allDay: !!allDay, calendar, color, location, note } }, 201);
}

// PUT /api/events —— 编辑事件
export async function onRequestPut(context) {
  const { env, request } = context;
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: '请求格式不正确' }, 400); }
  const id = Number(body.id);
  if (!id) return json({ error: '缺少事件 ID' }, 400);

  const title = cleanTitle(body.title);
  if (!title) return json({ error: '请填写事件标题' }, 400);
  const start = cleanStart(body.start);
  if (!start) return json({ error: '开始时间需为 YYYY-MM-DD 或 YYYY-MM-DD HH:MM' }, 400);

  await env.DB.prepare(
    `UPDATE events SET title=?, start=?, "end"=?, all_day=?, calendar=?, color=?, location=?, note=? WHERE id=?`
  )
    .bind(
      title,
      start,
      cleanStart(body.end),
      body.allDay ? 1 : 0,
      CALENDARS.includes(body.calendar) ? body.calendar : '生活',
      cleanText(body.color, 20),
      cleanText(body.location, 60),
      cleanText(body.note, 200),
      id
    )
    .run();
  return json({ ok: true, id });
}

// DELETE /api/events?id= —— 删除日程（此前缺失该实现，UI 的删除一直是 405 静默失败）
export async function onRequestDelete(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const id = Number(url.searchParams.get('id'));
  if (!id) return json({ error: '缺少事件 ID' }, 400);
  await env.DB.prepare('DELETE FROM events WHERE id = ?').bind(id).run();
  return json({ ok: true, id });
}