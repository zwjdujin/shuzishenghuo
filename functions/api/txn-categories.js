import { json } from '../_lib.js';

// 账本自定义分类（v0.5.0）—— 两级分类：parent_id 为空是一级，否则挂在某一级之下
// 与 transactions.js 的 DEFAULT_CATEGORIES 保持一致（表为空时回退默认值）

export async function onRequestGet(context) {
  const { env } = context;
  const tree = await loadCatTree(env);
  return json(tree);
}

// POST /api/txn-categories —— 新增分类 { flow, name, parent_id? }
export async function onRequestPost(context) {
  const { env, request } = context;
  let body = {};
  try { body = await request.json(); } catch (_) {}

  const flow = body.flow === 'income' ? 'income' : 'expense';
  const name = String(body.name || '').replace(/[,，]/g, '').trim().slice(0, 10);
  if (!name) return json({ error: '请填写分类名称' }, 400);
  const parentId = body.parent_id ? Number(body.parent_id) : null;

  // 二级分类必须挂在有效父级下，且父级属于同一 flow
  if (parentId) {
    const parent = await env.DB.prepare(
      'SELECT id FROM txn_categories WHERE id = ? AND parent_id IS NULL AND flow = ?'
    ).bind(parentId, flow).first();
    if (!parent) return json({ error: '父分类不存在' }, 400);
  }

  // 同级不允许重名
  const dup = await env.DB.prepare(
    'SELECT id FROM txn_categories WHERE flow = ? AND name = ? AND (parent_id IS ? )'
  ).bind(flow, name, parentId).first();
  if (dup) return json({ error: '同级已有同名分类' }, 400);

  const maxRow = await env.DB.prepare(
    'SELECT COALESCE(MAX(sort_order), -1) m FROM txn_categories WHERE flow = ? AND parent_id IS ?'
  ).bind(flow, parentId).first();
  const sort = (maxRow ? Number(maxRow.m) : -1) + 1;

  const res = await env.DB.prepare(
    'INSERT INTO txn_categories(flow, name, parent_id, sort_order) VALUES (?,?,?,?)'
  ).bind(flow, name, parentId, sort).run();
  const id = res.meta && res.meta.last_row_id ? res.meta.last_row_id : null;
  return json({ ok: true, id }, 201);
}

// PUT /api/txn-categories —— 批量排序 { flow, parent_id, ids: [id,...] }（按数组顺序写 sort_order）
export async function onRequestPut(context) {
  const { env, request } = context;
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter((n) => Number.isFinite(n)) : [];
  if (!ids.length) return json({ error: '缺少排序数据' }, 400);
  const parentId = body.parent_id ? Number(body.parent_id) : null;

  const stmt = env.DB.prepare('UPDATE txn_categories SET sort_order = ? WHERE id = ? AND parent_id IS ?');
  await env.DB.batch(ids.map((id, i) => stmt.bind(i, id, parentId)));
  return json({ ok: true });
}

/** 读取分类树 { expense: [{id,name,children:[{id,name}]}], income: [...] }；表为空回退默认分类 */
export async function loadCatTree(env) {
  try {
    const rows = (
      await env.DB.prepare(
        'SELECT id, flow, name, parent_id FROM txn_categories ORDER BY sort_order, id'
      ).all()
    ).results || [];
    if (!rows.length) return defaultTree();
    const top = { expense: [], income: [] };
    const kids = {};
    rows.forEach((r) => {
      if (r.parent_id) {
        (kids[r.parent_id] = kids[r.parent_id] || []).push({ id: r.id, name: r.name });
      } else if (top[r.flow]) {
        top[r.flow].push({ id: r.id, name: r.name, children: [] });
      }
    });
    ['expense', 'income'].forEach((f) =>
      top[f].forEach((c) => { c.children = kids[c.id] || []; })
    );
    return top;
  } catch (_) {
    return defaultTree();
  }
}

function defaultTree() {
  const wrap = (names) => names.map((n) => ({ name: n, children: [] }));
  return {
    expense: wrap(['餐饮', '零食', '美妆', '烟酒', '日常', '购物', '交通', '娱乐', '社交', '装修', '旅游', '医疗', '学习', '其他']),
    income: wrap(['礼金', '理财', '报销', '工资', '奖金', '生活费', '外快兼职', '退款', '投资收益', '其他']),
  };
}
