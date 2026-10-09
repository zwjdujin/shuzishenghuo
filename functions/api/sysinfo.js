import { json, todayStr } from '../_lib.js';

// 与 schema 版本对应（数据库结构版本）
const DB_SCHEMA_VERSION = 'v0.2.2';
const DEPLOY_PLATFORM = 'Cloudflare Pages';
const DEPLOY_SOURCE = 'GitHub → Cloudflare Pages（Git 集成自动部署）';
const BACKEND = 'Cloudflare Pages Functions（无服务器）';
const STORAGE = 'Cloudflare R2 对象存储';
const DB_BACKEND = 'Cloudflare D1（SQLite 兼容）';
const RUNTIME = 'V8 JavaScript';
// 本次部署标识（来自 wrangler pages deployment list）
const DEPLOY_ID = 'f90112a2-5f58-4ecf-9e47-a00d9b056832';
const DEPLOY_TIME = '2026-10-09 12:36 (UTC+8)';

// 安全取环境变量（可能未配置）
function pick(obj, key, fallback = '未配置') {
  const v = obj && obj[key];
  return v === undefined || v === null || v === '' ? fallback : String(v);
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const started = Date.now();

  // 健康检查：探一次数据库，顺便测连接耗时
  let dbOk = false;
  let dbNote = '正常';
  try {
    await env.DB.prepare('SELECT 1 AS ok').first();
    dbOk = true;
  } catch (e) {
    dbNote = '连接异常';
  }
  const healthMs = Date.now() - started;

  // Cloudflare 注入的运行时信息
  const url = new URL(request.url);
  const cf = request.headers.get('cf-ray') ? '是' : '否';

  // 构建号：优先取 Git 集成注入的 commit SHA，否则用本次部署 ID
  const commit = pick(env, 'CF_PAGES_COMMIT_SHA', '');
  const buildId = commit && commit !== '未配置' ? commit.slice(0, 12) : DEPLOY_ID;

  return json({
    instance: {
      version: pick(env, 'APP_VERSION', '0.2.6'),
      build: buildId,
      deployTime: DEPLOY_TIME,
      dbVersion: DB_SCHEMA_VERSION,
      dbBackend: DB_BACKEND,
      storage: STORAGE,
      platform: DEPLOY_PLATFORM,
      source: DEPLOY_SOURCE,
      backend: BACKEND,
      runtime: RUNTIME,
      colo: request.cf ? pick(request.cf, 'colo', '未知') : '本地',
      protocol: url.protocol.replace(':', ''),
      behindCdn: cf,
    },
    health: {
      ok: dbOk,
      ms: healthMs,
      note: dbNote,
      runtime: RUNTIME,
      timezone: 'UTC（Cloudflare 运行时）',
    },
  });
}