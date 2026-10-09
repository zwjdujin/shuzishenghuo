import { json } from '../../_lib.js';
import { listDataTables, labelOf } from './_tables.js';

// GET /api/data/stats —— 各业务表的数据条数（用于「数据处理」页给出清空前的心理预期）
export async function onRequestGet(context) {
  const { env } = context;
  const names = await listDataTables(env);
  const tables = [];
  let total = 0;

  for (const name of names) {
    let count = 0;
    try {
      const r = await env.DB.prepare(`SELECT COUNT(*) c FROM "${name}"`).first();
      count = r ? Number(r.c || 0) : 0;
    } catch (_) {
      count = 0;
    }
    total += count;
    tables.push({ name, label: labelOf(name), count });
  }

  // 已用条数排前、空表沉底，便于阅读
  tables.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh'));
  return json({ total, tables });
}
