#!/usr/bin/env node
// ============================================================
// 数字生活 · assets 孤儿目录清理（v0.5.49）
// 内容哈希目录随每次发版累积（每份 ~1MB 入库），此脚本删除：
//   - 未被 public/index.html 引用的内容哈希目录
//   - 保留版本化历史目录（v0.4.0 / v0.5.1 …，按约定永久保留）
// 用法：node scripts/prune-assets.mjs [--dry]
// 建议每次发版提交前跑一次（或攒几次跑一次）。
// ============================================================
import { readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dry = process.argv.includes('--dry');

const html = readFileSync(join(ROOT, 'public/index.html'), 'utf8');
const refs = new Set([...html.matchAll(/assets\/([A-Za-z0-9][\w.]*)\//g)].map((m) => m[1]));
const assetsDir = join(ROOT, 'public/assets');
let removed = 0;
let bytes = 0;

for (const d of readdirSync(assetsDir)) {
  if (refs.has(d) || /^v[\d.]+$/.test(d)) continue;   // 当前引用 + 版本化历史永久保留
  const dir = join(assetsDir, d);
  // 统计体积再删
  const walk = (p) => readdirSync(p, { withFileTypes: true }).flatMap((e) => {
    const fp = join(p, e.name);
    return e.isDirectory() ? walk(fp) : [fp];
  });
  const size = walk(dir).reduce((s, f) => s + statSync(f).size, 0);
  console.log(`${dry ? '[dry] ' : ''}删除孤儿 assets/${d}（${(size / 1024).toFixed(0)} KB）`);
  bytes += size;
  removed++;
  if (!dry) rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${dry ? '[dry] 将' : '已'}清理 ${removed} 个孤儿目录，共 ${(bytes / 1024 / 1024).toFixed(1)} MB${dry ? '（加实跑去掉 --dry）' : ''}`);
if (!refs.size) console.warn('⚠ index.html 未解析到任何引用，疑似异常，未删除任何内容');
