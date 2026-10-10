// 账户安全页 / 修改密码弹窗 体检页
// 复用真实 index.html + style.css + 真实 app.js，只把 fetch 换成桩，便于真机视口截图与探测。
// hash: #security | #security-modal | #security-night | #security-modal-night
// ⚠️ 输出到仓库根 _preview/（不能放 public/，否则会被 wrangler 一起发布上线）
import fs from 'fs';
import path from 'path';

const root = process.cwd();
let html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');

// 资源路径改为相对 _preview/ 目录
html = html.replace('href="./css/style.css"', 'href="../public/css/style.css"');
html = html.replace(/src="\.\/js\/([^"]+)"/g, 'src="../public/js/$1"');

const DEVICES = [
  { sid: 'a', user: 'admin', ip: '203.0.113.7', terminal: 'Windows · 桌面端', browser: 'Edge', loginAt: '2026-10-10 19:01', lastSeen: '2026-10-10 19:12', current: true },
  { sid: 'b', user: 'admin', ip: '198.51.100.23', terminal: 'Android · 移动端', browser: '微信', loginAt: '2026-10-09 09:02', lastSeen: '2026-10-09 21:40', current: false },
  { sid: 'c', user: 'admin', ip: '192.0.2.55', terminal: 'macOS · 桌面端', browser: 'Safari', loginAt: '2026-10-08 07:30', lastSeen: '2026-10-08 18:11', current: false },
];

// ---- 1) 网络桩：必须在真实脚本之前注入 ----
const stub = `
<script>
(function(){
  var J = function(data, status){
    return new Response(JSON.stringify(data), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
  };
  window.__DEVICES = ${JSON.stringify(DEVICES)};
  window.__CUSTOM_PASS = true;
  var real = window.fetch;
  window.fetch = function(url, opts){
    var u = String(url);
    if (u.indexOf('/api/auth/me') >= 0) return Promise.resolve(J({ authenticated: true, user: 'admin' }));
    if (u.indexOf('/api/sessions') >= 0) {
      if ((opts && opts.method) === 'DELETE') return Promise.resolve(J({ ok: true }));
      return Promise.resolve(J({ devices: window.__DEVICES, customPass: window.__CUSTOM_PASS }));
    }
    if (u.indexOf('/api/auth/password') >= 0) {
      var body = {};
      try { body = JSON.parse(opts.body); } catch(e){}
      if (body.oldPass !== 'init-pass-123') return Promise.resolve(J({ error: '当前密码不正确' }, 400));
      window.__CUSTOM_PASS = true;
      return Promise.resolve(J({ ok: true, revoked: 2 }));
    }
    if (u.indexOf('/api/home') >= 0) return Promise.resolve(J({ error: 'stub' }, 500));
    if (u.indexOf('/api/settings') >= 0) return Promise.resolve(J({ settings: {
      brand_name: '数字生活', brand_avatar: '数', brand_tagline: '把日子过成自己喜欢的样子',
      theme: 'zhiyin', font: 'default', mode: 'light' } }));
    if (u.indexOf('/api/sysinfo') >= 0) return Promise.resolve(J({}));
    if (real) return real.apply(window, arguments);
    return Promise.resolve(J({}, 404));
  };
})();
</script>`;

html = html.replace('<script src="../public/js/lunar.js"></script>', () => stub + '\n  <script src="../public/js/lunar.js"></script>');

// ---- 2) 探针 ----
const probe = `
<script>
(async function(){
  try {
    var $ = function(s){ return document.querySelector(s); };
    var $$ = function(s){ return Array.prototype.slice.call(document.querySelectorAll(s)); };
    var g = function(el, prop){ return el ? getComputedStyle(el).getPropertyValue(prop).trim() : 'N/A'; };
    var rect = function(el){ if(!el) return 'N/A'; var r = el.getBoundingClientRect();
      return 'w=' + Math.round(r.width) + ' h=' + Math.round(r.height) + ' x=' + Math.round(r.left) + ' y=' + Math.round(r.top); };

    await new Promise(function(r){ setTimeout(r, 500); });

    var hash = location.hash || '#security';
    var night = hash.indexOf('night') >= 0;
    document.documentElement.setAttribute('data-mode', night ? 'night' : 'light');
    document.documentElement.removeAttribute('data-mode-auto');

    // 登录外壳
    $('#loginOverlay').hidden = true;
    $('#appShell').hidden = false;
    switchView('settings', { keepTab: true });
    switchProfileTab('security');
    await new Promise(function(r){ setTimeout(r, 400); });

    if (hash.indexOf('modal') >= 0) {
      openPassModal();
      await new Promise(function(r){ setTimeout(r, 200); });
    }

    var out = [];
    out.push('=== hash=' + hash + ' data-mode=' + document.documentElement.getAttribute('data-mode')
      + ' viewport=' + window.innerWidth + 'x' + window.innerHeight + ' ===');
    var de = document.documentElement;
    out.push('doc.scrollWidth/clientWidth = ' + de.scrollWidth + '/' + de.clientWidth
      + (de.scrollWidth > de.clientWidth + 1 ? '  <<< 横向溢出' : ''));

    out.push('--- 元素是否存在 ---');
    ['#changePassBtn','#logoutBtn2','#passModal','#passOld','#passNew','#passConfirm','#passSubmitBtn','#passCancelBtn','#passModalClose','#passError','#passStateHint','#deviceList']
      .forEach(function(s){ out.push(s.padEnd(18) + (($(s)) ? 'OK' : '!! 缺失')); });

    out.push('--- 按钮与提示 ---');
    out.push('.sec-actions     ' + rect($('.sec-actions')) + ' dir=' + g($('.sec-actions'),'flex-direction'));
    out.push('#logoutBtn2      ' + rect($('#logoutBtn2')) + ' bg=' + g($('#logoutBtn2'),'background-color') + ' fg=' + g($('#logoutBtn2'),'color'));
    out.push('#changePassBtn   ' + rect($('#changePassBtn')) + ' bg=' + g($('#changePassBtn'),'background-color') + ' fg=' + g($('#changePassBtn'),'color'));
    out.push('#passStateHint   text="' + ($('#passStateHint') ? $('#passStateHint').textContent : '') + '"');
    out.push('两钮等宽=' + (Math.abs($('#logoutBtn2').getBoundingClientRect().width - $('#changePassBtn').getBoundingClientRect().width) < 1)
      + ' 纵向相邻(修改密码在下)=' + ($('#changePassBtn').getBoundingClientRect().top > $('#logoutBtn2').getBoundingClientRect().bottom - 1));

    out.push('--- 设备列表 ---');
    out.push('#deviceList rows=' + $$('#deviceList .device-item').length
      + ' currentTag=' + $$('#deviceList .dev-current-tag').length);

    if (!$('#passModal').hidden) {
      out.push('--- 修改密码弹窗 ---');
      out.push('.modal-card      ' + rect($('#passModal .modal-card')) + ' bg=' + g($('#passModal .modal-card'),'background-color'));
      out.push('输入框数=' + $$('#passModal input').length
        + ' type=' + $$('#passModal input').map(function(i){ return i.type; }).join(','));
      out.push('#passOld   ' + rect($('#passOld')) + ' bg=' + g($('#passOld'),'background-color'));
      out.push('#passSubmitBtn ' + rect($('#passSubmitBtn')) + ' bg=' + g($('#passSubmitBtn'),'background-color'));
      var mc = $('#passModal .modal-card').getBoundingClientRect();
      out.push('弹窗在视口内=' + (mc.top >= -1 && mc.bottom <= window.innerHeight + 1 && mc.left >= -1 && mc.right <= de.clientWidth + 1));
      // -open 后缀：只截图，不跑交互（保证弹窗保持打开状态）
      var keepOpen = hash.indexOf('open') >= 0;
      if (!keepOpen) {
        // 交互：错误提示
        $('#passOld').value = 'wrong'; $('#passNew').value = 'abcdef'; $('#passConfirm').value = 'abcdef';
        await submitPassChange();
        out.push('错误密码 → #passError hidden=' + $('#passError').hidden + ' text="' + $('#passError').textContent + '"');
        // 交互：成功提交
        $('#passOld').value = 'init-pass-123'; $('#passNew').value = 'new-pass-456'; $('#passConfirm').value = 'new-pass-456';
        await submitPassChange();
        out.push('成功提交 → 弹窗 hidden=' + $('#passModal').hidden
          + ' 提示="' + $('#passStateHint').textContent + '"'
          + ' 设备数=' + $$('#deviceList .device-item').length);
      } else {
        out.push('(保留弹窗打开，跳过交互)');
      }
    }

    var pre = document.createElement('pre'); pre.id = 'report2';
    pre.style.cssText = 'position:fixed;left:-99999px;top:0;width:640px';
    pre.textContent = out.join('\\n');
    document.body.insertBefore(pre, document.body.firstChild);
    document.title = 'REPORT_READY';
  } catch (e) {
    var pe = document.createElement('pre'); pe.id = 'report2';
    pe.textContent = 'SCRIPT ERROR: ' + (e && e.stack ? e.stack : e);
    document.body.insertBefore(pe, document.body.firstChild);
    document.title = 'REPORT_ERROR';
  }
})();
</script>`;

html = html.replace('</body>', () => probe + '\n</body>');

fs.mkdirSync(path.join(root, '_preview'), { recursive: true });
fs.writeFileSync(path.join(root, '_preview/secpreview.html'), html);
console.log('written _preview/secpreview.html');
