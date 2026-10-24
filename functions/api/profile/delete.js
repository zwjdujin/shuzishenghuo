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

  // 清理他人指向此人的引用（引荐人 / 家庭关系跳转）
  await env.DB.prepare('UPDATE contacts SET referrer_id=NULL WHERE referrer_id=?').bind(id).run();
  await env.DB.prepare('UPDATE contact_relatives SET ref_id=NULL WHERE ref_id=?').bind(id).run();

  // 级联删除该人物的档案数据
  const tables = ['contact_contacts', 'contact_edu', 'contact_work', 'contact_relatives', 'rel_pets'];
  for (const t of tables) {
    await env.DB.prepare(`DELETE FROM ${t} WHERE person_id=?`).bind(id).run();
  }

  await env.DB.prepare('DELETE FROM contacts WHERE id=?').bind(id).run();
  return json({ ok: true, id, name: person.name });
}
