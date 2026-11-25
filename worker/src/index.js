// 数字生活 · 统一提醒调度 Worker（v0.6.0）
// Cron 每分钟触发，分两类任务：
//   分钟级（精确到 hh:mm）：待办提醒、服药提醒
//   日检级（每天一次，app_settings 幂等标记）：
//     生日提醒（未来 1/3/7 天）、药品临期/低库存（v0.5.31 起移除 keep-in-touch）
//     每日自动备份（v0.5.44：D1 快照 → R2 backup/d1/，R2 附件镜像 → backup/files/）
// 推送 payload 的 url 使用 hash 路由，点通知直达对应页面。
import webpush from 'web-push';
import { toLunarOf, lunarMD } from './lunar.js';

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

    // ===== 每日自动备份（不依赖 VAPID/推送配置，独立幂等标记）=====
    try {
      await dailyBackup(env, today);
    } catch (e) { console.error('daily backup', e && e.message); }

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
        // v0.5.56（审计 P2-4）：先写幂等标记再跑日检。此前是跑完再写、写入失败被 catch 吞掉——
        // 标记写不进去时，当天 06:00 之后每一分钟都会重跑 dailyJobs，生日/药箱推送每分钟重发一次。
        // 现在标记写不进去就本轮放弃（宁可当天少一次日检，也不连续骚扰）；日检内部再自带 try/catch。
        let marked = false;
        try {
          await env.DB.prepare(
            "INSERT INTO app_settings(key, value) VALUES ('last_daily_run', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
          ).bind(today).run();
          marked = true;
        } catch (e) {
          console.error('daily marker write failed:', e && e.message);
        }
        if (marked) {
          try {
            await dailyJobs(env, today, dowCN, pushes);
          } catch (e) { console.error('daily jobs', e && e.message); }
        }
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

// ===== 每日自动备份（v0.5.44）=====
// D1 全量快照 → R2 backup/d1/YYYY-MM-DD.json（保留最近 14 份）
// R2 附件镜像 → backup/files/<原键>（每日覆盖既有对象；镜像不删除，误删的原文件可在镜像里找回）
// 幂等标记：app_settings.last_backup_run。备份与推送相互独立，VAPID 未配置也照常执行。
const BACKUP_EXCLUDE = new Set(['sessions', 'app_settings', 'api_tokens', 'd1_migrations', '_cf_KV']);
const BACKUP_KEEP_DAYS = 14;

async function dailyBackup(env, today) {
  if (!env.DB || !env.BUCKET) return;   // 未绑定 R2（旧版 worker 未重新部署）时静默跳过
  let last = '';
  try {
    const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key='last_backup_run'").first();
    last = row ? row.value : '';
  } catch (_) {}
  if (last === today) return;

  // ---- D1 全量快照（与 /api/data/export 同口径：业务表 + 脱敏后的 app_settings）----
  const tables = {};
  try {
    const rows = (await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).results || [];
    const names = rows.map((r) => r.name)
      .filter((n) => n && !n.startsWith('sqlite_') && !n.startsWith('_cf_') && !BACKUP_EXCLUDE.has(n));
    for (const n of names) {
      try { tables[n] = (await env.DB.prepare(`SELECT * FROM "${n}"`).all()).results || []; } catch (_) { tables[n] = []; }
    }
  } catch (_) {}
  const settings = {};
  try {
    const rows = (await env.DB.prepare('SELECT key, value FROM app_settings').all()).results || [];
    rows.forEach((r) => {
      if (r.key === 'admin_pass_hash') return;                 // 密码哈希不入备份
      if (r.key === 'ai_models') {                             // 大模型 API Key 打码
        try {
          const models = JSON.parse(r.value);
          if (Array.isArray(models)) r.value = JSON.stringify(models.map((m) => ({ ...m, apiKey: '' })));
          else return;
        } catch (_) { return; }
      }
      settings[r.key] = r.value;
    });
  } catch (_) {}

  const key = `backup/d1/${today}.json`;
  const payload = {
    app: 'shuzishenghuo',
    kind: 'auto-backup',
    exportedAt: new Date().toISOString(),
    note: '每日自动备份（push Worker cron 生成，存于 R2 backup/ 前缀）。管理员密码哈希与大模型 API Key 不入备份。',
    settings,
    tables,
  };
  await env.BUCKET.put(key, JSON.stringify(payload));

  // ---- R2 附件镜像：backup/files/<原键> ----
  try {
    let cursor;
    do {
      const page = await env.BUCKET.list(cursor ? { cursor } : {});
      for (const obj of page.objects || []) {
        if (obj.key.startsWith('backup/')) continue;           // 不镜像备份自身
        try { await env.BUCKET.copy(`backup/files/${obj.key}`, obj.key); } catch (_) {}
      }
      cursor = page.truncated ? page.cursor : '';
    } while (cursor);
  } catch (e) { console.error('r2 mirror', e && e.message); }

  // ---- 快照保留最近 14 份（键名含日期，字典序即时间序）----
  try {
    const cutoff = new Date(Date.parse(today + 'T00:00:00Z') - (BACKUP_KEEP_DAYS - 1) * 86400000)
      .toISOString().slice(0, 10);
    const page = await env.BUCKET.list({ prefix: 'backup/d1/' });
    for (const obj of page.objects || []) {
      const d = (obj.key.match(/backup\/d1\/(\d{4}-\d{2}-\d{2})\.json$/) || [])[1];
      if (d && d < cutoff) { try { await env.BUCKET.delete(obj.key); } catch (_) {} }
    }
  } catch (_) {}

  await env.DB.prepare(
    "INSERT INTO app_settings(key, value) VALUES ('last_backup_run', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
  ).bind(today).run();
  console.log('daily backup ok:', key);
}

// ===== 日检任务：生日 / 药品库存与临期 =====
// v0.5.56（审计 P2-4）：
//   1) 生日只推 D-0 / D-1 / D-3 / D-7 各一次（此前 for i in 0..7 连推 8 天，同一个生日每天一条）；
//   2) 农历生日按天换算精确匹配（此前把农历月日当公历月日匹配，差一两个月是常态）；
const BIRTHDAY_DAYS = [0, 1, 3, 7];
async function dailyJobs(env, today, dowCN, pushes) {
  const addDays = (base, n) => {
    const d = new Date(Date.parse(base + 'T00:00:00Z') + n * 86400000);
    return d.toISOString().slice(0, 10);
  };

  // 生日：未来 D-0/D-1/D-3/D-7 各检查一次（阳历按公历月日匹配；农历逐日换算后匹配，闰月不当作同月）
  try {
    const contacts = (await env.DB.prepare(
      'SELECT name, birthday_type, birthday_calendar, birth_month, birth_day FROM contacts '
      + "WHERE birthday_type != '' AND is_deceased = 0 AND birthday_remind = 1"
    ).all()).results || [];
    const hits = [];
    for (const i of BIRTHDAY_DAYS) {
      const d = addDays(today, i);
      const mmdd = d.slice(5);
      const lunar = toLunarOf(d);
      contacts.forEach((c) => {
        if (c.birthday_calendar === 'lunar') {
          if (lunar && !lunar.isLeap && lunar.month === c.birth_month && lunar.day === c.birth_day) {
            hits.push({ name: c.name, date: d, days: i, lunar: true, text: `农历${lunarMD(c.birth_month, c.birth_day)}` });
          }
        } else if (pad(c.birth_month) + '-' + pad(c.birth_day) === mmdd) {
          hits.push({ name: c.name, date: d, days: i });
        }
      });
    }
    if (hits.length) {
      pushes.push({
        title: `🎂 生日提醒 · ${hits.length} 位`,
        body: hits.slice(0, 6).map((h) => {
          const when = h.days === 0 ? '就是今天'
            : h.days === 1 ? '明天'
            : `${h.days} 天后（${h.date.slice(5).replace('-', '月')}日）`;
          return `${h.name}：${when}${h.lunar ? `（${h.text}）` : ''}`;
        }).join('\n'),
        tag: 'szsh-bday', url: './#/relations',
      });
    }
  } catch (e) { console.error('birthday scan', e && e.message); }

  // 药品：低库存 + 30 天内临期 + 已过期（v0.5.56 新增：过期药品此前完全不再提醒，健康相关）
  try {
    const meds = (await env.DB.prepare('SELECT name, stock, stock_min, expiry FROM medicines').all()).results || [];
    const low = meds.filter((m) => m.stock != null && m.stock <= (m.stock_min || 0));
    const exp = meds.filter((m) => m.expiry && m.expiry >= today && m.expiry <= addDays(today, 30));
    const expired = meds.filter((m) => m.expiry && /^\d{4}-\d{2}-\d{2}$/.test(String(m.expiry)) && m.expiry < today);
    const parts = [];
    if (low.length) parts.push('库存不足：' + low.map((m) => m.name).join('、'));
    if (expired.length) parts.push(`已过期 ${expired.length} 件，请清理：` + expired.slice(0, 8).map((m) => `${m.name}（${m.expiry}）`).join('、'));
    if (exp.length) parts.push('即将过期：' + exp.map((m) => `${m.name}（${m.expiry}）`).join('、'));
    if (parts.length) {
      pushes.push({ title: '💊 药箱提醒', body: parts.join('\n'), tag: 'szsh-med-daily', url: './#/medicine' });
    }
  } catch (e) { console.error('med daily scan', e && e.message); }
}
