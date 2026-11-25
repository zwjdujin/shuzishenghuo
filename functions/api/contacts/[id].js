import { json } from '../../_lib.js';
import { deleteContactCascade } from '../_profile.js';

// DELETE /api/contacts/:id —— 删除联系人（级联清理档案数据，与 /api/profile/delete 同一逻辑）
// v0.5.56 安全修复：方法分派——只有 DELETE 才删除，其余方法 405。
// 此前 GET /api/contacts/3 也会级联删联系人 + 8 张子表 + R2 附件，且无回收站。
export async function onRequest(context) {
  const { env, request } = context;
  if ((request.method || 'GET') !== 'DELETE') return json({ error: '不支持的请求方法' }, 405);
  const url = new URL(request.url);
  const m = url.pathname.match(/\/contacts\/(\d+)/);
  const id = Number(m ? m[1] : url.searchParams.get('id'));
  if (!id) return json({ error: '缺少联系人 ID' }, 400);
  const person = await deleteContactCascade(env, id);
  if (!person) return json({ error: '联系人不存在' }, 404);
  return json({ ok: true, id, name: person.name });
}
