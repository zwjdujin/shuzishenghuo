// 数字生活 · 农历换算（1900-2100）
// 独立模块，供日历中心周历/月历显示农历。
// 算法：1900-01-31 为农历 1900 年正月初一基准，用每年「压缩 lunarInfo」表推算。

// 每年 1 个 16/20 位整数，低 4 位为闰月月份(0=无)，其余按位表示各月大小
const LUNAR_INFO = [
  0x04bd8,0x04ae0,0x0a570,0x054d5,0x0d260,0x0d950,0x16554,0x056a0,0x09ad0,0x055d2,//1900-1909
  0x04ae0,0x0a5b6,0x0a4d0,0x0d250,0x1d255,0x0b540,0x0d6a0,0x0ada2,0x095b0,0x14977,//1910-1919
  0x04970,0x0a4b0,0x0b4b5,0x06a50,0x06d40,0x1ab54,0x02b60,0x09570,0x052f2,0x04970,//1920-1929
  0x06566,0x0d4a0,0x0ea50,0x16a95,0x05ad0,0x02b60,0x186e3,0x092e0,0x1c8d7,0x0c950,//1930-1939
  0x0d4a0,0x1d8a6,0x0b550,0x056a0,0x1a5b4,0x025d0,0x092d0,0x0d2b2,0x0a950,0x0b557,//1940-1949
  0x06ca0,0x0b550,0x15355,0x04da0,0x0a5b0,0x14573,0x052b0,0x0a9a8,0x0e950,0x06aa0,//1950-1959
  0x0aea6,0x0ab50,0x04b60,0x0aae4,0x0a570,0x05260,0x0f263,0x0d950,0x05b57,0x056a0,//1960-1969
  0x096d0,0x04dd5,0x04ad0,0x0a4d0,0x0d4d4,0x0d250,0x0d558,0x0b540,0x0b6a0,0x195a6,//1970-1979
  0x095b0,0x049b0,0x0a974,0x0a4b0,0x0b27a,0x06a50,0x06d40,0x0af46,0x0ab60,0x09570,//1980-1989
  0x04af5,0x04970,0x064b0,0x074a3,0x0ea50,0x06b58,0x05ac0,0x0ab60,0x096d5,0x092e0,//1990-1999
  0x0c960,0x0d954,0x0d4a0,0x0da50,0x07552,0x056a0,0x0abb7,0x025d0,0x092d0,0x0cab5,//2000-2009
  0x0a950,0x0b4a0,0x0baa4,0x0ad50,0x055d9,0x04ba0,0x0a5b0,0x15176,0x052b0,0x0a930,//2010-2019
  0x07954,0x06aa0,0x0ad50,0x05b52,0x04b60,0x0a6e6,0x0a4e0,0x0d260,0x0ea65,0x0d530,//2020-2029
  0x05aa0,0x076a3,0x096d0,0x04afb,0x04ad0,0x0a4d0,0x1d0b6,0x0d250,0x0d520,0x0dd45,//2030-2039
  0x0b5a0,0x056d0,0x055b2,0x049b0,0x0a577,0x0a4b0,0x0aa50,0x1b255,0x06d20,0x0ada0,//2040-2049
  0x14b63,0x09370,0x049f8,0x04970,0x064b0,0x168a6,0x0ea50,0x06b20,0x1a6c4,0x0aae0,//2050-2059
  0x0a2e0,0x0d2e3,0x0c960,0x0d557,0x0d4a0,0x0da50,0x05d55,0x056a0,0x0a6d0,0x055d4,//2060-2069
  0x052d0,0x0a9b8,0x0a950,0x0b4a0,0x0b6a6,0x0ad50,0x055a0,0x0aba4,0x0a5b0,0x052b0,//2070-2079
  0x0b273,0x06930,0x07337,0x06aa0,0x0ad50,0x14b55,0x04b60,0x0a570,0x054e4,0x0d160,//2080-2089
  0x0e968,0x0d520,0x0daa0,0x16aa6,0x056d0,0x04ae0,0x0a9d4,0x0a2d0,0x0d150,0x0f252,//2090-2099
  0x0d520,//2100
];

const GAN = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
const ZHI = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const ANIMALS = ['鼠','牛','虎','兔','龙','蛇','马','羊','猴','鸡','狗','猪'];
const CN_NUM = ['〇','一','二','三','四','五','六','七','八','九','十'];
const MONTH_NAMES = ['正','二','三','四','五','六','七','八','九','十','冬','腊'];
// 节气（每月两个，索引 = (月-1)*2 + 0/1），用于月历显示
const TERMS = ['小寒','大寒','立春','雨水','惊蛰','春分','清明','谷雨','立夏','小满','芒种','夏至',
  '小暑','大暑','立秋','处暑','白露','秋分','寒露','霜降','立冬','小雪','大雪','冬至'];
const TERM_DAYS = [6,20,4,18,6,21,5,20,6,21,6,22,7,23,8,23,8,23,8,23,7,22,7,22];

function lYearDays(y) {
  let sum = 348;
  for (let i = 0x8000; i > 0x8; i >>= 1) sum += (LUNAR_INFO[y - 1900] & i) ? 1 : 0;
  return sum + leapDays(y);
}
function leapMonth(y) { return LUNAR_INFO[y - 1900] & 0xf; }
function leapDays(y) { return leapMonth(y) ? ((LUNAR_INFO[y - 1900] & 0x10000) ? 30 : 29) : 0; }
function monthDays(y, m) { return (LUNAR_INFO[y - 1900] & (0x10000 >> m)) ? 30 : 29; }

function toLunar(date) {
  const y = date.getFullYear();
  if (y < 1900 || y > 2100) return null;
  const base = Date.UTC(1900, 0, 31);
  const cur = Date.UTC(y, date.getMonth(), date.getDate());
  let offset = Math.floor((cur - base) / 86400000);

  let ly = 1900;
  let temp = 0;
  for (; ly < 2101 && offset > 0; ly++) {
    temp = lYearDays(ly);
    offset -= temp;
  }
  if (offset < 0) { offset += temp; ly--; }

  const leap = leapMonth(ly);
  let isLeap = false;
  let lm = 1;
  for (; lm < 13 && offset > 0; lm++) {
    if (leap > 0 && lm === leap + 1 && !isLeap) { lm--; isLeap = true; temp = leapDays(ly); }
    else temp = monthDays(ly, lm);
    if (isLeap && lm === leap + 1) isLeap = false;
    offset -= temp;
  }
  if (offset === 0 && leap > 0 && lm === leap + 1) { if (isLeap) isLeap = false; else { isLeap = true; lm--; } }
  if (offset < 0) { offset += temp; lm--; }

  const ld = offset + 1;
  return {
    year: ly,
    month: lm,
    day: ld,
    isLeap: isLeap,
    monthName: (isLeap ? '闰' : '') + MONTH_NAMES[lm - 1] + '月',
    dayName: dayName(ld),
    animal: ANIMALS[(ly - 4) % 12],
    ganzhi: GAN[(ly - 4) % 10] + ZHI[(ly - 4) % 12],
  };
}

// 初一 → '初一'；十 → '十'；十一 → '十一'；二十 → '二十'；三十 → '三十'
function dayName(d) {
  if (d === 10) return '初十';
  if (d === 20) return '二十';
  if (d === 30) return '三十';
  const pre = ['初', '十', '廿', '卅'][Math.floor(d / 10)];
  return pre + CN_NUM[d % 10];
}

// 该公历日期的节气名（若当天恰为节气则返回，否则空）
function termOf(date) {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  for (let i = 0; i < 2; i++) {
    if (TERM_DAYS[(m - 1) * 2 + i] === d) return TERMS[(m - 1) * 2 + i];
  }
  return '';
}

// 供日历格子显示：返回该日的农历短文本与节气
function lunarLabel(date) {
  const t = termOf(date);
  const l = toLunar(date);
  if (!l) return { text: '', term: t, isFestival: false };
  // 农历初一显示月份，其余显示日
  let text = l.day === 1 ? l.monthName : l.dayName;
  if (t) text = t; // 节气优先显示
  return { text, term: t, monthName: l.monthName, dayName: l.dayName, animal: l.animal, ganzhi: l.ganzhi, isFestival: t || l.day === 1 };
}

// 完整农历信息（详情用）
function lunarFull(date) {
  const l = toLunar(date);
  if (!l) return null;
  return { ...l, term: termOf(date), text: lunarLabel(date).text };
}

// 以 <script src> 加载（非 ES module），故显式挂到 window 供 app.js 使用
window.lunarLabel = lunarLabel;
window.lunarFull = lunarFull;