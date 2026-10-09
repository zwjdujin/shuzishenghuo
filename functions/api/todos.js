import { json, todayStr } from '../_lib.js';

const LISTS = ['生活', '工作', '健康', '学习', '家庭'];
const PRIORITIES = ['normal', 'high'];

// GET /api/todos?scope=today|all
// 默认仅返回今日待办（scope=today，含逾期顺延）；scope=all 返回全部未完成
export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const scope = url.searchParams.get('scope') || 'today';
  const today = todayStr();

  const sql =
    scope === 'all'
      ? `SELECT id,title,todo_date,todo_time,list,priority,note,remind,done FROM todos
         WHERE done=0 ORDER BY done ASC, priority DESC, todo_date ASC, todo_time ASC`
      : `SELECT id,title,todo_date,todo_time,list,priority,note,remind,done FROM todos
         WHERE done=0 AND (todo_date = ? OR todo_date < ?)
         ORDER BY priority DESC, todo_date ASC, todo_time ASC`;

  const rows = scope === 'all'
    ? (await env.DB.prepare(sql).all()).results || []
    : (await env.DB.prepare(sql).bind(today, today).all()).results || [];

  const todos = rows.map((r) => ({
    id: r.id,
    title: r.title,
    date: r.todo_date,
    time: r.todo_time || '',
    list: r.list || '生活',
    priority: r.priority || 'normal',
    note: r.note || '',
    remind: !!r.remind,
    done: !!r.done,
    overdue: !!r.todo_date && r.todo_date < today,
    isToday: r.todo_date === today,
  }));

  // 顺延提醒：昨天未完成已自动归入今日（scope=today 时通过 overdue 标记体现）
  return json({ todos, lists: LISTS, today });
}

// POST /api/todos —— 新增待办
export async function onRequestPost(context) {
  const { env, request } = context;
  let body = {};
  try { body = await request.json(); } catch (_) {}

  const title = String(body.title || '').trim();
  if (!title) return json({ error: '请填写待办内容' }, 400);
  const date = String(body.date || '').trim() || todayStr();
  const time = String(body.time || '').trim() || null;
  const list = LISTS.includes(body.list) ? body.list : '生活';
  const priority = PRIORITIES.includes(body.priority) ? body.priority : 'normal';
  const note = String(body.note || '').trim() || null;
  const remind = body.remind ? 1 : 0;

  const res = await env.DB.prepare(
    'INSERT INTO todos(title, todo_date, todo_time, list, priority, note, remind, done) VALUES (?,?,?,?,?,?,?,0)'
  )
    .bind(title, date, time, list, priority, note, remind)
    .run();
  const id = res.meta && res.meta.last_row_id ? res.meta.last_row_id : null;
  return json({ ok: true, id, todo: { id, title, date, time, list, priority, note } }, 201);
}

// PUT /api/todos —— 编辑待办
export async function onRequestPut(context) {
  const { env, request } = context;
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const id = Number(body.id);
  if (!id) return json({ error: '缺少待办 ID' }, 400);
  const title = String(body.title || '').trim();
  if (!title) return json({ error: '请填写待办内容' }, 400);

  await env.DB.prepare(
    'UPDATE todos SET title=?, todo_date=?, todo_time=?, list=?, priority=?, note=?, remind=? WHERE id=?'
  )
    .bind(
      title,
      String(body.date || '').trim() || todayStr(),
      String(body.time || '').trim() || null,
      LISTS.includes(body.list) ? body.list : '生活',
      PRIORITIES.includes(body.priority) ? body.priority : 'normal',
      String(body.note || '').trim() || null,
      body.remind ? 1 : 0,
      id
    )
    .run();
  return json({ ok: true, id });
}