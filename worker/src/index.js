// 数字生活 · 统一提醒调度 Worker（v0.6.0）
// Cron 每分钟触发，分两类任务：
//   分钟级（精确到 hh:mm）：待办提醒、服药提醒
//   日检级（每天一次，app_settings.last_daily_run 幂等标记）：
//     生日提醒（未来 1/3/7 天）、keep-in-touch 超期联系人、药品临期/低库存
// 推送 payload 的 url 使用 hash 路由，点通知直达对应页面。
import webpush from 'web-push';

function pad(n) { return String(n).padStart(2, '0'); }
const WK_CN = ['日', '一', '二', '三', '四', '五', '六'];

export default {
  async scheduled(event, env, ctx) {
    // Workers 运行时是 UTC；用户按北京时间填时间，统一 +8h 后取「北京墙钟」
    const now = new Date(Date.now() + 8 * 3600 * 1000);
    const hhmm = pad(now.getUTCHours()) + ':' + pad(now.getUTCMinutes());
    const today = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
    const dowCN = WK_CN[now.getUTCDay()];            // 日一二三四五六
    const dowNum = ((now.getUTCDay() + 6) % 7) + 1;  // 1=周一…7=周日（与 med_plans.days 口径一致）

    if (!env.VAPID_PUBLIC || !env.VAPID_PRIVATE || !env.VAPID_MAILTO) {
      console.warn('VAPID 未配置，跳过推送');
      return;
    }
    webpush.setVapidDetails(env.VAPID_MAILTO, env.VAPID_PUBLIC, env.VAPID_PRIVATE);

    const pushes = []; // {title, body, tag, url}

    // ===== 分钟级 1：待办提醒（今天及以前、时间匹配、remind=1）=====
    try {
      const rows = (await env.DB.prepare(
        'SELECT id,title FROM todos WHERE done=0 AND todo_date<=? AND todo_time=? AND remind=1'
      ).bind(today, hhmm).all()).results || [];
      if (rows.length) {
        pushes.push({
          title: `待办提醒 · 共 ${rows.length} 项`,
          body: rows.slice(0, 8).map((r) => r.title).join('\n') + (rows.length > 8 ? `\n…等 ${rows.length} 项` : ''),
          tag: 'szsh-push', url: './#/todos',
        });
      }
    } catch (e) { console.error('todos scan', e && e.message); }

    // ===== 分钟级 2：服药提醒（今日应服、时间匹配）=====
    try {
      const plans = (await env.DB.prepare(
        'SELECT p.id, p.dose, p.time_of_day t, p.days, m.name med FROM med_plans p '
        + 'JOIN medicines m ON m.id = p.medicine_id WHERE p.active = 1 AND p.time_of_day = ?'
      ).bind(hhmm).all()).results || [];
      const due = plans.filter((p) => String(p.days || '1,2,3,4,5,6,7').split(',').map(Number).includes(dowNum));
      if (due.length) {
        pushes.push({
          title: '该吃药啦 · ' + due.map((p) => p.med).slice(0, 3).join('、'),
          body: due.slice(0, 5).map((p) => `${p.med}${p.dose ? ' ' + p.dose : ''}`).join('\n'),
          tag: 'szsh-med', url: './#/medicine',
        });
      }
    } catch (e) { console.error('medplans scan', e && e.message); }

    // ===== 日检级（每天 06:00 后跑一次，幂等标记；06:00 = 早起收提醒）=====
    if (now.getUTCHours() >= 6) {
      let lastDaily = '';
      try {
        const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key='last_daily_run'").first();
        lastDaily = row ? row.value : '';
      } catch (_) {}
      if (lastDaily !== today) {
        await dailyJobs(env, today, dowCN, pushes);
        try {
          await env.DB.prepare(
            "INSERT INTO app_settings(key, value) VALUES ('last_daily_run', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
          ).bind(today).run();
        } catch (_) {}
      }
    }

    if (!pushes.length) return;
    const subs = (await env.DB.prepare('SELECT endpoint,p256dh,auth FROM push_subscriptions').all()).results || [];
    if (!subs.length) return;

    await Promise.all(pushes.flatMap((p) => subs.map(async (s) => {
      const sub = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
      try {
        await webpush.sendNotification(sub, JSON.stringify(p));
      } catch (e) {
        const code = e && (e.statusCode || e.status);
        if (code === 404 || code === 410) {
          try { await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').bind(s.endpoint).run(); } catch (_) {}
        } else {
          console.error('push fail', e && e.message);
        }
      }
    })));
  },

  // 手动访问验证 Worker 在线（非必需）
  async fetch() {
    return new Response('shuzishenghuo push worker (unified scheduler v0.6.0)', { status: 200 });
  },
};

// ===== 日检任务：生日 / keep-in-touch / 药品库存与临期 =====
async function dailyJobs(env, today, dowCN, pushes) {
  const addDays = (base, n) => {
    const d = new Date(Date.parse(base + 'T00:00:00Z') + n * 86400000);
    return d.toISOString().slice(0, 10);
  };

  // 生日：未来 7 天内（含今天）有生日的联系人（含农历换算，逐日扫 7 天）
  try {
    const contacts = (await env.DB.prepare(
      'SELECT name, birthday_type, birthday_calendar, birth_month, birth_day FROM contacts '
      + "WHERE birthday_type != '' AND is_deceased = 0 AND birthday_remind = 1"
    ).all()).results || [];
    const solar = contacts.filter((c) => c.birthday_calendar !== 'lunar');
    const hits = [];
    for (let i = 0; i <= 7; i++) {
      const d = addDays(today, i);
      const mmdd = d.slice(5);
      solar.forEach((c) => {
        if (pad(c.birth_month) + '-' + pad(c.birth_day) === mmdd) {
          hits.push({ name: c.name, date: d, days: i });
        }
      });
    }
    // 农历生日：用农历月日匹配公历换算（worker 侧内置轻量换算表成本高，
    // 采用近似策略：按公历月日提醒，正文标注「生日」；精确农历推送待 lunar 表引入）
    const lunar = contacts.filter((c) => c.birthday_calendar === 'lunar');
    for (let i = 0; i <= 7; i++) {
      const d = addDays(today, i);
      const mmdd = d.slice(5);
      lunar.forEach((c) => {
        if (pad(c.birth_month) + '-' + pad(c.birth_day) === mmdd) {
          hits.push({ name: c.name, date: d, days: i, lunarGuess: true });
        }
      });
    }
    if (hits.length) {
      pushes.push({
        title: `🎂 生日提醒 · ${hits.length} 位`,
        body: hits.slice(0, 6).map((h) =>
          `${h.name}：${h.days === 0 ? '就是今天' : h.date.slice(5).replace('-', '月') + '日（' + h.days + '天后）'}${h.lunarGuess ? '（农历生日按公历近似）' : ''}`
        ).join('\n'),
        tag: 'szsh-bday', url: './#/relations',
      });
    }
  } catch (e) { console.error('birthday scan', e && e.message); }

  // keep-in-touch：超期未联系
  try {
    const rows = (await env.DB.prepare(
      'SELECT name, touch_cadence c, last_touched FROM contacts WHERE touch_cadence > 0 AND is_deceased = 0'
    ).all()).results || [];
    const todayMs = Date.parse(today);
    const due = rows
      .map((r) => ({
        name: r.name,
        over: r.last_touched ? Math.round((todayMs - Date.parse(r.last_touched)) / 86400000) - r.c : 365 - r.c,
      }))
      .filter((r) => r.over >= 0)
      .sort((a, b) => b.over - a.over)
      .slice(0, 8);
    if (due.length) {
      pushes.push({
        title: `💬 该联系一下啦 · ${due.length} 位`,
        body: due.map((r) => `${r.name}（超 ${r.over} 天）`).join('、'),
        tag: 'szsh-touch', url: './#/relations',
      });
    }
  } catch (e) { console.error('touch scan', e && e.message); }

  // 药品：低库存 + 30 天内临期
  try {
    const meds = (await env.DB.prepare('SELECT name, stock, stock_min, expiry FROM medicines').all()).results || [];
    const low = meds.filter((m) => m.stock != null && m.stock <= (m.stock_min || 0));
    const exp = meds.filter((m) => m.expiry && m.expiry >= today && m.expiry <= addDays(today, 30));
    const parts = [];
    if (low.length) parts.push('库存不足：' + low.map((m) => m.name).join('、'));
    if (exp.length) parts.push('即将过期：' + exp.map((m) => `${m.name}（${m.expiry}）`).join('、'));
    if (parts.length) {
      pushes.push({ title: '💊 药箱提醒', body: parts.join('\n'), tag: 'szsh-med-daily', url: './#/medicine' });
    }
  } catch (e) { console.error('med daily scan', e && e.message); }
}
