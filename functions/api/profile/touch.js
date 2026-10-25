import { json, todayStr } from '../../_lib.js';

// GET /api/profile/touch?id=123 —— 单人节奏；不带 id —— 超期名单
export async function onRequestGet(context) {
  const { env, request } = context;
  const u = new URL(request.url);
  const oneId = Number(u.searchParams.get('id')) || 0;
  if (oneId) {
    const row = await env.DB.prepare(
      'SELECT id, name, touch_cadence cadence, last_touched FROM contacts WHERE id = ?'
    ).bind(oneId).first();
    if (!row) return json({ error: '联系人不存在' }, 404);
    return json({ id: row.id, name: row.name, cadence: row.cadence || 0, lastTouched: row.last_touched || '' });
  }
  const rows = (await env.DB.prepare(
    `SELECT id, name, touch_cadence cadence, last_touched
     FROM contacts WHERE touch_cadence > 0 AND is_deceased = 0
     ORDER BY name`
  ).all().catch(() => ({ results: [] }))).results || [];
  const today = todayStr();
  const list = rows
    .map((r) => {
      const last = r.last_touched || '';
      // 距上次联系天数：无记录按 365 天（视为久未联系）
      const days = last
        ? Math.round((Date.parse(today) - Date.parse(last)) / 86400000)
        : 365;
      return { id: r.id, name: r.name, cadence: r.cadence, lastTouched: last || '', days, overdue: days >= r.cadence };
    })
    .filter((r) => r.overdue)
    .sort((a, b) => (b.days - b.cadence) - (a.days - a.cadence));
  return json({ today, list });
}

// POST /api/profile/touch —— { id, cadence?, touched? }
// cadence：设置节奏天数（0 关闭）；touched:true 记「今天联系过」
export async function onRequestPost(context) {
  const { env, request } = context;
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const id = Number(body.id);
  if (!id) return json({ error: '缺少联系人 id' }, 400);
  if (body.cadence !== undefined) {
    const c = Math.max(0, Math.min(365, Number(body.cadence) || 0));
    await env.DB.prepare('UPDATE contacts SET touch_cadence=? WHERE id=?').bind(c, id).run();
  }
  if (body.touched) {
    await env.DB.prepare('UPDATE contacts SET last_touched=? WHERE id=?').bind(todayStr(), id).run();
  }
  return json({ ok: true });
}
