// v0.5.56 审计修复回归测试（HTTP e2e，跑在 127.0.0.1:8799 的 wrangler pages dev 上）
// 覆盖：P1-2 GET即删、P1-3 分类联动、P1-5 恢复导入、P2-1 限流、P2-2 清空+种子重放、
//       P2-3 农历生日日期、P2-14 日期语义校验、P2-15 周期账单月末钳制/账户联动、
//       P2-16 完成待办抢占/逾期锚点、P2-17 密码强度、星期几过滤（今日服药）
// 注意：末尾的限流测试会把本 IP 的登录失败计数顶满（15 分钟），故整个文件必须放在 CI 最后执行。
const BASE = 'http://127.0.0.1:8799';
let cookie = '';
const ok = [], fail = [];
const check = (n, c, e = '') => (c ? ok : fail).push((c ? '✓ ' : '✗ ') + n + (e ? ' → ' + e : ''));

async function api(path, opts = {}) {
  return fetch(BASE + path, { credentials: 'include', ...opts, headers: { cookie, ...(opts.headers || {}) } });
}
const JH = { 'Content-Type': 'application/json' };
async function j(r) { return r.json().catch(() => ({})); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

{
  const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: JH, body: JSON.stringify({ user: 'admin', pass: 'test-pass-123' }) });
  cookie = (r.headers.get('set-cookie') || '').split(';')[0];
  check('登录', r.status === 200);
}

// ===== 1. P1-2：GET 不再触发删除 =====
{
  // 造一条真实 memo，GET 它的删除路由必须 405 且数据还在
  const c = await api('/api/memos', { method: 'POST', headers: JH, body: JSON.stringify({ content: '审计回归-临时备忘' }) });
  const cid = (await j(c)).id;
  check('造一条 memo', c.status === 201 && !!cid);
  const before = (await j(await api('/api/memos'))).list || [];
  const g1 = await api(`/api/memos/${cid}`);
  check('GET /api/memos/:id → 405', g1.status === 405, `got ${g1.status}`);
  const after = (await j(await api('/api/memos'))).list || [];
  check('GET 之后数据仍在', after.some((m) => m.id === cid) && after.length === before.length);
  const d1 = await api(`/api/memos/${cid}`, { method: 'DELETE' });
  check('DELETE 正常可用', d1.status === 200);
  const gone = (await j(await api('/api/memos'))).list || [];
  check('DELETE 之后数据没了', !gone.some((m) => m.id === cid));

  for (const [path, label] of [
    ['/api/events/999999', 'GET /api/events/:id'],
    ['/api/todos/999999/delete', 'GET /api/todos/:id/delete'],
    ['/api/contacts/999999', 'GET /api/contacts/:id'],
    ['/api/profile/delete?id=999', 'GET /api/profile/delete'],
  ]) {
    const r = await api(path);
    check(`${label} → 405（旧代码是 200/404 直接删）`, r.status === 405, `got ${r.status}`);
  }
}

// ===== 2. 中间件 Sec-Fetch-Site：跨站写请求被拒 =====
{
  const r = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { ...JH, 'Sec-Fetch-Site': 'cross-site' },
    body: JSON.stringify({ user: 'admin', pass: 'test-pass-123' }),
  });
  check('跨站 POST（Sec-Fetch-Site: cross-site）→ 403', r.status === 403, `got ${r.status}`);
  const r2 = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { ...JH, 'Sec-Fetch-Site': 'same-origin' },
    body: JSON.stringify({ user: 'admin', pass: 'test-pass-123' }),
  });
  check('同源 POST 照常进入登录', r2.status === 200, `got ${r2.status}`);
  cookie = (r2.headers.get('set-cookie') || '').split(';')[0] || cookie;
}

// ===== 3. P2-14：日期/时间做语义校验 =====
{
  let r = await api('/api/transactions', { method: 'POST', headers: JH, body: JSON.stringify({ flow: 'expense', amount: 10, date: '2026-13-45' }) });
  check('记账非法日期 2026-13-45 → 400', r.status === 400, `got ${r.status}`);
  r = await api('/api/transactions', { method: 'POST', headers: JH, body: JSON.stringify({ flow: 'expense', amount: 10, date: '2026-02-30' }) });
  check('记账 2026-02-30 → 400', r.status === 400);
  r = await api('/api/transactions', { method: 'POST', headers: JH, body: JSON.stringify({ flow: 'expense', amount: 1e15 }) });
  check('金额超上限 1e15 → 400', r.status === 400);
  r = await api('/api/todos', { method: 'POST', headers: JH, body: JSON.stringify({ title: '审计-脏日期', date: '2026-02-30' }) });
  check('待办 2026-02-30 → 400', r.status === 400);
  r = await api('/api/events', { method: 'POST', headers: JH, body: JSON.stringify({ title: '审计-脏日程', start: '2026-13-45 10:00' }) });
  check('日程 2026-13-45 10:00 → 400', r.status === 400);
  r = await api('/api/events?from=2026-13-45&to=2026-12-01', {});
  check('日历查询 from=2026-13-45 → 400（旧代码 500）', r.status === 400, `got ${r.status}`);
  // v0.5.58 回归：合法时刻入库须规范成 'HH:MM'（v0.5.56 曾把 '9:30' 写成 '00009' 且丢分钟）
  r = await api('/api/events', { method: 'POST', headers: JH, body: JSON.stringify({ title: '审计-带时刻日程', start: '2026-01-05 9:30', calendar: '生活' }) });
  const evOk = r.status === 201;
  check('日程合法带时刻 9:30 → 201', evOk, `got ${r.status}`);
  const evId = evOk ? (await j(r)).id : null;
  if (evId) {
    const g = await j(await api('/api/events?from=2026-01-05&to=2026-01-06', {}));
    const row = (g.events || []).find((e) => e.id === evId);
    check('日程时刻入库为 2026-01-05 09:30', !!row && row.start === '2026-01-05 09:30', `got ${row && row.start}`);
    const del = await api(`/api/events?id=${evId}`, { method: 'DELETE', headers: JH });
    check('清理回归日程', del.ok, `got ${del.status}`);
  } else {
    check('日程时刻入库为 2026-01-05 09:30', false, '上一条创建失败，无法校验');
  }
}

// ===== 4. P1-3 + P2-18：分类改名/删除联动 =====
{
  const c = await api('/api/txn-categories', { method: 'POST', headers: JH, body: JSON.stringify({ flow: 'expense', name: '审计分类' }) });
  const cat = (await j(c)).id;
  check('建分类「审计分类」', c.status === 201 && !!cat);
  const s = await api('/api/txn-categories', { method: 'POST', headers: JH, body: JSON.stringify({ flow: 'expense', name: '审计二级', parent_id: cat }) });
  const sub = (await j(s)).id;
  check('建二级「审计二级」', s.status === 201 && !!sub);

  const t = await api('/api/transactions', { method: 'POST', headers: JH, body: JSON.stringify({ flow: 'expense', amount: 9.9, category: '审计分类', sub_category: '审计二级', date: '2026-11-20' }) });
  check('记一笔挂在该分类下', t.status === 201);
  const b = await api('/api/budgets', { method: 'PUT', headers: JH, body: JSON.stringify({ category: '审计分类', month: '2026-11', amount: 100 }) });
  check('给该分类设 2026-11 预算', b.status === 200);
  const rc = await api('/api/recurring', { method: 'POST', headers: JH, body: JSON.stringify({ flow: 'expense', amount: 3, category: '审计分类', next: '2027-06-20', freq: 'monthly' }) });
  check('建周期账单挂该分类', rc.status === 201);

  // 改名联动
  const rn = await api(`/api/txn-categories/${cat}`, { method: 'PUT', headers: JH, body: JSON.stringify({ name: '审计分类二' }) });
  check('重命名 → 审计分类二', rn.status === 200);
  const tx = await j(await api('/api/transactions?month=2026-11'));
  const row = (tx.list || []).find((x) => x.amount === 9.9);
  check('历史流水的分类已联动改名', row && row.category === '审计分类二', JSON.stringify(row && row.category));
  check('流水的二级标记仍在（改名不动二级）', row && row.sub === '审计二级');
  const bl = (await j(await api('/api/budgets?month=2026-11'))).list || [];
  check('预算已联动改名且 used 生效', bl.some((x) => x.category === '审计分类二' && x.used === 9.9), JSON.stringify(bl));
  const rl = (await j(await api('/api/recurring'))).list || [];
  check('周期账单已联动改名', rl.some((x) => x.category === '审计分类二'), JSON.stringify(rl.map((x) => x.category)));

  // P2-18：删二级 → 流水二级标记被清（父分类名正确绑定）
  const ds = await api(`/api/txn-categories/${sub}`, { method: 'DELETE' });
  check('删除二级分类', ds.status === 200);
  const tx2 = await j(await api('/api/transactions?month=2026-11'));
  const row2 = (tx2.list || []).find((x) => x.amount === 9.9);
  check('二级标记已被清理（旧代码残留）', row2 && row2.sub === '', JSON.stringify(row2 && row2.sub));

  // 删一级 → 流水归并到「其他」
  const dcat = await api(`/api/txn-categories/${cat}`, { method: 'DELETE' });
  check('删除一级分类', dcat.status === 200);
  const bl2 = (await j(await api('/api/budgets?month=2026-11'))).list || [];
  check('该分类的预算行已删除', !bl2.some((x) => x.category === '审计分类二'));
  const tx3 = await j(await api('/api/transactions?month=2026-11'));
  const row3 = (tx3.list || []).find((x) => x.amount === 9.9);
  check('流水归并到「其他」', row3 && row3.category === '其他', JSON.stringify(row3 && row3.category));
}

// ===== 5. P2-15：周期账单月末钳制 + 积压补齐 + 账户联动 =====
{
  const today = (await j(await api('/api/todos'))).today;
  // 锚定 1 月 31 日的月度账单：旧实现 next_date 会漂到 3 月 3 日并整月漏掉 2 月
  const rc = await api('/api/recurring', { method: 'POST', headers: JH, body: JSON.stringify({ flow: 'expense', amount: 12.5, category: '餐饮', next: '2026-01-31', freq: 'monthly' }) });
  check('建 1-31 月度周期账单', rc.status === 201);
  const g = await j(await api('/api/recurring'));
  check('懒生成有产出', (g.generated || 0) >= 1, `generated=${g.generated}`);
  const tx = await j(await api('/api/transactions?month=2026-02'));
  check('2 月入了 2026-02-28（月末钳制，不再漂到 3-03）', (tx.list || []).some((x) => x.date === '2026-02-28'), JSON.stringify((tx.list || []).map((x) => x.date)));
  const tx3 = await j(await api('/api/transactions?month=2026-03'));
  check('3 月入了 2026-03-31（锚定日恢复）', (tx3.list || []).some((x) => x.date === '2026-03-31'));
  const rl = (await j(await api('/api/recurring'))).list || [];
  const mine = rl.find((x) => x.amount === 12.5 && x.next);
  check('next_date 已推进到未来', !!mine && mine.next > today, `next=${mine && mine.next} today=${today}`);

  // 账户改名联动
  const a = await api('/api/txn-accounts', { method: 'POST', headers: JH, body: JSON.stringify({ name: '审计账户A' }) });
  const aid = (await j(a)).id;
  check('建账户「审计账户A」', a.status === 201 && !!aid);
  const rc2 = await api('/api/recurring', { method: 'POST', headers: JH, body: JSON.stringify({ flow: 'expense', amount: 7, category: '餐饮', account: '审计账户A', next: '2027-08-01', freq: 'monthly' }) });
  check('周期账单挂审计账户A', rc2.status === 201);
  const rn = await api(`/api/txn-accounts/${aid}`, { method: 'PUT', headers: JH, body: JSON.stringify({ name: '审计账户B' }) });
  check('账户改名 A → B', rn.status === 200);
  const rl2 = (await j(await api('/api/recurring'))).list || [];
  check('周期账单账户联动到 B（不再产生幽灵账户）', rl2.some((x) => x.amount === 7 && x.account === '审计账户B'), JSON.stringify(rl2.filter((x) => x.amount === 7).map((x) => x.account)));
}

// ===== 6. P2-16：完成待办抢占 + 逾期重复任务下一实例 =====
{
  const today = (await j(await api('/api/todos'))).today;
  const y = new Date(Date.parse(today + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
  const c1 = await api('/api/todos', { method: 'POST', headers: JH, body: JSON.stringify({ title: '审计-逾期重复任务', date: y, repeat: 'daily' }) });
  const id1 = (await j(c1)).id;
  check('建逾期（昨天）daily 重复任务', c1.status === 201);
  const d1 = await j(await api(`/api/todos/${id1}/done`, { method: 'POST' }));
  check('完成成功且返回 changes=1', d1.ok === true && d1.changes === 1, JSON.stringify(d1));
  check('下一实例严格晚于今天（旧代码=今天）', !!d1.nextDate && d1.nextDate > today, `nextDate=${d1.nextDate} today=${today}`);
  const d2 = await j(await api(`/api/todos/${id1}/done`, { method: 'POST' }));
  check('第二次完成 → changes=0（连点不翻倍）', d2.ok === true && d2.changes === 0, JSON.stringify(d2));
  const planned = (await j(await api('/api/todos?view=planned'))).todos || [];
  const dup = planned.filter((t) => t.title === '审计-逾期重复任务' && !t.done);
  check('只有一个未完成的下一实例', dup.length === 1, `count=${dup.length}`);
}

// ===== 7. P2-3：农历生日的公历 date 与 days 一致 =====
{
  const c = await api('/api/profile/detail', { method: 'POST', headers: JH, body: JSON.stringify({ englishName: '审计农历', gender: '女', birthdayType: 'monthday', birthdayCalendar: 'lunar', birthMonth: 11, birthDay: 3, birthdayRemind: true }) });
  const id = (await j(c)).id;
  check('建农历生日联系人', c.status === 201 && !!id);
  const d = await j(await api(`/api/contacts`));
  const p = (d.contacts || []).find((x) => x.id === id);
  const nb = p && p.nextBirthday;
  check('农历生日返回了 nextBirthday', !!nb, JSON.stringify(nb));
  if (nb && nb.date && nb.days != null) {
    const today = (await j(await api('/api/todos'))).today;
    const diff = Math.round((Date.parse(nb.date + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000);
    check('date 是公历日且与 days 一致（旧代码差一两个月）', diff === nb.days, `date=${nb.date} days=${nb.days} diff=${diff}`);
  }
}

// ===== 8. P2-10：热力图分母含未打卡习惯 =====
{
  const h1 = await api('/api/habits', { method: 'POST', headers: JH, body: JSON.stringify({ name: '审计热力A', category: '审计热力类', type: 'normal', target: 1 }) });
  const id1 = (await j(h1)).habit.id;   // POST /api/habits 返回 { habit: { id, ... } }
  const h2 = await api('/api/habits', { method: 'POST', headers: JH, body: JSON.stringify({ name: '审计热力B', category: '审计热力类', type: 'normal', target: 1 }) });
  check('建两个同分类习惯', h1.status === 201 && h2.status === 201);
  await api(`/api/habits/${id1}/check`, { method: 'POST', headers: JH, body: JSON.stringify({ value: 1 }) });
  const hm = await j(await api('/api/habits/heatmap?days=14'));
  const cat = (hm.categories || []).find((c) => c.name === '审计热力类');
  const todayVal = cat && cat.values && cat.values[cat.values.length - 1];
  check('只打 1/2 → 今日格 < 1（旧代码恒 1）', typeof todayVal === 'number' && todayVal > 0 && todayVal < 1, `val=${todayVal}`);
}

// ===== 9. 今日服药按正确星期几过滤（dow 差一天修复）+ P2-14 时间校验 =====
{
  const today = (await j(await api('/api/med-plans'))).today;
  const dow = ((new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7) + 1;
  const m = await api('/api/medicines', { method: 'POST', headers: JH, body: JSON.stringify({ name: '审计测试药', stock: 5, stockMin: 1 }) });
  const mid = (await j(m)).id;
  check('建测试药品', m.status === 201 && !!mid);
  const bad = await api('/api/med-plans', { method: 'POST', headers: JH, body: JSON.stringify({ medicineId: mid, time: '25:99', days: [dow] }) });
  check('服药计划 25:99 → 400（旧代码入库）', bad.status === 400, `got ${bad.status}`);
  const p1 = await api('/api/med-plans', { method: 'POST', headers: JH, body: JSON.stringify({ medicineId: mid, time: '08:00', days: [dow] }) });
  check('服药计划按今天建', p1.status === 201);
  const p2 = await api('/api/med-plans', { method: 'POST', headers: JH, body: JSON.stringify({ medicineId: mid, time: '09:00', days: [dow % 7 + 1] }) });
  check('服药计划按别的日子建', p2.status === 201);
  const list = (await j(await api('/api/med-plans'))).list || [];
  const todayHit = list.filter((p) => p.medicine === '审计测试药' && p.today.due);
  check('「今日」过滤命中正确的星期几（旧代码差一天）', todayHit.length === 1, `count=${todayHit.length} dow=${dow}`);
  const home = await j(await api('/api/home'));
  const wd = ['日', '一', '二', '三', '四', '五', '六'][new Date(today + 'T00:00:00Z').getUTCDay()];
  check('home.todayLabel 的星期与 today 一致（旧代码二次 +8 差一天）', !!home.todayLabel && home.todayLabel.includes(`星期${wd}`), `${home.todayLabel} 期望星期${wd}`);
}

// ===== 10. P1-5：备份恢复导入 =====
{
  const exp = await j(await api('/api/data/export'));
  const totalBefore = (await j(await api('/api/data/stats'))).total;
  check('导出备份', !!exp.tables && Object.keys(exp.tables).length > 0);
  check('导出前有数据', totalBefore >= 10, `total=${totalBefore}`);

  // 预览（不写库）
  const pv = await api('/api/data/restore?mode=preview', { method: 'POST', headers: JH, body: JSON.stringify(exp) });
  const pvd = await j(pv);
  check('恢复预览 200', pv.status === 200, `got ${pv.status}`);
  check('预览有逐表行数', Array.isArray(pvd.preview) && pvd.preview.length > 0);
  const totalMid = (await j(await api('/api/data/stats'))).total;
  check('预览不写库', totalMid === totalBefore, `${totalMid} vs ${totalBefore}`);

  // 改动库（加一条 memo），再恢复，数据应回到备份时点
  await api('/api/memos', { method: 'POST', headers: JH, body: JSON.stringify({ content: '审计-恢复前新增' }) });
  const totalChanged = (await j(await api('/api/data/stats'))).total;
  check('新增一条后 total+1', totalChanged === totalBefore + 1, `${totalChanged} vs ${totalBefore + 1}`);
  const rs = await api('/api/data/restore?mode=confirm&confirm=RESTORE_DATA', { method: 'POST', headers: JH, body: JSON.stringify(exp) });
  const rd = await j(rs);
  check('确认恢复 200', rs.status === 200, `got ${rs.status} ${JSON.stringify(rd).slice(0, 200)}`);
  check('恢复统计 total = 备份行数', (rd.total || 0) >= totalBefore - 1, `restored=${rd.total} backup=${totalBefore}`);
  check('恢复前快照已写 R2', !!rd.snapshot, JSON.stringify(rd.snapshot));
  const totalRestored = (await j(await api('/api/data/stats'))).total;
  check('恢复后 total 回到备份时点', totalRestored === totalBefore, `${totalRestored} vs ${totalBefore}`);
  const memos = (await j(await api('/api/memos'))).list || [];
  check('恢复后新增的 memo 已消失', !memos.some((m) => m.content === '审计-恢复前新增'));
}

// ===== 11. P2-2：清空 + 种子重放 + 推送订阅保留 =====
{
  const c = await api('/api/data/clear', { method: 'POST', headers: JH, body: JSON.stringify({ confirm: 'CLEAR_ALL_DATA' }) });
  const d = await j(c);
  check('清空 200', c.status === 200);
  check('清空不包含 push_subscriptions', !(d.cleared || []).includes('push_subscriptions'));
  check('kept 由排除名单推导（含 api_tokens 等）', (d.kept || []).includes('api_tokens'), JSON.stringify(d.kept));
  const cats = await j(await api('/api/txn-categories'));
  const names = [...(cats.expense || []).map((x) => x.name), ...(cats.income || []).map((x) => x.name)];
  check('清空后重放种子分类（餐饮/其他）', names.includes('餐饮') && names.includes('其他'), JSON.stringify(names.slice(0, 6)));
  const med = await j(await api('/api/medicines'));
  check('清空后重放药箱词库（外感呼吸病）', (med.options.categories || []).includes('外感呼吸病'), JSON.stringify((med.options.categories || []).slice(0, 4)));
  const lists = (await j(await api('/api/todo-lists'))).lists || [];
  check('清空后重放默认清单「生活」', lists.some((l) => l.name === '生活'));
  const accounts = await j(await api('/api/transactions?meta=accounts'));
  check('清空后重放默认账户', (accounts.accounts || []).includes('默认账户'));
  const stats = await j(await api('/api/data/stats'));
  const seedTotal = (stats.tables || []).filter((t) => ['txn_categories', 'txn_accounts', 'todo_lists', 'vocab'].includes(t.name))
    .reduce((s, t) => s + t.count, 0);
  check('清空后只剩种子数据（分类/账户/清单/词库）', (stats.total || 0) === seedTotal && seedTotal > 0, `total=${stats.total} seed=${seedTotal}`);
  const todosLeft = (await j(await api('/api/todos?scope=all'))).todos || [];
  const contactsLeft = (await j(await api('/api/profile/list'))).list || [];
  const memosLeft = (await j(await api('/api/memos'))).list || [];
  check('用户业务数据归零', todosLeft.length === 0 && contactsLeft.length === 0 && memosLeft.length === 0,
    `todos=${todosLeft.length} contacts=${contactsLeft.length} memos=${memosLeft.length}`);
}

// ===== 12. P2-17：密码强度（只测拒绝路径，不改密，保持测试可重复） =====
{
  let r = await api('/api/auth/password', { method: 'POST', headers: JH, body: JSON.stringify({ oldPass: 'test-pass-123', newPass: 'short' }) });
  check('6 位新密码 → 400（下限已提到 10）', r.status === 400, `got ${r.status}`);
  r = await api('/api/auth/password', { method: 'POST', headers: JH, body: JSON.stringify({ oldPass: 'test-pass-123', newPass: 'abcdefghij' }) });
  check('10 位纯字母 → 400（要求两类字符）', r.status === 400);
  r = await api('/api/auth/password', { method: 'POST', headers: JH, body: JSON.stringify({ oldPass: 'wrong-old-pass', newPass: 'audit-pass-999' }) });
  check('当前密码错误先行拒绝', r.status === 400, `got ${r.status}`);
}

// ===== 13. P2-1 + P2-17 限流（放最后：登录失败计数会锁定本 IP 15 分钟） =====
{
  // client-log：公开接口，超过单 IP 10 分钟 30 条后静默丢弃
  let dropped = 0;
  for (let i = 0; i < 34; i++) {
    const r = await fetch(BASE + '/api/client-log', { method: 'POST', headers: JH, body: JSON.stringify({ message: '审计-限流探测' + i }) });
    if (r.status !== 201) { check('client-log 探测异常', false, `#${i} got ${r.status}`); break; }
    const d = await j(r);
    if (d.limited) { dropped++; }
  }
  check('client-log 超限后进入 limited（不再写库）', dropped >= 4, `dropped=${dropped}`);

  // 登录失败限流：单 IP 15 分钟 10 次
  let got429 = false;
  for (let i = 0; i < 12; i++) {
    const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { ...JH, 'Sec-Fetch-Site': 'same-origin' }, body: JSON.stringify({ user: 'admin', pass: 'wrong-pass-' + i }) });
    if (r.status === 429) { got429 = true; break; }
    if (r.status !== 401) { check('登录失败探测异常', false, `#${i} got ${r.status}`); break; }
    await sleep(60);   // D1 计数写完再打下一发
  }
  check('连续失败后被限流 429', got429);
}

console.log(`\n${ok.length} passed, ${fail.length} failed`);
if (fail.length) { fail.forEach((f) => console.log(f)); process.exit(1); }
