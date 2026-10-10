// 本地验证：mock D1 跑「我的账本」后端（/api/transactions GET/POST、/api/transactions/:id PUT/DELETE）
import { onRequestGet, onRequestPost, CATEGORIES } from '../functions/api/transactions.js';
import { onRequest as idRequest } from '../functions/api/transactions/[id].js';

// ===== 极简 mock D1：按 SQL 特征分派 =====
let DB = {};
function freshDB() {
  DB = {
    transactions: [
      { id: 1, flow: 'income',  amount: 12800, category: '工资',   txn_date: '2026-10-08', note: '十月工资',       account: '银行卡' },
      { id: 2, flow: 'income',  amount: 800,   category: '红包',   txn_date: '2026-10-02', note: '@张伟 表妹结婚',  account: '微信' },
      { id: 3, flow: 'expense', amount: 3200,  category: '居住',   txn_date: '2026-10-01', note: '房租',           account: '银行卡' },
      { id: 4, flow: 'expense', amount: 1266,  category: '餐饮',   txn_date: '2026-10-07', note: '一周伙食',       account: '微信' },
      { id: 5, flow: 'expense', amount: 600,   category: '人情',   txn_date: '2026-10-03', note: '@张伟 生日礼物', account: '人情往来' },
      { id: 6, flow: 'expense', amount: 500,   category: '借还款', txn_date: '2026-10-04', note: '@李娜 借出',     account: '人情往来' },
      { id: 7, flow: 'expense', amount: 999,   category: '餐饮',   txn_date: '2026-09-20', note: '上月聚餐',       account: '现金' },
      { id: 8, flow: 'expense', amount: 2000,  category: '购物',   txn_date: '2026-08-11', note: '上月购物',       account: '支付宝' },
    ],
    contacts: [
      { id: 11, name: '张伟' },
      { id: 12, name: '李娜' },
      { id: 13, name: '张伟明' }, // 更长的名字，用于验证「最长匹配优先」
    ],
    app_settings: [{ key: 'ledger_budget', value: '8000' }],
  };
}
freshDB();

function todayOf() { return new Date(); }
function strftime(expr, field) {
  // 只支持 strftime('%Y-%m', txn_date)
  if (/^'%Y-%m'$/.test(expr)) return (row) => String(row[field] || '').slice(0, 7);
  throw new Error('unsupported strftime: ' + expr);
}

function mockDB() {
  return {
    prepare(sql) {
      const s = sql.replace(/\s+/g, ' ').trim();
      const bound = [];
      const api = {
        bind(...args) { bound.push(...args); return api; },
        async all() {
          // 当月明细
          if (/^SELECT id, flow, amount, category, txn_date, note, account FROM transactions WHERE/.test(s)) {
            const m = bound[0];
            const rows = DB.transactions
              .filter((r) => String(r.txn_date).slice(0, 7) === m)
              .sort((a, b) => (a.txn_date === b.txn_date ? b.id - a.id : a.txn_date < b.txn_date ? 1 : -1));
            return { results: rows };
          }
          // 近 6 个月趋势
          if (/^SELECT strftime\('%Y-%m', txn_date\) m,/.test(s)) {
            const [from, to] = bound;
            const map = {};
            DB.transactions.forEach((r) => {
              const k = String(r.txn_date).slice(0, 7);
              if (k < from || k > to) return;
              map[k] = map[k] || { m: k, inc: 0, exp: 0 };
              if (r.flow === 'income') map[k].inc += r.amount; else map[k].exp += r.amount;
            });
            return { results: Object.values(map).sort((a, b) => (a.m < b.m ? -1 : 1)) };
          }
          // 账户
          if (/^SELECT DISTINCT account FROM transactions/.test(s)) {
            const seen = new Set();
            DB.transactions.forEach((r) => { if (r.account) seen.add(r.account); });
            return { results: [...seen].map((account) => ({ account })) };
          }
          // 联系人
          if (/^SELECT id, name FROM contacts$/.test(s)) return { results: DB.contacts };
          throw new Error('unsupported all: ' + s);
        },
        async first() {
          if (/^SELECT value FROM app_settings WHERE key='ledger_budget'$/.test(s)) {
            const r = DB.app_settings.find((x) => x.key === 'ledger_budget');
            return r ? { value: r.value } : null;
          }
          if (/^SELECT id FROM transactions WHERE id = \?$/.test(s)) {
            const r = DB.transactions.find((x) => x.id === bound[0]);
            return r ? { id: r.id } : null;
          }
          throw new Error('unsupported first: ' + s);
        },
        async run() {
          if (/^INSERT INTO transactions\(/.test(s)) {
            const [flow, amount, category, txn_date, note, account] = bound;
            const id = Math.max(0, ...DB.transactions.map((r) => r.id)) + 1;
            DB.transactions.push({ id, flow, amount, category, txn_date, note, account });
            return { meta: { last_row_id: id } };
          }
          if (/^UPDATE transactions SET /.test(s)) {
            const [flow, amount, category, txn_date, note, account, id] = bound;
            const r = DB.transactions.find((x) => x.id === id);
            Object.assign(r, { flow, amount, category, txn_date, note, account });
            return { meta: {} };
          }
          if (/^DELETE FROM transactions WHERE id = \?$/.test(s)) {
            DB.transactions = DB.transactions.filter((x) => x.id !== bound[0]);
            return { meta: {} };
          }
          throw new Error('unsupported run: ' + s);
        },
      };
      return api;
    },
  };
}

let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra ? '  -> ' + extra : '')); }
};

const getCtx = (query = '') => ({
  env: { DB: mockDB() },
  request: new Request('https://x/api/transactions' + query),
});

// ================= GET =================
console.log('== GET /api/transactions?month=2026-10 ==');
freshDB();
const res = await onRequestGet(getCtx('?month=2026-10'));
const d = await res.json();

ok(d.month === '2026-10', '返回请求的月份', d.month);
ok(d.list.length === 6, '当月明细 6 笔（不含 9/8 月）', 'n=' + d.list.length);
ok(
  d.list.map((t) => t.date).join(',') === '2026-10-08,2026-10-07,2026-10-04,2026-10-03,2026-10-02,2026-10-01',
  '按日期倒序（10-08 → 10-01）',
  d.list.map((t) => t.date).join(',')
);
ok(d.summary.income === 13600, '收入汇总 13600', String(d.summary.income));
ok(d.summary.expense === 5566, '支出汇总 5566（3200+1266+600+500）', String(d.summary.expense));
ok(d.summary.balance === 8034, '结余 = 收 − 支', String(d.summary.balance));
ok(Math.abs(d.summary.avgDaily - 5566 / 31) < 0.01, '日均支出 = 支出 / 当月天数(31)', d.summary.avgDaily.toFixed(2));
ok(d.summary.maxExpense === 3200, '最大单笔支出 3200', String(d.summary.maxExpense));

ok(d.catStats.length === 4 && d.catStats[0].name === '居住' && d.catStats[0].value === 3200, '支出分类占比按金额降序', JSON.stringify(d.catStats.map((c) => c.name + ':' + c.value)));
ok(Math.abs(d.catStats[0].pct - 3200 / 5566) < 1e-9, '占比 = 分类额 / 总支出', String(d.catStats[0].pct));
ok(d.incomeCatStats.length === 2 && d.incomeCatStats[0].name === '工资', '收入分类占比单独返回', JSON.stringify(d.incomeCatStats.map((c) => c.name + ':' + c.value)));

ok(d.trend.length === 6, '趋势固定 6 个月', 'n=' + d.trend.length);
ok(d.trend[5].month === '2026-10' && d.trend[0].month === '2026-05', '趋势窗口为 当月往前 5 个月 → 当月', d.trend[0].month + '~' + d.trend[5].month);
ok(d.trend[5].income === 13600 && d.trend[5].expense === 5566, '趋势末月＝当月数据');
ok(d.trend[4].month === '2026-09' && d.trend[4].expense === 999, '9 月支出 999 计入趋势', JSON.stringify(d.trend[4]));
ok(d.trend[0].income === 0 && d.trend[0].expense === 0, '没有数据的月份补 0 而不是缺行', JSON.stringify(d.trend[0]));
ok(d.trend[2].month === '2026-07' && d.trend[3].month === '2026-08', '8 月的 2000 落在对应槽位', JSON.stringify(d.trend[3]));

ok(d.accounts[0] === '默认账户' && d.accounts.includes('现金') && d.accounts.includes('人情往来'), '账户列表含预置账户', d.accounts.join(','));
ok(new Set(d.accounts).size === d.accounts.length, '账户列表去重', String(new Set(d.accounts).size));
ok(d.accounts.includes('招商银行') === false, '未使用过的自定义账户不应凭空出现');

ok(d.payees['5'] && d.payees['5'].id === 11, '「@张伟 生日礼物」反查到联系人 11', JSON.stringify(d.payees['5']));
ok(d.payees['6'] && d.payees['6'].id === 12, '「@李娜 借出」反查到联系人 12', JSON.stringify(d.payees['6']));
ok(d.payees['2'] && d.payees['2'].id === 11, '收入类「@张伟 表妹结婚」同样能反查联系人（不区分收支）', JSON.stringify(d.payees['2']));

ok(d.budget === 8000, '月预算从 app_settings 读出', String(d.budget));
ok(d.social.count === 2 && d.social.out === 1100 && d.social.in === 0, '人情往来小结：2 笔 / 出 1100', JSON.stringify(d.social));
ok(d.categories.expense.includes('借还款'), '支出分类含「借还款」（人际关系写账本用）', d.categories.expense.join(','));
ok(d.categories.income.includes('红包'), '收入分类含「红包」');

// 最长名字优先
console.log('== 联系人名最长匹配优先 ==');
freshDB();
DB.transactions.push({ id: 9, flow: 'expense', amount: 100, category: '人情', txn_date: '2026-10-05', note: '@张伟明 结婚', account: '人情往来' });
const d2 = await (await onRequestGet(getCtx('?month=2026-10'))).json();
ok(d2.payees['9'] && d2.payees['9'].id === 13, '「@张伟明」匹配到 13 而不是被「@张伟」截断', JSON.stringify(d2.payees['9']));

// 无预算 / 无 contacts 表时不炸
console.log('== 降级：app_settings 无预算键 ==');
freshDB();
DB.app_settings = [];
const d3 = await (await onRequestGet(getCtx('?month=2026-10'))).json();
ok(d3.budget === 0, '无预算配置时返回 0', String(d3.budget));
ok(Array.isArray(d3.list) && d3.list.length === 6, '其余字段照常返回');

// ================= POST =================
console.log('== POST /api/transactions ==');
freshDB();
const post = (body) => onRequestPost({
  env: { DB: mockDB() },
  request: new Request('https://x/api/transactions', { method: 'POST', body: JSON.stringify(body) }),
});
let r = await post({ flow: 'expense', amount: 38.5, category: '餐饮', date: '2026-10-10', note: '午饭', account: '微信' });
let j = await r.json();
ok(r.status === 201 && j.ok && j.id === 9, '新增成功返回 201 + id', r.status + ' id=' + j.id);
ok(DB.transactions.find((t) => t.id === 9).account === '微信', 'account 落库', DB.transactions.find((t) => t.id === 9).account);

r = await post({ flow: 'expense', amount: 10, category: '餐饮', date: '2026-10-10' });
j = await r.json();
ok(r.status === 201 && DB.transactions.find((t) => t.id === j.id).account === '默认账户', '不传 account 时默认「默认账户」');
r = await post({ flow: 'expense', amount: 0, category: '餐饮', date: '2026-10-10' });
ok(r.status === 400, '金额 0 被拒（400）', String(r.status));
r = await post({ flow: 'expense', amount: -5, category: '餐饮', date: '2026-10-10' });
ok(r.status === 400, '负数金额被拒（400）', String(r.status));
r = await post({ flow: 'expense', amount: 'abc', category: '餐饮', date: '2026-10-10' });
ok(r.status === 400, '非数字金额被拒（400）', String(r.status));

// ================= PUT / DELETE =================
console.log('== PUT / DELETE /api/transactions/:id ==');
const put = (id, body, method = 'PUT') => idRequest({
  env: { DB: mockDB() },
  request: new Request('https://x/api/transactions/' + id, { method, body: JSON.stringify(body) }),
});
freshDB();
r = await put(3, { flow: 'expense', amount: 3500, category: '居住', date: '2026-10-02', note: '房租涨了', account: '支付宝' });
j = await r.json();
ok(r.status === 200 && j.ok, 'PUT 返回 200', r.status);
const row3 = DB.transactions.find((t) => t.id === 3);
ok(row3.amount === 3500 && row3.note === '房租涨了' && row3.account === '支付宝' && row3.txn_date === '2026-10-02', 'PUT 写回全部字段', JSON.stringify(row3));

r = await put(3, { flow: 'income', amount: 1, category: '其他', date: '2026-10-02' }, 'PATCH');
ok(r.status === 200, 'PATCH 同样可用', String(r.status));

r = await put(999, { flow: 'expense', amount: 1, category: '其他', date: '2026-10-02' });
ok(r.status === 404, '改不存在的记录 → 404', String(r.status));
r = await put(3, { flow: 'expense', amount: 0, category: '居住', date: '2026-10-02' });
ok(r.status === 400, 'PUT 金额非法 → 400', String(r.status));

r = await idRequest({ env: { DB: mockDB() }, request: new Request('https://x/api/transactions/3', { method: 'POST' }) });
ok(r.status === 405, '不支持的方法 → 405（不再把 GET/POST 当删除）', String(r.status));

r = await idRequest({ env: { DB: mockDB() }, request: new Request('https://x/api/transactions/3', { method: 'DELETE' }) });
j = await r.json();
ok(r.status === 200 && !DB.transactions.find((t) => t.id === 3), 'DELETE 删掉记录', r.status);

r = await idRequest({ env: { DB: mockDB() }, request: new Request('https://x/api/transactions/abc', { method: 'DELETE' }) });
ok(r.status === 400, '非法 id → 400', String(r.status));

console.log('\n通过 ' + pass + ' / ' + (pass + fail) + ' 项');
process.exit(fail ? 1 : 0);
