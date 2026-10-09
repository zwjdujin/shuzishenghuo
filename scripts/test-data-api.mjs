// 本地验证：mock D1 跑「数据处理」后端（统计 / 导出 / 清空），确认保留 sessions 与 app_settings
import { onRequestGet as statsGet } from '../functions/api/data/stats.js';
import { onRequestGet as exportGet } from '../functions/api/data/export.js';
import { onRequestPost as clearPost } from '../functions/api/data/clear.js';

function freshDB() {
  return {
    habits: [{ id: 1, name: '学习' }, { id: 2, name: '锻炼' }],
    habit_logs: [{ id: 1, habit_id: 1, log_date: '2026-10-09' }],
    todos: [{ id: 1, title: '交水费' }],
    transactions: [],
    medicines: [],
    events: [],
    contacts: [{ id: 1, name: '张伟' }],
    contact_promises: [{ id: 1, person_id: 1, title: '回电话' }],
    vocab: [{ id: 1, kind: 'symptom', word: '头痛' }],
    push_subscriptions: [],
    // 应被保留 / 排除的两张表
    sessions: [{ sid: 'abc', user: 'admin' }],
    app_settings: [{ key: 'brand_name', value: '数字生活' }, { key: 'theme', value: 'zhiyin' }],
    // SQLite 内部表，必须被过滤掉
    sqlite_sequence: [{ name: 'todos', seq: 1 }],
  };
}

let DB = freshDB();

function mockDB() {
  return {
    prepare(sql) {
      const s = sql.trim();
      const run = async () => {
        let m = /^DELETE FROM "([^"]+)"$/.exec(s);
        if (m) {
          if (!(m[1] in DB)) throw new Error('no such table: ' + m[1]);
          DB[m[1]] = [];
          return { meta: {} };
        }
        if (/^DELETE FROM sqlite_sequence/.test(s)) { DB.sqlite_sequence = []; return { meta: {} }; }
        throw new Error('unsupported run: ' + s);
      };
      const all = async () => {
        if (/FROM sqlite_master/.test(s)) {
          return { results: Object.keys(DB).map((name) => ({ name })) };
        }
        if (/SELECT key, value FROM app_settings/.test(s)) return { results: DB.app_settings };
        const m = /^SELECT \* FROM "([^"]+)"$/.exec(s);
        if (m) return { results: DB[m[1]] || [] };
        throw new Error('unsupported all: ' + s);
      };
      const first = async () => {
        const m = /^SELECT COUNT\(\*\) c FROM "([^"]+)"$/.exec(s);
        if (m) return { c: (DB[m[1]] || []).length };
        throw new Error('unsupported first: ' + s);
      };
      return { bind: () => ({ all, first, run }), all, first, run };
    },
  };
}

let pass = 0, fail = 0;
function ok(cond, label, extra = '') {
  if (cond) { pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra ? '  -> ' + extra : '')); }
}

const ctx = () => ({ env: { DB: mockDB() } });

// ===== 1. stats =====
console.log('== GET /api/data/stats ==');
{
  const r = await statsGet(ctx());
  const d = await r.json();
  const names = d.tables.map((t) => t.name);
  ok(r.status === 200, 'status 200');
  ok(!names.includes('sessions'), '不统计 sessions（登录会话）');
  ok(!names.includes('app_settings'), '不统计 app_settings（品牌/外观）');
  ok(!names.includes('sqlite_sequence'), '不统计 sqlite_sequence（内部表）');
  ok(names.includes('habits') && names.includes('contacts'), '统计业务表');
  // 2 habits + 1 log + 1 todo + 1 contact + 1 promise + 1 vocab = 7
  ok(d.total === 7, 'total = 7', 'got ' + d.total);
  const habit = d.tables.find((t) => t.name === 'habits');
  ok(habit && habit.count === 2 && habit.label === '成长打卡 · 习惯', 'habits 计数与中文名正确');
  ok(d.tables[d.tables.length - 1].count === 0, '空表沉底');
}

// ===== 2. export =====
console.log('== GET /api/data/export ==');
{
  const r = await exportGet(ctx());
  const d = await r.json();
  ok(r.status === 200, 'status 200');
  ok(/attachment; filename="shuzishenghuo-backup-\d{8}-\d{4}\.json"/.test(r.headers.get('content-disposition') || ''), '带附件文件名');
  ok(d.app === 'shuzishenghuo' && d.format === 1, '格式标识');
  ok(d.tables && d.tables.habits && d.tables.habits.length === 2, '导出 habits 内容');
  ok(!('sessions' in d.tables), '导出不含 sessions');
  ok(!('sqlite_sequence' in d.tables), '导出不含 sqlite_sequence');
  ok(d.settings && d.settings.brand_name === '数字生活' && d.settings.theme === 'zhiyin', '附带 app_settings');
  ok(d.labels && d.labels.habits === '成长打卡 · 习惯', '附带中文标签表');
}

// ===== 3. clear（缺确认标记）=====
console.log('== POST /api/data/clear（未确认）==');
{
  const before = JSON.stringify(DB.habits);
  const r = await clearPost({ env: { DB: mockDB() }, request: { json: async () => ({}) } });
  ok(r.status === 400, '缺标记返回 400');
  ok(JSON.stringify(DB.habits) === before, '数据未被改动');
}

// ===== 4. clear（正确确认）=====
console.log('== POST /api/data/clear（已确认）==');
{
  DB = freshDB();
  const r = await clearPost({
    env: { DB: mockDB() },
    request: { json: async () => ({ confirm: 'CLEAR_ALL_DATA' }) },
  });
  const d = await r.json();
  ok(r.status === 200 && d.ok === true, 'status 200 / ok');
  ok((d.failed || []).length === 0, '无失败表');
  ok(d.cleared.includes('habits') && d.cleared.includes('contacts'), '清空业务表');
  ok(!d.cleared.includes('sessions') && !d.cleared.includes('app_settings'), '不清空 sessions / app_settings');
  ok(DB.habits.length === 0 && DB.contacts.length === 0 && DB.vocab.length === 0, '业务数据已清空');
  ok(DB.sessions.length === 1, 'sessions 保留（不会被踢下线）');
  ok(DB.app_settings.length === 2, 'app_settings 保留（品牌与外观）');
  ok(DB.sqlite_sequence.length === 0, '自增序列已重置');
}

// ===== 5. clear 后 stats 归零 =====
console.log('== 清空后 stats ==');
{
  const r = await statsGet(ctx());
  const d = await r.json();
  ok(d.total === 0, 'total 归零', 'got ' + d.total);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
