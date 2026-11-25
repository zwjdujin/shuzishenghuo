import { json, todayStr } from '../../../_lib.js';
import { onRequestPut as putMain } from '../../todos.js';

// GET /api/todos/:id —— 编辑弹窗回填用（任务全字段 + 步骤）
export async function onRequestGet(context) {
  const { env, params } = context;
  const id = params && params.id;
  if (!id) return json({ error: '缺少 id' }, 400);
  const row = await env.DB.prepare(
    'SELECT id, title, todo_date, todo_time, list, priority, important, urgent, note, remind, done, star, my_day_date, repeat_rule, completed_at, created_at FROM todos WHERE id=?'
  ).bind(id).first();
  if (!row) return json({ error: '待办不存在' }, 404);
  const steps = (await env.DB.prepare(
    'SELECT id, content, done FROM todo_steps WHERE todo_id=? ORDER BY sort_order ASC, id ASC'
  ).bind(id).all()).results || [];
  const today = todayStr();
  return json({
    todo: {
      id: row.id,
      title: row.title,
      date: row.todo_date,
      time: row.todo_time || '',
      list: row.list || '生活',
      priority: row.priority || 'P3',
      star: !!row.star,
      repeat: row.repeat_rule || '',
      note: row.note || '',
      remind: !!row.remind,
      done: !!row.done,
      myDay: row.my_day_date === today,
      completedAt: row.completed_at || '',
    },
    steps: steps.map((s) => ({ id: s.id, content: s.content, done: !!s.done })),
  });
}

// PUT /api/todos/:id —— 编辑待办（v0.5.53 编辑弹窗走 REST 路径；转发到 /api/todos 的 PUT 复用全部校验）
export async function onRequestPut(context) {
  const body = await context.request.json().catch(() => ({}));
  const request = new Request(context.request.url, {
    method: 'PUT',
    headers: context.request.headers,
    body: JSON.stringify({ ...body, id: Number(context.params.id) }),
  });
  return putMain({ ...context, request });
}
