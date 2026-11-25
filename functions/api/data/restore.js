import { json, parseCookie, decodeToken } from '../../_lib.js';
import { TABLE_LABELS, EXCLUDE, labelOf } from './_tables.js';

// ===== v0.5.56 备份恢复导入（审计 P1-5：「备份只能导出、不能恢复」是产品核心缺口） =====
// POST /api/data/restore?mode=preview —— 上传备份 JSON（/api/data/export 的输出格式），
//   返回结构校验与逐表行数预览，不写库。
// POST /api/data/restore?mode=confirm&confirm=RESTORE_DATA —— 同一 body：
//   1) 先把当前库全量快照写到 R2 backup/d1/pre-restore-<ts>.json（保底可回退）；
//   2) 清空业务表，按「父表在前」的顺序重放备份（D1 强制外键，batch 即事务）；
//   3) app_settings 只恢复白名单键（密码哈希 / AI 模型 / 幂等标记绝不覆盖）；
//   4) 删除除当前会话外的全部会话——其它设备需重新登录，防止恢复后串号。
// 备份里的附件只有 DB 行（contact_files），文件本体不在 JSON 里；如需找回用 Worker 每日
// 镜像（R2 backup/files/）。未知表 / 未知列跳过并在响应里说明。

const CONFIRM = 'RESTORE_DATA';

// 插入顺序：父表在前（contacts → contact_*；habits → habit_logs；todos → todo_steps；
// medicines → med_plans → med_logs；txn_categories 有 parent_id 自引用，行内两遍插入）
const PARENT_ORDER = ['contacts', 'txn_categories', 'todo_lists', 'habits', 'todos', 'medicines', 'vocab'];
// app_settings 绝不从备份恢复的键：
//   admin_pass_hash —— 密码哈希（安全数据，导出时本就被排除）
//   ai_models      —— 导出时 API Key 已打码，恢复会拿空 Key 覆盖现用配置
//   last_*_run     —— 幂等标记，恢复成旧日期会让日检/备份重跑或漏跑
const SETTINGS_SKIP = new Set(['admin_pass_hash', 'ai_models', 'last_daily_run', 'last_backup_run']);

// 当前库中实际存在的业务表（按恢复时的插入顺序排列）
async function orderedExistingTables(env) {
  const rows = (await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().catch(() => ({ results: [] }))).results || [];
  const present = new Set(rows.map((r) => r.name));
  const known = Object.keys(TABLE_LABELS).filter((n) => present.has(n) && n !== 'push_subscriptions');
  const head = PARENT_ORDER.filter((n) => known.includes(n));
  const tail = known.filter((n) => !head.includes(n)).sort();
  return [...head, ...tail];
}

async function columnsOf(env, table) {
  const rows = (await env.DB.prepare(`SELECT name FROM pragma_table_info('${table}')`).all().catch(() => ({ results: [] }))).results || [];
  return rows.map((r) => r.name);
}

// 恢复前快照：当前业务表全量导出 → R2（失败则中止恢复，宁可不动库）
async function snapshotToR2(env) {
  if (!env.BUCKET || typeof env.BUCKET.put !== 'function') {
    return { key: '', skipped: '未绑定 R2（BUCKET）' };
  }
  const names = await orderedExistingTables(env);
  const tables = {};
  for (const n of names) {
    tables[n] = (await env.DB.prepare(`SELECT * FROM "${n}"`).all().catch(() => ({ results: [] }))).results || [];
  }
  const key = `backup/d1/pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const payload = {
    app: 'shuzishenghuo',
    kind: 'pre-restore-snapshot',
    exportedAt: new Date().toISOString(),
    note: '恢复备份前自动生成的当前库快照（POST /api/data/restore confirm 阶段写入）。',
    tables,
  };
  await env.BUCKET.put(key, JSON.stringify(payload));
  return { key, rows: names.reduce((s, n) => s + (tables[n] || []).length, 0) };
}

function insertStmt(env, table, cols, row) {
  const use = cols.filter((c) => Object.prototype.hasOwnProperty.call(row, c));
  if (!use.length) return null;
  const sql = `INSERT INTO "${table}" (${use.map((c) => `"${c}"`).join(', ')}) VALUES (${use.map(() => '?').join(', ')})`;
  const vals = use.map((c) => {
    const v = row[c];
    // 备份来自 JSON 导出，理论只有 string/number/null；其余类型降级为字符串防绑库报错
    return v === null || typeof v === 'number' || typeof v === 'string' ? v : String(v);
  });
  return env.DB.prepare(sql).bind(...vals);
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const mode = (url.searchParams.get('mode') || 'preview') === 'confirm' ? 'confirm' : 'preview';

  let body = null;
  try { body = await request.json(); } catch (_) { return json({ error: '请求体应为备份 JSON' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body) || !body.tables || typeof body.tables !== 'object') {
    return json({ error: '这不是有效的「数字生活」备份文件（缺少 tables 字段）' }, 400);
  }
  if (mode === 'confirm' && String(url.searchParams.get('confirm') || '') !== CONFIRM) {
    return json({ error: '缺少确认标记，操作已取消' }, 400);
  }
  const backupTables = body.tables;

  const existing = await orderedExistingTables(env);
  const colsCache = {};
  for (const name of existing) colsCache[name] = await columnsOf(env, name);

  // ---- 结构校验 + 预览（两阶段共用；preview 阶段到这就返回）----
  const warnings = [];
  const preview = [];
  let total = 0;
  for (const name of existing) {
    const rows = backupTables[name];
    if (!Array.isArray(rows)) {
      warnings.push(`${labelOf(name)}：备份里没有这个表，恢复后现有数据会被清空`);
      preview.push({ name, label: labelOf(name), rows: 0, missing: true });
      continue;
    }
    const badRows = rows.filter((r) => !r || typeof r !== 'object' || Array.isArray(r)).length;
    if (badRows) warnings.push(`${labelOf(name)}：${badRows} 行不是对象，会被跳过`);
    const cols = colsCache[name];
    let droppedCols = 0;
    rows.forEach((r) => { if (r && typeof r === 'object' && !Array.isArray(r)) droppedCols += Object.keys(r).filter((k) => !cols.includes(k)).length; });
    if (droppedCols) warnings.push(`${labelOf(name)}：${droppedCols} 个字段在当前表结构中不存在，会被忽略`);
    const n = Math.max(0, rows.length - badRows);
    preview.push({ name, label: labelOf(name), rows: n });
    total += n;
  }
  const unknownTables = Object.keys(backupTables).filter((n) => !TABLE_LABELS[n] || EXCLUDE.has(n));
  if (unknownTables.length) warnings.push(`备份里 ${unknownTables.length} 张表不属于当前业务表（如 ${unknownTables.slice(0, 3).join('、')}），将被跳过`);

  const settingsKeys = (body.settings && typeof body.settings === 'object')
    ? Object.keys(body.settings).filter((k) => !SETTINGS_SKIP.has(k))
    : [];

  if (mode === 'preview') {
    return json({ ok: true, preview, total, warnings, settingsKeys, confirmWord: '恢复', note: '预览不写库；确认阶段会先快照当前数据到 R2 再覆盖恢复' });
  }

  // ---- 确认阶段：快照 → 清空 → 重放 → 设置 → 吊销其它会话 ----
  let snapshot;
  try {
    snapshot = await snapshotToR2(env);
  } catch (e) {
    console.error('restore snapshot failed', e && e.message);
    return json({ error: '恢复前的当前数据快照写入 R2 失败，已中止（未改动任何数据）：' + (e && e.message ? e.message : '') }, 500);
  }

  // 1) 清空（子表先删更稳；全部 CASCADE/SET NULL，顺序其实无碍）
  const delOrder = [...existing].reverse();
  try {
    await env.DB.batch(delOrder.map((name) => env.DB.prepare(`DELETE FROM "${name}"`)));
  } catch (e) {
    console.error('restore wipe failed', e && e.message);
    return json({ error: '清空旧数据失败（快照已存 ' + (snapshot.key || 'R2') + '）：' + (e && e.message ? e.message : '') }, 500);
  }

  // 2) 重放（父表在前；txn_categories 自引用两遍：先无父行再有父行；分批提交，每批 ≤ 100 条语句）
  const restored = {};
  let statementsTotal = 0;
  const CHUNK = 100;
  try {
    let chunk = [];
    const flush = async () => {
      if (chunk.length) { await env.DB.batch(chunk); statementsTotal += chunk.length; chunk = []; }
    };
    for (const name of existing) {
      const rows = Array.isArray(backupTables[name]) ? backupTables[name] : [];
      const cols = colsCache[name];
      const valid = rows.filter((r) => r && typeof r === 'object' && !Array.isArray(r));
      let ordered = valid;
      if (name === 'txn_categories') {
        const noParent = valid.filter((r) => !r.parent_id);
        const hasParent = valid.filter((r) => r.parent_id);
        ordered = [...noParent, ...hasParent];
      }
      let count = 0;
      for (const row of ordered) {
        const st = insertStmt(env, name, cols, row);
        if (!st) continue;
        chunk.push(st);
        count++;
        if (chunk.length >= CHUNK) await flush();
      }
      restored[name] = count;
    }
    await flush();
  } catch (e) {
    console.error('restore replay failed', e && e.message);
    return json({
      error: `恢复中途失败（已插入 ${statementsTotal} 条）：${e && e.message ? e.message : ''}。当前数据不完整，可重新上传同一备份再恢复一次，或用快照 ${snapshot.key} 回退`,
      partial: true, snapshot: snapshot.key,
    }, 500);
  }

  // 3) app_settings 白名单键恢复
  let settingsRestored = 0;
  try {
    const entries = Object.entries(body.settings || {}).filter(([k]) => !SETTINGS_SKIP.has(k) && typeof k === 'string' && k.length <= 60);
    for (let i = 0; i < entries.length; i += CHUNK) {
      const part = entries.slice(i, i + CHUNK);
      await env.DB.batch(part.map(([k, v]) => env.DB.prepare(
        'INSERT INTO app_settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
      ).bind(k, v === null || v === undefined ? '' : String(v))));
    }
    settingsRestored = entries.length;
  } catch (e) {
    warnings.push('部分设置恢复失败（业务数据已恢复）');
    console.error('restore settings failed', e && e.message);
  }

  // 4) 其它设备强制重新登录（当前会话保留，防止把操作者自己踢下线）
  let sessionsRevoked = 0;
  try {
    const token = parseCookie(request.headers.get('Cookie')).sz_session;
    const payload = decodeToken(token);
    const keepSid = payload && payload.sid ? String(payload.sid) : '';
    const r = await env.DB.prepare(keepSid ? 'DELETE FROM sessions WHERE sid != ?' : 'DELETE FROM sessions')
      .bind(...(keepSid ? [keepSid] : [])).run();
    sessionsRevoked = (r && r.meta && Number(r.meta.changes)) || 0;
  } catch (_) { /* 不影响恢复结果 */ }

  return json({
    ok: true,
    restored,
    total: statementsTotal,
    settingsRestored,
    sessionsRevoked,
    snapshot: snapshot.key,
    warnings,
    note: '附件文件本体不在 JSON 备份内；联系人附件如需找回可用 Worker 每日镜像（R2 backup/files/）。其它设备需重新登录。',
  });
}
