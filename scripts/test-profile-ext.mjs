// v0.6.0 档案扩展接口验证：QQ/微信 · 尺码 · 身高体重 · R2 附件 · 级联删除
// 流程：新建专属联系人 → 全功能验证 → 删除联系人（顺带验证级联清理 + R2）
const BASE = 'http://127.0.0.1:8799';
let cookie = '';
const ok = [], fail = [];
const check = (n, c, e = '') => (c ? ok : fail).push((c ? '✓ ' : '✗ ') + n + (e ? ' → ' + e : ''));
// 注意：headers 必须放最后合并，否则 opts.headers 会覆盖掉 cookie
async function api(path, opts = {}) {
  return fetch(BASE + path, { credentials: 'include', ...opts, headers: { cookie, ...(opts.headers || {}) } });
}
async function j(res) { return res.json().catch(() => ({})); }
const JH = { 'Content-Type': 'application/json' };

// 登录
{
  const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: JH, body: JSON.stringify({ user: 'admin', pass: 'test-pass-123' }) });
  cookie = (r.headers.get('set-cookie') || '').split(';')[0];
  check('登录', r.ok, r.status);
}

// 建一个专属测试联系人（带电话，供附件目录名使用）
const NAME = '档案测试' + Date.now().toString(36).slice(-4);
let PID;
{
  const r = await api('/api/profile/detail', { method: 'POST', headers: JH, body: JSON.stringify({ firstName: NAME, gender: '女', methods: [{ kind: 'phones', value: '13800001234' }] }) });
  const d = await j(r);
  PID = d.id;
  check('创建测试联系人', r.status === 201 && !!PID, NAME + '#' + PID);
}

// 1. QQ / 微信
{
  const r1 = await api('/api/profile/contacts', { method: 'POST', headers: JH, body: JSON.stringify({ person_id: PID, kind: 'qq', value: '123456789', label: '个人' }) });
  const r2 = await api('/api/profile/contacts', { method: 'POST', headers: JH, body: JSON.stringify({ person_id: PID, kind: 'wechat', value: 'wxid_demo' }) });
  const d = await j(await api('/api/profile/detail?id=' + PID));
  check('QQ 存取', r1.ok && (d.methods.qq || []).some((x) => x.value === '123456789'));
  check('微信存取', r2.ok && (d.methods.wechat || []).some((x) => x.value === 'wxid_demo'));
  const dup = await api('/api/profile/contacts', { method: 'POST', headers: JH, body: JSON.stringify({ person_id: PID, kind: 'qq', value: '123456789' }) });
  check('QQ 重复拦截 409', dup.status === 409, dup.status);
}

// 2. 尺码
{
  const r = await api('/api/profile/body', { method: 'PUT', headers: JH, body: JSON.stringify({ id: PID, sizes: { clothing: 'XL', shoe: '42', ring: '17号', bracelet: '' } }) });
  const d = await j(await api('/api/profile/body?id=' + PID));
  check('尺码 PUT/GET', r.ok && d.sizes && d.sizes.clothing === 'XL' && d.sizes.shoe === '42' && d.sizes.ring === '17号', JSON.stringify(d.sizes));
  check('空串=清除（bracelet）', d.sizes && d.sizes.bracelet === '');
  const dd = await j(await api('/api/profile/detail?id=' + PID));
  check('detail.base.sizes 同步', dd.base && dd.base.sizes && dd.base.sizes.shoe === '42');
}

// 3. 身高
{
  for (const [date, v] of [['2024-06-01', 120], ['2025-06-01', 128], ['2026-06-01', 133]]) {
    const r = await api('/api/profile/body', { method: 'POST', headers: JH, body: JSON.stringify({ person_id: PID, kind: 'height', value: v, date }) });
    if (!r.ok) check('身高写入 ' + date, false, r.status);
  }
  const d = await j(await api('/api/profile/body?id=' + PID));
  const hs = (d.records || []).filter((r) => r.kind === 'height');
  check('身高 3 条且按日期升序', hs.length === 3 && hs[0].date === '2024-06-01' && hs[2].date === '2026-06-01', hs.map((h) => h.date).join(','));
  const bad = await api('/api/profile/body', { method: 'POST', headers: JH, body: JSON.stringify({ person_id: PID, kind: 'height', value: 300 }) });
  check('身高越界拦截 400', bad.status === 400, bad.status);
  await api('/api/profile/body', { method: 'POST', headers: JH, body: JSON.stringify({ person_id: PID, kind: 'height', value: 134, date: '2026-06-01' }) });
  const d2 = await j(await api('/api/profile/body?id=' + PID));
  const h2 = (d2.records || []).filter((r) => r.kind === 'height');
  check('同日重录覆盖（仍 3 条值 134）', h2.length === 3 && h2.find((x) => x.date === '2026-06-01').value === 134);
}

// 4. 体重
{
  const pts = [['2026-05-01', 52], ['2026-05-15', 51.2], ['2026-06-01', 53], ['2026-07-01', 52.4], ['2026-08-01', 51.8], ['2026-10-01', 52.9]];
  for (const [date, v] of pts) {
    const r = await api('/api/profile/body', { method: 'POST', headers: JH, body: JSON.stringify({ person_id: PID, kind: 'weight', value: v, date }) });
    if (!r.ok) check('体重写入 ' + date, false, r.status);
  }
  const d = await j(await api('/api/profile/body?id=' + PID));
  const ws = (d.records || []).filter((r) => r.kind === 'weight');
  check('体重 6 条', ws.length === 6, ws.length);
  const del = await api('/api/profile/body?rid=' + ws[0].id, { method: 'DELETE' });
  const d3 = await j(await api('/api/profile/body?id=' + PID));
  check('删除一条体重（剩 5）', del.ok && (d3.records || []).filter((r) => r.kind === 'weight').length === 5);
}

// 5. 附件：上传（PNG + TXT）→ 列表 → 下载 → 删除
{
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63fcffff3f0300050201f4a2f5cb0000000049454e44ae426082', 'hex');
  const txt = Buffer.from('数字生活 v0.6.0 附件测试', 'utf8');
  const fd = new FormData();
  fd.append('id', String(PID));
  fd.append('file', new Blob([png], { type: 'image/png' }), '体检报告图.png');
  fd.append('file', new Blob([txt], { type: 'text/plain' }), '备注.txt');
  const up = await api('/api/profile/files', { method: 'POST', body: fd });
  const ud = await j(up);
  check('上传 2 个文件', up.status === 201 && ud.saved && ud.saved.length === 2, JSON.stringify(ud).slice(0, 140));

  const lst = await j(await api('/api/profile/files?id=' + PID));
  check('列表 2 条', (lst.files || []).length === 2);
  check('目录名 = 姓名+手机号', (lst.folder || '') === NAME + '+13800001234', lst.folder);

  const fid = lst.files.find((f) => f.name === '备注.txt').id;
  const dl = await api(`/api/profile/files?id=${PID}&fid=${fid}&dl=1`);
  const body = Buffer.from(await dl.arrayBuffer());
  check('下载内容一致 + attachment', dl.ok && body.toString('utf8') === txt.toString('utf8') && (dl.headers.get('content-disposition') || '').includes('attachment'));
  const imgId = lst.files.find((f) => f.mime === 'image/png').id;
  const iv = await api(`/api/profile/files?id=${PID}&fid=${imgId}`);
  check('PNG 内联预览', iv.ok && iv.headers.get('content-type') === 'image/png' && (iv.headers.get('content-disposition') || '').includes('inline'));

  const del = await api(`/api/profile/files?id=${PID}&fid=${fid}`, { method: 'DELETE' });
  const lst2 = await j(await api('/api/profile/files?id=' + PID));
  check('删除附件（剩 1）', del.ok && lst2.files.length === 1);
  const gone = await api(`/api/profile/files?id=${PID}&fid=${fid}`);
  check('R2 对象已同步删除（404）', gone.status === 404, gone.status);
  const nobody = await api('/api/profile/files?id=999999');
  check('联系人不存在 404', nobody.status === 404, nobody.status);
}

// 6. 级联删除联系人：联系人没了 → body/files 接口随之 404（数据随人清除）
{
  const r = await api(`/api/contacts/${PID}`, { method: 'DELETE' });
  const d = await api('/api/profile/body?id=' + PID);
  const f = await api('/api/profile/files?id=' + PID);
  check('删除联系人 ok', r.ok);
  check('身体数据随档清除（404）', d.status === 404, d.status);
  check('附件随档清除（404）', f.status === 404, f.status);
}

console.log(ok.join('\n'));
if (fail.length) { console.log('\n' + fail.join('\n')); process.exit(1); }
console.log('\n✅ ' + ok.length + ' 项全部通过');
