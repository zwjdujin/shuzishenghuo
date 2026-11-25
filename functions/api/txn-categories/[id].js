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

// ===== v0.5.56（审计 P1-3）：分类在流水 / 预算 / 周期账单里都是按「名称」引用（无外键），
// 所以改名必须在同一事务里联动引用方——此前只改分类行自身：把「餐饮」改成「吃饭」后，
// 历史流水仍叫「餐饮」（报表口径分裂），「餐饮」的月度预算 used 恒为 0（预算静默失效），
// 再删「吃饭」就留下一批没有分类行的孤儿流水。对照：账户的重命名一直是联动的（txn-accounts/[id].js）。
// 带上 flow 条件：支出与收入可以有同名分类，只联动同一 flow 的引用。长期方案是改为按 id 引用。

// 取分类行（含父分类名；二级分类的流水定位需要「父分类名 + 二级名」）
const rowOf = (env, id) => env.DB.prepare(
  'SELECT c.id, c.flow, c.name, c.parent_id, p.name AS parent_name FROM txn_categories c' +
  ' LEFT JOIN txn_categories p ON p.id = c.parent_id WHERE c.id = ?'
).bind(id).first();

// 重命名联动：返回需要与主 UPDATE 同批（同事务）执行的语句
function renameLinks(env, row, oldName, newName) {
  const flow = row.flow;
  if (row.parent_id) {
    const parent = row.parent_name || '';
    return [
      env.DB.prepare('UPDATE transactions SET sub_category = ? WHERE category = ? AND sub_category = ? AND flow = ?')
        .bind(newName, parent, oldName, flow),
      env.DB.prepare('UPDATE recurring SET sub_category = ? WHERE category = ? AND sub_category = ? AND flow = ?')
        .bind(newName, parent, oldName, flow),
    ];
  }
  const stmts = [
    env.DB.prepare('UPDATE transactions SET category = ? WHERE category = ? AND flow = ?').bind(newName, oldName, flow),
    env.DB.prepare('UPDATE recurring SET category = ? WHERE category = ? AND flow = ?').bind(newName, oldName, flow),
  ];
  if (flow === 'expense') {
    // 预算表只有「分类名 + 月份」（UNIQUE(category, month)，没有 flow 列，语义上只针对支出）。
    // 先让掉与新名同月的旧预算行，否则 UNIQUE 冲突会让整批事务失败。
    stmts.push(env.DB.prepare('DELETE FROM budgets WHERE category = ? AND month IN (SELECT month FROM budgets WHERE category = ?)')
      .bind(newName, oldName));
    stmts.push(env.DB.prepare('UPDATE budgets SET category = ? WHERE category = ?').bind(newName, oldName));
  }
  return stmts;
}

// PUT —— 局部更新：可传 name（重命名）和/或 hidden（是否在「记一笔」前端显示）
async function rename(env, id, request) {
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const hasName = body.name !== undefined;
  const hasHidden = body.hidden !== undefined;
  if (!hasName && !hasHidden) return json({ error: '没有要更新的字段' }, 400);

  const row = await rowOf(env, id);
  if (!row) return json({ error: '分类不存在' }, 404);

  const sets = [];
  const vals = [];
  const links = [];
  if (hasName) {
    const name = String(body.name || '').replace(/[,，]/g, '').trim().slice(0, 10);
    if (!name) return json({ error: '请填写分类名称' }, 400);
    const dup = await env.DB.prepare(
      'SELECT id FROM txn_categories WHERE flow = ? AND name = ? AND parent_id IS ? AND id <> ?'
    ).bind(row.flow, name, row.parent_id, id).first();
    if (dup) return json({ error: '同级已有同名分类' }, 400);
    sets.push('name = ?');
    vals.push(name);
    if (name !== row.name) links.push(...renameLinks(env, row, row.name, name));
  }
  if (hasHidden) {
    sets.push('hidden = ?');
    vals.push(body.hidden ? 1 : 0);
  }
  vals.push(id);
  const main = env.DB.prepare(`UPDATE txn_categories SET ${sets.join(', ')} WHERE id = ?`).bind(...vals);
  if (links.length) await env.DB.batch([main, ...links]);
  else await main.run();
  return json({ ok: true });
}

// DELETE —— 删除分类；一级分类连同其二级一起删，
// 使用该分类的历史流水归并到「其他」（二级分类则直接清空 sub_category）
async function remove(env, id) {
  const row = await rowOf(env, id);
  if (!row) return json({ error: '分类不存在' }, 404);

  if (row.parent_id) {
    // 二级分类删除：清掉对应流水的二级标记即可（一级分类名不变）
    // v0.5.56（审计 P2-18）：此前 WHERE category=? AND sub_category=? 的两个占位符绑的都是
    // 二级名（.bind(row.name, row.name)），父分类名从未绑定上，历史流水的二级标记一直没被清理。
    await env.DB.batch([
      env.DB.prepare('UPDATE transactions SET sub_category = NULL WHERE category = ? AND sub_category = ? AND flow = ?')
        .bind(row.parent_name || '', row.name, row.flow),
      env.DB.prepare('UPDATE recurring SET sub_category = NULL WHERE category = ? AND sub_category = ? AND flow = ?')
        .bind(row.parent_name || '', row.name, row.flow),
      env.DB.prepare('DELETE FROM txn_categories WHERE id = ?').bind(id),
    ]);
    return json({ ok: true });
  }

  // 一级分类删除：该分类全部流水归并到「其他」，再连同二级一起删
  // 「其他」本身可能已被用户删掉——那时退到同 flow 排位最前的其他一级分类，避免制造孤儿引用
  let fallback = '其他';
  const hasOther = await env.DB.prepare(
    'SELECT 1 AS x FROM txn_categories WHERE flow = ? AND parent_id IS NULL AND name = ? AND id <> ?'
  ).bind(row.flow, fallback, id).first();
  if (!hasOther) {
    const alt = await env.DB.prepare(
      'SELECT name FROM txn_categories WHERE flow = ? AND parent_id IS NULL AND id <> ? ORDER BY sort_order, id LIMIT 1'
    ).bind(row.flow, id).first();
    if (alt) fallback = alt.name;
  }
  await env.DB.batch([
    env.DB.prepare('UPDATE transactions SET category = ?, sub_category = NULL WHERE category = ? AND flow = ?')
      .bind(fallback, row.name, row.flow),
    // v0.5.56：周期账单同步改挂到归并分类，否则之后自动入账会继续生成已删除分类的流水
    env.DB.prepare('UPDATE recurring SET category = ?, sub_category = NULL WHERE category = ? AND flow = ?')
      .bind(fallback, row.name, row.flow),
    // v0.5.56：该分类的预算一并清掉（分类已不存在；避免日后新建同名分类时旧预算「复活」）
    ...(row.flow === 'expense'
      ? [env.DB.prepare('DELETE FROM budgets WHERE category = ?').bind(row.name)]
      : []),
    env.DB.prepare('DELETE FROM txn_categories WHERE id = ? OR parent_id = ?').bind(id, id),
  ]);
  return json({ ok: true, merged_to: fallback });
}
