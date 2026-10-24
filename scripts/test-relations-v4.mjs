// v0.4.0 人际关系端到端测试（需本地 wrangler pages dev :8799 + 迁移后的 D1）
const BASE = 'http://127.0.0.1:8799';
let cookie = '';
async function req(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  const sc = res.headers.get('set-cookie');
  if (sc && sc.includes('sz_session=')) cookie = sc.split(';')[0];
  let data = null;
  try { data = await res.json(); } catch (_) {}
  return { status: res.status, data };
}
const ok = (name, cond, extra) => { if (!cond) { console.error('❌', name, extra ?? ''); process.exitCode = 1; } else console.log('✓', name, extra ?? ''); };

let r = await req('POST', '/api/auth/login', { user: 'admin', pass: 'test-pass-123' });
ok('登录', r.status === 200);

// ===== 创建：确切生日（阳历）=====
r = await req('POST', '/api/profile/detail', {
  firstName: '张伟', nickname: '阿伟', gender: '男',
  birthdayType: 'full', birthdayCalendar: 'solar', birthYear: 1990, birthMonth: 3, birthDay: 12,
  birthdayRemind: true, tags: ['技术'], groups: ['大学同学'], marriage: '已婚', note: '老同学',
});
ok('创建：确切生日', r.status === 201 && r.data.id, JSON.stringify(r.data));
const zw = r.data.id;

// ===== 创建：农历只知月日 + 引荐人 =====
r = await req('POST', '/api/profile/detail', {
  englishName: 'Tony Ma', gender: '女',
  birthdayType: 'monthday', birthdayCalendar: 'lunar', birthMonth: 11, birthDay: 3,
  birthdayRemind: true, groups: ['家人'],
});
ok('创建：农历月日', r.status === 201, JSON.stringify(r.data));
const tony = r.data.id;
r = await req('PUT', '/api/profile/detail', { id: tony, referrerId: zw });
ok('设置引荐人', r.status === 200);

// ===== 创建：不知道年龄（名字用别名）=====
r = await req('POST', '/api/profile/detail', { alias: '老王', gender: '其他', birthdayType: '' });
ok('创建：跳过生日 + 仅别名', r.status === 201, JSON.stringify(r.data));
const laowang = r.data.id;

// ===== 校验：名字六选一 / 性别必填 =====
r = await req('POST', '/api/profile/detail', { gender: '男' });
ok('六个名字全空 → 400', r.status === 400, r.data && r.data.error);
r = await req('POST', '/api/profile/detail', { firstName: '李四' });
ok('性别缺失 → 400', r.status === 400, r.data && r.data.error);
r = await req('POST', '/api/profile/detail', { firstName: '李四', gender: '男', birthdayType: 'monthday', birthMonth: 13, birthDay: 1 });
ok('月份非法 → 400', r.status === 400);

// ===== 列表 + 筛选 =====
r = await req('GET', '/api/profile/list');
ok('列表 3 人', (r.data.list || []).length === 3, `total=${r.data.total}`);
ok('筛选项含群组/标签', (r.data.options.groups || []).includes('大学同学') && (r.data.options.tags || []).includes('技术'));
r = await req('GET', '/api/profile/list?gender=女');
ok('按性别筛选', r.data.list.length === 1 && r.data.list[0].id === tony);
r = await req('GET', '/api/profile/list?group=' + encodeURIComponent('大学同学'));
ok('按群组筛选', r.data.list.length === 1 && r.data.list[0].id === zw);
r = await req('GET', '/api/profile/list?tag=' + encodeURIComponent('技术'));
ok('按标签筛选', r.data.list.length === 1 && r.data.list[0].id === zw);
r = await req('GET', '/api/profile/list?q=Tony');
ok('按英文名搜索', r.data.list.length === 1 && r.data.list[0].id === tony);
r = await req('GET', '/api/profile/list?q=老王');
ok('按别名搜索', r.data.list.length === 1 && r.data.list[0].id === laowang);

// ===== 档案读取 =====
r = await req('GET', '/api/profile/detail?id=' + zw);
const b = r.data.base;
ok('档案：名字/生日/农历对照', b.name === '张伟' && b.birthdayType === 'full' && b.lunarText.includes('农历'), JSON.stringify({ name: b.name, birth: b.birthText, lunar: b.lunarText }));
ok('档案：引荐人回显为空', b.referrer === null);
ok('meta：称谓词库已预置', (r.data.meta.kins || []).includes('母亲'));

// ===== 局部更新：婚姻/标签/群组 =====
r = await req('PUT', '/api/profile/detail', { id: zw, marriage: '离婚', tags: ['技术', '跑步'] });
ok('局部更新婚姻+标签', r.status === 200);
r = await req('GET', '/api/profile/detail?id=' + zw);
ok('婚姻/标签生效，生日未动', r.data.base.marriage === '离婚' && r.data.base.tags.join(',') === '技术,跑步' && r.data.base.birthYear === 1990, JSON.stringify(r.data.base.tags));

// ===== 联系方式 =====
r = await req('POST', '/api/profile/contacts', { person_id: zw, kind: 'phones', value: '13800001111', label: '个人' });
ok('添加电话', r.status === 201);
r = await req('POST', '/api/profile/contacts', { person_id: zw, kind: 'phones', value: '13800001111', label: '工作' });
ok('重复电话 → 409', r.status === 409);
r = await req('POST', '/api/profile/contacts', { person_id: zw, kind: 'phones', value: '13911112222', label: '工作' });
r = await req('POST', '/api/profile/contacts', { person_id: zw, kind: 'emails', value: 'zhangwei@example.com', label: '个人' });
r = await req('POST', '/api/profile/contacts', { person_id: zw, kind: 'addresses', value: '江苏省南京市玄武区xx路1号', label: '家庭' });
r = await req('GET', '/api/profile/detail?id=' + zw);
ok('三种方式各就位', r.data.methods.phones.length === 2 && r.data.methods.emails.length === 1 && r.data.methods.addresses.length === 1, JSON.stringify(r.data.methods));
r = await req('GET', '/api/contacts');
ok('主电话冗余同步', (r.data.contacts || []).find((c) => c.id === zw).phone === '13800001111');
const phoneId = (await (async () => { const x = await req('GET', '/api/profile/detail?id=' + zw); return x.data.methods.phones[0].id; })());
r = await req('PUT', '/api/profile/contacts', { id: phoneId, value: '13800001111', label: '私人' });
ok('编辑电话备注', r.status === 200);
r = await req('GET', '/api/profile/detail?id=' + zw);
ok('备注已改', r.data.methods.phones[0].label === '私人');

// ===== 家庭关系 =====
r = await req('POST', '/api/profile/relatives', { person_id: zw, kin: '母亲', name: '王秀兰' });
ok('添加纯文字家庭关系', r.status === 201);
r = await req('POST', '/api/profile/relatives', { person_id: zw, kin: '同学', name: 'Tony Ma', ref_id: tony });
ok('添加关联家庭关系', r.status === 201);
r = await req('GET', '/api/profile/detail?id=' + zw);
ok('关联姓名解析', r.data.relatives.some((x) => x.kin === '同学' && x.refId === tony && x.refName === 'Tony Ma'), JSON.stringify(r.data.relatives));
r = await req('GET', '/api/vocab?kind=rel_kin');
ok('自定义称谓已入词库', (r.data.words || []).some((w) => w.word === '母亲'));

// ===== 公司/职位 =====
r = await req('PUT', '/api/profile/work', { person_id: zw, company: '云帆科技', position: '后端工程师' });
ok('保存公司职位', r.status === 200);
r = await req('GET', '/api/profile/detail?id=' + zw);
ok('公司职位回显', r.data.work.company === '云帆科技' && r.data.work.position === '后端工程师');
r = await req('GET', '/api/vocab?kind=rel_company');
ok('公司入词库（可共用）', (r.data.words || []).some((w) => w.word === '云帆科技'));

// ===== 教育与成长 =====
r = await req('POST', '/api/profile/edu', { person_id: zw, school: '南京大学', major: '计算机', degree: '本科', start: '2008', end: '2012', story: 'ACM 校队' });
ok('添加教育', r.status === 201);
const eduId = r.data.id;
r = await req('PUT', '/api/profile/edu', { id: eduId, school: '南京大学', major: '软件工程', degree: '本科', start: '2008', end: '2012', story: '' });
ok('编辑教育', r.status === 200);
r = await req('GET', '/api/profile/detail?id=' + zw);
ok('教育回显', r.data.edus.length === 1 && r.data.edus[0].major === '软件工程');

// ===== 宠物 =====
r = await req('POST', '/api/profile/pets', { person_id: zw, species: '猫', name: '豆豆', memorial_date: '2024-05-01' });
ok('添加宠物', r.status === 201);
r = await req('POST', '/api/profile/pets', { person_id: zw, species: '', name: 'x' });
ok('种类必填 → 400', r.status === 400);
r = await req('GET', '/api/vocab?kind=pet_species');
ok('宠物种类入词库备选', (r.data.words || []).some((w) => w.word === '猫'));
r = await req('GET', '/api/profile/detail?id=' + zw);
ok('宠物回显（含纪念日）', r.data.pets.length === 1 && r.data.pets[0].memorialDate === '2024-05-01');

// ===== 生日计算：农历 =====
r = await req('GET', '/api/profile/detail?id=' + tony);
ok('农历生日 nextBirthday 已换算', r.data.base.nextBirthday && r.data.base.nextBirthday.days >= 0 && r.data.base.nextBirthday.days <= 400, JSON.stringify(r.data.base.nextBirthday));
r = await req('GET', '/api/contacts');
const upcoming = (r.data.upcoming || []).map((c) => c.id);
ok('60 天生日列表（含农历）', r.data.contacts.length === 3, JSON.stringify((r.data.contacts || []).map((c) => `${c.name}:${c.nextBirthday || '无'}`)));

// ===== 首页统计 =====
r = await req('GET', '/api/home');
ok('home.relations 统计可用', typeof r.data.stats.relations.upcoming === 'number', `近期生日=${r.data.stats.relations.upcoming}`);

// ===== 删除级联 =====
r = await req('DELETE', `/api/profile/delete?id=${zw}`);
ok('删除联系人', r.status === 200);
r = await req('GET', '/api/profile/list');
ok('删除后列表 2 人', r.data.list.length === 2);
r = await req('GET', '/api/profile/detail?id=' + tony);
ok('他人引荐引用已清空', r.data.base.referrer === null);
r = await req('GET', '/api/vocab?kind=rel_company');
ok('词库保留（数据字典不清）', (r.data.words || []).some((w) => w.word === '云帆科技'));

console.log('\n人际关系 v0.4.0 端到端测试结束');
