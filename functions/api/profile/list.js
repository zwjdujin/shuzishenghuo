import { json } from '../../_lib.js';
import { nextBirthday, ageOf } from '../_profile.js';

const AGE_BANDS = {
  '18岁以下': (a) => a !== null && a < 18,
  '18-30岁': (a) => a >= 18 && a <= 30,
  '31-45岁': (a) => a >= 31 && a <= 45,
  '46-60岁': (a) => a >= 46 && a <= 60,
  '60岁以上': (a) => a > 60,
};

// GET /api/profile/list?q=&surname=&gender=&ageBand=&relation=&province=&city=&level=
export async function onRequestGet(context) {
  const { env, request } = context;
  try {
    return await handle(context, env, request);
  } catch (err) {
    const st = (err && err.stack) ? String(err.stack).split('\n').slice(0, 4).join(' | ') : '';
    return json({ error: '列表查询失败', detail: String(err && err.message || err), at: st }, 500);
  }
}

async function handle(context, env, request) {
  const u = new URL(request.url);
  const p = (k) => (u.searchParams.get(k) || '').trim();

  const q = p('q'), surname = p('surname'), gender = p('gender'),
    ageBand = p('ageBand'), relation = p('relation'),
    province = p('province'), city = p('city'), level = p('level');

  const where = [];
  const args = [];
  if (surname) { where.push('substr(name,1,1) = ?'); args.push(surname); }
  if (gender) { where.push('gender = ?'); args.push(gender); }
  if (relation) { where.push('relation = ?'); args.push(relation); }
  if (province) { where.push('province = ?'); args.push(province); }
  if (city) { where.push('city = ?'); args.push(city); }
  if (level) { where.push('level = ?'); args.push(level); }
  if (q) {
    where.push("(IFNULL(name,'') LIKE ? OR IFNULL(alias,'') LIKE ? OR IFNULL(note,'') LIKE ? OR IFNULL(city,'') LIKE ? OR IFNULL(province,'') LIKE ?)");
    args.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }

  // 先取基础列表（避免关联子查询在 D1 上的兼容问题），计数另行批量统计
  const baseSql = `SELECT id, name,
            IFNULL(alias,'') AS alias, IFNULL(gender,'') AS gender, IFNULL(birthday,'') AS birthday,
            IFNULL(idcard_birthday,'') AS idcard_birthday, IFNULL(province,'') AS province,
            IFNULL(city,'') AS city, IFNULL(relation,'') AS relation, IFNULL(level,'') AS level,
            IFNULL(job,'') AS job, IFNULL(note,'') AS note, IFNULL(show_lunar,0) AS show_lunar
     FROM contacts${where.length ? ' WHERE ' + where.join(' AND ') : ''}
     ORDER BY (birthday IS NULL), name`;
  // 注意：无筛选条件时不要调用 bind()（D1 对空参数列表敏感）
  const stmt = env.DB.prepare(baseSql);
  const rows = (args.length ? await stmt.bind(...args).all() : await stmt.all()).results || [];

  const ids = rows.map((r) => r.id);
  const cnt = { relatives: {}, interacts: {}, promises: {}, files: {} };
  if (ids.length && ids.every((x) => x !== undefined && x !== null)) {
    const ph = ids.map(() => '?').join(',');
    const grab = async (table, bucket, cond) => {
      const st = env.DB.prepare(
        `SELECT person_id, COUNT(*) AS c FROM ${table} WHERE person_id IN (${ph})${cond || ''} GROUP BY person_id`
      );
      const rs = (await st.bind(...ids).all()).results || [];
      rs.forEach((x) => { bucket[x.person_id] = x.c; });
    };
    await grab('contact_relatives', cnt.relatives, ' AND dead = 0');
    await grab('contact_interacts', cnt.interacts, '');
    await grab('contact_promises', cnt.promises, ' AND done = 0');
    await grab('contact_files', cnt.files, '');
  }

  let list = rows.map((r) => {
    try {
      const bd = r.birthday || r.idcard_birthday || '';
      const a = ageOf(bd);
      return {
        id: r.id, name: r.name, alias: r.alias, gender: r.gender,
        birthday: bd, age: a, province: r.province, city: r.city,
        relation: r.relation, level: r.level, job: r.job, note: r.note,
        showLunar: !!r.show_lunar,
        nextBirthday: nextBirthday(bd),
        counts: {
          relatives: cnt.relatives[r.id] || 0,
          interacts: cnt.interacts[r.id] || 0,
          promises: cnt.promises[r.id] || 0,
          files: cnt.files[r.id] || 0,
        },
      };
    } catch (e) {
      return { id: r.id, name: r.name, alias: '', gender: '', birthday: '', age: null,
        province: '', city: '', relation: '', level: '', job: '', note: '',
        showLunar: false, nextBirthday: null, counts: { relatives: 0, interacts: 0, promises: 0, files: 0 } };
    }
  });

  if (ageBand && AGE_BANDS[ageBand]) list = list.filter((x) => AGE_BANDS[ageBand](x.age));

  // 筛选项（从现有数据动态提取，避免写死）
  const all = (await env.DB.prepare('SELECT name, province, city, relation, gender, level FROM contacts').all()).results || [];
  const uniq = (k) => [...new Set(all.map((x) => x[k]).filter(Boolean))];
  const surNames = [...new Set(all.map((x) => (x.name ? String(x.name)[0] : '')).filter(Boolean))].sort();

  return json({
    list, total: list.length,
    options: {
      surnames: surNames,
      genders: uniq('gender'), relations: uniq('relation'),
      provinces: uniq('province'), cities: uniq('city'), levels: uniq('level'),
      ageBands: Object.keys(AGE_BANDS),
    },
  });
}