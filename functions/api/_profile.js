// 数字生活 · 人物档案公共帮助（v0.4.0 人际关系新数据模型）

// 北京时区（Workers 运行时是 UTC，统一 +8h 后用 UTC 取值器读「北京墙钟」）
const TZ_CN_MS = 8 * 3600 * 1000;
function cnNow() {
  return new Date(Date.now() + TZ_CN_MS);
}

// ===== 农历换算（1900-2100，与前端 lunar.js 算法一致） =====
const LUNAR_INFO = [
  0x04bd8,0x04ae0,0x0a570,0x054d5,0x0d260,0x0d950,0x16554,0x056a0,0x09ad0,0x055d2,
  0x04ae0,0x0a5b6,0x0a4d0,0x0d250,0x1d255,0x0b540,0x0d6a0,0x0ada2,0x095b0,0x14977,
  0x04970,0x0a4b0,0x0b4b5,0x06a50,0x06d40,0x1ab54,0x02b60,0x09570,0x052f2,0x04970,
  0x06566,0x0d4a0,0x0ea50,0x16a95,0x05ad0,0x02b60,0x186e3,0x092e0,0x1c8d7,0x0c950,
  0x0d4a0,0x1d8a6,0x0b550,0x056a0,0x1a5b4,0x025d0,0x092d0,0x0d2b2,0x0a950,0x0b557,
  0x06ca0,0x0b550,0x15355,0x04da0,0x0a5b0,0x14573,0x052b0,0x0a9a8,0x0e950,0x06aa0,
  0x0aea6,0x0ab50,0x04b60,0x0aae4,0x0a570,0x05260,0x0f263,0x0d950,0x05b57,0x056a0,
  0x096d0,0x04dd5,0x04ad0,0x0a4d0,0x0d4d4,0x0d250,0x0d558,0x0b540,0x0b6a0,0x195a6,
  0x095b0,0x049b0,0x0a974,0x0a4b0,0x0b27a,0x06a50,0x06d40,0x0af46,0x0ab60,0x09570,
  0x04af5,0x04970,0x064b0,0x074a3,0x0ea50,0x06b58,0x05ac0,0x0ab60,0x096d5,0x092e0,
  0x0c960,0x0d954,0x0d4a0,0x0da50,0x07552,0x056a0,0x0abb7,0x025d0,0x092d0,0x0cab5,
  0x0a950,0x0b4a0,0x0baa4,0x0ad50,0x055d9,0x04ba0,0x0a5b0,0x15176,0x052b0,0x0a930,
  0x07954,0x06aa0,0x0ad50,0x05b52,0x04b60,0x0a6e6,0x0a4e0,0x0d260,0x0ea65,0x0d530,
  0x05aa0,0x076a3,0x096d0,0x04afb,0x04ad0,0x0a4d0,0x1d0b6,0x0d250,0x0d520,0x0dd45,
  0x0b5a0,0x056d0,0x055b2,0x049b0,0x0a577,0x0a4b0,0x0aa50,0x1b255,0x06d20,0x0ada0,
  0x14b63,0x09370,0x049f8,0x04970,0x064b0,0x168a6,0x0ea50,0x06b20,0x1a6c4,0x0aae0,
  0x0a2e0,0x0d2e3,0x0c960,0x0d557,0x0d4a0,0x0da50,0x05d55,0x056a0,0x0a6d0,0x055d4,
  0x052d0,0x0a9b8,0x0a950,0x0b4a0,0x0b6a6,0x0ad50,0x055a0,0x0aba4,0x0a5b0,0x052b0,
  0x0b273,0x06930,0x07337,0x06aa0,0x0ad50,0x14b55,0x04b60,0x0a570,0x054e4,0x0d160,
  0x0e968,0x0d520,0x0daa0,0x16aa6,0x056d0,0x04ae0,0x0a9d4,0x0a2d0,0x0d150,0x0f252,
  0x0d520,
];
const MON_NAME = ['正','二','三','四','五','六','七','八','九','十','冬','腊'];
const CN_NUM = ['〇','一','二','三','四','五','六','七','八','九','十'];
const ANIMAL = ['鼠','牛','虎','兔','龙','蛇','马','羊','猴','鸡','狗','猪'];

function _leapMonth(y) { const v = LUNAR_INFO[y - 1900]; return v === undefined ? 0 : v & 0xf; }
function _leapDays(y) { return _leapMonth(y) ? ((LUNAR_INFO[y - 1900] & 0x10000) ? 30 : 29) : 0; }
function _monthDays(y, m) { const v = LUNAR_INFO[y - 1900]; return v === undefined ? 30 : ((v & (0x10000 >> m)) ? 30 : 29); }
function _yearDays(y) {
  const v = LUNAR_INFO[y - 1900];
  if (v === undefined) return 355;
  let s = 348;
  for (let i = 0x8000; i > 0x8; i >>= 1) s += (v & i) ? 1 : 0;
  return s + _leapDays(y);
}
function _dayName(d) {
  if (!(d >= 1 && d <= 30)) return '';
  if (d === 10) return '初十';
  if (d === 20) return '二十';
  if (d === 30) return '三十';
  const pre = ['初', '十', '廿', '卅'][Math.floor(d / 10)];
  return pre + (CN_NUM[d % 10] || '');
}

/** 公历 → 农历（入参为 Date.UTC 构造的日期，统一用 UTC 取值器） */
export function toLunar(date) {
  const y = date.getUTCFullYear();
  if (y < 1900 || y > 2100) return null;
  let off = Math.floor((Date.UTC(y, date.getUTCMonth(), date.getUTCDate()) - Date.UTC(1900, 0, 31)) / 86400000);
  let ly = 1900, tmp = 0;
  for (; ly < 2101 && off > 0; ly++) { tmp = _yearDays(ly); off -= tmp; }
  if (off < 0) { off += tmp; ly--; }
  const lp = _leapMonth(ly);
  let isLeap = false, lm = 1;
  for (; lm < 13 && off > 0; lm++) {
    if (lp > 0 && lm === lp + 1 && !isLeap) { lm--; isLeap = true; tmp = _leapDays(ly); }
    else tmp = _monthDays(ly, lm);
    if (isLeap && lm === lp + 1) isLeap = false;
    off -= tmp;
  }
  if (off === 0 && lp > 0 && lm === lp + 1) { if (isLeap) isLeap = false; else { isLeap = true; lm--; } }
  if (off < 0) { off += tmp; lm--; }
  if (!(lm >= 1 && lm <= 12)) lm = 1;
  const day = off + 1;
  const mn = MON_NAME[lm - 1] || '';
  return { year: ly, month: lm, day, isLeap,
    monthName: (isLeap ? '闰' : '') + mn + '月', dayName: _dayName(day) };
}

// ===== 生日模型（v0.4.0）=====
// birthday_type: '' 不知道年龄（跳过）| 'monthday' 只知月日 | 'full' 确切生日
// birthday_calendar: 'solar' 阳历 | 'lunar' 农历
// birth_year/birth_month/birth_day

/** 解析并校验请求体里的生日字段，返回可写入的列值；出错返回 { error } */
export function parseBirthdayBody(body) {
  const type = ['', 'monthday', 'full'].includes(body.birthdayType) ? body.birthdayType : '';
  const calendar = body.birthdayCalendar === 'lunar' ? 'lunar' : 'solar';
  const out = {
    birthday_type: type,
    birthday_calendar: type ? calendar : 'solar',
    birth_year: null,
    birth_month: null,
    birth_day: null,
  };
  if (!type) return { data: out };
  const m = Number(body.birthMonth);
  const d = Number(body.birthDay);
  if (!Number.isInteger(m) || m < 1 || m > 12) return { error: '出生月份不正确' };
  if (!Number.isInteger(d) || d < 1 || d > 31) return { error: '出生日期不正确' };
  if (d > 30 && calendar === 'lunar') return { error: '农历一个月最多 30 天' };
  out.birth_month = m;
  out.birth_day = d;
  if (type === 'full') {
    const y = Number(body.birthYear);
    if (!Number.isInteger(y) || y < 1900 || y > 2100) return { error: '出生年份不正确（1900-2100）' };
    out.birth_year = y;
  }
  return { data: out };
}

/**
 * 下一次生日（按北京「今天」；农历生日逐年换算成公历）。
 * 入参为 contacts 行。无生日（birthday_type 为空）返回 null。
 */
export function nextBirthdayOf(c) {
  if (!c || !c.birthday_type || !c.birth_month || !c.birth_day) return null;
  const M = c.birth_month, D = c.birth_day;
  const now = cnNow();
  const y = now.getUTCFullYear();
  const today = Date.UTC(y, now.getUTCMonth(), now.getUTCDate());
  const p2 = (x) => String(x).padStart(2, '0');

  let nextMs;
  if (c.birthday_calendar === 'lunar') {
    // 从今天起逐日换算农历，找到第一个匹配的公历日（农历生日当年可能晚于明年年初，最多扫 400 天）
    nextMs = null;
    for (let i = 0; i <= 400; i++) {
      const t = today + i * 86400000;
      const l = toLunar(new Date(t));
      if (l && !l.isLeap && l.month === M && l.day === D) { nextMs = t; break; }
    }
    if (nextMs === null) return null;
  } else {
    nextMs = Date.UTC(y, M - 1, D);
    if (nextMs < today) nextMs = Date.UTC(y + 1, M - 1, D);
  }

  const nd = new Date(nextMs);
  const days = Math.round((nextMs - today) / 86400000);
  const age = (c.birthday_type === 'full' && c.birth_year)
    ? nd.getUTCFullYear() - c.birth_year : null;
  return {
    date: `${nd.getUTCFullYear()}-${p2(M)}-${p2(D)}`,
    days, age,
    calendar: c.birthday_calendar || 'solar',
    text: c.birthday_calendar === 'lunar'
      ? `农历${(MON_NAME[M - 1] || '')}月${_dayName(D)}`
      : `${M}月${D}日`,
  };
}

/** 年龄（按北京「今天」；仅确切生日有） */
export function ageOfContact(c) {
  if (!c || c.birthday_type !== 'full' || !c.birth_year) return null;
  const now = cnNow();
  let a = now.getUTCFullYear() - c.birth_year;
  const m = now.getUTCMonth() + 1, d = now.getUTCDate();
  if (m < c.birth_month || (m === c.birth_month && d < c.birth_day)) a--;
  return a >= 0 && a < 130 ? a : null;
}

/** 是否 30 天内有生日（首页统计用） */
export function birthdayWithin30Of(c) {
  const nb = nextBirthdayOf(c);
  return !!nb && nb.days <= 30;
}

/**
 * 删除联系人并级联清理其全部关联数据。
 * /api/contacts/:id 与 /api/profile/delete 两个端点共用，保证行为一致。
 * db.batch 保证原子性：要么全部清理成功，要么全部不动。
 * 返回被删的联系人行（id 不存在时返回 null）。
 */
export async function deleteContactCascade(env, id) {
  const person = await env.DB.prepare('SELECT name, phone FROM contacts WHERE id=?').bind(id).first();
  if (!person) return null;
  // v0.6.0：附件 R2 对象键先取出来（DB 行删掉就拿不到了）
  let fileKeys = [];
  try {
    fileKeys = ((await env.DB.prepare('SELECT file_key FROM contact_files WHERE contact_id=?').bind(id).all()).results || [])
      .map((r) => r.file_key);
  } catch (_) { /* 表不存在（未迁移）时忽略 */ }
  await env.DB.batch([
    // 先清他人指向此人的引用（引荐人 / 家庭关系跳转 / 账本往来关联）
    env.DB.prepare('UPDATE contacts SET referrer_id=NULL WHERE referrer_id=?').bind(id),
    env.DB.prepare('UPDATE contact_relatives SET ref_id=NULL WHERE ref_id=?').bind(id),
    env.DB.prepare('UPDATE transactions SET contact_id=NULL WHERE contact_id=?').bind(id),
    // 再删除该人物的档案数据
    env.DB.prepare('DELETE FROM contact_contacts WHERE person_id=?').bind(id),
    env.DB.prepare('DELETE FROM contact_edu WHERE person_id=?').bind(id),
    env.DB.prepare('DELETE FROM contact_work WHERE person_id=?').bind(id),
    env.DB.prepare('DELETE FROM contact_relatives WHERE person_id=?').bind(id),
    env.DB.prepare('DELETE FROM rel_pets WHERE person_id=?').bind(id),
    env.DB.prepare('DELETE FROM body_records WHERE contact_id=?').bind(id),
    env.DB.prepare('DELETE FROM contact_files WHERE contact_id=?').bind(id),
    env.DB.prepare('DELETE FROM contacts WHERE id=?').bind(id),
  ]);
  // R2 里的附件对象一并清理（尽力而为；失败不影响联系人删除）
  if (fileKeys.length && env.BUCKET) {
    await Promise.all(fileKeys.map((k) => env.BUCKET.delete(k).catch(() => {})));
  }
  return person;
}
