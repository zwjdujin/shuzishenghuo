// v0.5.11 经期扩展端到端：新字段存取 / 校验 / 迁移平移 / 旧口径回归
const BASE = 'http://127.0.0.1:8799';
let cookie = '';
const ok = [], fail = [];
const check = (n, c, e = '') => (c ? ok : fail).push((c ? '✓ ' : '✗ ') + n + (e ? ' → ' + e : ''));
async function api(path, opts = {}) {
  return fetch(BASE + path, { credentials: 'include', ...opts, headers: { cookie, ...(opts.headers || {}) } });
}
const JH = { 'Content-Type': 'application/json' };
async function j(r) { return r.json().catch(() => ({})); }

// 登录 + 清库
{
  const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: JH, body: JSON.stringify({ user: 'admin', pass: 'test-pass-123' }) });
  cookie = (r.headers.get('set-cookie') || '').split(';')[0];
  check('登录', r.ok);
  const cur = await j(await api('/api/period'));
  for (const l of cur.logs || []) await api('/api/period?id=' + l.id, { method: 'DELETE' });
}

// 1. 新字段全量 POST
{
  const r = await api('/api/period', { method: 'POST', headers: JH, body: JSON.stringify({
    start_date: '2026-08-01', end_date: '2026-08-05', flow: 4,
    blood_color: 3, blood_texture: 1, dysmenorrhea: 1,
    pain_types: ['胀痛', '坠痛', '不存在痛'], symptoms: ['头痛', '失眠', '编造症状'], symptom_other: '腰酸,乏力', note: '全量',
  }) });
  check('全量 POST 201', r.status === 201, r.status);
  const d = await j(await api('/api/period'));
  const l = d.logs[0];
  check('经量/血色/血质 存取', l.flow === 4 && l.bloodColor === 3 && l.bloodTexture === 1);
  check('痛经 + 分型（非法值被滤）', l.dysmenorrhea === true && l.painTypes === '胀痛,坠痛', l.painTypes);
  check('症状（非法值被滤）', l.symptoms === '头痛,失眠', l.symptoms);
  check('其他症状自行填写（去逗号）', l.symptomOther === '腰酸乏力', l.symptomOther);
}

// 2. 校验
{
  let r = await api('/api/period', { method: 'POST', headers: JH, body: JSON.stringify({ start_date: '2026-09-01', flow: 6 }) });
  check('经量越界 400', r.status === 400);
  r = await api('/api/period', { method: 'POST', headers: JH, body: JSON.stringify({ start_date: '2026-09-01', flow: 3, blood_color: 9 }) });
  check('血色越界 → 按未记录存', r.status === 201);
  const d = await j(await api('/api/period'));
  check('blood_color=null', d.logs[0].bloodColor === null);
  r = await api('/api/period', { method: 'POST', headers: JH, body: JSON.stringify({ start_date: '2026-09-02', dysmenorrhea: 0, pain_types: ['胀痛'] }) });
  const d2 = await j(await api('/api/period'));
  const l2 = d2.logs.find((x) => x.startDate === '2026-09-02');
  check('未勾痛经 → 分型清空', l2 && l2.dysmenorrhea === false && l2.painTypes === '');
}

// 3. PUT 局部更新（不动未传字段）
{
  const d = await j(await api('/api/period'));
  const row = d.logs.find((l) => l.startDate === '2026-08-01');
  const r = await api('/api/period', { method: 'PUT', headers: JH, body: JSON.stringify({ id: row.id, flow: 5, symptom_other: '起疹子了' }) });
  const d2 = await j(await api('/api/period'));
  const l = d2.logs.find((x) => x.id === row.id);
  check('PUT 局部：flow=5、其他症状更新', r.ok && l.flow === 5 && l.symptomOther === '起疹子了');
  check('PUT 局部：血色/分型保留', l.bloodColor === 3 && l.painTypes === '胀痛,坠痛');
}

// 4. 默认值 POST（只给日期）
{
  const r = await api('/api/period', { method: 'POST', headers: JH, body: JSON.stringify({ start_date: '2026-10-01' }) });
  const d = await j(await api('/api/period'));
  const l = d.logs.find((x) => x.startDate === '2026-10-01');
  check('默认：经量正常/血色血质未记录/无痛经', r.status === 201 && l.flow === 3 && l.bloodColor === null && l.dysmenorrhea === false);
}

// 5. 旧口径回归：同日 409 / 结束早于开始 400 / 自动补结束 / 隐私开关
{
  let r = await api('/api/period', { method: 'POST', headers: JH, body: JSON.stringify({ start_date: '2026-10-01' }) });
  check('同日重复 409', r.status === 409);
  r = await api('/api/period', { method: 'POST', headers: JH, body: JSON.stringify({ start_date: '2026-10-20', end_date: '2026-10-01' }) });
  check('结束早于开始 400', r.status === 400);
  const d = await j(await api('/api/period'));
  const row = d.logs.find((l) => l.startDate === '2026-10-01');
  await api('/api/period', { method: 'PUT', headers: JH, body: JSON.stringify({ id: row.id, end_date: '' }) }); // 重开
  await api('/api/period', { method: 'POST', headers: JH, body: JSON.stringify({ start_date: '2026-10-29', flow: 2 }) });
  const d2 = await j(await api('/api/period'));
  check('自动补结束（10-01 → 10-28）', d2.logs.find((l) => l.startDate === '2026-10-01').endDate === '2026-10-28');
  r = await api('/api/period', { method: 'PUT', headers: JH, body: JSON.stringify({ visible: false }) });
  const ev = await j(await api('/api/events?from=2026-10-01&to=2026-10-31'));
  check('隐私关闭 → events 无经期', r.ok && ev.periods.length === 0);
  await api('/api/period', { method: 'PUT', headers: JH, body: JSON.stringify({ visible: true }) });
}

// 6. 备份中文名
{
  const d = await j(await api('/api/data/stats'));
  const t = (d.tables || []).find((x) => x.name === 'period_logs');
  check('period_logs 备份中文名', !!t && t.label === '日历 · 经期记录');
}

// 7. 清理
{
  const d = await j(await api('/api/period'));
  for (const l of d.logs || []) await api('/api/period?id=' + l.id, { method: 'DELETE' });
  const fin = await j(await api('/api/period'));
  check('清理完成', fin.logs.length === 0);
}

console.log(ok.join('\n'));
if (fail.length) { console.log('\n' + fail.join('\n')); process.exit(1); }
console.log('\n✅ ' + ok.length + ' 项全部通过');
