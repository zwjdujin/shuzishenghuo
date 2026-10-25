// v0.5.9 智能管理端到端测试：AI 模型配置 / 令牌 / /api/ext 读写 / MCP 协议 / 表名中文化
const BASE = 'http://127.0.0.1:8799';
let cookie = '';
const ok = [], fail = [];
const check = (n, c, e = '') => (c ? ok : fail).push((c ? '✓ ' : '✗ ') + n + (e ? ' → ' + e : ''));
async function api(path, opts = {}) {
  return fetch(BASE + path, { credentials: 'include', ...opts, headers: { cookie, ...(opts.headers || {}) } });
}
const JH = { 'Content-Type': 'application/json' };
async function j(r) { return r.json().catch(() => ({})); }

// 登录
{
  const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: JH, body: JSON.stringify({ user: 'admin', pass: 'test-pass-123' }) });
  cookie = (r.headers.get('set-cookie') || '').split(';')[0];
  check('登录', r.ok);
}

// ===== 1. AI 模型配置 =====
{
  await api('/api/settings/ai-models', { method: 'PUT', headers: JH, body: JSON.stringify({ models: [] }) }); // 清空起点
  const r1 = await api('/api/settings/ai-models', { method: 'PUT', headers: JH, body: JSON.stringify({ models: [
    { id: 'm_test1', name: '智谱 GLM', baseUrl: 'https://api.bigmodel.cn/api/paas/v4', apiKey: 'sk-test-1234567890abcd', model: 'glm-4-flash', isDefault: true },
    { id: 'm_test2', name: '测试模型B', baseUrl: 'https://b.example.com/v4', apiKey: 'sk-bbbb-9999-wxyz', model: 'm-b', isDefault: true }, // 两个都勾默认
  ] }) });
  check('保存 2 个模型', r1.ok, r1.status);
  const g = await j(await api('/api/settings/ai-models'));
  check('GET 返回打码 Key（不含明文）', g.models.length === 2 && g.models.every((m) => !JSON.stringify(m).includes('sk-test-1234') && m.apiKeyMasked.includes('••••')), JSON.stringify(g.models.map((m) => m.apiKeyMasked)));
  check('双默认归一（只留第一个）', g.models.filter((m) => m.isDefault).length === 1 && g.models[0].isDefault);
  // 编辑：不改 Key（传掩码）
  const masked = g.models[0].apiKeyMasked;
  const r2 = await api('/api/settings/ai-models', { method: 'PUT', headers: JH, body: JSON.stringify({ models: [
    { ...g.models[0], name: '智谱 GLM 改', apiKey: masked },
    { ...g.models[1] },
  ] }) });
  const g2 = await j(await api('/api/settings/ai-models'));
  check('编辑传掩码 → Key 沿用（不再要求填 Key）', r2.ok && g2.models[0].name === '智谱 GLM 改', g2.models[0] && g2.models[0].name);
  // 校验：非法 baseUrl
  const r3 = await api('/api/settings/ai-models', { method: 'PUT', headers: JH, body: JSON.stringify({ models: [{ id: 'x', name: 'x', baseUrl: 'ftp://bad', apiKey: 'k', model: 'm' }] }) });
  check('非法接口地址拦截', r3.status === 400);
  // ai/parse 走库内默认模型（配置是假 Key → 会真实请求外部失败 → 返回 error 而非 notConfigured）
  const p = await api('/api/ai/parse', { method: 'POST', headers: JH, body: JSON.stringify({ text: '测试' }) });
  const pd = await j(p);
  check('ai/parse 使用库内配置（非 notConfigured）', pd.notConfigured === undefined, JSON.stringify(pd).slice(0, 60));
  // 清理：回到空配置（避免影响后续 notConfigured 假设）
  await api('/api/settings/ai-models', { method: 'PUT', headers: JH, body: JSON.stringify({ models: [] }) });
}

// ===== 2. 令牌 =====
let TOKEN = '';
{
  const r = await api('/api/settings/tokens', { method: 'POST', headers: JH, body: JSON.stringify({
    name: '测试令牌',
    scopes: { ledger: { read: true, write: false }, todos: { read: true, write: true }, fake: { read: true } },
  }) });
  const d = await j(r);
  TOKEN = d.token || '';
  check('生成令牌（szsh_ 前缀 64hex）', r.status === 201 && /^szsh_[0-9a-f]{64}$/.test(TOKEN));
  const g = await j(await api('/api/settings/tokens'));
  check('列表不含哈希/明文，只含前缀', g.tokens.length >= 1 && !JSON.stringify(g).includes(TOKEN) && g.tokens[0].prefix.startsWith('szsh_'));
  check('非法 scope 键被清除（fake 不入库）', !g.tokens[0].scopes.fake && !!g.tokens[0].scopes.ledger);
  const r2 = await api('/api/settings/tokens', { method: 'POST', headers: JH, body: JSON.stringify({ name: '空权限', scopes: {} }) });
  check('空权限拦截', r2.status === 400);
}

// ===== 3. /api/ext 读写与权限 =====
const BH = { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' };
{
  let r = await fetch(BASE + '/api/ext/transactions?limit=5', { headers: { Authorization: 'Bearer ' + TOKEN } });
  let d = await j(r);
  check('ext 读账本（有读权限）', r.status === 200 && Array.isArray(d.list));
  r = await fetch(BASE + '/api/ext/todos', { headers: { Authorization: 'Bearer ' + TOKEN } });
  check('ext 读待办', r.status === 200);
  r = await fetch(BASE + '/api/ext/contacts', { headers: { Authorization: 'Bearer ' + TOKEN } });
  d = await j(r);
  check('ext 读人际（未授权 403 且中文提示）', r.status === 403 && /人际关系.*读/.test(d.error), d.error);
  r = await fetch(BASE + '/api/ext/todos', { method: 'POST', headers: BH, body: JSON.stringify({ title: 'MCP 写入测试' + Date.now().toString(36) }) });
  d = await j(r);
  check('ext 写待办（有写权限）201', r.status === 201 && d.ok);
  r = await fetch(BASE + '/api/ext/transactions', { method: 'POST', headers: BH, body: JSON.stringify({ flow: 'expense', amount: 12.5, category: '餐饮' }) });
  check('ext 写账本（仅读权限 403）', r.status === 403);
  r = await fetch(BASE + '/api/ext/transactions', { headers: { Authorization: 'Bearer szsh_' + '0'.repeat(64) } });
  check('伪造令牌 401', r.status === 401);
  r = await fetch(BASE + '/api/ext/unknown', { headers: { Authorization: 'Bearer ' + TOKEN } });
  check('未知资源 404', r.status === 404);

  // 全资源读取（另建一个全读令牌，覆盖 7 个资源 SQL 的列名正确性）
  const allTok = await j(await api('/api/settings/tokens', { method: 'POST', headers: JH, body: JSON.stringify({
    name: '全读校验', scopes: Object.fromEntries(['ledger', 'todos', 'calendar', 'habits', 'medicine', 'relations', 'memos'].map((k) => [k, { read: true, write: false }])),
  }) }));
  for (const res of ['transactions', 'todos', 'events', 'habits', 'medicines', 'contacts', 'memos']) {
    const rr = await fetch(BASE + '/api/ext/' + res + '?limit=3', { headers: { Authorization: 'Bearer ' + allTok.token } });
    const dd = await j(rr);
    check(`ext 读 ${res}（SQL 列名正确）`, rr.status === 200 && Array.isArray(dd.list), rr.status === 200 ? '' : JSON.stringify(dd).slice(0, 80));
  }
  await api('/api/settings/tokens?id=' + allTok.id, { method: 'DELETE' });
}

// ===== 4. MCP 协议 =====
{
  const rpc = (method, params, id = 1) => fetch(BASE + '/mcp', { method: 'POST', headers: BH, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) });
  let r = await rpc('initialize');
  let d = await j(r);
  check('MCP initialize', d.result && d.result.serverInfo && d.result.serverInfo.name === 'shuzishenghuo');
  r = await rpc('tools/list');
  d = await j(r);
  const names = (d.result && d.result.tools || []).map((t) => t.name);
  check('tools/list 按权限生成（账本读/待办读写）', names.includes('list_transactions') && names.includes('list_todos') && names.includes('add_todo') && !names.includes('add_transaction') && !names.includes('list_contacts'), names.join(','));
  r = await rpc('tools/call', { name: 'list_todos', arguments: { limit: 3 } });
  d = await j(r);
  const txt = d.result && d.result.content && d.result.content[0] && d.result.content[0].text || '';
  check('tools/call list_todos 返回数据', !d.result.isError && txt.includes('"list"'));
  r = await rpc('tools/call', { name: 'add_todo', arguments: { title: 'MCP 新增' + Date.now().toString(36), priority: 'high' } });
  d = await j(r);
  check('tools/call add_todo 写入', d.result && !d.result.isError && (JSON.parse(d.result.content[0].text).ok === true));
  r = await rpc('tools/call', { name: 'list_contacts' });
  d = await j(r);
  check('tools/call 未授权工具 → isError', d.result && d.result.isError === true);
  r = await fetch(BASE + '/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) });
  const noAuth = await j(r);
  check('MCP 无令牌 -32001', noAuth.error && noAuth.error.code === -32001);
  r = await fetch(BASE + '/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) });
  check('MCP 通知 202 空', r.status === 202);
  r = await fetch(BASE + '/mcp');
  d = await j(r);
  check('GET /mcp 说明', d.name === 'shuzishenghuo-mcp');
}

// ===== 5. 表名中文化（数据备份页） =====
{
  const d = await j(await api('/api/data/stats'));
  const english = (d.tables || []).filter((t) => /^[_a-z0-9]+$/.test(t.label));
  check('备份统计无英文表名', english.length === 0, english.map((t) => t.label).join(','));
  check('新表都有中文名（memos/budgets/recurring…）', ['memos', 'budgets', 'recurring', 'body_records', 'contact_files'].every((n) => (d.tables || []).some((t) => t.name === n && !/^[_a-z0-9]+$/.test(t.label))));
  check('api_tokens 不参与备份', !(d.tables || []).some((t) => t.name === 'api_tokens'));
}

// ===== 6. 清理：吊销测试令牌 =====
{
  const g = await j(await api('/api/settings/tokens'));
  for (const t of g.tokens.filter((x) => x.name === '测试令牌')) {
    await api('/api/settings/tokens?id=' + t.id, { method: 'DELETE' });
  }
  const r = await fetch(BASE + '/api/ext/todos', { headers: { Authorization: 'Bearer ' + TOKEN } });
  check('吊销后令牌立即失效 401', r.status === 401);
}

console.log(ok.join('\n'));
if (fail.length) { console.log('\n' + fail.join('\n')); process.exit(1); }
console.log('\n✅ ' + ok.length + ' 项全部通过');
