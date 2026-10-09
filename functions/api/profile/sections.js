import { json } from '../../_lib.js';
import { joinArr } from '../_profile.js';

// PUT /api/profile/sections —— 保存「一对一」模块（关系/职业/家庭/偏好/性格）
// body: { person_id, section:'rel'|'work'|'family'|'pref'|'trait', data:{...} }
const COLS = {
  rel:      { table: 'contact_rel',    fields: ['via', 'intro', 'since', 'scene', 'score'] },
  work:     { table: 'contact_work',   fields: ['dept', 'title', 'rank', 'city', 'field', 'give', 'infl', 'bound'] },
  family:   { table: 'contact_family', fields: ['father', 'mother', 'spouse', 'child', 'sibling', 'live', 'events', 'pet'] },
  pref:     { table: 'contact_pref',   fields: ['foods', 'drinks', 'size', 'shoes', 'hobbies', 'life', 'social', 'langs'], arr: ['foods', 'drinks', 'hobbies', 'langs'] },
  trait:    { table: 'contact_trait',  fields: ['tags', 'style', 'reply', 'taboo', 'value', 'comfort'], arr: ['tags'] },
};

export async function onRequestPut(context) {
  const { env, request } = context;
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const personId = Number(body.person_id);
  const sec = String(body.section || '');
  const cfg = COLS[sec];
  if (!personId || !cfg) return json({ error: '参数错误' }, 400);
  const d = body.data || {};

  const vals = cfg.fields.map((f) => {
    const raw = d[f];
    const v = cfg.arr && cfg.arr.includes(f) ? joinArr(raw) : (raw === undefined || raw === null ? '' : String(raw).trim());
    return v || null;
  });

  // UPSERT：不存在则插入，存在则更新
  const exists = await env.DB.prepare(`SELECT person_id FROM ${cfg.table} WHERE person_id = ?`).bind(personId).first();
  if (exists) {
    await env.DB.prepare(`UPDATE ${cfg.table} SET ${cfg.fields.map((f) => `${f}=?`).join(',')} WHERE person_id = ?`)
      .bind(...vals, personId).run();
  } else {
    await env.DB.prepare(`INSERT INTO ${cfg.table}(person_id, ${cfg.fields.join(',')}) VALUES (?, ${cfg.fields.map(() => '?').join(',')})`)
      .bind(personId, ...vals).run();
  }
  return json({ ok: true, section: sec, person_id: personId });
}