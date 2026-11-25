// ===== 写入校验工具（v0.5.56，审计 P2-14）=====
// 此前各处日期/时间只做正则：2026-13-45、25:99、2026-02-30 都能入库——
//   · 乱日期的流水不落入任何月份区间：账本与预算里看不见，却计入导出与统计，总额对不上；
//   · 待办的非法日期会让重复链静默中断（nextRepeatDate 对 Invalid Date 返回 null）；
//   · 周期账单的脏 next_date 会让自动入账循环中断。
// 这里一次把「日历有效性 / 时间范围 / 金额范围」做对，所有写入口统一调用。
// 文件名下划线开头：不会被 Pages Functions 当成路由（与 _lib.js / _helpers.js 同理）。

/** 是否真实存在的日历日（月 01–12，日与月份、闰年匹配） */
export function isYmd(s) {
  if (typeof s !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  // Date.UTC(y, mo, 0) = mo 月的最后一天（月份从 0 起，所以传 mo 即「下一个月」）
  return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

/** 日期：合法日历日 → 'YYYY-MM-DD'；否则 null（入参会先 trim） */
export function cleanDate(v) {
  const s = v == null ? '' : String(v).trim();
  return isYmd(s) ? s : null;
}

/**
 * 写接口的日期入参：未提供（undefined / null / ''）→ 用 fallback；
 * 提供了但不是有效日历日 → 返回 { error }（调用方直接回 400，而不是悄悄回退到今天）。
 * 返回 { date } 或 { error }。
 */
export function dateArg(v, fallback, label = '日期') {
  const s = v == null ? '' : String(v).trim();
  if (!s) return { date: fallback };
  if (isYmd(s)) return { date: s };
  return { error: `${label}需为有效日期（YYYY-MM-DD）` };
}

/**
 * 时间：'H:MM' 或 'HH:MM'（可带 ':SS'，秒丢弃），范围 00:00–23:59 → 统一补零成 'HH:MM'；
 * 其余一律 null。补零是为了字符串排序正确（'9:30' 排在 '10:00' 之后）。
 */
export function cleanTime(v) {
  const s = v == null ? '' : String(v).trim();
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

/**
 * 金额：必须是有限数且 > 0（allowZero 时可为 0），并 ≤ max（默认 1e12）。
 * 此前金额无上限：1e308 入库后一求和就溢出成 Infinity → JSON 里变成 null。
 * 合法 → number；否则 null。空串 / null 视为「没填」→ null。
 */
export function cleanAmount(v, { allowZero = false, max = 1e12 } = {}) {
  if (v == null || (typeof v === 'string' && v.trim() === '')) return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  if (!Number.isFinite(n)) return null;
  if (allowZero ? n < 0 : n <= 0) return null;
  return n <= max ? n : null;
}

/** 整数：有限整数（或整数字符串）→ number；布尔 / 小数 / NaN / 空 → def */
export function toInt(v, def = 0) {
  if (v == null || v === '' || typeof v === 'boolean') return def;
  const n = Number(v);
  return Number.isInteger(n) ? n : def;
}

/** 月份：'YYYY-MM' 且 MM 为 01–12 → 原串；否则 null */
export function cleanMonth(v) {
  const s = v == null ? '' : String(v).trim();
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return null;
  return s;
}
