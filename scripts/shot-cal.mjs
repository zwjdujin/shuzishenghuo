// 日历中心截图 + 体检报告
// 用法：VIEW=week|month W=1920 H=920 TAG=desk node scripts/shot-cal.mjs
import { chromium } from 'file:///C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:8899/_preview/calpreview.html';

const W = Number(process.env.W || 1920);
const H = Number(process.env.H || 920);
const TAG = process.env.TAG || 'desk';
const VIEWS = (process.env.VIEWS || 'week,month').split(',');
const FULL = process.env.FULL === '1';

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: W < 600 ? 2 : 1,
  isMobile: W < 600,
  hasTouch: W < 600,
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

for (const v of VIEWS) {
  await page.goto(BASE + '#' + v, { waitUntil: 'load' });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(700);
  if (process.env.NIGHT) await page.evaluate(() => document.documentElement.setAttribute('data-mode', 'night'));

  const report = await page.$eval('#report2', (el) => el.textContent).catch(() => 'NO REPORT');
  console.log('---------- ' + v + ' @' + W + 'x' + H + ' ----------');
  console.log(report);

  const outName = `demo/cal-${TAG}-${v}${FULL ? '-full' : ''}.png`;
  if (FULL) await page.screenshot({ path: path.join(root, outName), fullPage: true });
  else await page.screenshot({ path: path.join(root, outName) });
  console.log('shot ' + outName);
}
console.log(errs.length ? errs.join('\n') : 'no page errors');
await browser.close();
