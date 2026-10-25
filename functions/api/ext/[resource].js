import { resolveToken, scopeDenied } from '../_tokens.js';
import { todayStr } from '../../_lib.js';

// ===== v0.5.9 外部数据接口（AI Agent / 脚本用，Bearer Token 鉴权） =====
// GET  /api/ext/{transactions|todos|events|habits|medicines|contacts|memos}[?limit=50]
// POST /api/ext/{todos|memos|transactions}（需对应写权限）
// 资源 → 权限键映射：transactions→ledger、events→calendar、contacts→relations

const J = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8' },
});

const RESOURCE = {
  transactions: { scope: 'ledger', sql: `SELECT id,flow,amount,category,sub_category sub,txn_date date,txn_time time,account,item,note FROM transactions ORDER BY txn_date DESC,id DESC LIMIT ?` },
  todos: { scope: 'todos', sql: `SELECT id,title,todo_date date,todo_time time,list,priority,important,urgent,done FROM todos ORDER BY done,id DESC LIMIT ?` },
  events: { scope: 'calendar', sql: `SELECT id,title,start,end,all_day allDay,calendar,location,note FROM events ORDER BY start DESC,id DESC LIMIT ?` },
  habits: { scope: 'habits', sql: `SELECT id,name,target,unit,freq_type freqType,freq_value freqValue FROM habits ORDER BY id LIMIT ?` },
  medicines: { scope: 'medicine', sql: `SELECT id,name,spec,form,efficacy,category,location,stock,stock_min stockMin,expiry,for_whom forWhom FROM medicines ORDER BY expiry LIMIT ?` },
  contacts: { scope: 'relations', sql: `SELECT id,name,gender,phone,tags,peer_groups groups FROM contacts ORDER BY name LIMIT ?` },
  memos: { scope: 'memos', sql: `SELECT id,content,tags,memo_date date FROM memos ORDER BY id DESC LIMIT ?` },
};

async function handle(context, write) {
  const { env, request } = context;
  const url = new URL(request.url);
  const name = (url.pathname.match(/\/ext\/([a-z]+)$/) || [])[1];
  const def = RESOURCE[name];
  if (!def) return J({ error: '未知资源：' + name + '（可用：' + Object.keys(RESOURCE).join('/') + '）' }, 404);

  const token = await resolveToken(env, request);
  if (!token) return J({ error: '令牌无效或缺失（Authorization: Bearer szsh_…）' }, 401);
  const denied = scopeDenied(token.scopes, def.scope, write);
  if (denied) return denied;

  const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 200);

  if (!write) {
    const rows = (await env.DB.prepare(def.sql).bind(limit).all()).results || [];
    return J({ resource: name, count: rows.length, list: rows });
  }

  // ---- 写入（复用业务表结构做最小校验）----
  let b = {};
  try { b = await request.json(); } catch (_) { return J({ error: '请求体应为 JSON' }, 400); }
  const today = todayStr();

  if (name === 'todos') {
    const title = String(b.title || '').trim().slice(0, 60);
    if (!title) return J({ error: '缺少 title' }, 400);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : today;
    const time = /^\d{2}:\d{2}$/.test(b.time || '') ? b.time : null;
    // 优先级两种口径都收：high/mid/low 或 P1/P2/P3
    const MAP = { high: 'P1', mid: 'P2', low: 'P3' };
    const pr = /^P[1-4]$/.test(b.priority || '') ? b.priority : (MAP[b.priority] || 'P3');
    const res = await env.DB.prepare(
      'INSERT INTO todos(title, todo_date, todo_time, list, priority, remind) VALUES (?,?,?,?,?,1)'
    ).bind(title, date, time, String(b.list || b.category || '生活').slice(0, 20), pr).run();
    return J({ ok: true, id: res.meta.last_row_id }, 201);
  }

  if (name === 'memos') {
    const content = String(b.content || '').trim().slice(0, 500);
    if (!content) return J({ error: '缺少 content' }, 400);
    const tags = (Array.isArray(b.tags) ? b.tags : []).map((t) => String(t).replace(/[#,，]/g, '').trim().slice(0, 10)).filter(Boolean).join(',');
    const res = await env.DB.prepare('INSERT INTO memos(content, tags, memo_date) VALUES (?,?,?)')
      .bind(content, tags, today).run();
    return J({ ok: true, id: res.meta.last_row_id }, 201);
  }

  if (name === 'transactions') {
    const flow = ['income', 'expense'].includes(b.flow) ? b.flow : 'expense';
    const amount = Number(b.amount);
    if (!Number.isFinite(amount) || amount <= 0) return J({ error: 'amount 需为正数' }, 400);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : today;
    const res = await env.DB.prepare(
      'INSERT INTO transactions(flow, amount, category, txn_date, txn_time, account, item, note) VALUES (?,?,?,?,?,?,?,?)'
    ).bind(flow, amount, String(b.category || '其他').slice(0, 20), date,
      /^\d{2}:\d{2}$/.test(b.time || '') ? b.time : null,
      String(b.account || '默认账户').slice(0, 20),
      String(b.item || '').slice(0, 40) || null,
      String(b.note || '').slice(0, 60) || null).run();
    return J({ ok: true, id: res.meta.last_row_id }, 201);
  }

  return J({ error: '该资源暂不支持写入' }, 405);
}

export const onRequestGet = (c) => handle(c, false);
export const onRequestPost = (c) => handle(c, true);
