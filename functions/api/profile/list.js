import { json } from '../../_lib.js';
import { nextBirthdayOf, ageOfContact } from '../_profile.js';

// GET /api/profile/list?q=&gender=&group=&tag=
// v0.4.0 人际关系列表：姓名（A-Z 拼音分组由前端排）、性别、电话；筛选 性别/群组/标签
export async function onRequestGet(context) {
  const { env, request } = context;
  try {
    return await handle(env, request);
  } catch (err) {
    return json({ error: '列表查询失败', detail: String((err && err.message) || err) }, 500);
  }
}

async function handle(env, request) {
  const u = new URL(request.url);
  const p = (k) => (u.searchParams.get(k) || '').trim();
  const q = p('q'), gender = p('gender'), group = p('group'), tag = p('tag');

  const where = ['1=1'];
  const args = [];
  if (gender) { where.push('gender = ?'); args.push(gender); }
  // CSV 集合匹配：把两端补上逗号后做包含匹配，避免「同事」误命中「老同事」
  if (group) { where.push("(',' || peer_groups || ',') LIKE ?"); args.push(`%,${group},%`); }
  if (tag) { where.push("(',' || tags || ',') LIKE ?"); args.push(`%,${tag},%`); }
  if (q) {
    where.push("(IFNULL(name,'') LIKE ? OR IFNULL(first_name,'') LIKE ? OR IFNULL(nickname,'') LIKE ?" +
      " OR IFNULL(childhood_name,'') LIKE ? OR IFNULL(former_name,'') LIKE ?" +
      " OR IFNULL(english_name,'') LIKE ? OR IFNULL(alias,'') LIKE ?" +
      " OR IFNULL(phone,'') LIKE ? OR IFNULL(note,'') LIKE ?)");
    for (let i = 0; i < 9; i++) args.push(`%${q}%`);
  }

  const sql = `SELECT id, name, first_name, nickname, childhood_name, former_name, english_name, alias,
      gender, birthday_type, birthday_calendar, birth_year, birth_month, birth_day,
      birthday_remind, is_deceased, tags, peer_groups, referrer_id, marriage, phone, note,
      touch_cadence, last_touched
    FROM contacts WHERE ${where.join(' AND ')} ORDER BY name`;
  const stmt = env.DB.prepare(sql);
  const rows = (args.length ? await stmt.bind(...args).all() : await stmt.all()).results || [];

  const list = rows.map((r) => ({
    id: r.id,
    name: r.name,
    firstName: r.first_name || '',
    nickname: r.nickname || '',
    englishName: r.english_name || '',
    alias: r.alias || '',
    gender: r.gender || '',
    phone: r.phone || '',
    tags: String(r.tags || '').split(',').map((x) => x.trim()).filter(Boolean),
    groups: String(r.peer_groups || '').split(',').map((x) => x.trim()).filter(Boolean),
    isDeceased: !!r.is_deceased,
    birthdayRemind: !!r.birthday_remind,
    hasBirthday: !!r.birthday_type,
    nextBirthday: r.is_deceased ? null : nextBirthdayOf(r),
    age: ageOfContact(r),
    marriage: r.marriage || '',
    // v0.5.17 保持联系：节奏与最后联系时间随列表下发，行内直接操作
    touchCadence: r.touch_cadence || 0,
    lastTouched: r.last_touched || '',
  }));

  // 筛选项：性别固定三项；群组/标签从词库 + 实际数据合并
  const dict = async (kind) => ((await env.DB.prepare('SELECT word FROM vocab WHERE kind=? ORDER BY hits DESC, word').bind(kind).all()).results || []).map((x) => x.word);
  const [groupDict, tagDict] = await Promise.all([dict('rel_group'), dict('rel_tag')]);
  const inData = (k) => [...new Set(rows.map((r) => String(r[k] || '').split(',').map((x) => x.trim()).filter(Boolean)).flat())];
  const groups = [...new Set([...groupDict, ...inData('peer_groups')])];
  const tags = [...new Set([...tagDict, ...inData('tags')])];

  return json({
    list,
    total: list.length,
    options: {
      genders: ['男', '女', '其他'],
      groups, tags,
      marriages: ['已婚', '未婚', '离婚', '丧偶'],
    },
  });
}
