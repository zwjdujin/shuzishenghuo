import { json, todayStr } from '../_lib.js';

const DEFAULT_LIST = '生活';
const REPEAT_RE = /^(daily|weekdays|weekly:[1-7](,[1-7])*|monthly:([1-9]|[12]\d|3[01])|yearly:\d{4}|every:[1-9]\d*d)$/;

// P0-P3：重要/紧急矩阵
const PRIORITIES = ['P0', 'P1', 'P2', 'P3'];
const PRIORITY_META = {
  P0: { label: 'P0', desc: '重要且紧急', important: 1, urgent: 1, rank: 0 },
  P1: { label: 'P1', desc: '重要不紧急', important: 1, urgent: 0, rank: 1 },
  P2: { label: 'P2', desc: '紧急不重要', important: 0, urgent: 1, rank: 2 },
  P3: { label: 'P3', desc: '不重要不紧急', important: 0, urgent: 0, rank: 3 },
};
const PRIORITY_ORDER = "CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END ASC";

// 由重要/紧急两个维度推导 P 级
function priorityOf(important, urgent) {
  if (important && urgent) return 'P0';
  if (important && !urgent) return 'P1';
  if (!important && urgent) return 'P2';
  return 'P3';
}

// 清单读正式 todo_lists 表（v0.5.52 迁移 0016 播种，空表兜底默认值）
async function getLists(env) {
  try {
    const rows = (await env.DB.prepare(
      'SELECT id, name, icon, color, sort_order FROM todo_lists ORDER BY sort_order ASC, id ASC'
    ).all()).results || [];
    if (rows.length) return rows;
  } catch (_) { /* 迁移未跑时兜底 */ }
  return [DEFAULT_LIST, '工作', '健康', '学习', '家庭'].map((n) => ({ id: 0, name: n, icon: '', color: '', sort_order: 0 }));
}

const listNames = (lists) => lists.map((l) => (typeof l === 'string' ? l : l.name));

const PRIORITY_ORDER_T = "CASE t.priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END ASC";

// 视图 → 基础查询条件（微软 To Do 式五视图；不含优先级筛选，那层在 base 之上叠加）
function baseFor(view, today, listName) {
  switch (view) {
    case 'myday':      // 我的一天：当天加入的（含已完成段），过夜自然重置
      return { where: ['t.my_day_date = ?'], params: [today], order: `t.done ASC, t.star DESC, ${PRIORITY_ORDER_T}, t.todo_time ASC, t.id ASC` };
    case 'important':  // 重要：全部星标未完成
      return { where: ['t.done=0', 't.star=1'], params: [], order: `${PRIORITY_ORDER_T}, t.todo_date ASC, t.todo_time ASC` };
    case 'planned':    // 计划内：全部有日期的未完成（前端按 逾期/今天/明天/本周/以后 分节）
      return { where: ['t.done=0', 't.todo_date IS NOT NULL', "t.todo_date != ''"], params: [], order: 't.todo_date ASC, t.todo_time ASC, t.id ASC' };
    case 'completed':  // 已完成：最近 200 条
      return { where: ['t.done=1'], params: [], order: 't.completed_at DESC, t.id DESC', limit: 200 };
    case 'list':       // 清单视图：手动排序过的在前（拖拽 sort_order），其余按优先级/日期
      return {
        where: ['t.done=0', 't.list = ?'],
        params: [listName],
        order: `CASE WHEN t.sort_order > 0 THEN 0 ELSE 1 END ASC, t.sort_order ASC, ${PRIORITY_ORDER_T}, t.todo_date ASC, t.todo_time ASC`,
      };
    default:
      return null;
  }
}

function mapTodo(r, today) {
  return {
    id: r.id,
    title: r.title,
    date: r.todo_date,
    time: r.todo_time || '',
    list: r.list || DEFAULT_LIST,
    priority: r.priority || 'P3',
    priorityDesc: (PRIORITY_META[r.priority] || PRIORITY_META.P3).desc,
    important: !!r.important,
    urgent: !!r.urgent,
    star: !!r.star,
    myDay: r.my_day_date === today,
    repeat: r.repeat_rule || '',
    note: r.note || '',
    remind: !!r.remind,
    done: !!r.done,
    completedAt: r.completed_at || '',
    stepsTotal: r.steps_total || 0,
    stepsDone: r.steps_done || 0,
    overdue: !!r.todo_date && !r.done && r.todo_date < today,
    isToday: r.todo_date === today,
  };
}

// 步骤清洗：[{content, done}]，超长裁剪、空内容丢弃
const cleanSteps = (arr) =>
  Array.isArray(arr)
    ? arr.map((s, i) => ({ content: String((s && s.content) || '').trim().slice(0, 60), done: s && s.done ? 1 : 0, ord: i })).filter((s) => s.content)
    : null;   // null = 未提供，不动库

// steps 落库（delete-and-rebuild，随主写入同批原子执行）
function stepsStatements(env, todoId, steps) {
  return [
    env.DB.prepare('DELETE FROM todo_steps WHERE todo_id=?').bind(todoId),
    ...steps.map((s) => env.DB.prepare('INSERT INTO todo_steps(todo_id, content, done, sort_order) VALUES (?,?,?,?)').bind(todoId, s.content, s.done, s.ord)),
  ];
}

// GET /api/todos
//   新版：view=myday|important|planned|completed|list&list_id=N&priority=P0,P1
//   旧版兼容：scope=today|all&priority=..&list=..（首页统计/maybeNotifyTodos/ext/MCP 依赖，语义不变）
export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const today = todayStr();
  const lists = await getLists(env);
  const names = listNames(lists);

  const pRaw = (url.searchParams.get('priority') || '').trim();
  const priorities = pRaw ? pRaw.split(',').filter((p) => PRIORITIES.includes(p)) : [];

  const view = (url.searchParams.get('view') || '').trim();
  const legacyScope = (url.searchParams.get('scope') || 'today').trim();
  const legacyList = (url.searchParams.get('list') || '').trim();
  // v0.5.54 搜索：跨视图全局搜（标题/备注/步骤），含已完成，最新优先
  const q = (url.searchParams.get('q') || '').trim().slice(0, 40).replace(/[%_]/g, ' ');

  // ---- 旧 scope 语义（保持与历史行为完全一致） ----
  if (!view && !q) {
    const where = [];
    const params = [];
    if (legacyScope === 'all') {
      where.push('t.done=0');
    } else {
      where.push('t.done=0', '(t.todo_date = ? OR t.todo_date < ?)');
      params.push(today, today);
    }
    if (priorities.length) {
      where.push(`t.priority IN (${priorities.map(() => '?').join(',')})`);
      params.push(...priorities);
    }
    if (legacyList && names.includes(legacyList)) {
      where.push('t.list = ?');
      params.push(legacyList);
    }
    const rows = (await env.DB.prepare(
      `SELECT t.id,t.title,t.todo_date,t.todo_time,t.list,t.priority,t.important,t.urgent,t.note,t.remind,t.done,t.star,t.my_day_date,t.repeat_rule,t.completed_at,
        (SELECT COUNT(*) FROM todo_steps s WHERE s.todo_id=t.id) AS steps_total,
        (SELECT SUM(CASE WHEN s.done=1 THEN 1 ELSE 0 END) FROM todo_steps s WHERE s.todo_id=t.id) AS steps_done
       FROM todos t WHERE ${where.join(' AND ')}
       ORDER BY CASE t.priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END ASC, t.todo_date ASC, t.todo_time ASC`
    ).bind(...params).all()).results || [];
    const allRows = (await env.DB.prepare(
      `SELECT priority FROM todos WHERE done=0 AND (todo_date = ? OR todo_date < ?)`
    ).bind(today, today).all()).results || [];
    const counts = { P0: 0, P1: 0, P2: 0, P3: 0 };
    allRows.forEach((r) => { if (counts[r.priority] !== undefined) counts[r.priority]++; });
    return json({ todos: rows.map((r) => mapTodo(r, today)), lists: names, listsFull: lists, priorities: PRIORITIES, priorityMeta: PRIORITY_META, counts, today });
  }

  // ---- 搜索模式（q 非空时优先于视图） ----
  if (q) {
    const like = `%${q}%`;
    const rows = (await env.DB.prepare(
      `SELECT t.*,
        (SELECT COUNT(*) FROM todo_steps s WHERE s.todo_id=t.id) AS steps_total,
        (SELECT SUM(CASE WHEN s.done=1 THEN 1 ELSE 0 END) FROM todo_steps s WHERE s.todo_id=t.id) AS steps_done
       FROM todos t
       WHERE t.title LIKE ? OR t.note LIKE ? OR EXISTS(SELECT 1 FROM todo_steps s WHERE s.todo_id=t.id AND s.content LIKE ?)
       ORDER BY t.done ASC, t.todo_date ASC, ${PRIORITY_ORDER_T}
       LIMIT 100`
    ).bind(like, like, like).all()).results || [];
    return json({
      todos: rows.map((r) => mapTodo(r, today)),
      lists: names,
      listsFull: lists,
      priorities: PRIORITIES,
      priorityMeta: PRIORITY_META,
      counts: { P0: 0, P1: 0, P2: 0, P3: 0 },
      nav: {},
      today,
    });
  }

  // ---- 新视图语义 ----
  let listName = null;
  if (view === 'list') {
    const listId = Number(url.searchParams.get('list_id') || 0);
    const found = lists.find((l) => l.id === listId);
    if (!found) return json({ error: '清单不存在' }, 400);
    listName = found.name;
  }
  const base = baseFor(view, today, listName);

  // 优先级计数：基于当前视图基础条件（未叠加 priority 筛选）
  const cntWhere = [...base.where];
  const cntParams = [...base.params];
  const cntRows = (await env.DB.prepare(
    `SELECT t.priority FROM todos t WHERE ${cntWhere.join(' AND ')}`
  ).bind(...cntParams).all()).results || [];
  const counts = { P0: 0, P1: 0, P2: 0, P3: 0 };
  cntRows.forEach((r) => { if (counts[r.priority] !== undefined) counts[r.priority]++; });

  // 视图导航角标（一次条件聚合）
  const navRow = (await env.DB.prepare(
    `SELECT
       SUM(CASE WHEN done=0 AND my_day_date = ? THEN 1 ELSE 0 END) AS myday,
       SUM(CASE WHEN done=0 AND star=1 THEN 1 ELSE 0 END) AS important,
       SUM(CASE WHEN done=0 AND todo_date IS NOT NULL AND todo_date != '' THEN 1 ELSE 0 END) AS planned,
       SUM(CASE WHEN done=0 AND todo_date < ? THEN 1 ELSE 0 END) AS overdue
     FROM todos`
  ).bind(today, today).first()) || {};

  let where = [...base.where];
  let params = [...base.params];
  if (view !== 'myday' && view !== 'completed' && priorities.length) {
    where.push(`t.priority IN (${priorities.map(() => '?').join(',')})`);
    params.push(...priorities);
  }
  const limitSql = base.limit ? ` LIMIT ${base.limit}` : '';
  const rows = (await env.DB.prepare(
    `SELECT t.id,t.title,t.todo_date,t.todo_time,t.list,t.priority,t.important,t.urgent,t.note,t.remind,t.done,t.star,t.my_day_date,t.repeat_rule,t.completed_at,
      (SELECT COUNT(*) FROM todo_steps s WHERE s.todo_id=t.id) AS steps_total,
      (SELECT SUM(CASE WHEN s.done=1 THEN 1 ELSE 0 END) FROM todo_steps s WHERE s.todo_id=t.id) AS steps_done
     FROM todos t WHERE ${where.join(' AND ')} ORDER BY ${base.order}${limitSql}`
  ).bind(...params).all()).results || [];

  return json({
    todos: rows.map((r) => mapTodo(r, today)),
    lists: names,
    listsFull: lists,
    priorities: PRIORITIES,
    priorityMeta: PRIORITY_META,
    counts,
    nav: {
      myday: navRow.myday || 0,
      important: navRow.important || 0,
      planned: navRow.planned || 0,
      overdue: navRow.overdue || 0,
    },
    today,
  });
}

// 写入字段统一清洗（v0.5.48：长度与日期格式收口）
const cleanTitle = (s) => String(s || '').trim().slice(0, 60);
const cleanNote = (s) => String(s || '').trim().slice(0, 200) || null;
const cleanTime = (s) => (/^\d{1,2}:\d{2}$/.test(String(s || '').trim()) ? String(s).trim().slice(0, 5) : null);
const cleanDate = (s, fallback) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s || '').trim()) ? String(s).trim() : fallback);
const cleanRepeat = (s) => (REPEAT_RE.test(String(s || '').trim()) ? String(s).trim() : '');

// 清单名合法性：必须存在于 todo_lists（防止 ext/手写请求造出孤儿清单值）
async function validList(env, lists, v) {
  const name = String(v || '').trim().slice(0, 20);
  if (!name) return DEFAULT_LIST;
  if (listNames(lists).includes(name)) return name;
  return null;
}

// POST /api/todos —— 新增待办（priority 可给 P0-P3 或 important/urgent；可带 star/myDay/repeat）
export async function onRequestPost(context) {
  const { env, request } = context;
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: '请求格式不正确' }, 400); }

  const title = cleanTitle(body.title);
  if (!title) return json({ error: '请填写待办内容' }, 400);
  const lists = await getLists(env);
  const list = await validList(env, lists, body.list);
  if (list === null) return json({ error: '清单不存在' }, 400);
  const date = cleanDate(body.date, todayStr());
  const time = cleanTime(body.time);
  const note = cleanNote(body.note);
  const remind = body.remind ? 1 : 0;
  const star = body.star ? 1 : 0;
  const repeat = cleanRepeat(body.repeat);
  const myDayDate = body.myDay ? todayStr() : '';

  let priority;
  if (body.important !== undefined || body.urgent !== undefined) {
    priority = priorityOf(body.important ? 1 : 0, body.urgent ? 1 : 0);
  } else {
    priority = PRIORITIES.includes(body.priority) ? body.priority : 'P3';
  }
  const meta = PRIORITY_META[priority];

  const steps = cleanSteps(body.steps);
  const res = await env.DB.prepare(
    'INSERT INTO todos(title, todo_date, todo_time, list, priority, important, urgent, note, remind, done, star, my_day_date, repeat_rule) VALUES (?,?,?,?,?,?,?,?,?,0,?,?,?)'
  )
    .bind(title, date, time, list, priority, meta.important, meta.urgent, note, remind, star, myDayDate, repeat)
    .run();
  const id = res.meta && res.meta.last_row_id ? res.meta.last_row_id : null;
  if (id && steps && steps.length) {
    await env.DB.batch(stepsStatements(env, id, steps));
  }
  return json({ ok: true, id, todo: { id, title, date, time, list, priority, priorityDesc: meta.desc, star: !!star, repeat } }, 201);
}

// PUT /api/todos —— 编辑待办（全字段覆盖；star/repeat/list 新字段一并支持）
export async function onRequestPut(context) {
  const { env, request } = context;
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: '请求格式不正确' }, 400); }
  const id = Number(body.id);
  if (!id) return json({ error: '缺少待办 ID' }, 400);
  const title = cleanTitle(body.title);
  if (!title) return json({ error: '请填写待办内容' }, 400);
  const lists = await getLists(env);
  const list = await validList(env, lists, body.list);
  if (list === null) return json({ error: '清单不存在' }, 400);

  let priority;
  if (body.important !== undefined || body.urgent !== undefined) {
    priority = priorityOf(body.important ? 1 : 0, body.urgent ? 1 : 0);
  } else {
    priority = PRIORITIES.includes(body.priority) ? body.priority : 'P3';
  }
  const meta = PRIORITY_META[priority];

  const mainStmt = env.DB.prepare(
    'UPDATE todos SET title=?, todo_date=?, todo_time=?, list=?, priority=?, important=?, urgent=?, note=?, remind=?, star=?, repeat_rule=? WHERE id=?'
  )
    .bind(
      title,
      cleanDate(body.date, todayStr()),
      cleanTime(body.time),
      list,
      priority,
      meta.important,
      meta.urgent,
      cleanNote(body.note),
      body.remind ? 1 : 0,
      body.star ? 1 : 0,
      cleanRepeat(body.repeat),
      id
    );
  const steps = cleanSteps(body.steps);
  if (steps) {
    // 步骤随编辑单请求原子重写（传了 steps 数组 = 全量覆盖，空数组 = 清空）
    await env.DB.batch([mainStmt, ...stepsStatements(env, id, steps)]);
  } else {
    await mainStmt.run();
  }
  return json({ ok: true, id, priority });
}
