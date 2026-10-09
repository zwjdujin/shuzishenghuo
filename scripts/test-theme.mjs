// 主题色板自检：直接从 public/js/app.js 中抽取真实代码运行，避免与线上逻辑脱节
import fs from 'fs';

const src = fs.readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
const start = src.indexOf('const CN_COLORS');
const end = src.indexOf('let currentTheme = DEFAULT_THEME;');
if (start < 0 || end < 0) throw new Error('未找到色板代码片段');
const code = src.slice(start, end) + '\n;({ CN_COLORS, THEMES });';
// eslint-disable-next-line no-eval
const { CN_COLORS, THEMES } = eval(code);

function lum(hex) {
  const s = hex.replace('#', '');
  const ch = [0, 2, 4].map((i) => {
    const v = parseInt(s.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
const isHex = (v) => /^#[0-9a-f]{6}$/.test(v);

let bad = 0;
const rows = [];
for (const c of CN_COLORS) {
  const t = THEMES[c.key];
  if (!t) { console.error('缺少主题', c.key); bad++; continue; }
  const d = t.day, n = t.night;
  const checks = [
    ['白字/日主色', ratio('#ffffff', d.main)],
    ['日主色/日卡面', ratio(d.main, d.card)],
    ['日文字/日卡面', ratio(d.ink, d.card)],
    ['白字/夜主色', ratio('#ffffff', n.main)],
    ['夜主色/夜卡面', ratio(n.main, n.card)],
    ['夜文字/夜卡面', ratio(n.ink, n.card)],
  ];
  const allVals = [...Object.values(d), ...Object.values(n)];
  const invalid = allVals.filter((v) => !isHex(v));
  if (invalid.length) { console.error('非法色值', c.key, invalid); bad++; }
  const worst = Math.min(...checks.map((x) => x[1]));
  rows.push({ label: c.label, base: c.base, dayMain: d.main, nightMain: n.main, worst, checks });
}

console.log('主题数：' + rows.length);
for (const r of rows) {
  console.log(
    `${r.label.padEnd(4, '　')} base ${r.base}  日主色 ${r.dayMain}  夜主色 ${r.nightMain}  ` +
    `最低对比 ${r.worst.toFixed(2)}:1  |  ` +
    r.checks.map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' / ')
  );
}
// 合格线：白字/主色 ≥ 3.5（按钮/导航为粗体大字），其余 ≥ 2.6（色块与图标）
for (const r of rows) {
  for (const [k, v] of r.checks) {
    const min = k.includes('白字') ? 3.5 : 2.6;
    if (v < min) { console.error(`✗ ${r.label} 的「${k}」仅 ${v.toFixed(2)}:1（要求 ≥ ${min}）`); bad++; }
  }
}
console.log(bad ? `\n发现 ${bad} 处问题` : '\n全部通过 ✓');
process.exit(bad ? 1 : 0);
