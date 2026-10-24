import { json } from '../../_lib.js';
import { deleteContactCascade } from '../_profile.js';

// DELETE /api/profile/delete?id=4 —— 删除联系人（级联清理其档案数据，逻辑与 /api/contacts/:id 共用）
export async function onRequest(context) {
  const { env, request } = context;
  const u = new URL(request.url);
  const m = u.pathname.match(/\/profile\/delete\/(\d+)/);
  const id = Number(m ? m[1] : u.searchParams.get('id'));
  if (!id) return json({ error: '缺少联系人 id' }, 400);
  const person = await deleteContactCascade(env, id);
  if (!person) return json({ error: '联系人不存在' }, 404);
  return json({ ok: true, id, name: person.name });
}
