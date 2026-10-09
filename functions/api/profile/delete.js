import { json } from '../../_lib.js';

// DELETE /api/profile/delete?id=4 —— 删除联系人（级联清理其档案数据）
export async function onRequest(context) {
  const { env, request } = context;
  const u = new URL(request.url);
  const m = u.pathname.match(/\/profile\/delete\/(\d+)/);
  const id = Number(m ? m[1] : u.searchParams.get('id'));
  if (!id) return json({ error: '缺少联系人 id' }, 400);

  const person = await env.DB.prepare('SELECT name FROM contacts WHERE id=?').bind(id).first();
  if (!person) return json({ error: '联系人不存在' }, 404);

  // 先取该人物绑定的待办与账本流水 id，删除档案后一并清理
  const todos = (await env.DB.prepare('SELECT id FROM todos WHERE person_id=?').bind(id).all()).results || [];
  const txns = (await env.DB.prepare('SELECT txn_id FROM contact_money WHERE person_id=? AND txn_id IS NOT NULL').bind(id).all()).results || [];

  // 清理其他联系人的关联引用（把指向此人的 ref_id 置空，避免出现死链）
  await env.DB.prepare('UPDATE contact_relatives SET ref_id=NULL WHERE ref_id=?').bind(id).run();

  // 级联删除该人物的档案数据
  const tables = ['contact_contacts', 'contact_edu', 'contact_rel', 'contact_work', 'contact_family',
    'contact_pref', 'contact_trait', 'contact_interacts', 'contact_relatives', 'contact_promises', 'contact_money'];
  for (const t of tables) {
    await env.DB.prepare(`DELETE FROM ${t} WHERE person_id=?`).bind(id).run();
  }
  // 删除 R2 中的附件
  if (env.BUCKET) {
    const files = (await env.DB.prepare('SELECT r2_path FROM contact_files WHERE person_id=?').bind(id).all()).results || [];
    for (const f of files) {
      try { await env.BUCKET.delete(f.r2_path); } catch (_) { /* 忽略删除失败 */ }
    }
  }
  await env.DB.prepare('DELETE FROM contact_files WHERE person_id=?').bind(id).run();
  // 同步删除 todos / transactions 中由承诺与人情产生的记录
  for (const t of todos) await env.DB.prepare('DELETE FROM todos WHERE id=?').bind(t.id).run();
  for (const t of txns) await env.DB.prepare('DELETE FROM transactions WHERE id=?').bind(t.txn_id).run();

  await env.DB.prepare('DELETE FROM contacts WHERE id=?').bind(id).run();
  return json({ ok: true, id, name: person.name, cleanedTodos: todos.length, cleanedTxns: txns.length });
}