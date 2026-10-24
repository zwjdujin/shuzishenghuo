// 数字生活 · 推送调度 Worker（B 档：后台到点推送）
// 每分钟被 Cron 触发，查「今天 + 时间匹配 + remind=1」的待办，
// 通过 Web Push 推送给所有订阅设备。
import webpush from 'web-push';

function pad(n) { return String(n).padStart(2, '0'); }

export default {
  async scheduled(event, env, ctx) {
    // Workers 运行时是 UTC；用户按北京时间填 todo_time，统一 +8h 后取「北京墙钟」，
    // 否则所有到点提醒都会偏移 8 小时。
    const now = new Date(Date.now() + 8 * 3600 * 1000);
    const hhmm = pad(now.getUTCHours()) + ':' + pad(now.getUTCMinutes());
    const today = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;

    if (!env.VAPID_PUBLIC || !env.VAPID_PRIVATE || !env.VAPID_MAILTO) {
      console.warn('VAPID 未配置，跳过推送');
      return;
    }
    webpush.setVapidDetails(env.VAPID_MAILTO, env.VAPID_PUBLIC, env.VAPID_PRIVATE);

    const subs = (await env.DB.prepare('SELECT endpoint,p256dh,auth FROM push_subscriptions').all()).results || [];
    if (!subs.length) return;

    const rows = (await env.DB.prepare(
      "SELECT id,title,todo_time FROM todos WHERE done=0 AND todo_date<=? AND todo_time=? AND remind=1"
    ).bind(today, hhmm).all()).results || [];
    if (!rows.length) return;

    const title = `待办提醒 · 共 ${rows.length} 项`;
    const body = rows.slice(0, 8).map((r) => (r.todo_time ? r.todo_time + ' ' : '') + r.title).join('\n') +
      (rows.length > 8 ? `\n…等 ${rows.length} 项` : '');
    const payload = JSON.stringify({ title, body, tag: 'szsh-push', url: './' });

    await Promise.all(subs.map(async (s) => {
      const sub = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
      try {
        await webpush.sendNotification(sub, payload);
      } catch (e) {
        // 订阅已失效（清浏览器数据 / 重新注册等）→ 从库中清理，避免死订阅累积
        const code = e && (e.statusCode || e.status);
        if (code === 404 || code === 410) {
          try { await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').bind(s.endpoint).run(); } catch (_) {}
        } else {
          console.error('push fail', e && e.message);
        }
      }
    }));
  },

  // 允许手动访问以验证 Worker 在线（非必需）
  async fetch() {
    return new Response('shuzishenghuo push worker', { status: 200 });
  },
};
