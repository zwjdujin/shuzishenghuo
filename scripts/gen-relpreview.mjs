// 人际关系页 / 编辑档案页 手机端排版体检页
// 复用真实 index.html 骨架 + style.css + profile.js，喂样例数据后渲染，
// 用于 playwright / Edge --headless=old 取计算样式 / 截图。
// hash: #list | #edit-base | #edit-rel | #edit-work | #edit-pref ...
// ⚠️ 输出到仓库根 _preview/（**不能**放 public/）——wrangler pages deploy ./public 会把
//    public 下所有文件原样上传，放进去就等于把验证页发布到线上。
import fs from 'fs';
import path from 'path';

const root = process.cwd();
let html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');

// 资源路径改为相对 _preview/ 目录
html = html.replace('href="./css/style.css"', 'href="../public/css/style.css"');

// 去掉真实脚本（避免登录/后端请求）
html = html.replace(/\s*<script src="\.\/js\/[^"]+"><\/script>/g, '');
// 显示外壳
html = html.replace(
  '<div class="login-overlay" id="loginOverlay">',
  '<div class="login-overlay" id="loginOverlay" style="display:none">'
);
html = html.replace('<div class="app-shell" id="appShell" hidden>', '<div class="app-shell" id="appShell">');
html = html.replace('<div class="app-shell" id="appShell" hidden="">', '<div class="app-shell" id="appShell">');

const LIST = [
  { id: 1, name: '欧阳娜娜', alias: '娜娜', relation: '同学', level: '核心', gender: '女', age: 28,
    province: '浙江', city: '杭州', job: '自由摄影师 / 自媒体创作者', phone: '138 8888 8888',
    nextBirthday: { days: 0, full: '2026-10-09 今天', lunar: { short: '八月廿九' } } },
  { id: 2, name: '张伟', alias: '老张', relation: '朋友', level: '重要', gender: '男', age: 35,
    province: '广东', city: '深圳', job: '产品经理', phone: '139 0000 1234',
    nextBirthday: { days: 12, full: '2026-10-21', lunar: { short: '九月初十' } } },
  { id: 3, name: '司马相如', alias: '相如哥', relation: '合作伙伴', level: '弱连接', gender: '男', age: 41,
    province: '四川', city: '成都', job: '供应链总监', phone: '',
    nextBirthday: null },
  { id: 4, name: '李思', alias: '', relation: '同事', level: '普通', gender: '女', age: 30,
    province: '上海', city: '上海', job: '交互设计师', phone: '137 2211 3344',
    nextBirthday: { days: 156, full: '2027-03-14', lunar: { short: '二月初七' } } }
];

const DETAIL = {
  base: { name: '欧阳娜娜', alias: '娜娜', gender: '女', birthday: '1998-10-09', age: 28,
    province: '浙江', city: '杭州', job: '自由摄影师', company: '个人工作室',
    native: '浙江温州', page: 'https://example.com/na', idcard: '', idcardBirthday: '',
    showLunar: true, lunar: { full: '戊寅年八月廿九', short: '八月廿九', animal: '虎' },
    phones: [{ id: 1, v: '138 8888 8888', ok: 1 }, { id: 2, v: '010-88886666', ok: 0 }],
    emails: [{ id: 1, v: 'na@example.com', ok: 1 }],
    wechats: [{ id: 1, v: 'nana_photo', ok: 1 }],
    langs: ['普通话', '英语', '日语'],
    nextBirthday: { days: 0, full: '2026-10-09', age: 29, lunar: { short: '八月廿九', animal: '虎' } } },
  rel: { type: '同学', level: '核心', via: '学校', since: '2016 年', scene: '大学同班', status: '活跃',
    score: '5', intro: '王老师', note: '' },
  edus: [{ id: 1, school: '中国美术学院', major: '摄影', degree: '本科', start: '2016', end: '2020', story: '大三赴日本交换一年' }],
  work: { company: '个人工作室', dept: '创作部', title: '主理人', rank: '', city: '杭州',
    field: '商业摄影 / 内容创作', give: '拍摄资源、内容策划', infl: '小红书 12 万粉', bound: '不接受纯免费合作' },
  family: { father: '欧阳光明', mother: '陈丽', spouse: '未婚', child: '—', sibling: '独生女', live: '杭州',
    events: '2020 年毕业定居杭州', pet: '猫「豆豆」· 英短 · 2021-04' },
  pref: { foods: ['清淡', '喜欢日料'], drinks: ['手冲', '龙井'], size: 'M', shoes: '37',
    hobbies: ['摄影', '徒步', '养猫'], life: '每周三晚夜跑', social: '偏好小聚' },
  trait: { tags: ['外向', '热情', '乐观'], style: '直接，微信优先', reply: '白天秒回', value: '体验优先',
    comfort: '5', taboo: '不聊前任' },
  dates: { birth: '10-09', anniv: '', work: '', meet: '2016-09', greet: '', cycle: '每月一次', stale: '2026-09-20', node: '' },
  files: [],
  relatives: [{ id: 1, name: '张伟', kin: '朋友', note: '介绍认识', linked: true, refId: 2 }],
  promises: [{ id: 1, side: '我', what: '帮她翻拍老照片', due: '2026-10-20', status: '进行中', todoId: 3, note: '', done: 0 }],
  money: [{ id: 1, type: 'gift_out', amount: 520, note: '生日礼物', date: '2026-10-01' }],
  interacts: [{ id: 1, kind: '聚餐', date: '2026-09-28', place: '湖滨银泰', who: '娜娜、张伟', topic: '生活', quality: '愉快', summary: '聊了最近的拍摄计划' }]
};

const inject = `
<style>
.view{display:none}.view.active{display:block!important}
*,*::before,*::after{transition:none!important;animation:none!important}
#report2{position:fixed;left:-99999px;top:0;width:640px}
</style>
<script>
window.__PF_NAMES = {2:'张伟'};
window.api = async function(u){
  if (String(u).indexOf('/api/vocab') === 0) return { json: async function(){ return { grouped: {} }; } };
  return { json: async function(){ return { list: window.__PF_LIST, options: {
    surnames:['欧','张','李'], genders:['男','女'], ageBands:['20-29'], relations:['朋友','同学'],
    provinces:['浙江','广东'], cities:['杭州','深圳'], levels:['核心','重要'] } }; } };
};
window.toast = function(){}; window.markSynced = function(){}; window.switchView = function(){};
window.esc = function(s){ return String(s==null?'':s); };
window.$ = function(s){ return document.querySelector(s); };
window.$$ = function(s){ return Array.prototype.slice.call(document.querySelectorAll(s)); };
window.money = function(n){ n=Number(n)||0; return '\\u00a5'+n.toLocaleString('zh-CN'); };
</script>
<script src="../public/js/profile.js"></script>
<script>
(async function(){
 try{
  var $ = function(s){ return document.querySelector(s); };
  var $$ = function(s){ return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var g = function(el, prop){ return el ? getComputedStyle(el).getPropertyValue(prop).trim() : 'N/A'; };
  window.__PF_LIST = ${JSON.stringify(LIST)};

  var hash = location.hash || '#list';
  // 显示人际关系视图
  $$('.view').forEach(function(v){ v.classList.remove('active'); });
  var target = $('#view-relations'); if (target) target.classList.add('active');

  if (hash.indexOf('list') >= 0) {
    await pfLoadList();
    $('#relFilters').hidden = false;
  } else {
    PF.pid = 1;
    $('#relListView').hidden = true;
    $('#relProfileView').hidden = false;
    await pfLoadOptions();
    PF.data = ${JSON.stringify(DETAIL)};
    pfRenderAll();
    var m = (hash.match(/edit-(\\w+)/) || [])[1] || 'base';
    pfPickMod(m);
  }

  // ==== 溢出探测 ====
  var out = [];
  out.push('=== hash=' + hash + ' viewport=' + window.innerWidth + 'x' + window.innerHeight + ' ===');
  var docEl = document.documentElement;
  out.push('document.scrollWidth=' + docEl.scrollWidth + ' clientWidth=' + docEl.clientWidth
    + (docEl.scrollWidth > docEl.clientWidth + 1 ? '  <<< 横向溢出' : ''));
  var overflowing = [];
  var all = document.querySelectorAll('#view-relations *');
  for (var i = 0; i < all.length; i++) {
    var el = all[i];
    if (el.offsetParent === null && g(el,'position') !== 'fixed') continue;
    var r = el.getBoundingClientRect();
    if (r.right > docEl.clientWidth + 1 || r.left < -1) {
      overflowing.push(el.tagName.toLowerCase() + '.' + String(el.className||'').split(' ').join('.')
        + '  L=' + Math.round(r.left) + ' R=' + Math.round(r.right) + ' W=' + Math.round(r.width));
    }
  }
  out.push('--- 越界元素 (' + overflowing.length + ') ---');
  out.push(overflowing.slice(0,40).join('\\n') || '（无）');

  // 关键元素几何
  var rect = function(el){ if(!el) return 'N/A'; var r=el.getBoundingClientRect();
    return 'w='+Math.round(r.width)+' h='+Math.round(r.height)+' x='+Math.round(r.left); };
  out.push('--- 关键几何 ---');
  out.push('.contact-row      ' + rect($('#contactList .contact-row')));
  out.push('.contact-main     ' + rect($('#contactList .contact-main')));
  out.push('.rel-row-right    ' + rect($('#contactList .rel-row-right')));
  out.push('.contact-phone    ' + rect($('#contactList .contact-phone')));
  out.push('.rel-bday-lunar   ' + rect($('#contactList .rel-bday-lunar')));
  out.push('.field-grid       ' + rect($('.field-grid')) + ' cols=' + g($('.field-grid'),'grid-template-columns'));
  out.push('.bday-box         ' + rect($('.bday-box')) );
  out.push('.pf-hero          ' + rect($('.pf-hero')));
  out.push('.pf-hero-tags     ' + rect($('.pf-hero-tags')));
  out.push('.rel-two          ' + rect($('.rel-two')) + ' cols=' + g($('.rel-two'),'grid-template-columns'));
  out.push('.bday-grid        ' + rect($('.bday-grid')) + ' cols=' + g($('.bday-grid'),'grid-template-columns'));
  out.push('.rel-filters      ' + rect($('.rel-filters')) + ' cols=' + g($('.rel-filters'),'grid-template-columns'));
  out.push('.pf-vocab .add-row ' + rect($('.pf-vocab .add-row')));
  out.push('.vocab            ' + rect($('.vocab')));
  out.push('.cal-actions(工具栏) ' + rect($('#relListView .cal-actions')) );
  out.push('.growth-head      ' + rect($('.growth-head')));

  var pre = document.createElement('pre'); pre.id='report2';
  pre.style.cssText='position:fixed;left:-99999px;top:0;width:640px;background:#fff;color:#111;font:12px/1.5 monospace;padding:10px;white-space:pre-wrap';
  pre.textContent = out.join('\\n');
  document.body.insertBefore(pre, document.body.firstChild);
  document.title='REPORT_READY';
 }catch(e){
  var pe=document.createElement('pre'); pe.id='report2';
  pe.style.cssText='background:#fff;color:#900;font:12px monospace;padding:10px';
  pe.textContent='SCRIPT ERROR: '+(e&&e.stack?e.stack:e);
  document.body.insertBefore(pe, document.body.firstChild);
  document.title='REPORT_ERROR';
 }
})();
</script>
`;

html = html.replace('</body>', () => inject + '</body>');
fs.mkdirSync(path.join(root, '_preview'), { recursive: true });
fs.writeFileSync(path.join(root, '_preview/relpreview.html'), html);
console.log('written _preview/relpreview.html');
