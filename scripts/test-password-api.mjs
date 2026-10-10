// 本地验证：mock D1 跑「修改密码」相关后端
// 覆盖：登录校验（初始密码 / 自定义密码优先级）、改密校验与落库、会话踢除、导出不泄露密码哈希
import { onRequestPost as loginPost } from '../functions/api/auth/login.js';
import { onRequestPost as passPost } from '../functions/api/auth/password.js';
import { onRequestGet as sessionsGet } from '../functions/api/sessions.js';
import { onRequestGet as exportGet } from '../functions/api/data/export.js';
import { signToken, ADMIN_PASS_KEY } from '../functions/_lib.js';

const ENV = {
  ADMIN_USER: 'admin',
  ADMIN_PASS: 'init-pass-123',
  SESSION_SECRET: 'test-secret',
};

function freshDB() {
  return {
    app_settings: [
      { key: 'brand_name', value: '数字生活' },
      { key: 'theme', value: 'zhiyin' },
    ],
    sessions: [
      { sid: 'sid-A', user: 'admin', ip: '1.1.1.1', user_agent: 'Mozilla/5.0 Windows', created_at: '2026-10-10 09:00:00', last_seen_at: '2026-10-10 09:10:00' },
      { sid: 'sid-B', user: 'admin', ip: '2.2.2.2', user_agent: 'Mozilla/5.0 iPhone', created_at: '2026-10-10 08:00:00', last_seen_at: '2026-10-10 08:05:00' },
    ],
    habits: [{ id: 1, name: '学习' }],
    todos: [],
    transactions: [],
    medicines: [],
    events: [],
    contacts: [],
    vocab: [],
    push_subscriptions: [],
    contact_promises: [],
    sqlite_sequence: [],
  };
}

let DB = freshDB();

function mockDB() {
  return {
    prepare(sql) {
      const s = sql.trim().replace(/\s+/g, ' ');
      let args = [];
      const api = {
        bind(...a) { args = a; return api; },
        async all() {
          if (/FROM sqlite_master/.test(s)) return { results: Object.keys(DB).map((name) => ({ name })) };
          if (/SELECT key, value FROM app_settings/.test(s)) return { results: DB.app_settings };
          if (/SELECT \* FROM "([^"]+)"$/.test(s)) return { results: DB[RegExp.$1] || [] };
          if (/FROM sessions ORDER BY created_at DESC/.test(s)) return { results: DB.sessions };
          throw new Error('unsupported all: ' + s);
        },
        async first() {
          if (/SELECT value FROM app_settings WHERE key = \?/.test(s)) {
            const r = DB.app_settings.find((x) => x.key === args[0]);
            return r ? { value: r.value } : null;
          }
          if (/SELECT sid FROM sessions WHERE sid = \?/.test(s)) {
            const r = DB.sessions.find((x) => x.sid === args[0]);
            return r ? { sid: r.sid } : null;
          }
          if (/^SELECT COUNT\(\*\) c FROM "([^"]+)"$/.exec(s)) return { c: (DB[RegExp.$1] || []).length };
          throw new Error('unsupported first: ' + s);
        },
        async run() {
          if (/INSERT INTO app_settings\(key, value\) VALUES \(\?, \?\)/.test(s)) {
            const [k, v] = args;
            const row = DB.app_settings.find((x) => x.key === k);
            if (row) row.value = v; else DB.app_settings.push({ key: k, value: v });
            return { meta: { changes: 1 } };
          }
          if (/INSERT OR REPLACE INTO sessions/.test(s)) return { meta: { changes: 1 } };
          if (/^DELETE FROM sessions WHERE sid != \?$/.test(s)) {
            const before = DB.sessions.length;
            DB.sessions = DB.sessions.filter((x) => x.sid === args[0]);
            return { meta: { changes: before - DB.sessions.length } };
          }
          if (/^DELETE FROM sessions$/.test(s)) {
            const n = DB.sessions.length; DB.sessions = []; return { meta: { changes: n } };
          }
          throw new Error('unsupported run: ' + s);
        },
      };
      return api;
    },
  };
}

function env() { return { ...ENV, DB: mockDB() }; }

function req(body, { cookie = '', url = 'https://x/api', ua = 'Mozilla/5.0 test' } = {}) {
  const headers = { get: (k) => ({ 'cookie': cookie, 'user-agent': ua, 'cf-connecting-ip': '9.9.9.9' }[String(k).toLowerCase()] || null) };
  return { url, headers, json: async () => body };
}

let pass = 0, fail = 0;
function ok(cond, label, extra = '') {
  if (cond) { pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra ? '  -> ' + extra : '')); }
}

// ===== 1. 初始密码登录 =====
console.log('== 登录（环境变量初始密码）==');
{
  const r1 = await loginPost({ request: req({ user: 'admin', pass: ENV.ADMIN_PASS }), env: env() });
  ok(r1.status === 200, '初始密码可登录');
  const r2 = await loginPost({ request: req({ user: 'admin', pass: 'wrong' }), env: env() });
  const d2 = await r2.json();
  ok(r2.status === 401 && d2.error === '用户名或密码错误', '错误密码返回 401');
  const r3 = await loginPost({ request: req({ user: 'root', pass: ENV.ADMIN_PASS }), env: env() });
  ok(r3.status === 401, '错误用户名返回 401');
}

// ===== 2. 改密的各项校验 =====
console.log('== POST /api/auth/password（校验）==');
const tokenA = await signToken('admin', ENV.SESSION_SECRET, 1000 * 60 * 60, { sid: 'sid-A' });
const cookieA = `sz_session=${tokenA}`;
{
  const cases = [
    [{ oldPass: '', newPass: 'abcdef' }, '缺当前密码'],
    [{ oldPass: 'bad', newPass: 'abcdef' }, '当前密码错误'],
    [{ oldPass: ENV.ADMIN_PASS, newPass: '123' }, '新密码过短'],
    [{ oldPass: ENV.ADMIN_PASS, newPass: 'abcdef', confirmPass: 'abcdeX' }, '两次不一致'],
    [{ oldPass: ENV.ADMIN_PASS, newPass: ENV.ADMIN_PASS, confirmPass: ENV.ADMIN_PASS }, '新旧相同'],
  ];
  for (const [body, label] of cases) {
    const r = await passPost({ request: req(body, { cookie: cookieA }), env: env() });
    const d = await r.json();
    ok(r.status === 400 && !!d.error, label + ' → 400', 'got ' + r.status + ' ' + JSON.stringify(d));
  }
  ok(DB.app_settings.every((x) => x.key !== ADMIN_PASS_KEY), '校验失败时不写入密码');
}

// ===== 3. 正常改密 =====
console.log('== POST /api/auth/password（成功）==');
const NEW_PASS = 'new-pass-456';
{
  const r = await passPost({
    request: req({ oldPass: ENV.ADMIN_PASS, newPass: NEW_PASS }, { cookie: cookieA }),
    env: env(),
  });
  const d = await r.json();
  ok(r.status === 200 && d.ok === true, '改密成功返回 200/ok', JSON.stringify(d));
  ok(d.revoked === 1, '踢除其它 1 台设备（sid-B）', 'revoked=' + d.revoked);
  ok(DB.sessions.length === 1 && DB.sessions[0].sid === 'sid-A', '当前设备会话保留');

  const row = DB.app_settings.find((x) => x.key === ADMIN_PASS_KEY);
  ok(!!row, '密码哈希已写入 app_settings');
  ok(row.value.startsWith('pbkdf2$100000$'), '存储为 PBKDF2 格式', row.value.slice(0, 24));
  ok(!row.value.includes(NEW_PASS), '库中不含明文新密码');
}

// ===== 4. 改密后：初始密码失效，新密码可用 =====
console.log('== 改密后的登录行为 ==');
{
  const rOld = await loginPost({ request: req({ user: 'admin', pass: ENV.ADMIN_PASS }), env: env() });
  ok(rOld.status === 401, '环境变量初始密码已失效（自定义密码优先）');

  const rNew = await loginPost({ request: req({ user: 'admin', pass: NEW_PASS }), env: env() });
  ok(rNew.status === 200, '新密码可登录');

  const rNear = await loginPost({ request: req({ user: 'admin', pass: NEW_PASS + 'x' }), env: env() });
  ok(rNear.status === 401, '近似密码仍被拒');
}

// ===== 5. 连续两次改密（覆盖写）=====
console.log('== 二次改密（覆盖）==');
{
  const r = await passPost({
    request: req({ oldPass: NEW_PASS, newPass: 'third-pass-789' }, { cookie: cookieA }),
    env: env(),
  });
  ok(r.status === 200, '用新密码作为旧密码可再次修改');
  const rOld2 = await loginPost({ request: req({ user: 'admin', pass: NEW_PASS }), env: env() });
  ok(rOld2.status === 401, '上一版密码失效');
  const rNew2 = await loginPost({ request: req({ user: 'admin', pass: 'third-pass-789' }), env: env() });
  ok(rNew2.status === 200, '最新密码可登录');
  ok(DB.app_settings.filter((x) => x.key === ADMIN_PASS_KEY).length === 1, 'app_settings 中只有一条密码记录');
}

// ===== 6. 会话接口返回 customPass =====
console.log('== GET /api/sessions ==');
{
  const r = await sessionsGet({ request: req(null, { cookie: cookieA, url: 'https://x/api/sessions' }), env: env() });
  const d = await r.json();
  ok(r.status === 200, 'status 200');
  ok(d.customPass === true, 'customPass = true（已设自定义密码）');
  ok(d.devices.length === 1 && d.devices[0].current === true, '当前设备标记正确');
}

// ===== 7. 导出不泄露密码哈希 =====
console.log('== GET /api/data/export ==');
{
  const r = await exportGet({ env: env() });
  const d = await r.json();
  ok(!(ADMIN_PASS_KEY in d.settings), '备份 settings 不含 ' + ADMIN_PASS_KEY);
  ok(d.settings.brand_name === '数字生活' && d.settings.theme === 'zhiyin', '其余设置照常导出');
  const raw = JSON.stringify(d);
  ok(!raw.includes('pbkdf2$'), '整个备份文件无密码哈希');
}

// ===== 8. 未设置自定义密码时 customPass=false =====
console.log('== 初始状态（未改过密码）==');
{
  DB = freshDB();
  const r = await sessionsGet({ request: req(null, { cookie: cookieA, url: 'https://x/api/sessions' }), env: env() });
  const d = await r.json();
  ok(d.customPass === false, 'customPass = false');
  const rLogin = await loginPost({ request: req({ user: 'admin', pass: ENV.ADMIN_PASS }), env: env() });
  ok(rLogin.status === 200, '未改密时环境变量密码可登录');
  const rExport = await exportGet({ env: env() });
  const dExport = await rExport.json();
  ok(!(ADMIN_PASS_KEY in dExport.settings), '未改密时备份也不含该键');
}

// ===== 9. 会话表缺失时改密仍成功 =====
console.log('== 会话表异常时改密 ==');
{
  DB = freshDB();
  const broken = {
    prepare(sql) {
      if (/sessions/.test(sql)) throw new Error('no such table: sessions');
      return mockDB().prepare(sql);
    },
  };
  const r = await passPost({
    request: req({ oldPass: ENV.ADMIN_PASS, newPass: 'robust-pass-000' }, { cookie: cookieA }),
    env: { ...ENV, DB: broken },
  });
  const d = await r.json();
  ok(r.status === 200 && d.ok === true, '会话表异常不阻断改密');
  ok(d.revoked === 0, 'revoked 归零');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
