// 更新 _ui_pf19.mjs：种子数据 + 输入计数排除 file/hidden
import fs from 'node:fs';
const FILE = 'scripts/_ui_pf19.mjs';
let t = fs.readFileSync(FILE, 'utf8');

const seedBlock = [
  '// 种子：确保 Tony Ma(id=8) 有联系方式与身体数据',
  '{',
  "  const lr = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: 'admin', pass: 'test-pass-123' }) });",
  "  const cookie = (lr.headers.get('set-cookie') || '').split(';')[0];",
  "  const H = { 'Content-Type': 'application/json', cookie };",
  "  const d = await (await fetch(BASE + '/api/profile/detail?id=8', { headers: { cookie } })).json();",
  "  if (!(d.methods || {}).phones || !d.methods.phones.length) {",
  "    await fetch(BASE + '/api/profile/contacts', { method: 'POST', headers: H, body: JSON.stringify({ person_id: 8, kind: 'phones', value: '13812345678', label: '个人' }) });",
  '  }',
  "  const bd = await (await fetch(BASE + '/api/profile/body?id=8', { headers: { cookie } })).json();",
  '  if (!(bd.records || []).length) {',
  "    await fetch(BASE + '/api/profile/body', { method: 'POST', headers: H, body: JSON.stringify({ person_id: 8, kind: 'height', value: 176, date: '2026-04-21' }) });",
  "    await fetch(BASE + '/api/profile/body', { method: 'POST', headers: H, body: JSON.stringify({ person_id: 8, kind: 'weight', value: 67.2, date: '2026-10-20' }) });",
  '  }',
  '  if (!(bd.sizes || {}).clothing) {',
  "    await fetch(BASE + '/api/profile/body', { method: 'PUT', headers: H, body: JSON.stringify({ id: 8, sizes: { clothing: 'XL', shoe: '43' } }) });",
  '  }',
  '}',
  '',
  '// ---- 桌面：查看模式 ----',
].join('\n');
t = t.replace('// ---- 桌面：查看模式 ----', seedBlock);

t = t.split("scope.querySelectorAll('input:not([type=hidden]), select, textarea')").join("scope.querySelectorAll('input:not([type=hidden]):not([hidden]):not(#pfFileInput), select:not([hidden]), textarea')");
t = t.split("document.getElementById('relProfileView').querySelectorAll('input:not([type=hidden]), select, textarea')").join("document.getElementById('relProfileView').querySelectorAll('input:not([type=hidden]):not([hidden]):not(#pfFileInput), select:not([hidden]), textarea')");

fs.writeFileSync(FILE, t);
console.log('脚本更新完成 | 种子:', t.includes('确保 Tony Ma'), '| 排除:', t.includes(':not(#pfFileInput)'));
