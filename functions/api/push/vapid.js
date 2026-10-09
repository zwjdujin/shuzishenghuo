import { json } from '../../_lib.js';

// GET /api/push/vapid —— 返回 VAPID 公钥（前端订阅 Push 用）
// 未配置则返回空字符串，前端自动跳过订阅。
export async function onRequestGet(context) {
  const key = (context.env && context.env.VAPID_PUBLIC) || '';
  return json({ publicKey: key });
}
