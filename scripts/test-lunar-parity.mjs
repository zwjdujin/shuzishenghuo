// v0.5.56 农历一致性测试（纯 node，不需要本地服务）
// 1) functions/api/_profile.js 的 toLunar 与 worker/src/lunar.js 的 toLunarOf 是同一算法的两份拷贝
//    （Worker 是独立工程不能共享构建），全区间对拍保证两边永不漂移；
// 2) 前端 public/js/lunar.js（classic script，window.lunarLabel/lunarFull）是第三份实现，
//    用 vm 沙箱加载后同样全区间对拍；
// 3) 对照交接文档 §8.2 的已知锚点（春节/中秋/闰月）与香港天文台年历表；
// 4) worker 版的边界行为（越界/非法输入返回 null，不抛异常）。
// 已修复（本轮）：前端 lunar.js 的节气旧表是固定日期近似，夏至/春分/冬至/清明在 2020 年代
// 多数年份标错；已改为通式寿星公式（C 值与例外年逐条核实），并以香港天文台 2026 全年
// 节气表作为回归基准（见下方 hko2026）。
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { toLunar } from '../functions/api/_profile.js';
import { toLunarOf, lunarMD } from '../worker/src/lunar.js';

const require = createRequire(import.meta.url);
const join = (a, b) => require('node:path').join(a, b);

// 前端 lunar.js 是 classic script：vm 沙箱里给它一个 window，取回挂载的函数
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(process.cwd(), 'public/js/lunar.js'), 'utf8'), sandbox);
const feLabel = sandbox.window.lunarLabel;
const feFull = sandbox.window.lunarFull;
if (typeof feLabel !== 'function' || typeof feFull !== 'function') {
  console.error('✗ 前端 lunar.js 未挂载 window.lunarLabel/lunarFull');
  process.exit(1);
}

let pass = 0, fail = 0;
function ok(cond, label, extra = '') {
  if (cond) { pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra ? '  -> ' + extra : '')); }
}

// ---- 1. 全区间对拍（1900-01-31 ～ 2100-12-31）----
{
  let mismatch = 0;
  const samples = [];
  const start = Date.UTC(1900, 0, 31);
  const end = Date.UTC(2100, 11, 31);
  for (let t = start; t <= end; t += 86400000) {
    const d = new Date(t);
    const a = toLunar(d);
    const ymd = d.toISOString().slice(0, 10);
    const b = toLunarOf(ymd);
    const same = a && b
      && a.year === b.year && a.month === b.month && a.day === b.day
      && a.isLeap === b.isLeap && a.monthName === b.monthName;
    if (!same) {
      mismatch++;
      if (samples.length < 5) samples.push(`${ymd}: profile=${JSON.stringify(a)} worker=${JSON.stringify(b)}`);
    }
  }
  ok(mismatch === 0, `全区间对拍一致（1900-01-31 ~ 2100-12-31，共 ${Math.round((end - start) / 86400000) + 1} 天）`, samples.join(' | '));
}

// ---- 1b. 前端 lunar.js（classic script，本地时区构造）全区间对拍 ----
{
  let mismatch = 0;
  const samples = [];
  for (let y = 1900; y <= 2100; y++) {
    for (let m = 0; m < 12; m++) {
      const dim = new Date(y, m + 1, 0).getDate();
      for (let d = 1; d <= dim; d++) {
        const ymd = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const be = toLunarOf(ymd);
        const fe = feFull(new Date(y, m, d));
        const same = (be == null && fe == null)
          || (be && fe && be.year === fe.year && be.month === fe.month && be.day === fe.day
            && !!be.isLeap === !!fe.isLeap && be.monthName === fe.monthName);
        if (!same) {
          mismatch++;
          if (samples.length < 5) samples.push(`${ymd}: 前端=${JSON.stringify(fe)} 后端=${JSON.stringify(be)}`);
        }
      }
    }
  }
  ok(mismatch === 0, '前端 lunar.js 与后端全区间对拍一致（73,415 天）', samples.join(' | '));

  // 前端展示口径：初一显示月名，节气优先（寿星公式，已对拍香港天文台 2026 全表）
  const L = (y, m, d) => feLabel(new Date(y, m - 1, d));
  ok(L(2026, 2, 17).text === '正月', '2026-02-17 月历格显示「正月」（初一显示月名）', L(2026, 2, 17).text);
  const f = feFull(new Date(2026, 1, 17));
  ok(f && f.ganzhi === '丙午' && f.animal === '马', '2026-02-17 干支=丙午、生肖=马（按正月初一换年口径）', JSON.stringify(f && { g: f.ganzhi, a: f.animal }));
  ok(feLabel(new Date(2026, 0, 5)).text !== undefined, '越界前的正常日期不报错');
  const nullOut = feFull(new Date(1899, 11, 31));
  ok(nullOut === null, '1899-12-31 前端返回 null（越界不抛异常）');
  const preEpoch = feFull(new Date(1900, 0, 1));
  ok(preEpoch === null, '1900-01-01（基准点前 30 天）前端返回 null（旧版会推出「undefined月」乱码）', JSON.stringify(preEpoch));

  // 节气：香港天文台《二十四節氣的日期及時間資料》2026 年全表
  // https://www.hko.gov.hk/tc/gts/astronomy/Solar_Term.htm（香港时间 UTC+8；键用简体，实现返回简体）
  const hko2026 = {
    '小寒': [1, 5], '大寒': [1, 20], '立春': [2, 4], '雨水': [2, 18],
    '惊蛰': [3, 5], '春分': [3, 20], '清明': [4, 5], '谷雨': [4, 20],
    '立夏': [5, 5], '小满': [5, 21], '芒种': [6, 5], '夏至': [6, 21],
    '小暑': [7, 7], '大暑': [7, 23], '立秋': [8, 7], '处暑': [8, 23],
    '白露': [9, 7], '秋分': [9, 23], '寒露': [10, 8], '霜降': [10, 23],
    '立冬': [11, 7], '小雪': [11, 22], '大雪': [12, 7], '冬至': [12, 22],
  };
  let termBad = [];
  for (const [name, [mm, dd]] of Object.entries(hko2026)) {
    const got = L(2026, mm, dd).term || L(2026, mm, dd).text;
    if (got !== name) termBad.push(`${name} 期望 ${mm}-${dd}，实际「${got}」`);
  }
  ok(termBad.length === 0, '节气全表对拍香港天文台 2026（24/24）', termBad.join('；'));

  // 例外年抽查：2025 立春 2-3、2021 冬至 12-21、2019 小寒 1-5
  ok((L(2025, 2, 3).term || '') === '立春', '2025-02-03 立春（旧固定表标在 2-4）');
  ok((L(2021, 12, 21).term || '') === '冬至', '2021-12-21 冬至（含例外年 -1）');
  ok((L(2019, 1, 5).term || '') === '小寒', '2019-01-05 小寒（含例外年 -1）');
}

// ---- 2. 锚点（交接文档 §8.2）----
{
  const anchor = (ymd, y, m, d, leap, label) => {
    const r = toLunarOf(ymd);
    ok(r && r.year === y && r.month === m && r.day === d && !!leap === !!r.isLeap,
      label, ymd + ' → ' + JSON.stringify(r));
  };
  anchor('1900-01-31', 1900, 1, 1, false, '1900-01-31 = 正月初一（表基准点）');
  anchor('2023-01-22', 2023, 1, 1, false, '2023-01-22 = 正月初一（春节）');
  anchor('2024-02-10', 2024, 1, 1, false, '2024-02-10 = 正月初一（春节）');
  anchor('2025-01-29', 2025, 1, 1, false, '2025-01-29 = 正月初一（春节）');
  anchor('2026-02-17', 2026, 1, 1, false, '2026-02-17 = 正月初一（春节）');
  anchor('2026-09-25', 2026, 8, 15, false, '2026-09-25 = 八月十五（中秋）');
  // 闰月：2025 闰六月 → 2025-07-25 起为闰六月初一（2025-07-25 是农历闰六月初一）
  const leap2025 = toLunarOf('2025-07-25');
  ok(leap2025 && leap2025.isLeap && leap2025.month === 6, '2025 年有闰六月，7-25 为闰六月初一', JSON.stringify(leap2025));
  // 2023 闰二月：2023-03-22 = 闰二月初一
  const leap2023 = toLunarOf('2023-03-22');
  ok(leap2023 && leap2023.isLeap && leap2023.month === 2, '2023 年有闰二月，3-22 为闰二月初一', JSON.stringify(leap2023));
  // 2026 无闰月：全年 12 个月都没有 isLeap
  let leapIn2026 = 0;
  for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += 86400000) {
    const r = toLunarOf(new Date(t).toISOString().slice(0, 10));
    if (r && r.isLeap) leapIn2026++;
  }
  ok(leapIn2026 === 0, '2026 年无闰月');
  // 2028 闰五月：初一 = 公历 2028-06-23（香港天文台 2028 年历表：
  // https://www.hko.gov.hk/tc/gts/time/calendar/pdf/files/2028.pdf）；另加 2028 春节 = 01-26
  anchor('2028-01-26', 2028, 1, 1, false, '2028-01-26 = 正月初一（春节）');
  const leap2028 = toLunarOf('2028-06-23');
  ok(leap2028 && leap2028.isLeap && leap2028.month === 5 && leap2028.day === 1, '2028 年闰五月，6-23 为闰五月初一', JSON.stringify(leap2028));
}

// ---- 3. worker 版边界与非法输入（推送 Worker 逐日扫描，绝不能抛异常）----
{
  ok(toLunarOf('1899-12-31') === null, '1899-12-31 → null（越界）');
  ok(toLunarOf('2101-01-01') === null, '2101-01-01 → null（越界）');
  ok(toLunarOf('') === null, '空串 → null');
  ok(toLunarOf(undefined) === null, 'undefined → null');
  ok(toLunarOf('2026-13-45') === null, '2026-13-45 → null（非法日期）');
  ok(toLunarOf('2026-02-30') === null, '2026-02-30 → null（非日历日）');
  ok(lunarMD(8, 15) === '八月十五', 'lunarMD(8,15) = 八月十五', lunarMD(8, 15));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
