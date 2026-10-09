import { json, todayStr } from '../_lib.js';

const LISTS = ['生活', '工作', '健康', '学习', '家庭'];

// P0-P3：重要/紧急矩阵
const PRIORITIES = ['P0', 'P1', 'P2', 'P3'];
const PRIORITY_META = {
  P0: { label: 'P0', desc: '重要且紧急', important: 1, urgent: 1, rank: 0 },
  P1: { label: 'P1', desc: '重要不紧急', important: 1, urgent: 0, rank: 1 },
  P2: { label: 'P2', desc: '紧急不重要', important: 0, urgent: 1, rank: 2 },
  P3: { label: 'P3', desc: '不重要不紧急', important: 0, urgent: 0, rank: 3 },
};

// 由重要/紧急两个维度推导 P 级
function priorityOf(important, urgent) {
  if (important && urgent) return 'P0';
  if (important && !urgent) return 'P1';
  if (!important && urgent) return 'P2';
  return 'P3';
}

// GET /api/todos?scope=today|all&priority=P0,P1&list=工作
export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const scope = url.searchParams.get('scope') || 'today';
  const today = todayStr();

  // 筛选条件：priority 支持逗号分隔多选；list 支持单个
  const pRaw = (url.searchParams.get('priority') || '').trim();
  const priorities = pRaw ? pRaw.split(',').filter((p) => PRIORITIES.includes(p)) : [];
  const listFilter = (url.searchParams.get('list') || '').trim();

  const where = [];
  const params = [];
  if (scope === 'all') {
    where.push('done=0');
  } else {
    where.push('done=0', '(todo_date = ? OR todo_date < ?)');
    params.push(today, today);
  }
  if (priorities.length) {
    where.push(`priority IN (${priorities.map(() => '?').join(',')})`);
    params.push(...priorities);
  }
  if (listFilter && LISTS.includes(listFilter)) {
    where.push('list = ?');
    params.push(listFilter);
  }

  const sql =
    `SELECT id,title,todo_date,todo_time,list,priority,important,urgent,note,remind,done
     FROM todos WHERE ${where.join(' AND ')}
     ORDER BY CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END ASC,
              todo_date ASC, todo_time ASC`;

  const rows = (await env.DB.prepare(sql).bind(...params).all()).results || [];

  const todos = rows.map((r) => ({
    id: r.id,
    title: r.title,
    date: r.todo_date,
    time: r.todo_time || '',
    list: r.list || '生活',
    priority: r.priority || 'P3',
    priorityDesc: (PRIORITY_META[r.priority] || PRIORITY_META.P3).desc,
    important: !!r.important,
    urgent: !!r.urgent,
    note: r.note || '',
    remind: !!r.remind,
    done: !!r.done,
    overdue: !!r.todo_date && r.todo_date < today,
    isToday: r.todo_date === today,
  }));

  // 各优先级计数（用于筛选栏显示数量，基于 scope 内的全部数据）
  const allRows =
    scope === 'all'
      ? (await env.DB.prepare('SELECT priority FROM todos WHERE done=0').all()).results || []
      : (await env.DB.prepare('SELECT priority FROM todos WHERE done=0 AND (todo_date = ? OR todo_date < ?)')
          .bind(today, today).all()).results || [];
  const counts = { P0: 0, P1: 0, P2: 0, P3: 0 };
  allRows.forEach((r) => { if (counts[r.priority] !== undefined) counts[r.priority]++; });

  return json({ todos, lists: LISTS, priorities: PRIORITIES, priorityMeta: PRIORITY_META, counts, today });
}

// POST /api/todos —— 新增待办（priority 可直接给 P0-P3，也可给 important/urgent）
export async function onRequestPost(context) {
  const { env, request } = context;
  let body = {};
  try { body = await request.json(); } catch (_) {}

  const title = String(body.title || '').trim();
  if (!title) return json({ error: '请填写待办内容' }, 400);
  const date = String(body.date || '').trim() || todayStr();
  const time = String(body.time || '').trim() || null;
  const list = LISTS.includes(body.list) ? body.list : '生活';
  const note = String(body.note || '').trim() || null;
  const remind = body.remind ? 1 : 0;

  // 优先级：优先取重要/紧急两个维度推导；否则用传入的 P 级
  let priority;
  if (body.important !== undefined || body.urgent !== undefined) {
    priority = priorityOf(body.important ? 1 : 0, body.urgent ? 1 : 0);
  } else {
    priority = PRIORITIES.includes(body.priority) ? body.priority : 'P3';
  }
  const meta = PRIORITY_META[priority];

  const res = await env.DB.prepare(
    'INSERT INTO todos(title, todo_date, todo_time, list, priority, important, urgent, note, remind, done) VALUES (?,?,?,?,?,?,?,?,?,0)'
  )
    .bind(title, date, time, list, priority, meta.important, meta.urgent, note, remind)
    .run();
  const id = res.meta && res.meta.last_row_id ? res.meta.last_row_id : null;
  return json({ ok: true, id, todo: { id, title, date, time, list, priority, priorityDesc: meta.desc } }, 201);
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

  let priority;
  if (body.important !== undefined || body.urgent !== undefined) {
    priority = priorityOf(body.important ? 1 : 0, body.urgent ? 1 : 0);
  } else {
    priority = PRIORITIES.includes(body.priority) ? body.priority : 'P3';
  }
  const meta = PRIORITY_META[priority];

  await env.DB.prepare(
    'UPDATE todos SET title=?, todo_date=?, todo_time=?, list=?, priority=?, important=?, urgent=?, note=?, remind=? WHERE id=?'
  )
    .bind(
      title,
      String(body.date || '').trim() || todayStr(),
      String(body.time || '').trim() || null,
      LISTS.includes(body.list) ? body.list : '生活',
      priority,
      meta.important,
      meta.urgent,
      String(body.note || '').trim() || null,
      body.remind ? 1 : 0,
      id
    )
    .run();
  return json({ ok: true, id, priority });
}