// 农历换算（1900-2100）· v0.5.56 从 functions/api/_profile.js 复制而来
// push Worker 是独立工程（独立 wrangler.toml / 独立部署），与 Pages Functions 不共享构建，
// 因此这里保留一份同样的表驱动实现（两边算法一致，可差分对拍）。
// 生日推送此前把农历月日当公历月日匹配（注释自称「近似策略」）——农历八月十五的生日会在
// 公历 8 月 15 日被推送，实际中秋在 9 月 25 日。现在按天换算精确匹配。

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
// 数字表下标必须从「〇」起（与 _profile.js 的 CN_NUM 一致）：日名按 d%10 取，
// 少了零号位会把十五写成十六（本次对拍测试抓到的回归）
const CN_NUM = ['〇','一','二','三','四','五','六','七','八','九'];

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

/** 是否真实存在的日历日（月 01-12，日与月份、闰年匹配） */
function isYmd(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

/** 公历（YYYY-MM-DD）→ 农历 { year, month, day, isLeap, monthName }；越界/非法返回 null */
export function toLunarOf(dateStr) {
  if (typeof dateStr !== 'string' || !isYmd(dateStr)) return null;
  const [y, mo, da] = dateStr.split('-').map(Number);
  if (y < 1900 || y > 2100) return null;
  let off = Math.floor((Date.UTC(y, mo - 1, da) - Date.UTC(1900, 0, 31)) / 86400000);
  if (off < 0) return null;   // v0.5.56：早于基准点 1900-01-31 的 1900 年 1 月会推出负天数乱码
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
  return {
    year: ly, month: lm, day: off + 1, isLeap,
    monthName: (isLeap ? '闰' : '') + (MON_NAME[lm - 1] || '') + '月',
  };
}

/** 农历月日的展示（如「八月十五」） */
export function lunarMD(month, day) {
  const mn = MON_NAME[month - 1] || '';
  const dd = day === 10 ? '初十' : day === 20 ? '二十' : day === 30 ? '三十'
    : ['初', '十', '廿', '卅'][Math.floor(day / 10)] + (CN_NUM[day % 10] || '');
  return `${mn}月${dd}`;
}
