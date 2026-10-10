// 我的账本页 体检页
// 复用真实 index.html + style.css + 真实 app.js，只把 fetch 换成桩，便于真机视口截图与探测。
// hash: #ledger | #ledger-night | #ledger-modal | #ledger-modal-night
// ⚠️ 输出到仓库根 _preview/（不能放 public/，否则会被 wrangler 一起发布上线）
import fs from 'fs';
import path from 'path';

const root = process.cwd();
let html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');

html = html.replace('href="./css/style.css"', 'href="../public/css/style.css"');
html = html.replace(/src="\.\/js\/([^"]+)"/g, 'src="../public/js/$1"');

// ---- 样例流水：覆盖多分类、人情、借还款、大额、小额 ----
const MONTH = '2026-10';
const TXNS = [
  { id: 1,  flow: 'income',  amount: 12800, category: '工资',   date: '2026-10-08', note: '十月工资',      account: '招商银行' },
  { id: 2,  flow: 'income',  amount: 800,   category: '红包',   date: '2026-10-02', note: '表妹结婚',      account: '微信' },
  { id: 3,  flow: 'expense', amount: 3200,  category: '居住',   date: '2026-10-01', note: '房租',          account: '招商银行' },
  { id: 4,  flow: 'expense', amount: 1680,  category: '餐饮',   date: '2026-10-09', note: '聚餐·老陈',      account: '微信' },
  { id: 5,  flow: 'expense', amount: 1266,  category: '餐饮',   date: '2026-10-07', note: '一周伙食',      account: '微信' },
  { id: 6,  flow: 'expense', amount: 980,   category: '购物',   date: '2026-10-05', note: '秋装',          account: '支付宝' },
  { id: 7,  flow: 'expense', amount: 600,   category: '人情',   date: '2026-10-03', note: '@张伟 生日礼物',  account: '人情往来' },
  { id: 8,  flow: 'expense', amount: 500,   category: '借还款', date: '2026-10-04', note: '@李娜 借出',     account: '人情往来' },
  { id: 9,  flow: 'expense', amount: 420,   category: '交通',   date: '2026-10-06', note: '加油',          account: '支付宝' },
  { id: 10, flow: 'expense', amount: 288,   category: '医疗',   date: '2026-10-02', note: '体检挂号',      account: '医保卡' },
  { id: 11, flow: 'expense', amount: 199,   category: '娱乐',   date: '2026-10-08', note: '电影+爆米花',    account: '微信' },
  { id: 12, flow: 'expense', amount: 128,   category: '教育',   date: '2026-10-06', note: '专业书',        account: '支付宝' },
  { id: 13, flow: 'expense', amount: 66,    category: '其他',   date: '2026-10-09', note: '快递+杂项',      account: '微信' },
  { id: 14, flow: 'expense', amount: 45,    category: '餐饮',   date: '2026-10-09', note: '下午茶',        account: '微信' },
  { id: 15, flow: 'expense', amount: 25,    category: '交通',   date: '2026-10-09', note: '地铁',          account: '支付宝' },
];

const CATEGORIES = {
  expense: ['餐饮', '交通', '购物', '居住', '娱乐', '医疗', '教育', '人情', '借还款', '其他'],
  income: ['工资', '奖金', '兼职', '理财', '红包', '其他'],
};

const stub = `
<script>
(function(){
  var J = function(data, status){
    return new Response(JSON.stringify(data), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
  };
  var TXNS = ${JSON.stringify(TXNS)};
  var MONTH = ${JSON.stringify(MONTH)};
  var CATEGORIES = ${JSON.stringify(CATEGORIES)};

  function summaryOf(list){
    var income = 0, expense = 0, byCat = {}, byCatIn = {};
    list.forEach(function(t){
      if (t.flow === 'income') { income += t.amount; byCatIn[t.category] = (byCatIn[t.category] || 0) + t.amount; }
      else { expense += t.amount; byCat[t.category] = (byCat[t.category] || 0) + t.amount; }
    });
    var mk = function(obj, base){
      return Object.keys(obj).map(function(name){
        return { name: name, value: obj[name], pct: base ? obj[name] / base : 0 };
      }).sort(function(a, b){ return b.value - a.value; });
    };
    return { income: income, expense: expense, balance: income - expense, count: list.length,
      catStats: mk(byCat, expense), incomeCatStats: mk(byCatIn, income) };
  }

  window.fetch = function(url, opts){
    var u = String(url);
    if (u.indexOf('/api/auth/me') >= 0) return Promise.resolve(J({ authenticated: true, user: 'admin' }));
    if (u.indexOf('/api/settings') >= 0) {
      if ((opts && opts.method) === 'PUT') return Promise.resolve(J({ settings: {} }));
      return Promise.resolve(J({ settings: {
        brand_name: '数字生活', brand_avatar: '数', brand_tagline: '把日子过成自己喜欢的样子',
        theme: 'zhiyin', font: 'default', mode: 'light', ledger_budget: '8000' } }));
    }
    if (u.indexOf('/api/transactions') >= 0) {
      if (opts && (opts.method === 'PUT' || opts.method === 'DELETE')) return Promise.resolve(J({ ok: true }, 200));
      var m = u.match(/month=(\\d{4}-\\d{2})/);
      var month = m ? m[1] : MONTH;
      var list = TXNS.filter(function(t){ return t.date.slice(0, 7) === month; })
        .sort(function(a, b){ return a.date === b.date ? b.id - a.id : (a.date < b.date ? 1 : -1); });
      var s = summaryOf(list);
      // 近 6 个月：当前月用真实数据，其它月给示例走势
      var trend = [];
      var base = new Date(2026, 9, 1);
      for (var i = 5; i >= 0; i--) {
        var d = new Date(base.getFullYear(), base.getMonth() - i, 1);
        var key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        if (key === month) trend.push({ month: key, income: s.income, expense: s.expense, balance: s.balance });
        else {
          var inc = [9800, 11200, 12800, 9600, 10400, 12300][5 - i];
          var exp = [6400, 7200, 8100, 5900, 7600, 8800][5 - i];
          trend.push({ month: key, income: inc, expense: exp, balance: inc - exp });
        }
      }
      var payees = {};
      list.forEach(function(t){
        if (t.note && t.note.indexOf('@张伟') === 0) payees[t.id] = { id: 11, name: '张伟' };
        if (t.note && t.note.indexOf('@李娜') === 0) payees[t.id] = { id: 12, name: '李娜' };
        if (t.note && t.note.indexOf('@妈妈') === 0) payees[t.id] = { id: 13, name: '妈妈' };
      });
      var social = { out: 0, in: 0, count: 0 };
      list.forEach(function(t){
        if (t.account === '人情往来' || t.category === '人情' || t.category === '借还款') {
          social.count++;
          if (t.flow === 'income') social.in += t.amount; else social.out += t.amount;
        }
      });
      var days = new Date(Number(month.slice(0,4)), Number(month.slice(5,7)), 0).getDate();
      return Promise.resolve(J({
        month: month,
        list: list,
        summary: {
          income: s.income, expense: s.expense, balance: s.balance, count: list.length,
          avgDaily: s.expense / days,
          maxExpense: list.filter(function(t){ return t.flow === 'expense'; })
            .reduce(function(a, t){ return Math.max(a, t.amount); }, 0),
        },
        catStats: s.catStats,
        incomeCatStats: s.incomeCatStats,
        trend: trend,
        accounts: ['默认账户','现金','微信','支付宝','招商银行','医保卡','人情往来'],
        payees: payees,
        budget: 8000,
        social: social,
        categories: CATEGORIES
      }));
    }
    if (u.indexOf('/api/home') >= 0) return Promise.resolve(J({ error: 'stub' }, 500));
    if (u.indexOf('/api/sysinfo') >= 0) return Promise.resolve(J({}));
    return Promise.resolve(J({}, 404));
  };
})();
</script>`;

html = html.replace('<script src="../public/js/lunar.js"></script>', () => stub + '\n  <script src="../public/js/lunar.js"></script>');

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

    var hash = location.hash || '#ledger';
    var night = hash.indexOf('night') >= 0;
    document.documentElement.setAttribute('data-mode', night ? 'night' : 'light');
    document.documentElement.removeAttribute('data-mode-auto');

    $('#loginOverlay').hidden = true;
    $('#appShell').hidden = false;
    switchView('ledger');
    await new Promise(function(r){ setTimeout(r, 700); });

    if (hash.indexOf('income') >= 0) {
      var incBtn = document.querySelector('.led-donut-seg [data-leddonut="income"]');
      if (incBtn) incBtn.click();
      await new Promise(function(r){ setTimeout(r, 250); });
    }
    if (hash.indexOf('edit') >= 0) {
      var firstRow = document.querySelector('#ledgerList .txn-row:not(.locked)');
      if (firstRow) firstRow.click();
      await new Promise(function(r){ setTimeout(r, 250); });
    }
    if (hash.indexOf('modal') >= 0) {
      $('#addTxnBtn').click();
      await new Promise(function(r){ setTimeout(r, 250); });
    }
    if (hash.indexOf('budget') >= 0) {
      var bBtn = document.getElementById('lbSetBtn');
      if (bBtn) bBtn.click();
      await new Promise(function(r){ setTimeout(r, 200); });
    }

    var out = [];
    var de = document.documentElement;
    out.push('=== hash=' + hash + ' data-mode=' + document.documentElement.getAttribute('data-mode')
      + ' viewport=' + window.innerWidth + 'x' + window.innerHeight + ' ===');
    out.push('doc.scrollWidth/clientWidth = ' + de.scrollWidth + '/' + de.clientWidth
      + (de.scrollWidth > de.clientWidth + 1 ? '  <<< 横向溢出' : ''));

    out.push('--- 概览 4 格 ---');
    out.push('#ledgerStats  ' + rect($('#ledgerStats')) + ' cols=' + g($('#ledgerStats'),'grid-template-columns'));
    out.push('.ls 数量=' + $$('#ledgerStats .ls').length);
    $$('#ledgerStats .ls').forEach(function(el, i){
      out.push('  ls[' + i + '] ' + rect(el) + ' text="' + el.textContent.replace(/\\s+/g,' ').trim().slice(0,48) + '"');
    });

    out.push('--- 月预算 ---');
    var lb = $('#ledgerBudget');
    out.push('#ledgerBudget ' + rect(lb) + ' text="' + (lb ? lb.textContent.replace(/\\s+/g,' ').trim().slice(0,60) : '') + '"');
    out.push('.lb-bar i  width=' + (lb && lb.querySelector('.lb-bar i') ? g(lb.querySelector('.lb-bar i'),'width') : 'N/A')
      + ' bg=' + (lb && lb.querySelector('.lb-bar i') ? g(lb.querySelector('.lb-bar i'),'background-color') : 'N/A')
      + ' class=' + (lb && lb.querySelector('.lb-bar i') ? lb.querySelector('.lb-bar i').className : 'N/A'));

    out.push('--- 近 6 个月趋势 ---');
    out.push('#ledgerTrend  ' + rect($('#ledgerTrend')) + ' cols=' + $$('#ledgerTrend .tc-col').length
      + ' bars=' + $$('#ledgerTrend .tc-bar').length);
    var tcols = $$('#ledgerTrend .tc-col');
    if (tcols.length) {
      out.push('  col[0] ' + rect(tcols[0]) + ' lab="' + tcols[0].querySelector('.tc-lab').textContent + '"');
      out.push('  col[last] ' + rect(tcols[tcols.length-1]) + ' lab="' + tcols[tcols.length-1].querySelector('.tc-lab').textContent
        + '" cur=' + tcols[tcols.length-1].classList.contains('cur'));
      var b0 = tcols[tcols.length-1].querySelectorAll('.tc-bar');
      out.push('  柱高=' + Array.prototype.slice.call(b0).map(function(b){ return Math.round(b.getBoundingClientRect().height) + 'px'; }).join('/')
        + ' 列高=' + Math.round(tcols[tcols.length-1].querySelector('.tc-bars').getBoundingClientRect().height) + 'px');
    }
    out.push('  tip=' + ($('#ledgerTrend p') ? $('#ledgerTrend p').textContent.replace(/\\s+/g,' ').trim().slice(0,90) : 'N/A'));

    out.push('--- 构成环图（重点）---');
    var chart = $('#ledgerChart');
    out.push('#ledgerChart   ' + rect(chart) + ' display=' + g(chart,'display') + ' dir=' + g(chart,'flex-direction'));
    var svg = chart ? chart.querySelector('svg') : null;
    out.push('svg ' + rect(svg) + ' class=' + (svg ? svg.getAttribute('class') : 'N/A') + ' viewBox=' + (svg ? svg.getAttribute('viewBox') : 'N/A'));
    out.push('svg 实际尺寸合格(>=120px)=' + (svg ? svg.getBoundingClientRect().width >= 120 : false));
    if (svg) {
      var circles = svg.querySelectorAll('circle');
      out.push('扇形数=' + circles.length);
      Array.prototype.slice.call(circles).forEach(function(c, i){
        out.push('  seg[' + i + '] class=' + c.getAttribute('class')
          + ' stroke=' + g(c,'stroke') + ' sw=' + g(c,'stroke-width')
          + ' dash="' + c.getAttribute('stroke-dasharray') + '"');
      });
      out.push('中心文案="' + (svg.querySelector('.dt-lab') ? svg.querySelector('.dt-lab').textContent : '') + ' / '
        + (svg.querySelector('.dt-val') ? svg.querySelector('.dt-val').textContent : '') + '"'
        + ' dt-lab fill=' + (svg.querySelector('.dt-lab') ? g(svg.querySelector('.dt-lab'),'fill') : 'N/A'));
    }
    var legend = chart ? chart.querySelector('.donut-legend') : null;
    out.push('.donut-legend  ' + rect(legend) + ' rows=' + (legend ? legend.querySelectorAll('.dl').length : 0));
    if (legend) {
      Array.prototype.slice.call(legend.querySelectorAll('.dl')).slice(0, 3).forEach(function(d, i){
        out.push('  dl[' + i + '] ' + rect(d) + ' text="' + d.textContent.replace(/\\s+/g,' ').trim() + '"'
          + ' 条形=' + Math.round(d.querySelector('.dl-bar i').getBoundingClientRect().width) + 'px');
      });
    }
    out.push('#ledDonutTitle = ' + ($('#ledDonutTitle') ? $('#ledDonutTitle').textContent : 'N/A'));
    out.push('panel 宽=' + (chart && chart.closest('.panel') ? Math.round(chart.closest('.panel').getBoundingClientRect().width) : 'N/A'));

    out.push('--- 流水 ---');
    out.push('#ledCount=' + ($('#ledCount') ? $('#ledCount').textContent : '') + '  days=' + $$('#ledgerList .txn-day').length
      + ' rows=' + $$('#ledgerList .txn-row').length);
    $$('#ledgerList .txn-row').slice(0, 4).forEach(function(r, i){
      out.push('  row[' + i + '] ' + rect(r) + ' class="' + r.className + '" text="'
        + r.textContent.replace(/\\s+/g,' ').trim().slice(0,54) + '"');
    });
    out.push('@人名药丸=' + $$('#ledgerList .txn-pill').map(function(p){ return p.textContent; }).join(',')
      + ' | 人际同步标记=' + $$('#ledgerList .txn-pill.sync').length
      + ' | 可删除按钮=' + $$('#ledgerList .txn-row .icon-btn.del').length);
    var ic = $('#ledgerList .txn-ic');
    out.push('.txn-ic bg=' + g(ic,'background-color') + ' color=' + g(ic,'color'));

    out.push('--- 弹窗 ---');
    if (hash.indexOf('modal') >= 0 || hash.indexOf('edit') >= 0) {
      out.push('#txnModal card ' + rect($('#txnModal .modal-card')) + ' title=' + $('#txnModalTitle').textContent
        + ' submit=' + $('#txnSubmitBtn').textContent);
      out.push('分类芯片=' + $$('#txnCatChips .cat-chip').map(function(c){ return c.textContent + (c.classList.contains('on')?'*':''); }).join(','));
      out.push('账户选项=' + $$('#txnAcctSel option').map(function(o){ return o.value; }).join(',')
        + ' 选中=' + $('#txnAcctSel').value);
      out.push('金额=' + $('#txnAmount').value + ' 日期=' + $('#txnDate').value);
      var mc = $('#txnModal .modal-card').getBoundingClientRect();
      out.push('弹窗在视口内=' + (mc.top >= -1 && mc.bottom <= window.innerHeight + 1 && mc.left >= -1 && mc.right <= de.clientWidth + 1));
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
fs.writeFileSync(path.join(root, '_preview/ledgerpreview.html'), html);
console.log('written _preview/ledgerpreview.html');
