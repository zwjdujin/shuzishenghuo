import { json } from '../../_lib.js';

// /api/txn-categories/:id —— 重命名（PUT）与删除（DELETE）
// 必须导出 onRequest 并用 pathname 解析 id（Pages Functions 的 [id].js 取不到 context.params.id）
export async function onRequest(context) {
  const method = (context.request && context.request.method) || 'GET';
  const url = new URL(context.request.url);
  const m = url.pathname.match(/\/txn-categories\/(\d+)/);
  const id = Number(m ? m[1] : url.searchParams.get('id'));
  if (!id) return json({ error: '缺少分类 ID' }, 400);

  if (method === 'PUT') return rename(context.env, id, context.request);
  if (method === 'DELETE') return remove(context.env, id);
  return json({ error: '不支持的请求方法' }, 405);
}

// PUT —— 局部更新：可传 name（重命名）和/或 hidden（是否在「记一笔」前端显示）
async function rename(env, id, request) {
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const hasName = body.name !== undefined;
  const hasHidden = body.hidden !== undefined;
  if (!hasName && !hasHidden) return json({ error: '没有要更新的字段' }, 400);

  const row = await env.DB.prepare(
    'SELECT id, flow, parent_id FROM txn_categories WHERE id = ?'
  ).bind(id).first();
  if (!row) return json({ error: '分类不存在' }, 404);

  const sets = [];
  const vals = [];
  if (hasName) {
    const name = String(body.name || '').replace(/[,，]/g, '').trim().slice(0, 10);
    if (!name) return json({ error: '请填写分类名称' }, 400);
    const dup = await env.DB.prepare(
      'SELECT id FROM txn_categories WHERE flow = ? AND name = ? AND parent_id IS ? AND id <> ?'
    ).bind(row.flow, name, row.parent_id, id).first();
    if (dup) return json({ error: '同级已有同名分类' }, 400);
    sets.push('name = ?');
    vals.push(name);
  }
  if (hasHidden) {
    sets.push('hidden = ?');
    vals.push(body.hidden ? 1 : 0);
  }
  vals.push(id);
  await env.DB.prepare(`UPDATE txn_categories SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
  return json({ ok: true });
}

// DELETE —— 删除分类；一级分类连同其二级一起删，
// 使用该分类的历史流水归并到「其他」（二级分类则直接清空 sub_category）
async function remove(env, id) {
  const row = await env.DB.prepare(
    'SELECT id, flow, name, parent_id FROM txn_categories WHERE id = ?'
  ).bind(id).first();
  if (!row) return json({ error: '分类不存在' }, 404);

  const fallback = '其他';
  if (row.parent_id) {
    // 二级分类删除：清掉对应流水的二级标记即可（一级分类名不变）
    await env.DB.batch([
      env.DB.prepare('UPDATE transactions SET sub_category = NULL WHERE category = ? AND sub_category = ?')
        .bind(row.name, row.name),
      env.DB.prepare('DELETE FROM txn_categories WHERE id = ?').bind(id),
    ]);
    return json({ ok: true });
  }

  // 一级分类删除：该分类全部流水归并到「其他」，再连同二级一起删
  await env.DB.batch([
    env.DB.prepare('UPDATE transactions SET category = ?, sub_category = NULL WHERE category = ?')
      .bind(fallback, row.name),
    env.DB.prepare('DELETE FROM txn_categories WHERE id = ? OR parent_id = ?').bind(id, id),
  ]);
  return json({ ok: true });
}
