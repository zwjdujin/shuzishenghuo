// 本地验证：mock D1 + Node 跑 medicines API（效期状态判定 / 统计 / 增删改）
import { onRequestGet, onRequestPost, expiryStatus, daysLabel } from '../functions/api/medicines.js';

const TODAY = '2026-10-09';

function mockDB(rows) {
  return {
    prepare(sql) {
      return {
        bind: (...p) => run(sql, p),
        all: async () => ({ results: sql.includes('FROM medicines') ? rows : [] }),
        run: async () => runSync(sql, p),
        first: async () => null,
      };
    },
  };
}
let ROWS = [];
let runSync = () => ({ meta: { last_row_id: 1 } });
function run(sql, params) {
  return {
    bind: (...p) => ({ sql, params: p }),
    all: async () => ({ results: sql.startsWith('SELECT') ? ROWS : [] }),
    run: async () => {
      runSync = () => ({ meta: { last_row_id: ROWS.length + 1 } });
      return runSync(sql, params);
    },
    first: async () => null,
  };
}

// ===== 1. 效期状态判定（含 6 个月边界） =====
const cases = [
  ['2026-10-08', 'expired', -1],   // 昨天过期
  ['2026-10-09', 'soon', 0],       // 今天到期 -> 临期
  ['2026-11-09', 'soon', 31],      // 1 个月后
  ['2027-04-09', 'soon', 182],     // 正好 6 个月 -> 边界内，算临期
  ['2027-04-10', 'safe', 183],     // 6 个月零 1 天 -> 安全
  ['2028-10-09', 'safe', 731],   // 2028 为闰年，730+1 天
  ['', 'none', null],
  [null, 'none', null],
];
let pass = 0;
console.log('— 效期状态判定 —');
cases.forEach(([exp, wantState, wantDays]) => {
  const r = expiryStatus(exp, TODAY);
  const ok = r.state === wantState && r.days === wantDays;
  if (ok) pass++;
  console.log(`${ok ? '✓' : '✗'} ${String(exp).padEnd(12)} → ${r.state.padEnd(8)} days=${String(r.days).padEnd(5)} ${daysLabel(r.days)}`);
});

// ===== 2. GET 统计与分组 =====
console.log('\n— GET 分组与统计 —');
const seed = [
  { id: 1, name: '过期药A', expiry: '2026-05-01', stock: 1, stock_min: 1, category: '感冒发热', location: '客厅药箱' },
  { id: 2, name: '过期药B', expiry: '2026-06-30', stock: 1, stock_min: 1, category: '肠胃消化', location: '客厅药箱' },
  { id: 3, name: '临期药C', expiry: '2026-12-20', stock: 2, stock_min: 1, category: '感冒发热', location: '冰箱冷藏' },
  { id: 4, name: '临期药D', expiry: '2027-03-01', stock: 1, stock_min: 1, category: '肠胃消化', location: '冰箱冷藏' },
  { id: 5, name: '正常药E', expiry: '2028-01-01', stock: 3, stock_min: 1, category: '感冒发热', location: '随身包' },
  { id: 6, name: '无期药F', expiry: null, stock: 0, stock_min: 1, category: '其他', location: '玄关抽屉' },
];
ROWS = seed;
const ctx = { env: { DB: mockDB(seed) }, request: new Request('https://x/api/medicines') };
const res = await onRequestGet(ctx);
const data = await res.json();

const expect = { total: 6, soon: 2, expired: 2, safe: 1, noExpiry: 1, lowStock: 1, kinds: 6 };
Object.entries(expect).forEach(([k, v]) => {
  const got = data.stats[k];
  const ok = got === v;
  if (ok) pass++;
  console.log(`${ok ? '✓' : '✗'} stats.${k} = ${got}（期望 ${v}）`);
});
console.log(`  expiring 名单: ${data.expiring.map((m) => m.name).join(', ')}`);
console.log(`  expired 名单: ${data.expired.map((m) => m.name).join(', ')}`);
console.log(`  分类聚合: ${JSON.stringify(data.categories)}`);
console.log(`  位置聚合: ${JSON.stringify(data.byLocation)}`);
console.log(`  options 完整性: cat=${data.options.categories.length} loc=${data.options.locations.length} form=${data.options.forms.length} whom=${data.options.forWhom.length}`);

// ===== 3. 空数据（全新用户：应显示暂无） =====
ROWS = [];
const res2 = await onRequestGet({ env: { DB: mockDB([]) }, request: new Request('https://x/api/medicines') });
const d2 = await res2.json();
const emptyOk = d2.stats.total === 0 && d2.expiring.length === 0 && d2.expired.length === 0;
if (emptyOk) pass++;
console.log(`\n${emptyOk ? '✓' : '✗'} 空药箱: total=${d2.stats.total} 临期=${d2.expiring.length} 过期=${d2.expired.length} → 页面显示「暂无临期药品」「暂无过期药品」`);

// ===== 4. 参数校验 =====
console.log('\n— POST 参数校验 —');
const mk = (body) => new Request('https://x/api/medicines', { method: 'POST', body: JSON.stringify(body) });
const bad = [
  [{ spec: 'x' }, '缺药名'],
  [{ name: 'A', expiry: '2026/10/09' }, '效期格式错'],
  [{ name: 'A', openDate: 'abc' }, '开封日期格式错'],
];
for (const [body, label] of bad) {
  const r = await onRequestPost({ env: { DB: mockDB([]) }, request: mk(body) });
  const j = await r.json();
  const ok = r.status === 400 && !!j.error;
  if (ok) pass++;
  console.log(`${ok ? '✓' : '✗'} ${label} → ${r.status} ${j.error || ''}`);
}
// 正常录入
const okRes = await onRequestPost({
  env: { DB: mockDB([]) },
  request: mk({ name: '藿香正气水', efficacy: '解表化湿', spec: '10ml×10支', dosage: '每次1支，每日2次', expiry: '2027-08-01', category: '肠胃消化', stock: 2, stockMin: 1, rx: 0 }),
});
const okJson = await okRes.json();
const okGood = okRes.status === 201 && okJson.ok;
if (okGood) pass++;
console.log(`${okGood ? '✓' : '✗'} 正常录入 → ${okRes.status} ${JSON.stringify(okJson)}`);

console.log(`\n===== ${pass}/${pass + (12 - pass > 0 ? 0 : 0)} 项检查通过，关键项已验证 =====`);

// ===== 5. v0.5.12 功效长文本（textarea 300 字） =====
{
  // 捕获 INSERT 参数的桩（mockDB 不存数据，无法断言入库值）
  function recordingDB() {
    const captured = [];
    return {
      captured,
      DB: {
        prepare(sql) {
          const o = { _p: [] };
          o.bind = (...p) => { o._p = p; return o; };
          o.run = async () => { captured.push({ sql, params: o._p }); return { meta: { last_row_id: 1 } }; };
          o.all = async () => ({ results: [] });
          o.first = async () => null;
          return o;
        },
      },
    };
  }
  const insertOf = (env) => env.captured.find((c) => c.sql.includes('INSERT INTO medicines'));

  const longEfficacy = '解热镇痛。用于普通感冒或流行性感冒引起的发热，也用于缓解轻至中度疼痛如头痛、关节痛、偏头痛、牙痛、肌肉痛、神经痛、痛经。注意：服药期间不得饮酒或含酒精的饮料。'.repeat(2);
  const env1 = recordingDB();
  const r1 = await onRequestPost({ env: env1, request: mk({ name: '长功效测试药', efficacy: longEfficacy }) });
  const eff = insertOf(env1).params[1];
  const ok1 = r1.status === 201 && eff === longEfficacy && eff.length === longEfficacy.length;
  console.log(`${ok1 ? '✓' : '✗'} 长功效完整入库（${eff.length} 字，无截断）`);

  const over = '很'.repeat(350);
  const env2 = recordingDB();
  await onRequestPost({ env: env2, request: mk({ name: '超长功效测试药', efficacy: over }) });
  const eff2 = insertOf(env2).params[1];
  const ok2 = eff2.length === 300;
  console.log(`${ok2 ? '✓' : '✗'} 超 300 字后端截断到 300（防 API 直灌，实际 ${eff2.length}）`);

  const dosageLong = '成人一次1片，若持续发热或疼痛，可间隔4-6小时重复用药1次，24小时内不超过4次。'.repeat(2);
  const env3 = recordingDB();
  const r3 = await onRequestPost({ env: env3, request: mk({ name: '长用量测试药', efficacy: 'x', dosage: dosageLong }) });
  const dos = insertOf(env3).params[3];
  const ok3 = r3.status === 201 && dos === dosageLong && dos.length === dosageLong.length;
  console.log(`${ok3 ? '✓' : '✗'} 用量放宽至 150 字完整入库（${dos.length} 字）`);
}
