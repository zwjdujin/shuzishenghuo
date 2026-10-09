import { json, todayStr } from '../../_lib.js';

// ===== 互动时间轴（弹窗追加） =====

// POST /api/profile/interacts {person_id, date, kind, place, who, topic, quality, summary}
export async function onRequestPost(context) {
  const { env, request } = context;
  let b = {};
  try { b = await request.json(); } catch (_) {}
  const personId = Number(b.person_id);
  if (!personId) return json({ error: '缺少 person_id' }, 400);
  const date = String(b.date || '').trim() || todayStr();
  const summary = String(b.summary || '').trim();
  if (!summary) return json({ error: '请填写谈话摘要' }, 400);

  const res = await env.DB.prepare(
    'INSERT INTO contact_interacts(person_id,date,kind,place,who,topic,quality,summary) VALUES (?,?,?,?,?,?,?,?)'
  ).bind(personId, date, b.kind || null, b.place || null, b.who || null, b.topic || null, b.quality || null, summary).run();

  const id = res.meta && res.meta.last_row_id;
  // 有提醒时间且勾选邮件/日历提醒 → 同步到日历（今天之后的日期）
  if (b.remind && date >= todayStr()) {
    await env.DB.prepare(
      `INSERT INTO events(title,start,"end",all_day,calendar,color,location,note) VALUES (?,?,?,1,'家庭',NULL,'与人际互动','来自人物档案的互动提醒')`
    ).bind(`${b.kind || '互动'} · ${b.who || '某人'}`, `${date} 09:00:00`, `${date} 09:30:00`).run();
  }
  return json({ ok: true, id }, 201);
}

// DELETE /api/profile/interacts?id=5
export async function onRequestDelete(context) {
  const { env, request } = context;
  const u = new URL(request.url);
  const id = Number(u.searchParams.get('id'));
  if (!id) return json({ error: '缺少 id' }, 400);
  await env.DB.prepare('DELETE FROM contact_interacts WHERE id=?').bind(id).run();
  return json({ ok: true, id });
}