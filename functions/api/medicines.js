import { json, todayStr } from '../_lib.js';

// 家庭药箱 · 分类 / 存放位置 / 剂型 选项
export const MED_CATEGORIES = [
  '感冒发热', '肠胃消化', '外伤急救', '皮肤五官',
  '心脑血管', '维生素保健', '妇科儿科', '其他',
];
export const MED_LOCATIONS = ['客厅药箱', '卧室床头', '厨房抽屉', '冰箱冷藏', '卫生间镜柜', '玄关抽屉', '随身包'];
export const MED_FORMS = ['片剂', '胶囊', '颗粒', '散剂', '口服液', '注射液', '软膏', '贴剂', '喷雾', '外用液体', '其他'];
export const MED_FOR_WHOM = ['通用', '成人', '儿童', '老人', '孕妇', '婴幼儿'];

// 临期阈值：6 个月（按自然月加，避免 180/184 天边界差异）
export const EXPIRING_MONTHS = 6;

// 效期状态：expired 已过期 / soon 临期（6个月内）/ safe 正常
export function expiryStatus(expiry, today) {
  if (!expiry || !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return { state: 'none', days: null };
  const t = new Date(today + 'T00:00:00');
  const e = new Date(expiry + 'T00:00:00');
  const days = Math.round((e - t) / 86400000);
  if (days < 0) return { state: 'expired', days };
  // 6 个月后的同一天
  const lim = new Date(t.getFullYear(), t.getMonth() + EXPIRING_MONTHS, t.getDate());
  if (e <= lim) return { state: 'soon', days };
  return { state: 'safe', days };
}

// 剩余天数的展示文案
export function daysLabel(days) {
  if (days === null) return '未填效期';
  if (days < 0) return `已过期 ${Math.abs(days)} 天`;
  if (days === 0) return '今天到期';
  if (days < 31) return `剩 ${days} 天`;
  if (days < 365) return `剩 ${Math.floor(days / 30)} 个月`;
  return `剩 ${Math.floor(days / 365)} 年 ${Math.floor((days % 365) / 30)} 个月`;
}

function shape(r, today) {
  const st = expiryStatus(r.expiry, today);
  return {
    id: r.id,
    name: r.name || '',
    efficacy: r.efficacy || '',
    spec: r.spec || '',
    dosage: r.dosage || r.quantity || '',
    form: r.form || '',
    expiry: r.expiry || '',
    category: r.category || '其他',
    location: r.location || '客厅药箱',
    manufacturer: r.manufacturer || '',
    stock: r.stock === null || r.stock === undefined ? 1 : Number(r.stock),
    stockMin: Number(r.stock_min || 1),
    forWhom: r.for_whom || '通用',
    rx: Number(r.rx || 0),
    openDate: r.open_date || '',
    price: r.price === null || r.price === undefined ? null : Number(r.price),
    note: r.note || '',
    createdAt: r.created_at || '',
    state: st.state,
    days: st.days,
    daysText: daysLabel(st.days),
    // 库存不足提醒（库存 0 或低于下限）
    lowStock: Number(r.stock || 0) <= 0 || (Number(r.stock_min || 1) > 0 && Number(r.stock || 0) < Number(r.stock_min || 1)),
  };
}

// 解析 / 清洗入库字段
export function parseMedBody(body) {
  const name = String(body.name || '').trim();
  if (!name) return { error: '请填写药品名称' };
  const expiry = String(body.expiry || '').trim();
  if (expiry && !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return { error: '有效期格式不正确' };
  const openDate = String(body.openDate || body.open_date || '').trim();
  if (openDate && !/^\d{4}-\d{2}-\d{2}$/.test(openDate)) return { error: '开封日期格式不正确' };
  const num = (v, d) => (v === undefined || v === null || v === '' ? d : Number(v));
  const price = body.price === undefined || body.price === null || body.price === '' ? null : Number(body.price);
  return {
    data: {
      name,
      efficacy: String(body.efficacy || '').trim(),
      spec: String(body.spec || '').trim(),
      dosage: String(body.dosage || '').trim(),
      form: String(body.form || '').trim(),
      expiry: expiry || null,
      category: String(body.category || '其他').trim() || '其他',
      location: String(body.location || '客厅药箱').trim() || '客厅药箱',
      manufacturer: String(body.manufacturer || '').trim(),
      stock: num(body.stock, 1),
      stockMin: num(body.stockMin !== undefined ? body.stockMin : body.stock_min, 1),
      forWhom: String(body.forWhom || body.for_whom || '通用').trim() || '通用',
      rx: body.rx ? 1 : 0,
      openDate: openDate || null,
      price: Number.isFinite(price) ? price : null,
      note: String(body.note || '').trim(),
    },
  };
}

// GET /api/medicines —— 药品一览 + 临期一览 + 过期一览（含统计与选项）
export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const today = todayStr();
  const filter = url.searchParams.get('filter') || 'all';

  const rows = (
    await env.DB.prepare('SELECT * FROM medicines ORDER BY (expiry IS NULL), expiry ASC, id DESC').all()
  ).results || [];
  const all = rows.map((r) => shape(r, today));

  const expired = all.filter((m) => m.state === 'expired');
  const expiring = all.filter((m) => m.state === 'soon');      // 6 个月以内到期（含今天到期）
  const safe = all.filter((m) => m.state === 'safe');
  const noExpiry = all.filter((m) => m.state === 'none');
  const lowStock = all.filter((m) => m.lowStock && m.state !== 'expired');

  // 分类聚合
  const byCategory = {};
  all.forEach((m) => {
    const k = m.category || '其他';
    if (!byCategory[k]) byCategory[k] = { name: k, total: 0, soon: 0, expired: 0 };
    byCategory[k].total++;
    if (m.state === 'soon') byCategory[k].soon++;
    if (m.state === 'expired') byCategory[k].expired++;
  });
  const categories = Object.values(byCategory).sort((a, b) => b.total - a.total);

  // 位置聚合
  const byLocation = {};
  all.forEach((m) => {
    const k = m.location || '客厅药箱';
    byLocation[k] = (byLocation[k] || 0) + 1;
  });

  let list = all;
  if (filter === 'soon') list = expiring;
  else if (filter === 'expired') list = expired;

  return json({
    today,
    list,
    all,
    expiring,
    expired,
    stats: {
      total: all.length,
      soon: expiring.length,
      expired: expired.length,
      safe: safe.length,
      noExpiry: noExpiry.length,
      lowStock: lowStock.length,
      kinds: new Set(all.map((m) => m.name)).size,
    },
    categories,
    byLocation,
    options: { categories: MED_CATEGORIES, locations: MED_LOCATIONS, forms: MED_FORMS, forWhom: MED_FOR_WHOM },
    expiringMonths: EXPIRING_MONTHS,
  });
}

// POST /api/medicines —— 录入药品
export async function onRequestPost(context) {
  const { env, request } = context;
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const { data, error } = parseMedBody(body);
  if (error) return json({ error }, 400);

  const res = await env.DB.prepare(
    `INSERT INTO medicines
      (name, efficacy, spec, dosage, form, expiry, category, location, manufacturer,
       stock, stock_min, for_whom, rx, open_date, price, quantity, note)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  )
    .bind(
      data.name, data.efficacy, data.spec, data.dosage, data.form, data.expiry,
      data.category, data.location, data.manufacturer, data.stock, data.stockMin,
      data.forWhom, data.rx, data.openDate, data.price, data.dosage, data.note
    )
    .run();
  return json({ ok: true, id: res.meta && res.meta.last_row_id ? res.meta.last_row_id : null }, 201);
}

// PUT /api/medicines —— 更新药品
export async function onRequestPut(context) {
  const { env, request } = context;
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const id = Number(body.id || new URL(request.url).searchParams.get('id'));
  if (!id) return json({ error: '缺少药品 ID' }, 400);
  const { data, error } = parseMedBody(body);
  if (error) return json({ error }, 400);

  await env.DB.prepare(
    `UPDATE medicines SET
      name=?, efficacy=?, spec=?, dosage=?, form=?, expiry=?, category=?, location=?,
      manufacturer=?, stock=?, stock_min=?, for_whom=?, rx=?, open_date=?, price=?, quantity=?, note=?
     WHERE id=?`
  )
    .bind(
      data.name, data.efficacy, data.spec, data.dosage, data.form, data.expiry,
      data.category, data.location, data.manufacturer, data.stock, data.stockMin,
      data.forWhom, data.rx, data.openDate, data.price, data.dosage, data.note, id
    )
    .run();
  return json({ ok: true, id });
}

// DELETE /api/medicines/:id —— 删除药品（ID 从路径解析，兼容 ?id=）
export async function onRequestDelete(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const m = url.pathname.match(/\/medicines\/(\d+)/);
  const id = Number(m ? m[1] : url.searchParams.get('id'));
  if (!id) return json({ error: '缺少药品 ID' }, 400);
  await env.DB.prepare('DELETE FROM medicines WHERE id = ?').bind(id).run();
  return json({ ok: true, id });
}
