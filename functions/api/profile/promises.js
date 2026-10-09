import { json, todayStr } from '../../_lib.js';

// ===== 承诺与待办（与 todos 表双向同步，绑定 person_id） =====

// POST /api/profile/promises {person_id, side, what, due, status, note, pushTodo}
export async function onRequestPost(context) {
  const { env, request } = context;
  let b = {};
  try { b = await request.json(); } catch (_) {}
  const personId = Number(b.person_id);
  const what = String(b.what || '').trim();
  if (!personId || !what) return json({ error: '请填写承诺事项' }, 400);

  const due = String(b.due || '').trim() || null;
  const status = String(b.status || '未开始');
  const side = String(b.side || '对方');

  const res = await env.DB.prepare(
    'INSERT INTO contact_promises(person_id,side,what,due,status,note) VALUES (?,?,?,?,?,?)'
  ).bind(personId, side, what, due, status, b.note || null).run();
  const id = res.meta && res.meta.last_row_id;

  // 同步写入待办（list='人际关系'，绑定 person_id → 待办页可按人物筛选、日历可见）
  let todoId = null;
  if (b.pushTodo) {
    const person = await env.DB.prepare('SELECT name FROM contacts WHERE id=?').bind(personId).first();
    const pname = person ? person.name : '';
    const t = await env.DB.prepare(
      `INSERT INTO todos(title,todo_date,list,priority,important,urgent,note,person_id,done)
       VALUES (?,?,'人际关系',?,?,?,?,?,0)`
    ).bind(
      `${side}承诺：${what}`,
      due || todayStr(),
      b.priority || 'P1',
      b.priority === 'P0' || b.priority === 'P1' ? 1 : 0,
      b.priority === 'P0' || b.priority === 'P2' ? 1 : 0,
      `关联人物：${pname}${b.note ? ' · ' + b.note : ''}`,
      personId
    ).run();
    todoId = t.meta && t.meta.last_row_id;
    await env.DB.prepare('UPDATE contact_promises SET todo_id=? WHERE id=?').bind(todoId, id).run();
  }
  return json({ ok: true, id, todoId }, 201);
}

// PUT /api/profile/promises {id, status, pushTodo}
export async function onRequestPut(context) {
  const { env, request } = context;
  let b = {};
  try { b = await request.json(); } catch (_) {}
  const id = Number(b.id);
  if (!id) return json({ error: '缺少 id' }, 400);

  const row = await env.DB.prepare('SELECT * FROM contact_promises WHERE id=?').bind(id).first();
  if (!row) return json({ error: '记录不存在' }, 404);

  const status = String(b.status || row.status || '未开始');
  const done = (status === '已完成' || b.action === 'done') ? 1 : 0;
  await env.DB.prepare('UPDATE contact_promises SET status=?, done=? WHERE id=?').bind(status, done, id).run();

  // 同步待办状态
  if (row.todo_id) {
    await env.DB.prepare('UPDATE todos SET done=?, status=? WHERE id=?')
      .bind(done, done ? 1 : 0, row.todo_id).run();
  } else if (b.pushTodo) {
    const person = await env.DB.prepare('SELECT name FROM contacts WHERE id=?').bind(row.person_id).first();
    const t = await env.DB.prepare(
      `INSERT INTO todos(title,todo_date,list,priority,important,urgent,note,person_id,done) VALUES (?,?,'人际关系','P1',1,0,?,?,?)`
    ).bind(`${row.side}承诺：${row.what}`, row.due || todayStr(),
          `关联人物：${person ? person.name : ''}`, row.person_id, done).run();
    await env.DB.prepare('UPDATE contact_promises SET todo_id=? WHERE id=?')
      .bind(t.meta && t.meta.last_row_id, id).run();
  }
  return json({ ok: true, id, status, done: !!done });
}

// DELETE /api/profile/promises?id=3
export async function onRequestDelete(context) {
  const { env, request } = context;
  const u = new URL(request.url);
  const id = Number(u.searchParams.get('id'));
  if (!id) return json({ error: '缺少 id' }, 400);
  const row = await env.DB.prepare('SELECT todo_id FROM contact_promises WHERE id=?').bind(id).first();
  if (row && row.todo_id) await env.DB.prepare('DELETE FROM todos WHERE id=?').bind(row.todo_id).run();
  await env.DB.prepare('DELETE FROM contact_promises WHERE id=?').bind(id).run();
  return json({ ok: true, id });
}