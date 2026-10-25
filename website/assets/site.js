/* 数字生活 · 官网脚本（无依赖） */
(function () {
  'use strict';

  /* 顶部提示条轮播 */
  var tickerText = document.getElementById('tickerText');
  var tips = [
    '个人使用完全落在 Cloudflare 免费额度内，无需绑卡',
    '数据 100% 存在你自己的 Cloudflare 账号（D1 + R2），不经过第三方',
    '手机浏览器「添加到主屏幕」，即可当 APP 全屏使用',
    '随手记一句话，AI 自动解析成记账 / 待办 / 备忘',
    '待办与服药到点自动推送提醒（Web Push）'
  ];
  var tipIdx = 0;
  if (tickerText) {
    setInterval(function () {
      tipIdx = (tipIdx + 1) % tips.length;
      tickerText.style.opacity = '0';
      setTimeout(function () {
        tickerText.textContent = tips[tipIdx];
        tickerText.style.opacity = '1';
      }, 400);
    }, 4500);
  }

  /* 导航：滚动阴影 + 移动端开合 */
  var nav = document.getElementById('nav');
  var navToggle = document.getElementById('navToggle');
  var onScroll = function () {
    if (window.scrollY > 8) nav.classList.add('scrolled');
    else nav.classList.remove('scrolled');
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  if (navToggle) {
    navToggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.querySelectorAll('#navLinks a').forEach(function (a) {
      a.addEventListener('click', function () { nav.classList.remove('open'); });
    });
  }

  /* 预览图：打卡热力图（确定性伪随机，视觉自然） */
  var heat = document.getElementById('mockHeat');
  if (heat) {
    var seed = 7;
    var rnd = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    var frag = document.createDocumentFragment();
    for (var i = 0; i < 14 * 7; i++) {
      var cell = document.createElement('i');
      var r = rnd();
      var a = r < 0.16 ? 0 : r < 0.4 ? 0.14 : r < 0.62 ? 0.32 : r < 0.82 ? 0.55 : r < 0.94 ? 0.78 : 1;
      cell.style.setProperty('--a', a);
      frag.appendChild(cell);
    }
    heat.appendChild(frag);
  }

  /* 进场动画 */
  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    /* 同屏成组元素做轻微错峰 */
    var groups = {};
    reveals.forEach(function (el) {
      var rect = el.getBoundingClientRect();
      var key = Math.round((rect.top + window.scrollY) / 90);
      groups[key] = (groups[key] || 0);
      el.style.setProperty('--d', Math.min(groups[key]++ * 0.08, 0.4) + 's');
      io.observe(el);
    });
  } else {
    reveals.forEach(function (el) { el.classList.add('in'); });
  }

  /* 复制 AI Agent 提示词 */
  document.querySelectorAll(".copy-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var target = document.getElementById(btn.getAttribute("data-copy-target"));
      if (!target) return;
      var text = target.textContent.trim();
      var done = function () {
        btn.classList.add("copied");
        btn.textContent = "已复制 ✓";
        setTimeout(function () {
          btn.classList.remove("copied");
          btn.textContent = "复制提示词";
        }, 2000);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
      } else {
        fallbackCopy(text); done();
      }
    });
  });
  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) { /* 忽略 */ }
    document.body.removeChild(ta);
  }

  /* 年份 */
  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
})();
