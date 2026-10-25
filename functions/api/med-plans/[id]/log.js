import { json, todayStr } from '../../../_lib.js';

// POST /api/med-plans/:id/log —— 今日服药确认 { status: 'taken' | 'skipped' }
// taken 时库存 -1（不低于 0）
export async function onRequestPost(context) {
  const { env, request } = context;
  const m = new URL(request.url).pathname.match(/\/med-plans\/(\d+)\/log/);
  const id = Number(m ? m[1] : 0);
  if (!id) return json({ error: '缺少计划 id' }, 400);
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const status = body.status === 'skipped' ? 'skipped' : 'taken';
  const today = todayStr();

  const plan = await env.DB.prepare('SELECT id, medicine_id FROM med_plans WHERE id=?').bind(id).first();
  if (!plan) return json({ error: '计划不存在' }, 404);

  const stmts = [
    env.DB.prepare(
      `INSERT INTO med_logs(plan_id, log_date, status) VALUES (?,?,?)
       ON CONFLICT(plan_id, log_date) DO UPDATE SET status=excluded.status`
    ).bind(id, today, status),
  ];
  if (status === 'taken') {
    stmts.push(env.DB.prepare(
      'UPDATE medicines SET stock = MAX(0, COALESCE(stock,0) - 1) WHERE id = ?'
    ).bind(plan.medicine_id));
  }
  await env.DB.batch(stmts);
  return json({ ok: true, status });
}
