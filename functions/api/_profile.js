// 数字生活 · 人物档案公共帮助

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
const CN_NUM = ['〇','一','二','三','四','五','六','七','八','九','十'];
const MON_NAME = ['正','二','三','四','五','六','七','八','九','十','冬','腊'];
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

/** 公历 → 农历 */
export function toLunar(date) {
  const y = date.getFullYear();
  if (y < 1900 || y > 2100) return null;
  let off = Math.floor((Date.UTC(y, date.getMonth(), date.getDate()) - Date.UTC(1900, 0, 31)) / 86400000);
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

/** 生日对应的农历（按出生年固定） */
export function lunarBirthday(birthday) {
  if (!birthday) return null;
  const parts = String(birthday).split('-').map(Number);
  const Y = parts[0], M = parts[1], D = parts[2];
  if (!Y || !M || !D || Y < 1900 || Y > 2100) return null;
  const l = toLunar(new Date(Date.UTC(Y, M - 1, D)));
  if (!l) return null;
  const ai = ((Y - 4) % 12 + 12) % 12;
  return {
    full: (l.isLeap ? '闰' : '') + (MON_NAME[l.month - 1] || '') + '月' + _dayName(l.day),
    short: l.day === 1 ? l.monthName : l.dayName,
    month: l.month, day: l.day, isLeap: l.isLeap,
    animal: ANIMAL[ai] || '',
  };
}

/** 下一次生日：每年都有，取今年或明年 */
export function nextBirthday(birthday) {
  if (!birthday) return null;
  const [Y, M, D] = String(birthday).split('-').map(Number);
  if (!M || !D) return null;
  const now = new Date();
  let n = new Date(now.getFullYear(), M - 1, D);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (n < today) n = new Date(now.getFullYear() + 1, M - 1, D);
  const days = Math.round((n - today) / 86400000);
  const p2 = (x) => String(x).padStart(2, '0');
  return {
    days, age: n.getFullYear() - Y,
    full: `${n.getFullYear()}-${p2(M)}-${p2(D)}`,
    lunar: lunarBirthday(birthday),
  };
}

/** 生日为空时，从身份证第 7-14 位解析出生年月日 */
export function birthdayFromIdcard(idcard) {
  if (!/^\d{17}[\dXx]$/.test(String(idcard || ''))) return null;
  return `${idcard.slice(6, 10)}-${idcard.slice(10, 12)}-${idcard.slice(12, 14)}`;
}

/** 年龄 */
export function ageOf(birthday) {
  if (!birthday) return null;
  const [Y] = String(birthday).split('-').map(Number);
  if (!Y) return null;
  const now = new Date();
  let a = now.getFullYear() - Y;
  const m = now.getMonth() + 1, d = now.getDate();
  const [, bm, bd] = String(birthday).split('-').map(Number);
  if (m < bm || (m === bm && d < bd)) a--;
  return a >= 0 && a < 130 ? a : null;
}

/** 逗号分隔数组互转 */
export const toArr = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
export const joinArr = (a) => (Array.isArray(a) ? a.filter(Boolean).join(',') : String(a || ''));