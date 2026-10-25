import { json, todayStr } from '../_lib.js';

// GET /api/med-plans —— 全部服药计划 + 今日执行状态（药箱页「今日服药」卡片用）
export async function onRequestGet(context) {
  const { env } = context;
  const today = todayStr();
  // 今天周几：1=周一…7=周日（与 days 字段口径一致，按北京时间）
  const dow = String(((new Date(today + 'T00:00:00+08:00').getUTCDay() + 6) % 7) + 1);

  const rows = (await env.DB.prepare(
    `SELECT p.id, p.medicine_id, p.dose, p.time_of_day, p.days, p.active,
            m.name medicine, m.stock, m.stock_min
     FROM med_plans p JOIN medicines m ON m.id = p.medicine_id
     ORDER BY p.time_of_day`
  ).all().catch(() => ({ results: [] }))).results || [];

  const logs = (await env.DB.prepare(
    'SELECT plan_id, status FROM med_logs WHERE log_date = ?'
  ).bind(today).all().catch(() => ({ results: [] }))).results || [];
  const logMap = {};
  logs.forEach((l) => (logMap[l.plan_id] = l.status));

  const list = rows.map((r) => ({
    id: r.id,
    medicineId: r.medicine_id,
    medicine: r.medicine,
    dose: r.dose || '',
    time: r.time_of_day,
    days: String(r.days || '').split(',').filter(Boolean),
    active: !!r.active,
    stock: r.stock,
    stockMin: r.stock_min,
    today: {
      due: !!r.active && String(r.days || '1,2,3,4,5,6,7').split(',').includes(dow),
      status: logMap[r.id] || '',   // '' 未处理 | taken | skipped
    },
  }));
  return json({ today, dow, list });
}

// POST /api/med-plans —— 新建计划 { medicineId, dose, time, days }
export async function onRequestPost(context) {
  const { env, request } = context;
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const medicineId = Number(body.medicineId);
  const time = String(body.time || '').trim();
  if (!medicineId) return json({ error: '缺少药品' }, 400);
  if (!/^\d{1,2}:\d{2}$/.test(time)) return json({ error: '时间格式应为 HH:MM' }, 400);
  let days = Array.isArray(body.days) ? body.days.map(Number).filter((d) => d >= 1 && d <= 7) : [];
  if (!days.length) days = [1, 2, 3, 4, 5, 6, 7];
  days = [...new Set(days)].sort().join(',');
  const res = await env.DB.prepare(
    'INSERT INTO med_plans(medicine_id, dose, time_of_day, days) VALUES (?,?,?,?)'
  ).bind(medicineId, String(body.dose || '').slice(0, 30), time, days).run();
  return json({ ok: true, id: res.meta ? res.meta.last_row_id : null }, 201);
}
