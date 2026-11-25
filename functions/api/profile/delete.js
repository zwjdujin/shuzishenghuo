import { json } from '../../_lib.js';
import { deleteContactCascade } from '../_profile.js';

// DELETE /api/profile/delete?id=4 —— 删除联系人（级联清理其档案数据，逻辑与 /api/contacts/:id 共用）
// v0.5.56 安全修复：方法分派——只有 DELETE 才删除，其余方法 405（防跨站 GET 触发删除）
export async function onRequest(context) {
  const { env, request } = context;
  if ((request.method || 'GET') !== 'DELETE') return json({ error: '不支持的请求方法' }, 405);
  const u = new URL(request.url);
  const m = u.pathname.match(/\/profile\/delete\/(\d+)/);
  const id = Number(m ? m[1] : u.searchParams.get('id'));
  if (!id) return json({ error: '缺少联系人 id' }, 400);
  const person = await deleteContactCascade(env, id);
  if (!person) return json({ error: '联系人不存在' }, 404);
  return json({ ok: true, id, name: person.name });
}
