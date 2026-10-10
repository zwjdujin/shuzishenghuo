import { listDataTables, labelOf } from './_tables.js';
import { ADMIN_PASS_KEY } from '../../_lib.js';

function stamp(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}`;
}

// GET /api/data/export —— 导出全部数据为 JSON 文件（浏览器直接下载）
export async function onRequestGet(context) {
  const { env } = context;
  const names = await listDataTables(env);

  const tables = {};
  for (const name of names) {
    try {
      const rows = (await env.DB.prepare(`SELECT * FROM "${name}"`).all()).results || [];
      tables[name] = rows;
    } catch (_) {
      tables[name] = [];
    }
  }

  // 一并带上品牌与外观偏好（虽不参与清空，但备份里有它才算完整）
  // 注意：排除管理员密码哈希 —— 备份文件可能被下载 / 转发，凭证不应外泄
  let settings = {};
  try {
    const rows = (await env.DB.prepare('SELECT key, value FROM app_settings').all()).results || [];
    rows.forEach((r) => { if (r.key !== ADMIN_PASS_KEY) settings[r.key] = r.value; });
  } catch (_) { /* 忽略 */ }

  const labels = {};
  names.forEach((n) => { labels[n] = labelOf(n); });

  const payload = {
    app: 'shuzishenghuo',
    appName: '数字生活',
    format: 1,
    exportedAt: new Date().toISOString(),
    note: '本文件为「数字生活」全量数据备份，包含全部业务表与品牌/外观设置（不含登录会话）。',
    labels,
    settings,
    tables,
  };

  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="shuzishenghuo-backup-${stamp()}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
