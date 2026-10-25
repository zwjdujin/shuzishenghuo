// ===== v0.5.9 MCP 端点（根路径 /mcp，Streamable HTTP 简化实现：一请求一响应） =====
// 鉴权：Authorization: Bearer szsh_…（同 /api/ext）
// 协议：JSON-RPC 2.0 —— initialize / tools/list / tools/call / ping
// 工具集按令牌 scopes 动态生成；tools/call 内部转发 /api/ext/*（权限校验同源复用）。

import { resolveToken, SCOPE_KEYS } from './api/_tokens.js';

const J = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8' },
});
const rpc = (id, result) => J({ jsonrpc: '2.0', id, result });
const rpcErr = (id, code, message) => J({ jsonrpc: '2.0', id, error: { code, message } }, 200);

const READ_TOOL = {
  ledger: ['list_transactions', '查询账本流水（最近记录：金额/分类/日期）'],
  todos: ['list_todos', '查询待办事项（含完成状态）'],
  calendar: ['list_events', '查询日历日程'],
  habits: ['list_habits', '查询习惯清单与频率目标'],
  medicine: ['list_medicines', '查询家庭药箱（药品/库存/效期）'],
  relations: ['list_contacts', '查询人际关系联系人'],
  memos: ['list_memos', '查询随手记录'],
};
const WRITE_TOOL = {
  todos: { name: 'add_todo', desc: '新增一条待办', props: { title: '待办内容', date: 'YYYY-MM-DD 可省略', time: 'HH:MM 可省略', priority: 'high|mid|low 可省略' }, res: 'todos' },
  memos: { name: 'add_memo', desc: '新增一条随手记', props: { content: '内容' }, res: 'memos' },
  ledger: { name: 'add_transaction', desc: '记一笔账', props: { flow: 'income|expense', amount: '金额', category: '分类', date: 'YYYY-MM-DD 可省略', note: '备注 可省略' }, res: 'transactions' },
};

function toolsOf(scopes) {
  const tools = [];
  for (const [key] of SCOPE_KEYS) {
    const s = scopes[key];
    if (!s) continue;
    if (s.read && READ_TOOL[key]) {
      const [name, desc] = READ_TOOL[key];
      tools.push({
        name, description: desc,
        inputSchema: { type: 'object', properties: { limit: { type: 'number', description: '返回条数，默认 50' } } },
      });
    }
    if (s.write && WRITE_TOOL[key]) {
      const w = WRITE_TOOL[key];
      tools.push({
        name: w.name, description: w.desc,
        inputSchema: {
          type: 'object',
          properties: Object.fromEntries(Object.entries(w.props).map(([k, v]) => [k, { type: 'string', description: v }])),
          required: [Object.keys(w.props)[0]],
        },
      });
    }
  }
  return tools;
}

async function callTool(env, request, token, name, args) {
  for (const [key] of SCOPE_KEYS) {
    const s = token.scopes[key];
    if (s && s.read && READ_TOOL[key] && READ_TOOL[key][0] === name) {
      return proxyExt(request, keyResource[key], args);
    }
    if (s && s.write && WRITE_TOOL[key] && WRITE_TOOL[key].name === name) {
      return proxyExt(request, WRITE_TOOL[key].res, args, true);
    }
  }
  return { error: '未知工具或无权限：' + name };
}
const keyResource = { ledger: 'transactions', todos: 'todos', calendar: 'events', habits: 'habits', medicine: 'medicines', relations: 'contacts', memos: 'memos' };

/** 以同一 Bearer 头转发到 /api/ext（scope 校验复用，不重复实现） */
async function proxyExt(request, resource, args, write = false) {
  const url = new URL('/api/ext/' + resource, request.url);
  if (!write && args && args.limit) url.searchParams.set('limit', String(Math.min(Number(args.limit) || 50, 200)));
  const res = await fetch(url, {
    method: write ? 'POST' : 'GET',
    headers: {
      authorization: request.headers.get('authorization') || '',
      ...(write ? { 'Content-Type': 'application/json' } : {}),
    },
    body: write ? JSON.stringify(args || {}) : undefined,
  });
  const data = await res.json().catch(() => ({ error: '响应解析失败' }));
  return data;
}

export async function onRequestGet() {
  return J({
    name: 'shuzishenghuo-mcp',
    transport: 'streamable-http（简化：每请求一响应）',
    auth: 'Authorization: Bearer <令牌>（在 个人中心 → 智能管理 → API/MCP 生成）',
    methods: ['initialize', 'tools/list', 'tools/call', 'ping'],
  });
}

export async function onRequestPost(context) {
  const { env, request } = context;
  let body;
  try { body = await request.json(); } catch (_) { return rpcErr(null, -32700, 'JSON 解析失败'); }
  const id = body.id !== undefined ? body.id : null;
  const method = String(body.method || '');

  // 客户端通知（initialized 等）：规范要求空响应
  if (id === null) return new Response(null, { status: 202 });

  const token = await resolveToken(env, request);
  if (!token) return rpcErr(id, -32001, '令牌无效或缺失（Authorization: Bearer szsh_…）');

  if (method === 'initialize') {
    return rpc(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'shuzishenghuo', title: '数字生活', version: '0.5.9' },
    });
  }
  if (method === 'ping') return rpc(id, {});
  if (method === 'tools/list') {
    const tools = toolsOf(token.scopes);
    return rpc(id, { tools });
  }
  if (method === 'tools/call') {
    const name = body.params && body.params.name;
    const args = (body.params && body.params.arguments) || {};
    if (!name) return rpcErr(id, -32602, '缺少 params.name');
    const data = await callTool(env, request, token, name, args);
    const isError = !!(data && data.error);
    return rpc(id, {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      isError,
    });
  }
  return rpcErr(id, -32601, '未知方法：' + method);
}
