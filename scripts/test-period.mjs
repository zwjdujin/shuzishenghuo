// v0.5.10 经期记录端到端测试：CRUD / 统计预测 / 隐私开关 / 自动补结束 / events 叠加
const BASE = 'http://127.0.0.1:8799';
let cookie = '';
const ok = [], fail = [];
const check = (n, c, e = '') => (c ? ok : fail).push((c ? '✓ ' : '✗ ') + n + (e ? ' → ' + e : ''));
async function api(path, opts = {}) {
  return fetch(BASE + path, { credentials: 'include', ...opts, headers: { cookie, ...(opts.headers || {}) } });
}
const JH = { 'Content-Type': 'application/json' };
async function j(r) { return r.json().catch(() => ({})); }

// 登录 + 清库起点
{
  const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: JH, body: JSON.stringify({ user: 'admin', pass: 'test-pass-123' }) });
  cookie = (r.headers.get('set-cookie') || '').split(';')[0];
  check('登录', r.ok);
  const cur = await j(await api('/api/period'));
  for (const l of cur.logs || []) await api('/api/period?id=' + l.id, { method: 'DELETE' });
}

// 1. 三次经期 → 周期 28/30 → 平均 29
{
  for (const [s, e, f] of [['2026-07-01', '2026-07-05', 2], ['2026-07-29', '2026-08-02', 3], ['2026-08-28', '2026-09-01', 1]]) {
    const r = await api('/api/period', { method: 'POST', headers: JH, body: JSON.stringify({ start_date: s, end_date: e, flow: f }) });
    if (!r.ok) check('录入 ' + s, false, r.status);
  }
  const d = await j(await api('/api/period'));
  check('3 条记录（新的在前）', d.logs.length === 3 && d.logs[0].startDate === '2026-08-28');
  check('平均周期 29 天', d.stats.cycleAvg === 29, 'cycleAvg=' + d.stats.cycleAvg);
  check('下次预计 = 09-26', d.stats.nextPredicted === '2026-09-26', d.stats.nextPredicted);
  check('无进行中', d.stats.ongoingId === null);
  check('经期天数平均 5 天', d.stats.periodAvg === 5, 'periodAvg=' + d.stats.periodAvg);
}

// 2. 今天来了（先把上一条改回"进行中"，验证自动补结束）
{
  const cur = await j(await api('/api/period'));
  const last = cur.logs.find((l) => l.startDate === '2026-08-28');
  const ro = await api('/api/period', { method: 'PUT', headers: JH, body: JSON.stringify({ id: last.id, end_date: '' }) });
  check('重开上一条（end_date 置空）', ro.ok);
  const r = await api('/api/period', { method: 'POST', headers: JH, body: JSON.stringify({ start_date: '2026-10-25', flow: 2 }) });
  check('今天来了 201', r.status === 201);
  const d = await j(await api('/api/period'));
  const prev = d.logs.find((l) => l.startDate === '2026-08-28');
  check('上一条自动补结束 10-24', prev && prev.endDate === '2026-10-24', prev && prev.endDate);
  check('进行中 周期第 1 天', d.stats.cycleDay === 1 && d.stats.ongoingId !== null);
  const r2 = await api('/api/period', { method: 'POST', headers: JH, body: JSON.stringify({ start_date: '2026-10-25' }) });
  check('同日重复 409', r2.status === 409);
  const r3 = await api('/api/period', { method: 'POST', headers: JH, body: JSON.stringify({ start_date: '2026-09-01', end_date: '2026-08-01' }) });
  check('结束早于开始 400', r3.status === 400);
}

// 3. 编辑（保留 4 条）
{
  const d = await j(await api('/api/period'));
  const row = d.logs.find((l) => l.startDate === '2026-07-01');
  const r = await api('/api/period', { method: 'PUT', headers: JH, body: JSON.stringify({ id: row.id, end_date: '2026-07-06', flow: 3, note: '测试备注' }) });
  const d2 = await j(await api('/api/period'));
  const row2 = d2.logs.find((l) => l.id === row.id);
  check('编辑保存（结束/量/备注）', r.ok && row2.endDate === '2026-07-06' && row2.flow === 3 && row2.note === '测试备注');
}

// 4. events 叠加 + 隐私开关
{
  let ev = await j(await api('/api/events?from=2026-10-01&to=2026-10-31'));
  check('events 附带经期区间（进行中截至今天）', Array.isArray(ev.periods) && ev.periods.some((p) => p.start === '2026-10-25'), JSON.stringify(ev.periods));
  // starts: 07-01/07-29/08-28/10-25 → diffs 28,30,58 → avg 39 → 10-25+39 = 12-03
  check('events 附带预测日 = 12-03', ev.prediction === '2026-12-03', ev.prediction);
  check('periodVisible=true', ev.periodVisible === true);
  const ev2 = await j(await api('/api/events?from=2026-07-01&to=2026-07-31'));
  check('周历/月历范围过滤（7月命中 07-01 与 07-29 两条）', ev2.periods.length === 2 && ev2.periods[0].start === '2026-07-01' && ev2.periods[0].end === '2026-07-06' && ev2.periods[1].start === '2026-07-29', JSON.stringify(ev2.periods));
  // 关闭
  const r = await api('/api/period', { method: 'PUT', headers: JH, body: JSON.stringify({ visible: false }) });
  check('隐私开关 PUT', r.ok && (await j(r)).visible === false);
  ev = await j(await api('/api/events?from=2026-10-01&to=2026-10-31'));
  check('关闭后 events 无经期数据', ev.periods.length === 0 && ev.prediction === null && ev.periodVisible === false);
  const pd = await j(await api('/api/period'));
  check('经期页仍可见记录', pd.logs.length === 4 && pd.visible === false);
  // 再开
  await api('/api/period', { method: 'PUT', headers: JH, body: JSON.stringify({ visible: true }) });
}

// 5. 删除一条
{
  const d = await j(await api('/api/period'));
  const row = d.logs.find((l) => l.startDate === '2026-07-01');
  const r = await api('/api/period?id=' + row.id, { method: 'DELETE' });
  const d3 = await j(await api('/api/period'));
  check('删除后剩 3 条', r.ok && d3.logs.length === 3);
}

// 5. 备份统计中文名
{
  const d = await j(await api('/api/data/stats'));
  const t = (d.tables || []).find((x) => x.name === 'period_logs');
  check('period_logs 进备份且中文名', !!t && t.label === '日历 · 经期记录', t && t.label);
}

// 6. 清理演示数据（回到空）
{
  const d = await j(await api('/api/period'));
  for (const l of d.logs || []) await api('/api/period?id=' + l.id, { method: 'DELETE' });
  const fin = await j(await api('/api/period'));
  check('清理完成', fin.logs.length === 0);
}

console.log(ok.join('\n'));
if (fail.length) { console.log('\n' + fail.join('\n')); process.exit(1); }
console.log('\n✅ ' + ok.length + ' 项全部通过');
