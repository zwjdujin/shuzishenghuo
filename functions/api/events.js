import { json } from '../_lib.js';

const CALENDARS = ['工作', '生活', '家庭', '健康'];

// GET /api/events?from=YYYY-MM-DD&to=YYYY-MM-DD
// 返回该日期范围内的事件（用于周历/月历渲染）
export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const from = url.searchParams.get('from') || '';
  const to = url.searchParams.get('to') || '';
  if (!from || !to) return json({ error: '缺少 from / to 参数' }, 400);

  const rows = (
    await env.DB.prepare(
      `SELECT id, title, start, "end", all_day, calendar, color, location, note
       FROM events WHERE date(start) BETWEEN ? AND ? ORDER BY start ASC`
    )
      .bind(from, to)
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
  return json({ events, calendars: CALENDARS });
}

// POST /api/events —— 新增事件
export async function onRequestPost(context) {
  const { env, request } = context;
  let body = {};
  try { body = await request.json(); } catch (_) {}

  const title = String(body.title || '').trim();
  if (!title) return json({ error: '请填写事件标题' }, 400);
  const start = String(body.start || '').trim();
  if (!start) return json({ error: '请选择开始时间' }, 400);

  const end = String(body.end || '').trim() || null;
  const allDay = body.allDay ? 1 : 0;
  const calendar = CALENDARS.includes(body.calendar) ? body.calendar : '生活';
  const color = String(body.color || '').trim() || null;
  const location = String(body.location || '').trim() || null;
  const note = String(body.note || '').trim() || null;

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
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const id = Number(body.id);
  if (!id) return json({ error: '缺少事件 ID' }, 400);

  const title = String(body.title || '').trim();
  if (!title) return json({ error: '请填写事件标题' }, 400);
  const start = String(body.start || '').trim();
  if (!start) return json({ error: '请选择开始时间' }, 400);

  await env.DB.prepare(
    `UPDATE events SET title=?, start=?, "end"=?, all_day=?, calendar=?, color=?, location=?, note=? WHERE id=?`
  )
    .bind(
      title,
      start,
      String(body.end || '').trim() || null,
      body.allDay ? 1 : 0,
      CALENDARS.includes(body.calendar) ? body.calendar : '生活',
      String(body.color || '').trim() || null,
      String(body.location || '').trim() || null,
      String(body.note || '').trim() || null,
      id
    )
    .run();
  return json({ ok: true, id });
}