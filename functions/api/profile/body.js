import { json } from '../../_lib.js';

// ===== v0.6.0 个人信息：身高/体重记录（时间序列）+ 尺码（单值） =====
// GET  /api/profile/body?id=1        → {records:[{id,kind,value,date}], sizes}
// POST /api/profile/body             → {person_id, kind:'height'|'weight', value, date?} 同日重录覆盖
// PUT  /api/profile/body             → {id, sizes:{clothing,shoe,ring,bracelet}}（空串=清除）
// DELETE /api/profile/body?rid=5     → 删除一条记录
const cleanDate = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? String(s) : '');

export async function onRequestGet(context) {
  const { env, request } = context;
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!id) return json({ error: '缺少联系人 id' }, 400);
  const c = await env.DB.prepare('SELECT size_clothing, size_shoe, size_ring, size_bracelet FROM contacts WHERE id=?').bind(id).first();
  if (!c) return json({ error: '联系人不存在' }, 404);
  const rows = (await env.DB.prepare(
    'SELECT id, kind, value, record_date FROM body_records WHERE contact_id=? ORDER BY record_date, id'
  ).bind(id).all()).results || [];
  return json({
    records: rows.map((r) => ({ id: r.id, kind: r.kind, value: Number(r.value), date: r.record_date })),
    sizes: {
      clothing: c.size_clothing || '', shoe: c.size_shoe || '',
      ring: c.size_ring || '', bracelet: c.size_bracelet || '',
    },
  });
}

export async function onRequestPost(context) {
  const { env, request } = context;
  let b = {};
  try { b = await request.json(); } catch (_) { return json({ error: '请求格式不正确' }, 400); }
  const personId = Number(b.person_id);
  const kind = String(b.kind || '');
  const value = Number(b.value);
  if (!personId || !['height', 'weight'].includes(kind)) return json({ error: '参数错误' }, 400);
  if (!Number.isFinite(value) || value <= 0) return json({ error: kind === 'height' ? '请输入身高（cm）' : '请输入体重（kg）' }, 400);
  // 身高 30~260cm / 体重 1~500kg，明显手滑直接拦
  if (kind === 'height' && (value < 30 || value > 260)) return json({ error: '身高应在 30-260 cm 之间' }, 400);
  if (kind === 'weight' && (value < 1 || value > 500)) return json({ error: '体重应在 1-500 kg 之间' }, 400);
  if (!(await env.DB.prepare('SELECT id FROM contacts WHERE id=?').bind(personId).first())) {
    return json({ error: '联系人不存在' }, 404);
  }
  const date = cleanDate(b.date) || new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  // 同一天同一指标重录 → 覆盖（UNIQUE(contact_id,kind,record_date)）
  await env.DB.prepare(
    `INSERT INTO body_records(contact_id, kind, value, record_date) VALUES (?,?,?,?)
     ON CONFLICT(contact_id, kind, record_date) DO UPDATE SET value=excluded.value`
  ).bind(personId, kind, Math.round(value * 10) / 10, date).run();
  return json({ ok: true }, 201);
}

export async function onRequestPut(context) {
  const { env, request } = context;
  let b = {};
  try { b = await request.json(); } catch (_) { return json({ error: '请求格式不正确' }, 400); }
  const id = Number(b.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  if (!b.sizes || typeof b.sizes !== 'object') return json({ error: '缺少 sizes' }, 400);
  const SZ = [['clothing', 'size_clothing'], ['shoe', 'size_shoe'], ['ring', 'size_ring'], ['bracelet', 'size_bracelet']];
  const cols = SZ.filter(([k]) => b.sizes[k] !== undefined);
  if (!cols.length) return json({ error: '没有要更新的尺码' }, 400);
  await env.DB.prepare(
    `UPDATE contacts SET ${cols.map(([, c]) => `${c}=?`).join(', ')} WHERE id=?`
  ).bind(...cols.map(([k]) => String(b.sizes[k]).trim().slice(0, 20) || null), id).run();
  return json({ ok: true });
}

export async function onRequestDelete(context) {
  const { env, request } = context;
  const rid = Number(new URL(request.url).searchParams.get('rid'));
  if (!rid) return json({ error: '缺少 rid' }, 400);
  const row = await env.DB.prepare('SELECT id FROM body_records WHERE id=?').bind(rid).first();
  if (!row) return json({ error: '记录不存在' }, 404);
  await env.DB.prepare('DELETE FROM body_records WHERE id=?').bind(rid).run();
  return json({ ok: true, id: rid });
}
