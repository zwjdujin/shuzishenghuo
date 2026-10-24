const fs = require('fs');
const vars = Object.fromEntries(fs.readFileSync('.dev.vars', 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = 'http://127.0.0.1:8790';
(async () => {
  const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: 'admin', pass: vars.ADMIN_PASS }) });
  console.log('login:', login.status);
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  const h = { cookie };
  const r1 = await fetch(BASE + '/api/txn-categories', { headers: h });
  const cats = await r1.json();
  console.log('cats:', r1.status, 'expense:', (cats.expense || []).map((c) => c.name).join(','), '| income:', (cats.income || []).map((c) => c.name).join(','));

  // 记一笔支出（带二级分类、时间、联系人占位）
  const p1 = await fetch(BASE + '/api/transactions', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ flow: 'expense', amount: 12.5, category: '交通', sub_category: '地铁', date: '2026-10-24', time: '09:30', account: '微信', item: '通勤', note: '测试地铁' }) });
  console.log('post expense:', p1.status, JSON.stringify(await p1.json()));

  // 记一笔转账
  const p2 = await fetch(BASE + '/api/transactions', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ flow: 'transfer', amount: 500, date: '2026-10-24', time: '10:00', account: '微信', to_account: '银行卡' }) });
  console.log('post transfer:', p2.status, JSON.stringify(await p2.json()));

  // 转账同名账户应被拒
  const p3 = await fetch(BASE + '/api/transactions', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ flow: 'transfer', amount: 100, account: '微信', to_account: '微信' }) });
  console.log('post transfer same acct:', p3.status, JSON.stringify(await p3.json()));

  const r2 = await fetch(BASE + '/api/transactions?month=2026-10', { headers: h });
  const tx = await r2.json();
  console.log('tx month:', r2.status, 'count:', tx.list.length, 'income:', tx.summary.income, 'expense:', tx.summary.expense);
  console.log('rows:', tx.list.map((t) => `${t.flow}|${t.category}${t.sub ? '/' + t.sub : ''}|${t.time}|${t.account}${t.toAccount ? '>' + t.toAccount : ''}|${t.item}`).join('\n      '));
  console.log('catTree.expense:', (tx.catTree.expense || []).length, 'linked:', JSON.stringify(tx.linked), 'payees:', JSON.stringify(tx.payees));

  // 新增分类 + 二级 + 重命名 + 排序 + 删除
  const c1 = await fetch(BASE + '/api/txn-categories', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ flow: 'expense', name: '宠物' }) });
  const cat1 = await c1.json();
  console.log('add cat:', c1.status, JSON.stringify(cat1));
  const c2 = await fetch(BASE + '/api/txn-categories', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ flow: 'expense', name: '飞机', parent_id: cat1.id }) });
  console.log('add sub:', c2.status, JSON.stringify(await c2.json()));
  const c3 = await fetch(BASE + '/api/txn-categories', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ flow: 'expense', name: '宠物' }) });
  console.log('dup cat (expect 400):', c3.status);
  const r3 = await fetch(BASE + '/api/txn-categories', { headers: h });
  const tree = await r3.json();
  const pet = tree.expense.find((c) => c.name === '宠物');
  console.log('pet children:', JSON.stringify(pet && pet.children));

  // 排序：把宠物挪到第一位
  const ids = [pet.id, ...tree.expense.filter((c) => c.id !== pet.id).map((c) => c.id)];
  const c4 = await fetch(BASE + '/api/txn-categories', { method: 'PUT', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ flow: 'expense', parent_id: null, ids }) });
  console.log('reorder:', c4.status);
  const tree2 = await (await fetch(BASE + '/api/txn-categories', { headers: h })).json();
  console.log('after reorder first:', tree2.expense[0].name, 'second:', tree2.expense[1].name);

  // 重命名
  const c5 = await fetch(BASE + '/api/txn-categories/' + pet.id, { method: 'PUT', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ name: '萌宠' }) });
  console.log('rename:', c5.status);

  // 删除（含二级），历史流水归并
  const c6 = await fetch(BASE + '/api/txn-categories/' + pet.id, { method: 'DELETE' });
  console.log('delete cat:', c6.status);
  const tree3 = await (await fetch(BASE + '/api/txn-categories', { headers: h })).json();
  console.log('after delete, 萌宠 exists?', tree3.expense.some((c) => c.name === '萌宠'), '| first:', tree3.expense[0].name);

  // 清理测试数据
  const list = (await (await fetch(BASE + '/api/transactions?month=2026-10', { headers: h })).json()).list;
  for (const t of list.filter((x) => x.note === '测试地铁' || (x.flow === 'transfer'))) {
    await fetch(BASE + '/api/transactions/' + t.id, { method: 'DELETE', headers: { cookie } });
  }
  console.log('cleaned test txns');
})().catch((e) => { console.error('ERR', e); process.exit(1); });
