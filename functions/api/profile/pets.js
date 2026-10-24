import { json } from '../../_lib.js';

// ===== 宠物（种类必填，输入一次即入词库 pet_species 作备选；名字必填；可记纪念日） =====
const clean = (s, max) => String(s || '').trim().slice(0, 30);

// POST /api/profile/pets {person_id, species, name, memorial_date}
export async function onRequestPost(context) {
  const { env, request } = context;
  let b = {};
  try { b = await request.json(); } catch (_) {}
  const personId = Number(b.person_id);
  const species = clean(b.species, 20);
  const name = clean(b.name, 20);
  if (!personId) return json({ error: '缺少 person_id' }, 400);
  if (!species) return json({ error: '请填写宠物种类' }, 400);
  if (!name) return json({ error: '请填写宠物名字' }, 400);
  if (!(await env.DB.prepare('SELECT id FROM contacts WHERE id=?').bind(personId).first())) {
    return json({ error: '联系人不存在' }, 404);
  }
  await env.DB.prepare('INSERT INTO vocab(kind, word) VALUES (?, ?) ON CONFLICT(kind, word) DO UPDATE SET hits = hits + 1')
    .bind('pet_species', species).run();
  const res = await env.DB.prepare(
    'INSERT INTO rel_pets(person_id, species, name, memorial_date) VALUES (?,?,?,?)'
  ).bind(personId, species, name, clean(b.memorial_date, 10) || null).run();
  return json({ ok: true, id: res.meta && res.meta.last_row_id }, 201);
}

// PUT /api/profile/pets {id, species, name, memorial_date}
export async function onRequestPut(context) {
  const { env, request } = context;
  let b = {};
  try { b = await request.json(); } catch (_) {}
  const id = Number(b.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  const species = clean(b.species, 20);
  const name = clean(b.name, 20);
  if (!species) return json({ error: '请填写宠物种类' }, 400);
  if (!name) return json({ error: '请填写宠物名字' }, 400);
  await env.DB.prepare('INSERT INTO vocab(kind, word) VALUES (?, ?) ON CONFLICT(kind, word) DO UPDATE SET hits = hits + 1')
    .bind('pet_species', species).run();
  await env.DB.prepare('UPDATE rel_pets SET species=?, name=?, memorial_date=? WHERE id=?')
    .bind(species, name, clean(b.memorial_date, 10) || null, id).run();
  return json({ ok: true, id });
}

// DELETE /api/profile/pets?id=3
export async function onRequestDelete(context) {
  const { env, request } = context;
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!id) return json({ error: '缺少 id' }, 400);
  await env.DB.prepare('DELETE FROM rel_pets WHERE id=?').bind(id).run();
  return json({ ok: true, id });
}
