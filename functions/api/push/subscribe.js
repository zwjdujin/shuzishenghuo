import { json } from '../../_lib.js';

// POST /api/push/subscribe —— 保存浏览器 Push 订阅（登录后调用）
// body: PushSubscription { endpoint, keys: { p256dh, auth } }
export async function onRequestPost(context) {
  const { env, request } = context;
  let sub;
  try { sub = await request.json(); } catch (_) { return json({ error: 'bad body' }, 400); }
  if (!sub || !sub.endpoint) return json({ error: 'missing endpoint' }, 400);

  try {
    await env.DB.prepare(
      `INSERT INTO push_subscriptions(endpoint, p256dh, auth, created_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh, auth=excluded.auth`
    )
      .bind(sub.endpoint, (sub.keys && sub.keys.p256dh) || '', (sub.keys && sub.keys.auth) || '')
      .run();
    return json({ ok: true });
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 500);
  }
}
