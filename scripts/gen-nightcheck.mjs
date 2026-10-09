// 生成夜间模式核查页：复用真实 index.html 结构 + style.css，禁掉脚本，注入样例数据与探测脚本
import fs from 'fs';
import path from 'path';

const root = process.cwd();
let html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');

// 1. 移除真实脚本（无后端会报错，影响判定）
html = html.replace(/\s*<script src="\.\/js\/[^"]+"><\/script>/g, '');

// 2. 隐藏登录遮罩 + 显示外壳
html = html.replace(
  '<div class="login-overlay" id="loginOverlay">',
  '<div class="login-overlay" id="loginOverlay" style="display:none">'
);
html = html.replace('<div class="app-shell" id="appShell" hidden>', '<div class="app-shell" id="appShell">');

const inject = `
<style>.view{display:none}.view.active{display:block!important}
/* 关掉过渡/动画，保证探测取到的是终值而不是动画中间帧 */
*,*::before,*::after{transition:none!important;animation:none!important}</style>
<script>
(function(){
 try{
  var $ = function(s){ return document.querySelector(s); };
  var $$ = function(s){ return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var g = function(el, prop){ return el ? getComputedStyle(el).getPropertyValue(prop).trim() : 'N/A'; };

  // ==== 注入样例数据 ====
  $('#todayTasks').innerHTML =
    '<div class="todo-row"><span class="dot"></span><div class="main"><b>给妈妈打个电话</b><small>人际关系 · P1</small></div><span class="when">今天 20:00</span><button class="done-btn"><svg><use href="#i-check"/></svg></button></div>' +
    '<div class="todo-row overdue"><span class="dot"></span><div class="main"><b>交水费</b><small>生活 · P0</small></div><span class="when">昨天</span><button class="done-btn"><svg><use href="#i-check"/></svg></button></div>';

  $('#pendingHabits').innerHTML =
    '<div class="checkin-card"><div class="ci-main"><span class="ci-icon" style="background:#627a671f;color:#627a67"><svg><use href="#i-sprout"/></svg></span><div class="ci-text"><b>读书</b><small><span class="cat-tag">学习</span> 按次打卡 · 目标 3 次</small></div></div>' +
    '<div class="ci-actions"><div class="count-control"><button class="chk-btn round">\\u2212</button><span class="cnt">1<i> / 3 次</i></span><button class="chk-btn">打卡 +1</button></div></div></div>';

  // 成长打卡页「今日待完成」：按次 / 睡眠三件套 / 按时长三种控件
  var gt = $('#growthToday');
  if (gt) gt.innerHTML =
    '<div class="checkin-card"><div class="ci-main"><span class="ci-icon" style="background:#627a671f;color:#627a67"><svg><use href="#i-sprout"/></svg></span><div class="ci-text"><b>读书</b><small><span class="cat-tag">学习</span> 按次打卡 · 目标 3 次</small></div></div>' +
    '<div class="ci-actions"><div class="count-control"><button class="chk-btn round">\\u2212</button><span class="cnt">1<i> / 3 次</i></span><button class="chk-btn">打卡 +1</button></div></div></div>' +
    '<div class="checkin-card"><div class="ci-main"><span class="ci-icon" style="background:#4d30451f;color:#952e3a"><svg><use href="#i-moon"/></svg></span><div class="ci-text"><b>睡眠三件套</b><small><span class="cat-tag">睡眠</span> 目标 23:00 前睡 / 07:00 前起 / 12:30-14:00 午睡</small></div></div>' +
    '<div class="ci-actions tri"><button class="chk-btn">早睡</button><button class="chk-btn on">早起</button><button class="chk-btn">午睡</button></div></div>';

  $('#todoList').innerHTML =
    '<div class="todo-row"><button class="todo-check"><svg><use href="#i-check"/></svg></button><div class="todo-main"><b>买菜</b><div class="todo-meta"><span class="prio-pill P1">P1 重要不紧急</span><span class="todo-pill">生活</span></div></div><button class="icon-btn del"><svg><use href="#i-x"/></svg></button></div>' +
    '<div class="todo-row overdue"><button class="todo-check"><svg><use href="#i-check"/></svg></button><div class="todo-main"><b>交水费</b><div class="todo-meta"><span class="prio-pill P0">P0 重要且紧急</span><span class="todo-pill high">逾期 2026-10-08</span></div></div><button class="icon-btn del"><svg><use href="#i-x"/></svg></button></div>';

  $('#contactList').innerHTML =
    '<button class="contact-row"><span class="contact-avatar" style="background:#b65f42">张</span><div class="contact-main"><b>张伟</b><div class="contact-meta"><span class="contact-badge">朋友</span><span class="contact-badge">35 岁</span></div></div><div class="rel-row-right"><span class="contact-phone">138 0000 0000</span><span class="rel-bday">12 天后生日</span><small class="rel-bday-lunar">公历 2026-10-21</small><button class="icon-btn"><svg><use href="#i-edit"/></svg></button><button class="icon-btn"><svg><use href="#i-x"/></svg></button></div></button>';

  // ==== 模式 ====
  var wantNight = location.hash.indexOf('night') >= 0;
  document.documentElement.setAttribute('data-mode', wantNight ? 'night' : 'light');
  document.documentElement.removeAttribute('data-mode-auto');

  // ==== 视图（hash 里带 view-xxx 则切到该视图）====
  var mv = (location.hash.match(/view-(\\w+)/) || [])[1] || 'home';
  $$('.view').forEach(function(v){ v.classList.remove('active'); });
  var target = $('#view-' + mv);
  if (target) target.classList.add('active');

  // ==== 探测 ====
  var out = [];
  var rows = [
    ['stat-icon.terracotta 待办提醒图标', $('.stat-icon.terracotta')],
    ['stat-icon.clay 人际关系图标', $('.stat-icon.clay')],
    ['#todayTasks .todo-row 今天要处理', $('#todayTasks .todo-row')],
    ['#todayTasks .todo-row .done-btn', $('#todayTasks .todo-row .done-btn')],
    ['.chk-btn.round 打卡减少', $('.chk-btn.round')],
    ['.chk-btn 打卡按钮', $$('.chk-btn')[1]],
    ['#todoList .todo-row 今日待办', $('#todoList .todo-row')],
    ['#todoList .todo-check', $('#todoList .todo-check')],
    ['#todoList .prio-pill', $('#todoList .prio-pill')],
    ['#todoList .todo-pill.high 逾期', $('#todoList .todo-pill.high')],
    ['日历 .seg-item(周历/月历)', $('#view-calendar .seg-item')],
    ['日历 .cal-year 年份', $('#calYear')],
    ['日历 .cal-month-sel 月份', $('#calMonth')],
    ['日历 .cal-picker 容器', $('.cal-picker')],
    ['人际关系 .seg-item(详细/精简)', $('#view-relations .seg-item')],
    ['人际关系 .contact-row 联系人', $('#contactList .contact-row')],
    ['人际关系 .icon-btn(行内按钮)', $('#contactList .icon-btn')],
    ['面板 .panel 参照', $('.panel')],
    ['卡片 .stat-card 参照', $('.stat-card')],
    ['stat-icon.plum 账本图标', $('.stat-icon.plum')],
    ['stat-icon.sage 打卡图标', $('.stat-icon.sage')],
    ['stat-icon.sand 药箱图标', $('.stat-icon.sand')],
    ['stat-icon.terra 日历图标', $('.stat-icon.terra')],
    ['quick-action.terracotta', $('.quick-action.terracotta')],
    ['.insight-card 轻提醒', $('.insight-card')],
    ['.btn.ghost 次级按钮', $('.btn.ghost')],
    ['.calToday/今天 按钮', $('#calToday')],
    ['.rel-search .inp 搜索框', $('#relSearch')],
    ['日历 .seg-item.active 选中', $('#view-calendar .seg-item.active')],
    ['人际关系 .seg-item.active 选中', $('#view-relations .seg-item.active')]
  ];
  // 相对亮度与对比度（WCAG）
  var lin = function(c){ c/=255; return c<=.03928 ? c/12.92 : Math.pow((c+.055)/1.055,2.4); };
  var lum = function(rgb){ var m=(rgb||'').match(/\\d+(\\.\\d+)?/g); if(!m||m.length<3) return null; return .2126*lin(+m[0])+.7152*lin(+m[1])+.0722*lin(+m[2]); };
  var ratio = function(a,b){ var la=lum(a),lb=lum(b); if(la==null||lb==null) return null; var hi=Math.max(la,lb), lo=Math.min(la,lb); return (hi+.05)/(lo+.05); };

  out.push('=== ' + (wantNight ? 'NIGHT' : 'LIGHT') + ' / view=' + mv + ' ===');
  rows.forEach(function(r){
    var el = r[1];
    var bg = g(el,'background-color'), fg = g(el,'color');
    // 若自身背景透明，取最近的不透明祖先作为实际底色
    var eb = el, bg0 = bg;
    while (eb && /rgba\\(0, 0, 0, 0\\)|transparent/.test(bg0)) { eb = eb.parentElement; if(!eb) break; bg0 = getComputedStyle(eb).backgroundColor; }
    var cr = ratio(fg, bg0);
    out.push(r[0].padEnd(30) + ' bg=' + bg.padEnd(21) + ' fg=' + fg.padEnd(20)
      + ' 对比=' + (cr==null?'--':cr.toFixed(2))
      + (cr!=null && cr<3 ? '  <<< 低' : ''));
  });
  out.push('DIAG --terra-soft@root=' + getComputedStyle(document.documentElement).getPropertyValue('--terra-soft').trim()
    + ' | @qa=' + getComputedStyle($('.quick-action.terracotta')).getPropertyValue('--terra-soft').trim()
    + ' | qa.bg=' + g($('.quick-action.terracotta'),'background-color')
    + ' | qa.transition=' + g($('.quick-action.terracotta'),'transition-property'));
  // 自动巡检：扫当前视图内所有元素与伪元素，找出「在夜间仍然很亮」的底色
  var bright = [];
  var seen = {};
  var scan = function(root){
    var els = root.querySelectorAll('*');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var st = getComputedStyle(el);
      var bg = st.backgroundColor;
      var m = bg.match(/\\d+(\\.\\d+)?/g);
      if (!m || m.length < 3) continue;
      var a = m.length > 3 ? parseFloat(m[3]) : 1;
      if (a < 0.5) continue;
      var L = .2126*lin(+m[0]) + .7152*lin(+m[1]) + .0722*lin(+m[2]);
      if (L < 0.28) continue;
      var key = el.tagName + '.' + (el.className || '') + '|' + bg;
      if (seen[key]) continue;
      seen[key] = 1;
      bright.push(L.toFixed(2) + '  ' + el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ').join('.') : '') + '  bg=' + bg);
    }
  };
  scan(document);
  out.push('--- 夜间亮底巡检（相对亮度 ≥ 0.28 视为异常）---');
  out.push(bright.length ? bright.sort().reverse().join('\\n') : '（无）');

  var pre = document.createElement('pre');
  pre.id = 'report2';
  pre.style.cssText = 'position:fixed;left:-99999px;top:0;width:620px;background:#fff;color:#111;font:12px/1.5 monospace;padding:10px;white-space:pre-wrap';
  pre.textContent = out.join('\\n');
  document.body.insertBefore(pre, document.body.firstChild);
  document.title = 'REPORT_READY';
 }catch(e){
  var pe = document.createElement('pre');
  pe.id = 'report2';
  pe.style.cssText = 'background:#fff;color:#900;font:12px monospace;padding:10px';
  pe.textContent = 'SCRIPT ERROR: ' + (e && e.stack ? e.stack : e);
  document.body.insertBefore(pe, document.body.firstChild);
  document.title = 'REPORT_ERROR';
 }
})();
</script>
`;

// 注意：用函数形式替换，否则 inject 里的 $ 会被当成替换模式（$$ -> $、$& -> 匹配串）
html = html.replace('</body>', () => inject + '</body>');
fs.writeFileSync(path.join(root, 'public/_nightcheck.html'), html);
console.log('written public/_nightcheck.html');
