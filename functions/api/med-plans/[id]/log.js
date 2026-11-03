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

  // v0.5.46：只在本日首次记录 taken 时扣库存。此前 ON CONFLICT 更新路径也无条件扣一次，
  // 重复点击 / 改判状态都会重复扣减（skipped→taken 不补扣，taken→skipped 不回补，按当日实际服药一次计）。
  const existing = await env.DB.prepare(
    'SELECT id, status FROM med_logs WHERE plan_id=? AND log_date=?'
  ).bind(id, today).first();

  const stmts = [];
  if (existing) {
    if (existing.status === status) return json({ ok: true, status, firstTaken: false, repeated: true });
    stmts.push(env.DB.prepare('UPDATE med_logs SET status=? WHERE id=?').bind(status, existing.id));
  } else {
    stmts.push(env.DB.prepare('INSERT INTO med_logs(plan_id, log_date, status) VALUES (?,?,?)').bind(id, today, status));
    if (status === 'taken') {
      stmts.push(env.DB.prepare(
        'UPDATE medicines SET stock = MAX(0, COALESCE(stock,0) - 1) WHERE id = ?'
      ).bind(plan.medicine_id));
    }
  }
  await env.DB.batch(stmts);
  return json({ ok: true, status, firstTaken: !existing && status === 'taken' });
}
